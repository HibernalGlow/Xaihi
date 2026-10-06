import type { MvzAction, MvzData } from "@xiranite/node-mvz/core"

export type MvzPhase = "idle" | "running" | "completed" | "error"

export interface MvzCardState {
  action?: MvzAction
  entryText?: string
  output?: string
  pattern?: string
  replacement?: string
  separator?: string
  near?: boolean
  autoDir?: boolean
  flatten?: boolean
  dryRun?: boolean
  result?: MvzData | null
  logs?: string[]
  phase?: MvzPhase
  progress?: number
  progressText?: string
}

export interface MvzStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof MvzCardState> = [
  "action",
  "entryText",
  "output",
  "pattern",
  "replacement",
  "separator",
  "near",
  "autoDir",
  "flatten",
  "dryRun",
]
