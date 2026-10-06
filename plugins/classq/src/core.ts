/**
 * classq 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/classq/src/core.ts`
 * （255 行）逐字搬来：类型、默认值、函数顺序、判据、去重规则全部原样，
 * **一处逻辑都没改**。
 *
 * 唯一的改动是第 1 行那条 import：`@xiranite/contract` 的两个类型换成本包的
 * `./contract.ts` 垫片（理由见那个文件的头注释与 ADR-0002）。台账里这个节点的
 * hostRequirements 是 `recursive-enumeration+file-io`，而**这份文件本身仍然零 I/O**：
 * 触达机器的动作全从 `ClassqRuntime` 那 8 个方法注入（上游原本就这么设计），
 * 落地实现在 `src/platform.ts`。
 *
 * 行为随上游保持，接线方与 platform 都不许"顺手改进"（这些都是会被顺手改掉的地方）：
 * - 递归找关键词目录（`findKeywordFolders`）：只看**目录**、名字 `toLowerCase().includes(keyword)`，
 *   先收自己再下钻，**不排序**、不剪枝、不防环；
 * - 关键词目录只按"父目录"去重（`processedParents` 用 `normalizePath` 后的小写斜杠形），
 *   所以同一个父目录里两个关键词目录只产一条 keyword 项；
 * - 同级项进 wait 目录时排除三项：关键词目录本身、wait 目录本身、**名字含关键词的目录**
 *   （文件同名的不排除），既不是文件也不是目录的条目（`Dirent` 下的符号链接）静默跳过；
 * - 目标已存在 ⇒ `conflict`，reason 按 `existingPolicy` 分 `target_exists` / `target_exists_skip`，
 *   **两种 policy 都只报告不动手**（上游就这么写的，这里不替它补"跳过"的实现）；
 * - `success()` 的 `success` 只看 `errorCount`，conflict 不进错误数 ⇒ 有冲突时仍报成功；
 * - `transferMode` 默认 `move`、`dryRun` 默认 `true`：**没关掉预演就一个文件都不动**。
 *
 * @module xaihi-classq/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type ClassqAction = "plan" | "classify"
export type ClassqTransferMode = "move" | "copy"
export type ClassqExistingPolicy = "merge" | "skip"
export type ClassqPlanStatus = "found" | "ready" | "skipped" | "moved" | "copied" | "conflict" | "error"
export type ClassqStage = "keyword" | "wait"

export interface ClassqInput {
  action?: ClassqAction
  path?: string
  paths?: string[]
  listText?: string
  keyword?: string
  waitKeyword?: string
  transferMode?: ClassqTransferMode
  existingPolicy?: ClassqExistingPolicy
  dryRun?: boolean
}

export interface ClassqDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface ClassqPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export interface ClassqPlanItem {
  rootPath: string
  parentPath: string
  keywordPath: string
  sourcePath: string
  targetPath: string
  sourceName: string
  targetRelative: string
  kind: "file" | "folder"
  stage: ClassqStage
  status: ClassqPlanStatus
  reason?: string
}

export interface ClassqData {
  action: ClassqAction
  keyword: string
  waitKeyword: string
  transferMode: ClassqTransferMode
  items: ClassqPlanItem[]
  rootCount: number
  keywordCount: number
  readyCount: number
  waitCount: number
  movedCount: number
  copiedCount: number
  conflictCount: number
  errorCount: number
  errors: string[]
}

export interface ClassqRuntime {
  pathInfo: (path: string) => Promise<ClassqPathInfo>
  listDir: (path: string) => Promise<ClassqDirEntry[]>
  ensureDir: (path: string) => Promise<void>
  transfer: (source: string, target: string, mode: ClassqTransferMode) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  relative: (from: string, to: string) => string
}

export type ClassqResult = NodeRunResult<ClassqData>

export function normalizeClassqInput(input: ClassqInput): Required<ClassqInput> {
  return {
    action: input.action ?? "plan",
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]),
    listText: input.listText ?? "",
    keyword: clean(input.keyword) || "already",
    waitKeyword: clean(input.waitKeyword) || "wait",
    transferMode: input.transferMode ?? "move",
    existingPolicy: input.existingPolicy ?? "merge",
    dryRun: input.dryRun ?? true,
  }
}

export async function runClassq(input: ClassqInput, runtime: ClassqRuntime, onEvent: (event: NodeRunEvent) => void = () => {}): Promise<ClassqResult> {
  const normalized = normalizeClassqInput(input)
  try {
    if (!normalized.paths.length) return failure("At least one root directory is required.", normalized)
    onEvent({ type: "progress", progress: 20, message: "Scanning keyword folders." })
    const planned = await buildClassqPlan(normalized, runtime)
    if (normalized.action !== "classify" || normalized.dryRun) return success(`ClassQ planned ${planned.items.length} item(s).`, planned)

    onEvent({ type: "progress", progress: 70, message: "Applying wait-folder transfers." })
    const applied: ClassqPlanItem[] = []
    for (const item of planned.items) {
      if (item.status !== "ready") {
        applied.push(item)
        continue
      }
      try {
        await runtime.ensureDir(runtime.dirname(item.targetPath))
        await runtime.transfer(item.sourcePath, item.targetPath, normalized.transferMode)
        applied.push({ ...item, status: normalized.transferMode === "copy" ? "copied" : "moved" })
      } catch (error) {
        applied.push({ ...item, status: "error", reason: errorMessage(error) })
      }
    }
    return success(`ClassQ applied ${applied.filter((item) => item.status === "moved" || item.status === "copied").length} transfer(s).`, data(normalized, applied))
  } catch (error) {
    return failure(errorMessage(error), normalized)
  }
}

export async function buildClassqPlan(input: Required<ClassqInput>, runtime: ClassqRuntime): Promise<ClassqData> {
  const keywordLower = input.keyword.toLowerCase()
  const items: ClassqPlanItem[] = []
  for (const root of input.paths) {
    const info = await runtime.pathInfo(root)
    if (!info.exists || !info.isDirectory) {
      items.push(errorItem(root, root, root, root, "root_not_directory", runtime))
      continue
    }

    const keywordFolders = await findKeywordFolders(root, keywordLower, runtime)
    if (!keywordFolders.length) {
      items.push(errorItem(root, root, root, root, "keyword_folder_missing", runtime))
      continue
    }

    const processedParents = new Set<string>()
    for (const keywordFolder of keywordFolders) {
      const parent = runtime.dirname(keywordFolder.path)
      const parentKey = normalizePath(parent)
      if (processedParents.has(parentKey)) continue
      processedParents.add(parentKey)
      items.push(keywordItem(root, parent, keywordFolder, input.waitKeyword, runtime))

      const waitDir = runtime.join(parent, input.waitKeyword)
      const siblings = await runtime.listDir(parent)
      for (const sibling of siblings) {
        if (normalizePath(sibling.path) === normalizePath(keywordFolder.path)) continue
        if (normalizePath(sibling.path) === normalizePath(waitDir)) continue
        if (sibling.isDirectory && sibling.name.toLowerCase().includes(keywordLower)) continue
        if (!sibling.isFile && !sibling.isDirectory) continue
        items.push(await planWaitTransfer(root, keywordFolder.path, sibling, waitDir, input.existingPolicy, runtime))
      }
    }
  }
  return data(input, items)
}

export async function findKeywordFolders(root: string, keywordLower: string, runtime: ClassqRuntime): Promise<ClassqDirEntry[]> {
  const found: ClassqDirEntry[] = []
  const entries = await runtime.listDir(root)
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    if (entry.name.toLowerCase().includes(keywordLower)) found.push(entry)
    found.push(...await findKeywordFolders(entry.path, keywordLower, runtime))
  }
  return found
}

function keywordItem(rootPath: string, parentPath: string, keywordFolder: ClassqDirEntry, waitKeyword: string, runtime: ClassqRuntime): ClassqPlanItem {
  const waitDir = runtime.join(parentPath, waitKeyword)
  return {
    rootPath,
    parentPath,
    keywordPath: keywordFolder.path,
    sourcePath: keywordFolder.path,
    targetPath: waitDir,
    sourceName: keywordFolder.name,
    targetRelative: runtime.relative(rootPath, waitDir),
    kind: "folder",
    stage: "keyword",
    status: "found",
  }
}

async function planWaitTransfer(rootPath: string, keywordPath: string, source: ClassqDirEntry, waitDir: string, policy: ClassqExistingPolicy, runtime: ClassqRuntime): Promise<ClassqPlanItem> {
  const targetPath = runtime.join(waitDir, source.name)
  const base: Omit<ClassqPlanItem, "status"> = {
    rootPath,
    parentPath: runtime.dirname(source.path),
    keywordPath,
    sourcePath: source.path,
    targetPath,
    sourceName: source.name,
    targetRelative: runtime.relative(rootPath, targetPath),
    kind: source.isDirectory ? "folder" : "file",
    stage: "wait",
  }
  const targetInfo = await runtime.pathInfo(targetPath)
  if (targetInfo.exists) return { ...base, status: "conflict", reason: policy === "skip" ? "target_exists_skip" : "target_exists" }
  return { ...base, status: "ready" }
}

function data(input: Required<ClassqInput>, items: ClassqPlanItem[]): ClassqData {
  const errors = items.filter((item) => item.reason && (item.status === "error" || item.status === "conflict")).map((item) => `${item.sourcePath}: ${item.reason}`)
  return {
    action: input.action,
    keyword: input.keyword,
    waitKeyword: input.waitKeyword,
    transferMode: input.transferMode,
    items,
    rootCount: input.paths.length,
    keywordCount: items.filter((item) => item.stage === "keyword" && item.status === "found").length,
    readyCount: items.filter((item) => item.status === "ready").length,
    waitCount: items.filter((item) => item.stage === "wait").length,
    movedCount: items.filter((item) => item.status === "moved").length,
    copiedCount: items.filter((item) => item.status === "copied").length,
    conflictCount: items.filter((item) => item.status === "conflict").length,
    errorCount: items.filter((item) => item.status === "error").length,
    errors,
  }
}

function success(message: string, data: ClassqData): ClassqResult {
  return { success: data.errorCount === 0, message, data }
}

function failure(message: string, input: Required<ClassqInput>): ClassqResult {
  return { success: false, message, data: data(input, [{ rootPath: "", parentPath: "", keywordPath: "", sourcePath: "", targetPath: "", sourceName: "", targetRelative: "", kind: "folder", stage: "wait", status: "error", reason: message }]) }
}

function errorItem(rootPath: string, parentPath: string, keywordPath: string, sourcePath: string, reason: string, runtime: Pick<ClassqRuntime, "basename">): ClassqPlanItem {
  return { rootPath, parentPath, keywordPath, sourcePath, targetPath: sourcePath, sourceName: runtime.basename(sourcePath), targetRelative: runtime.basename(sourcePath), kind: "folder", stage: "wait", status: "error", reason }
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
