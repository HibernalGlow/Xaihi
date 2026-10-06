import type { FormatvData } from "@xiranite/node-formatv/core"

export type FormatvPhase =
  | "idle"
  | "scan"
  | "add_nov"
  | "remove_nov"
  | "check_duplicates"
  | "completed"
  | "error"

export type FormatvAction = "scan" | "add_nov" | "remove_nov" | "check_duplicates"

export interface FormatvCardState {
  pathText?: string
  prefixName?: string
  recursive?: boolean
  dryRun?: boolean
  phase?: FormatvPhase
  progress?: number
  progressText?: string
  result?: FormatvData | null
  logs?: string[]
}

export interface FormatvStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof FormatvCardState> = [
  "pathText",
  "prefixName",
  "recursive",
  "dryRun",
]
