import type {
  BandiaArchiveFormat,
  BandiaData,
  BandiaExtractMode,
  BandiaOverwriteMode,
} from "@xiranite/node-bandia/core"

export type BandiaMode = "extract" | "compress" | "repack"

export interface BandiaCardState {
  mode?: BandiaMode
  pathText?: string
  mappingText?: string
  outputDir?: string
  deleteAfter?: boolean
  useTrash?: boolean
  parallel?: boolean
  workers?: number
  extractMode?: BandiaExtractMode
  overwriteMode?: BandiaOverwriteMode
  outputPrefix?: string
  compressFormat?: BandiaArchiveFormat
  deleteSource?: boolean
  dryRun?: boolean
  result?: BandiaData | null
  logs?: string[]
  phase?: string
  progress?: number
  progressText?: string
}

export interface BandiaStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof BandiaCardState> = [
  "mode",
  "mappingText",
  "outputDir",
  "deleteAfter",
  "useTrash",
  "parallel",
  "workers",
  "extractMode",
  "overwriteMode",
  "outputPrefix",
  "compressFormat",
  "deleteSource",
  "dryRun",
]
