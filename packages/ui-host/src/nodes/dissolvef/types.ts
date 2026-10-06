import type { DissolvefConflictMode, DissolvefData, DissolvefMode } from "@xiranite/node-dissolvef/core"

export type DissolvefPhase = "idle" | "planning" | "dissolving" | "completed" | "error"

export type DissolvefAction = "plan" | "dissolve" | "direct" | "history" | "undo"

export interface DissolvefCardState {
  pathText?: string
  historyPath?: string
  excludeText?: string
  nested?: boolean
  media?: boolean
  archive?: boolean
  direct?: boolean
  preview?: boolean
  protectFirstLevel?: boolean
  enableSimilarity?: boolean
  similarityThreshold?: number
  fileConflict?: DissolvefConflictMode
  dirConflict?: DissolvefConflictMode
  undoId?: string
  phase?: DissolvefPhase
  progress?: number
  progressText?: string
  result?: DissolvefData | null
  logs?: string[]
}

export interface DissolvefStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof DissolvefCardState> = [
  "pathText",
  "historyPath",
  "excludeText",
  "nested",
  "media",
  "archive",
  "direct",
  "preview",
  "protectFirstLevel",
  "enableSimilarity",
  "similarityThreshold",
  "fileConflict",
  "dirConflict",
]

export type DissolvefBundleMode = Exclude<DissolvefMode, "direct">
