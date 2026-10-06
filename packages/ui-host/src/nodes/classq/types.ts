import type { ClassqAction, ClassqData, ClassqExistingPolicy, ClassqTransferMode } from "@xiranite/node-classq/core"

export type ClassqPhase = "idle" | "running" | "completed" | "error"

export interface ClassqCardState {
  action?: ClassqAction
  pathsText?: string
  keyword?: string
  waitKeyword?: string
  transferMode?: ClassqTransferMode
  existingPolicy?: ClassqExistingPolicy
  dryRun?: boolean
  phase?: ClassqPhase
  progress?: number
  progressText?: string
  logs?: string[]
  result?: ClassqData | null
}

export interface ClassqStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS = [
  "pathsText",
  "keyword",
  "waitKeyword",
  "transferMode",
  "existingPolicy",
  "dryRun",
] as const satisfies Array<keyof ClassqCardState>
