import type { NameuAction, NameuData, NameuMode } from "@xiranite/node-nameu/core"

export type NameuPhase = "idle" | "running" | "completed" | "error"

export interface NameuCardState {
  action?: NameuAction
  pathsText?: string
  mode?: NameuMode
  recursive?: boolean
  addArtistName?: boolean
  normalizeFolders?: boolean
  keepTimestamp?: boolean
  dryRun?: boolean
  result?: NameuData | null
  logs?: string[]
  phase?: NameuPhase
  progress?: number
  progressText?: string
}

export interface NameuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS = [
  "pathsText",
  "mode",
  "recursive",
  "addArtistName",
  "normalizeFolders",
  "keepTimestamp",
  "dryRun",
] as const satisfies Array<keyof NameuCardState>
