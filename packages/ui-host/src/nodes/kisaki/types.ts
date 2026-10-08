import type { KisakiCheckMethod, KisakiConflictPolicy, KisakiData, KisakiDeleteMode, KisakiExportScope, KisakiHashType, KisakiImageGeometricInvariance, KisakiImageHashAlgorithm, KisakiImageResizeAlgorithm, KisakiMusicCheckType, KisakiSort, KisakiTool, KisakiVideoCropDetect, KisakiVideoOptimizerCodec, KisakiVideoOptimizerMode, KisakiVideoOptimizerNoiseReduction } from "@hibernalglow/xaihi-kisaki/core"
import type { SimiuSetApplyMode, SimiuSetScanOrder } from "@hibernalglow/xaihi-kisaki/simiu-sets"
import type { KisakiImageComparisonMode } from "@hibernalglow/xaihi-kisaki/image-comparison"
import type { KisakiFilterState, KisakiStoredFilterPreset } from "@hibernalglow/xaihi-kisaki/filters"
import type { KisakiSelectionAssistantConfig } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import type { KisakiActivityLogEntry } from "@hibernalglow/xaihi-kisaki/activity-log"
import type { KisakiCardId, KisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout"
import type { KisakiFloatingPanelState } from "@hibernalglow/xaihi-kisaki/floating-panel"
import type { KisakiScanPreset } from "@hibernalglow/xaihi-kisaki/scan-presets"
import type { KisakiWorkspaceLayout } from "@hibernalglow/xaihi-kisaki/workspace-layout"

export type KisakiPhase = "idle" | "running" | "completed" | "stopped" | "error"
export type KisakiPanel = "source" | "results" | "analysis"
export type KisakiSimilarImagesViewMode = "images" | "folders"
export type KisakiSimilarImagesMode = "scanner" | "simiu-sets"

export interface KisakiCardState {
  schemaVersion?: 1 | 2
  tool?: KisakiTool
  includedDirectoriesText?: string
  includedDirectoriesReferencedText?: string
  excludedDirectoriesText?: string
  excludedItemsText?: string
  allowedExtensions?: string
  excludedExtensions?: string
  minimumFileSize?: string
  maximumFileSize?: string
  recursive?: boolean
  useCache?: boolean
  saveAlsoAsJson?: boolean
  deleteOutdatedCacheByTool?: Partial<Record<KisakiTool, boolean>>
  cacheFolderPath?: string
  configFolderPath?: string
  duplicateMinimalHashCacheSizeKiB?: string
  duplicateMinimalPrehashCacheSizeKiB?: string
  threadCount?: string
  checkMethod?: KisakiCheckMethod
  hashType?: KisakiHashType
  caseSensitiveNames?: boolean
  ignoreHardLinks?: boolean
  usePrehash?: boolean
  duplicateMinimumGroupSize?: string
  numberOfFiles?: string
  biggestFirst?: boolean
  similarity?: string
  similarImagesHashSize?: string
  similarImagesHashAlgorithm?: KisakiImageHashAlgorithm
  similarImagesResizeAlgorithm?: KisakiImageResizeAlgorithm
  similarImagesIgnoreSameSize?: boolean
  similarImagesIgnoreSameResolution?: boolean
  similarImagesGeometricInvariance?: KisakiImageGeometricInvariance
  similarImagesFolderThreshold?: string
  similarImagesMode?: KisakiSimilarImagesMode
  simiuSetsScanOrder?: SimiuSetScanOrder
  simiuSetsNamePrefix?: string
  simiuSetsMinimumGroupSize?: string
  simiuSetsOperationMode?: SimiuSetApplyMode
  simiuSetsCleanEmptyDirectories?: boolean
  similarImagesViewMode?: KisakiSimilarImagesViewMode
  imageComparisonMode?: KisakiImageComparisonMode
  imageComparisonColorCoding?: boolean
  similarVideosIgnoreSameSize?: boolean
  similarVideosIgnoreSameResolution?: boolean
  similarVideosSkipForward?: string
  similarVideosHashDuration?: string
  similarVideosLetterboxCrop?: boolean
  similarVideosWindowCount?: string
  similarVideosDurationTolerancePct?: string
  similarVideosMinMatchingWindows?: string
  similarVideosSubclipMinMatch?: string
  similarVideosCheckAudioContent?: boolean
  /** Legacy v1 field retained for one rollback window. */
  similarVideosCropDetect?: KisakiVideoCropDetect
  czkawka12MotionCropMigrationNotified?: boolean
  czkawkaCacheSourceVersion?: string
  czkawkaCacheRegenerationNoticeSourceVersion?: string
  musicCheckType?: KisakiMusicCheckType
  musicApproximateComparison?: boolean
  musicCompareTitle?: boolean
  musicCompareArtist?: boolean
  musicCompareBitrate?: boolean
  musicCompareGenre?: boolean
  musicCompareYear?: boolean
  musicCompareLength?: boolean
  musicMaximumDifference?: string
  musicMinimumFragmentDuration?: string
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
  videoOptimizerBlackPixelThreshold?: string
  videoOptimizerBlackBarMinPercentage?: string
  videoOptimizerMaxSamples?: string
  videoOptimizerMinCropSize?: string
  videoOptimizerTargetCodec?: KisakiVideoOptimizerCodec
  videoOptimizerQuality?: string
  videoOptimizerFailIfNotSmaller?: boolean
  videoOptimizerLimitVideoSize?: boolean
  videoOptimizerMaximumWidth?: string
  videoOptimizerMaximumHeight?: string
  videoOptimizerNoiseReduction?: KisakiVideoOptimizerNoiseReduction
  videoOptimizerNoiseReductionStrength?: string
  videoOptimizerCropTranscode?: boolean
  filterText?: string
  filterStatesByTool?: Partial<Record<KisakiTool, KisakiFilterState>>
  filterPresets?: KisakiStoredFilterPreset[]
  selectionAssistantConfig?: KisakiSelectionAssistantConfig
  selectionAssistantOpen?: boolean
  previewPanelEnabledByTool?: Partial<Record<KisakiTool, boolean>>
  thumbnailEnabledByTool?: Partial<Record<KisakiTool, boolean>>
  referencePathKeywords?: string
  reversePathDisplay?: boolean
  tableWrapText?: boolean
  activityLog?: KisakiActivityLogEntry[]
  cardLayout?: KisakiCardLayout
  sourcePanelTab?: KisakiCardId
  sourceSettingsTab?: "paths" | "algorithm"
  analysisPanelTab?: KisakiCardId
  workspaceLayout?: KisakiWorkspaceLayout
  floatingAnalysisPanel?: KisakiFloatingPanelState
  scanPresets?: KisakiScanPreset[]
  activeScanPresetId?: string
  sortBy?: KisakiSort
  descending?: boolean
  dryRun?: boolean
  destinationDirectory?: string
  deleteMode?: KisakiDeleteMode
  copyMode?: boolean
  preserveStructure?: boolean
  conflictPolicy?: KisakiConflictPolicy
  organizeSubfolderTemplate?: string
  organizeSkipSingleFileFolders?: boolean
  outputPath?: string
  exportScope?: KisakiExportScope
  phase?: KisakiPhase
  progress?: number
  progressText?: string
  result?: KisakiData | null
  operation?: KisakiData | null
}
