import type { SameaAction, SameaData } from "@xiranite/node-samea/core"

export type SameaPhase = "idle" | "running" | "completed" | "error"
export type SameaFilterTab = "artist" | "path" | "regex"

export interface SameaCardState {
  action?: SameaAction
  pathsText?: string
  ignorePathBlacklist?: boolean
  minOccurrences?: number
  centralize?: boolean
  dryRun?: boolean
  artistBlacklist?: string[]
  pathBlacklist?: string[]
  regexBlacklist?: string[]
  phase?: SameaPhase
  progress?: number
  progressText?: string
  logs?: string[]
  result?: SameaData | null
}
