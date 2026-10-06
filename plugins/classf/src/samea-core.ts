/**
 * 类型 + 两个纯函数垫片：classf 用到的 Xiranite **SameA** 形状。
 *
 * 为什么在 classf 里有一份副本而不是 import：见 `./crashu-core.ts` 文件头那条
 * （缺口 **G10**，`docs/service-mapping.md` §缺口台账）。classf 的内核 `core.ts:4`
 * 对 SameA 只有类型依赖，真执行经 `ClassfRuntime.runSamea` 注入。
 *
 * **但 `blacklist.ts` 不一样**：上游 `packages/nodes/classf/src/blacklist.ts:1` 引的是
 * `@xiranite/node-samea/core` 的 `extractArtist` 与 `normalizeSameaInput` 两个**函数**
 * （黑名单关键词要用 SameA 自己的解析规则切成 `[社团]` / `[画师]` 两条）。
 * 所以这里连那两个纯函数一起抄过来——抄的仍是同一份基线，不是重写：
 * - `normalizeSameaInput`：上游 `packages/nodes/samea/src/core.ts:107-124`（含三条默认名单
 *   `:103-105`），默认值一条不改（`dryRun` 默认 **true**、`minOccurrences` 夹在 1..100、
 *   画师默认名单里有 `漫畫` 这种繁体字，都原样）。
 * - `extractArtist`：上游 `:239-251`。`[社团 (画师)]` 的匹配、`key` 用
 *   `${group}\u0000${artist}` 小写、命中默认名单就跳过这一格继续找下一格，三条判据逐字。
 *
 * 类型层的一处让步：上游那个 `ArtistMatch`（samea `:196`）是**模块私有**的，
 * 抄成跨文件用的垫片必须导出，所以这里叫 `export interface ArtistMatch`
 * （名字不变，只是可见性从模块内提到模块外）。
 *
 * 真源是 `plugins/samea/src/core.ts`（整块逐字移植的那份）；改那边要回头看这里。
 *
 * @module xaihi-classf/samea-core
 */

import type { NodeRunResult } from './contract.ts'

export type SameaAction = 'plan' | 'classify'
export type SameaPlanStatus = 'ready' | 'ignored' | 'skipped' | 'conflict' | 'moved' | 'error'

export interface SameaInput {
  action?: SameaAction
  path?: string
  paths?: string[]
  listText?: string
  ignorePathBlacklist?: boolean
  minOccurrences?: number
  centralize?: boolean
  /** Treat first-level directories as archive-like work items by directory name. */
  includeDirectories?: boolean
  /** Do not recurse into existing [artist] group directories. */
  skipGroupedDirectories?: boolean
  dryRun?: boolean
  artistBlacklist?: string[]
  pathBlacklist?: string[]
  regexBlacklist?: string[]
  archiveExtensions?: string[]
}

export interface SameaPathInfo { path: string; exists: boolean; isFile: boolean; isDirectory: boolean }
export interface SameaDirEntry { name: string; path: string; isFile: boolean; isDirectory: boolean }

export interface SameaPlanItem {
  rootPath: string
  sourcePath: string
  targetPath: string
  sourceName: string
  artistKey: string
  artistName: string
  status: SameaPlanStatus
  reason?: string
}

export interface SameaArtistGroup {
  key: string
  name: string
  targetDir: string
  count: number
  status: 'ready' | 'below_threshold' | 'blacklisted'
}

export interface SameaData {
  action: SameaAction
  centralize: boolean
  minOccurrences: number
  items: SameaPlanItem[]
  groups: SameaArtistGroup[]
  scannedCount: number
  detectedCount: number
  readyCount: number
  movedCount: number
  ignoredCount: number
  skippedCount: number
  conflictCount: number
  errorCount: number
  errors: string[]
}

export type SameaResult = NodeRunResult<SameaData>

/** 上游 samea `:196`（那边是模块私有，见文件头那条让步）。 */
export interface ArtistMatch { key: string; label: string }

/** 上游 samea `:103-105`：三条默认名单，一份都不许在这里改。 */
const DEFAULT_ARTIST_BLACKLIST = ['pixiv', 'twitter', 'various', 'anthology', 'unknown', 'trash', 'artbook', '汉化', '漫畫', '翻译', 'translation']
const DEFAULT_PATH_BLACKLIST = ['[00画师分类]', 'trash', 'temp']
const DEFAULT_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z']

/** 上游 samea `:107-124` 逐字。 */
export function normalizeSameaInput(input: SameaInput): Required<SameaInput> {
  return {
    action: input.action ?? 'plan',
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]),
    listText: input.listText ?? '',
    ignorePathBlacklist: input.ignorePathBlacklist ?? false,
    minOccurrences: clampInt(input.minOccurrences, 1, 100, 1),
    centralize: input.centralize ?? false,
    includeDirectories: input.includeDirectories ?? false,
    skipGroupedDirectories: input.skipGroupedDirectories ?? false,
    dryRun: input.dryRun ?? true,
    artistBlacklist: uniqueClean(input.artistBlacklist?.length ? input.artistBlacklist : DEFAULT_ARTIST_BLACKLIST),
    pathBlacklist: uniqueClean(input.pathBlacklist?.length ? input.pathBlacklist : DEFAULT_PATH_BLACKLIST),
    regexBlacklist: uniqueClean(input.regexBlacklist ?? []),
    archiveExtensions: uniqueClean(input.archiveExtensions?.length ? input.archiveExtensions : DEFAULT_ARCHIVE_EXTENSIONS).map((extension) => extension.toLowerCase()),
  }
}

/** 上游 samea `:239-251` 逐字：逐个方括号候选，命中默认名单就换下一个。 */
export function extractArtist(filename: string, input: Pick<Required<SameaInput>, 'artistBlacklist' | 'regexBlacklist'>): ArtistMatch | undefined {
  const brackets = [...filename.matchAll(/\[([^\[\]]+)\]/g)].map((match) => match[1]!.trim()).filter(Boolean)
  for (const candidate of brackets) {
    if (isArtistBlacklisted(candidate, input)) continue
    const groupArtist = candidate.match(/^(.+?)\s*\(([^()]+)\)$/)
    const group = groupArtist?.[1]?.trim() ?? ''
    const artist = groupArtist?.[2]?.trim() ?? candidate
    if (!artist || isArtistBlacklisted(artist, input)) continue
    const label = group ? `[${group} (${artist})]` : `[${artist}]`
    return { key: `${group}\u0000${artist}`.toLowerCase(), label }
  }
  return undefined
}

/** 上游 samea `:274`：包含判定是大小写不敏感的 `includes`，不是全等。 */
function isArtistBlacklisted(value: string, input: Pick<Required<SameaInput>, 'artistBlacklist' | 'regexBlacklist'>): boolean {
  return input.artistBlacklist.some((term) => includesLoose(value, term)) || input.regexBlacklist.some((pattern) => matchesRegex(value, pattern))
}

/** 上游 samea `:274-275` 的两个判据，逐字（空 term 不算命中；坏正则咽掉）。 */
function includesLoose(value: string, term: string): boolean { return Boolean(term) && value.toLocaleLowerCase().includes(term.toLocaleLowerCase()) }
function matchesRegex(value: string, pattern: string): boolean { try { return new RegExp(pattern, 'i').test(value) } catch { return false } }

/** 上游 samea `:276-280` 的四个小工具，逐字（`clean` 会剥掉**两侧引号**）。 */
function parseList(value: unknown): string[] { return String(value ?? '').split(/\r?\n|,/).map(clean).filter(Boolean) }
function uniqueClean(values: Array<string | undefined>): string[] { return [...new Set(values.map(clean).filter(Boolean))] }
function clean(value: unknown): string { return String(value ?? '').trim().replace(/^['"]|['"]$/g, '') }
function clampInt(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback }
