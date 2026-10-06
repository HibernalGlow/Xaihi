/**
 * timeu 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/timeu/src/core.ts`
 * （269 行）逐字搬来：类型、函数顺序、判据、排序比较器全部原样，**一处逻辑都没改**。
 *
 * 唯一的改动是第 1 行那条 import：`@xiranite/contract` 的两个类型换成本包的
 * `./contract.ts` 垫片（理由见那个文件的头注释与 ADR-0002）。台账里这个节点的
 * hostRequirements 是 `recursive-enumeration+file-io`，而**这份文件本身仍然零 I/O**：
 * 所有触达机器的动作都从 `TimeuRuntime` 那 9 个方法注入（上游原本就这么设计），
 * 落地实现在 `src/platform.ts`。这样"目录走的语义"与"用什么走"分在两处，各自可测。
 *
 * 枚举语义（`collectTimeuTargets`）随上游保持，接线方与 platform 都不许"顺手改进"：
 * - 路径不存在时**照样进 targets**（第 149-152 行）——恢复流程需要知道少了谁；
 * - 文件只在 `isFile` 或（`includeDirectories` 且 `isDirectory`）时进目标；
 * - 目录在 `recursive` 时递归，递归里**子目录自身**也按 `includeDirectories` 决定；
 * - 符号链接既不 isFile 也不 isDirectory（判据来自 `platform.ts` 的
 *   `readdir(withFileTypes)` + `Dirent`），所以既不进目标也不下钻；
 * - 结果先去重再按 `localeCompare(..., {numeric: true, sensitivity: 'base'})` 排序。
 *
 * @module xaihi-timeu/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type TimeuAction = "scan" | "backup" | "restore"
export type TimeuPlanStatus = "pending" | "success" | "skipped" | "error"

export interface TimeuInput {
  action?: TimeuAction
  path?: string
  paths?: string[]
  listText?: string
  recordPath?: string
  recursive?: boolean
  includeDirectories?: boolean
  dryRun?: boolean
}

export interface TimeuPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
}

export interface TimeuDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface TimeuTimestampRecord {
  path: string
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  backedUpAt: string
}

export interface TimeuPlanItem {
  path: string
  operation: "backup" | "restore"
  status: TimeuPlanStatus
  current?: TimeuTimestampRecord
  stored?: TimeuTimestampRecord
  reason?: string
}

export interface TimeuData {
  plan: TimeuPlanItem[]
  records: TimeuTimestampRecord[]
  recordPath: string
  scannedCount: number
  backupCount: number
  restoredCount: number
  skippedCount: number
  errorCount: number
  errors: string[]
}

export interface TimeuRuntime {
  pathInfo: (path: string) => Promise<TimeuPathInfo>
  listDir: (path: string) => Promise<TimeuDirEntry[]>
  readText: (path: string) => Promise<string | null>
  writeText: (path: string, content: string) => Promise<void>
  ensureDir: (path: string) => Promise<void>
  setTimes: (path: string, atimeMs: number, mtimeMs: number) => Promise<void>
  now: () => Date
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
}

export type TimeuResult = NodeRunResult<TimeuData>

export function normalizeTimeuInput(input: TimeuInput): Required<TimeuInput> {
  return {
    action: input.action ?? "scan",
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]),
    listText: input.listText ?? "",
    recordPath: clean(input.recordPath),
    recursive: input.recursive ?? true,
    includeDirectories: input.includeDirectories ?? false,
    dryRun: input.dryRun ?? true,
  }
}

export async function runTimeu(
  input: TimeuInput,
  runtime: TimeuRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<TimeuResult> {
  const normalized = normalizeTimeuInput(input)
  try {
    if (!normalized.paths.length) return failure("At least one file or directory path is required.", normalized.recordPath)

    onEvent({ type: "progress", progress: 15, message: "Collecting timestamp targets." })
    const targets = await collectTimeuTargets(normalized.paths, normalized.recursive, normalized.includeDirectories, runtime)
    const recordPath = normalized.recordPath || defaultRecordPath(targets, runtime)

    onEvent({ type: "progress", progress: 45, message: `Planning ${targets.length} timestamp item(s).` })
    const storedRecords = await loadTimestampRecords(recordPath, runtime)
    const currentRecords = await currentTimestampRecords(targets, runtime)
    const plan = normalized.action === "restore"
      ? buildRestorePlan(currentRecords, storedRecords)
      : buildBackupPlan(currentRecords)

    if (normalized.action === "scan" || normalized.dryRun) {
      return success(`TimeU planned ${plan.length} item(s).`, data(plan, storedRecords, recordPath))
    }

    if (normalized.action === "backup") {
      onEvent({ type: "progress", progress: 75, message: "Writing timestamp records." })
      const merged = mergeTimestampRecords(storedRecords, currentRecords, runtime.now())
      await runtime.ensureDir(runtime.dirname(recordPath))
      await runtime.writeText(recordPath, dumpTimestampRecords(merged))
      return success(`TimeU backed up ${currentRecords.length} timestamp record(s).`, data(markSuccess(plan), merged, recordPath))
    }

    onEvent({ type: "progress", progress: 75, message: "Restoring timestamps." })
    const restored: TimeuPlanItem[] = []
    for (const item of plan) {
      if (item.status !== "pending" || !item.stored) {
        restored.push(item)
        continue
      }
      try {
        await runtime.setTimes(item.path, item.stored.atimeMs, item.stored.mtimeMs)
        restored.push({ ...item, status: "success" })
      } catch (error) {
        restored.push({ ...item, status: "error", reason: error instanceof Error ? error.message : String(error) })
      }
    }
    return success(`TimeU restored ${restored.filter((item) => item.status === "success").length} timestamp(s).`, data(restored, storedRecords, recordPath))
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error), normalized.recordPath)
  }
}

export async function collectTimeuTargets(paths: string[], recursive: boolean, includeDirectories: boolean, runtime: TimeuRuntime): Promise<string[]> {
  const targets: string[] = []
  for (const path of paths) {
    const info = await runtime.pathInfo(path)
    if (!info.exists) {
      targets.push(path)
      continue
    }
    if (info.isFile || (includeDirectories && info.isDirectory)) targets.push(info.path)
    if (info.isDirectory && recursive) {
      const entries = await runtime.listDir(info.path)
      for (const entry of entries) {
        if (entry.isFile) targets.push(entry.path)
        if (entry.isDirectory) {
          if (includeDirectories) targets.push(entry.path)
          targets.push(...await collectTimeuTargets([entry.path], recursive, includeDirectories, runtime))
        }
      }
    }
  }
  return [...new Set(targets)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
}

export async function currentTimestampRecords(paths: string[], runtime: TimeuRuntime): Promise<TimeuTimestampRecord[]> {
  const records: TimeuTimestampRecord[] = []
  const backedUpAt = runtime.now().toISOString()
  for (const path of paths) {
    const info = await runtime.pathInfo(path)
    if (!info.exists) continue
    records.push({
      path: info.path,
      atimeMs: Math.round(info.atimeMs),
      mtimeMs: Math.round(info.mtimeMs),
      ctimeMs: Math.round(info.ctimeMs),
      birthtimeMs: Math.round(info.birthtimeMs),
      backedUpAt,
    })
  }
  return records
}

export function buildBackupPlan(records: TimeuTimestampRecord[]): TimeuPlanItem[] {
  return records.map((record) => ({ path: record.path, operation: "backup", status: "pending", current: record }))
}

export function buildRestorePlan(currentRecords: TimeuTimestampRecord[], storedRecords: TimeuTimestampRecord[]): TimeuPlanItem[] {
  const currentByPath = new Map(currentRecords.map((record) => [normalizePathKey(record.path), record]))
  return storedRecords.map((stored) => {
    const current = currentByPath.get(normalizePathKey(stored.path))
    if (!current) return { path: stored.path, operation: "restore", status: "skipped", stored, reason: "path_missing" }
    return { path: stored.path, operation: "restore", status: "pending", current, stored }
  })
}

export async function loadTimestampRecords(path: string, runtime: Pick<TimeuRuntime, "readText">): Promise<TimeuTimestampRecord[]> {
  if (!path) return []
  const text = await runtime.readText(path)
  if (!text?.trim()) return []
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isTimestampRecord)
}

export function dumpTimestampRecords(records: TimeuTimestampRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`
}

export function mergeTimestampRecords(existing: TimeuTimestampRecord[], current: TimeuTimestampRecord[], now: Date): TimeuTimestampRecord[] {
  const merged = new Map(existing.map((record) => [normalizePathKey(record.path), record]))
  for (const record of current) merged.set(normalizePathKey(record.path), { ...record, backedUpAt: now.toISOString() })
  return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }))
}

function markSuccess(plan: TimeuPlanItem[]): TimeuPlanItem[] {
  return plan.map((item) => ({ ...item, status: "success" }))
}

function data(plan: TimeuPlanItem[], records: TimeuTimestampRecord[], recordPath: string): TimeuData {
  const errors = plan.filter((item) => item.status === "error").map((item) => `${item.path}: ${item.reason ?? "error"}`)
  return {
    plan,
    records,
    recordPath,
    scannedCount: plan.length,
    backupCount: plan.filter((item) => item.operation === "backup" && item.status === "success").length,
    restoredCount: plan.filter((item) => item.operation === "restore" && item.status === "success").length,
    skippedCount: plan.filter((item) => item.status === "skipped").length,
    errorCount: plan.filter((item) => item.status === "error").length,
    errors,
  }
}

function success(message: string, data: TimeuData): TimeuResult {
  return { success: data.errorCount === 0, message, data }
}

function failure(message: string, recordPath = ""): TimeuResult {
  return { success: false, message, data: data([{ path: "", operation: "backup", status: "error", reason: message }], [], recordPath) }
}

function defaultRecordPath(paths: string[], runtime: Pick<TimeuRuntime, "dirname" | "join">): string {
  const first = paths[0]
  return first ? runtime.join(runtime.dirname(first), "timeu-timestamps.json") : "timeu-timestamps.json"
}

function isTimestampRecord(value: unknown): value is TimeuTimestampRecord {
  const item = value as Partial<TimeuTimestampRecord>
  return typeof item.path === "string" && typeof item.atimeMs === "number" && typeof item.mtimeMs === "number"
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase()
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
