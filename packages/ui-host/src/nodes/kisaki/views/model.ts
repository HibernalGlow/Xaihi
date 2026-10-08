import type { NodeLocalFilesCapability } from "@xiranite/contract"
import type { KisakiAction, KisakiData, KisakiInput, KisakiSelectionStrategy, KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
import { createKisakiScanInput } from "@hibernalglow/xaihi-kisaki/tool-options"
import type { KisakiActivityLogEntry } from "@hibernalglow/xaihi-kisaki/activity-log"
import type { KisakiCardId, KisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout"
import type { KisakiFilterResult, KisakiFilterState, KisakiStoredFilterPreset } from "@hibernalglow/xaihi-kisaki/filters"
import type { KisakiFloatingPanelState, KisakiFloatingViewport } from "@hibernalglow/xaihi-kisaki/floating-panel"
import type { KisakiImageComparisonMode, KisakiImageComparisonState } from "@hibernalglow/xaihi-kisaki/image-comparison"
import type { KisakiSelectionAssistantConfig, KisakiSelectionHistory, KisakiSelectionResult, KisakiSelectionStats } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import type { KisakiWorkspaceLayout } from "@hibernalglow/xaihi-kisaki/workspace-layout"
import { ArchiveX, AudioLines, Copy, FileQuestion, FileText, FileX2, FolderX, HardDrive, Image, Link2Off, Tags, Video, WandSparkles } from "lucide-react"

import type { KisakiCardState, KisakiPanel, KisakiSimilarImagesViewMode } from "../types"

export interface KisakiView {
  data: KisakiCardState
  tool: KisakiTool
  nativeCapabilities: ReadonlySet<string>
  result: KisakiData | null
  filterState: KisakiFilterState
  filterResult: KisakiFilterResult
  filterPresets: KisakiStoredFilterPreset[]
  selectionConfig: KisakiSelectionAssistantConfig
  selectionStats: KisakiSelectionStats
  selectionHistory: KisakiSelectionHistory
  selectionAssistantOpen: boolean
  activityLog: KisakiActivityLogEntry[]
  cardLayout: KisakiCardLayout
  workspaceLayout: KisakiWorkspaceLayout
  similarImagesViewMode: KisakiSimilarImagesViewMode
  imageComparison: KisakiImageComparisonState
  previewPanelEnabled: boolean
  thumbnailEnabled: boolean
  floatingAnalysisPanel: KisakiFloatingPanelState
  floatingViewport: KisakiFloatingViewport
  floatingAvailable: boolean
  canResizeWorkspace: boolean
  running: boolean
  selectedPaths: string[]
  filterText: string
  panel: KisakiPanel
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  language: "zh" | "en"
  getFileUrl?: (path: string) => string
  pickFiles?: NodeLocalFilesCapability["pickFiles"]
  pickDirectory?: () => Promise<string | undefined>
  pickDirectories?: () => Promise<string[]>
  copyText?: (text: string) => Promise<void>
  copyFiles?: (paths: string[]) => Promise<void>
  openPath?: (path: string) => Promise<void>
  revealPath?: (path: string) => Promise<void>
  patch: (next: Partial<KisakiCardState>) => void
  clearActivityLog: () => void
  setCardLayout: (layout: KisakiCardLayout) => void
  setWorkspaceLayout: (layout: KisakiWorkspaceLayout) => void
  setSimilarImagesViewMode: (mode: KisakiSimilarImagesViewMode) => void
  openImageComparison: (path: string) => void
  closeImageComparison: () => void
  setImageComparisonMode: (mode: KisakiImageComparisonMode) => void
  setImageComparisonColorCoding: (colorCoding: boolean) => void
  setImageComparisonTarget: (path: string) => void
  setImageComparisonSwipe: (swipePercent: number) => void
  setImageComparisonOpacity: (onionOpacity: number) => void
  setPreviewPanelEnabled: (enabled: boolean) => void
  setThumbnailEnabled: (enabled: boolean) => void
  setFloatingAnalysisPanel: (state: KisakiFloatingPanelState) => void
  setPanel: (panel: KisakiPanel) => void
  setSelectedPaths: (paths: string[]) => void
  setFilterState: (value: KisakiFilterState) => void
  setFilterPresets: (value: KisakiStoredFilterPreset[]) => void
  setFilterText: (value: string) => void
  setSelectionConfig: (value: KisakiSelectionAssistantConfig) => void
  setSelectionAssistantOpen: (open: boolean) => void
  applySelectionRule: (kind: "group" | "text" | "directory") => KisakiSelectionResult
  undoSelection: () => void
  redoSelection: () => void
  invertSelection: () => void
  selectAllVisible: () => void
  executeScan: () => Promise<void>
  cancelScan: () => Promise<void>
  executeOperation: (action: KisakiAction, overrides?: Partial<KisakiInput>) => Promise<void>
  applySmartSelection: (strategy: KisakiSelectionStrategy) => void
}

interface KisakiToolMeta {
  id: KisakiTool
  labelKey: string
  label: string
  shortKey: string
  short: string
  icon: typeof Copy
  requiredNativeCapability?: string
}

export const KISAKI_TOOL_META = [
  { id: "duplicate-files", labelKey: "tools.duplicateFiles", label: "重复文件", shortKey: "tools.short.duplicateFiles", short: "重复", icon: Copy },
  { id: "empty-folders", labelKey: "tools.emptyFolders", label: "空文件夹", shortKey: "tools.short.emptyFolders", short: "空夹", icon: FolderX },
  { id: "big-files", labelKey: "tools.bigFiles", label: "大文件", shortKey: "tools.short.bigFiles", short: "大文件", icon: HardDrive },
  { id: "empty-files", labelKey: "tools.emptyFiles", label: "空文件", shortKey: "tools.short.emptyFiles", short: "空文件", icon: FileX2 },
  { id: "temporary-files", labelKey: "tools.temporaryFiles", label: "临时文件", shortKey: "tools.short.temporaryFiles", short: "临时", icon: ArchiveX },
  { id: "similar-images", labelKey: "tools.similarImages", label: "相似图片", shortKey: "tools.short.similarImages", short: "图片", icon: Image },
  { id: "similar-videos", labelKey: "tools.similarVideos", label: "相似视频", shortKey: "tools.short.similarVideos", short: "视频", icon: Video },
  { id: "duplicate-music", labelKey: "tools.duplicateMusic", label: "重复音频", shortKey: "tools.short.duplicateMusic", short: "音频", icon: AudioLines },
  { id: "invalid-symlinks", labelKey: "tools.invalidSymlinks", label: "无效符号链接", shortKey: "tools.short.invalidSymlinks", short: "链接", icon: Link2Off },
  { id: "broken-files", labelKey: "tools.brokenFiles", label: "损坏文件", shortKey: "tools.short.brokenFiles", short: "损坏", icon: FileQuestion },
  { id: "bad-extensions", labelKey: "tools.badExtensions", label: "不正确扩展名", shortKey: "tools.short.badExtensions", short: "扩展名", icon: ArchiveX },
  { id: "bad-names", labelKey: "tools.badNames", label: "坏文件名", shortKey: "tools.short.badNames", short: "坏名称", icon: FileText, requiredNativeCapability: "scan.bad-names" },
  { id: "exif-remover", labelKey: "tools.exifRemover", label: "EXIF 清理", shortKey: "tools.short.exifRemover", short: "EXIF", icon: Tags, requiredNativeCapability: "scan.exif-remover" },
  { id: "video-optimizer", labelKey: "tools.videoOptimizer", label: "视频优化", shortKey: "tools.short.videoOptimizer", short: "优化", icon: WandSparkles, requiredNativeCapability: "scan.video-optimizer" },
] as const satisfies ReadonlyArray<KisakiToolMeta>

export function getKisakiToolMeta(tool: KisakiTool, t?: KisakiView["t"]) {
  const meta = KISAKI_TOOL_META.find((item) => item.id === tool) ?? KISAKI_TOOL_META[0]
  return t ? { ...meta, label: t(meta.labelKey, meta.label), short: t(meta.shortKey, meta.short) } : meta
}

export function scanInput(tool: KisakiTool, data: KisakiCardState): KisakiInput {
  return createKisakiScanInput(tool, {
    ...data,
    deleteOutdatedCache: data.deleteOutdatedCacheByTool?.[tool] ?? true,
    simiuSetsEnabled: tool === "similar-images" && data.similarImagesMode === "simiu-sets",
  } as Record<string, unknown>)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = units[0]!
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]!
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
