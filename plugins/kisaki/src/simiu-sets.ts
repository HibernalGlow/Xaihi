/** Simiu owns directory-local planning and rollback above Czkawka's detector. */
export const SIMIU_SET_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".avif", ".jxl",
])
export const SIMIU_SET_MARKER = "__set_"

export type SimiuSetScanOrder = "path" | "smallest-first" | "deepest-first"
export type SimiuSetApplyMode = "move" | "copy" | "link"

export interface SimiuSetDirectoryEntry {
  path: string
  isDirectory: boolean
  isFile: boolean
}

export interface SimiuSetImage {
  path: string
  modifiedDate: number
  size: number
  width?: number
  height?: number
  similarity?: string
}

export interface SimiuSetSimilarityGroup {
  entries: readonly SimiuSetImage[]
}

export interface SimiuSetGroup {
  root: string
  parentDirectory: string
  name: string
  files: SimiuSetImage[]
}

export interface SimiuSetOperation {
  root: string
  mode: SimiuSetApplyMode
  sourcePath: string
  targetPath: string
}

export interface SimiuSetOptions {
  roots: string[]
  recursive: boolean
  scanOrder: SimiuSetScanOrder
  namePrefix: string
  minimumGroupSize: number
}

export interface SimiuSetScanResult {
  groups: SimiuSetGroup[]
  operations: SimiuSetOperation[]
  directoryCount: number
  imageCount: number
  messages: string[]
  stopped: boolean
}

export interface SimiuSetApplyResult {
  operations: Array<SimiuSetOperation & { status: "planned" | "succeeded" | "error"; error?: string }>
  undoLogPaths: string[]
}

export interface SimiuSetRuntime {
  listDirectory(path: string): Promise<SimiuSetDirectoryEntry[]>
  pathExists(path: string): Promise<boolean>
  ensureDirectory(path: string): Promise<void>
  movePath(source: string, target: string): Promise<void>
  copyPath(source: string, target: string): Promise<void>
  linkPath(source: string, target: string): Promise<void>
  removePath(path: string, options?: { trash?: boolean; emptyFoldersOnly?: boolean }): Promise<void>
  readText(path: string): Promise<string>
  writeText(path: string, content: string): Promise<void>
  join(...parts: string[]): string
  dirname(path: string): string
  basename(path: string): string
  isCancelled?(): boolean
  waitWhilePaused?(): Promise<void>
}

type SimiuSetMutationRuntime = Pick<SimiuSetRuntime, "pathExists" | "ensureDirectory" | "movePath" | "copyPath" | "linkPath" | "removePath" | "readText" | "writeText" | "join" | "dirname" | "basename" | "isCancelled" | "waitWhilePaused">

interface SimiuSetDirectory {
  root: string
  path: string
  images: string[]
}

interface SimiuSetUndoOperation {
  mode: SimiuSetApplyMode
  src: string
  dst: string
}

interface SimiuSetUndoLog {
  version: 1
  createdAt: string
  root: string
  operations: SimiuSetUndoOperation[]
  createdDirectories: string[]
}

export function normalizeSimiuSetOptions(input: Partial<SimiuSetOptions>): SimiuSetOptions {
  return {
    roots: unique(input.roots ?? []),
    recursive: input.recursive ?? true,
    scanOrder: oneOf(input.scanOrder, ["path", "smallest-first", "deepest-first"], "smallest-first"),
    namePrefix: sanitizePrefix(input.namePrefix ?? "simiu_set"),
    minimumGroupSize: clamp(input.minimumGroupSize, 2, 10_000, 2),
  }
}

export async function scanSimiuSets(
  input: Partial<SimiuSetOptions>,
  similarityGroups: readonly SimiuSetSimilarityGroup[],
  runtime: SimiuSetRuntime,
  onProgress: (progress: number, message: string) => void = () => {},
): Promise<SimiuSetScanResult> {
  const options = normalizeSimiuSetOptions(input)
  const directories = await collectSimiuSetDirectories(options, runtime)
  const candidatesByDirectory = partitionSimiuSimilarityGroups(directories, similarityGroups, options.minimumGroupSize)
  const groups: SimiuSetGroup[] = []
  const messages: string[] = []
  let imageCount = 0
  let stopped = false

  for (let index = 0; index < directories.length; index += 1) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) { stopped = true; break }
    const directory = directories[index]!
    imageCount += directory.images.length
    onProgress(Math.round((index / Math.max(1, directories.length)) * 4) + 96, `Planning Simiu sets in ${directory.path}`)
    const candidates = candidatesByDirectory.get(normalizedDirectory(directory.path)) ?? []
    if (candidates.length === 1 && candidates[0]?.length === directory.images.length) continue
    const names = await resolveGroupNames(directory.path, candidates.length, options.namePrefix, runtime)
    candidates.forEach((files, groupIndex) => {
      const name = names[groupIndex]
      if (name) groups.push({ root: directory.root, parentDirectory: directory.path, name, files: [...files].sort((left, right) => comparePaths(left.path, right.path)) })
    })
  }

  const operations = await planSimiuSetOperations(groups, "move", runtime)
  onProgress(stopped ? 99 : 100, stopped ? "Stopped Simiu sets." : "Finished Simiu sets.")
  return { groups, operations, directoryCount: directories.length, imageCount, messages, stopped }
}

function partitionSimiuSimilarityGroups(
  directories: readonly SimiuSetDirectory[],
  similarityGroups: readonly SimiuSetSimilarityGroup[],
  minimumGroupSize: number,
): Map<string, SimiuSetImage[][]> {
  const directoryByImage = new Map<string, string>()
  for (const directory of directories) {
    const directoryKey = normalizedDirectory(directory.path)
    for (const image of directory.images) directoryByImage.set(normalizedFile(image), directoryKey)
  }

  const candidatesByDirectory = new Map<string, SimiuSetImage[][]>()
  for (const group of similarityGroups) {
    const membersByDirectory = new Map<string, SimiuSetImage[]>()
    for (const image of group.entries) {
      const directoryKey = directoryByImage.get(normalizedFile(image.path))
      if (!directoryKey) continue
      const members = membersByDirectory.get(directoryKey) ?? []
      members.push(image)
      membersByDirectory.set(directoryKey, members)
    }
    for (const [directoryKey, members] of membersByDirectory) {
      if (members.length < minimumGroupSize) continue
      const candidates = candidatesByDirectory.get(directoryKey) ?? []
      candidates.push([...members].sort((left, right) => comparePaths(left.path, right.path)))
      candidatesByDirectory.set(directoryKey, candidates)
    }
  }

  for (const candidates of candidatesByDirectory.values()) {
    candidates.sort((left, right) => right.length - left.length || comparePaths(left[0]?.path ?? "", right[0]?.path ?? ""))
  }
  return candidatesByDirectory
}

export async function collectSimiuSetDirectories(input: SimiuSetOptions, runtime: Pick<SimiuSetRuntime, "listDirectory">): Promise<SimiuSetDirectory[]> {
  const pending = input.roots.map((root) => ({ root, path: root }))
  const directories: SimiuSetDirectory[] = []
  const visited = new Set<string>()
  while (pending.length) {
    const current = pending.shift()!
    const key = normalizedDirectory(current.path)
    if (visited.has(key)) continue
    visited.add(key)
    if (shouldSkipSimiuSetDirectory(current.path, input.namePrefix)) continue
    const entries = await runtime.listDirectory(current.path)
    const images = entries.filter((entry) => entry.isFile && isSimiuSetImage(entry.path)).map((entry) => entry.path).sort(comparePaths)
    if (images.length) directories.push({ ...current, images })
    if (input.recursive) {
      for (const entry of entries) if (entry.isDirectory) pending.push({ root: current.root, path: entry.path })
    }
  }
  return sortSimiuSetDirectories(directories, input.scanOrder)
}

export async function planSimiuSetOperations(groups: readonly SimiuSetGroup[], mode: SimiuSetApplyMode, runtime: Pick<SimiuSetRuntime, "basename" | "join" | "pathExists">): Promise<SimiuSetOperation[]> {
  const claimed = new Set<string>()
  const operations: SimiuSetOperation[] = []
  for (const group of groups) {
    for (const file of group.files) {
      const targetPath = await nextAvailablePath(runtime.join(group.parentDirectory, group.name, runtime.basename(file.path)), claimed, runtime)
      operations.push({ root: group.root, mode, sourcePath: file.path, targetPath })
    }
  }
  return operations
}

export async function applySimiuSetOperations(operations: readonly SimiuSetOperation[], dryRun: boolean, runtime: SimiuSetMutationRuntime): Promise<SimiuSetApplyResult> {
  const results: SimiuSetApplyResult["operations"] = []
  const completedByRoot = new Map<string, SimiuSetUndoOperation[]>()
  const createdByRoot = new Map<string, Set<string>>()
  const claimed = new Set<string>()
  for (const operation of operations) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) break
    try {
      const targetPath = await nextAvailablePath(operation.targetPath, claimed, runtime)
      if (dryRun) { results.push({ ...operation, targetPath, status: "planned" }); continue }
      const targetDirectory = runtime.dirname(targetPath)
      const existed = await runtime.pathExists(targetDirectory)
      await runtime.ensureDirectory(targetDirectory)
      if (!existed) addCreatedDirectory(createdByRoot, operation.root, targetDirectory)
      if (operation.mode === "move") await runtime.movePath(operation.sourcePath, targetPath)
      else if (operation.mode === "copy") await runtime.copyPath(operation.sourcePath, targetPath)
      else await runtime.linkPath(operation.sourcePath, targetPath)
      const completed = completedByRoot.get(operation.root) ?? []
      completed.push({ mode: operation.mode, src: operation.sourcePath, dst: targetPath })
      completedByRoot.set(operation.root, completed)
      results.push({ ...operation, targetPath, status: "succeeded" })
    } catch (error) {
      results.push({ ...operation, status: "error", error: errorMessage(error) })
    }
  }
  if (dryRun) return { operations: results, undoLogPaths: [] }
  const undoLogPaths: string[] = []
  for (const [root, completed] of completedByRoot) {
    if (!completed.length) continue
    const logPath = await nextUndoLogPath(root, runtime)
    const payload: SimiuSetUndoLog = { version: 1, createdAt: new Date().toISOString(), root, operations: completed, createdDirectories: [...(createdByRoot.get(root) ?? [])] }
    await runtime.writeText(logPath, `${JSON.stringify(payload, null, 2)}\n`)
    undoLogPaths.push(logPath)
  }
  return { operations: results, undoLogPaths }
}

export async function undoSimiuSetLog(logPath: string, cleanEmptyDirectories: boolean, runtime: SimiuSetMutationRuntime): Promise<SimiuSetApplyResult> {
  const payload = parseUndoLog(await runtime.readText(logPath))
  const results: SimiuSetApplyResult["operations"] = []
  const claimed = new Set<string>()
  for (const operation of [...payload.operations].reverse()) {
    try {
      if (!await runtime.pathExists(operation.dst)) { results.push({ root: payload.root, mode: operation.mode, sourcePath: operation.src, targetPath: operation.dst, status: "error", error: "Target path no longer exists." }); continue }
      if (operation.mode === "move") {
        const restored = await nextAvailablePath(operation.src, claimed, runtime)
        await runtime.movePath(operation.dst, restored)
        results.push({ root: payload.root, mode: operation.mode, sourcePath: restored, targetPath: operation.dst, status: "succeeded" })
      } else {
        await runtime.removePath(operation.dst, { trash: false })
        results.push({ root: payload.root, mode: operation.mode, sourcePath: operation.src, targetPath: operation.dst, status: "succeeded" })
      }
    } catch (error) {
      results.push({ root: payload.root, mode: operation.mode, sourcePath: operation.src, targetPath: operation.dst, status: "error", error: errorMessage(error) })
    }
  }
  if (cleanEmptyDirectories) {
    for (const directory of [...payload.createdDirectories].sort((left, right) => right.length - left.length)) {
      try { await runtime.removePath(directory, { trash: false, emptyFoldersOnly: true }) } catch { /* A new file makes cleanup intentionally best-effort. */ }
    }
  }
  return { operations: results, undoLogPaths: [] }
}

export function shouldSkipSimiuSetDirectory(path: string, namePrefix: string): boolean {
  const name = basename(path).toLocaleLowerCase()
  return name.startsWith(".simiu-") || name.includes(SIMIU_SET_MARKER) || name.startsWith(namePrefix.toLocaleLowerCase())
}

export function isSimiuSetImage(path: string): boolean {
  const dot = path.lastIndexOf(".")
  return dot >= 0 && SIMIU_SET_IMAGE_EXTENSIONS.has(path.slice(dot).toLocaleLowerCase())
}

function sortSimiuSetDirectories(directories: SimiuSetDirectory[], order: SimiuSetScanOrder): SimiuSetDirectory[] {
  return [...directories].sort((left, right) => order === "smallest-first"
    ? left.images.length - right.images.length || comparePaths(left.path, right.path)
    : order === "deepest-first"
      ? depth(right.path) - depth(left.path) || left.images.length - right.images.length || comparePaths(left.path, right.path)
      : comparePaths(left.path, right.path))
}

async function resolveGroupNames(parent: string, count: number, prefix: string, runtime: Pick<SimiuSetRuntime, "join" | "pathExists">): Promise<string[]> {
  const used = new Set<string>()
  const names: string[] = []
  for (let index = 1; index <= count; index += 1) {
    const base = `${prefix}${SIMIU_SET_MARKER}${String(index).padStart(3, "0")}`
    let candidate = base
    let suffix = 1
    while (used.has(candidate.toLocaleLowerCase()) || await runtime.pathExists(runtime.join(parent, candidate))) candidate = `${base}_${String(suffix++).padStart(2, "0")}`
    used.add(candidate.toLocaleLowerCase())
    names.push(candidate)
  }
  return names
}

async function nextAvailablePath(path: string, claimed: Set<string>, runtime: Pick<SimiuSetRuntime, "pathExists">): Promise<string> {
  const parsed = splitExtension(path)
  let candidate = path
  let index = 1
  while (claimed.has(candidate.toLocaleLowerCase()) || await runtime.pathExists(candidate)) candidate = `${parsed.stem}_${String(index++).padStart(2, "0")}${parsed.extension}`
  claimed.add(candidate.toLocaleLowerCase())
  return candidate
}

async function nextUndoLogPath(root: string, runtime: Pick<SimiuSetRuntime, "join" | "pathExists">): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-")
  const base = runtime.join(root, `.simiu-undo-${stamp}.json`)
  return nextAvailablePath(base, new Set(), runtime)
}

function parseUndoLog(text: string): SimiuSetUndoLog {
  const value = JSON.parse(text) as Partial<SimiuSetUndoLog>
  if (value.version !== 1 || typeof value.root !== "string" || !Array.isArray(value.operations)) throw new Error("Invalid Simiu undo log.")
  const operations = value.operations.filter((item): item is SimiuSetUndoOperation => Boolean(item) && typeof item.mode === "string" && ["move", "copy", "link"].includes(item.mode) && typeof item.src === "string" && typeof item.dst === "string")
  if (operations.length !== value.operations.length) throw new Error("Invalid Simiu undo log operations.")
  return { version: 1, createdAt: typeof value.createdAt === "string" ? value.createdAt : "", root: value.root, operations, createdDirectories: Array.isArray(value.createdDirectories) ? value.createdDirectories.filter((item): item is string => typeof item === "string") : [] }
}

function addCreatedDirectory(target: Map<string, Set<string>>, root: string, directory: string): void {
  const current = target.get(root) ?? new Set<string>()
  current.add(directory)
  target.set(root, current)
}

function sanitizePrefix(value: string): string { return value.trim().replace(/[<>:"/\\|?*]/g, "_") || "simiu_set" }
function normalizedDirectory(path: string): string { return path.replace(/[\\/]+$/, "").replaceAll("\\", "/").toLocaleLowerCase() }
function normalizedFile(path: string): string { return path.replaceAll("\\", "/").toLocaleLowerCase() }
function basename(path: string): string { const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")); return index < 0 ? path : path.slice(index + 1) }
function splitExtension(path: string): { stem: string; extension: string } { const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")), dot = path.lastIndexOf("."); return dot > slash ? { stem: path.slice(0, dot), extension: path.slice(dot) } : { stem: path, extension: "" } }
function depth(path: string): number { return path.replaceAll("\\", "/").split("/").filter(Boolean).length }
function comparePaths(left: string, right: string): number { return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) }
function clamp(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback }
function clampDecimal(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback }
function oneOf<const Values extends readonly string[]>(value: unknown, values: Values, fallback: Values[number]): Values[number] { return values.includes(value as Values[number]) ? value as Values[number] : fallback }
function unique(values: readonly string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))] }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
