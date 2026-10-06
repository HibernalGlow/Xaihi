import type { BitvAction, BitvData, BitvTransferMode } from "@xiranite/node-bitv/core"

export type BitvPhase = "idle" | "running" | "completed" | "error"

export interface BitvCardState {
  action?: BitvAction
  pathsText?: string
  reportPath?: string
  targetPath?: string
  outputPath?: string
  recursive?: boolean
  bitrateStepMbps?: number
  maxLevels?: number
  transferMode?: BitvTransferMode
  dryRun?: boolean
  result?: BitvData | null
  logs?: string[]
  phase?: BitvPhase
  progress?: number
  progressText?: string
}

export interface BitvStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}
