/**
 * formatv 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（387 行 / 除剪贴板那
 * 36 行之外的全部），差异只有 import 说明符。所以这一侧只做四件事：把表单值绑成
 * `FormatvInput`、把上游那份"报告路径 + 覆盖闸门"的配置推导接回来、把内核的过程事件
 * 接到运行账本、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/formatv.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `FormatvRuntime` 的 7 个方法 → `src/platform.ts`（`node:fs/promises` + `node:path`）。
 *   不走 `ctx.fs`：那条缝面向模型发起的工具调用，要求不透明 `FsTarget` 且禁止解析路径，
 *   而本内核的 `recursive-enumeration` 要 `resolve`、`join`、按 `size` 比较、要 `rename`
 *   （ADR-0003 决定 1，dissolvef 先例）。权限边界因此靠**动作分级**：
 *   `add_nov` / `remove_nov` + `dryRun=false` 在定义里是 `danger.all`，`defineNode` 把它
 *   变成 `tools/pre-execute` 的 `ask`，审批与审计走 DSH 的 `approval` 缝
 *   （`docs/service-mapping.md:42-44` 实测 `dsh-user-approval` 在默认组合里）。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`。上游 platform.ts 里
 *   唯一碰 `node:child_process` 的 `readClipboardText()` 只服务 `guided` 腿，那条腿在
 *   本包是响亮拒绝的未接面（见 `src/cli.ts`），缺口记为 `G-clipboard-guided`。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的
 *   `tools` 只有单次输出缝，没有"同一运行的中间态流"，见 `docs/service-mapping.md`
 *   的 operation stream 那一行）。账本缺席时 `defineNode` 会 `console.warn` 并把进度
 *   降级成无操作，节点仍能脱离工作台单独装。
 *
 * `src/report-defaults.ts` 里那三条是从上游 `cli.ts:110-128` 原样接过来的：只对
 * `check_duplicates` 生效、已有 `reportPath` 就不接管、`output.overwrite` 为假且报告已存在
 * 时**把 dryRun 顶成 true 并且不下发 reportPath**（那是不覆盖既有报告的闸门）。它是配置语义，
 * 不是内核语义，所以住在接线层而不是 `core.ts`；单开一个文件是因为独立 bin 也要用同一份，
 * 而 bin 不许 import 本文件（那会把 cordis 与 SDK 拉进一个只跑 Node 的可执行文件）。
 *
 * @module xaihi-formatv
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runFormatv, type FormatvAction, type FormatvData, type FormatvInput } from './core.ts'
import { createNodeFormatvRuntime } from './platform.ts'
import { applyReportDefaults, type ReportDefaults } from './report-defaults.ts'

export const name = '@hibernalglow/xaihi-formatv'

export const inject = ['tools']

/** 结果行数来自上游终端面 `cli.ts:321` 与 `:335` 的 `slice(0, 50)`，不在这里另定一个数。 */
const RESULT_LINES = 50

export interface Config {
  /**
   * 这几个默认值上游住在 `xiranite.config.toml` 的 `[nodes.formatv]`
   * （`recursive` / `prefix_name` / `dry_run` 与 `[nodes.formatv.output]` 的
   * `report_name_template` / `directory` / `overwrite`，见上游 `cli.ts:65-101`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * `prefixName` 留空 = **不覆盖**，落回内核自己的 `"hb"`（`core.ts:123`）：
   * 名单只有一份，不在这里抄第二份。`reportNameTemplate` 是上游 `cli.ts:80` 那份默认值
   * 本身（`{prefix}` 是被替换的占位），它必须有个字符串才能替换，所以这里保留字面值。
   */
  recursive: Volatile<boolean>
  prefixName: Volatile<string>
  /** 预演模式，默认 true 与上游 `dry_run ?? true` 一致：**没配就只出计划，一个文件都不改名**。 */
  dryRun: Volatile<boolean>
  reportNameTemplate: Volatile<string>
  /** 报告目录；留空 = 落在第一个输入路径旁边（上游 `defaults.directory ?? paths[0]`）。 */
  reportDirectory: Volatile<string>
  /** 上游那条 `output.overwrite`，默认为真（`cli.ts:81`）；为假时报告已存在就转预演。 */
  overwrite: Volatile<boolean>
}

export const Config = Schema.object({
  recursive: Schema.boolean().default(false).volatile(),
  prefixName: Schema.string().default('').volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
  reportNameTemplate: Schema.string().default('formatv-{prefix}-duplicates.json').volatile(),
  reportDirectory: Schema.string().default('').volatile(),
  overwrite: Schema.boolean().default(true).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的 `fieldProperty`
 * 把 path-list 映射成 `array<string>`）给的是**数组**，文本域那一边给的是换行分隔的字符串。
 * 清单里上游声明的绑定是 `pathsText → delimited`，而 `transformValue(…, 'delimited')`
 * 只按逗号切：换行分隔的多行文本会变成**一个带换行的假路径**。
 *
 * 所以接线层按原始形状切，分隔符照上游那份 UI 面的 `toInput`
 * （`interaction.ts:19`：`/[\r\n;,]+/`），三种都算。清单仍是上游那份声明
 * （落差与 `samea` / `timeu` 同一条，写进 `docs/service-mapping.md` 的缺口名单）。
 */
function pathsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).flatMap(splitPaths)
  return splitPaths(value)
}

const splitPaths = (value: unknown): string[] =>
  String(value ?? '').split(/[\r\n;,]+/).map((item) => item.trim().replace(/^["']|["']$/g, '')).filter((item) => item !== '')

/**
 * 表单值 → 内核输入。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action`
 * 是 `isActionSelector`，它的职责是决定哪个工具被调用。
 *
 * 布尔与字符串都按**原始参数在不在**决定用不用配置默认：`defineNode` 的绑定变换会把缺席的
 * 布尔折成 `false`、缺席的文本折成空串，直接读绑定结果就等于让配置永远靠边站
 * （`dryRun` 那样会变成"没填就真改名"，与上游 `dry_run ?? true` 相反）。
 */
function inputFrom(action: FormatvAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): FormatvInput {
  const prefixName = String(inputs.prefixName ?? '').trim() || config.prefixName.get()
  return {
    action,
    paths: pathsFrom(args.pathsText),
    recursive: args.recursive === undefined ? config.recursive.get() : args.recursive === true,
    ...(prefixName === '' ? {} : { prefixName }),
    dryRun: args.dryRun === undefined ? config.dryRun.get() : args.dryRun === true,
    ...(typeof inputs.reportPath === 'string' && inputs.reportPath !== '' ? { reportPath: inputs.reportPath } : {}),
  }
}

function defaultsOf(config: Config): ReportDefaults {
  const directory = config.reportDirectory.get()
  return {
    reportNameTemplate: config.reportNameTemplate.get(),
    ...(directory === '' ? {} : { directory }),
    overwrite: config.overwrite.get(),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：formatv 内核的 `progress` 是百分数（10 / 20+70·占比 /
 * 100），直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 结果视图：计数 + 三个桶 + 操作清单 + 重复清单，都是内核已算好的字段，这里不重算。 */
function viewOf(data: FormatvData | undefined) {
  return {
    normalCount: data?.normalCount ?? 0,
    novCount: data?.novCount ?? 0,
    prefixedCounts: data?.prefixedCounts ?? {},
    successCount: data?.successCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    duplicateCount: data?.duplicateCount ?? 0,
    duplicates: (data?.duplicates ?? []).slice(0, RESULT_LINES),
    prefixedLarger: data?.prefixedLarger ?? [],
    operations: (data?.operations ?? []).slice(0, RESULT_LINES),
    reportPath: data?.reportPath ?? '',
    errors: data?.errors ?? [],
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 50 条 `状态 源 -> 目标`（上游终端面打印的就是这几列）。 */
function summarize(message: string, data: FormatvData | undefined): string {
  const counts = `normal ${String(data?.normalCount ?? 0)} · nov ${String(data?.novCount ?? 0)} · success ${String(data?.successCount ?? 0)} · skipped ${String(data?.skippedCount ?? 0)} · errors ${String(data?.errorCount ?? 0)}`
  const operations = data?.operations ?? []
  const lines = operations.slice(0, RESULT_LINES).map((item) => `${item.status}\t${item.sourcePath}\t->\t${item.targetPath}${item.reason ? ` / ${item.reason}` : ''}`)
  const rest = operations.length > RESULT_LINES ? `… ${String(operations.length - RESULT_LINES)} more` : ''
  const report = data?.reportPath ? `report: ${data.reportPath}` : ''
  return [message, counts, ...lines, rest, report].filter(Boolean).join('\n')
}

/** 四个动作共用的一条腿：接配置默认、跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: FormatvAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const runtime = createNodeFormatvRuntime()
  const input = await applyReportDefaults(inputFrom(action, args, inputs, config), defaultsOf(config), runtime)
  const result = await runFormatv(input, runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `success: errorCount === 0` 表达"部分条目失败了"，这时文件已经改过名了：
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`formatv ${action}: ${result.message}`)
  return summarize(result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async scan({ args, inputs, run }) {
        return call('scan', args, inputs, run, config)
      },
      async add_nov({ args, inputs, run }) {
        return call('add_nov', args, inputs, run, config)
      },
      async remove_nov({ args, inputs, run }) {
        return call('remove_nov', args, inputs, run, config)
      },
      async check_duplicates({ args, inputs, run }) {
        return call('check_duplicates', args, inputs, run, config)
      },
    },
  })
}
