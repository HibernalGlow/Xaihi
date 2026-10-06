import type { RawfilterAction, RawfilterData } from "@xiranite/node-rawfilter/core"

export type RawfilterPhase = "idle" | "scanning" | "completed" | "error"

export interface RawfilterCardState {
  action?: RawfilterAction
  path?: string
  nameOnlyMode?: boolean
  createShortcuts?: boolean
  trashOnly?: boolean
  minSimilarity?: number
  dryRun?: boolean
  result?: RawfilterData | null
  logs?: string[]
  phase?: RawfilterPhase
  progress?: number
  progressText?: string
}

export interface RawfilterStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof RawfilterCardState> = [
  "action",
  "path",
  "nameOnlyMode",
  "createShortcuts",
  "trashOnly",
  "minSimilarity",
  "dryRun",
]
