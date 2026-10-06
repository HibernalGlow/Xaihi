/**
 * nameu 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）是从 `noxide` 基线逐字搬来的，
 * 差异只有 import 说明符（`core.ts` 用 diff 对上游复核过：315 条有效行完全一致）。
 * 所以这一侧只做四件事：把表单值绑成 `NameuInput`、把内核的过程事件接到运行账本、
 * 把计划发给 `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，
 * 也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/nameu.json`，落差见那个块与下面的偏离清单）。
 *
 * 这个节点**没有**"必须显式给路径才准动手"那道闸门（对照 `dissolvef`）：上游 nameu 不写
 * 撤销账本，它的保护是 `dryRun`（定义默认 true）+ 定义里的 `danger.all`。这里不替它造
 * 一份账本，也不把 dissolvef 的闸门抄过来——那会让终端面与宿主面都多一条上游没有的拒绝。
 *
 * DI 缝 → DSH 服务的对应（`docs/service-mapping.md`）：
 * - `pathInfo` / `listDir` / `join` / `dirname` / `basename` / `rename` / `setTimes`
 *   → **不接 `ctx.fs`**，走移植版 `platform.ts` 的 `node:fs`。判据与 ADR-0003 决定 1 同一条：
 *   `ctx.fs` 的对象是模型发起的工具调用（路径要收成不透明 `FsTarget`），而这个内核要路径算术。
 * - 危险动作（`rename` + 非预演）→ `ctx.approval`：不在这里手写确认框，`defineNode` 按
 *   `danger.all` 产出 `ask`，审批与审计在宿主。
 * - 运行账目 → `ctx.storage`（storage domain `xaihi_runs`）经 `OPERATIONS_SERVICE` 的账本，
 *   每次调用现取；没有 xaihi-core 时进度上报是无操作，本节点仍可单独装。
 *
 * @module xaihi-nameu
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runNameu, type NameuAction, type NameuData, type NameuInput, type NameuMode, type NameuPlanItem } from './core.ts'
import { createNodeNameuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-nameu'

export const inject = ['tools']

/** 结果行数是上游 `cli.ts:6` 那个 `items.slice(0, 80)`，不在这里另定一个数。 */
const RESULT_LINES = 80

export interface Config {
  /**
   * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.nameu]`
   * （`mode` / `recursive` / `add_artist_name` / `normalize_folders` / `keep_timestamp` /
   * `dry_run`，见上游 `cli.ts:3` 那份 `NameuNodeConfig`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 三条名单字段留空 = **不覆盖**，落回内核自带的默认名单（`core.ts:76-78` 的
   * `DEFAULT_ARCHIVE_EXTENSIONS` / `DEFAULT_EXCLUDE_KEYWORDS` / `DEFAULT_FORBIDDEN_ARTIST_KEYWORDS`）。
   * 名单只有一份，不在这里抄第二份——抄了就会漂。
   */
  mode: Volatile<string>
  recursive: Volatile<boolean>
  addArtistName: Volatile<boolean>
  normalizeFolders: Volatile<boolean>
  keepTimestamp: Volatile<boolean>
  /** 预演模式，默认 true：**没配就只出计划，一个文件都不改名**。 */
  dryRun: Volatile<boolean>
  /** 换行或逗号分隔；空串表示用内核默认名单。 */
  excludeKeywords: Volatile<string>
  forbiddenArtistKeywords: Volatile<string>
  archiveExtensions: Volatile<string>
}

export const Config = Schema.object({
  mode: Schema.string().default('multi').volatile(),
  recursive: Schema.boolean().default(true).volatile(),
  addArtistName: Schema.boolean().default(true).volatile(),
  normalizeFolders: Schema.boolean().default(true).volatile(),
  keepTimestamp: Schema.boolean().default(true).volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
  excludeKeywords: Schema.string().default('').volatile(),
  forbiddenArtistKeywords: Schema.string().default('').volatile(),
  archiveExtensions: Schema.string().default('').volatile(),
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
 * 所以这里**不**用清单里那条 `lines` 绑定产物当唯一来源：`transformValue(…, 'lines')`
 * 只会 `String(value).split('\n')`，数组进来会被粘成一项（`['a','b']` → `['a,b']`）。
 * 接线层按原始形状分两条槽交给内核——数组进 `paths`（内核不切逗号），
 * 字符串进 `listText`（保留上游"逗号也算分隔符"的语义，`core.ts:342`）。
 * 所以清单里那条绑定的 transform 被从上游的 `lines` 改成了 **`identity`**（与 `samea` 同一处
 * 改动、同一理由）：数组原样交给下面这一刀，由接线层分两条槽——数组进 `paths`
 * （内核不切逗号，路径里带 `,` 不会被拆碎），字符串进 `listText`
 * （保留上游"逗号也算分隔符"的语义，`core.ts:342`）。
 * 这条落差与 samea 记过的是同一条，不另立第二套说法。
 */
function pathSlots(value: unknown): Pick<NameuInput, 'paths' | 'listText'> {
  if (Array.isArray(value)) {
    return { paths: value.map((item) => String(item ?? '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) }
  }
  const text = String(value ?? '').trim()
  return text === '' ? {} : { listText: text }
}

/** 换行/逗号名单 → 内核的数组；空串交回 undefined，让内核用它自己的默认名单。 */
function listOrUndefined(value: unknown, configValue: string): string[] | undefined {
  const raw = Array.isArray(value) ? value.join('\n') : String(value ?? '')
  const merged = raw.trim() === '' ? configValue : raw
  const items = merged.split(/\r?\n|,/).map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  return items.length ? items : undefined
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`，它的职责是决定哪个工具被调用，不是第二个开关。
 *
 * **`Config` 这一层什么时候才会被读到**（与 `samea` / `timeu` 同一条口径，写破以免误读）：
 * `bindInputs` 对声明了 `asBoolean` 的字段总是产出一个布尔值——模型**省略**参数时
 * `transformValue(undefined, 'asBoolean')` 给的是 `false`（`define-node.ts:144-145`），
 * 清单里的声明式 default 只有表单/面板那一侧会填。所以工具面少传一个布尔就等于说了 `false`：
 * `nameu_rename` 少传 `dryRun` ⇒ 真改名（这一步先被 `danger.all` 变成 DSH 的 `ask`），
 * 少传 `addArtistName` ⇒ 不补画师名。这条真实行为钉在 `tests/definition.spec.ts` 里；
 * "缺参即不提供、好让声明式默认生效"是 SDK 那一侧的事，不在这里私自改语义。
 */
function inputFrom(action: NameuAction, inputs: Record<string, unknown>, config: Config): NameuInput {
  const exclude = listOrUndefined(inputs.excludeKeywords, config.excludeKeywords.get())
  const forbidden = listOrUndefined(inputs.forbiddenArtistKeywords, config.forbiddenArtistKeywords.get())
  const extensions = listOrUndefined(inputs.archiveExtensions, config.archiveExtensions.get())
  return {
    action,
    ...pathSlots(inputs.paths),
    // 内核只判 `mode === 'single'`（`core.ts:145`），别的值都走 multi 那条路；
    // 上游 `cli.ts:6` 也是直接 `as NameuMode`，这里不在接线层发明一次取值校验。
    mode: (typeof inputs.mode === 'string' && inputs.mode !== '' ? inputs.mode : config.mode.get()) as NameuMode,
    recursive: typeof inputs.recursive === 'boolean' ? inputs.recursive : config.recursive.get(),
    addArtistName: typeof inputs.addArtistName === 'boolean' ? inputs.addArtistName : config.addArtistName.get(),
    normalizeFolders: typeof inputs.normalizeFolders === 'boolean' ? inputs.normalizeFolders : config.normalizeFolders.get(),
    keepTimestamp: typeof inputs.keepTimestamp === 'boolean' ? inputs.keepTimestamp : config.keepTimestamp.get(),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
    ...(exclude === undefined ? {} : { excludeKeywords: exclude }),
    ...(forbidden === undefined ? {} : { forbiddenArtistKeywords: forbidden }),
    ...(extensions === undefined ? {} : { archiveExtensions: extensions }),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：nameu 内核的 `progress` 是百分数（15 / 65），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：计数 + 前 80 条计划 + 错误行。
 * 那四条计数与标签口径照上游 `interaction.ts` 的 `result()`
 * （`Scanned` / `Ready` / `Renamed` / `Conflicts`；那份文件本包搬不动，
 * 它引 `@xiranite/cli-runtime/interaction`），行数上限照上游 `cli.ts:6` 的那个 80。
 */
function viewOf(data: NameuData | undefined) {
  return {
    mode: data?.mode ?? '',
    scannedCount: data?.scannedCount ?? 0,
    readyCount: data?.readyCount ?? 0,
    renamedCount: data?.renamedCount ?? 0,
    unchangedCount: data?.unchangedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    conflictCount: data?.conflictCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    errors: data?.errors ?? [],
    items: (data?.items ?? []).slice(0, RESULT_LINES),
  }
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async scan({ inputs, run }) {
        const result = await runNameu(inputFrom('scan', inputs, config), createNodeNameuRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('scan', result.message, result.data)
      },

      async plan({ inputs, run }) {
        const result = await runNameu(inputFrom('plan', inputs, config), createNodeNameuRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('plan', result.message, result.data)
      },

      async rename({ inputs, run }) {
        const result = await runNameu(inputFrom('rename', inputs, config), createNodeNameuRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        if (!result.success) throw new Error(`nameu: ${result.message}`)
        return summarize('rename', result.message, result.data)
      },
    },
  })
}

/**
 * 工具输出：一句结论 + 上游 `interaction.ts` 那四条计数 + 最多 80 条
 * `状态 源路径 -> 目标名`（上游终端面 `cli.ts:6` 打的就是这三列）。
 */
function summarize(action: NameuAction, message: string, data: NameuData | undefined): string {
  const counts = [
    `Scanned: ${String(data?.scannedCount ?? 0)}`,
    `Ready: ${String(data?.readyCount ?? 0)}`,
    `Renamed: ${String(data?.renamedCount ?? 0)}`,
    `Conflicts: ${String(data?.conflictCount ?? 0)}`,
  ]
  const lines = (data?.items ?? []).slice(0, RESULT_LINES).map(planLine)
  const rest = (data?.items.length ?? 0) > RESULT_LINES ? `… ${String((data?.items.length ?? 0) - RESULT_LINES)} more` : ''
  return [`${action} · ${message}`, ...counts, ...lines, rest].filter(Boolean).join('\n')
}

function planLine(item: NameuPlanItem): string {
  return `${item.status}\t${item.sourcePath}\t->\t${item.targetName}${item.reason ? ` (${item.reason})` : ''}`
}
