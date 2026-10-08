/**
 * rawfilter 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）是从 `noxide` 基线逐字搬来的
 * （`core.ts` 的 449 条有效行用 diff 对上游复核过，差异只有 import 说明符；
 * `platform.ts` 另有一处删除，理由写在它自己的文件头）。这一侧只做四件事：
 * 把表单值绑成 `RawfilterInput`、把内核的过程事件接到运行账本、把计划发给
 * `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/rawfilter.json`）。
 *
 * 上游有一份 `dryRun` 的**默认值分歧**，这里不许"统一"它：
 * - `core.ts:164`（上游 `:164`）是 `input.dryRun ?? false` ⇒ 内核默认**执行**；
 * - `node-definitions/rawfilter.json` 给 `dryRun` 字段声明的默认是 **true** ⇒ 界面默认**预演**。
 * 界面上默认预演靠清单那个 default，宿主面靠 `Config.dryRun`（默认 true）补模型没给参数那一格；
 * 真执行要么显式传 `dryRun: false`，要么走 `rawfilter execute --no-dryRun`。
 * 两种形状下"没被批准就不动文件"这件事都由 `danger.all` + DSH 的 `ask` 兜住。
 *
 * DI 缝 → DSH 服务的对应（`docs/service-mapping.md`）：
 * - `pathInfo` / `listDir` / `ensureDir` / `moveFile` / `createShortcut` / `join` / `dirname`
 *   / `basename` → **不接 `ctx.fs`**，走移植版 `platform.ts` 的 `node:fs`（ADR-0003 决定 1）。
 * - 危险动作（`execute` + 非预演）→ `ctx.approval`：`defineNode` 按 `danger.all` 产出 `ask`。
 * - 运行账目 → `ctx.storage`（storage domain `xaihi_runs`）经 `OPERATIONS_SERVICE` 的账本，
 *   每次调用现取。
 * - 上游 `platform.ts:20-59` 那个读剪贴板的 `execFile` → DSH 侧最近的是 `ctx.subprocess`，
 *   而它唯一的调用者（引导流）本批未接 ⇒ **不搬、不伪造**，见 `src/platform.ts` 与 `src/cli.ts`。
 *
 * @module xaihi-rawfilter
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runRawfilter, type RawfilterAction, type RawfilterData, type RawfilterInput, type RawfilterPlanItem } from './core.ts'
import { createNodeRawfilterRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-rawfilter'

export const inject = ['tools']

/** 计划行数是上游 `cli.ts:397` 那个 `data.plan.slice(0, 80)`，不在这里另定一个数。 */
const PLAN_LINES = 80

export interface Config {
  /**
   * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.rawfilter]`
   * （`name_only_mode` / `create_shortcuts` / `trash_only` / `min_similarity` / `dry_run`，
   * 见上游 `cli.ts:38-44` 那份 `RawfilterNodeConfig`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * `minSimilarity` 的 0.82 与内核 `clampSimilarity` 的兜底值同源（上游 `core.ts:163,501`），
   * 名单只有一份，不在这里抄第二份。
   */
  nameOnlyMode: Volatile<boolean>
  createShortcuts: Volatile<boolean>
  trashOnly: Volatile<boolean>
  minSimilarity: Volatile<number>
  /** 预演模式，默认 true：**没配就只出计划，一个文件都不搬**。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  nameOnlyMode: Schema.boolean().default(false).volatile(),
  createShortcuts: Schema.boolean().default(false).volatile(),
  trashOnly: Schema.boolean().default(false).volatile(),
  minSimilarity: Schema.number().default(0.82).volatile(),
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
 * `action` 由处理器身份给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`，它的职责是决定哪个工具被调用，不是第二个开关。
 *
 * `path` 是单条目录（不是队列）：内核 `:175` 自己判空并回 `Path is required.`，
 * 这里不提前拦，否则"这块内核会说的那句话"被接线层抢了台词。
 *
 * **`Config` 这一层什么时候才会被读到**（与 `samea` / `timeu` / `nameu` 同一条口径）：
 * `bindInputs` 对声明了 `asBoolean` 的字段总产出布尔值——模型省略参数时给的是 `false`
 * （`define-node.ts:144-145`），清单里的声明式 default 只有表单那一侧会填。所以
 * `rawfilter_execute` 少传 `dryRun` ⇒ 真搬（这一步先被 `danger.all` 变成 DSH 的 `ask`）。
 */
function inputFrom(action: RawfilterAction, inputs: Record<string, unknown>, config: Config): RawfilterInput {
  return {
    action,
    path: String(inputs.path ?? ''),
    nameOnlyMode: typeof inputs.nameOnlyMode === 'boolean' ? inputs.nameOnlyMode : config.nameOnlyMode.get(),
    createShortcuts: typeof inputs.createShortcuts === 'boolean' ? inputs.createShortcuts : config.createShortcuts.get(),
    trashOnly: typeof inputs.trashOnly === 'boolean' ? inputs.trashOnly : config.trashOnly.get(),
    minSimilarity: typeof inputs.minSimilarity === 'number' ? inputs.minSimilarity : config.minSimilarity.get(),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：rawfilter 内核的 `progress` 是百分数
 * （10 / 35 / 40..95 / 100，上游 `core.ts:180,187,331,343`），直接当 `done / total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：上游 `RawfilterData` 的九条计数 + 错误行 + 前 80 条计划。
 * 计数一条不加、一条不减（上游 `core.ts:416-431` 的 `summarize()` 就是这九个键）。
 */
function viewOf(data: RawfilterData | undefined) {
  return {
    archiveCount: data?.archiveCount ?? 0,
    totalGroups: data?.totalGroups ?? 0,
    duplicateGroups: data?.duplicateGroups ?? 0,
    skippedFiles: data?.skippedFiles ?? 0,
    keptCount: data?.keptCount ?? 0,
    movedToTrash: data?.movedToTrash ?? 0,
    movedToMulti: data?.movedToMulti ?? 0,
    createdShortcuts: data?.createdShortcuts ?? 0,
    errorCount: data?.errorCount ?? 0,
    errors: data?.errors ?? [],
    groups: data?.groups ?? [],
    plan: (data?.plan ?? []).slice(0, PLAN_LINES),
  }
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async scan({ inputs, run }) {
        const result = await runRawfilter(inputFrom('scan', inputs, config), createNodeRawfilterRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('scan', result.message, result.data)
      },

      async plan({ inputs, run }) {
        const result = await runRawfilter(inputFrom('plan', inputs, config), createNodeRawfilterRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('plan', result.message, result.data)
      },

      async execute({ inputs, run }) {
        const result = await runRawfilter(inputFrom('execute', inputs, config), createNodeRawfilterRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        if (!result.success) throw new Error(`rawfilter: ${result.message}`)
        return summarize('execute', result.message, result.data)
      },
    },
  })
}

/**
 * 工具输出：一句结论 + 上游 `cli.ts:391-395` 那三行汇总（标签逐字：archives / groups /
 * duplicate、kept / trash / multi / shortcut、errors / skipped）+ 最多 80 条计划行。
 */
function summarize(action: RawfilterAction, message: string, data: RawfilterData | undefined): string {
  const summary = [
    `archives: ${String(data?.archiveCount ?? 0)}  groups: ${String(data?.totalGroups ?? 0)}  duplicate: ${String(data?.duplicateGroups ?? 0)}`,
    `kept: ${String(data?.keptCount ?? 0)}  trash: ${String(data?.movedToTrash ?? 0)}  multi: ${String(data?.movedToMulti ?? 0)}  shortcut: ${String(data?.createdShortcuts ?? 0)}`,
    `errors: ${String(data?.errorCount ?? 0)}  skipped: ${String(data?.skippedFiles ?? 0)}`,
  ]
  const lines = (data?.plan ?? []).slice(0, PLAN_LINES).map(planLine)
  const rest = (data?.plan.length ?? 0) > PLAN_LINES ? `… ${String((data?.plan.length ?? 0) - PLAN_LINES)} more` : ''
  return [`${action} · ${message}`, ...summary, ...lines, rest].filter(Boolean).join('\n')
}

/** 一行计划：`状态 去向 文件名 -> 目标` 或 `状态 去向 文件名 / 原因`（上游 `cli.ts:413` 那两种后缀）。 */
function planLine(item: RawfilterPlanItem): string {
  return `${item.status}\t${item.destination}\t${item.fileName}${item.targetPath ? ` -> ${item.targetPath}` : ` / ${item.reason}`}`
}
