import type { NodeRunEvent } from "./contract.js"
import { applySimiuSetOperations, collectSimiuSetDirectories, normalizeSimiuSetOptions, scanSimiuSets, undoSimiuSetLog } from "./simiu-sets.js"
import type { KisakiData, KisakiEntry, KisakiGroup, KisakiNativeProgress, KisakiNormalizedInput, KisakiResult, KisakiRuntime } from "./core.js"

export interface KisakiSimiuSetRunnerHelpers {
  makeGroup(index: number, raw: Array<Partial<KisakiEntry> & { path: string; name: string; size: number; modifiedDate: number }>, runtime: Pick<KisakiRuntime, "basename">, reclaimable: boolean): KisakiGroup
  filterAndSort(groups: KisakiGroup[], input: Pick<Required<KisakiNormalizedInput>, "filterText" | "sortBy" | "descending">): KisakiGroup[]
  summarize(value: KisakiNormalizedInput, groups: KisakiGroup[], messages: string, stopped: boolean): KisakiData
  fail(value: KisakiNormalizedInput, message: string): KisakiResult
}

export async function runKisakiSimiuSetScan(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void, helpers: KisakiSimiuSetRunnerHelpers): Promise<KisakiResult> {
  const simiuOptions = {
    roots: value.includedDirectories,
    recursive: value.recursive,
    scanOrder: value.simiuSetsScanOrder,
    namePrefix: value.simiuSetsNamePrefix,
    minimumGroupSize: value.simiuSetsMinimumGroupSize,
  }
  const directories = await collectSimiuSetDirectories(normalizeSimiuSetOptions(simiuOptions), runtime)
  onEvent({ type: "progress", progress: 2, message: "Scanning similar images with Kisaki." })
  const native = directories.length
    ? await runtime.scanMedia({ ...value, includedDirectories: directories.map((directory) => directory.path), recursive: false }, (progress) => onEvent({
      type: "progress",
      progress: nativeScanProgress(progress),
      message: `Kisaki: ${progress.stage}`,
    }))
    : { groups: [], messages: "", stopped: false }
  const scanned = await scanSimiuSets(simiuOptions, native.groups, {
    listDirectory: runtime.listDirectory,
    pathExists: runtime.pathExists,
    ensureDirectory: runtime.ensureDirectory,
    movePath: runtime.movePath,
    copyPath: runtime.copyPath,
    linkPath: runtime.linkPath,
    removePath: runtime.removePath,
    readText: runtime.readText,
    writeText: runtime.writeText,
    join: runtime.join,
    dirname: runtime.dirname,
    basename: runtime.basename,
    isCancelled: runtime.isCancelled,
    waitWhilePaused: runtime.waitWhilePaused,
  }, (progress, message) => onEvent({ type: "progress", progress, message }))
  let groups = scanned.groups.map((group, index) => helpers.makeGroup(index, group.files.map((entry) => ({ ...entry, name: runtime.basename(entry.path) })), runtime, false))
  groups = helpers.filterAndSort(groups, value)
  const stopped = native.stopped || scanned.stopped
  const data: KisakiData = {
    ...helpers.summarize(value, groups, [native.messages, ...scanned.messages].filter(Boolean).join("\n"), stopped),
    simiuSets: {
      groups: scanned.groups,
      operations: scanned.operations,
      directoryCount: scanned.directoryCount,
      imageCount: scanned.imageCount,
    },
  }
  return {
    success: !stopped,
    message: stopped ? `Stopped Simiu sets; retained ${data.fileCount} partial item(s).` : `Found ${data.fileCount} item(s) in ${data.groupCount} Simiu set(s).`,
    data,
  }
}

function nativeScanProgress(progress: KisakiNativeProgress): number {
  if (progress.entriesTotal > 0) return Math.min(95, Math.max(2, Math.round((progress.entriesChecked / progress.entriesTotal) * 95)))
  if (progress.stageCount > 0) return Math.min(95, Math.max(2, Math.round((progress.stageIndex / progress.stageCount) * 95)))
  return 2
}

export async function runKisakiSimiuSetApply(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void, helpers: KisakiSimiuSetRunnerHelpers): Promise<KisakiResult> {
  if (!value.simiuSetsOperations.length) return helpers.fail(value, "No Simiu set operations were supplied.")
  const operations = value.simiuSetsOperations.map((operation) => ({ ...operation, mode: value.simiuSetsOperationMode }))
  const applied = await applySimiuSetOperations(operations, value.dryRun, runtime)
  const entries = applied.operations.map((operation, index) => ({
    id: `simiu:${index}`,
    groupId: 0,
    path: operation.sourcePath,
    name: runtime.basename(operation.sourcePath),
    size: 0,
    modifiedDate: 0,
    secondaryPath: operation.targetPath,
    operation: operation.mode === "link" ? "link" : operation.mode,
    status: operation.status === "planned" ? "planned" : operation.status === "succeeded" ? operation.mode === "move" ? "moved" : operation.mode === "copy" ? "copied" : "linked" : "error",
    error: operation.error,
  } satisfies KisakiEntry))
  onEvent({ type: "progress", progress: 100, message: value.dryRun ? "Planned Simiu set operations." : "Applied Simiu set operations." })
  const data: KisakiData = {
    ...helpers.summarize(value, [helpers.makeGroup(0, entries, runtime, false)], "", false),
    simiuSets: { groups: [], operations, directoryCount: 0, imageCount: 0, undoLogPaths: applied.undoLogPaths },
  }
  return { success: data.errorCount === 0, message: value.dryRun ? `Planned ${data.affectedCount} Simiu set operation(s).` : `Applied ${data.affectedCount} Simiu set operation(s).`, data }
}

export async function runKisakiSimiuSetUndo(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void, helpers: KisakiSimiuSetRunnerHelpers): Promise<KisakiResult> {
  if (!value.simiuSetsUndoLogPath) return helpers.fail(value, "A Simiu undo log path is required.")
  const reverted = await undoSimiuSetLog(value.simiuSetsUndoLogPath, value.simiuSetsCleanEmptyDirectories, runtime)
  const entries = reverted.operations.map((operation, index) => ({
    id: `simiu-undo:${index}`,
    groupId: 0,
    path: operation.sourcePath,
    name: runtime.basename(operation.sourcePath),
    size: 0,
    modifiedDate: 0,
    secondaryPath: operation.targetPath,
    operation: operation.mode === "link" ? "link" : operation.mode,
    status: operation.status === "succeeded" ? operation.mode === "move" ? "moved" : "deleted" : "error",
    error: operation.error,
  } satisfies KisakiEntry))
  onEvent({ type: "progress", progress: 100, message: "Restored Simiu set operations." })
  const data: KisakiData = { ...helpers.summarize(value, [helpers.makeGroup(0, entries, runtime, false)], "", false), simiuSets: { groups: [], operations: [], directoryCount: 0, imageCount: 0 } }
  return { success: data.errorCount === 0, message: `Restored ${data.affectedCount} Simiu set operation(s).`, data }
}
