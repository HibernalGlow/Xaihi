import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type DissolvefAction = "dissolve" | "plan" | "nested" | "media" | "archive" | "direct" | "collect_archives" | "history" | "undo"
export type DissolvefMode = "nested" | "media" | "archive" | "direct"
export type DissolvefConflictMode = "auto" | "skip" | "overwrite" | "rename"
export type DissolvefMediaType = "video" | "archive" | "image"

export interface DissolvefInput {
  action?: DissolvefAction
  path?: string
  nested?: boolean
  media?: boolean
  archive?: boolean
  direct?: boolean
  preview?: boolean
  dryRun?: boolean
  exclude?: string | string[]
  fileConflict?: DissolvefConflictMode
  dirConflict?: DissolvefConflictMode
  file_conflict?: DissolvefConflictMode
  dir_conflict?: DissolvefConflictMode
  similarityThreshold?: number
  similarity_threshold?: number
  enableSimilarity?: boolean
  enable_similarity?: boolean
  protectFirstLevel?: boolean
  protect_first_level?: boolean
  undoId?: string
  undo_id?: string
  historyPath?: string
  historyLimit?: number
  mediaTypes?: DissolvefMediaType[]
  skipBlacklist?: boolean
}

export interface DissolvefPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export interface DissolvefDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface DissolvefPlanItem {
  mode: DissolvefMode
  operation: "move" | "delete_dir"
  sourcePath: string
  targetPath: string
  itemKind: "file" | "directory"
  status: "pending" | "skipped" | "success" | "error"
  reason?: string
  similarity?: number
  deleteTarget?: boolean
  recursiveDelete?: boolean
}

export interface DissolveUndoOperation {
  type: "move" | "delete_dir"
  sourcePath: string
  targetPath?: string
}

export interface DissolveUndoRecord {
  id: string
  timestamp: string
  mode: DissolvefMode | "mixed"
  path: string
  count: number
  operations: DissolveUndoOperation[]
  undone?: boolean
}

export interface DissolvefData {
  plan: DissolvefPlanItem[]
  history: DissolveUndoRecord[]
  archivePaths: string[]
  nestedCount: number
  mediaCount: number
  archiveCount: number
  directFiles: number
  directDirs: number
  skippedCount: number
  totalCount: number
  successCount: number
  failedCount: number
  errorCount: number
  operationId: string
  errors: string[]
}

export interface DissolvefRuntime {
  pathInfo: (path: string) => Promise<DissolvefPathInfo>
  listDir: (path: string) => Promise<DissolvefDirEntry[]>
  ensureDir: (path: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  deletePath: (path: string, recursive?: boolean) => Promise<void>
  readText: (path: string) => Promise<string | null>
  writeText: (path: string, content: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  now: () => Date
  randomId: () => string
  defaultHistoryPath: () => string
}

interface NormalizedDissolvefInput {
  action: DissolvefAction
  path: string
  nested: boolean
  media: boolean
  archive: boolean
  direct: boolean
  preview: boolean
  exclude: string[]
  fileConflict: DissolvefConflictMode
  dirConflict: DissolvefConflictMode
  similarityThreshold: number
  enableSimilarity: boolean
  protectFirstLevel: boolean
  undoId: string
  historyPath: string
  historyLimit: number
  mediaTypes: DissolvefMediaType[]
  skipBlacklist: boolean
}

export type DissolvefResult = NodeRunResult<DissolvefData>

export const DISSOLVEF_VIDEO_EXTENSIONS = [".mp4", ".nov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".mov", ".m4v", ".mpg", ".mpeg", ".3gp", ".rmvb"]
export const DISSOLVEF_ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".cbz", ".cbr"]
export const DISSOLVEF_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp", ".tif", ".tiff"]
export const DISSOLVEF_SINGLE_ARCHIVE_BLACKLIST = ["\u753b\u96c6", "\u5546\u4e1a\u5fd7", "\u540c\u4eba\u5fd7", "#compare"]
export const DISSOLVEF_NESTED_BLACKLIST = [...DISSOLVEF_SINGLE_ARCHIVE_BLACKLIST, "CG", "pixiv", "fan", "patreon"]

export function normalizeDissolvefInput(input: DissolvefInput): NormalizedDissolvefInput {
  const action = input.action ?? "dissolve"
  const direct = input.direct ?? action === "direct"
  return {
    action,
    path: clean(input.path),
    nested: input.nested ?? (!direct && action !== "media" && action !== "archive"),
    media: input.media ?? (!direct && action !== "nested" && action !== "archive"),
    archive: input.archive ?? (!direct && action !== "nested" && action !== "media"),
    direct,
    preview: Boolean(input.preview ?? input.dryRun),
    exclude: parseList(input.exclude),
    fileConflict: input.fileConflict ?? input.file_conflict ?? "auto",
    dirConflict: input.dirConflict ?? input.dir_conflict ?? "auto",
    similarityThreshold: clampNumber(input.similarityThreshold ?? input.similarity_threshold, 0.6, 0, 1),
    enableSimilarity: input.enableSimilarity ?? input.enable_similarity ?? true,
    protectFirstLevel: input.protectFirstLevel ?? input.protect_first_level ?? true,
    undoId: clean(input.undoId ?? input.undo_id),
    historyPath: clean(input.historyPath),
    historyLimit: Math.max(1, Math.trunc(input.historyLimit ?? 20)),
    mediaTypes: input.mediaTypes?.length ? [...new Set(input.mediaTypes)] : ["video", "archive", "image"],
    skipBlacklist: input.skipBlacklist ?? false,
  }
}

export async function runDissolvef(
  input: DissolvefInput,
  runtime: DissolvefRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<DissolvefResult> {
  const normalized = normalizeDissolvefInput(input)
  try {
    if (normalized.action === "history") return await history(normalized, runtime)
    if (normalized.action === "undo") return await undo(normalized, runtime, onEvent)
    if (normalized.action === "collect_archives") {
      const archivePaths = await collectSingleArchivePaths(normalized, runtime)
      return success(`Collected ${archivePaths.length} archive path(s).`, { archivePaths })
    }

    const plan = await buildDissolvefPlan(normalized, runtime)
    if (normalized.action === "plan" || normalized.preview) {
      return success(`Plan generated: ${plan.filter((item) => item.status === "pending").length} operation(s).`, dataFromPlan(plan))
    }
    return await executePlan(normalized, plan, runtime, onEvent)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function buildDissolvefPlan(input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefPlanItem[]> {
  if (!input.path) throw new Error("Path is required.")
  const root = await runtime.pathInfo(input.path)
  if (!root.exists) throw new Error(`Path does not exist: ${input.path}`)
  if (!root.isDirectory) throw new Error(`Path is not a directory: ${input.path}`)

  if (input.direct || input.action === "direct") return await planDirect(root.path, input, runtime)

  const plan: DissolvefPlanItem[] = []
  const blockedPaths: string[] = []
  for (const mode of selectedDissolveModes(input)) {
    const raw = mode === "media"
      ? await planMedia(root.path, input, runtime)
      : mode === "nested"
        ? await planNested(root.path, input, runtime)
        : await planArchive(root.path, input, runtime)
    const accepted = filterBlockedGroups(raw, blockedPaths)
    plan.push(...accepted)
    blockedPaths.push(...accepted.filter((item) => item.operation === "delete_dir" && item.status === "pending").map((item) => item.sourcePath))
  }
  return plan
}

export async function collectSingleArchivePaths(input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<string[]> {
  const plan = await planArchive((await runtime.pathInfo(input.path)).path, input, runtime)
  return [...new Set(plan.filter((item) => item.operation === "move" && item.status === "pending").map((item) => item.sourcePath))]
    .sort((a, b) => a.localeCompare(b))
}

export function isDissolvefArchive(path: string): boolean {
  return hasExtension(path, DISSOLVEF_ARCHIVE_EXTENSIONS)
}

export function isDissolvefVideo(path: string): boolean {
  return hasExtension(path, DISSOLVEF_VIDEO_EXTENSIONS)
}

export function isDissolvefImage(path: string): boolean {
  return hasExtension(path, DISSOLVEF_IMAGE_EXTENSIONS)
}

export function calculateDissolvefSimilarity(left: string, right: string): number {
  const a = normalizeName(left)
  const b = normalizeName(right)
  if (!a || !b) return 0
  if (a === b) return 1

  const ratio = levenshteinRatio(a, b)
  const partial = a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0
  const tokenSort = levenshteinRatio(sortTokens(a), sortTokens(b))
  const tokenSet = tokenSetRatio(a, b)
  return Math.max(ratio, partial, tokenSort, tokenSet)
}

export function checkDissolvefSimilarity(parentName: string, childName: string, threshold = 0.6): { passed: boolean; similarity: number } {
  if (threshold <= 0) return { passed: true, similarity: 1 }
  const similarity = calculateDissolvefSimilarity(parentName, childName)
  return { passed: similarity >= threshold, similarity }
}

export function parseDissolveHistory(content: string | null): DissolveUndoRecord[] {
  if (!content?.trim()) return []
  try {
    const parsed = JSON.parse(content) as unknown
    const records = Array.isArray(parsed) ? parsed : [parsed]
    return records.map(normalizeUndoRecord).filter((record): record is DissolveUndoRecord => record !== null)
  } catch {
    return []
  }
}

export function dumpDissolveHistory(records: DissolveUndoRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`
}

async function planNested(rootPath: string, input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefPlanItem[]> {
  const plan: DissolvefPlanItem[] = []
  const dirs = (await collectDirectoryPaths(rootPath, runtime)).sort((a, b) => pathDepth(a) - pathDepth(b))
  const covered: string[] = []

  for (const dir of dirs) {
    if (covered.some((path) => isSameOrInside(dir, path))) continue
    if (input.protectFirstLevel && isFirstLevel(rootPath, dir, runtime)) continue
    const skipReason = skipReasonForPath(dir, input.exclude, input.skipBlacklist ? [] : DISSOLVEF_NESTED_BLACKLIST)
    if (skipReason) {
      plan.push(skipped("nested", dir, skipReason))
      continue
    }

    const entries = await sortedEntries(dir, runtime)
    const childDirs = entries.filter((entry) => entry.isDirectory)
    const files = entries.filter((entry) => entry.isFile)
    if (childDirs.length !== 1 || files.length !== 0) continue

    const firstChild = childDirs[0]
    const similarity = input.enableSimilarity ? checkDissolvefSimilarity(runtime.basename(dir), firstChild.name, input.similarityThreshold) : { passed: true, similarity: 1 }
    if (!similarity.passed) {
      plan.push(skipped("nested", firstChild.path, "similarity_below_threshold", similarity.similarity))
      continue
    }

    const deepest = await deepestSingleSubfolder(firstChild.path, runtime)
    const deepestEntries = await sortedEntries(deepest, runtime)
    for (const item of deepestEntries) {
      const targetPath = await nextAvailablePath(runtime.join(dir, item.name), runtime)
      plan.push({
        mode: "nested",
        operation: "move",
        sourcePath: item.path,
        targetPath,
        itemKind: item.isDirectory ? "directory" : "file",
        status: "pending",
        similarity: similarity.similarity,
      })
    }
    plan.push({
      mode: "nested",
      operation: "delete_dir",
      sourcePath: firstChild.path,
      targetPath: "",
      itemKind: "directory",
      status: "pending",
      recursiveDelete: true,
      similarity: similarity.similarity,
    })
    covered.push(firstChild.path)
  }

  return plan
}

async function planMedia(rootPath: string, input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefPlanItem[]> {
  const plan: DissolvefPlanItem[] = []
  const dirs = (await collectDirectoryPaths(rootPath, runtime)).sort((a, b) => pathDepth(b) - pathDepth(a))

  for (const dir of dirs) {
    if (input.protectFirstLevel && isFirstLevel(rootPath, dir, runtime)) continue
    const skipReason = skipReasonForPath(dir, input.exclude, [])
    if (skipReason) {
      plan.push(skipped("media", dir, skipReason))
      continue
    }

    const entries = await sortedEntries(dir, runtime)
    const files = entries.filter((entry) => entry.isFile)
    const childDirs = entries.filter((entry) => entry.isDirectory)
    const mediaFiles = files.filter((entry) => isEnabledMedia(entry.name, input.mediaTypes))
    if (mediaFiles.length !== 1 || files.length !== 1 || childDirs.length !== 0) continue

    const mediaFile = mediaFiles[0]
    const targetPath = await nextAvailablePath(runtime.join(runtime.dirname(dir), mediaFile.name), runtime)
    plan.push({
      mode: "media",
      operation: "move",
      sourcePath: mediaFile.path,
      targetPath,
      itemKind: "file",
      status: "pending",
    })
    plan.push({
      mode: "media",
      operation: "delete_dir",
      sourcePath: dir,
      targetPath: "",
      itemKind: "directory",
      status: "pending",
    })
  }

  return plan
}

async function planArchive(rootPath: string, input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefPlanItem[]> {
  const plan: DissolvefPlanItem[] = []
  const dirs = (await collectDirectoryPaths(rootPath, runtime)).sort((a, b) => pathDepth(b) - pathDepth(a))

  for (const dir of dirs) {
    if (input.protectFirstLevel && isFirstLevel(rootPath, dir, runtime)) continue
    const skipReason = skipReasonForPath(dir, input.exclude, input.skipBlacklist ? [] : DISSOLVEF_SINGLE_ARCHIVE_BLACKLIST)
    if (skipReason) {
      plan.push(skipped("archive", dir, skipReason))
      continue
    }

    const entries = await sortedEntries(dir, runtime)
    const files = entries.filter((entry) => entry.isFile)
    const childDirs = entries.filter((entry) => entry.isDirectory)
    const archiveFiles = files.filter((entry) => isDissolvefArchive(entry.name))
    if (archiveFiles.length !== 1 || files.length !== 1 || childDirs.length !== 0) continue

    const archive = archiveFiles[0]
    const similarity = input.enableSimilarity ? checkDissolvefSimilarity(runtime.basename(dir), stripExtension(archive.name), input.similarityThreshold) : { passed: true, similarity: 1 }
    if (!similarity.passed) {
      plan.push(skipped("archive", archive.path, "similarity_below_threshold", similarity.similarity))
      continue
    }

    const targetPath = await nextAvailablePath(runtime.join(runtime.dirname(dir), archive.name), runtime)
    plan.push({
      mode: "archive",
      operation: "move",
      sourcePath: archive.path,
      targetPath,
      itemKind: "file",
      status: "pending",
      similarity: similarity.similarity,
    })
    plan.push({
      mode: "archive",
      operation: "delete_dir",
      sourcePath: dir,
      targetPath: "",
      itemKind: "directory",
      status: "pending",
      similarity: similarity.similarity,
    })
  }

  return plan
}

async function planDirect(rootPath: string, input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefPlanItem[]> {
  const plan: DissolvefPlanItem[] = []
  const parent = runtime.dirname(rootPath)
  for (const entry of await sortedEntries(rootPath, runtime)) {
    await appendDirectMove(plan, entry, parent, input, runtime)
  }
  plan.push({
    mode: "direct",
    operation: "delete_dir",
    sourcePath: rootPath,
    targetPath: "",
    itemKind: "directory",
    status: "pending",
  })
  return plan
}

async function appendDirectMove(
  plan: DissolvefPlanItem[],
  entry: DissolvefDirEntry,
  targetDir: string,
  input: NormalizedDissolvefInput,
  runtime: DissolvefRuntime,
): Promise<void> {
  const targetPath = runtime.join(targetDir, entry.name)
  if (entry.isDirectory) {
    const targetInfo = await runtime.pathInfo(targetPath)
    const conflict = normalizeConflict(input.dirConflict, true)
    if (targetInfo.exists && targetInfo.isDirectory && conflict === "overwrite") {
      for (const child of await sortedEntries(entry.path, runtime)) {
        await appendDirectMove(plan, child, targetPath, input, runtime)
      }
      plan.push({
        mode: "direct",
        operation: "delete_dir",
        sourcePath: entry.path,
        targetPath: "",
        itemKind: "directory",
        status: "pending",
      })
      return
    }
  }

  const resolved = await resolveConflictTarget(targetPath, entry.isDirectory, entry.isDirectory ? input.dirConflict : input.fileConflict, runtime)
  if (!resolved.proceed) {
    plan.push({
      mode: "direct",
      operation: "move",
      sourcePath: entry.path,
      targetPath,
      itemKind: entry.isDirectory ? "directory" : "file",
      status: "skipped",
      reason: resolved.reason,
    })
    return
  }

  plan.push({
    mode: "direct",
    operation: "move",
    sourcePath: entry.path,
    targetPath: resolved.targetPath,
    itemKind: entry.isDirectory ? "directory" : "file",
    status: "pending",
    deleteTarget: resolved.deleteTarget,
  })
}

async function executePlan(
  input: NormalizedDissolvefInput,
  plan: DissolvefPlanItem[],
  runtime: DissolvefRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<DissolvefResult> {
  const pending = plan.filter((item) => item.status === "pending")
  const completed: DissolvefPlanItem[] = []
  let successCount = 0
  let failedCount = 0

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index]
    onEvent({ type: "progress", progress: Math.round((index / Math.max(pending.length, 1)) * 100), message: item.sourcePath })
    try {
      if (item.operation === "delete_dir") {
        await runtime.deletePath(item.sourcePath, item.recursiveDelete)
      } else {
        await runtime.ensureDir(runtime.dirname(item.targetPath))
        if (item.deleteTarget) await runtime.deletePath(item.targetPath)
        await runtime.movePath(item.sourcePath, item.targetPath)
      }
      completed.push({ ...item, status: "success" })
      successCount += 1
    } catch (error) {
      completed.push({ ...item, status: "error", reason: error instanceof Error ? error.message : String(error) })
      failedCount += 1
    }
  }

  const skipped = plan.filter((item) => item.status === "skipped")
  const operationId = await recordUndoIfNeeded(input, completed, runtime)
  const finalPlan = [...skipped, ...completed]
  onEvent({ type: "progress", progress: 100, message: "Dissolve completed." })
  return {
    success: failedCount === 0,
    message: `Dissolve completed: ${successCount} success, ${skipped.length} skipped, ${failedCount} failed.`,
    data: data({
      ...dataFromPlan(finalPlan),
      plan: finalPlan,
      successCount,
      failedCount,
      operationId,
    }),
  }
}

async function recordUndoIfNeeded(input: NormalizedDissolvefInput, completed: DissolvefPlanItem[], runtime: DissolvefRuntime): Promise<string> {
  const operations = completed
    .filter((item) => item.status === "success")
    .map<DissolveUndoOperation>((item) => item.operation === "move"
      ? { type: "move", sourcePath: item.sourcePath, targetPath: item.targetPath }
      : { type: "delete_dir", sourcePath: item.sourcePath })
  if (!operations.length) return ""

  const modes = [...new Set(completed.filter((item) => item.status === "success").map((item) => item.mode))]
  const record: DissolveUndoRecord = {
    id: `dissolve-${runtime.now().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${runtime.randomId()}`,
    timestamp: runtime.now().toISOString(),
    mode: modes.length === 1 ? modes[0] : "mixed",
    path: input.path,
    count: operations.length,
    operations,
  }
  const records = parseDissolveHistory(await runtime.readText(historyPath(input, runtime)))
  records.unshift(record)
  await runtime.writeText(historyPath(input, runtime), dumpDissolveHistory(records.slice(0, 100)))
  return record.id
}

async function history(input: NormalizedDissolvefInput, runtime: DissolvefRuntime): Promise<DissolvefResult> {
  const records = parseDissolveHistory(await runtime.readText(historyPath(input, runtime))).slice(0, input.historyLimit)
  return success(`Loaded ${records.length} history record(s).`, { history: records })
}

async function undo(input: NormalizedDissolvefInput, runtime: DissolvefRuntime, onEvent: (event: NodeRunEvent) => void): Promise<DissolvefResult> {
  const path = historyPath(input, runtime)
  const records = parseDissolveHistory(await runtime.readText(path))
  const record = input.undoId ? records.find((item) => item.id === input.undoId) : records.find((item) => !item.undone)
  if (!record) return failure(input.undoId ? `Undo record not found: ${input.undoId}` : "No undoable record found.")
  if (record.undone) return failure(`Undo record already applied: ${record.id}`)

  let successCount = 0
  let failedCount = 0
  const errors: string[] = []
  const operations = [...record.operations].reverse()
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]
    onEvent({ type: "progress", progress: Math.round((index / Math.max(operations.length, 1)) * 100), message: operation.sourcePath })
    try {
      if (operation.type === "delete_dir") {
        await runtime.ensureDir(operation.sourcePath)
      } else if (operation.targetPath) {
        const [source, target] = await Promise.all([
          runtime.pathInfo(operation.sourcePath),
          runtime.pathInfo(operation.targetPath),
        ])
        if (source.exists && target.exists) {
          throw new Error(`Undo conflict: both source and target exist: ${operation.sourcePath}`)
        }
        if (source.exists) {
          successCount += 1
          continue
        }
        if (!target.exists) {
          throw new Error(`Undo source is missing: ${operation.targetPath}`)
        }
        await runtime.ensureDir(runtime.dirname(operation.sourcePath))
        await runtime.movePath(operation.targetPath, operation.sourcePath)
      }
      successCount += 1
    } catch (error) {
      failedCount += 1
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  record.undone = failedCount === 0
  await runtime.writeText(path, dumpDissolveHistory(records))
  onEvent({ type: "progress", progress: 100, message: "Undo completed." })
  return {
    success: failedCount === 0,
    message: `Undo completed: ${successCount} success, ${failedCount} failed.`,
    data: data({ history: records, successCount, failedCount, errors }),
  }
}

async function collectDirectoryPaths(path: string, runtime: DissolvefRuntime): Promise<string[]> {
  const result = [path]
  for (const entry of await runtime.listDir(path)) {
    if (entry.isDirectory) result.push(...await collectDirectoryPaths(entry.path, runtime))
  }
  return result
}

async function deepestSingleSubfolder(path: string, runtime: DissolvefRuntime): Promise<string> {
  let current = path
  while (true) {
    const entries = await sortedEntries(current, runtime)
    const dirs = entries.filter((entry) => entry.isDirectory)
    const files = entries.filter((entry) => entry.isFile)
    if (dirs.length === 1 && files.length === 0) current = dirs[0].path
    else return current
  }
}

async function sortedEntries(path: string, runtime: DissolvefRuntime): Promise<DissolvefDirEntry[]> {
  return (await runtime.listDir(path)).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

async function resolveConflictTarget(
  targetPath: string,
  isDirectory: boolean,
  conflict: DissolvefConflictMode,
  runtime: DissolvefRuntime,
): Promise<{ proceed: boolean; targetPath: string; deleteTarget?: boolean; reason?: string }> {
  const info = await runtime.pathInfo(targetPath)
  if (!info.exists) return { proceed: true, targetPath }
  const mode = normalizeConflict(conflict, isDirectory)
  if (mode === "skip") return { proceed: false, targetPath, reason: "target_exists" }
  if (mode === "rename") return { proceed: true, targetPath: await nextAvailablePath(targetPath, runtime) }
  if (isDirectory) {
    if (!info.isDirectory) return { proceed: false, targetPath, reason: "target_file_exists" }
    return { proceed: true, targetPath }
  }
  if (!info.isFile) return { proceed: false, targetPath, reason: "target_directory_exists" }
  return { proceed: true, targetPath, deleteTarget: true }
}

function normalizeConflict(conflict: DissolvefConflictMode, isDirectory: boolean): DissolvefConflictMode {
  if (conflict === "auto") return isDirectory ? "overwrite" : "skip"
  return conflict
}

async function nextAvailablePath(targetPath: string, runtime: DissolvefRuntime): Promise<string> {
  if (!(await runtime.pathInfo(targetPath)).exists) return targetPath
  const dir = runtime.dirname(targetPath)
  const name = runtime.basename(targetPath)
  const { stem, suffix } = splitName(name)
  for (let counter = 1; counter < 10000; counter += 1) {
    const candidate = runtime.join(dir, `${stem}_${counter}${suffix}`)
    if (!(await runtime.pathInfo(candidate)).exists) return candidate
  }
  throw new Error(`Unable to find available target for ${targetPath}`)
}

function skipReasonForPath(path: string, exclude: string[], blacklist: string[]): string | null {
  const lower = path.toLowerCase()
  if (exclude.some((keyword) => keyword && lower.includes(keyword.toLowerCase()))) return "excluded"
  if (blacklist.some((keyword) => keyword && lower.includes(keyword.toLowerCase()))) return "blacklisted"
  return null
}

function selectedDissolveModes(input: NormalizedDissolvefInput): DissolvefMode[] {
  if (input.action === "media" || input.action === "nested" || input.action === "archive") return [input.action]
  const modes: DissolvefMode[] = []
  if (input.media) modes.push("media")
  if (input.nested) modes.push("nested")
  if (input.archive) modes.push("archive")
  return modes
}

function filterBlockedGroups(plan: DissolvefPlanItem[], blockedPaths: string[]): DissolvefPlanItem[] {
  if (!blockedPaths.length) return plan
  const result: DissolvefPlanItem[] = []
  let group: DissolvefPlanItem[] = []

  function flush() {
    if (!group.length) return
    const blocked = group.some((item) => blockedPaths.some((path) => {
      if (isSameOrInside(item.sourcePath, path)) return true
      if (item.operation === "delete_dir" && isSameOrInside(path, item.sourcePath)) return true
      return false
    }))
    if (!blocked) result.push(...group)
    group = []
  }

  for (const item of plan) {
    group.push(item)
    if (item.status === "skipped" || item.operation === "delete_dir") flush()
  }
  flush()
  return result
}

function skipped(mode: DissolvefMode, path: string, reason: string, similarity?: number): DissolvefPlanItem {
  return {
    mode,
    operation: "move",
    sourcePath: path,
    targetPath: "",
    itemKind: "directory",
    status: "skipped",
    reason,
    similarity,
  }
}

function isEnabledMedia(name: string, mediaTypes: DissolvefMediaType[]): boolean {
  return (mediaTypes.includes("video") && isDissolvefVideo(name))
    || (mediaTypes.includes("archive") && isDissolvefArchive(name))
    || (mediaTypes.includes("image") && isDissolvefImage(name))
}

function hasExtension(path: string, extensions: string[]): boolean {
  const lower = path.toLowerCase()
  return extensions.some((ext) => lower.endsWith(ext))
}

function pathDepth(path: string): number {
  return path.split(/[\\/]+/).filter(Boolean).length
}

function isFirstLevel(root: string, candidate: string, runtime: DissolvefRuntime): boolean {
  return candidate !== root && runtime.dirname(candidate) === root
}

function isSameOrInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`) || path.startsWith(`${parent}\\`)
}

function stripExtension(name: string): string {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

function splitName(name: string): { stem: string; suffix: string } {
  const index = name.lastIndexOf(".")
  if (index <= 0) return { stem: name, suffix: "" }
  return { stem: name.slice(0, index), suffix: name.slice(index) }
}

function normalizeName(name: string): string {
  return stripExtension(name)
    .toLowerCase()
    .replace(/[_\-.[\](){}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sortTokens(value: string): string {
  return value.split(/\s+/).filter(Boolean).sort((a, b) => a.localeCompare(b)).join(" ")
}

function tokenSetRatio(left: string, right: string): number {
  const a = new Set(left.split(/\s+/).filter(Boolean))
  const b = new Set(right.split(/\s+/).filter(Boolean))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  return (2 * intersection) / (a.size + b.size)
}

function levenshteinRatio(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) return 1
  return 1 - levenshteinDistance(left, right) / maxLength
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j]
  }
  return previous[right.length]
}

function historyPath(input: NormalizedDissolvefInput, runtime: DissolvefRuntime): string {
  return input.historyPath || runtime.defaultHistoryPath()
}

function parseList(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean)
  return (value ?? "").split(/[,;\r\n]/).map(clean).filter(Boolean)
}

function clean(value?: string): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "")
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function normalizeUndoRecord(value: unknown): DissolveUndoRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<DissolveUndoRecord>
  if (typeof record.id !== "string" || typeof record.timestamp !== "string" || !Array.isArray(record.operations)) return null

  const operations = record.operations
    .map(normalizeUndoOperation)
    .filter((operation): operation is DissolveUndoOperation => operation !== null)
  if (operations.length !== record.operations.length) return null

  return {
    id: record.id,
    timestamp: record.timestamp,
    mode: isUndoMode(record.mode) ? record.mode : "mixed",
    path: typeof record.path === "string" ? record.path : "",
    count: typeof record.count === "number" ? record.count : operations.length,
    operations,
    ...(typeof record.undone === "boolean" ? { undone: record.undone } : {}),
  }
}

function normalizeUndoOperation(value: unknown): DissolveUndoOperation | null {
  if (!value || typeof value !== "object") return null
  const operation = value as {
    type?: unknown
    sourcePath?: unknown
    targetPath?: unknown
    src?: unknown
    dst?: unknown
  }
  if (operation.type !== "move" && operation.type !== "delete_dir") return null

  const sourcePath = typeof operation.sourcePath === "string"
    ? operation.sourcePath
    : typeof operation.src === "string"
      ? operation.src
      : ""
  if (!sourcePath) return null

  const targetPath = typeof operation.targetPath === "string"
    ? operation.targetPath
    : typeof operation.dst === "string"
      ? operation.dst
      : undefined
  if (operation.type === "move" && !targetPath) return null
  return targetPath
    ? { type: operation.type, sourcePath, targetPath }
    : { type: operation.type, sourcePath }
}

function isUndoMode(value: unknown): value is DissolveUndoRecord["mode"] {
  return value === "nested" || value === "media" || value === "archive" || value === "direct" || value === "mixed"
}

function dataFromPlan(plan: DissolvefPlanItem[]): Partial<DissolvefData> {
  const active = plan.filter((item) => item.status === "pending" || item.status === "success")
  return {
    plan,
    nestedCount: active.filter((item) => item.mode === "nested" && item.operation === "delete_dir").length,
    mediaCount: active.filter((item) => item.mode === "media" && item.operation === "delete_dir").length,
    archiveCount: active.filter((item) => item.mode === "archive" && item.operation === "delete_dir").length,
    directFiles: active.filter((item) => item.mode === "direct" && item.operation === "move" && item.itemKind === "file").length,
    directDirs: active.filter((item) => item.mode === "direct" && item.operation === "move" && item.itemKind === "directory").length,
    skippedCount: plan.filter((item) => item.status === "skipped").length,
    errorCount: plan.filter((item) => item.status === "error").length,
    totalCount: plan.length,
    errors: plan.filter((item) => item.status === "error").map((item) => item.reason ?? "unknown_error"),
  }
}

function data(partial: Partial<DissolvefData>): DissolvefData {
  return {
    plan: [],
    history: [],
    archivePaths: [],
    nestedCount: 0,
    mediaCount: 0,
    archiveCount: 0,
    directFiles: 0,
    directDirs: 0,
    skippedCount: 0,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    errorCount: 0,
    operationId: "",
    errors: [],
    ...partial,
  }
}

function success(message: string, partial: Partial<DissolvefData>): DissolvefResult {
  return { success: true, message, data: data(partial) }
}

function failure(message: string): DissolvefResult {
  return { success: false, message, data: data({ errors: [message], failedCount: 1, errorCount: 1 }) }
}
