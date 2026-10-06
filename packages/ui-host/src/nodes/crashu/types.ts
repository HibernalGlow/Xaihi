import type { CrashuConflictPolicy, CrashuData, CrashuMoveDirection } from "@xiranite/node-crashu/core"

export type CrashuPhase = "idle" | "scanning" | "planning" | "moving" | "completed" | "error"

export type CrashuAction = "scan" | "plan" | "move" | "execute"

export interface CrashuCardState {
  sourcePathsText?: string
  targetPath?: string
  targetNamesText?: string
  destinationPath?: string
  similarityThreshold?: number
  moveDirection?: CrashuMoveDirection
  conflictPolicy?: CrashuConflictPolicy
  dryRun?: boolean
  phase?: CrashuPhase
  progress?: number
  progressText?: string
  result?: CrashuData | null
  logs?: string[]
}

export interface CrashuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof CrashuCardState> = [
  "sourcePathsText",
  "targetPath",
  "targetNamesText",
  "destinationPath",
  "similarityThreshold",
  "moveDirection",
  "conflictPolicy",
]
