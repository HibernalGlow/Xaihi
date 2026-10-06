/**
 * migratef 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts`）是从 `noxide` 基线逐字搬来的 458 行，差异只有第 1 行那条 import；
 * `platform.ts` 除账本路径那一格也逐字搬（那一格为什么不能搬，写在它自己的文件头）。
 * 这一侧做五件事：把表单值绑成 `MigratefInput`、**在动第一条文件之前**把撤销账本的
 * 出处要清楚、把内核的过程事件接到运行账本、把计划与历史发给 `result_view`、
 * 把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/migratef.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `MigratefRuntime` 的 17 个方法 → `src/platform.ts`（`node:fs/promises` + `node:path`）。
 *   **不走 `ctx.fs`**：那条缝面向模型发起的工具调用，要求不透明 `FsTarget` 且禁止解析路径，
 *   而这个内核要 `resolve` / `isAbsolute` / `dirname` / `basename` 的路径算术、要 `rename`、
 *   要 `cp -r`、要 `rm -r`（ADR-0003 决定 1，`crashu` / `formatv` 先例）。
 * - 撤销账本 = **文件**，不是存储域：ADR-0003 决定 3 分得很清——"这个节点跑过什么"归
 *   工作台（`ctx.storageDomain` 域 `xaihi_runs`，由 xaihi-core 记账），"这次效果怎么回滚"
 *   归节点自己那份要被外部工具继续读写的 JSON。所以这里不 `inject` `storage`。
 *   路径必须由使用者显式给出（`Config.historyPath`，默认空串 = 没给，ADR-0003 决定 2）：
 *   `requireHistoryPath` 在**动手之前**拒绝（那颗判据住在 `src/platform.ts`，bin 与这里
 *   共用一份，不抄两遍）。为什么不能只靠 `platform.ts` 里 `defaultHistoryPath()` 那句抛：
 *   内核是 `executePlan` **先搬文件、后记账本**（`core.ts:269`），等它走到 `historyPath()`
 *   时已经晚了 ⇒ 闸门必须在内核之前。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`；上游 `platform.ts:35-74`
 *   的 `readClipboardText()` 只服务 `guided` 腿，那条腿在本包是响亮拒绝的未接面
 *   （见 `src/cli.ts`），缺口沿用台账 **G5**。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的
 *   `tools` 只有单次输出缝）。账本缺席时 `defineNode` 会 `console.warn` 并把进度降级成
 *   无操作，节点仍能脱离工作台单独装。
 * - 危险动作 → 定义里是上游那份 `danger.type: "pluginExport"`（`exportName: "is_dangerous"`），
 *   经 `defineNode` 的 `dangerCheck` 变成 DSH 的 `ask`。**判定面有一格落差，点名在这里**：
 *   `dangerCheck` 只拿得到 `exec.arguments`，拿不到"这是哪个动作"
 *   （`define-node.ts:195-199` 的 `pluginExport` 分支只调 `dangerCheck(args)`，而动作选择器
 *   不进参数表），所以上游那条
 *   `((action ∈ {move,copy}) ∧ dryRun === false) ∨ action === "undo"`
 *   （`interaction.ts:173-175`）在这里只能按**能看见的那半**保守实现：
 *   `args.dryRun !== true` ⇒ 要批准。代价是**多问**（`plan` / `history` 这两条只读腿也会
 *   被问一次），换来的是**绝不少问**；反过来的近似会把 `undo` 放过去。
 *   新缺口记为 **G-pluginexport-action-blind**（见报告），修法是给 `dangerCheck` 也传动作身份。
 *
 * 内核那两个没人下发的槽（`relativeTargetBase`、`mergeExistingDirectories`）：
 * 上游清单里**没有**对应的字段，UI 腿（`interaction.ts:146-155`）与 CLI 腿
 * （`cli.ts:242-251`）也都不填它们，只有 `core.test.ts` 在用。所以这里不替节点发明字段，
 * 两个槽保持内核默认（`working-directory` / `false`），行为由 `tests/core.spec.ts` 钉住。
 *
 * @module xaihi-migratef
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runMigratef, type MigratefAction, type MigratefData, type MigratefInput, type MigratefMode } from './core.ts'
import { createNodeMigratefRuntime, requireHistoryPath } from './platform.ts'

export const name = '@hibernalglow/xaihi-migratef'

export const inject = ['tools']

/**
 * 计划条目 30 行、历史 20 条来自上游终端面 `cli.ts:482` 与 `:490` 的两处
 * `slice(0, 30)` / `slice(0, 20)`，不在这里另定数。
 */
const PLAN_LINES = 30
const HISTORY_LINES = 20

/** 上游清单里 `mode` 的四个值（三个模式 + 内核默认）；别的值一律当"没给"。 */
const MODES: readonly MigratefMode[] = ['preserve', 'flat', 'direct']

export interface Config {
  /**
   * 上游 `xiranite.config.toml` 的 `[nodes.migratef]` 只有两条：`history_path` 与
   * `enable_undo`（`cli.ts:52-55`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
   * 那条通路整块不搬，`history_path` 在这里声明成 `Config.historyPath`。
   *
   * 空串 = **没给** ⇒ 碰账本的动作（`move` / `copy` 非预演、`history`、`undo`）在动手之前
   * 拒绝（`requireHistoryPath`）。表单里的 `historyPath` 字段优先于这里。
   *
   * `enable_undo` **不搬成 Config**：上游把它读进 `MigratefDefaults.enableUndo`
   * （`cli.ts:76`、`:80`）之后**从不消费**（`inputFromArgs` 与 `runGuidedTask` 都没用它），
   * 声明一个没有回读路径的开关等于装饰品。要它生效得先决定它关掉什么，那是上游的事。
   */
  historyPath: Volatile<string>
}

export const Config = Schema.object({
  historyPath: Schema.string().default('').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `sourcePaths` 在上游两条腿上切法不同：UI 腿 `/[;\r\n]+/`（`interaction.ts:209-211`）、
 * CLI 腿 `/[,;\r\n]/`（`cli.ts:542-544`），而清单声明的绑定是 `delimited`，本仓的实现
 * **只切逗号**：换行分隔的多路径会变成一条带换行的假路径。
 *
 * 所以接线层按原始形状切、三种分隔符都算（与 `crashu` 的 `listFrom`、`formatv` 的
 * `pathsFrom` 同一条处理由，落差写进 `docs/service-mapping.md` 的缺口名单）。
 * 引号不用这里剥：内核的 `clean()`（`core.ts:366-368`）逐个剥。
 */
function sourcePathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.sourcePaths ?? inputs.sourcePaths
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '')).flatMap(splitPaths)
  return splitPaths(raw)
}

const splitPaths = (value: unknown): string[] =>
  String(value ?? '').split(/[,;\r\n]+/).map((item) => item.trim()).filter((item) => item !== '')

/** 表单值 → 内核输入。`action` 由**处理器身份**给，不吃 `inputs.action`（那是动作选择器）。 */
function inputFrom(action: MigratefAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): MigratefInput & { historyPath: string } {
  const mode = String(inputs.mode ?? '').trim()
  const batchId = String(inputs.batchId ?? '').trim()
  const historyPath = String(inputs.historyPath ?? '').trim() || config.historyPath.get()
  return {
    action,
    // `dryRun` 缺席时落回**内核默认 false**（`core.ts:107`），与同批的 crashu 一致；
    // 定义里那条 `{boolean:true}` 是界面默认，不是这里的默认。真搬那条腿由危险闸门拦。
    dryRun: args.dryRun === undefined ? false : args.dryRun === true,
    sourcePaths: sourcePathsOf(args, inputs),
    targetPath: String(inputs.targetPath ?? ''),
    historyPath,
    ...(batchId === '' ? {} : { batchId }),
    ...(mode === '' ? {} : { mode: (MODES as readonly string[]).includes(mode) ? mode as MigratefMode : 'preserve' }),
    ...(typeof inputs.maxWorkers === 'number' && Number.isFinite(inputs.maxWorkers) ? { maxWorkers: inputs.maxWorkers } : {}),
    ...(typeof inputs.historyLimit === 'number' && Number.isFinite(inputs.historyLimit) ? { historyLimit: inputs.historyLimit } : {}),
  }
}

/**
 * 上游 `is_dangerous`（`interaction.ts:173-175`）在 `dangerCheck` 能看见的面上保守成立的一份：
 * 只要不是显式预演，就要批准。落在这里而不是定义里，因为定义是上游的（`pluginExport`）。
 *
 * 已知代价：`plan` / `history` 这两条只读腿也会被问一次（动作身份进不了这个回调，
 * 见文件头的 **G-pluginexport-action-blind**）。**多问**是可以解释的，**少问**不是。
 */
function dangerCheck(args: Record<string, unknown>): boolean {
  return args.dryRun !== true
}

/**
 * 内核事件 → 运行账本。**单位**：migratef 内核的 `progress` 是百分数
 * （`(index / Math.max(pending.length, 1)) * 100`，收尾 `100`），直接当 `done / total=100`
 * 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 结果视图：计数 + 计划 + 历史 + 错误，都是内核已经算好的字段，这里不重算。 */
function viewOf(data: MigratefData | undefined) {
  return {
    totalCount: data?.totalCount ?? 0,
    migratedCount: data?.migratedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    successCount: data?.successCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    operationId: data?.operationId ?? '',
    plan: (data?.plan ?? []).slice(0, PLAN_LINES),
    history: (data?.history ?? []).slice(0, HISTORY_LINES),
    errors: data?.errors ?? [],
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 30 条 `状态 源 -> 目标 / reason`（上游终端面打印的就是这几列）。 */
function summarize(message: string, data: MigratefData | undefined): string {
  const counts = `migrated ${String(data?.migratedCount ?? 0)} · skipped ${String(data?.skippedCount ?? 0)} · errors ${String(data?.errorCount ?? 0)} · total ${String(data?.totalCount ?? 0)}`
  const plan = data?.plan ?? []
  const lines = plan.slice(0, PLAN_LINES).map((item) => `${item.status}\t${item.sourcePath}\t${item.targetPath !== '' ? `-> ${item.targetPath}` : `/ ${item.reason ?? ''}`}`)
  const rest = plan.length > PLAN_LINES ? `… ${String(plan.length - PLAN_LINES)} more` : ''
  const history = (data?.history ?? []).slice(0, HISTORY_LINES).map((item) => `batch\t${item.id}\t${item.action}\t${String(item.operations.length)} ops${item.undone === true ? '\t(undone)' : ''}`)
  const operation = data?.operationId ? `operation ${data.operationId}` : ''
  return [message, counts, ...lines, rest, ...history, operation].filter(Boolean).join('\n')
}

/** 五个动作共用的一条腿：闸门、跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: MigratefAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const input = inputFrom(action, args, inputs, config)
  requireHistoryPath(action, input)
  // 内核 `runMigratef` 把所有异常咽成 `success:false`（`core.ts:131-133`），
  // 所以下面这一条同时兜住了 codec 之外的所有失败，包括 platform 那句账本拒绝。
  const result = await runMigratef(input, createNodeMigratefRuntime(), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (!result.success) throw new Error(`migratef ${action}: ${result.message}`)
  return summarize(result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 上游那份 `danger.type: "pluginExport"` 要求判定函数，缺了 defineNode 在装载期就抛。
    dangerCheck,
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async plan({ args, inputs, run }) {
        return call('plan', args, inputs, run, config)
      },
      async move({ args, inputs, run }) {
        return call('move', args, inputs, run, config)
      },
      async copy({ args, inputs, run }) {
        return call('copy', args, inputs, run, config)
      },
      async history({ args, inputs, run }) {
        return call('history', args, inputs, run, config)
      },
      async undo({ args, inputs, run }) {
        return call('undo', args, inputs, run, config)
      },
    },
  })
}
