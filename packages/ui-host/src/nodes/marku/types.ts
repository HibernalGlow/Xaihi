import type { MarkuData, MarkuModuleId } from "@xiranite/node-marku/core"

export type MarkuPhase = "idle" | "running" | "completed" | "error"

export type MarkuDisplayTab = "output" | "diff" | "history" | "logs"

export interface MarkuCardState {
  inputText?: string
  pathText?: string
  module?: MarkuModuleId | string
  configText?: string
  recursive?: boolean
  dryRun?: boolean
  enableUndo?: boolean
  historyPath?: string
  result?: MarkuData | null
  logs?: string[]
  phase?: MarkuPhase
  progress?: number
  progressText?: string
}

export interface MarkuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof MarkuCardState> = [
  "inputText",
  "pathText",
  "module",
  "configText",
  "recursive",
  "dryRun",
  "enableUndo",
  "historyPath",
]
