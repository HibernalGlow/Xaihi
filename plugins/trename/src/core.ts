/**
 * trename 的内核，从 `<Xiranite>` tag `noxide` 的只读基线
 * `packages/nodes/trename/src/core.ts`（**838 行**，本仓外的
 * `/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/packages/nodes/trename/src/core.ts`）
 * 逐字搬来：类型、常量、函数顺序、排序比较器、消息文案全部原样，**一处逻辑都没改**。
 * 唯一改动是基线第 1 行那条 import —— `@xiranite/contract` 的两个类型换成本包的
 * `./contract.ts` 垫片（理由见那个文件的头注释与 ADR-0002）。判据：`diff` 基线与本文件，
 * 减掉的基线行恰好 1 行（`tests/core.spec.ts` 的"逐字移植"那条用例钉着这条）。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io`：本文件仍然**零 I/O**，触达机器的动作
 * 全从 `TrenameRuntime` 那 13 个方法注入（`:72-86`，上游原本就这么设计），落地实现在
 * `src/platform.ts`。
 *
 * 会被"顺手优化"改掉的枚举与顺序语义，逐条钉在这里：
 * - 输入同时吃 camelCase 与 snake_case（`:24-52`），两条都给时 **camel 那份赢**
 *   （`input.includeHidden ?? input.include_hidden ?? false`，`:191`）。
 * - 内核默认：`action` `scan`、`includeRoot` true、`compact` true、`maxLines` 1000、
 *   `keepRecent` 10、`dryRun` **true**（`:187-205`）。`dryRun` 的默认与 crashu 那份
 *   （false）相反，与定义里那条 `dryRun` 默认 true 一致；别在这两侧"统一"它。
 * - `scan` 要求每条路径都是**已存在的目录**，否则整次运行 failure
 *   （`Path does not exist: …` / `Path is not a directory: …`，`:240-241`）。
 * - `basePath` 取**第一条**解析后路径的父目录（`:242`），后续路径不改它。
 * - `splitRenameJson` 每段起算 **2 行**（`{` 与 `"root": [`，`:283`），文件节点计 1 行、
 *   目录节点计 `3 + 子节点`（`:681-684`）；`maxLines <= 0` 时**一段装全部**（`:280`）。
 * - 紧凑序列化是自己拼的行（`:662-679`），不是 `JSON.stringify(…, null, 2)`，
 *   所以 `"tgt": ""` 这类空串永远在场，`countSerializedLines` 的 2/3 也是按这份格式数的。
 * - `validateRenameJson` 的冲突有四类来源：`sanitize`/扩展名报错按消息里有没有
 *   "extension" 分流成 `invalid_extension` / `illegal_chars`（`:342-348`）、
 *   `source_not_found`（`:355`）、`target_exists`（`:359`），外加同一目标的第二条起
 *   `duplicate_target`（`:382-394`，按名排序后**留第一个**）。src 与 tgt 解析后同路径时
 *   **不算** `target_exists`（`:358`）。
 * - 目录节点先递归子项、**后**给自己加候选（`:375-376`）⇒ 子项在前、父目录在后。
 * - `sanitizeFilename` 把 `ILLEGAL_CHARS`（`/\\:*?"<>|` 加 C0 控制符，带 `g` 旗标，`:152`）
 *   换成 `_` 再 trim；扩展名里含非法字符是 `[ERROR]`，文件基名里的是 `[AUTO-FIX]`
 *   （`:579-593`）。那个 `g` 正则的 `lastIndex` 在 `:589` 与 `:591` 被显式重置两次——
 *   把这两行"优化"掉就会漏检第二个文件。
 * - `preprocessRenameJson` 只在 rename 那条腿跑（`:430`）；`import` / `validate` **不清洗**。
 * - `runRename` 真执行是逐条 `ensureDir(dirname(new))` + `movePath`，单条失败记成
 *   `source_not_found`（`:450-465`）；`success` 判据是 `failures.length === conflicts.length`
 *   （`:470`），即"除了事前跳过的，没多一条失败"。批次 id 只在**有成功条目**时才生成
 *   （`:467`）。
 * - 撤销：批次 `unshift` 到最前（`:709`）；`undo` 不给 batchId 时取**未撤销里时间戳最大**
 *   的那批（`:489-491`），逐条**倒序**回搬（`:498`）；已撤销的批次再撤销会被拒（`:494`）。
 * - `randomId` 截到 8 字符，为空时落回 `batches.length + 1`（`:708`）。
 * - `leak` 模式只留 `DEFAULT_ARCHIVE_EXTS` 里那些扩展名，且**词干不匹配**任何
 *   `DEFAULT_LEAK_PREFIX_PATTERNS` 的文件（`:558-565`）；空目录在 leak 下被丢弃（`:554`）。
 *   那 15 条模式含 lookbehind（`:129-145`），`safeRegex` 编译失败的是**静默丢掉**（`:749-755`）。
 * - `excludePatterns` 先过 `PRESET_PATTERNS` 这张别名表（`processed` / `numbered`，
 *   `:147-150`），没命中别名就当裸正则（`:746`）。
 * - 目录条目先滤隐藏项与排除模式，再按"目录在前 + 名字"排序，比较器带
 *   `{numeric: true, sensitivity: "base"}`（`:530-533`）。
 * - 计数三兄弟 `countTotal` / `countPending` / `countReady` 都把**目录自己也算一条**
 *   （`:261-277`），`ready` 还要求 `tgt !== src`（`:799-805`）。
 *
 * @module xaihi-trename/core
 */

import type { NodeRunEvent, NodeRunResult } from './contract.ts'

export type TrenameAction = "scan" | "import" | "validate" | "rename" | "undo" | "history"
export type TrenameScanMode = "normal" | "leak"
export type TrenameConflictType = "target_exists" | "duplicate_target" | "illegal_chars" | "invalid_extension" | "source_not_found"

export interface TrenameFileNode {
  src: string
  tgt?: string
}

export interface TrenameDirNode {
  src_dir: string
  tgt_dir?: string
  children: TrenameNode[]
}

export type TrenameNode = TrenameFileNode | TrenameDirNode

export interface TrenameJson {
  root: TrenameNode[]
}

export interface TrenameInput {
  action?: TrenameAction
  path?: string
  paths?: string[] | string
  includeHidden?: boolean
  include_hidden?: boolean
  includeRoot?: boolean
  include_root?: boolean
  excludeExts?: string[] | string
  exclude_exts?: string[] | string
  excludePatterns?: string[] | string
  exclude_patterns?: string[] | string
  maxLines?: number
  max_lines?: number
  compact?: boolean
  mode?: TrenameScanMode
  jsonContent?: string
  json_content?: string
  basePath?: string
  base_path?: string
  dryRun?: boolean
  dry_run?: boolean
  batchId?: string
  batch_id?: string
  undoPath?: string
  undo_path?: string
  keepRecent?: number
  keep_recent?: number
}

export interface TrenamePathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  size: number
  createdMs: number
  modifiedMs: number
}

export interface TrenameDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
  size: number
}

export interface TrenameRuntime {
  pathInfo: (path: string) => Promise<TrenamePathInfo>
  listDir: (path: string) => Promise<TrenameDirEntry[]>
  readText: (path: string) => Promise<string>
  writeText: (path: string, content: string) => Promise<void>
  ensureDir: (path: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  resolve: (path: string) => string
  defaultUndoPath: () => string
  now: () => string
  randomId: () => string
}

export interface TrenameConflict {
  type: TrenameConflictType
  srcPath: string
  tgtPath: string
  message: string
}

export interface TrenameOperation {
  originalPath: string
  newPath: string
}

export interface TrenameUndoBatch {
  id: string
  timestamp: string
  description: string
  undone: boolean
  operations: TrenameOperation[]
}

export interface TrenameData {
  jsonContent: string
  segments: string[]
  totalItems: number
  pendingCount: number
  readyCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  operationId: string
  conflicts: TrenameConflict[]
  operations: TrenameOperation[]
  history: TrenameUndoBatch[]
  basePath: string
  errors: string[]
}

export type TrenameResult = NodeRunResult<TrenameData>

export const DEFAULT_EXCLUDE_EXTS = [".json", ".txt", ".html", ".htm", ".md", ".log"]
export const DEFAULT_ARCHIVE_EXTS = [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"]
export const DEFAULT_LEAK_PREFIX_PATTERNS = [
  "(\\d{4}\\.\\d{2})",
  "(\\d{4}年\\d{1,2}月)",
  "(\\d{2}\\.\\d{2})",
  "(?<!\\d)(\\d{4})(?!\\d)",
  "(\\d{2}\\-\\d{2})",
  "(C\\d+)",
  "(COMIC1☆\\d+)",
  "(例大祭\\d*)",
  "(FF\\d+)",
  "([^()]*)COMIC[^()]*",
  "([^()]*)快乐天[^()]*",
  "([^()]*)Comic[^()]*",
  "([^()]*)VOL[^()]*",
  "([^()]*)永远娘[^()]*",
  "(.*?\\d+.*?)",
]

const PRESET_PATTERNS: Record<string, string> = {
  processed: "\\([^)]+\\s*路\\s*[^)]+\\)",
  numbered: "^\\d+\\.\\s",
}

const ILLEGAL_CHARS = /[/\\:*?"<>|\x00-\x1f]/g
const COMMON_EXTS = new Set([
  ".txt", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".py", ".java", ".cpp", ".c", ".h", ".hpp",
  ".cs", ".go", ".rs", ".md", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".jpg", ".jpeg", ".png",
  ".gif", ".bmp", ".webp", ".avif", ".svg", ".mp3", ".mp4", ".avi", ".mkv", ".mov", ".wav", ".flac",
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".log", ".bak", ".tmp", ".cache",
])

interface NormalizedTrenameInput {
  action: TrenameAction
  paths: string[]
  includeHidden: boolean
  includeRoot: boolean
  excludeExts: string[]
  excludePatterns: string[]
  maxLines: number
  compact: boolean
  mode: TrenameScanMode
  jsonContent: string
  basePath: string
  dryRun: boolean
  batchId: string
  undoPath: string
  keepRecent: number
}

interface CandidateOperation extends TrenameOperation {
  key: string
}

interface UndoStore {
  batches: TrenameUndoBatch[]
}

export function normalizeTrenameInput(input: TrenameInput): NormalizedTrenameInput {
  return {
    action: input.action ?? "scan",
    paths: normalizePaths(input.paths ?? input.path),
    includeHidden: input.includeHidden ?? input.include_hidden ?? false,
    includeRoot: input.includeRoot ?? input.include_root ?? true,
    excludeExts: normalizeExts(input.excludeExts ?? input.exclude_exts ?? DEFAULT_EXCLUDE_EXTS),
    excludePatterns: normalizeList(input.excludePatterns ?? input.exclude_patterns),
    maxLines: Math.max(0, Math.floor(input.maxLines ?? input.max_lines ?? 1000)),
    compact: input.compact ?? true,
    mode: input.mode === "leak" ? "leak" : "normal",
    jsonContent: clean(input.jsonContent ?? input.json_content),
    basePath: clean(input.basePath ?? input.base_path),
    dryRun: input.dryRun ?? input.dry_run ?? true,
    batchId: clean(input.batchId ?? input.batch_id),
    undoPath: clean(input.undoPath ?? input.undo_path),
    keepRecent: Math.max(0, Math.floor(input.keepRecent ?? input.keep_recent ?? 10)),
  }
}

export async function runTrename(
  input: TrenameInput,
  runtime: TrenameRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<TrenameResult> {
  const normalized = normalizeTrenameInput(input)
  try {
    if (normalized.action === "scan") return await runScan(normalized, runtime, onEvent)
    if (normalized.action === "import") return runImport(normalized)
    if (normalized.action === "validate") return await runValidate(normalized, runtime)
    if (normalized.action === "rename") return await runRename(normalized, runtime, onEvent)
    if (normalized.action === "undo") return await runUndo(normalized, runtime)
    return await runHistory(normalized, runtime)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function scanTrenamePaths(
  paths: string[],
  options: Pick<NormalizedTrenameInput, "includeHidden" | "includeRoot" | "excludeExts" | "excludePatterns" | "mode">,
  runtime: TrenameRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<{ renameJson: TrenameJson; basePath: string }> {
  const root: TrenameNode[] = []
  let basePath = ""
  const excludeRegexes = compileExcludeRegexes(options.excludePatterns)
  const leakRegexes = DEFAULT_LEAK_PREFIX_PATTERNS.map((pattern) => safeRegex(pattern)).filter(Boolean) as RegExp[]

  for (let index = 0; index < paths.length; index += 1) {
    const inputPath = paths[index]!
    const resolved = runtime.resolve(inputPath)
    const info = await runtime.pathInfo(resolved)
    if (!info.exists) throw new Error(`Path does not exist: ${inputPath}`)
    if (!info.isDirectory) throw new Error(`Path is not a directory: ${inputPath}`)
    if (!basePath) basePath = runtime.dirname(resolved)
    onEvent({ type: "progress", progress: 10 + Math.round((index / Math.max(paths.length, 1)) * 70), message: `Scanning ${runtime.basename(resolved)}` })

    if (options.includeRoot) {
      const node = await scanDir(resolved, options, excludeRegexes, leakRegexes, runtime)
      if (node) root.push(node)
    } else {
      root.push(...await scanChildren(resolved, options, excludeRegexes, leakRegexes, runtime))
    }
  }

  return { renameJson: { root }, basePath }
}

export function parseRenameJson(jsonContent: string): TrenameJson {
  const parsed = JSON.parse(jsonContent) as unknown
  return normalizeRenameJson(parsed)
}

export function countTotal(value: TrenameJson | TrenameNode): number {
  if (isRenameJson(value)) return value.root.reduce((sum, node) => sum + countTotal(node), 0)
  if (isFileNode(value)) return 1
  return 1 + value.children.reduce((sum, node) => sum + countTotal(node), 0)
}

export function countPending(value: TrenameJson | TrenameNode): number {
  if (isRenameJson(value)) return value.root.reduce((sum, node) => sum + countPending(node), 0)
  if (isFileNode(value)) return filePending(value) ? 1 : 0
  return (dirPending(value) ? 1 : 0) + value.children.reduce((sum, node) => sum + countPending(node), 0)
}

export function countReady(value: TrenameJson | TrenameNode): number {
  if (isRenameJson(value)) return value.root.reduce((sum, node) => sum + countReady(node), 0)
  if (isFileNode(value)) return fileReady(value) ? 1 : 0
  return (dirReady(value) ? 1 : 0) + value.children.reduce((sum, node) => sum + countReady(node), 0)
}

export function splitRenameJson(renameJson: TrenameJson, maxLines: number): TrenameJson[] {
  if (maxLines <= 0) return [renameJson]
  const segments: TrenameJson[] = []
  let current: TrenameNode[] = []
  let currentLines = 2
  for (const node of renameJson.root) {
    const lines = countSerializedLines(node)
    if (current.length && currentLines + lines > maxLines) {
      segments.push({ root: current })
      current = []
      currentLines = 2
    }
    current.push(node)
    currentLines += lines
  }
  if (current.length) segments.push({ root: current })
  return segments
}

export function stringifyRenameJson(renameJson: TrenameJson, compact = true): string {
  return compact ? compactRenameJson(renameJson) : JSON.stringify(renameJson, null, 2)
}

export function preprocessRenameJson(renameJson: TrenameJson): { renameJson: TrenameJson; messages: string[] } {
  const messages: string[] = []
  function visit(node: TrenameNode): TrenameNode {
    if (isFileNode(node)) {
      let tgt = node.tgt ?? ""
      if (tgt) {
        const sanitized = sanitizeFilename(tgt, false)
        messages.push(...sanitized.messages)
        const fixed = fixExtensionPosition(sanitized.name)
        messages.push(...fixed.messages)
        tgt = fixed.name
      }
      return { src: node.src, tgt }
    }

    let tgtDir = node.tgt_dir ?? ""
    if (tgtDir) {
      const sanitized = sanitizeFilename(tgtDir, true)
      messages.push(...sanitized.messages)
      tgtDir = sanitized.name
    }
    return { src_dir: node.src_dir, tgt_dir: tgtDir, children: node.children.map(visit) }
  }

  return { renameJson: { root: renameJson.root.map(visit) }, messages }
}

export async function validateRenameJson(
  renameJson: TrenameJson,
  basePath: string,
  runtime: TrenameRuntime,
): Promise<{ conflicts: TrenameConflict[]; operations: TrenameOperation[] }> {
  const candidates: CandidateOperation[] = []
  const conflicts: TrenameConflict[] = []
  const targetMap = new Map<string, CandidateOperation[]>()
  const resolvedBase = runtime.resolve(basePath)

  async function addCandidate(srcPath: string, rawTargetPath: string, srcName: string, targetName: string, isDir: boolean) {
    const validation = validateTargetName(targetName, srcName, isDir)
    for (const message of validation.messages) {
      if (message.startsWith("[ERROR]")) {
        conflicts.push({
          type: message.includes("extension") ? "invalid_extension" : "illegal_chars",
          srcPath,
          tgtPath: rawTargetPath,
          message,
        })
      }
    }

    const targetPath = isDir ? runtime.join(runtime.dirname(rawTargetPath), validation.name) : runtime.join(runtime.dirname(rawTargetPath), validation.name)
    const srcInfo = await runtime.pathInfo(srcPath)
    if (!srcInfo.exists) {
      conflicts.push({ type: "source_not_found", srcPath, tgtPath: targetPath, message: `Source not found: ${srcPath}` })
    }
    const targetInfo = await runtime.pathInfo(targetPath)
    if (targetInfo.exists && samePath(runtime, srcPath, targetPath) === false) {
      conflicts.push({ type: "target_exists", srcPath, tgtPath: targetPath, message: `Target already exists: ${targetPath}` })
    }

    const operation: CandidateOperation = { originalPath: srcPath, newPath: targetPath, key: operationKey(runtime, srcPath, targetPath) }
    candidates.push(operation)
    const targetKey = pathKey(runtime, targetPath)
    targetMap.set(targetKey, [...(targetMap.get(targetKey) ?? []), operation])
  }

  async function walk(node: TrenameNode, parentPath: string): Promise<void> {
    if (isFileNode(node)) {
      if (fileReady(node)) await addCandidate(runtime.join(parentPath, node.src), runtime.join(parentPath, node.tgt ?? ""), node.src, node.tgt ?? "", false)
      return
    }

    const sourcePath = runtime.join(parentPath, node.src_dir)
    for (const child of node.children) await walk(child, sourcePath)
    if (dirReady(node)) await addCandidate(sourcePath, runtime.join(parentPath, node.tgt_dir ?? ""), node.src_dir, node.tgt_dir ?? "", true)
  }

  for (const node of renameJson.root) await walk(node, resolvedBase)

  const blocked = new Set(conflicts.map((conflict) => operationKey(runtime, conflict.srcPath, conflict.tgtPath)))
  for (const operations of targetMap.values()) {
    if (operations.length <= 1) continue
    const [, ...duplicates] = operations.sort((a, b) => a.originalPath.localeCompare(b.originalPath, undefined, { numeric: true, sensitivity: "base" }))
    for (const operation of duplicates) {
      blocked.add(operation.key)
      conflicts.push({
        type: "duplicate_target",
        srcPath: operation.originalPath,
        tgtPath: operation.newPath,
        message: `Duplicate target skipped: ${operation.newPath}`,
      })
    }
  }

  return {
    conflicts,
    operations: candidates.filter((operation) => !blocked.has(operation.key)).map(({ originalPath, newPath }) => ({ originalPath, newPath })),
  }
}

async function runScan(normalized: NormalizedTrenameInput, runtime: TrenameRuntime, onEvent: (event: NodeRunEvent) => void): Promise<TrenameResult> {
  if (!normalized.paths.length) return failure("Scan requires at least one path.")
  const { renameJson, basePath } = await scanTrenamePaths(normalized.paths, normalized, runtime, onEvent)
  const segments = splitRenameJson(renameJson, normalized.maxLines).map((segment) => stringifyRenameJson(segment, normalized.compact))
  onEvent({ type: "progress", progress: 100, message: "Scan complete." })
  return success(`Scan complete: ${countTotal(renameJson)} item(s), ${segments.length} segment(s).`, dataFromJson(renameJson, { segments, jsonContent: segments[0] ?? "", basePath }))
}

function runImport(normalized: NormalizedTrenameInput): TrenameResult {
  if (!normalized.jsonContent) return failure("Import requires JSON content.")
  const renameJson = parseRenameJson(normalized.jsonContent)
  return success(`Import complete: ${countTotal(renameJson)} item(s), ${countReady(renameJson)} ready.`, dataFromJson(renameJson, { jsonContent: normalized.jsonContent, segments: [normalized.jsonContent] }))
}

async function runValidate(normalized: NormalizedTrenameInput, runtime: TrenameRuntime): Promise<TrenameResult> {
  if (!normalized.jsonContent) return failure("Validate requires JSON content.")
  const renameJson = parseRenameJson(normalized.jsonContent)
  const basePath = normalized.basePath || runtime.resolve(".")
  const validation = await validateRenameJson(renameJson, basePath, runtime)
  return success(
    validation.conflicts.length ? `Validation found ${validation.conflicts.length} conflict(s).` : "Validation complete: no conflicts.",
    dataFromJson(renameJson, { jsonContent: normalized.jsonContent, segments: [normalized.jsonContent], basePath, conflicts: validation.conflicts, operations: validation.operations }),
  )
}

async function runRename(normalized: NormalizedTrenameInput, runtime: TrenameRuntime, onEvent: (event: NodeRunEvent) => void): Promise<TrenameResult> {
  if (!normalized.jsonContent) return failure("Rename requires JSON content.")
  const parsed = parseRenameJson(normalized.jsonContent)
  const processed = preprocessRenameJson(parsed)
  const basePath = normalized.basePath || runtime.resolve(".")
  const validation = await validateRenameJson(processed.renameJson, basePath, runtime)
  if (normalized.dryRun) {
    return success(
      `Rename plan complete: ${validation.operations.length} operation(s), ${validation.conflicts.length} skipped.`,
      dataFromJson(processed.renameJson, {
        jsonContent: stringifyRenameJson(processed.renameJson, true),
        segments: [stringifyRenameJson(processed.renameJson, true)],
        basePath,
        conflicts: validation.conflicts,
        operations: validation.operations,
        successCount: validation.operations.length,
        skippedCount: validation.conflicts.length,
      }),
    )
  }

  const executed: TrenameOperation[] = []
  const failures: TrenameConflict[] = [...validation.conflicts]
  for (let index = 0; index < validation.operations.length; index += 1) {
    const operation = validation.operations[index]!
    onEvent({ type: "progress", progress: 10 + Math.round((index / Math.max(validation.operations.length, 1)) * 80), message: `${operation.originalPath} -> ${operation.newPath}` })
    try {
      await runtime.ensureDir(runtime.dirname(operation.newPath))
      await runtime.movePath(operation.originalPath, operation.newPath)
      executed.push(operation)
    } catch (error) {
      failures.push({
        type: "source_not_found",
        srcPath: operation.originalPath,
        tgtPath: operation.newPath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const operationId = executed.length ? await recordUndoBatch(runtime, normalized.undoPath, executed, `trename ${executed.length} item(s)`) : ""
  onEvent({ type: "progress", progress: 100, message: "Rename complete." })
  return {
    success: failures.length === validation.conflicts.length,
    message: `Rename complete: ${executed.length} succeeded, ${failures.length - validation.conflicts.length} failed, ${validation.conflicts.length} skipped.`,
    data: dataFromJson(processed.renameJson, {
      jsonContent: stringifyRenameJson(processed.renameJson, true),
      segments: [stringifyRenameJson(processed.renameJson, true)],
      basePath,
      conflicts: failures,
      operations: validation.operations,
      successCount: executed.length,
      failedCount: failures.length - validation.conflicts.length,
      skippedCount: validation.conflicts.length,
      operationId,
    }),
  }
}

async function runUndo(normalized: NormalizedTrenameInput, runtime: TrenameRuntime): Promise<TrenameResult> {
  const undoPath = resolveUndoPath(runtime, normalized.undoPath)
  const store = await loadUndoStore(runtime, undoPath)
  const batch = normalized.batchId
    ? store.batches.find((item) => item.id === normalized.batchId)
    : [...store.batches].filter((item) => !item.undone).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]

  if (!batch) return failure(normalized.batchId ? `Undo batch not found: ${normalized.batchId}` : "No undo batch available.")
  if (batch.undone) return failure(`Undo batch has already been undone: ${batch.id}`)

  let successCount = 0
  const conflicts: TrenameConflict[] = []
  for (const operation of [...batch.operations].reverse()) {
    try {
      const info = await runtime.pathInfo(operation.newPath)
      if (!info.exists) {
        conflicts.push({ type: "source_not_found", srcPath: operation.newPath, tgtPath: operation.originalPath, message: `Current path not found: ${operation.newPath}` })
        continue
      }
      await runtime.ensureDir(runtime.dirname(operation.originalPath))
      await runtime.movePath(operation.newPath, operation.originalPath)
      successCount += 1
    } catch (error) {
      conflicts.push({ type: "source_not_found", srcPath: operation.newPath, tgtPath: operation.originalPath, message: error instanceof Error ? error.message : String(error) })
    }
  }

  batch.undone = true
  await writeUndoStore(runtime, undoPath, store)
  return success(`Undo complete: ${successCount} succeeded, ${conflicts.length} failed.`, emptyData({ successCount, failedCount: conflicts.length, conflicts, operationId: batch.id, history: store.batches.slice(0, normalized.keepRecent) }))
}

async function runHistory(normalized: NormalizedTrenameInput, runtime: TrenameRuntime): Promise<TrenameResult> {
  const store = await loadUndoStore(runtime, resolveUndoPath(runtime, normalized.undoPath))
  return success(`History loaded: ${store.batches.length} batch(es).`, emptyData({ history: store.batches.slice(0, normalized.keepRecent) }))
}

async function scanChildren(
  dirPath: string,
  options: Pick<NormalizedTrenameInput, "includeHidden" | "excludeExts" | "mode">,
  excludeRegexes: RegExp[],
  leakRegexes: RegExp[],
  runtime: TrenameRuntime,
): Promise<TrenameNode[]> {
  const entries = (await runtime.listDir(dirPath))
    .filter((entry) => options.includeHidden || !entry.name.startsWith("."))
    .filter((entry) => !excludeRegexes.some((regex) => regex.test(entry.name)))
    .sort((a, b) => Number(!a.isDirectory) - Number(!b.isDirectory) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
  const nodes: TrenameNode[] = []
  for (const entry of entries) {
    if (entry.isDirectory) {
      const dir = await scanDir(entry.path, options, excludeRegexes, leakRegexes, runtime)
      if (dir) nodes.push(dir)
    } else if (entry.isFile && allowFile(entry.name, options, leakRegexes)) {
      nodes.push({ src: entry.name, tgt: "" })
    }
  }
  return nodes
}

async function scanDir(
  dirPath: string,
  options: Pick<NormalizedTrenameInput, "includeHidden" | "excludeExts" | "mode">,
  excludeRegexes: RegExp[],
  leakRegexes: RegExp[],
  runtime: TrenameRuntime,
): Promise<TrenameDirNode | null> {
  const children = await scanChildren(dirPath, options, excludeRegexes, leakRegexes, runtime)
  if (options.mode === "leak" && children.length === 0) return null
  return { src_dir: runtime.basename(dirPath), tgt_dir: "", children }
}

function allowFile(name: string, options: Pick<NormalizedTrenameInput, "excludeExts" | "mode">, leakRegexes: RegExp[]): boolean {
  const ext = fileExt(name)
  if (options.excludeExts.includes(ext)) return false
  if (options.mode !== "leak") return true
  if (!DEFAULT_ARCHIVE_EXTS.includes(ext)) return false
  const stem = name.slice(0, name.length - ext.length)
  return !leakRegexes.some((regex) => regex.test(stem))
}

function validateTargetName(tgt: string, src: string, isDir: boolean): { name: string; messages: string[] } {
  const sanitized = sanitizeFilename(tgt, isDir)
  const messages = [...sanitized.messages]
  if (!isDir) {
    messages.push(...validateExtensionPosition(sanitized.name))
    const srcExt = fileExt(src)
    const tgtExt = fileExt(sanitized.name)
    if (srcExt && tgtExt && srcExt !== tgtExt) messages.push(`[WARNING] extension changed: ${srcExt} -> ${tgtExt}`)
  }
  return { name: sanitized.name, messages }
}

function sanitizeFilename(name: string, isDir: boolean): { name: string; messages: string[] } {
  if (!name) return { name, messages: [] }
  if (isDir || !name.includes(".")) {
    const next = name.replace(ILLEGAL_CHARS, "_").trim()
    return { name: next, messages: next === name ? [] : ["[AUTO-FIX] illegal path characters were replaced."] }
  }
  const dot = name.lastIndexOf(".")
  const base = name.slice(0, dot)
  const ext = name.slice(dot)
  if (ILLEGAL_CHARS.test(ext)) return { name, messages: [`[ERROR] extension contains illegal characters: ${ext}`] }
  ILLEGAL_CHARS.lastIndex = 0
  const nextBase = base.replace(ILLEGAL_CHARS, "_").trim()
  ILLEGAL_CHARS.lastIndex = 0
  return { name: `${nextBase}${ext}`, messages: nextBase === base ? [] : ["[AUTO-FIX] illegal path characters were replaced."] }
}

function validateExtensionPosition(name: string): string[] {
  const messages: string[] = []
  for (const part of name.split(".").slice(1)) {
    const match = /^([a-zA-Z0-9]+)([\[_\-\( ].+)$/.exec(part)
    if (!match) continue
    const ext = `.${match[1]!.toLowerCase()}`
    if (COMMON_EXTS.has(ext)) messages.push(`[ERROR] extension suffix should be placed before ${ext}: ${name}`)
  }
  return messages
}

function fixExtensionPosition(name: string): { name: string; messages: string[] } {
  const parts = name.split(".")
  if (parts.length < 2) return { name, messages: [] }
  let base = parts[0]!
  const fixed: string[] = []
  const messages: string[] = []
  for (const part of parts.slice(1)) {
    const match = /^([a-zA-Z0-9]+)([\[_\-\( ].+)$/.exec(part)
    if (match && COMMON_EXTS.has(`.${match[1]!.toLowerCase()}`)) {
      base += match[2]
      fixed.push(match[1]!)
      messages.push(`[AUTO-FIX] extension suffix moved before .${match[1]}`)
    } else {
      fixed.push(part)
    }
  }
  return { name: [base, ...fixed].join("."), messages }
}

function dataFromJson(renameJson: TrenameJson, partial: Partial<TrenameData> = {}): TrenameData {
  return emptyData({
    totalItems: countTotal(renameJson),
    pendingCount: countPending(renameJson),
    readyCount: countReady(renameJson),
    ...partial,
  })
}

function success(message: string, data: TrenameData): TrenameResult {
  return { success: true, message, data }
}

function failure(message: string): TrenameResult {
  return { success: false, message, data: emptyData({ errors: [message], failedCount: 1 }) }
}

function emptyData(partial: Partial<TrenameData> = {}): TrenameData {
  return {
    jsonContent: "",
    segments: [],
    totalItems: 0,
    pendingCount: 0,
    readyCount: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    operationId: "",
    conflicts: [],
    operations: [],
    history: [],
    basePath: "",
    errors: [],
    ...partial,
  }
}

function compactRenameJson(renameJson: TrenameJson): string {
  const lines = ["{", '  "root": [']
  renameJson.root.forEach((node, index) => {
    const block = formatNode(node, 2)
    lines.push(`${block}${index < renameJson.root.length - 1 ? "," : ""}`)
  })
  lines.push("  ]", "}")
  return lines.join("\n")
}

function formatNode(node: TrenameNode, indent: number): string {
  const pad = "  ".repeat(indent)
  if (isFileNode(node)) return `${pad}{"src": ${JSON.stringify(node.src)}, "tgt": ${JSON.stringify(node.tgt ?? "")}}`
  const lines = [`${pad}{"src_dir": ${JSON.stringify(node.src_dir)}, "tgt_dir": ${JSON.stringify(node.tgt_dir ?? "")}, "children": [`]
  node.children.forEach((child, index) => lines.push(`${formatNode(child, indent + 1)}${index < node.children.length - 1 ? "," : ""}`))
  lines.push(`${pad}  ]`, `${pad}}`)
  return lines.join("\n")
}

function countSerializedLines(node: TrenameNode): number {
  if (isFileNode(node)) return 1
  return 3 + node.children.reduce((sum, child) => sum + countSerializedLines(child), 0)
}

function normalizeRenameJson(value: unknown): TrenameJson {
  const record = asRecord(value)
  const root = Array.isArray(record.root) ? record.root.map(normalizeNode).filter(Boolean) as TrenameNode[] : []
  return { root }
}

function normalizeNode(value: unknown): TrenameNode | null {
  const record = asRecord(value)
  if (typeof record.src === "string") return { src: record.src, tgt: stringValue(record.tgt) }
  if (typeof record.src_dir === "string") {
    return {
      src_dir: record.src_dir,
      tgt_dir: stringValue(record.tgt_dir),
      children: Array.isArray(record.children) ? record.children.map(normalizeNode).filter(Boolean) as TrenameNode[] : [],
    }
  }
  return null
}

async function recordUndoBatch(runtime: TrenameRuntime, inputPath: string, operations: TrenameOperation[], description: string): Promise<string> {
  const undoPath = resolveUndoPath(runtime, inputPath)
  const store = await loadUndoStore(runtime, undoPath)
  const id = clean(runtime.randomId()).slice(0, 8) || String(store.batches.length + 1)
  store.batches.unshift({ id, timestamp: runtime.now(), description, undone: false, operations })
  await writeUndoStore(runtime, undoPath, store)
  return id
}

async function loadUndoStore(runtime: TrenameRuntime, undoPath: string): Promise<UndoStore> {
  const info = await runtime.pathInfo(undoPath)
  if (!info.exists) return { batches: [] }
  const parsed = JSON.parse(await runtime.readText(undoPath)) as unknown
  const batches = Array.isArray(asRecord(parsed).batches) ? asRecord(parsed).batches as unknown[] : []
  return {
    batches: batches.map((item) => {
      const record = asRecord(item)
      return {
        id: stringValue(record.id),
        timestamp: stringValue(record.timestamp),
        description: stringValue(record.description),
        undone: Boolean(record.undone),
        operations: Array.isArray(record.operations) ? record.operations.map((operation) => {
          const op = asRecord(operation)
          return { originalPath: stringValue(op.originalPath), newPath: stringValue(op.newPath) }
        }).filter((operation) => operation.originalPath && operation.newPath) : [],
      }
    }).filter((item) => item.id),
  }
}

async function writeUndoStore(runtime: TrenameRuntime, undoPath: string, store: UndoStore): Promise<void> {
  await runtime.ensureDir(runtime.dirname(undoPath))
  await runtime.writeText(undoPath, `${JSON.stringify(store, null, 2)}\n`)
}

function resolveUndoPath(runtime: TrenameRuntime, inputPath: string): string {
  return runtime.resolve(inputPath || runtime.defaultUndoPath())
}

function compileExcludeRegexes(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => safeRegex(PRESET_PATTERNS[pattern] ?? pattern)).filter(Boolean) as RegExp[]
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

function normalizePaths(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return unique(value.map(clean).filter(Boolean))
  if (typeof value === "string") return unique(splitPathInput(value).map(clean).filter(Boolean))
  return []
}

function splitPathInput(value: string): string[] {
  const matches = [...value.matchAll(/"([^"]+)"|(\S+)/g)]
  return matches.length ? matches.map((match) => match[1] ?? match[2] ?? "") : []
}

function normalizeExts(value: string[] | string | undefined): string[] {
  return normalizeList(value).map((item) => item.startsWith(".") ? item.toLowerCase() : `.${item.toLowerCase()}`)
}

function normalizeList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return unique(value.map(String).map(clean).filter(Boolean))
  if (typeof value === "string") return unique(value.split(/[,;\n]+/).map(clean).filter(Boolean))
  return []
}

function fileExt(name: string): string {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(index).toLowerCase() : ""
}

function isRenameJson(value: TrenameJson | TrenameNode): value is TrenameJson {
  return "root" in value
}

function isFileNode(value: TrenameNode): value is TrenameFileNode {
  return "src" in value
}

function filePending(node: TrenameFileNode): boolean {
  return clean(node.tgt) === ""
}

function dirPending(node: TrenameDirNode): boolean {
  return clean(node.tgt_dir) === ""
}

function fileReady(node: TrenameFileNode): boolean {
  return Boolean(clean(node.tgt) && node.tgt !== node.src)
}

function dirReady(node: TrenameDirNode): boolean {
  return Boolean(clean(node.tgt_dir) && node.tgt_dir !== node.src_dir)
}

function operationKey(runtime: TrenameRuntime, srcPath: string, tgtPath: string): string {
  return `${pathKey(runtime, srcPath)}\u0000${pathKey(runtime, tgtPath)}`
}

function pathKey(runtime: TrenameRuntime, path: string): string {
  return runtime.resolve(path).replace(/\\/g, "/").toLowerCase()
}

function samePath(runtime: TrenameRuntime, left: string, right: string): boolean {
  return pathKey(runtime, left) === pathKey(runtime, right)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function clean(value = ""): string {
  return value.trim().replace(/^["']|["']$/g, "")
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}
