/**
 * classf 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` + `blacklist.ts` + 四个垫片 + `platform.ts`）逐字来自 `noxide` 基线，
 * 差异只在 import 说明符与 `blacklist.ts` 那一处**可见退化**（繁简折字要 `opencc-js`，
 * 本包没这个依赖）。这一侧只做四件事：把表单值绑成 `ClassfInput`、把内核的三层进度接到
 * 运行账本、把计划发给 `result_view`、把危险动作交给 DSH 的审批缝。不在这里重排分类语义，
 * 也不在这里补一条兄弟内核的通路。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/classf.json`，四条已定形的换算见 `tests/definition.spec.ts`）。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `pathInfo` / `listDir` / `join` / `dirname` / `basename` / `relative`
 *   → `src/platform.ts` 的 `node:fs/promises` + `node:path`，**不接 `ctx.fs`**
 *   （ADR-0003 决定 1：那条缝面向模型发起的工具调用、禁止解析路径，而本内核要相对路径算术）。
 * - `runSamea` / `runCrashu` / `runMigratef` → **没有缝**：`src/platform.ts` 抛
 *   `SIBLING_KERNEL_UNWIRED`（新缺口 **G10**），于是三条动作的结果都是
 *   `success:false` + 那句点名服务的话。宿主侧的失败走 `throw`，界面上读得回来，
 *   不是空计划（降级铁律，ADR-0011 决定 4）。
 * - `readClipboardPaths` → 同样抛（台账 **G5** 那条）；内核只在 `paths` 为空时才走它，
 *   所以"显式给了根目录"与"没给"两句是不同的拒绝理由，两条都不许伪造成成功。
 * - 危险动作（`classify` 且非预演）→ `ctx.approval`：`danger.all` 经 `defineNode` 变成 `ask`。
 *   本包**不** `inject` `subprocess`（内核一个外部程序都不调），也**不** `inject` `commands`
 *   （所以 `src/help.ts` 不宣传 `/classf`，台账 **G7**）。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`，每次调用现取；账本缺席时 `defineNode`
 *   会 `console.warn` 并把进度降级成无操作。
 *
 * `dryRun` 这一格有三份默认，不许"统一"（台账 **G8**，rawfilter 是同类先例）：
 * - 内核 `core.ts:75` 是 `input.dryRun ?? true` ⇒ **默认预演**；
 * - 清单 `fields.dryRun.default` 是 `true` ⇒ 界面默认预演；
 * - 但 `defineNode` 的 `asBoolean` 折叠会把**模型省略参数**折成 `false`
 *   （`packages/node-sdk/src/define-node.ts:144-145`）⇒ 直接读 `inputs.dryRun` 等于
 *   "少传就真搬"。所以这里读原始 `args.dryRun` 是否在席，缺席时落回 `Config.dryRun`（默认 true）。
 * 三种形状各钉一条测试在 `tests/core.spec.ts` 与 `tests/definition.spec.ts`。
 *
 * @module xaihi-classf
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runClassf, type ClassfAction, type ClassfData, type ClassfInput, type ClassfPlanItem } from './core.ts'
import { createNodeClassfRuntime } from './platform.ts'
import { CLASSF_BLACKLIST_FOLDING } from './blacklist.ts'

export const name = '@hibernalglow/xaihi-classf'

/** 只有 `tools`：本节点不调外部程序（`subprocess`），也不注册斜杠命令（`commands`，见 G7）。 */
export const inject = ['tools']

/** 计划行数是上游 `cli.ts:122` 那个 `data.items.slice(0, 80)`，不在这里另定一个数。 */
const PLAN_LINES = 80

export interface Config {
  /**
   * 这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.classf]`
   * （`crashu_similarity_threshold` / `samea_min_occurrences` / `samea_centralize` /
   * `samea_ignore_path_blacklist` / `samea_group_centralize` / `dry_run`，
   * 见上游 `cli.ts:14-46` 那份 `ClassfNodeConfig`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * **只声明清单字段没有的那几格**：`targetDir` / `transferMode` / `placementMode` /
   * `existingPolicy` / `workItemMode` / `blacklistKeywords` / 三条队列开关 / 三条画师分组开关 /
   * `sameaGroupMinOccurrences` 都在定义里有字段与默认值，这里不再抄第二份。
   * `crashuSimilarityThreshold` 的 0.8 与内核同源（`core.ts:59,74`），名单只有一份。
   */
  crashuSimilarityThreshold: Volatile<number>
  sameaMinOccurrences: Volatile<number>
  sameaCentralize: Volatile<boolean>
  sameaIgnorePathBlacklist: Volatile<boolean>
  sameaGroupCentralize: Volatile<boolean>
  /** 预演开关，默认 true，与内核默认同向；它补的是"模型省略 `dryRun`"那一格（见文件头 G8）。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  crashuSimilarityThreshold: Schema.number().default(0.8).volatile(),
  // 默认对齐迁移配置 [nodes.classf] sameaGroupMinOccurrences = 2。
  sameaMinOccurrences: Schema.number().default(2).volatile(),
  sameaCentralize: Schema.boolean().default(false).volatile(),
  sameaIgnorePathBlacklist: Schema.boolean().default(false).volatile(),
  sameaGroupCentralize: Schema.boolean().default(false).volatile(),
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
 * 队列/分词那几格的原始形状。
 *
 * `path-list` 与 `multiline` 字段在两个面上拿到的形状不一样：工具面（`fieldProperty`）给的是
 * **数组**，界面那一边给的是换行分隔的字符串；而清单声明的 `delimited` 变换只按逗号切
 * （`transformValue` ⇒ 多行文本会变成一个带换行的假路径）。所以接线层按原始值切，
 * 分隔符用内核自己的 `parseList` 那一套（`core.ts:370`：换行或逗号），
 * 落差与 `formatv` / `samea` 记的是同一条（不是新缺口）。
 */
function listOf(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  const items = Array.isArray(value)
    ? value.map((item) => String(item ?? ''))
    : String(value ?? '').split(/\r?\n|,/)
  const cleaned = items.map((item) => item.trim()).filter((item) => item !== '')
  return cleaned.length ? cleaned : undefined
}

/** 缺席的布尔不算"false"：见文件头那条 G8（`asBoolean` 会把省略折成 false）。 */
function boolOf(args: Record<string, unknown>, field: string): boolean | undefined {
  return typeof args[field] === 'boolean' ? args[field] : undefined
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`，它的职责是决定哪个工具被调用，不是第二个开关。
 *
 * `classifyMode` / `sameaGroupEnabled` 这两个 legacy 开关在清单里**没有字段**（上游也是靠
 * TOML 与 `--classify` 给的）：这里不发明默认，一律留给内核自己折算
 * （`core.ts:70,76` ⇒ `classifyMode` 默认 `auto`、三条队列全开、legacy 分组默认关）。
 * 想要 legacy 形状的调用方走 `paths` 之外的显式三条队列开关（定义里有字段）。
 */
function inputFrom(action: ClassfAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): ClassfInput {
  const paths = listOf(args.pathsText)
  const crashuSources = listOf(args.crashuSourcesText)
  const blacklistKeywords = listOf(args.blacklistKeywordsText)
  const groupMin = typeof inputs.sameaGroupMinOccurrences === 'number' ? inputs.sameaGroupMinOccurrences : undefined
  const groupAlready = boolOf(args, 'sameaGroupAlreadyEnabled')
  const groupWait = boolOf(args, 'sameaGroupWaitEnabled')
  const groupDel = boolOf(args, 'sameaGroupDelEnabled')
  const dryRun = boolOf(args, 'dryRun')
  return {
    action,
    ...(paths === undefined ? {} : { paths }),
    ...(crashuSources === undefined ? {} : { crashuSourcePaths: crashuSources }),
    ...(blacklistKeywords === undefined ? {} : { blacklistKeywords }),
    crashuSimilarityThreshold: config.crashuSimilarityThreshold.get(),
    ...(typeof inputs.placementMode === 'string' ? { placementMode: inputs.placementMode as ClassfInput['placementMode'] } : {}),
    ...(typeof inputs.transferMode === 'string' ? { transferMode: inputs.transferMode as ClassfInput['transferMode'] } : {}),
    ...(typeof inputs.existingPolicy === 'string' ? { existingPolicy: inputs.existingPolicy as ClassfInput['existingPolicy'] } : {}),
    ...(typeof inputs.workItemMode === 'string' ? { workItemMode: inputs.workItemMode as ClassfInput['workItemMode'] } : {}),
    ...(typeof inputs.targetDir === 'string' && inputs.targetDir !== '' ? { targetDir: inputs.targetDir } : {}),
    // 三条队列开关：**缺席就不传**，让内核按 legacy `classifyMode` 折算
    // （`core.ts:76` + `:343-347`）。这里替它写 `?? true` 等于把内核那段台词抢了。
    ...(boolOf(args, 'alreadyEnabled') === undefined ? {} : { alreadyEnabled: boolOf(args, 'alreadyEnabled') }),
    ...(boolOf(args, 'waitEnabled') === undefined ? {} : { waitEnabled: boolOf(args, 'waitEnabled') }),
    ...(boolOf(args, 'delEnabled') === undefined ? {} : { delEnabled: boolOf(args, 'delEnabled') }),
    sameaMinOccurrences: config.sameaMinOccurrences.get(),
    sameaCentralize: config.sameaCentralize.get(),
    sameaIgnorePathBlacklist: config.sameaIgnorePathBlacklist.get(),
    sameaGroupCentralize: config.sameaGroupCentralize.get(),
    ...(groupMin === undefined ? {} : { sameaGroupMinOccurrences: groupMin }),
    ...(groupAlready === undefined ? {} : { sameaGroupAlreadyEnabled: groupAlready }),
    ...(groupWait === undefined ? {} : { sameaGroupWaitEnabled: groupWait }),
    ...(groupDel === undefined ? {} : { sameaGroupDelEnabled: groupDel }),
    dryRun: dryRun ?? config.dryRun.get(),
  } satisfies ClassfInput
}

/**
 * 内核事件 → 运行账本。**单位**：classf 的 `progress` 是百分数（5 / 20 / 35 / 40 / 45 /
 * 50 / 65 / 80 / 92-100，`core.ts:91-121`），兄弟内核的事件由 `forward(event, offset, span)`
 * 折进各自那段（`:358`），所以这里直接当 `done / total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：内核 `summarize()`（`core.ts:356`）那十二条计数 + `errors` + 前 80 条计划，
 * 一条不加、一条不减。阶段级的四段数据（`samea` / `crashu` / `migrate*` / `sameaGroup*`）
 * 由内核带着原样回显，这里不拆。
 */
function viewOf(data: ClassfData | undefined) {
  return {
    selectedCount: data?.selectedCount ?? 0,
    readyCount: data?.readyCount ?? 0,
    movedCount: data?.movedCount ?? 0,
    copiedCount: data?.copiedCount ?? 0,
    delCount: data?.delCount ?? 0,
    waitCount: data?.waitCount ?? 0,
    conflictCount: data?.conflictCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    errors: data?.errors ?? [],
    items: (data?.items ?? []).slice(0, PLAN_LINES),
    /** 读得回来的降级（ADR-0011 决定 4）：繁简折字这一格现在没有词典。 */
    blacklistFolding: CLASSF_BLACKLIST_FOLDING,
  }
}

/**
 * 工具输出：一句结论 + 上游终端面那三行计数（`cli.ts:122` 的列是
 * `status stage sourceName -> targetRelative`）+ 最多 80 条计划行 + 降级那一行。
 */
function summarize(action: ClassfAction, message: string, data: ClassfData | undefined): string {
  const counts = `selected ${String(data?.selectedCount ?? 0)} · ready ${String(data?.readyCount ?? 0)} · moved ${String(data?.movedCount ?? 0)} · copied ${String(data?.copiedCount ?? 0)}`
  const queues = `already ${String(data?.items.filter((item) => item.stage === 'already').length ?? 0)} · wait ${String(data?.waitCount ?? 0)} · del ${String(data?.delCount ?? 0)} · conflict ${String(data?.conflictCount ?? 0)} · errors ${String(data?.errorCount ?? 0)}`
  const items = data?.items ?? []
  const lines = items.slice(0, PLAN_LINES).map(planLine)
  const rest = items.length > PLAN_LINES ? `… ${String(items.length - PLAN_LINES)} more` : ''
  return [`${action} · ${message}`, counts, queues, ...lines, rest, CLASSF_BLACKLIST_FOLDING.request].filter(Boolean).join('\n')
}

/** 一行计划：与上游 `cli.ts:122` 同列（`status stage sourceName -> targetRelative`）。 */
function planLine(item: ClassfPlanItem): string {
  return `${item.status}\t${item.stage}\t${item.sourceName}\t->\t${item.targetRelative}`
}

/** 两条动作共用的一条腿：绑参数、跑内核、接账本、发视图，失败就原样抛出去。 */
async function call(action: ClassfAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const result = await runClassf(inputFrom(action, args, inputs, config), createNodeClassfRuntime(), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `success: errorCount === 0` 同时表达"条目失败"和"缝不在"（后者是 catch 里那句
  // `failure(errorMessage(error))`，`core.ts:129`）。视图先发出去（那是读回现场的唯一入口），
  // 再把失败原样抛出去：咽成一次成功输出，症状就是"面板显示 0 条待处理"。
  if (!result.success) throw new Error(`classf ${action}: ${result.message}`)
  return summarize(action, result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async plan({ args, inputs, run }) {
        return call('plan', args, inputs, run, config)
      },
      async classify({ args, inputs, run }) {
        return call('classify', args, inputs, run, config)
      },
    },
  })
}
