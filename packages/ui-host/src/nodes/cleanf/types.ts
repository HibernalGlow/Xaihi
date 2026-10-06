import type { CleanfData, CleanfPresetId } from "@xiranite/node-cleanf/core"

export type CleanfPhase = "idle" | "scanning" | "completed" | "error"

export interface CleanfCardState {
  pathText?: string
  selectedPresets?: CleanfPresetId[]
  excludeKeywords?: string
  previewMode?: boolean
  phase?: CleanfPhase
  progress?: number
  progressText?: string
  result?: CleanfData | null
  logs?: string[]
}

export interface CleanfStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof CleanfCardState> = [
  "pathText",
  "selectedPresets",
  "excludeKeywords",
  "previewMode",
]
