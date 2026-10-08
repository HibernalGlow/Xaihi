import type { NodeRunEvent, NodeRunResult } from "./contract.js"
import { buildKisakiSimilarFolders, type KisakiSimilarFolderStat } from "./similar-folders.js"
import { resolveKisakiSimilarVideoCrop } from "./similar-video-crop.js"
import { runKisakiSimiuSetApply, runKisakiSimiuSetScan, runKisakiSimiuSetUndo } from "./simiu-sets-runner.js"
import type { SimiuSetApplyMode, SimiuSetOperation, SimiuSetScanOrder, SimiuSetGroup } from "./simiu-sets.js"
import { isDefaultTemporaryFileExtensions, normalizeTemporaryFileExtensions } from "./temporary-file-extensions.js"
export type { KisakiVideoCropDetect } from "./similar-video-crop.js"
import type { KisakiVideoCropDetect } from "./similar-video-crop.js"
import type { KisakiTerminalTool, KisakiTool } from "./scanner-vocabulary.js"

// The scanner vocabulary and its terminal subset live in `./scanner-vocabulary.js` and are forwarded here, so the
// node's shared interaction contract reads those values without a value import of this module (ADR-0074 §5: a face
// may not pull the engine graph into its own process) while the QuickJS bundle and every existing `./core.js`
// consumer still resolve exactly one copy. Same shape as sleept's `schedule.ts`.
export { KISAKI_TERMINAL_TOOLS, KISAKI_TOOLS } from "./scanner-vocabulary.js"
export type { KisakiTerminalTool, KisakiTool } from "./scanner-vocabulary.js"

export type KisakiAction = "scan" | "delete" | "move" | "rename" | "clean-exif" | "optimize-video" | "save" | "simiu-apply" | "simiu-undo"
export type KisakiCheckMethod = "name" | "size" | "size-and-name" | "hash"
export type KisakiHashType = "crc32" | "xxh3" | "blake3"
export type KisakiImageHashAlgorithm = "mean" | "gradient" | "blockhash" | "vert-gradient" | "double-gradient" | "median"
export type KisakiImageResizeAlgorithm = "lanczos3" | "gaussian" | "catmull-rom" | "triangle" | "nearest"
export type KisakiImageGeometricInvariance = "off" | "mirror-flip" | "mirror-flip-rotate-90"
export type KisakiMusicCheckType = "tags" | "fingerprint"
export type KisakiSort = "path" | "size" | "modified"
export type KisakiSelectionStrategy = "all-except-first" | "all-except-newest" | "all-except-oldest" | "all-except-biggest" | "all-except-smallest"
export type KisakiDeleteMode = "trash" | "permanent"
export type KisakiConflictPolicy = "skip" | "overwrite" | "rename" | "error"
export type KisakiOperationStatus = "planned" | "deleted" | "trashed" | "moved" | "copied" | "linked" | "renamed" | "cleaned" | "optimized" | "saved" | "skipped" | "error"
export interface KisakiDestinationItem { path: string; destination: string }
export interface KisakiRenameItem { path: string; properExtension?: string; targetName?: string }
export interface KisakiExifTag { name: string; code: number; group: string }
export interface KisakiExifItem { path: string; tags: KisakiExifTag[] }
export type KisakiVideoOptimizerMode = "transcode" | "crop"
export type KisakiVideoOptimizerCodec = "h264" | "h265" | "av1" | "vp9"
export type KisakiVideoOptimizerNoiseReduction = "none" | "hqdn3d"
export interface KisakiVideoCropRect { left: number; top: number; right: number; bottom: number }
export interface KisakiVideoOptimizerItem { path: string; codec: string; cropRect?: KisakiVideoCropRect }
export type KisakiExportScope = "selected" | "visible" | "all"

export interface KisakiInput {
  action?: KisakiAction
  tool?: KisakiTool
  includedDirectories?: string[]
  includedDirectoriesReferenced?: string[]
  excludedDirectories?: string[]
  excludedItems?: string[]
  allowedExtensions?: string
  excludedExtensions?: string
  minimumFileSize?: number
  maximumFileSize?: number
  recursive?: boolean
  useCache?: boolean
  saveAlsoAsJson?: boolean
  deleteOutdatedCache?: boolean
  cacheFolderPath?: string
  configFolderPath?: string
  duplicateMinimalHashCacheSizeKiB?: number
  duplicateMinimalPrehashCacheSizeKiB?: number
  threadCount?: number
  ignoreHardLinks?: boolean
  usePrehash?: boolean
  caseSensitiveNames?: boolean
  checkMethod?: KisakiCheckMethod
  hashType?: KisakiHashType
  duplicateMinimumGroupSize?: number
  numberOfFiles?: number
  biggestFirst?: boolean
  similarity?: number
  similarImagesHashSize?: number
  similarImagesHashAlgorithm?: KisakiImageHashAlgorithm
  similarImagesResizeAlgorithm?: KisakiImageResizeAlgorithm
  similarImagesIgnoreSameSize?: boolean
  similarImagesIgnoreSameResolution?: boolean
  similarImagesGeometricInvariance?: KisakiImageGeometricInvariance
  similarImagesFolderThreshold?: number
  simiuSetsEnabled?: boolean
  simiuSetsScanOrder?: SimiuSetScanOrder
  simiuSetsNamePrefix?: string
  simiuSetsMinimumGroupSize?: number
  simiuSetsOperationMode?: SimiuSetApplyMode
  simiuSetsOperations?: SimiuSetOperation[]
  simiuSetsUndoLogPath?: string
  simiuSetsCleanEmptyDirectories?: boolean
  similarVideosIgnoreSameSize?: boolean
  similarVideosIgnoreSameResolution?: boolean
  similarVideosSkipForward?: number
  similarVideosHashDuration?: number
  similarVideosLetterboxCrop?: boolean
  similarVideosWindowCount?: number
  similarVideosDurationTolerancePct?: number
  similarVideosMinMatchingWindows?: number
  similarVideosSubclipMinMatch?: number
  similarVideosCheckAudioContent?: boolean
  /** Legacy v1 field retained for one rollback window. */
  similarVideosCropDetect?: KisakiVideoCropDetect
  musicCheckType?: KisakiMusicCheckType
  musicApproximateComparison?: boolean
  musicCompareTitle?: boolean
  musicCompareArtist?: boolean
  musicCompareBitrate?: boolean
  musicCompareGenre?: boolean
  musicCompareYear?: boolean
  musicCompareLength?: boolean
  musicMaximumDifference?: number
  musicMinimumFragmentDuration?: number
  musicCompareFingerprintsOnlyWithSimilarTitles?: boolean
  brokenAudio?: boolean
  brokenPdf?: boolean
  brokenArchive?: boolean
  brokenImage?: boolean
  brokenVideoFfprobe?: boolean
  brokenVideoFfmpeg?: boolean
  brokenFont?: boolean
  brokenMarkup?: boolean
  emptyFilesSearchZeroByteContent?: boolean
  emptyFilesSearchNonPrintableContent?: boolean
  temporaryFileExtensions?: string
  videoOptimizerMode?: KisakiVideoOptimizerMode
  videoOptimizerExcludedCodecs?: string
  videoOptimizerBlackPixelThreshold?: number
  videoOptimizerBlackBarMinPercentage?: number
  videoOptimizerMaxSamples?: number
  videoOptimizerMinCropSize?: number
  videoOptimizerTargetCodec?: KisakiVideoOptimizerCodec
  videoOptimizerQuality?: number
  videoOptimizerFailIfNotSmaller?: boolean
  videoOptimizerLimitVideoSize?: boolean
  videoOptimizerMaximumWidth?: number
  videoOptimizerMaximumHeight?: number
  videoOptimizerNoiseReduction?: KisakiVideoOptimizerNoiseReduction
  videoOptimizerNoiseReductionStrength?: number
  videoOptimizerCropTranscode?: boolean
  filterText?: string
  sortBy?: KisakiSort
  descending?: boolean
  selectedPaths?: string[]
  destinationDirectory?: string
  destinationItems?: KisakiDestinationItem[]
  renameItems?: KisakiRenameItem[]
  exifItems?: KisakiExifItem[]
  videoOptimizerItems?: KisakiVideoOptimizerItem[]
  deleteMode?: KisakiDeleteMode
  copyMode?: boolean
  preserveStructure?: boolean
  conflictPolicy?: KisakiConflictPolicy
  outputPath?: string
  outputFormat?: "json" | "csv"
  exportScope?: KisakiExportScope
  exportEntries?: KisakiEntry[]
  dryRun?: boolean
}

export interface NativeDuplicateResult {
  groups: Array<{ files: Array<{ path: string; modifiedDate: number; size: number; hash: string; isReference?: boolean }> }>
  messages: string
  stopped: boolean
}
export interface NativeBasicResult {
  entries: Array<{ path: string; modifiedDate: number; size: number; secondaryPath?: string; detail?: string }>
  messages: string
  stopped: boolean
}
export interface NativeExifResult {
  entries: Array<{ path: string; modifiedDate: number; size: number; tags: KisakiExifTag[] }>
  messages: string
  stopped: boolean
}
export interface NativeExifCandidate { candidatePath: string; removedTags: number }
export interface NativeVideoOptimizerResult {
  entries: Array<{ path: string; modifiedDate: number; size: number; codec: string; width: number; height: number; duration: number; cropLeft?: number; cropTop?: number; cropRight?: number; cropBottom?: number }>
  messages: string
  stopped: boolean
}
export interface NativeVideoOptimizerCandidate { candidatePath: string; originalSize: number; candidateSize: number }
export interface NativeMediaResult {
  groups: Array<{ entries: Array<{ path: string; modifiedDate: number; size: number; width?: number; height?: number; fps?: number; codec?: string; similarity?: string; title?: string; artist?: string; year?: string; length?: string; genre?: string; bitrate?: number; isReference?: boolean; detail?: string; properExtension?: string }> }>
  messages: string
  stopped: boolean
}

export type KisakiNormalizedInput = Omit<Required<KisakiInput>, "similarVideosCropDetect">

export interface KisakiRuntime {
  capabilities?: readonly string[]
  scanDuplicates: (input: KisakiNormalizedInput, onProgress?: (progress: KisakiNativeProgress) => void) => Promise<NativeDuplicateResult>
  scanBasic: (input: KisakiNormalizedInput, onProgress?: (progress: KisakiNativeProgress) => void) => Promise<NativeBasicResult>
  scanExif: (input: KisakiNormalizedInput, onProgress?: (progress: KisakiNativeProgress) => void) => Promise<NativeExifResult>
  scanVideoOptimizer: (input: KisakiNormalizedInput, onProgress?: (progress: KisakiNativeProgress) => void) => Promise<NativeVideoOptimizerResult>
  scanMedia: (input: KisakiNormalizedInput, onProgress?: (progress: KisakiNativeProgress) => void) => Promise<NativeMediaResult>
  createExifCandidate: (sourcePath: string, tags: KisakiExifTag[]) => Promise<NativeExifCandidate>
  createVideoOptimizerCandidate: (item: KisakiVideoOptimizerItem, input: KisakiNormalizedInput) => Promise<NativeVideoOptimizerCandidate>
  replaceWithCandidate: (candidatePath: string, sourcePath: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  listDirectory: (path: string) => Promise<Array<{ path: string; isDirectory: boolean; isFile: boolean }>>
  removePath: (path: string, options?: { trash?: boolean; emptyFoldersOnly?: boolean }) => Promise<void>
  copyPath: (source: string, target: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  linkPath: (source: string, target: string) => Promise<void>
  readText: (path: string) => Promise<string>
  writeText: (path: string, content: string) => Promise<void>
  ensureDirectory: (path: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  relativeDirectoryFromRoot: (path: string) => string
  isCancelled?: () => boolean
  waitWhilePaused?: () => Promise<void>
}

export interface KisakiRuntimeInfo {
  apiVersion: number
  sourceVersion: string
  capabilities: readonly string[]
}

export interface KisakiNativeProgress { stage: string; stageIndex: number; stageCount: number; entriesChecked: number; entriesTotal: number; bytesChecked: number; bytesTotal: number }

export interface KisakiEntry {
  id: string
  groupId: number
  path: string
  name: string
  size: number
  modifiedDate: number
  hash?: string
  secondaryPath?: string
  detail?: string
  properExtension?: string
  exifTags?: KisakiExifTag[]
  videoCropRect?: KisakiVideoCropRect
  width?: number
  height?: number
  fps?: number
  codec?: string
  similarity?: string
  title?: string
  artist?: string
  year?: string
  length?: string
  genre?: string
  bitrate?: number
  isReference?: boolean
  status?: KisakiOperationStatus
  operation?: "delete" | "trash" | "move" | "copy" | "link" | "rename" | "clean-exif" | "optimize-video" | "save"
  conflictPolicy?: KisakiConflictPolicy
  error?: string
}

export interface KisakiGroup {
  id: number
  entries: KisakiEntry[]
  totalBytes: number
  reclaimableBytes: number
}

export interface KisakiData {
  action: KisakiAction
  tool: KisakiTool
  groups: KisakiGroup[]
  entries: KisakiEntry[]
  messages: string
  stopped: boolean
  groupCount: number
  fileCount: number
  totalBytes: number
  reclaimableBytes: number
  affectedCount: number
  errorCount: number
  similarFolders?: KisakiSimilarFolderStat[]
  simiuSets?: {
    groups: SimiuSetGroup[]
    operations: SimiuSetOperation[]
    directoryCount: number
    imageCount: number
    undoLogPaths?: string[]
  }
}

export type KisakiResult = NodeRunResult<KisakiData>

const BASIC_TOOLS = new Set<KisakiTool>(["empty-folders", "big-files", "empty-files", "temporary-files", "invalid-symlinks", "bad-names"])
const MEDIA_TOOLS = new Set<KisakiTool>(["similar-images", "similar-videos", "duplicate-music", "broken-files", "bad-extensions"])

export function normalizeKisakiInput(input: KisakiInput): KisakiNormalizedInput {
  const destinationItems = normalizeDestinationItems(input.destinationItems)
  const renameItems = normalizeRenameItems(input.renameItems)
  const exifItems = normalizeExifItems(input.exifItems)
  const videoOptimizerItems = normalizeVideoOptimizerItems(input.videoOptimizerItems)
  const exportEntries = input.exportEntries?.map((entry) => ({ ...entry })) ?? []
  const similarVideoCrop = resolveKisakiSimilarVideoCrop(input)
  return {
    action: input.action ?? "scan",
    tool: input.tool ?? "duplicate-files",
    includedDirectories: unique(input.includedDirectories ?? []),
    includedDirectoriesReferenced: unique(input.includedDirectoriesReferenced ?? []),
    excludedDirectories: unique(input.excludedDirectories ?? []),
    excludedItems: unique(input.excludedItems ?? []),
    allowedExtensions: clean(input.allowedExtensions),
    excludedExtensions: clean(input.excludedExtensions),
    minimumFileSize: clamp(input.minimumFileSize, 0, Number.MAX_SAFE_INTEGER, 1),
    maximumFileSize: clamp(input.maximumFileSize, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    recursive: input.recursive ?? true,
    useCache: input.useCache ?? true,
    saveAlsoAsJson: input.saveAlsoAsJson ?? false,
    deleteOutdatedCache: input.deleteOutdatedCache ?? true,
    cacheFolderPath: clean(input.cacheFolderPath),
    configFolderPath: clean(input.configFolderPath),
    duplicateMinimalHashCacheSizeKiB: clamp(input.duplicateMinimalHashCacheSizeKiB, 1, 1024 * 1024, 256),
    duplicateMinimalPrehashCacheSizeKiB: clamp(input.duplicateMinimalPrehashCacheSizeKiB, 1, 1024 * 1024, 256),
    threadCount: clamp(input.threadCount, 0, 256, 0),
    ignoreHardLinks: input.ignoreHardLinks ?? true,
    usePrehash: input.usePrehash ?? true,
    caseSensitiveNames: input.caseSensitiveNames ?? false,
    checkMethod: input.checkMethod ?? "hash",
    hashType: input.hashType ?? "blake3",
    duplicateMinimumGroupSize: clamp(input.duplicateMinimumGroupSize, 1, 10_000, 1),
    numberOfFiles: clamp(input.numberOfFiles, 1, 100_000, 50),
    biggestFirst: input.biggestFirst ?? true,
    similarity: clamp(input.similarity, 0, 40, 10),
    similarImagesHashSize: oneOf(input.similarImagesHashSize, [8, 16, 32, 64] as const, 16),
    similarImagesHashAlgorithm: oneOf(input.similarImagesHashAlgorithm, ["mean", "gradient", "blockhash", "vert-gradient", "double-gradient", "median"] as const, "mean"),
    similarImagesResizeAlgorithm: oneOf(input.similarImagesResizeAlgorithm, ["lanczos3", "gaussian", "catmull-rom", "triangle", "nearest"] as const, "lanczos3"),
    similarImagesIgnoreSameSize: input.similarImagesIgnoreSameSize ?? false,
    similarImagesIgnoreSameResolution: input.similarImagesIgnoreSameResolution ?? false,
    similarImagesGeometricInvariance: oneOf(input.similarImagesGeometricInvariance, ["off", "mirror-flip", "mirror-flip-rotate-90"] as const, "off"),
    similarImagesFolderThreshold: clamp(input.similarImagesFolderThreshold, 1, 10_000, 2),
    simiuSetsEnabled: input.simiuSetsEnabled ?? false,
    simiuSetsScanOrder: oneOf(input.simiuSetsScanOrder, ["path", "smallest-first", "deepest-first"] as const, "smallest-first"),
    simiuSetsNamePrefix: clean(input.simiuSetsNamePrefix) || "simiu_set",
    simiuSetsMinimumGroupSize: clamp(input.simiuSetsMinimumGroupSize, 2, 10_000, 2),
    simiuSetsOperationMode: oneOf(input.simiuSetsOperationMode, ["move", "copy", "link"] as const, "move"),
    simiuSetsOperations: normalizeSimiuSetOperations(input.simiuSetsOperations),
    simiuSetsUndoLogPath: clean(input.simiuSetsUndoLogPath),
    simiuSetsCleanEmptyDirectories: input.simiuSetsCleanEmptyDirectories ?? true,
    similarVideosIgnoreSameSize: input.similarVideosIgnoreSameSize ?? false,
    similarVideosIgnoreSameResolution: input.similarVideosIgnoreSameResolution ?? false,
    similarVideosSkipForward: clamp(input.similarVideosSkipForward, 0, 300, 15),
    similarVideosHashDuration: clamp(input.similarVideosHashDuration, 2, 60, 10),
    similarVideosLetterboxCrop: similarVideoCrop.letterboxCrop,
    similarVideosWindowCount: clamp(input.similarVideosWindowCount, 1, 20, 5),
    similarVideosDurationTolerancePct: clampDecimal(input.similarVideosDurationTolerancePct, 0, 100, 20),
    similarVideosMinMatchingWindows: clampDecimal(input.similarVideosMinMatchingWindows, 0, 1, 0.6),
    similarVideosSubclipMinMatch: clampDecimal(input.similarVideosSubclipMinMatch, 0, 1, 0.5),
    similarVideosCheckAudioContent: input.similarVideosCheckAudioContent ?? false,
    musicCheckType: oneOf(input.musicCheckType, ["tags", "fingerprint"] as const, "tags"),
    musicApproximateComparison: input.musicApproximateComparison ?? true,
    musicCompareTitle: input.musicCompareTitle ?? true,
    musicCompareArtist: input.musicCompareArtist ?? true,
    musicCompareBitrate: input.musicCompareBitrate ?? false,
    musicCompareGenre: input.musicCompareGenre ?? false,
    musicCompareYear: input.musicCompareYear ?? false,
    musicCompareLength: input.musicCompareLength ?? false,
    musicMaximumDifference: clamp(input.musicMaximumDifference, 0, 10, 10),
    musicMinimumFragmentDuration: clamp(input.musicMinimumFragmentDuration, 0, 3600, 15),
    musicCompareFingerprintsOnlyWithSimilarTitles: input.musicCompareFingerprintsOnlyWithSimilarTitles ?? true,
    brokenAudio: input.brokenAudio ?? true,
    brokenPdf: input.brokenPdf ?? true,
    brokenArchive: input.brokenArchive ?? true,
    brokenImage: input.brokenImage ?? true,
    brokenVideoFfprobe: input.brokenVideoFfprobe ?? false,
    brokenVideoFfmpeg: input.brokenVideoFfmpeg ?? false,
    brokenFont: input.brokenFont ?? false,
    brokenMarkup: input.brokenMarkup ?? false,
    emptyFilesSearchZeroByteContent: input.emptyFilesSearchZeroByteContent ?? false,
    emptyFilesSearchNonPrintableContent: input.emptyFilesSearchNonPrintableContent ?? false,
    temporaryFileExtensions: normalizeTemporaryFileExtensions(input.temporaryFileExtensions),
    videoOptimizerMode: oneOf(input.videoOptimizerMode, ["transcode", "crop"] as const, "transcode"),
    videoOptimizerExcludedCodecs: normalizeVideoOptimizerCodecs(input.videoOptimizerExcludedCodecs),
    videoOptimizerBlackPixelThreshold: clamp(input.videoOptimizerBlackPixelThreshold, 0, 128, 32),
    videoOptimizerBlackBarMinPercentage: clamp(input.videoOptimizerBlackBarMinPercentage, 50, 100, 90),
    videoOptimizerMaxSamples: clamp(input.videoOptimizerMaxSamples, 5, 1000, 20),
    videoOptimizerMinCropSize: clamp(input.videoOptimizerMinCropSize, 1, 1000, 5),
    videoOptimizerTargetCodec: oneOf(input.videoOptimizerTargetCodec, ["h264", "h265", "av1", "vp9"] as const, "h265"),
    videoOptimizerQuality: clamp(input.videoOptimizerQuality, 0, 51, 23),
    videoOptimizerFailIfNotSmaller: input.videoOptimizerFailIfNotSmaller ?? true,
    videoOptimizerLimitVideoSize: input.videoOptimizerLimitVideoSize ?? false,
    videoOptimizerMaximumWidth: clamp(input.videoOptimizerMaximumWidth, 1, 16_384, 1920),
    videoOptimizerMaximumHeight: clamp(input.videoOptimizerMaximumHeight, 1, 16_384, 1080),
    videoOptimizerNoiseReduction: oneOf(input.videoOptimizerNoiseReduction, ["none", "hqdn3d"] as const, "none"),
    videoOptimizerNoiseReductionStrength: clamp(input.videoOptimizerNoiseReductionStrength, 1, 10, 5),
    videoOptimizerCropTranscode: input.videoOptimizerCropTranscode ?? false,
    filterText: clean(input.filterText),
    sortBy: input.sortBy ?? "path",
    descending: input.descending ?? false,
    selectedPaths: unique([...(input.selectedPaths ?? []), ...destinationItems.map((item) => item.path), ...renameItems.map((item) => item.path), ...exifItems.map((item) => item.path), ...videoOptimizerItems.map((item) => item.path), ...exportEntries.map((entry) => entry.path)]),
    destinationDirectory: clean(input.destinationDirectory),
    destinationItems,
    renameItems,
    exifItems,
    videoOptimizerItems,
    deleteMode: oneOf(input.deleteMode, ["trash", "permanent"] as const, "trash"),
    copyMode: input.copyMode ?? false,
    preserveStructure: input.preserveStructure ?? false,
    conflictPolicy: oneOf(input.conflictPolicy, ["skip", "overwrite", "rename", "error"] as const, "skip"),
    outputPath: clean(input.outputPath),
    outputFormat: input.outputFormat ?? "json",
    exportScope: oneOf(input.exportScope, ["selected", "visible", "all"] as const, "selected"),
    exportEntries,
    dryRun: input.dryRun ?? true,
  }
}

export async function runKisaki(input: KisakiInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void = () => {}): Promise<KisakiResult> {
  const value = normalizeKisakiInput(input)
  try {
    if (value.action === "scan") return await scan(value, runtime, onEvent)
    if (value.action === "simiu-apply") return await runKisakiSimiuSetApply(value, runtime, onEvent, simiuSetRunnerHelpers())
    if (value.action === "simiu-undo") return await runKisakiSimiuSetUndo(value, runtime, onEvent, simiuSetRunnerHelpers())
    if (!value.selectedPaths.length) return fail(value, "Select at least one result path.")
    if (value.action === "delete") return await mutate(value, runtime, "delete", onEvent)
    if (value.action === "move") {
      if (!value.destinationDirectory && !value.destinationItems.length) return fail(value, "A destination directory or per-item destinations are required.")
      return await mutate(value, runtime, "move", onEvent)
    }
    if (value.action === "rename") {
      if (!value.renameItems.length) return fail(value, "At least one path and rename target are required.")
      return await mutate(value, runtime, "rename", onEvent)
    }
    if (value.action === "clean-exif") {
      if (!value.exifItems.length) return fail(value, "At least one path and EXIF tag are required.")
      if (!(runtime.capabilities ?? []).includes("operation.exif.candidate")) return fail(value, "Kisaki binding is missing: operation.exif.candidate.")
      return await cleanExif(value, runtime, onEvent)
    }
    if (value.action === "optimize-video") {
      if (!value.videoOptimizerItems.length) return fail(value, "At least one scanned video optimization item is required.")
      if (!(runtime.capabilities ?? []).includes("operation.video-optimizer.candidate")) return fail(value, "Kisaki binding is missing: operation.video-optimizer.candidate.")
      return await optimizeVideos(value, runtime, onEvent)
    }
    if (!value.outputPath) return fail(value, "An output path is required.")
    return await save(value, runtime, onEvent)
  } catch (error) {
    return fail(value, errorMessage(error))
  }
}

async function scan(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void): Promise<KisakiResult> {
  if (!value.includedDirectories.length) return fail(value, "Add at least one included directory.")
  if (value.minimumFileSize > value.maximumFileSize) return fail(value, "Minimum file size cannot exceed maximum file size.")
  const missingCapabilities = missingNativeCapabilities(value, runtime.capabilities)
  if (missingCapabilities.length) return fail(value, `Kisaki binding is missing: ${missingCapabilities.join(", ")}.`)
  await runtime.waitWhilePaused?.()
  if (runtime.isCancelled?.()) return cancelled(value)
  if (value.tool === "similar-images" && value.simiuSetsEnabled) return await runKisakiSimiuSetScan(value, runtime, onEvent, simiuSetRunnerHelpers())
  onEvent({ type: "progress", progress: 2, message: `Starting ${value.tool}.` })
  const onProgress = (progress: KisakiNativeProgress) => onEvent({ type: "progress", progress: nativeProgressPercent(progress), message: nativeProgressMessage(progress) })
  let groups: KisakiGroup[]
  let messages = ""
  let stopped = false
  if (value.tool === "duplicate-files") {
    const native = await runtime.scanDuplicates(value, onProgress)
    groups = native.groups.filter((group) => group.files.length >= value.duplicateMinimumGroupSize).map((group, index) => makeGroup(index, group.files.map((entry) => ({ ...entry, name: runtime.basename(entry.path) })), runtime, true))
    messages = native.messages
    stopped = native.stopped
  } else if (BASIC_TOOLS.has(value.tool)) {
    const native = await runtime.scanBasic(value, onProgress)
    groups = native.entries.length ? [makeGroup(0, native.entries.map((entry) => ({ ...entry, name: runtime.basename(entry.path) })), runtime, false)] : []
    messages = native.messages
    stopped = native.stopped
  } else if (value.tool === "exif-remover") {
    const native = await runtime.scanExif(value, onProgress)
    groups = native.entries.length ? [makeGroup(0, native.entries.map((entry) => ({
      ...entry,
      name: runtime.basename(entry.path),
      exifTags: entry.tags,
      detail: `${entry.tags.length} EXIF tag(s)`,
    })), runtime, false)] : []
    messages = native.messages
    stopped = native.stopped
  } else if (value.tool === "video-optimizer") {
    const native = await runtime.scanVideoOptimizer(value, onProgress)
    groups = native.entries.length ? [makeGroup(0, native.entries.map((entry) => {
      const cropRect = cropRectFromNative(entry)
      return {
        ...entry,
        name: runtime.basename(entry.path),
        videoCropRect: cropRect,
        detail: cropRect ? `Crop ${cropRect.left},${cropRect.top} to ${cropRect.right},${cropRect.bottom}` : `${entry.codec} ${entry.width}x${entry.height}`,
      }
    }), runtime, false)] : []
    messages = native.messages
    stopped = native.stopped
  } else if (MEDIA_TOOLS.has(value.tool)) {
    const native = await runtime.scanMedia(value, onProgress)
    groups = native.groups.filter((group) => group.entries.length > 0).map((group, index) => makeGroup(index, group.entries.map((entry) => ({ ...entry, name: runtime.basename(entry.path) })), runtime, isGroupedTool(value.tool)))
    messages = native.messages
    stopped = native.stopped
  } else return fail(value, `Unsupported Kisaki tool: ${value.tool}`)

  groups = filterAndSortGroups(groups, value)
  if (runtime.isCancelled?.() && !stopped) stopped = true
  onEvent({ type: "progress", progress: stopped ? 99 : 100, message: stopped ? `Stopped ${value.tool}.` : `Finished ${value.tool}.` })
  const data = summarize(value, groups, messages, stopped)
  return { success: !stopped, message: stopped ? `Stopped ${value.tool}; retained ${data.fileCount} partial item(s).` : `Found ${data.fileCount} item(s) in ${data.groupCount} group(s).`, data }
}

function missingNativeCapabilities(value: KisakiNormalizedInput, capabilities: readonly string[] | undefined): string[] {
  const required: string[] = []
  if (value.tool === "similar-images") {
    if (value.similarImagesIgnoreSameResolution) required.push("similar-images.same-resolution-exclusion")
    if (value.similarImagesGeometricInvariance !== "off") required.push("similar-images.geometric-invariance")
  }
  if (value.tool === "similar-videos") {
    if (value.similarVideosIgnoreSameResolution) required.push("similar-videos.same-resolution-exclusion")
    if (
      value.similarVideosWindowCount !== 5 ||
      value.similarVideosDurationTolerancePct !== 20 ||
      value.similarVideosMinMatchingWindows !== 0.6 ||
      value.similarVideosSubclipMinMatch !== 0.5
    ) required.push("similar-videos.similario")
    if (value.similarVideosCheckAudioContent) required.push("similar-videos.audio")
  }
  if (value.tool === "broken-files" && (
    value.brokenVideoFfprobe || value.brokenVideoFfmpeg || value.brokenFont || value.brokenMarkup
  )) required.push("broken-files.multi-checker")
  if (value.tool === "empty-files" && (
    value.emptyFilesSearchZeroByteContent || value.emptyFilesSearchNonPrintableContent
  )) required.push("empty-files.content-checkers")
  if (value.tool === "temporary-files" && !isDefaultTemporaryFileExtensions(value.temporaryFileExtensions)) {
    required.push("temporary-files.custom-extensions")
  }
  if (value.tool === "bad-names") required.push("scan.bad-names")
  if (value.tool === "exif-remover") required.push("scan.exif-remover")
  if (value.tool === "video-optimizer") required.push("scan.video-optimizer")
  if (!required.length) return []
  const available = new Set(capabilities ?? [])
  return required.filter((capability) => !available.has(capability))
}

function nativeProgressPercent(progress: KisakiNativeProgress): number { const stages = Math.max(1, progress.stageCount), stage = Math.max(0, Math.min(stages - 1, progress.stageIndex)), fraction = progress.entriesTotal > 0 ? progress.entriesChecked / progress.entriesTotal : progress.bytesTotal > 0 ? progress.bytesChecked / progress.bytesTotal : 0; return Math.max(3, Math.min(98, Math.round(((stage + Math.max(0, Math.min(1, fraction))) / stages) * 95 + 3))) }
function nativeProgressMessage(progress: KisakiNativeProgress): string { const count = progress.entriesTotal > 0 ? ` ${progress.entriesChecked}/${progress.entriesTotal}` : progress.entriesChecked > 0 ? ` ${progress.entriesChecked}` : ""; return `${humanStage(progress.stage)}${count}` }
function humanStage(stage: string): string { return stage.replace(/([a-z0-9])([A-Z])/g, "$1 $2") }
function cancelled(value: KisakiNormalizedInput): KisakiResult { return { success: false, message: `${value.tool} scan cancelled.`, data: summarize(value, [], "Scan cancelled.", true) } }

function makeGroup(index: number, raw: Array<Partial<KisakiEntry> & { path: string; name: string; size: number; modifiedDate: number }>, runtime: Pick<KisakiRuntime, "basename">, reclaimable: boolean): KisakiGroup {
  const entries = raw.map((entry, entryIndex) => ({ ...entry, id: `${index}:${entryIndex}:${entry.path}`, groupId: index, name: entry.name || runtime.basename(entry.path) })) as KisakiEntry[]
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)
  const references = entries.filter((entry) => entry.isReference)
  const reclaimableBytes = reclaimable && entries.length > 1
    ? references.length
      ? entries.filter((entry) => !entry.isReference).reduce((sum, entry) => sum + entry.size, 0)
      : totalBytes - Math.max(...entries.map((entry) => entry.size))
    : 0
  return { id: index, entries, totalBytes, reclaimableBytes }
}

function simiuSetRunnerHelpers() {
  return { makeGroup, filterAndSort: filterAndSortGroups, summarize, fail }
}

export function filterAndSortGroups(groups: KisakiGroup[], input: Pick<Required<KisakiInput>, "filterText" | "sortBy" | "descending">): KisakiGroup[] {
  const needle = input.filterText.toLocaleLowerCase()
  return groups.map((group) => {
    const entries = [...group.entries]
      .filter((entry) => !needle || `${entry.path} ${entry.detail ?? ""} ${entry.artist ?? ""} ${entry.title ?? ""}`.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        const compared = input.sortBy === "size" ? left.size - right.size : input.sortBy === "modified" ? left.modifiedDate - right.modifiedDate : left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" })
        return input.descending ? -compared : compared
      })
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)
    return { ...group, entries, totalBytes, reclaimableBytes: entries.length > 1 ? Math.min(group.reclaimableBytes, totalBytes - Math.max(...entries.map((entry) => entry.size))) : 0 }
  }).filter((group) => group.entries.length > 0)
}

/**
 * Selection is pure result-document maths with no host edge, so it lives in `./selection-strategies.js` where
 * a terminal face may read it; the faces must not import this module as a value at all (ADR-0074 §5), and the
 * re-export here keeps `core.ts` the single published contract for it.
 */
export { smartSelect } from "./selection-strategies.js"

async function mutate(value: KisakiNormalizedInput, runtime: KisakiRuntime, action: "delete" | "move" | "rename", onEvent: (event: NodeRunEvent) => void): Promise<KisakiResult> {
  const entries: KisakiEntry[] = []
  const claimedTargets = new Set<string>()
  const destinations = new Map(value.destinationItems.map((item) => [item.path, item.destination]))
  const renameItems = new Map(value.renameItems.map((item) => [item.path, item]))
  for (let index = 0; index < value.selectedPaths.length; index += 1) {
    const path = value.selectedPaths[index]!
    const operation: NonNullable<KisakiEntry["operation"]> = action === "delete" ? value.deleteMode === "trash" ? "trash" : "delete" : action === "rename" ? "rename" : value.copyMode ? "copy" : "move"
    let target = action === "move" ? operationTarget(value, runtime, path, destinations.get(path)) : undefined
    const base: KisakiEntry = { id: `op:${index}`, groupId: 0, path, name: runtime.basename(path), size: 0, modifiedDate: 0, properExtension: renameItems.get(path)?.properExtension, operation, conflictPolicy: action === "move" || action === "rename" ? value.conflictPolicy : undefined }
    onEvent({ type: "progress", progress: Math.round((index / value.selectedPaths.length) * 100), message: `${operation} ${runtime.basename(path)}` })
    try {
      if (action === "rename") target = renameTarget(path, renameItems.get(path), runtime)
      if (!await runtime.pathExists(path)) throw new Error("Source path no longer exists.")
      if (target === path) { entries.push({ ...base, secondaryPath: target, status: "skipped", error: "Path already uses the requested name." }); continue }
      const claimed = target ? claimedTargets.has(target.toLocaleLowerCase()) : false
      if (target && (claimed || await runtime.pathExists(target))) {
        if (claimed && value.conflictPolicy === "overwrite") throw new Error("Another selected item uses the same target path.")
        if (value.conflictPolicy === "skip") { entries.push({ ...base, secondaryPath: target, status: "skipped", error: "Target already exists." }); continue }
        if (value.conflictPolicy === "error") throw new Error("Target already exists.")
        if (value.conflictPolicy === "rename") target = await availableTarget(target, runtime, claimedTargets)
      }
      if (target) claimedTargets.add(target.toLocaleLowerCase())
      if (value.dryRun) { entries.push({ ...base, secondaryPath: target, status: "planned" }); continue }
      if (action === "delete") {
        await runtime.removePath(path, { trash: value.deleteMode === "trash", emptyFoldersOnly: value.tool === "empty-folders" })
      } else {
        await runtime.ensureDirectory(runtime.dirname(target!))
        if (value.conflictPolicy === "overwrite" && await runtime.pathExists(target!)) await runtime.removePath(target!, { trash: false })
        if (action === "move" && value.copyMode) await runtime.copyPath(path, target!)
        else await runtime.movePath(path, target!)
      }
      const status: KisakiOperationStatus = action === "delete" ? value.deleteMode === "trash" ? "trashed" : "deleted" : action === "rename" ? "renamed" : value.copyMode ? "copied" : "moved"
      entries.push({ ...base, secondaryPath: target, status })
    } catch (error) { entries.push({ ...base, secondaryPath: target, status: "error", error: errorMessage(error) }) }
  }
  const group = makeGroup(0, entries, runtime, false)
  const data = summarize(value, [group], "", false)
  return { success: data.errorCount === 0, message: value.dryRun ? `Planned ${data.affectedCount} operation(s); ${entries.filter((entry) => entry.status === "skipped").length} skipped.` : `Completed ${data.affectedCount} operation(s).`, data }
}

async function cleanExif(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void): Promise<KisakiResult> {
  const items = new Map(value.exifItems.map((item) => [item.path, item]))
  const entries: KisakiEntry[] = []
  for (let index = 0; index < value.selectedPaths.length; index += 1) {
    const path = value.selectedPaths[index]!
    const item = items.get(path)
    const base: KisakiEntry = { id: `op:${index}`, groupId: 0, path, name: runtime.basename(path), size: 0, modifiedDate: 0, exifTags: item?.tags, operation: "clean-exif" }
    onEvent({ type: "progress", progress: Math.round((index / value.selectedPaths.length) * 100), message: `clean EXIF ${runtime.basename(path)}` })
    try {
      if (!item?.tags.length) throw new Error("No EXIF tags were selected for this path.")
      if (!await runtime.pathExists(path)) throw new Error("Source path no longer exists.")
      if (value.dryRun) { entries.push({ ...base, secondaryPath: path, status: "planned", detail: `Remove ${item.tags.length} EXIF tag(s).` }); continue }
      const candidate = await runtime.createExifCandidate(path, item.tags)
      try {
        await runtime.replaceWithCandidate(candidate.candidatePath, path)
      } catch (error) {
        entries.push({ ...base, secondaryPath: candidate.candidatePath, status: "error", error: errorMessage(error), detail: `Candidate retained at ${candidate.candidatePath}.` })
        continue
      }
      entries.push({ ...base, secondaryPath: path, status: "cleaned", detail: `Removed ${candidate.removedTags} EXIF tag(s).` })
    } catch (error) { entries.push({ ...base, secondaryPath: path, status: "error", error: errorMessage(error) }) }
  }
  const data = summarize(value, [makeGroup(0, entries, runtime, false)], "", false)
  return { success: data.errorCount === 0, message: value.dryRun ? `Planned EXIF cleanup for ${data.affectedCount} path(s).` : `Cleaned EXIF metadata for ${data.affectedCount} path(s).`, data }
}

async function optimizeVideos(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void): Promise<KisakiResult> {
  const items = new Map(value.videoOptimizerItems.map((item) => [item.path, item]))
  const entries: KisakiEntry[] = []
  for (let index = 0; index < value.selectedPaths.length; index += 1) {
    const path = value.selectedPaths[index]!
    const item = items.get(path)
    const base: KisakiEntry = { id: `op:${index}`, groupId: 0, path, name: runtime.basename(path), size: 0, modifiedDate: 0, codec: item?.codec, operation: "optimize-video" }
    onEvent({ type: "progress", progress: Math.round((index / value.selectedPaths.length) * 100), message: `optimize video ${runtime.basename(path)}` })
    try {
      if (!item) throw new Error("No scanned video optimization item was selected for this path.")
      if (value.videoOptimizerMode === "crop" && !item.cropRect) throw new Error("No scanned crop rectangle is available for this path.")
      if (!await runtime.pathExists(path)) throw new Error("Source path no longer exists.")
      const detail = videoOptimizationDetail(item, value)
      if (value.dryRun) { entries.push({ ...base, secondaryPath: path, status: "planned", detail }); continue }
      const candidate = await runtime.createVideoOptimizerCandidate(item, value)
      try {
        await runtime.replaceWithCandidate(candidate.candidatePath, path)
      } catch (error) {
        entries.push({ ...base, secondaryPath: candidate.candidatePath, status: "error", error: errorMessage(error), detail: `Candidate retained at ${candidate.candidatePath}.` })
        continue
      }
      entries.push({ ...base, secondaryPath: path, status: "optimized", detail: `${detail}; ${candidate.originalSize} B -> ${candidate.candidateSize} B.` })
    } catch (error) { entries.push({ ...base, secondaryPath: path, status: "error", error: errorMessage(error) }) }
  }
  const data = summarize(value, [makeGroup(0, entries, runtime, false)], "", false)
  return { success: data.errorCount === 0, message: value.dryRun ? `Planned video optimization for ${data.affectedCount} path(s).` : `Optimized ${data.affectedCount} video(s).`, data }
}

function renameTarget(source: string, item: KisakiRenameItem | undefined, runtime: Pick<KisakiRuntime, "basename" | "dirname" | "join">): string {
  const targetName = clean(item?.targetName)
  if (targetName) {
    if (!isValidTargetName(targetName)) throw new Error("Invalid target name.")
    return runtime.join(runtime.dirname(source), targetName)
  }
  const properExtension = clean(item?.properExtension).replace(/^\.+/, "")
  if (!properExtension || /[\\/:*?"<>|]/.test(properExtension)) throw new Error("Invalid proper extension.")
  const filename = runtime.basename(source)
  const dot = filename.lastIndexOf(".")
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return runtime.join(runtime.dirname(source), `${stem}.${properExtension}`)
}

function isValidTargetName(value: string): boolean {
  return value !== "." && value !== ".." && !/[\\/:*?"<>|\u0000-\u001F]/.test(value)
}

function operationTarget(value: KisakiNormalizedInput, runtime: KisakiRuntime, source: string, itemDestination?: string): string {
  if (itemDestination) return runtime.join(itemDestination, runtime.basename(source))
  const relativeDirectory = value.preserveStructure ? runtime.relativeDirectoryFromRoot(source) : ""
  return relativeDirectory ? runtime.join(value.destinationDirectory, relativeDirectory, runtime.basename(source)) : runtime.join(value.destinationDirectory, runtime.basename(source))
}

async function availableTarget(target: string, runtime: KisakiRuntime, claimedTargets: ReadonlySet<string>): Promise<string> {
  const directory = runtime.dirname(target)
  const filename = runtime.basename(target)
  const dot = filename.lastIndexOf(".")
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const extension = dot > 0 ? filename.slice(dot) : ""
  for (let suffix = 1; suffix < 100_000; suffix += 1) {
    const candidate = runtime.join(directory, `${stem} (${suffix})${extension}`)
    if (!claimedTargets.has(candidate.toLocaleLowerCase()) && !await runtime.pathExists(candidate)) return candidate
  }
  throw new Error(`No available target name for ${target}.`)
}

async function save(value: KisakiNormalizedInput, runtime: KisakiRuntime, onEvent: (event: NodeRunEvent) => void): Promise<KisakiResult> {
  const sourceRows = value.exportEntries.length ? value.exportEntries : value.selectedPaths.map((path, index) => ({ id: `save:${index}`, groupId: 0, path, name: runtime.basename(path), size: 0, modifiedDate: 0 }))
  const rows: KisakiEntry[] = sourceRows.map((entry, index) => ({ ...entry, id: entry.id || `save:${index}`, status: "saved", operation: "save" }))
  const content = value.outputFormat === "csv" ? exportCsv(rows) : `${JSON.stringify({ tool: value.tool, scope: value.exportScope, entries: rows }, null, 2)}\n`
  onEvent({ type: "progress", progress: 50, message: `Writing ${runtime.basename(value.outputPath)}.` })
  if (!value.dryRun) { await runtime.ensureDirectory(runtime.dirname(value.outputPath)); await runtime.writeText(value.outputPath, content) }
  const data = summarize(value, [makeGroup(0, rows, runtime, false)], "", false)
  return { success: true, message: value.dryRun ? `Planned export of ${rows.length} path(s).` : `Saved ${rows.length} path(s).`, data }
}

function summarize(value: KisakiNormalizedInput, groups: KisakiGroup[], messages: string, stopped: boolean): KisakiData {
  const entries = groups.flatMap((group) => group.entries)
  return { action: value.action, tool: value.tool, groups, entries, messages, stopped, groupCount: groups.length, fileCount: entries.length, totalBytes: groups.reduce((sum, group) => sum + group.totalBytes, 0), reclaimableBytes: groups.reduce((sum, group) => sum + group.reclaimableBytes, 0), affectedCount: entries.filter((entry) => ["deleted", "trashed", "moved", "copied", "linked", "renamed", "cleaned", "optimized", "saved", "planned"].includes(entry.status ?? "")).length, errorCount: entries.filter((entry) => entry.status === "error").length, similarFolders: value.action === "scan" && value.tool === "similar-images" ? buildKisakiSimilarFolders(groups, value.similarImagesFolderThreshold) : undefined }
}

function isGroupedTool(tool: KisakiTool): boolean { return ["duplicate-files", "similar-images", "similar-videos", "duplicate-music"].includes(tool) }
function fail(value: KisakiNormalizedInput, message: string): KisakiResult { return { success: false, message, data: summarize(value, [], message, false) } }
function unique(values: string[]): string[] { return [...new Set(values.map(clean).filter(Boolean))] }
function normalizeDestinationItems(items: KisakiDestinationItem[] | undefined): KisakiDestinationItem[] { const result = new Map<string, string>(); for (const item of items ?? []) { const path = clean(item.path), destination = clean(item.destination); if (path && destination) result.set(path, destination) } return [...result].map(([path, destination]) => ({ path, destination })) }
function normalizeRenameItems(items: KisakiRenameItem[] | undefined): KisakiRenameItem[] { const result = new Map<string, KisakiRenameItem>(); for (const item of items ?? []) { const path = clean(item.path), properExtension = clean(item.properExtension).replace(/^\.+/, ""), targetName = clean(item.targetName); if (!path || (!properExtension && !targetName)) continue; result.set(path, { path, ...(targetName ? { targetName } : { properExtension }) }) } return [...result.values()] }
function normalizeExifItems(items: KisakiExifItem[] | undefined): KisakiExifItem[] { const result = new Map<string, KisakiExifItem>(); for (const item of items ?? []) { const path = clean(item.path); const tags = (item.tags ?? []).map((tag) => ({ name: clean(tag.name), code: Math.trunc(Number(tag.code)), group: clean(tag.group) })).filter((tag) => tag.name && tag.group && Number.isInteger(tag.code) && tag.code >= 0 && tag.code <= 0xffff); if (path && tags.length) result.set(path, { path, tags }) } return [...result.values()] }
function normalizeVideoOptimizerItems(items: KisakiVideoOptimizerItem[] | undefined): KisakiVideoOptimizerItem[] { const result = new Map<string, KisakiVideoOptimizerItem>(); for (const item of items ?? []) { const path = clean(item.path), codec = clean(item.codec); const cropRect = normalizeCropRect(item.cropRect); if (path && codec) result.set(path, { path, codec, ...(cropRect ? { cropRect } : {}) }) } return [...result.values()] }
function normalizeSimiuSetOperations(items: SimiuSetOperation[] | undefined): SimiuSetOperation[] { const result = new Map<string, SimiuSetOperation>(); for (const item of items ?? []) { const root = clean(item.root), sourcePath = clean(item.sourcePath), targetPath = clean(item.targetPath), mode = oneOf(item.mode, ["move", "copy", "link"] as const, "move"); if (root && sourcePath && targetPath) result.set(sourcePath, { root, sourcePath, targetPath, mode }) } return [...result.values()] }
function normalizeVideoOptimizerCodecs(value: unknown): string { const accepted = new Set(["h264", "h265", "av1", "vp9"]); const aliases: Record<string, string> = { hevc: "h265", "libx264": "h264", "libx265": "h265", "libsvtav1": "av1", "libvpx-vp9": "vp9" }; const values = clean(value).split(",").map((item) => aliases[item.trim().toLowerCase()] ?? item.trim().toLowerCase()).filter((item) => accepted.has(item)); return [...new Set(values)].join(",") || "h265,av1,vp9" }
function normalizeCropRect(value: Partial<KisakiVideoCropRect> | undefined): KisakiVideoCropRect | undefined { const left = Math.trunc(Number(value?.left)), top = Math.trunc(Number(value?.top)), right = Math.trunc(Number(value?.right)), bottom = Math.trunc(Number(value?.bottom)); return Number.isSafeInteger(left) && Number.isSafeInteger(top) && Number.isSafeInteger(right) && Number.isSafeInteger(bottom) && left >= 0 && top >= 0 && left < right && top < bottom ? { left, top, right, bottom } : undefined }
function cropRectFromNative(entry: NativeVideoOptimizerResult["entries"][number]): KisakiVideoCropRect | undefined { return normalizeCropRect({ left: entry.cropLeft, top: entry.cropTop, right: entry.cropRight, bottom: entry.cropBottom }) }
function videoOptimizationDetail(item: KisakiVideoOptimizerItem, value: KisakiNormalizedInput): string {
  if (value.videoOptimizerMode === "crop") {
    const crop = item.cropRect!
    return `Crop ${crop.left},${crop.top} to ${crop.right},${crop.bottom}${value.videoOptimizerCropTranscode ? ` as ${value.videoOptimizerTargetCodec}` : ""}`
  }
  const noiseReduction = value.videoOptimizerNoiseReduction === "hqdn3d"
    ? ` with HQDN3D strength ${value.videoOptimizerNoiseReductionStrength}`
    : ""
  return `Transcode as ${value.videoOptimizerTargetCodec} at quality ${value.videoOptimizerQuality}${noiseReduction}`
}
function clean(value: unknown): string { return String(value ?? "").trim() }
function clamp(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback }
function clampDecimal(value: unknown, min: number, max: number, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback }
function oneOf<const Values extends readonly (string | number)[]>(value: unknown, values: Values, fallback: Values[number]): Values[number] { return values.includes(value as Values[number]) ? value as Values[number] : fallback }
function csv(value: string): string { return `"${value.replaceAll('"', '""')}"` }
const EXPORT_FIELDS = ["groupId", "path", "name", "size", "modifiedDate", "hash", "secondaryPath", "detail", "properExtension", "width", "height", "fps", "codec", "similarity", "title", "artist", "year", "length", "genre", "bitrate", "isReference", "status", "operation", "conflictPolicy", "error"] as const satisfies readonly (keyof KisakiEntry)[]
function exportCsv(entries: KisakiEntry[]): string { return `${EXPORT_FIELDS.join(",")}\n${entries.map((entry) => EXPORT_FIELDS.map((field) => csv(String(entry[field] ?? ""))).join(",")).join("\n")}\n` }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
