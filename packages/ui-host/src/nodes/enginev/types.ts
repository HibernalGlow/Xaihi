import type {
  EngineVAction,
  EngineVData,
  EngineVExportFormat,
  EngineVWallpaper,
} from "@xiranite/node-enginev/core"

export interface EngineVCardState {
  action?: EngineVAction
  actionTrayPinned?: boolean
  workshopPath?: string
  titleFilter?: string
  ratingFilter?: string
  typeFilter?: string
  idsText?: string
  template?: string
  outputPath?: string
  exportFormat?: EngineVExportFormat
  dryRun?: boolean
  copyMode?: boolean
  permanent?: boolean
  targetPath?: string
  galleryColumns?: number
  galleryCompact?: boolean
  galleryShowMeta?: boolean
  galleryShowPath?: boolean
  phase?: string
  progress?: number
  progressText?: string
  wallpapers?: EngineVWallpaper[]
  filteredWallpapers?: EngineVWallpaper[]
  result?: EngineVData | null
  logs?: string[]
}

export interface EngineVUiConfig {
  actionTrayPinned?: boolean
  galleryColumns?: number
  galleryCompact?: boolean
  galleryShowMeta?: boolean
  galleryShowPath?: boolean
}

export interface EngineVNodeConfig {
  workshopPath?: string
  outputPath?: string
  template?: string
  ui?: EngineVUiConfig
}

export type EngineVStatusTone = "idle" | "running" | "success" | "error"

export interface EngineVStatusMeta {
  label: string
  description: string
  tone: EngineVStatusTone
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}
