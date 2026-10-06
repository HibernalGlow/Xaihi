/**
 * recycleu 的宿主半边：清空回收站（一次或按有限周期）。
 *
 * 三件事各自归位：
 * - **决定**做什么在 `core.ts`（逐字移植的纯内核，含"回收站是最后一层可恢复删除"那套状态机）；
 * - **执行**在 `exec.ts`：外部命令一律经 DSH 的 `ctx.subprocess`，本包不自建 spawn 池；
 * - **批准**在清单里：`danger.actionIn` 把 `clean_now` / `start` 标成危险，
 *   `defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批 UI 与审计全在宿主。
 *
 * 定义只有一份真源：`package.json#xaihi.node`（词表照 `node-definitions/recycleu.json`）。
 *
 * @module xaihi-recycleu
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { DEFAULT_RECYCLEU_STATE, runRecycleu, type RecycleuInput, type RecycleuState } from './core.ts'
import { CANCELLATION_GAP, createSubprocessRecycleuRuntime } from './exec.ts'

export const name = '@hibernalglow/xaihi-recycleu'

export const inject = ['tools', 'subprocess']

export interface Config {
  /** 结果前缀标签，用于验证配置真的在使用点被读到。 */
  label: Volatile<string>
}

export const Config = Schema.object({
  label: Schema.string().default('recycleu').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition (): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

export function apply (ctx: Context, config: Config): void {
  const runtime = createSubprocessRecycleuRuntime(ctx.subprocess, process.cwd())
  // 上游那份计时状态（timerStatus / cleanCount / lastCleanTime）由调用方持有并回传
  // （`core.ts` 的 `initialState` 参数），这里记在 apply 的闭包里；面板读回走的是同一次
  // 运行的 `result_view`（`docs/service-mapping.md` 的 operation stream 那一行），
  // 不是这个对象——它只让 `status` 在下一次调用时说得出"这台宿主刚刚清过几次"。
  let state: RecycleuState = { ...DEFAULT_RECYCLEU_STATE }

  /** 三个动作共用的一条腿：跑内核、把事件接进账本、记下状态。 */
  const call = async (input: RecycleuInput, run: OperationRun): Promise<string> => {
    const result = await runRecycleu(input, runtime, (event) => {
      // 内核吐的是 `progress` / `log` 两类事件，账本那侧是两个不同的口子：
      // 百分比进 `progress`（`OperationProgress.done`），句子进 `preview`。
      // **两句都要发**：`core.ts` 的 `cleanOnce` 在成功时只发 `log`（没有百分比），
      // 失败时只发 `progress: 100`，按 `event.type` 二选一会把其中一半的话咽掉。
      if (event.type === 'progress') run.progress({ done: event.progress ?? 0 })
      if (event.message.trim() !== '') run.preview({ message: event.message })
    }, state)
    if (result.data !== undefined) state = { timerStatus: result.data.timerStatus, cleanCount: result.data.cleanCount, lastCleanTime: result.data.lastCleanTime }
    run.resultView({ ...result.data, success: result.success, message: result.message })
    if (!result.success) throw new Error(`recycleu: ${result.message}`)
    return `${config.label.get()} · ${result.message}`
  }

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空，所以每次调用现取。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      // `status` 不发任何外部命令：内核那条分支在碰到回收站之前就返回了
      // （上游 `core.test.ts` 与 `cli.test.ts:80-88` 钉的就是这件事）。
      async status ({ inputs, run }) {
        return call({ action: 'status' as const, driveLetter: String(inputs.driveLetter ?? '') }, run)
      },
      async clean_now ({ inputs, run }) {
        return call({ action: 'clean_now' as const, driveLetter: String(inputs.driveLetter ?? '') }, run)
      },
      async start ({ inputs, run }) {
        const maxCycles = Number(inputs.maxCycles ?? 360)
        if (maxCycles === 0) {
          // 定义里"设为 0 表示持续运行，直到手动取消"。取消这一头在 Xaihi 还没接：
          throw new Error(`recycleu: maxCycles=0（跑到手动取消）被拒绝 —— ${CANCELLATION_GAP}。给一个有限的循环次数。`)
        }
        return call({
          action: 'start' as const,
          driveLetter: String(inputs.driveLetter ?? ''),
          interval: Number(inputs.interval ?? 10),
          maxCycles,
        }, run)
      },
    },
  })
}
