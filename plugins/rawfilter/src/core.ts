/**
 * rawfilter 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/rawfilter/src/core.ts`
 * （503 行）逐字搬来：类型、四组标记词表、打分与排序比较器、目标名冲突的后缀规则
 * 全部原样，**一处逻辑都没改**（唯一的差异是第 1 行的 import 说明符）。
 *
 * 那条 import 换成本包的 `./contract.ts` 垫片：`@xiranite/*` 在本仓是 `workspace:*`，
 * 一写进依赖全仓 pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释、ADR-0002）。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io`，而**这份文件本身零 I/O**：触达机器的
 * 动作全从 `RawfilterRuntime` 那 8 个方法注入，落地实现在 `src/platform.ts`
 * （继续用 `node:fs`，判据同 `docs/adr/0003-migrated-node-file-state.md` 决定 1）。
 *
 * 会被"顺手优化"改掉、所以在这里点名的几条上游语义（行号指上游那份文件）：
 * - 输入同时吃 camelCase 与 snake_case（`:8-20`），camelCase 优先（`:160-163`）；
 * - 内核默认 `action = "execute"`、`dryRun = false`（`:158-164`），而
 *   `node-definitions/rawfilter.json` 给 `dryRun` 声明的默认是 **true**。两份都是真源，
 *   都不许统一：界面上默认预演、内核里默认执行，这一格落差由清单的默认值 + 危险闸门兜住。
 * - `scan` 与 `plan` 都在 `:189` 提前返回，只有 `execute` 且 `dryRun` 为假才动文件；
 * - 归档扩展名表**含复合后缀** `.tar.gz` / `.tar.bz2` / `.tar.xz`，`stripArchiveExtension`
 *   先按长度降序找（`:465`），找不到才退化成"去掉最后一个点之后"（`:466`）；
 * - 分组两种模式：`nameOnlyMode` 按 `groupKey` 精确匹配，否则用 Dice 系数
 *   `2*shared/(|a|+|b|)`（`:310-318`）对 `minSimilarity` 取**最高分**那组（`:407-414`）；
 * - 组内保留者 = `compareArchive` 的第一条：分数降序、同分按名字 `numeric` 升序（`:356-358`）；
 * - 去向判定五条分支各有 reason 串（`:360-372`），`trash`/`multi` 的目录名是字面量
 *   `trash` 与 `multi/<sanitize 后的组名>`（`:381`），快捷方式改的是 `.url` 后缀（`:382`）；
 * - 目标已存在时后缀是 `" (2)"` 起递增，且插在**扩展名之前**（`:490-494`）。
 *
 * 除 import 之外只碰过**类型层**的两处：`:361` 与 `:384` 各加了一个非空断言 `!`，
 * 因为本仓 `tsconfig.base.json` 开了 `noUncheckedIndexedAccess`，而上游那份没开。
 * 两处都由循环界/调用侧保证成立，`!` 在编译期被抹掉 ⇒ 产物与上游同源，运行时零差异。
 *
 * @module xaihi-rawfilter/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type RawfilterAction = "plan" | "execute" | "scan"
export type RawfilterDestination = "keep" | "trash" | "multi" | "shortcut"
export type RawfilterVariant = "translated" | "raw" | "unknown"
export type RawfilterPlanStatus = "kept" | "pending" | "skipped" | "success" | "error"

export interface RawfilterInput {
  action?: RawfilterAction
  path?: string
  nameOnlyMode?: boolean
  name_only_mode?: boolean
  createShortcuts?: boolean
  create_shortcuts?: boolean
  trashOnly?: boolean
  trash_only?: boolean
  minSimilarity?: number
  min_similarity?: number
  dryRun?: boolean
}

export interface RawfilterPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export interface RawfilterDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface RawfilterArchive {
  name: string
  path: string
  normalizedName: string
  groupKey: string
  variant: RawfilterVariant
  score: number
}

export interface RawfilterGroup {
  key: string
  label: string
  files: RawfilterArchive[]
}

export interface RawfilterPlanItem {
  groupKey: string
  groupLabel: string
  fileName: string
  sourcePath: string
  targetPath: string
  destination: RawfilterDestination
  status: RawfilterPlanStatus
  variant: RawfilterVariant
  reason: string
}

export interface RawfilterData {
  archiveCount: number
  totalGroups: number
  duplicateGroups: number
  skippedFiles: number
  movedToTrash: number
  movedToMulti: number
  createdShortcuts: number
  keptCount: number
  errorCount: number
  plan: RawfilterPlanItem[]
  groups: RawfilterGroup[]
  errors: string[]
}

export interface RawfilterRuntime {
  pathInfo: (path: string) => Promise<RawfilterPathInfo>
  listDir: (path: string) => Promise<RawfilterDirEntry[]>
  ensureDir: (path: string) => Promise<void>
  moveFile: (source: string, target: string) => Promise<void>
  createShortcut: (source: string, target: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
}

export type RawfilterResult = NodeRunResult<RawfilterData>

export const ARCHIVE_EXTENSIONS = [
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tbz2",
  ".tar.xz",
  ".txz",
  ".cbz",
  ".cbr",
  ".001",
]

const TRANSLATED_MARKERS = [
  "chinese",
  "cn",
  "zh",
  "translated",
  "translation",
  "eng",
  "english",
  "\u6c49\u5316",
  "\u6f22\u5316",
  "\u4e2d\u6587",
  "\u7b80\u4e2d",
  "\u7e41\u4e2d",
  "\u7ffb\u8bd1",
  "\u7ffb\u8b6f",
]

const RAW_MARKERS = [
  "raw",
  "original",
  "japanese",
  "jp",
  "\u65e5\u672c\u8a9e",
  "\u65e5\u6587",
  "\u539f\u7248",
  "\u751f\u8089",
]

const QUALITY_MARKERS = [
  "complete",
  "final",
  "fixed",
  "revised",
  "digital",
  "dlsite",
  "\u5b8c\u6574",
  "\u4fee\u6b63",
  "\u9ad8\u6e05",
]

const LOW_QUALITY_MARKERS = [
  "sample",
  "trial",
  "demo",
  "preview",
  "\u4f53\u9a8c",
  "\u8bd5\u7528",
]

export function normalizeRawfilterInput(input: RawfilterInput): Required<Omit<RawfilterInput, "name_only_mode" | "create_shortcuts" | "trash_only" | "min_similarity">> {
  return {
    action: input.action ?? "execute",
    path: clean(input.path),
    nameOnlyMode: input.nameOnlyMode ?? input.name_only_mode ?? false,
    createShortcuts: input.createShortcuts ?? input.create_shortcuts ?? false,
    trashOnly: input.trashOnly ?? input.trash_only ?? false,
    minSimilarity: clampSimilarity(input.minSimilarity ?? input.min_similarity ?? 0.82),
    dryRun: input.dryRun ?? false,
  }
}

export async function runRawfilter(
  input: RawfilterInput,
  runtime: RawfilterRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<RawfilterResult> {
  const normalized = normalizeRawfilterInput(input)
  try {
    if (!normalized.path) return failure("Path is required.")
    const info = await runtime.pathInfo(normalized.path)
    if (!info.exists) return failure(`Path does not exist: ${normalized.path}`)
    if (!info.isDirectory) return failure(`Path is not a directory: ${normalized.path}`)

    onEvent({ type: "progress", progress: 10, message: "Scanning archive files." })
    const groups = await groupArchivesInDir(normalized.path, runtime, normalized)
    const archiveCount = groups.reduce((sum, group) => sum + group.files.length, 0)
    if (!archiveCount) {
      return success("No archive files found.", data({ groups, totalGroups: groups.length }))
    }

    onEvent({ type: "progress", progress: 35, message: `Grouped ${archiveCount} archive file(s).` })
    const plan = await buildRawfilterPlan(groups, normalized.path, normalized, runtime)
    if (normalized.action === "scan" || normalized.action === "plan" || normalized.dryRun) {
      return success(`Plan generated: ${pending(plan).length} operation(s).`, summarize(plan, groups, archiveCount))
    }

    return await executeRawfilterPlan(plan, groups, archiveCount, runtime, onEvent)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function groupArchivesInDir(
  path: string,
  runtime: RawfilterRuntime,
  input: Pick<ReturnType<typeof normalizeRawfilterInput>, "nameOnlyMode" | "minSimilarity">,
): Promise<RawfilterGroup[]> {
  const entries = await runtime.listDir(path)
  const archives = entries
    .filter((entry) => entry.isFile && isArchiveFile(entry.name))
    .map((entry) => createArchive(entry.name, entry.path))
    .sort(compareArchive)

  const groups: RawfilterGroup[] = []
  for (const archive of archives) {
    const match = input.nameOnlyMode ? groups.find((group) => group.key === archive.groupKey) : findBestGroup(archive, groups, input.minSimilarity)
    if (match) match.files.push(archive)
    else groups.push({ key: archive.groupKey, label: archive.normalizedName || archive.name, files: [archive] })
  }

  return groups
    .map((group) => ({ ...group, files: [...group.files].sort(compareArchive) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }))
}

export async function buildRawfilterPlan(
  groups: RawfilterGroup[],
  rootPath: string,
  input: Pick<ReturnType<typeof normalizeRawfilterInput>, "trashOnly" | "createShortcuts">,
  runtime: RawfilterRuntime,
): Promise<RawfilterPlanItem[]> {
  const plan: RawfilterPlanItem[] = []
  for (const group of groups) {
    if (group.files.length <= 1) {
      const [file] = group.files
      if (file) plan.push(keptItem(group, file, "single_file_group"))
      continue
    }

    const keep = chooseKeeper(group.files)
    for (const file of group.files) {
      if (file === keep) {
        plan.push(keptItem(group, file, "preferred_version"))
        continue
      }

      const decision = decideDestination(file, keep, input)
      const targetPath = await uniqueTargetPath(rootPath, group, file.name, decision.destination, runtime)
      plan.push({
        groupKey: group.key,
        groupLabel: group.label,
        fileName: file.name,
        sourcePath: file.path,
        targetPath,
        destination: decision.destination,
        status: "pending",
        variant: file.variant,
        reason: decision.reason,
      })
    }
  }
  return plan
}

export function createArchive(name: string, path = name): RawfilterArchive {
  const normalizedName = normalizeArchiveName(name)
  return {
    name,
    path,
    normalizedName,
    groupKey: normalizedName.replace(/\s+/g, ""),
    variant: classifyVariant(name),
    score: scoreArchiveName(name),
  }
}

export function isArchiveFile(name: string): boolean {
  const lower = name.toLowerCase()
  return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function normalizeArchiveName(name: string): string {
  const stem = stripArchiveExtension(name)
  return stem
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|【[^】]*】|（[^）]*）/g, (token) => {
      const inner = token.slice(1, -1)
      return hasAnyMarker(inner, [...TRANSLATED_MARKERS, ...RAW_MARKERS, ...QUALITY_MARKERS, ...LOW_QUALITY_MARKERS]) ? " " : ` ${inner} `
    })
    .replace(markerRegex([...TRANSLATED_MARKERS, ...RAW_MARKERS, ...QUALITY_MARKERS, ...LOW_QUALITY_MARKERS]), " ")
    .replace(/\b(v?\d+(?:\.\d+)?|vol(?:ume)?\s*\d+)\b/g, " $1 ")
    .replace(/[_\-+.~]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function classifyVariant(name: string): RawfilterVariant {
  if (hasAnyMarker(name, TRANSLATED_MARKERS)) return "translated"
  if (hasAnyMarker(name, RAW_MARKERS)) return "raw"
  return "unknown"
}

export function scoreArchiveName(name: string): number {
  const variant = classifyVariant(name)
  let score = variant === "translated" ? 100 : variant === "unknown" ? 50 : 10
  if (hasAnyMarker(name, QUALITY_MARKERS)) score += 12
  if (hasAnyMarker(name, LOW_QUALITY_MARKERS)) score -= 20
  score += Math.min(stripArchiveExtension(name).length, 80) / 100
  return score
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))
  if (!aTokens.size || !bTokens.size) return 0
  let shared = 0
  for (const token of aTokens) if (bTokens.has(token)) shared += 1
  return (2 * shared) / (aTokens.size + bTokens.size)
}

async function executeRawfilterPlan(
  plan: RawfilterPlanItem[],
  groups: RawfilterGroup[],
  archiveCount: number,
  runtime: RawfilterRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<RawfilterResult> {
  const operations = pending(plan)
  const completed: RawfilterPlanItem[] = []
  for (let index = 0; index < operations.length; index += 1) {
    // 见文件头"两处非空断言"：循环界已经保证 index < length，运行时与上游完全一致。
    const item = operations[index]!
    onEvent({ type: "progress", progress: 40 + Math.round((index / Math.max(operations.length, 1)) * 55), message: item.fileName })
    try {
      await runtime.ensureDir(runtime.dirname(item.targetPath))
      if (item.destination === "shortcut") await runtime.createShortcut(item.sourcePath, item.targetPath)
      else await runtime.moveFile(item.sourcePath, item.targetPath)
      completed.push({ ...item, status: "success" })
    } catch (error) {
      completed.push({ ...item, status: "error", reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const merged = plan.map((item) => completed.find((done) => done.sourcePath === item.sourcePath && done.targetPath === item.targetPath) ?? item)
  onEvent({ type: "progress", progress: 100, message: "Rawfilter completed." })
  const summary = summarize(merged, groups, archiveCount)
  return {
    success: summary.errorCount === 0,
    message: `Rawfilter completed: ${summary.movedToTrash} trash, ${summary.movedToMulti} multi, ${summary.createdShortcuts} shortcut(s), ${summary.errorCount} error(s).`,
    data: summary,
  }
}

function chooseKeeper(files: RawfilterArchive[]): RawfilterArchive {
  // 同上：只有空数组才会取到 undefined，而调用侧（`:236` 那半边）已经保证 files 非空。
  return [...files].sort(compareArchive)[0]!
}

function compareArchive(a: RawfilterArchive, b: RawfilterArchive): number {
  return b.score - a.score || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
}

function decideDestination(
  file: RawfilterArchive,
  keep: RawfilterArchive,
  input: Pick<ReturnType<typeof normalizeRawfilterInput>, "trashOnly" | "createShortcuts">,
): { destination: RawfilterDestination; reason: string } {
  if (input.trashOnly) return { destination: "trash", reason: "trash_only" }
  if (file.variant === "translated" && keep.variant === "translated") {
    return { destination: input.createShortcuts ? "shortcut" : "multi", reason: "extra_translated_version" }
  }
  if (file.variant === "raw" && keep.variant === "translated") return { destination: "trash", reason: "raw_version_replaced" }
  if (file.variant === "unknown" && keep.variant === "translated") return { destination: "trash", reason: "untranslated_duplicate" }
  return { destination: "trash", reason: "duplicate" }
}

async function uniqueTargetPath(
  rootPath: string,
  group: RawfilterGroup,
  fileName: string,
  destination: RawfilterDestination,
  runtime: RawfilterRuntime,
): Promise<string> {
  const folder = destination === "trash" ? runtime.join(rootPath, "trash") : runtime.join(rootPath, "multi", sanitizePathSegment(group.label))
  const targetFileName = destination === "shortcut" ? `${stripArchiveExtension(fileName)}.url` : fileName
  let target = runtime.join(folder, targetFileName)
  let suffix = 2
  while ((await runtime.pathInfo(target)).exists) {
    const nextName = appendSuffix(targetFileName, suffix)
    target = runtime.join(folder, nextName)
    suffix += 1
  }
  return target
}

function keptItem(group: RawfilterGroup, file: RawfilterArchive, reason: string): RawfilterPlanItem {
  return {
    groupKey: group.key,
    groupLabel: group.label,
    fileName: file.name,
    sourcePath: file.path,
    targetPath: "",
    destination: "keep",
    status: "kept",
    variant: file.variant,
    reason,
  }
}

function findBestGroup(archive: RawfilterArchive, groups: RawfilterGroup[], minSimilarity: number): RawfilterGroup | undefined {
  let best: { group: RawfilterGroup; score: number } | undefined
  for (const group of groups) {
    const score = similarity(archive.normalizedName, group.label)
    if (score >= minSimilarity && (!best || score > best.score)) best = { group, score }
  }
  return best?.group
}

function summarize(plan: RawfilterPlanItem[], groups: RawfilterGroup[], archiveCount: number): RawfilterData {
  return data({
    archiveCount,
    totalGroups: groups.length,
    duplicateGroups: groups.filter((group) => group.files.length > 1).length,
    skippedFiles: plan.filter((item) => item.status === "skipped").length,
    keptCount: plan.filter((item) => item.status === "kept").length,
    movedToTrash: plan.filter((item) => item.status === "success" && item.destination === "trash").length,
    movedToMulti: plan.filter((item) => item.status === "success" && item.destination === "multi").length,
    createdShortcuts: plan.filter((item) => item.status === "success" && item.destination === "shortcut").length,
    errorCount: plan.filter((item) => item.status === "error").length,
    plan,
    groups,
    errors: plan.filter((item) => item.status === "error").map((item) => `${item.fileName}: ${item.reason}`),
  })
}

function pending(plan: RawfilterPlanItem[]): RawfilterPlanItem[] {
  return plan.filter((item) => item.status === "pending")
}

function data(partial: Partial<RawfilterData>): RawfilterData {
  return {
    archiveCount: 0,
    totalGroups: 0,
    duplicateGroups: 0,
    skippedFiles: 0,
    movedToTrash: 0,
    movedToMulti: 0,
    createdShortcuts: 0,
    keptCount: 0,
    errorCount: 0,
    plan: [],
    groups: [],
    errors: [],
    ...partial,
  }
}

function success(message: string, partial: Partial<RawfilterData>): RawfilterResult {
  return { success: true, message, data: data(partial) }
}

function failure(message: string): RawfilterResult {
  return { success: false, message, data: data({ errors: [message], errorCount: 1 }) }
}

function stripArchiveExtension(name: string): string {
  const lower = name.toLowerCase()
  const extension = [...ARCHIVE_EXTENSIONS].sort((a, b) => b.length - a.length).find((item) => lower.endsWith(item))
  return extension ? name.slice(0, -extension.length) : name.replace(/\.[^.]+$/, "")
}

function hasAnyMarker(value: string, markers: string[]): boolean {
  return markerRegex(markers).test(value.normalize("NFKC").toLowerCase())
}

function markerRegex(markers: string[]): RegExp {
  return new RegExp(`(?:${markers.map(escapeRegex).join("|")})`, "iu")
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).map((token) => token.trim()).filter(Boolean)
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim()
  return sanitized || "group"
}

function appendSuffix(fileName: string, suffix: number): string {
  const index = fileName.lastIndexOf(".")
  if (index <= 0) return `${fileName} (${suffix})`
  return `${fileName.slice(0, index)} (${suffix})${fileName.slice(index)}`
}

function clean(value?: string): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "")
}

function clampSimilarity(value: number): number {
  if (!Number.isFinite(value)) return 0.82
  return Math.min(1, Math.max(0, value))
}
