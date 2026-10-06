/**
 * samea 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（差异只有 import 说明符，
 * 用 difflib 对着上游比过：254 行 / 16 行从第一条 import 起完全一致）。所以这一侧只做四件事：
 * 把表单值绑成 `SameaInput`、把内核的过程事件接到运行账本、把计划发给 `result_view`、
 * 把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 这个节点**没有**"必须显式给路径才准动手"那道闸门（对照 `dissolvef`）：上游 samea 不写
 * 撤销账本，它的保护是 `dryRun`（默认 true）+ 定义里的 `danger.all`。这里不替它造一份账本，
 * 也不把 dissolvef 的闸门抄过来——那会让终端面与宿主面都多一条上游没有的拒绝。
 *
 * @module xaihi-samea
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runSamea, type SameaAction, type SameaData, type SameaInput } from './core.ts'
import { createNodeSameaRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-samea'

export const inject = ['tools']

/** 结果行数是上游 `interaction.ts:48` 那四条计数 + 前 12 条计划，不在这里另定一个数。 */
const RESULT_LINES = 12

export interface Config {
  /**
   * 上面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.samea]`
   * （`ignore_path_blacklist` / `min_occurrences` / `centralize` / `dry_run` /
   * `artist_blacklist` / `path_blacklist` / `regex_blacklist` / `archive_extensions`）。
   * 按 `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 三个黑名单字段留空 = **不覆盖**，落回内核自带的默认名单（`core.ts` 的
   * `DEFAULT_ARTIST_BLACKLIST` / `DEFAULT_PATH_BLACKLIST` / `DEFAULT_ARCHIVE_EXTENSIONS`）。
   * 名单只有一份，不在这里抄第二份——抄了就会漂。
   */
  ignorePathBlacklist: Volatile<boolean>
  /** 画师至少出现几次才建目录（内核自己还会夹到 1..100）。 */
  minOccurrences: Volatile<number>
  /** 是否把归好的归档集中到 `[00画师分类]` 下。 */
  centralize: Volatile<boolean>
  /** 预演模式，默认 true：**没配就只出计划，一个文件都不搬**。 */
  dryRun: Volatile<boolean>
  /** 换行或逗号分隔；空串表示用内核默认名单。 */
  artistBlacklist: Volatile<string>
  pathBlacklist: Volatile<string>
  regexBlacklist: Volatile<string>
  archiveExtensions: Volatile<string>
}

export const Config = Schema.object({
  ignorePathBlacklist: Schema.boolean().default(false).volatile(),
  minOccurrences: Schema.number().default(1).volatile(),
  centralize: Schema.boolean().default(false).volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
  artistBlacklist: Schema.string().default('').volatile(),
  pathBlacklist: Schema.string().default('').volatile(),
  regexBlacklist: Schema.string().default('').volatile(),
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
 * `path-list` / `multiline` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的
 * `fieldProperty` 把 path-list 映射成 `array<string>`）给的是**数组**，文本域那一边给的是
 * 换行分隔的字符串。
 *
 * 所以这里**不**用清单里那条 `lines` 绑定产物当唯一来源：`transformValue(…, 'lines')`
 * 只会 `String(value).split('\n')`，数组进来会被粘成一项（`['a','b']` → `['a,b']`）。
 * 接线层按原始形状分两条槽交给内核——数组进 `paths`（内核不切逗号），
 * 字符串进 `listText`（保留上游"逗号也算分隔符"的语义）。
 * 清单仍是上游那份声明；这条落差写进 `docs/service-mapping.md` 的缺口名单。
 */
function pathSlots(value: unknown): Pick<SameaInput, 'paths' | 'listText'> {
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
 * `action` 由处理器身份给（一个动作一个工具）；`includeDirectories` 与
 * `skipGroupedDirectories` **不在定义里**（上游 `node-definitions/samea.json` 也没声明这两条
 * 字段，尽管内核吃它们），所以宿主面不暴露，留内核默认 false。
 */
function inputFrom(action: SameaAction, inputs: Record<string, unknown>, config: Config): SameaInput {
  const artist = listOrUndefined(inputs.artistBlacklist, config.artistBlacklist.get())
  const paths = listOrUndefined(inputs.pathBlacklist, config.pathBlacklist.get())
  const regex = listOrUndefined(inputs.regexBlacklist, config.regexBlacklist.get())
  const extensions = listOrUndefined(inputs.archiveExtensions, config.archiveExtensions.get())
  return {
    action,
    ...pathSlots(inputs.paths),
    ignorePathBlacklist: typeof inputs.ignorePathBlacklist === 'boolean' ? inputs.ignorePathBlacklist : config.ignorePathBlacklist.get(),
    minOccurrences: typeof inputs.minOccurrences === 'number' ? inputs.minOccurrences : config.minOccurrences.get(),
    centralize: typeof inputs.centralize === 'boolean' ? inputs.centralize : config.centralize.get(),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
    ...(artist === undefined ? {} : { artistBlacklist: artist }),
    ...(paths === undefined ? {} : { pathBlacklist: paths }),
    ...(regex === undefined ? {} : { regexBlacklist: regex }),
    ...(extensions === undefined ? {} : { archiveExtensions: extensions }),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：samea 内核的 `progress` 是百分数（15 / 65 / 100），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：计数 + 前 12 条计划 + 分组，口径照上游 `interaction.ts` 的 `result()`
 * （那份文件本包搬不动，它引 `@xiranite/cli-runtime/interaction`）。
 */
function viewOf(data: SameaData | undefined) {
  return {
    scannedCount: data?.scannedCount ?? 0,
    readyCount: data?.readyCount ?? 0,
    movedCount: data?.movedCount ?? 0,
    ignoredCount: data?.ignoredCount ?? 0,
    conflictCount: data?.conflictCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    errors: data?.errors ?? [],
    groups: data?.groups ?? [],
    items: (data?.items ?? []).slice(0, RESULT_LINES),
  }
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async plan({ inputs, run }) {
        const result = await runSamea(inputFrom('plan', inputs, config), createNodeSameaRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        return summarize('plan', result.message, result.data?.items ?? [])
      },

      async classify({ inputs, run }) {
        const result = await runSamea(inputFrom('classify', inputs, config), createNodeSameaRuntime(), (event) => forward(event, run))
        run.resultView(viewOf(result.data))
        if (!result.success) throw new Error(`samea: ${result.message}`)
        return summarize('classify', result.message, result.data?.items ?? [])
      },
    },
  })
}

/** 工具输出：一句结论 + 前 12 条 `状态 画师 源 -> 目标`（上游终端面打印的就是这三列）。 */
function summarize(action: SameaAction, message: string, items: { sourcePath: string; targetPath: string; status: string; artistName: string; reason?: string }[]): string {
  const lines = items.slice(0, RESULT_LINES).map((item) => `${item.status}\t${item.artistName}\t${item.sourcePath} -> ${item.targetPath}${item.reason ? ` (${item.reason})` : ''}`)
  const rest = items.length > RESULT_LINES ? `… ${String(items.length - RESULT_LINES)} more` : ''
  return [`${action} · ${message}`, ...lines, rest].filter(Boolean).join('\n')
}
