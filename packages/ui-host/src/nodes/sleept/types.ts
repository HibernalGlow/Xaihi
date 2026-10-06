import type { NetTriggerMode, PowerMode, SleeptData } from "@xiranite/node-sleept/core"

export type SleeptTimerMode = "countdown" | "specific_time" | "netspeed" | "cpu"

export type SleeptPhase = "idle" | "running" | "completed" | "error" | "cancelled"

export interface SleeptStats {
  cpu: number
  upload: number
  download: number
}

export interface SleeptCardState {
  timerMode?: SleeptTimerMode
  powerMode?: PowerMode
  hours?: number
  minutes?: number
  seconds?: number
  targetDatetime?: string
  uploadThreshold?: number
  downloadThreshold?: number
  netDuration?: number
  netTriggerMode?: NetTriggerMode
  cpuThreshold?: number
  cpuDuration?: number
  dryrun?: boolean
  maxWaitSeconds?: number
  phase?: SleeptPhase
  progress?: number
  progressText?: string
  result?: SleeptData | null
  logs?: string[]
  stats?: SleeptStats
}

export interface SleeptStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof SleeptCardState> = [
  "timerMode",
  "powerMode",
  "hours",
  "minutes",
  "seconds",
  "targetDatetime",
  "uploadThreshold",
  "downloadThreshold",
  "netDuration",
  "netTriggerMode",
  "cpuThreshold",
  "cpuDuration",
  "dryrun",
  "maxWaitSeconds",
]
