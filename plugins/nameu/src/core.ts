/**
 * nameu 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/nameu/src/core.ts`
 * （356 行）逐字搬来：类型、三条默认名单、函数顺序、判据与截断长度全部原样，
 * **一处逻辑都没改**（唯一的差异是第 1 行的 import 说明符，`diff` 对着上游复核过）。
 *
 * 那条 import 换成本包的 `./contract.ts` 垫片：`@xiranite/*` 在本仓是 `workspace:*`，
 * 一写进依赖全仓 pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释、ADR-0002）。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io`，而**这份文件本身零 I/O**：触达机器的
 * 动作全从 `NameuRuntime` 那 7 个方法注入（上游原本就这么设计），落地实现在
 * `src/platform.ts`（继续用 `node:fs`，判据与 `docs/adr/0003-migrated-node-file-state.md`
 * 决定 1 是同一条）。枚举语义逐条随上游保持，接线方与 platform 都不许"顺手改进"：
 * - `multi` 先取根目录的**直接子目录**当画师目录；一个都没有时把根自己当画师目录
 *   （上游 `core.ts:150-158`）——这条兜底不是 bug，是"单画师目录直接传进来"的通路；
 * - `skipped` 是**状态**不是错误：根不存在或不是目录记 `path_not_directory`（`:141`），
 *   命中排除词记 `excluded_path`（`:170`），两者都不进 `errorCount`，所以 `success` 仍为真；
 * - `reserved` 按 `listDir` 的返回顺序累积，同目录内后来的同名目标判
 *   `target_name_exists`（大小写不敏感，`:178` + `:215`）；
 * - 真改名时用**改名之前**读到的 `atimeMs/mtimeMs` 回写时间戳（`:121-123`）；
 * - `truncateSmart` 的 80 只截主名，扩展名在截完之后才拼回去（`:231`）。
 *
 * @module xaihi-nameu/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"
export type NameuAction = "scan" | "plan" | "rename"
export type NameuMode = "multi" | "single"
export type NameuPlanStatus = "ready" | "unchanged" | "skipped" | "renamed" | "conflict" | "error"

export interface NameuInput {
  action?: NameuAction
  path?: string
  paths?: string[]
  listText?: string
  mode?: NameuMode
  recursive?: boolean
  addArtistName?: boolean
  normalizeFolders?: boolean
  keepTimestamp?: boolean
  dryRun?: boolean
  excludeKeywords?: string[]
  forbiddenArtistKeywords?: string[]
  archiveExtensions?: string[]
}

export interface NameuDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface NameuPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  atimeMs: number
  mtimeMs: number
}

export interface NameuPlanItem {
  sourcePath: string
  targetPath: string
  sourceName: string
  targetName: string
  artistName: string
  kind: "archive" | "folder"
  status: NameuPlanStatus
  reason?: string
}

export interface NameuData {
  action: NameuAction
  mode: NameuMode
  items: NameuPlanItem[]
  scannedCount: number
  readyCount: number
  renamedCount: number
  unchangedCount: number
  skippedCount: number
  conflictCount: number
  errorCount: number
  errors: string[]
}

export interface NameuRuntime {
  pathInfo: (path: string) => Promise<NameuPathInfo>
  listDir: (path: string) => Promise<NameuDirEntry[]>
  rename: (from: string, to: string) => Promise<void>
  setTimes: (path: string, atimeMs: number, mtimeMs: number) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
}

export type NameuResult = NodeRunResult<NameuData>

const DEFAULT_ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".cbz", ".cbr"] as const
const DEFAULT_EXCLUDE_KEYWORDS = ["[00待分类]", "[00去图]", "[01来]"] as const
const DEFAULT_FORBIDDEN_ARTIST_KEYWORDS = ["[bili]", "[weibo]", "[02来]"] as const

export function normalizeNameuInput(input: NameuInput): Required<NameuInput> {
  return {
    action: input.action ?? "plan",
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]),
    listText: input.listText ?? "",
    mode: input.mode ?? "multi",
    recursive: input.recursive ?? true,
    addArtistName: input.addArtistName ?? true,
    normalizeFolders: input.normalizeFolders ?? true,
    keepTimestamp: input.keepTimestamp ?? true,
    dryRun: input.dryRun ?? true,
    excludeKeywords: input.excludeKeywords?.length ? input.excludeKeywords : [...DEFAULT_EXCLUDE_KEYWORDS],
    forbiddenArtistKeywords: input.forbiddenArtistKeywords?.length ? input.forbiddenArtistKeywords : [...DEFAULT_FORBIDDEN_ARTIST_KEYWORDS],
    archiveExtensions: input.archiveExtensions?.length ? input.archiveExtensions.map((ext) => ext.toLowerCase()) : [...DEFAULT_ARCHIVE_EXTENSIONS],
  }
}

export async function runNameu(
  input: NameuInput,
  runtime: NameuRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<NameuResult> {
  const normalized = normalizeNameuInput(input)
  try {
    if (!normalized.paths.length) return failure("At least one artist folder or library root is required.", normalized)
    onEvent({ type: "progress", progress: 15, message: "Scanning NameU folders." })

    const plan = await buildNameuPlan(normalized, runtime)
    if (normalized.action !== "rename" || normalized.dryRun) {
      return success(`NameU planned ${plan.length} item(s).`, data(normalized, plan))
    }

    onEvent({ type: "progress", progress: 65, message: "Renaming planned items." })
    const applied: NameuPlanItem[] = []
    for (const item of plan) {
      if (item.status !== "ready") {
        applied.push(item)
        continue
      }
      try {
        const info = await runtime.pathInfo(item.sourcePath)
        await runtime.rename(item.sourcePath, item.targetPath)
        if (normalized.keepTimestamp) await runtime.setTimes(item.targetPath, info.atimeMs, info.mtimeMs)
        applied.push({ ...item, status: "renamed" })
      } catch (error) {
        applied.push({ ...item, status: "error", reason: errorMessage(error) })
      }
    }

    return success(`NameU renamed ${applied.filter((item) => item.status === "renamed").length} item(s).`, data(normalized, applied))
  } catch (error) {
    return failure(errorMessage(error), normalized)
  }
}

export async function buildNameuPlan(input: Required<NameuInput>, runtime: NameuRuntime): Promise<NameuPlanItem[]> {
  const items: NameuPlanItem[] = []
  for (const root of input.paths) {
    const info = await runtime.pathInfo(root)
    if (!info.exists || !info.isDirectory) {
      items.push(skipped(root, runtime.basename(root), runtime.dirname(root), "path_not_directory"))
      continue
    }

    if (input.mode === "single") {
      items.push(...await collectArtistFolder(root, runtime.basename(root), input, runtime))
      continue
    }

    const children = await runtime.listDir(root)
    const artistFolders = children.filter((entry) => entry.isDirectory && !isExcludedPath(entry.path, input.excludeKeywords))
    if (!artistFolders.length) {
      items.push(...await collectArtistFolder(root, runtime.basename(root), input, runtime))
      continue
    }
    for (const folder of artistFolders) {
      items.push(...await collectArtistFolder(folder.path, folder.name, input, runtime))
    }
  }
  return items
}

async function collectArtistFolder(
  artistPath: string,
  artistName: string,
  input: Required<NameuInput>,
  runtime: NameuRuntime,
): Promise<NameuPlanItem[]> {
  if (isExcludedPath(artistPath, input.excludeKeywords)) {
    return [skipped(artistPath, runtime.basename(artistPath), runtime.dirname(artistPath), "excluded_path")]
  }

  const items: NameuPlanItem[] = []
  const queue = [artistPath]
  for (let index = 0; index < queue.length; index += 1) {
    const directory = queue[index]!
    const entries = await runtime.listDir(directory)
    const reserved = new Set(entries.map((entry) => entry.name.toLowerCase()))

    for (const entry of entries) {
      if (entry.isDirectory) {
        if (input.normalizeFolders && !isExcludedPath(entry.path, input.excludeKeywords)) {
          const folderTarget = normalizeFolderName(entry.name)
          if (folderTarget !== entry.name) {
            items.push(await planTarget(entry, folderTarget, artistName, "folder", reserved, runtime))
            reserved.add(folderTarget.toLowerCase())
          }
        }
        if (input.recursive && !isExcludedPath(entry.path, input.excludeKeywords)) queue.push(entry.path)
        continue
      }

      if (!entry.isFile || !isArchive(entry.name, input.archiveExtensions)) continue
      const targetName = normalizeArchiveName(entry.name, artistName, input)
      items.push(await planTarget(entry, targetName, artistName, "archive", reserved, runtime))
      reserved.add(targetName.toLowerCase())
    }
  }
  return items
}

async function planTarget(
  entry: NameuDirEntry,
  targetName: string,
  artistName: string,
  kind: "archive" | "folder",
  reserved: Set<string>,
  runtime: NameuRuntime,
): Promise<NameuPlanItem> {
  const sourceName = entry.name
  const targetPath = runtime.join(runtime.dirname(entry.path), targetName)
  if (targetName === sourceName) {
    return { sourcePath: entry.path, targetPath: entry.path, sourceName, targetName, artistName, kind, status: "unchanged" }
  }
  if (reserved.has(targetName.toLowerCase())) {
    return { sourcePath: entry.path, targetPath, sourceName, targetName, artistName, kind, status: "conflict", reason: "target_name_exists" }
  }
  const targetInfo = await runtime.pathInfo(targetPath)
  if (targetInfo.exists) {
    return { sourcePath: entry.path, targetPath, sourceName, targetName, artistName, kind, status: "conflict", reason: "target_path_exists" }
  }
  return { sourcePath: entry.path, targetPath, sourceName, targetName, artistName, kind, status: "ready" }
}

export function normalizeArchiveName(filename: string, artistName: string, input: Pick<Required<NameuInput>, "addArtistName" | "excludeKeywords" | "forbiddenArtistKeywords">): string {
  const { base, ext } = splitExt(filename)
  let next = cleanupName(base)
  const forbidden = input.forbiddenArtistKeywords.some((keyword) => includesLoose(next, keyword) || includesLoose(artistName, keyword))
  const excluded = input.excludeKeywords.some((keyword) => includesLoose(next, keyword) || includesLoose(artistName, keyword))
  if (input.addArtistName && !forbidden && !excluded && !hasArtistName(next, artistName)) next = `${next}${artistName}`
  return `${truncateSmart(next, 80)}${ext}`
}

export function normalizeFolderName(name: string): string {
  return cleanupName(name)
}

function cleanupName(value: string): string {
  let next = value.normalize("NFKC")
  const replacements: Array<[RegExp, string]> = [
    [/[【［]/g, "["],
    [/[】］]/g, "]"],
    [/[（]/g, "("],
    [/[）]/g, ")"],
    [/[｛]/g, "{"],
    [/[｝]/g, "}"],
    [/\{(?:\d+(?:\.\d+)?[kKwW]?@(?:PX|WD)|\d+%?@DE|\d+(?:w|p|px|de))\}/gi, ""],
    [/\[(?:cbr|multi|trash|multi-main)\]/gi, ""],
    [/\[samename_\d+\]/gi, ""],
    [/\s\(\d+\)$/g, ""],
    [/\{\s*[^{}]*\s*\}/g, ""],
    [/\(\s*\)\s*/g, " "],
    [/\[\s*\]\s*/g, " "],
    [/\s{2,}/g, " "],
  ]
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement)
  next = removeDuplicateBracketContent(next)
  next = next.replace(/Digital/g, "DL").replace(/PIXIV FANBOX/gi, "FANBOX")
  return spaceText(next).trim()
}

function removeDuplicateBracketContent(value: string): string {
  const seen = new Set<string>()
  return value.replace(/\[([^[\]]+)\]/g, (match, content: string) => {
    const key = content.replace(/\s+/g, "").toLowerCase()
    if (seen.has(key)) return ""
    seen.add(key)
    return match
  })
}

function spaceText(value: string): string {
  return value
    .replace(/([\p{Script=Han}])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/([A-Za-z0-9])([\p{Script=Han}])/gu, "$1 $2")
    .replace(/\s{2,}/g, " ")
}

function hasArtistName(name: string, artistName: string): boolean {
  const artist = artistName.replace(/\s+/g, "").toLowerCase()
  const filename = name.replace(/\s+/g, "").toLowerCase()
  return Boolean(artist) && filename.includes(artist)
}

function isArchive(name: string, archiveExtensions: readonly string[]): boolean {
  const lower = name.toLowerCase()
  return archiveExtensions.some((ext) => lower.endsWith(ext.toLowerCase()))
}

function isExcludedPath(path: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => keyword && path.toLowerCase().includes(keyword.toLowerCase()))
}

function splitExt(filename: string): { base: string; ext: string } {
  const index = filename.lastIndexOf(".")
  if (index <= 0) return { base: filename, ext: "" }
  return { base: filename.slice(0, index), ext: filename.slice(index) }
}

function truncateSmart(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return value.slice(0, maxLength).trimEnd()
}

function data(input: Required<NameuInput>, items: NameuPlanItem[]): NameuData {
  const errors = items.filter((item) => item.reason && (item.status === "error" || item.status === "conflict")).map((item) => `${item.sourcePath}: ${item.reason}`)
  return {
    action: input.action,
    mode: input.mode,
    items,
    scannedCount: items.length,
    readyCount: items.filter((item) => item.status === "ready").length,
    renamedCount: items.filter((item) => item.status === "renamed").length,
    unchangedCount: items.filter((item) => item.status === "unchanged").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    conflictCount: items.filter((item) => item.status === "conflict").length,
    errorCount: items.filter((item) => item.status === "error").length,
    errors,
  }
}

function success(message: string, data: NameuData): NameuResult {
  return { success: data.errorCount === 0, message, data }
}

function failure(message: string, input: Required<NameuInput>): NameuResult {
  return {
    success: false,
    message,
    data: data(input, [{ sourcePath: "", targetPath: "", sourceName: "", targetName: "", artistName: "", kind: "archive", status: "error", reason: message }]),
  }
}

function skipped(path: string, name: string, directory: string, reason: string): NameuPlanItem {
  return { sourcePath: path, targetPath: path, sourceName: name, targetName: name, artistName: directory, kind: "folder", status: "skipped", reason }
}

function includesLoose(value: string, keyword: string): boolean {
  return Boolean(keyword) && value.replace(/\s+/g, "").toLowerCase().includes(keyword.replace(/\s+/g, "").toLowerCase())
}

function parseList(value: unknown): string[] {
  return String(value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function uniqueClean(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean) as string[])]
}

function clean(value: unknown): string {
  return String(value ?? "").trim()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
