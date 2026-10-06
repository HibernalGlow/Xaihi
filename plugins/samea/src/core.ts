/**
 * samea 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/samea/src/core.ts`
 * （254 行）逐字搬来：类型、默认黑名单、函数顺序、判据、排序比较器全部原样，
 * **一处逻辑都没改**。
 *
 * 唯一的改动是第 1 行那条 import：`@xiranite/contract` 的两个类型换成本包的
 * `./contract.ts` 垫片（理由见那个文件的头注释与 ADR-0002）。台账里这个节点的
 * hostRequirements 是 `recursive-enumeration+file-io`，而**这份文件本身仍然零 I/O**：
 * 触达机器的动作全从 `SameaRuntime` 那 7 个方法注入（上游原本就这么设计），
 * 落地实现在 `src/platform.ts`。
 *
 * 枚举语义（`collectArchives`）随上游保持，接线方与 platform 都不许"顺手改进"：
 * - 只走**目录**：`buildSameaPlan` 对每个根先 `pathInfo`，不是目录就记一条
 *   `root_not_directory`（状态 `error`）而不是静默跳过；
 * - 目录内条目按 `listDir` 返回顺序处理，**这里不排序**（timeu 才在末尾排序，两者不同）；
 * - 条目是目录时：`skipGroupedDirectories` 命中 `[...]` 形态即整条跳过（不再下钻），
 *   `includeDirectories` 为假时**继续下钻但不把目录本身当作品**，为真时把目录本身当作品
 *   并停止下钻；
 * - 条目是符号链接时既不 isFile 也不 isDirectory（判据来自 `platform.ts` 的
 *   `readdir(withFileTypes)` + `Dirent`）⇒ 既不归档也不下钻；
 * - 路径黑名单在**进目录之前**先判整目录（第 172 行 `isPathBlacklisted(directory)` 直接
 *   `return []`），所以 `pathBlacklist: ["[00画师分类]"]` 能让集中输出目录天然不被重扫；
 * - `dryRun`（默认 true）为真时永远只出计划，`movePath` 一次都不发。
 *
 * @module xaihi-samea/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type SameaAction = "plan" | "classify"
export type SameaPlanStatus = "ready" | "ignored" | "skipped" | "conflict" | "moved" | "error"

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
  status: "ready" | "below_threshold" | "blacklisted"
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

export interface SameaRuntime {
  pathInfo: (path: string) => Promise<SameaPathInfo>
  listDir: (path: string) => Promise<SameaDirEntry[]>
  ensureDir: (path: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
}

export type SameaResult = NodeRunResult<SameaData>

const DEFAULT_ARTIST_BLACKLIST = ["pixiv", "twitter", "various", "anthology", "unknown", "trash", "artbook", "汉化", "漫畫", "翻译", "translation"]
const DEFAULT_PATH_BLACKLIST = ["[00画师分类]", "trash", "temp"]
const DEFAULT_ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z"]

export function normalizeSameaInput(input: SameaInput): Required<SameaInput> {
  return {
    action: input.action ?? "plan",
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]),
    listText: input.listText ?? "",
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

export async function runSamea(input: SameaInput, runtime: SameaRuntime, onEvent: (event: NodeRunEvent) => void = () => {}): Promise<SameaResult> {
  const normalized = normalizeSameaInput(input)
  try {
    if (!normalized.paths.length) return failure("At least one archive root directory is required.", normalized)
    onEvent({ type: "progress", progress: 15, message: "Scanning SameA archive roots." })
    const planned = await buildSameaPlan(normalized, runtime)
    if (planned.errorCount) return { success: false, message: planned.errors[0] ?? "SameA could not build a plan.", data: planned }
    if (normalized.action !== "classify" || normalized.dryRun) return success(`SameA planned ${planned.readyCount} archive transfer(s).`, planned)

    onEvent({ type: "progress", progress: 65, message: "Organizing detected artist archives." })
    const applied: SameaPlanItem[] = []
    for (const item of planned.items) {
      if (item.status !== "ready") { applied.push(item); continue }
      try {
        await runtime.ensureDir(runtime.dirname(item.targetPath))
        await runtime.movePath(item.sourcePath, item.targetPath)
        applied.push({ ...item, status: "moved" })
      } catch (error) {
        applied.push({ ...item, status: "error", reason: errorMessage(error) })
      }
    }
    onEvent({ type: "progress", progress: 100, message: "SameA organization completed." })
    const data = summarize(normalized, applied, planned.groups, planned.scannedCount)
    return { success: data.errorCount === 0, message: `SameA organized ${data.movedCount} archive(s).`, data }
  } catch (error) {
    return failure(errorMessage(error), normalized)
  }
}

export async function buildSameaPlan(input: Required<SameaInput>, runtime: SameaRuntime): Promise<SameaData> {
  const entries: Array<{ rootPath: string; entry: SameaDirEntry; artist: ArtistMatch | undefined; ignored?: string }> = []
  for (const root of input.paths) {
    const info = await runtime.pathInfo(root)
    if (!info.exists || !info.isDirectory) {
      entries.push({ rootPath: root, entry: { name: runtime.basename(root), path: root, isFile: false, isDirectory: false }, artist: undefined, ignored: "root_not_directory" })
      continue
    }
    entries.push(...await collectArchives(root, root, input, runtime))
  }

  const counts = new Map<string, number>()
  for (const item of entries) if (item.artist && !item.ignored) counts.set(item.artist.key, (counts.get(item.artist.key) ?? 0) + 1)
  const groups = buildGroups(entries, counts, input, runtime)
  const items: SameaPlanItem[] = []
  for (const item of entries) {
    const sourceName = item.entry.name
    if (item.ignored) {
      items.push({ rootPath: item.rootPath, sourcePath: item.entry.path, targetPath: item.entry.path, sourceName, artistKey: item.artist?.key ?? "", artistName: item.artist?.label ?? "", status: item.ignored === "root_not_directory" ? "error" : "ignored", reason: item.ignored })
      continue
    }
    if (!item.artist) {
      items.push({ rootPath: item.rootPath, sourcePath: item.entry.path, targetPath: item.entry.path, sourceName, artistKey: "", artistName: "", status: "ignored", reason: "artist_not_detected" })
      continue
    }
    const group = groups.find((candidate) => candidate.key === item.artist!.key && candidate.targetDir.startsWith(item.rootPath))
    if (!group || group.status !== "ready") {
      items.push({ rootPath: item.rootPath, sourcePath: item.entry.path, targetPath: item.entry.path, sourceName, artistKey: item.artist.key, artistName: item.artist.label, status: "ignored", reason: group?.status === "blacklisted" ? "artist_blacklisted" : "below_min_occurrences" })
      continue
    }
    const targetPath = runtime.join(group.targetDir, sourceName)
    if (normalizePath(targetPath) === normalizePath(item.entry.path)) {
      items.push({ rootPath: item.rootPath, sourcePath: item.entry.path, targetPath, sourceName, artistKey: item.artist.key, artistName: item.artist.label, status: "skipped", reason: "same_path" })
      continue
    }
    const target = await runtime.pathInfo(targetPath)
    items.push({ rootPath: item.rootPath, sourcePath: item.entry.path, targetPath, sourceName, artistKey: item.artist.key, artistName: item.artist.label, status: target.exists ? "conflict" : "ready", ...(target.exists ? { reason: "target_exists" } : {}) })
  }
  return summarize(input, items, groups, entries.filter((entry) => !entry.ignored || entry.ignored !== "root_not_directory").length)
}

interface ArtistMatch { key: string; label: string }

async function collectArchives(root: string, directory: string, input: Required<SameaInput>, runtime: SameaRuntime): Promise<Array<{ rootPath: string; entry: SameaDirEntry; artist: ArtistMatch | undefined; ignored?: string }>> {
  if (!input.ignorePathBlacklist && isPathBlacklisted(directory, input)) return []
  const collected: Array<{ rootPath: string; entry: SameaDirEntry; artist: ArtistMatch | undefined; ignored?: string }> = []
  for (const entry of await runtime.listDir(directory)) {
    if (entry.isDirectory) {
      if (input.skipGroupedDirectories && isArtistGroupDirectory(entry.name)) continue
      if (input.includeDirectories) {
        if (!input.ignorePathBlacklist && isPathBlacklisted(entry.path, input)) {
          collected.push({ rootPath: root, entry, artist: undefined, ignored: "path_blacklisted" })
          continue
        }
        const artist = extractArtist(entry.name, input)
        collected.push({ rootPath: root, entry, artist, ...(artist && isArtistBlacklisted(artist.label, input) ? { ignored: "artist_blacklisted" } : {}) })
        continue
      }
      collected.push(...await collectArchives(root, entry.path, input, runtime))
      continue
    }
    if (!entry.isFile || !isArchive(entry.name, input.archiveExtensions)) continue
    if (!input.ignorePathBlacklist && isPathBlacklisted(entry.path, input)) {
      collected.push({ rootPath: root, entry, artist: undefined, ignored: "path_blacklisted" })
      continue
    }
    const artist = extractArtist(entry.name, input)
    collected.push({ rootPath: root, entry, artist, ...(artist && isArtistBlacklisted(artist.label, input) ? { ignored: "artist_blacklisted" } : {}) })
  }
  return collected
}

function buildGroups(entries: Array<{ rootPath: string; artist: ArtistMatch | undefined; ignored?: string }>, counts: Map<string, number>, input: Required<SameaInput>, runtime: SameaRuntime): SameaArtistGroup[] {
  const groups = new Map<string, SameaArtistGroup>()
  for (const entry of entries) {
    if (!entry.artist || groups.has(`${entry.rootPath}\u0000${entry.artist.key}`)) continue
    const count = counts.get(entry.artist.key) ?? 0
    const base = input.centralize ? runtime.join(entry.rootPath, "[00画师分类]") : entry.rootPath
    const status: SameaArtistGroup["status"] = entry.ignored === "artist_blacklisted" ? "blacklisted" : count >= input.minOccurrences ? "ready" : "below_threshold"
    groups.set(`${entry.rootPath}\u0000${entry.artist.key}`, { key: entry.artist.key, name: entry.artist.label, targetDir: runtime.join(base, entry.artist.label), count, status })
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
}

export function extractArtist(filename: string, input: Pick<Required<SameaInput>, "artistBlacklist" | "regexBlacklist">): ArtistMatch | undefined {
  const brackets = [...filename.matchAll(/\[([^\[\]]+)\]/g)].map((match) => match[1]!.trim()).filter(Boolean)
  for (const candidate of brackets) {
    if (isArtistBlacklisted(candidate, input)) continue
    const groupArtist = candidate.match(/^(.+?)\s*\(([^()]+)\)$/)
    const group = groupArtist?.[1]?.trim() ?? ""
    const artist = groupArtist?.[2]?.trim() ?? candidate
    if (!artist || isArtistBlacklisted(artist, input)) continue
    const label = group ? `[${group} (${artist})]` : `[${artist}]`
    return { key: `${group}\u0000${artist}`.toLowerCase(), label }
  }
  return undefined
}

function summarize(input: Required<SameaInput>, items: SameaPlanItem[], groups: SameaArtistGroup[], scannedCount: number): SameaData {
  const errors = items.filter((item) => item.status === "error" || item.status === "conflict").map((item) => `${item.sourcePath}: ${item.reason ?? item.status}`)
  return {
    action: input.action, centralize: input.centralize, minOccurrences: input.minOccurrences, items, groups, scannedCount,
    detectedCount: items.filter((item) => item.artistKey).length,
    readyCount: items.filter((item) => item.status === "ready").length,
    movedCount: items.filter((item) => item.status === "moved").length,
    ignoredCount: items.filter((item) => item.status === "ignored").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    conflictCount: items.filter((item) => item.status === "conflict").length,
    errorCount: items.filter((item) => item.status === "error").length,
    errors,
  }
}

function success(message: string, data: SameaData): SameaResult { return { success: true, message, data } }
function failure(message: string, input: Required<SameaInput>): SameaResult { return { success: false, message, data: summarize(input, [{ rootPath: "", sourcePath: "", targetPath: "", sourceName: "", artistKey: "", artistName: "", status: "error", reason: message }], [], 0) } }
function isArchive(name: string, extensions: string[]): boolean { return extensions.some((extension) => name.toLowerCase().endsWith(extension)) }
function isArtistGroupDirectory(name: string): boolean { return /^\[[^\[\]]+\]$/.test(name.trim()) }
function isPathBlacklisted(path: string, input: Pick<Required<SameaInput>, "pathBlacklist" | "regexBlacklist">): boolean { return input.pathBlacklist.some((term) => includesLoose(path, term)) || input.regexBlacklist.some((pattern) => matchesRegex(path, pattern)) }
function isArtistBlacklisted(value: string, input: Pick<Required<SameaInput>, "artistBlacklist" | "regexBlacklist">): boolean { return input.artistBlacklist.some((term) => includesLoose(value, term)) || input.regexBlacklist.some((pattern) => matchesRegex(value, pattern)) }
function includesLoose(value: string, term: string): boolean { return Boolean(term) && value.toLocaleLowerCase().includes(term.toLocaleLowerCase()) }
function matchesRegex(value: string, pattern: string): boolean { try { return new RegExp(pattern, "i").test(value) } catch { return false } }
function parseList(value: unknown): string[] { return String(value ?? "").split(/\r?\n|,/).map(clean).filter(Boolean) }
function uniqueClean(values: Array<string | undefined>): string[] { return [...new Set(values.map(clean).filter(Boolean))] }
function clean(value: unknown): string { return String(value ?? "").trim().replace(/^['"]|['"]$/g, "") }
function normalizePath(path: string): string { return path.replace(/\\/g, "/").toLowerCase() }
function clampInt(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
