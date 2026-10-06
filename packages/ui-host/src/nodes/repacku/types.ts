import type { RepackuAction, RepackuData } from "@xiranite/node-repacku/core"

export interface RepackuCardState {
  path?: string
  configPath?: string
  typesText?: string
  minCount?: number
  deleteAfter?: boolean
  dryRun?: boolean
  action?: RepackuAction
  phase?: "idle" | "running" | "completed" | "error" | RepackuAction | string
  progress?: number
  progressText?: string
  result?: RepackuData | null
  logs?: string[]
}

export interface RepackuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}
