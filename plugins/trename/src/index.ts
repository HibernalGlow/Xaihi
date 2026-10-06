/**
 * trename 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（838 行 / 除 `defaultUndoPath`
 * 那一条来源与剪贴板那 40 行之外的全部），`core.ts` 的差异只有第 1 行那条 import 说明符。
 * 所以这一侧只做五件事：把表单值绑成 `TrenameInput`、把上游那份 `enable_undo` / `undo_path`
 * 的配置语义接回来、把内核的过程事件接到运行账本、把结果发给 `result_view`、把危险动作
 * 交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/trename.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `TrenameRuntime` 的 13 个方法 → `src/platform.ts`（`node:fs/promises` + `node:path` +
 *   `node:crypto`）。不走 `ctx.fs`：那条缝面向模型发起的工具调用，要求不透明 `FsTarget` 且
 *   禁止解析路径，而本内核要 `resolve`、`join`、`dirname`、要 `rename`（ADR-0003 决定 1，
 *   dissolvef 先例）。权限边界因此靠**动作分级**：`rename` + `dryRun=false` 在定义里是
 *   `danger.all`，`defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批与审计走 DSH 的
 *   `approval` 缝（`docs/service-mapping.md` 实测 `dsh-user-approval` 在默认组合里）。
 * - **撤销账本的位置必须显式给**：`Config.undoPath`（空串 = 没配）。没配且表单也没给时，
 *   `undo` / `history` / 真执行 `rename` 三条腿在**动手之前**抛一句点名拒绝
 *   （`assertUndoStorePath`），而不是把账本写进一个没人知道的地方，也不是"文件已经移完才报缺配置"
 *   （内核记批次在执行循环之后，`core.ts:467`）。`platform.ts` 的 `defaultUndoPath()` 是第二道
 *   兜底。上游那份默认值来自 `resolveXiraniteConfigPath()`，按 ADR-0013 整块不搬；
 *   这条与 ADR-0003 决定 2 判的是同一件事，`dissolvef` 的 `historyPath` 与 `findz` 的
 *   `indexDir` 是先例。
 * - `Config.enableUndo` 是上游 `[nodes.trename] enable_undo` 那一条（`cli.ts:74`）：它为假时
 *   `undo` / `history` 在**动手之前**抛拒绝，而不是偷偷跑。这条不需要新缺口：设置面本来就有。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`。上游 platform.ts 里唯一碰
 *   `node:child_process` 的 `readClipboardText()` 只服务 `guided` 腿，那条腿在本包是响亮拒绝的
 *   未接面（见 `src/cli.ts`），缺口即台账 `G-clipboard-guided`。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的 `tools`
 *   只有单次输出缝，没有"同一运行的中间态流"）。账本缺席时 `defineNode` 会 `console.warn`
 *   并把进度降级成无操作，节点仍能脱离工作台单独装。
 *
 * @module xaihi-trename
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runTrename, type TrenameAction, type TrenameData, type TrenameInput, type TrenameScanMode } from './core.ts'
import { createNodeTrenameRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-trename'

export const inject = ['tools']

/**
 * 三段清单数字全部来自上游**终端面**，不在这里另定：
 * 操作与冲突各 30 行（`cli.ts:580` / `:587`）、历史 20 条（`:594`）、JSON 预览 12 行（`:603`）。
 */
const RESULT_LINES = 30
const HISTORY_LINES = 20
const JSON_PREVIEW_LINES = 12

export interface Config {
  /**
   * 上游 `[nodes.trename] undo_path`（`cli.ts:62`、`:367` 的 `args.undoPath ?? defaults.undoPath`）。
   * 空串 = **没配**：表单那条 `undoPath` 字段仍然可用，两边都没给时三条需要账本的腿
   * （`undo` / `history` / 真执行 `rename`）响亮拒绝，理由见文件头与 ADR-0003 决定 2。
   */
  undoPath: Volatile<string>
  /** 上游 `enable_undo`：为假时 `undo` / `history` 直接拒绝（默认 true，与 `cli.ts:74` 同）。 */
  enableUndo: Volatile<boolean>
}

export const Config = Schema.object({
  undoPath: Schema.string().default('').volatile(),
  enableUndo: Schema.boolean().default(true).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的 `fieldProperty` 把
 * path-list 映射成 `array<string>`）给的是**数组**，文本域那一边给的是换行分隔的字符串。
 * 清单里上游声明的绑定是 `paths → delimited`，而 `transformValue(…, 'delimited')` 只按逗号切
 * （`define-node.ts:139`）：多行粘贴会变成**一个带换行的假路径**。
 *
 * 更要紧的是内核自己那串路径字符串走 `splitPathInput`（`core.ts:763-766`），分隔符是
 * **空白 + 引号**，不是逗号——把多个路径 join 成一条字符串交给它，带空格的真路径会被撕成两截。
 * 所以这里一律交给内核**数组**，切分照上游 UI 面那份 `splitLines`
 * （`interaction.ts:101`：`/[\r\n;,]+/`）。清单仍是上游那份声明；这条落差与
 * `crashu` / `formatv` / `samea` 记的是同一条，不在这里重复登记。
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
 * 三个默认为真的布尔（`includeRoot` / `compact` / `dryRun`）都只在参数**缺席时不下发**，
 * 让内核那份默认（`core.ts:196-200`：三者皆 true）说话。把"缺席"折成 `false` 会变成
 * "没填就真移文件"，与上游 `interaction.ts:93` 的 `values.dryRun !== false` 相反。
 */
function inputFrom(action: TrenameAction, args: Record<string, unknown>, inputs: Record<string, unknown>): TrenameInput {
  const jsonContent = typeof inputs.jsonContent === 'string' ? inputs.jsonContent : ''
  const basePath = typeof inputs.basePath === 'string' ? inputs.basePath : ''
  const batchId = typeof inputs.batchId === 'string' ? inputs.batchId : ''
  const mode = typeof inputs.mode === 'string' ? inputs.mode : ''
  return {
    action,
    paths: pathsFrom(args.paths),
    ...(jsonContent === '' ? {} : { jsonContent }),
    ...(basePath === '' ? {} : { basePath }),
    ...(batchId === '' ? {} : { batchId }),
    ...(args.includeHidden === undefined ? {} : { includeHidden: args.includeHidden === true }),
    ...(args.includeRoot === undefined ? {} : { includeRoot: args.includeRoot === true }),
    ...(args.compact === undefined ? {} : { compact: args.compact === true }),
    ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun === true }),
    ...(mode === '' ? {} : { mode: mode as TrenameScanMode }),
    ...(typeof inputs.maxLines === 'number' ? { maxLines: inputs.maxLines } : {}),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：trename 内核的 `progress` 是百分数
 * （scan `10 + 70·占比` 与 100、rename `10 + 80·占比` 与 100，`core.ts:243` / `:406` / `:452` / `:468`），
 * 直接当 `done / total = 100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 结果视图：计数 + 冲突 + 操作 + 历史 + 分段，全是内核已算好的字段，这里不重算。 */
function viewOf(data: TrenameData | undefined) {
  return {
    totalItems: data?.totalItems ?? 0,
    pendingCount: data?.pendingCount ?? 0,
    readyCount: data?.readyCount ?? 0,
    successCount: data?.successCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    operationId: data?.operationId ?? '',
    basePath: data?.basePath ?? '',
    segmentCount: (data?.segments ?? []).length,
    conflicts: (data?.conflicts ?? []).slice(0, RESULT_LINES),
    operations: (data?.operations ?? []).slice(0, RESULT_LINES),
    history: (data?.history ?? []).slice(0, HISTORY_LINES),
    jsonPreview: (data?.jsonContent ?? '').split('\n').slice(0, JSON_PREVIEW_LINES),
    errors: data?.errors ?? [],
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 30 条 `源 -> 目标`（上游终端面打印的就是这几列）。 */
function summarize(message: string, data: TrenameData | undefined): string {
  const counts = `total ${String(data?.totalItems ?? 0)} · pending ${String(data?.pendingCount ?? 0)} · ready ${String(data?.readyCount ?? 0)} · success ${String(data?.successCount ?? 0)} · failed ${String(data?.failedCount ?? 0)} · skipped ${String(data?.skippedCount ?? 0)}`
  const operations = data?.operations ?? []
  const lines = operations.slice(0, RESULT_LINES).map((operation) => `${operation.originalPath} -> ${operation.newPath}`)
  const rest = operations.length > RESULT_LINES ? `… ${String(operations.length - RESULT_LINES)} more` : ''
  const conflicts = (data?.conflicts ?? []).slice(0, RESULT_LINES).map((conflict) => `conflict ${conflict.type}: ${conflict.message}`)
  const batches = (data?.history ?? []).slice(0, HISTORY_LINES).map((batch) => `${batch.id} ${batch.undone ? 'undone' : 'active'} ${String(batch.operations.length)} ops ${batch.timestamp}`)
  const undo = data?.operationId ? `undo batch: ${data.operationId}` : ''
  const base = data?.basePath ? `base: ${data.basePath}` : ''
  return [message, counts, base, undo, ...lines, rest, ...conflicts, ...batches].filter(Boolean).join('\n')
}

/** 上游 `cli.ts:302-306`：`enable_undo = false` 时 undo / history 不进内核。 */
function assertUndoEnabled(action: TrenameAction, enableUndo: boolean): void {
  if (enableUndo || (action !== 'undo' && action !== 'history')) return
  throw new Error(`trename ${action}: 撤销与历史被配置关掉（config.enableUndo = false，上游 [nodes.trename] enable_undo）`)
}

/** 三条要碰撤销账本的腿：`undo` / `history` 必读，真执行的 `rename` 必写。 */
function needsUndoStore(action: TrenameAction, args: Record<string, unknown>): boolean {
  if (action === 'undo' || action === 'history') return true
  return action === 'rename' && args.dryRun === false
}

/**
 * 账本位置没给时**在动手之前**拒绝（ADR-0003 决定 2 的那条判据）。
 *
 * 这一刀不能只留给 `platform.ts` 的 `defaultUndoPath()`：内核是在执行循环**之后**才记批次
 * （`core.ts:467`），只靠那道兜底的话，真执行 rename 会变成"文件已经移完，然后才报缺配置"。
 */
function assertUndoStorePath(action: TrenameAction, args: Record<string, unknown>, undoPath: string): void {
  if (!needsUndoStore(action, args) || undoPath.trim() !== '') return
  throw new Error(`trename ${action}: 撤销账本位置没给（config.undoPath 或表单 undoPath）—— Xaihi 里没有"每插件数据目录"这个 API，路径必须显式给`)
}

/**
 * 六个动作共用的一条腿：接配置、跑内核、接账本、发结果视图、失败就抛。
 *
 * `undoPath` 的优先级照上游 `cli.ts:367`（`args.undoPath ?? defaults.undoPath`）：
 * 表单给了就用表单的，否则用 `Config.undoPath`，两边都没有就是上面那道拒绝。
 */
async function call(action: TrenameAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  assertUndoEnabled(action, config.enableUndo.get())
  const declaredUndoPath = typeof inputs.undoPath === 'string' ? inputs.undoPath.trim() : ''
  const undoPath = declaredUndoPath === '' ? config.undoPath.get() : declaredUndoPath
  assertUndoStorePath(action, args, undoPath)
  const runtime = createNodeTrenameRuntime({ undoPath })
  const result = await runTrename(inputFrom(action, args, inputs), runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核把"部分条目失败了"表达成 `success: false`，这时文件已经动过了：
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`trename ${action}: ${result.message}`)
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
      async import({ args, inputs, run }) {
        return call('import', args, inputs, run, config)
      },
      async validate({ args, inputs, run }) {
        return call('validate', args, inputs, run, config)
      },
      async rename({ args, inputs, run }) {
        return call('rename', args, inputs, run, config)
      },
      async undo({ args, inputs, run }) {
        return call('undo', args, inputs, run, config)
      },
      async history({ args, inputs, run }) {
        return call('history', args, inputs, run, config)
      },
    },
  })
}
