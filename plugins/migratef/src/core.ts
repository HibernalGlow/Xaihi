/**
 * migratef 的内核，从 `<Xiranite>` tag `noxide`（ADR-0003 记的 commit `ccf465fe`）的
 * `packages/nodes/migratef/src/core.ts`（**458 行**）逐字搬来：类型、默认值、判定顺序、
 * reason 文案与消息模板全部原样，**一处逻辑都没改**。唯一改动是第 1 行那条 import ——
 * `@xiranite/contract` 的两个类型换成本包的 `./contract.ts` 垫片（理由见那个文件的头注释
 * 与 `docs/adr/0002-self-contained-plugin-packages.md`）。保真度由 `tests/core.spec.ts` 守住，
 * 期望值手抄上游 `core.test.ts`（那里连 `memoryRuntime` 的假 `join`/`dirname` 一起搬）。
 *
 * 本文件**零 I/O**：触达机器的动作全从 `MigratefRuntime` 那 17 个方法注入（`:72-90`），
 * 落地实现在 `src/platform.ts`（`node:fs/promises` + `node:path`，ADR-0003 决定 1）。
 *
 * 会被"顺手优化"改掉的枚举与顺序语义，逐条钉在这里：
 * - 内核默认（`:94-111`）：`action` `move`、`mode` `preserve`、`maxWorkers` 16、
 *   `historyLimit` 10、`dryRun` **false**、`relativeTargetBase` `working-directory`、
 *   `mergeExistingDirectories` false。定义里 `dryRun` 的界面默认是 **true**，两边不许合并；
 *   `maxWorkers` 内核**从不消费**（上游也没有并发实现），不在这里假装并发。
 * - `path` 是 **unshift 到最前**（`:95-96`），随后 `clean` + 去空 + `new Set` 去重：
 *   顺序 = `[path, ...sourcePaths]`。
 * - `runMigratef`（`:113-134`）把**所有**异常咽成 `failure(error.message)`：
 *   `buildMigratefPlan` 那两条 `throw`（`:137-138`）与 runtime 的拒绝（见 `platform.ts`
 *   的账本路径闸门）到这一层都变成 `success:false`，**不是抛出去**。接线层按
 *   `success` 判失败并原样抛给宿主，不在这里加第二次判断。
 * - 只有 `plan` 或 `dryRun` 成立才停在计划（`:123-129`），消息模板是
 *   `Plan generated: N item(s).`，N 数的是 `status === "pending"`。
 * - 四种 skip 的 reason 逐字：`source_missing`（`:145`）、`no_files`（`:180`）、
 *   `target_exists`（`:173`、`:413`）、`source_target_same`（`:159`）。
 * - `direct` 模式用 `resolveTargetRoot`（`:370-377`）：目标本身是绝对路径**或**
 *   `relativeTargetBase` 是 `working-directory` 就直接用，否则相对**来源的父目录**解析；
 *   同一性判据是 `resolve(info.path) === resolve(targetInfo.path)`（`:152`）。
 * - `preserveRelativeTarget`（`:207-212`）先砍盘符 `^[A-Za-z]:`、再砍**前导分隔符**、
 *   最后把 `[:*?"<>|]` 换成 `_`。顺序有意义：先剥前缀再替换，反了就多一层目录。
 * - `collectFiles`（`:193-205`）：flat 模式 `recursive=false` 只收一层；
 *   `listDir` 里既非 file 又非 directory 的条目（符号链接）被静默跳过。
 * - `executePlan`（`:229-283`）：`remove-empty-source` 条目**先 `listDir` 回读**，
 *   非空就 throw 成一条 error 条目（`:246-247`），所以合并目录时源目录还剩东西不会被删；
 *   进度是 `Math.round((index / Math.max(pending.length, 1)) * 100)`（`:243`）+ 收尾 `100`
 *   （`:270`）⇒ 百分数，与 crashu / formatv 同档。
 * - 账本只记 `status === "success"` 且 `operation !== "remove-empty-source"` 的条目
 *   （`:291`），上限 100 条（`:305`）；`operationId` 来自 `randomId()`，没记成时是**空串**。
 * - `undo`（`:314-360`）反序回放：move 走 `ensureDir` + `movePath`，copy 走 `deletePath`；
 *   被删过的源目录按**路径长度升序**重建（`:342`，先浅后深）；`undone` 只在
 *   `failedCount === 0` 时置真，并且**整份记录写回**同一个文件。
 * - `historyPath`（`:362-364`）= `input.historyPath || runtime.defaultHistoryPath()`。
 *   上游 `defaultHistoryPath` 从 `@xiranite/config` 的位置推；本仓那条通路整块不搬
 *   （ADR-0013），所以 `src/platform.ts` 里它是一声**响亮拒绝**，而 `src/index.ts` /
 *   `src/cli.ts` 在**动手之前**就要账本路径有明确出处（ADR-0003 决定 2）。
 *   内核这一行一个字都没改：闸门在缝外，不在内核里。
 *
 * @module xaihi-migratef/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type MigratefAction = "move" | "copy" | "undo" | "history" | "plan"
export type MigratefMode = "preserve" | "flat" | "direct"
export type MigratefRelativeTargetBase = "working-directory" | "source-parent"

export interface MigratefInput {
  action?: MigratefAction
  mode?: MigratefMode
  path?: string
  sourcePaths?: string[]
  targetPath?: string
  maxWorkers?: number
  batchId?: string
  historyLimit?: number
  historyPath?: string
  dryRun?: boolean
  relativeTargetBase?: MigratefRelativeTargetBase
  mergeExistingDirectories?: boolean
}

export interface MigratefPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export interface MigratefDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface MigrateOperation {
  sourcePath: string
  targetPath: string
  action: "move" | "copy"
}

export interface MigratePlanItem extends MigrateOperation {
  kind: "file" | "directory"
  operation?: "transfer" | "remove-empty-source"
  status: "pending" | "skipped" | "success" | "error"
  reason?: string
}

export interface UndoRecord {
  id: string
  timestamp: string
  description: string
  action: "move" | "copy"
  operations: MigrateOperation[]
  removedSourceDirectories?: string[]
  undone?: boolean
}

export interface MigratefData {
  plan: MigratePlanItem[]
  history: UndoRecord[]
  migratedCount: number
  skippedCount: number
  errorCount: number
  totalCount: number
  operationId: string
  successCount: number
  failedCount: number
  errors: string[]
}

export interface MigratefRuntime {
  pathInfo: (path: string) => Promise<MigratefPathInfo>
  listDir: (path: string) => Promise<MigratefDirEntry[]>
  ensureDir: (path: string) => Promise<void>
  copyFile: (source: string, target: string) => Promise<void>
  copyDir: (source: string, target: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  deletePath: (path: string) => Promise<void>
  readText: (path: string) => Promise<string | null>
  writeText: (path: string, content: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  isAbsolute: (path: string) => boolean
  resolve: (...parts: string[]) => string
  now: () => Date
  randomId: () => string
  defaultHistoryPath: () => string
}

export type MigratefResult = NodeRunResult<MigratefData>

export function normalizeMigratefInput(input: MigratefInput): Required<MigratefInput> {
  const paths = [...(input.sourcePaths ?? [])]
  if (input.path) paths.unshift(input.path)
  return {
    action: input.action ?? "move",
    mode: input.mode ?? "preserve",
    path: clean(input.path),
    sourcePaths: [...new Set(paths.map(clean).filter(Boolean))],
    targetPath: clean(input.targetPath),
    maxWorkers: input.maxWorkers ?? 16,
    batchId: clean(input.batchId),
    historyLimit: input.historyLimit ?? 10,
    historyPath: clean(input.historyPath),
    dryRun: input.dryRun ?? false,
    relativeTargetBase: input.relativeTargetBase ?? "working-directory",
    mergeExistingDirectories: input.mergeExistingDirectories ?? false,
  }
}

export async function runMigratef(
  input: MigratefInput,
  runtime: MigratefRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<MigratefResult> {
  const normalized = normalizeMigratefInput(input)
  try {
    if (normalized.action === "history") return await history(normalized, runtime)
    if (normalized.action === "undo") return await undo(normalized, runtime, onEvent)
    const plan = await buildMigratefPlan(normalized, runtime)
    if (normalized.action === "plan" || normalized.dryRun) {
      return success(`Plan generated: ${plan.filter((item) => item.status === "pending").length} item(s).`, {
        plan,
        totalCount: plan.length,
        skippedCount: plan.filter((item) => item.status === "skipped").length,
      })
    }
    return await executePlan(normalized, plan, runtime, onEvent)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function buildMigratefPlan(input: Required<MigratefInput>, runtime: MigratefRuntime): Promise<MigratePlanItem[]> {
  if (!input.sourcePaths.length) throw new Error("At least one source path is required.")
  if (!input.targetPath) throw new Error("Target path is required.")

  const action = input.action === "copy" ? "copy" : "move"
  const plan: MigratePlanItem[] = []
  for (const source of input.sourcePaths) {
    const info = await runtime.pathInfo(source)
    if (!info.exists) {
      plan.push({ sourcePath: source, targetPath: "", action, kind: "file", status: "skipped", reason: "source_missing" })
      continue
    }
    if (input.mode === "direct") {
      const targetRoot = resolveTargetRoot(input, info, runtime)
      const targetPath = runtime.join(targetRoot, runtime.basename(info.path))
      const targetInfo = await runtime.pathInfo(targetPath)
      if (targetInfo.exists && runtime.resolve(info.path) === runtime.resolve(targetInfo.path)) {
        plan.push({
          sourcePath: info.path,
          targetPath: targetInfo.path,
          action,
          kind: info.isDirectory ? "directory" : "file",
          status: "skipped",
          reason: "source_target_same",
        })
        continue
      }
      if (input.mergeExistingDirectories && info.isDirectory && targetInfo.isDirectory) {
        await appendMergedDirectoryPlan(info.path, targetInfo.path, action, runtime, plan)
        continue
      }
      plan.push({
        sourcePath: info.path,
        targetPath,
        action,
        kind: info.isDirectory ? "directory" : "file",
        status: targetInfo.exists ? "skipped" : "pending",
        ...(targetInfo.exists ? { reason: "target_exists" } : {}),
      })
      continue
    }

    const files = await collectFiles(info, input.mode === "preserve", runtime)
    if (!files.length) {
      plan.push({ sourcePath: info.path, targetPath: "", action, kind: info.isDirectory ? "directory" : "file", status: "skipped", reason: "no_files" })
      continue
    }
    for (const file of files) {
      const targetPath = input.mode === "preserve"
        ? runtime.join(input.targetPath, preserveRelativeTarget(file.path))
        : runtime.join(input.targetPath, runtime.basename(file.path))
      plan.push({ sourcePath: file.path, targetPath, action, kind: "file", status: "pending" })
    }
  }
  return plan
}

export async function collectFiles(source: MigratefPathInfo, recursive: boolean, runtime: MigratefRuntime): Promise<MigratefPathInfo[]> {
  if (source.isFile) return [source]
  if (!source.isDirectory) return []
  const files: MigratefPathInfo[] = []
  async function walk(path: string) {
    for (const entry of await runtime.listDir(path)) {
      if (entry.isFile) files.push({ path: entry.path, exists: true, isFile: true, isDirectory: false })
      else if (entry.isDirectory && recursive) await walk(entry.path)
    }
  }
  await walk(source.path)
  return files
}

export function preserveRelativeTarget(path: string): string {
  return path
    .replace(/^[A-Za-z]:/, "")
    .replace(/^[/\\]+/, "")
    .replace(/[:*?"<>|]/g, "_")
}

export function parseMigratefHistory(content: string | null): UndoRecord[] {
  if (!content?.trim()) return []
  try {
    const parsed = JSON.parse(content) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isUndoRecord)
  } catch {
    return []
  }
}

export function dumpMigratefHistory(records: UndoRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`
}

async function executePlan(
  input: Required<MigratefInput>,
  plan: MigratePlanItem[],
  runtime: MigratefRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<MigratefResult> {
  const pending = plan.filter((item) => item.status === "pending")
  let migratedCount = 0
  let errorCount = 0
  const completed: MigratePlanItem[] = []
  const removedSourceDirectories: string[] = []

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index]
    onEvent({ type: "progress", progress: Math.round((index / Math.max(pending.length, 1)) * 100), message: runtime.basename(item.sourcePath) })
    try {
      if (item.operation === "remove-empty-source") {
        const remaining = await runtime.listDir(item.sourcePath)
        if (remaining.length) throw new Error(`Source directory is not empty: ${item.sourcePath}`)
        await runtime.deletePath(item.sourcePath)
        removedSourceDirectories.push(item.sourcePath)
        completed.push({ ...item, status: "success" })
        continue
      }
      await runtime.ensureDir(runtime.dirname(item.targetPath))
      if (item.action === "copy") {
        if (item.kind === "directory") await runtime.copyDir(item.sourcePath, item.targetPath)
        else await runtime.copyFile(item.sourcePath, item.targetPath)
      } else {
        await runtime.movePath(item.sourcePath, item.targetPath)
      }
      completed.push({ ...item, status: "success" })
      migratedCount += 1
    } catch (error) {
      completed.push({ ...item, status: "error", reason: error instanceof Error ? error.message : String(error) })
      errorCount += 1
    }
  }

  const skipped = plan.filter((item) => item.status === "skipped")
  const operationId = await recordUndoIfNeeded(input, completed, removedSourceDirectories, runtime)
  onEvent({ type: "progress", progress: 100, message: "Migration completed." })
  return {
    success: errorCount === 0,
    message: `${input.action === "copy" ? "Copy" : "Move"} completed: ${migratedCount} success, ${skipped.length} skipped, ${errorCount} failed.`,
    data: data({
      plan: [...skipped, ...completed],
      migratedCount,
      skippedCount: skipped.length,
      errorCount,
      totalCount: plan.length,
      operationId,
    }),
  }
}

async function recordUndoIfNeeded(
  input: Required<MigratefInput>,
  completed: MigratePlanItem[],
  removedSourceDirectories: string[],
  runtime: MigratefRuntime,
): Promise<string> {
  const successful = completed.filter((item) => item.status === "success" && item.operation !== "remove-empty-source")
  if (!successful.length && !removedSourceDirectories.length) return ""
  const id = runtime.randomId()
  const record: UndoRecord = {
    id,
    timestamp: runtime.now().toISOString(),
    description: `${input.mode} ${input.action} to ${input.targetPath}`,
    action: input.action === "copy" ? "copy" : "move",
    operations: successful.map((item) => ({ sourcePath: item.sourcePath, targetPath: item.targetPath, action: item.action })),
    ...(removedSourceDirectories.length ? { removedSourceDirectories } : {}),
  }
  const path = historyPath(input, runtime)
  const records = parseMigratefHistory(await runtime.readText(path))
  records.unshift(record)
  await runtime.writeText(path, dumpMigratefHistory(records.slice(0, 100)))
  return id
}

async function history(input: Required<MigratefInput>, runtime: MigratefRuntime): Promise<MigratefResult> {
  const records = parseMigratefHistory(await runtime.readText(historyPath(input, runtime))).slice(0, input.historyLimit)
  return success(`Loaded ${records.length} history record(s).`, { history: records })
}

async function undo(input: Required<MigratefInput>, runtime: MigratefRuntime, onEvent: (event: NodeRunEvent) => void): Promise<MigratefResult> {
  const path = historyPath(input, runtime)
  const records = parseMigratefHistory(await runtime.readText(path))
  const record = input.batchId ? records.find((item) => item.id === input.batchId) : records.find((item) => !item.undone)
  if (!record) return failure(input.batchId ? `Undo batch not found: ${input.batchId}` : "No undoable batch found.")
  if (record.undone) return failure(`Undo batch already applied: ${record.id}`)

  let successCount = 0
  let failedCount = 0
  const errors: string[] = []
  const operations = [...record.operations].reverse()
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]
    onEvent({ type: "progress", progress: Math.round((index / Math.max(operations.length, 1)) * 100), message: operation.targetPath })
    try {
      if (record.action === "move") {
        await runtime.ensureDir(runtime.dirname(operation.sourcePath))
        await runtime.movePath(operation.targetPath, operation.sourcePath)
      } else {
        await runtime.deletePath(operation.targetPath)
      }
      successCount += 1
    } catch (error) {
      failedCount += 1
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (record.action === "move") {
    const removedDirectories = [...(record.removedSourceDirectories ?? [])].sort((left, right) => left.length - right.length)
    for (const directory of removedDirectories) {
      try {
        await runtime.ensureDir(directory)
      } catch (error) {
        failedCount += 1
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  record.undone = failedCount === 0
  await runtime.writeText(path, dumpMigratefHistory(records))
  onEvent({ type: "progress", progress: 100, message: "Undo completed." })
  return {
    success: failedCount === 0,
    message: `Undo completed: ${successCount} success, ${failedCount} failed.`,
    data: data({ history: records, successCount, failedCount, errors }),
  }
}

function historyPath(input: Required<MigratefInput>, runtime: MigratefRuntime): string {
  return input.historyPath || runtime.defaultHistoryPath()
}

function clean(value?: string): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "")
}

function resolveTargetRoot(
  input: Required<MigratefInput>,
  source: MigratefPathInfo,
  runtime: MigratefRuntime,
): string {
  if (runtime.isAbsolute(input.targetPath) || input.relativeTargetBase === "working-directory") return input.targetPath
  return runtime.resolve(runtime.dirname(source.path), input.targetPath)
}

async function appendMergedDirectoryPlan(
  sourceDirectory: string,
  targetDirectory: string,
  action: "move" | "copy",
  runtime: MigratefRuntime,
  plan: MigratePlanItem[],
): Promise<boolean> {
  let canRemoveSource = action === "move"
  for (const entry of await runtime.listDir(sourceDirectory)) {
    const targetPath = runtime.join(targetDirectory, entry.name)
    const targetInfo = await runtime.pathInfo(targetPath)
    if (!targetInfo.exists) {
      plan.push({
        sourcePath: entry.path,
        targetPath,
        action,
        kind: entry.isDirectory ? "directory" : "file",
        operation: "transfer",
        status: "pending",
      })
      continue
    }
    if (entry.isDirectory && targetInfo.isDirectory) {
      const nestedRemovable = await appendMergedDirectoryPlan(entry.path, targetInfo.path, action, runtime, plan)
      canRemoveSource = canRemoveSource && nestedRemovable
      continue
    }
    plan.push({
      sourcePath: entry.path,
      targetPath: targetInfo.path,
      action,
      kind: entry.isDirectory ? "directory" : "file",
      operation: "transfer",
      status: "skipped",
      reason: "target_exists",
    })
    canRemoveSource = false
  }
  if (canRemoveSource) {
    plan.push({
      sourcePath: sourceDirectory,
      targetPath: targetDirectory,
      action,
      kind: "directory",
      operation: "remove-empty-source",
      status: "pending",
    })
  }
  return canRemoveSource
}

function isUndoRecord(value: unknown): value is UndoRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<UndoRecord>
  return typeof record.id === "string" && typeof record.timestamp === "string" && Array.isArray(record.operations)
}

function data(partial: Partial<MigratefData>): MigratefData {
  return {
    plan: [],
    history: [],
    migratedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    totalCount: 0,
    operationId: "",
    successCount: 0,
    failedCount: 0,
    errors: [],
    ...partial,
  }
}

function success(message: string, partial: Partial<MigratefData>): MigratefResult {
  return { success: true, message, data: data(partial) }
}

function failure(message: string): MigratefResult {
  return { success: false, message, data: data({ errors: [message], failedCount: 1 }) }
}
