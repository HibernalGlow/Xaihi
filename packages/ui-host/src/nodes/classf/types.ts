import type { ClassfAction, ClassfClassifyMode, ClassfData, ClassfExistingPolicy, ClassfPlacementMode, ClassfStage, ClassfTransferMode, ClassfWorkItemMode } from "@xiranite/node-classf/core"

export type ClassfPhase = "idle" | "running" | "completed" | "error"

export interface ClassfCardState {
  action?: ClassfAction
  pathsText?: string
  crashuSourcesText?: string
  targetDir?: string
  transferMode?: ClassfTransferMode
  /** Legacy three-way mode; retained so older persisted configurations continue to work. */
  classifyMode?: ClassfClassifyMode
  alreadyEnabled?: boolean
  waitEnabled?: boolean
  delEnabled?: boolean
  placementMode?: ClassfPlacementMode
  existingPolicy?: ClassfExistingPolicy
  dryRun?: boolean
  workItemMode?: ClassfWorkItemMode
  blacklistKeywords?: string[]
  blacklistHistoryMinDeletions?: number
  sameaGroupEnabled?: boolean
  sameaGroupAlreadyEnabled?: boolean
  sameaGroupWaitEnabled?: boolean
  sameaGroupDelEnabled?: boolean
  sameaGroupMinOccurrences?: number
  sameaGroupCentralize?: boolean
  phase?: ClassfPhase
  progress?: number
  progressText?: string
  logs?: string[]
  result?: ClassfData | null
  planFingerprint?: string
  runningItem?: { sourcePath: string; stage: ClassfStage } | null
}

export interface ClassfStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS = [
  "pathsText",
  "crashuSourcesText",
  "targetDir",
  "transferMode",
  "classifyMode",
  "alreadyEnabled",
  "waitEnabled",
  "delEnabled",
  "placementMode",
  "existingPolicy",
  "dryRun",
  "workItemMode",
  "blacklistKeywords",
  "blacklistHistoryMinDeletions",
  "sameaGroupEnabled",
  "sameaGroupAlreadyEnabled",
  "sameaGroupWaitEnabled",
  "sameaGroupDelEnabled",
  "sameaGroupMinOccurrences",
  "sameaGroupCentralize",
] as const satisfies Array<keyof ClassfCardState>
