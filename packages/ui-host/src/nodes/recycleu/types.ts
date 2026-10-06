import type { RecycleuData, RecycleuInput } from "@xiranite/node-recycleu/core"

export interface RecycleuCardState {
  action?: RecycleuInput["action"]
  interval?: number
  maxCycles?: number
  driveLetter?: string
  phase?: "idle" | "running" | "completed" | "error" | string
  progress?: number
  progressText?: string
  remainingSeconds?: number
  cleanCount?: number
  lastCleanTime?: string | null
  result?: RecycleuData | null
  logs?: string[]
}

export interface RecycleuStatusMeta {
  label: string
  detail: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
}
