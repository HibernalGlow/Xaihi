import type { TimeuAction, TimeuData } from "@xiranite/node-timeu/core"

export type TimeuPhase = "idle" | "running" | "completed" | "error"

export interface TimeuCardState {
  action?: TimeuAction
  pathsText?: string
  recordPath?: string
  recursive?: boolean
  includeDirectories?: boolean
  dryRun?: boolean
  phase?: TimeuPhase
  progress?: number
  progressText?: string
  logs?: string[]
  result?: TimeuData | null
}

export interface TimeuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS = [
  "pathsText",
  "recordPath",
  "recursive",
  "includeDirectories",
  "dryRun",
] as const satisfies Array<keyof TimeuCardState>
