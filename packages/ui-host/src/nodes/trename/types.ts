import type { TrenameData, TrenameScanMode } from "@xiranite/node-trename/core"

export type TrenamePhase =
  | "idle"
  | "scanning"
  | "ready"
  | "validating"
  | "renaming"
  | "completed"
  | "error"

export type TrenameDisplayTab = "tree" | "plan" | "conflicts" | "history" | "logs"

export interface TrenameCardState {
  pathText?: string
  basePath?: string
  jsonText?: string
  mode?: TrenameScanMode
  includeHidden?: boolean
  includeRoot?: boolean
  compact?: boolean
  dryRun?: boolean
  excludeExts?: string
  excludePatterns?: string
  maxLines?: number
  batchId?: string
  undoPath?: string
  keepRecent?: number
  phase?: TrenamePhase
  progress?: number
  progressText?: string
  result?: TrenameData | null
  logs?: string[]
}

export interface TrenameStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof TrenameCardState> = [
  "pathText",
  "basePath",
  "mode",
  "includeHidden",
  "includeRoot",
  "compact",
  "dryRun",
  "excludeExts",
  "excludePatterns",
  "maxLines",
  "batchId",
  "undoPath",
  "keepRecent",
]
