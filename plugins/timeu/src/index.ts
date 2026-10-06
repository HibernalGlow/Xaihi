/**
 * timeu 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（差异只有 import 说明符，
 * 用 difflib 对着上游比过：269 行 / 57 行从第一条 import 起完全一致）。所以这一侧只做四件事：
 * 把表单值绑成 `TimeuInput`、把内核的过程事件接到运行账本、把结果发给 `result_view`、
 * 把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/timeu.json`）。清单、装载期校验与工具注册都读它。
 *
 * @module xaihi-timeu
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runTimeu, type TimeuAction, type TimeuInput } from './core.ts'
import { createNodeTimeuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-timeu'

export const inject = ['tools']

/** 结果行数是上游 `interaction.ts:21` 那个 `plan.slice(0, 12)`，不在这里另定一个数。 */
const RESULT_LINES = 12

export interface Config {
  /**
   * 时间戳记录文件。上游这三个默认值住在 `xiranite.config.toml` 的 `[nodes.timeu]`
   * （`record_path` / `recursive` / `include_directories` / `dry_run`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 空串 = **不指定**，落回内核自己的行为（记录文件写在首个目标旁边，
   * 见 `core.ts` 的 `defaultRecordPath`）。这里不给"默认到某个没人知道的地方"。
   */
  recordPath: Volatile<string>
  /** 递归目录（内核默认 true，上游配置默认也是 true）。 */
  recursive: Volatile<boolean>
  /** 目录自身是否也算一个时间戳目标（内核默认 false）。 */
  includeDirectories: Volatile<boolean>
  /**
   * 预演模式。默认 true 与上游一致：**没配就是不动文件**。
   * 定义里的危险闸门（`danger.all`：动作非 scan 且 dryRun 非真）就是绕着这条建的。
   */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  recordPath: Schema.string().default('').volatile(),
  recursive: Schema.boolean().default(true).volatile(),
  includeDirectories: Schema.boolean().default(false).volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由**处理器身份**给（`defineNode` 是一个动作一个工具），不吃 `inputs.action`：
 * 定义里 `action` 是 `isActionSelector`，它的职责是决定哪个工具被调用，不是第二个开关。
 */
function inputFrom(action: TimeuAction, inputs: Record<string, unknown>, config: Config): TimeuInput {
  const recordPath = String(inputs.recordPath ?? '') || config.recordPath.get()
  return {
    action,
    ...pathSlots(inputs.listText),
    ...(recordPath === '' ? {} : { recordPath }),
    recursive: typeof inputs.recursive === 'boolean' ? inputs.recursive : config.recursive.get(),
    includeDirectories: typeof inputs.includeDirectories === 'boolean' ? inputs.includeDirectories : config.includeDirectories.get(),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
  }
}

/**
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的
 * `fieldProperty` 把 path-list 映射成 `array<string>`）给的是**数组**，
 * 而文本域那一边给的是**换行分隔的字符串**。
 *
 * 声明的绑定是 `listText → listText / identity`，内核的 `parseList` 同时按 `\n` 和 `,` 切。
 * 所以数组必须走 `paths` 槽（那条槽不切逗号，路径里带 `,` 不会被拆碎），
 * 字符串才走 `listText` 槽（保留上游"逗号也算分隔符"的语义）。
 * 这一刀在接线层，不在清单里：`package.json#xaihi.node` 仍然是上游那份逐字的声明。
 */
function pathSlots(value: unknown): Pick<TimeuInput, 'paths' | 'listText'> {
  if (Array.isArray(value)) {
    return { paths: value.map((item) => String(item ?? '').trim()).filter(Boolean) }
  }
  const text = String(value ?? '').trim()
  return text === '' ? {} : { listText: text }
}

/**
 * 内核事件 → 运行账本。
 *
 * **单位**：timeu 内核的 `progress` 是百分数（15 / 45 / 75），所以直接当 `done/total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。事件说的话进 `preview` 载荷，
 * 界面上才有"现在在干什么"。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 工具输出：一句结论 + 最多 12 条计划行（上游终端/引导面用的就是这份截断）。 */
function summarize(action: TimeuAction, message: string, plan: { path: string; status: string; reason?: string }[], recordPath: string): string {
  const mark = (status: string): string => (status === 'success' ? '✓' : status === 'error' ? '!' : status === 'skipped' ? '–' : '·')
  const lines = plan.slice(0, RESULT_LINES).map((item) => `${mark(item.status)} ${item.path}${item.reason ? ` (${item.reason})` : ''}`)
  const rest = plan.length > RESULT_LINES ? `… ${String(plan.length - RESULT_LINES)} more` : ''
  return [`${action} · ${message}`, `record: ${recordPath}`, ...lines, rest].filter(Boolean).join('\n')
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async scan({ inputs, run }) {
        const result = await runTimeu(inputFrom('scan', inputs, config), createNodeTimeuRuntime(), (event) => forward(event, run))
        run.resultView({
          recordPath: result.data?.recordPath ?? '',
          scannedCount: result.data?.scannedCount ?? 0,
          skippedCount: result.data?.skippedCount ?? 0,
          plan: result.data?.plan ?? [],
        })
        if (!result.success) throw new Error(`timeu scan: ${result.message}`)
        return summarize('scan', result.message, result.data?.plan ?? [], result.data?.recordPath ?? '')
      },

      async backup({ inputs, run }) {
        const result = await runTimeu(inputFrom('backup', inputs, config), createNodeTimeuRuntime(), (event) => forward(event, run))
        // 撤销这次需要的东西 = 那份记录文件本身（restore 就是吃它的）。这是耐久账目里的 checkpoint。
        run.checkpoint({ recordPath: result.data?.recordPath ?? null, backedUpAtCount: result.data?.records.length ?? 0 })
        run.resultView({
          recordPath: result.data?.recordPath ?? '',
          backupCount: result.data?.backupCount ?? 0,
          skippedCount: result.data?.skippedCount ?? 0,
          errorCount: result.data?.errorCount ?? 0,
          errors: result.data?.errors ?? [],
          plan: result.data?.plan ?? [],
        })
        if (!result.success) throw new Error(`timeu backup: ${result.message}`)
        return summarize('backup', result.message, result.data?.plan ?? [], result.data?.recordPath ?? '')
      },

      async restore({ inputs, run }) {
        const result = await runTimeu(inputFrom('restore', inputs, config), createNodeTimeuRuntime(), (event) => forward(event, run))
        run.resultView({
          recordPath: result.data?.recordPath ?? '',
          restoredCount: result.data?.restoredCount ?? 0,
          skippedCount: result.data?.skippedCount ?? 0,
          errorCount: result.data?.errorCount ?? 0,
          errors: result.data?.errors ?? [],
          plan: result.data?.plan ?? [],
        })
        if (!result.success) throw new Error(`timeu restore: ${result.message}`)
        return summarize('restore', result.message, result.data?.plan ?? [], result.data?.recordPath ?? '')
      },
    },
  })
}
