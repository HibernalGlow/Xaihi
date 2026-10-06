import type { MigratefData, MigratefMode } from "@xiranite/node-migratef/core"

export type MigratefPhase = "idle" | "running" | "completed" | "error"

export type MigratefDisplayTab = "plan" | "history" | "logs"

export type MigratefActionMode = "move" | "copy"

export interface MigratefCardState {
  sourceText?: string
  targetPath?: string
  historyPath?: string
  mode?: MigratefMode
  action?: MigratefActionMode
  dryRun?: boolean
  result?: MigratefData | null
  logs?: string[]
  phase?: MigratefPhase
  progress?: number
  progressText?: string
}

export interface MigratefStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof MigratefCardState> = [
  "sourceText",
  "targetPath",
  "historyPath",
  "mode",
  "action",
  "dryRun",
]
