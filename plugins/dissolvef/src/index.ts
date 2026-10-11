/**
 * dissolvef 的宿主半边：把 Xiranite 移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的，唯一改动是
 * "默认历史路径的来源"（见 `platform.ts` 的注释与 `docs/adr/0003-...`）。
 * 因此这一侧只做三件事：把表单值绑成 `DissolvefInput`、把内核的过程事件接到运行账本、
 * 把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal } from '@hibernalglow/xaihi-sdk'
import { runDissolvef, type DissolvefAction, type DissolvefConflictMode, type DissolvefInput, type DissolvefMode } from './core.ts'
import { createNodeDissolvefRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-dissolvef'

export const inject = ['tools']

export interface Config {
  /**
   * 撤销账本文件路径。内核需要一个**文件**路径（它写的是可被旧 Python 工具读的
   * 那份 undo journal），所以这里不给"默认到某个没人知道的地方"，而是要求显式设置：
   * 没设时 `plan` / `history` 照常，`dissolve` 会被内核要求历史路径而失败。
   */
  historyPath: Volatile<string>
}

export const Config = Schema.object({
  historyPath: Schema.string().default('').volatile(),
})

function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/** 模式选择器 → 内核要的四个布尔。放在这里是因为它是"表单形状"的一部分，不是内核逻辑。 */
function modeFlags(mode: unknown): Pick<DissolvefInput, 'nested' | 'media' | 'archive' | 'direct'> {
  switch (mode as DissolvefMode) {
    case 'nested':
      return { nested: true, media: false, archive: false, direct: false }
    case 'media':
      return { nested: false, media: true, archive: false, direct: false }
    case 'archive':
      return { nested: false, media: false, archive: true, direct: false }
    case 'direct':
      return { nested: false, media: false, archive: false, direct: true }
    default:
      // 缺省沿用内核自己选的 nested，与 Xiranite 命令行一致。
      return { nested: true, media: false, archive: false, direct: false }
  }
}

const conflict = (value: unknown, fallback: DissolvefConflictMode): DissolvefConflictMode =>
  value === 'auto' || value === 'skip' || value === 'overwrite' || value === 'rename' ? value : fallback

/**
 * 模式的两条形状，都要认。
 *
 * 清单声明的是**单个枚举** `mode`（工具/命令面走这条），而搬来的卡片界面直接发**内核那四个布尔**
 * `nested/media/archive/direct`（`packages/ui-host/src/nodes/dissolvef/Component.tsx:112-115` 组的就是
 * `DissolvefInput` 的那四格），`mode` 在那边恒为 `undefined` ⇒ 只读枚举的症状是使用者选的
 * media/archive/direct 被整段丢掉、永远按 nested 跑。
 *
 * 四个布尔里只要出现一个就当"使用者说过"，原样交给内核；一个都没给才走 `mode` 的折算
 * （缺省仍是内核自己选的 nested，与 Xiranite 命令行一致）。
 */
function flagsFrom(inputs: Record<string, unknown>): Pick<DissolvefInput, 'nested' | 'media' | 'archive' | 'direct'> {
  const explicit = (['nested', 'media', 'archive', 'direct'] as const).some((key) => typeof inputs[key] === 'boolean')
  if (!explicit) return modeFlags(inputs.mode)
  return {
    nested: inputs.nested === true,
    media: inputs.media === true,
    archive: inputs.archive === true,
    direct: inputs.direct === true,
  }
}

export function apply(ctx: Context, config: Config): void {
  /**
   * 账本路径的两条来源，与其它节点同一条优先级：**本次入参优先，`Config` 兜底**。
   *
   * 搬来的卡片界面把 `historyPath` 当运行入参发（`packages/ui-host/src/nodes/dissolvef/types.ts`
   * 的 `CONFIG_FIELDS` 里也有它），而这里原来只读 `config.historyPath` ⇒ 那一格是**死输入**：
   * 界面上填了没有任何效果，真正生效的只有设置面那一份。清单里没有这条字段，所以模型面看不到它
   * （那是上游那份声明的形状，这一刀只修界面这条路）。
   */
  const historyPathOf = (inputs: Record<string, unknown>): string => {
    const fromRun = typeof inputs.historyPath === 'string' ? inputs.historyPath.trim() : ''
    return fromRun === '' ? config.historyPath.get() : fromRun
  }
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async plan({ inputs, run }) {
        const historyPath = historyPathOf(inputs)
        const result = await runDissolvef({
          action: 'plan',
          path: String(inputs.path ?? ''),
          ...flagsFrom(inputs),
          preview: true,
          exclude: String(inputs.exclude ?? ''),
          fileConflict: conflict(inputs.fileConflict, 'auto'),
          dirConflict: conflict(inputs.dirConflict, 'auto'),
          ...(historyPath === '' ? {} : { historyPath }),
        }, createNodeDissolvefRuntime())
        run.resultView({ plan: result.data?.plan ?? [], counts: result.data?.totalCount ?? 0 })
        if (!result.success) throw new Error(`dissolvef plan: ${result.message}`)
        return result.message
      },

      async dissolve({ inputs, run }) {
        const historyPath = historyPathOf(inputs)
        // 调用方说"预演"就只出计划。内核自己就是这么判的（`core.ts:182`：`action === "plan" || preview` 只回计划），
        // 而这里原来**根本不往下传 preview** ⇒ 卡片上带着"预演"开关按下去照样真移动文件。
        const preview = inputs.preview === true
        // 只有真的要移动文件时才需要撤销账本；预演不碰文件，拿这个理由拒它是抢了内核的台词。
        if (!preview && historyPath === '') {
          throw new Error('dissolvef: config.historyPath is unset, refusing to move files without an undo journal')
        }
        const runtime = historyPath === '' ? createNodeDissolvefRuntime() : createNodeDissolvefRuntime({ historyDir: dirname(historyPath) })
        const result = await runDissolvef({
          action: 'dissolve',
          path: String(inputs.path ?? ''),
          ...flagsFrom(inputs),
          preview,
          exclude: String(inputs.exclude ?? ''),
          fileConflict: conflict(inputs.fileConflict, 'auto'),
          dirConflict: conflict(inputs.dirConflict, 'auto'),
          ...(historyPath === '' ? {} : { historyPath }),
        }, runtime, (event) => {
          // 内核的 progress 是 0..1；接到运行账本时同时带上它说的话，界面才有可读进度。
          if (event.type === 'progress') run.progress({ done: Math.round((event.progress ?? 0) * 100), total: 100 })
          if (event.message !== '') run.preview({ message: event.message })
        })
        // 撤销这次需要的东西：历史文件 + 本次 operationId。这就是耐久账目里的 checkpoint。
        if (historyPath !== '') run.checkpoint({ historyPath, operationId: result.data?.operationId ?? null })
        run.resultView({
          success: result.success,
          moved: result.data?.successCount ?? 0,
          skipped: result.data?.skippedCount ?? 0,
          errors: result.data?.errors ?? [],
        })
        if (!result.success) throw new Error(`dissolvef: ${result.message}`)
        return result.message
      },

      async undo({ inputs, run }) {
        const historyPath = historyPathOf(inputs)
        if (historyPath === '') throw new Error('dissolvef: config.historyPath is unset, nothing to undo against')
        const undoId = String(inputs.undoId ?? '')
        const result = await runDissolvef({
          action: 'undo',
          historyPath,
          ...(undoId === '' ? {} : { undoId }),
        }, createNodeDissolvefRuntime({ historyDir: dirname(historyPath) }))
        run.resultView({ restored: result.data?.successCount ?? 0, errors: result.data?.errors ?? [] })
        if (!result.success) throw new Error(`dissolvef undo: ${result.message}`)
        return result.message
      },

      async history({ inputs, run }) {
        const historyPath = historyPathOf(inputs)
        if (historyPath === '') throw new Error('dissolvef: config.historyPath is unset')
        const result = await runDissolvef({ action: 'history', historyPath }, createNodeDissolvefRuntime())
        const records = result.data?.history ?? []
        run.resultView({ records })
        if (records.length === 0) return 'no dissolvef operations are recorded in this journal'
        return records.map((record) => `${record.id} ${record.timestamp} ${record.mode} ${record.operations.length} operation(s)`).join('\n')
      },
    },
  })
}

export type { DissolvefAction }
