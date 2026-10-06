import type { GifuAction, GifuData, GifuFormat, GifuOutputMode } from "@xiranite/node-gifu/core"

export type GifuPhase = "idle" | "running" | "completed" | "error"

export interface GifuCardState {
  action?: GifuAction
  pathsText?: string
  configPath?: string
  databasePath?: string
  format?: GifuFormat
  outDir?: string
  outMode?: GifuOutputMode
  durationMs?: string
  maxWorkers?: string
  namePrefix?: string
  dryRun?: boolean
  recordRun?: boolean
  result?: GifuData | null
  logs?: string[]
  phase?: GifuPhase
  progress?: number
  progressText?: string
}

export interface GifuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof GifuCardState> = [
  "pathsText",
  "configPath",
  "databasePath",
  "format",
  "outDir",
  "outMode",
  "durationMs",
  "maxWorkers",
  "namePrefix",
  "dryRun",
  "recordRun",
]
