/**
 * classq 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（255 行 / 34 行，
 * 差异只有第 1 行的 import 说明符）。所以这一侧只做四件事：把表单值绑成 `ClassqInput`、
 * 把内核的过程事件接到运行账本、把计划发给 `result_view`、把危险动作交给 DSH 的审批缝。
 * 不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 上游那套"配置文件里读 `[nodes.classq]` 默认值"的通路（`packages/nodes/classq/src/cli.ts:15`
 * 的 `ClassqNodeConfig`：`keyword` / `wait_keyword` / `transfer_mode` / `existing_policy` /
 * `dry_run`）按 `docs/adr/0013-config-goes-through-dsh-settings.md` 整块不接，
 * 同一批默认值在这里声明成 `Config`，值由 DSH 的 patch 层给、读写走 settings 面。
 *
 * 与 `dissolvef` 不同，这个节点**不需要**"必须显式给路径才准动手"那道闸门：
 * classq 不写任何自己的账本或数据目录，它的产物就是被移动/复制的文件本身，
 * 保护来自 `dryRun`（默认 true）+ 定义里的 `danger.all`。这里不替它造一份账本。
 *
 * 上游的 `interaction.ts`（31 行）**不随本包发布**：它引 `@xiranite/cli-runtime/interaction`
 * 与 `TerminalLanguage`，本仓没有那两个包也不许引 `@xiranite/*`。它那份 `result()`
 * 报的三个计数（`interaction.ts:28`：关键词命中 / 就绪 / 冲突）与 `dangerPrompt`
 * 就是下面 `viewOf()` 与工具输出的口径，形状照它、不另定一套。
 *
 * @module xaihi-classq
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runClassq, type ClassqAction, type ClassqData, type ClassqExistingPolicy, type ClassqInput, type ClassqTransferMode } from './core.ts'
import { createNodeClassqRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-classq'

export const inject = ['tools']

/**
 * 结果行数是上游 `cli.ts:48` 那个 `items.slice(0, 80)`，不在这里另定一个数。 */
const RESULT_LINES = 80

export interface Config {
  /**
   * 这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.classq]`
   * （`keyword` / `wait_keyword` / `transfer_mode` / `existing_policy` / `dry_run`）。
   * 按 ADR-0013 那条通路整块不搬：同一份默认值在这里声明成 `Config`，
   * 值由 DSH 的 patch 层组合（bundle → profile → home → `--patch`）给。
   *
   * 空串 = **不覆盖**，落回内核对空白输入的默认词（`core.ts` 的 `|| "already"` /
   * `|| "wait"`）；名单只有一份，不在这里抄第二份。
   */
  keyword: Volatile<string>
  waitKeyword: Volatile<string>
  /**
   * 收口在上游那两个词上：字段与配置都不是 `copy` 时给 `move`。
   * 内核自己只在 `=== "copy"` 时记 `copied`（`core.ts:111`），传一个拼错的值会让落盘
   * 走 `rename` 而 `data.transferMode` 里写着那个垃圾值——界面上就读不回来了。
   */
  transferMode: Volatile<string>
  /** `merge` = 目标已存在报冲突，`skip` = 报冲突但换个 reason（`core.ts:201`）。 */
  existingPolicy: Volatile<string>
  /** 预演模式，默认 true：**没配就只出计划，一个文件都不动**。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  keyword: Schema.string().default('').volatile(),
  waitKeyword: Schema.string().default('').volatile(),
  transferMode: Schema.string().default('move').volatile(),
  existingPolicy: Schema.string().default('merge').volatile(),
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
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的 `fieldProperty` 把
 * path-list 映射成 `array<string>`）给的是**数组**，文本域那一边给的是换行分隔的字符串。
 *
 * 所以这里**不**用清单里上游声明的那条 `delimited` 绑定产物当唯一来源：它只会
 * `String(value).split(',')`，数组进来会被粘平、换行分隔的输入则整条当成一个路径。
 * 接线层按原始形状分两条槽交给内核——数组进 `paths`（内核不切逗号），
 * 字符串进 `listText`（保留上游 `parseList` "换行与逗号都算分隔符"的语义）。
 * 清单因此把这条绑定写成 `identity`（`tests/definition.spec.ts` 钉着），
 * 这条落差是 DSH 参数面与上游表单面的形状差，属于 `docs/service-mapping.md` 的缺口名单。
 */
function pathSlots(value: unknown): Pick<ClassqInput, 'paths' | 'listText'> {
  if (Array.isArray(value)) {
    return { paths: value.map((item) => String(item ?? '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) }
  }
  const text = String(value ?? '').trim()
  return text === '' ? {} : { listText: text }
}

/** 字段值优先、空时落回 `Config`；两条都空时给 `undefined`，让内核用它自己的默认词（`core.ts` 的 `|| "already"` / `|| "wait"`）。 */
function orConfig(value: unknown, fallback: string): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  const configured = fallback.trim()
  const chosen = text === '' ? configured : text
  return chosen === '' ? undefined : chosen
}

/** `transferMode`：内核只认 `copy`，其余（含配置里写错的值）一律按 `move` 走——与 `normalizeClassqInput` 的 `?? "move"` 同一判据。 */
function transferModeOf(value: unknown, fallback: string): ClassqTransferMode {
  const text = (typeof value === 'string' && value.trim() !== '' ? value : fallback).trim()
  return text === 'copy' ? 'copy' : 'move'
}

/** `existingPolicy`：内核只认 `skip`（它只换 reason，不换动作），其余一律 `merge`。 */
function existingPolicyOf(value: unknown, fallback: string): ClassqExistingPolicy {
  const text = (typeof value === 'string' && value.trim() !== '' ? value : fallback).trim()
  return text === 'skip' ? 'skip' : 'merge'
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具）。`path`（单数）与 `listText` 的分工照内核：
 * 内核 `normalizeClassqInput` 会把 `path`、`paths[]`、`listText` 三者合并去重，
 * 而清单里只有一个 `paths` 字段，所以这里只喂那两条槽，不发明第三条。
 */
function inputFrom(action: ClassqAction, inputs: Record<string, unknown>, config: Config): ClassqInput {
  const keyword = orConfig(inputs.keyword, config.keyword.get())
  const waitKeyword = orConfig(inputs.waitKeyword, config.waitKeyword.get())
  const dryRun = typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get()
  return {
    action,
    ...pathSlots(inputs.paths),
    // `exactOptionalPropertyTypes` 开着：没值时**不给键**，让内核的 `?? / ||` 自己兜底，
    // 而不是在这里塞一个 undefined 冒充"用户给了空"。
    ...(keyword === undefined ? {} : { keyword }),
    ...(waitKeyword === undefined ? {} : { waitKeyword }),
    transferMode: transferModeOf(inputs.transferMode, config.transferMode.get()),
    existingPolicy: existingPolicyOf(inputs.existingPolicy, config.existingPolicy.get()),
    dryRun,
  }
}

/**
 * 内核事件 → 运行账本。**单位**：classq 内核的 `progress` 是百分数（20 / 70，见 `core.ts`
 * 那两处 `onEvent`），直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`
 * （那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：三个计数在上游 `interaction.ts:28` 的 `result()` 里（关键词命中 / 就绪 / 冲突），
 * 其余计数与 `errors` 是内核 `ClassqData` 自己就算好的，这里只搬运不改口径。
 */
function viewOf(data: ClassqData | undefined) {
  return {
    keywordCount: data?.keywordCount ?? 0,
    readyCount: data?.readyCount ?? 0,
    conflictCount: data?.conflictCount ?? 0,
    rootCount: data?.rootCount ?? 0,
    waitCount: data?.waitCount ?? 0,
    movedCount: data?.movedCount ?? 0,
    copiedCount: data?.copiedCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    errors: data?.errors ?? [],
    transferMode: data?.transferMode ?? 'move',
    items: (data?.items ?? []).slice(0, RESULT_LINES),
  }
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      // 预演失败（根目录不是目录、关键词目录不存在）是**给使用者读的消息**，
      // 不抛：内核把它们记成 error 项，`result_view` 里读得回来。
      async plan({ inputs, run }) {
        const result = await runClassq(inputFrom('plan', inputs, config), createNodeClassqRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('plan', result.message, result.data?.items ?? [])
      },

      // 真执行失败必须让这次运行记成失败（`defineNode` 会 `journal.fail`），
      // 不许咽成一次成功输出——那症状是"面板显示了空结果"。
      async classify({ inputs, run }) {
        const result = await runClassq(inputFrom('classify', inputs, config), createNodeClassqRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        if (!result.success) throw new Error(`classq: ${result.message}`)
        return summarize('classify', result.message, result.data?.items ?? [])
      },
    },
  })
}

/** 工具输出：一句结论 + 前 80 条 `状态 阶段 源名 -> 相对目标`（上游终端面打印的就是这三列）。 */
function summarize(action: ClassqAction, message: string, items: { status: string; stage: string; sourceName: string; targetRelative: string; reason?: string }[]): string {
  const lines = items.slice(0, RESULT_LINES).map((item) => `${item.status}\t${item.stage}\t${item.sourceName}\t->\t${item.targetRelative}${item.reason ? ` (${item.reason})` : ''}`)
  const rest = items.length > RESULT_LINES ? `… ${String(items.length - RESULT_LINES)} more` : ''
  return [`${action} · ${message}`, ...lines, rest].filter(Boolean).join('\n')
}
