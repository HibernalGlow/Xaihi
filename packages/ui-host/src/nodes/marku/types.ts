import type { MarkuData, MarkuModuleId, MarkuWorkflow, MarkuWorkflowRunData } from "@xiranite/node-marku/core"

export type MarkuPhase = "idle" | "running" | "completed" | "error"

export type MarkuDisplayTab = "output" | "diff" | "history" | "logs"

export type MarkuCardMode = "normal" | "workflow"

/** React Flow camera only; never part of the workflow library. */
export interface MarkuWorkflowViewport {
  x: number
  y: number
  zoom: number
}

export interface MarkuCardState {
  inputText?: string
  pathText?: string
  module?: MarkuModuleId | string
  configText?: string
  recursive?: boolean
  dryRun?: boolean
  enableUndo?: boolean
  historyPath?: string
  result?: MarkuData | null
  logs?: string[]
  phase?: MarkuPhase
  progress?: number
  progressText?: string
  /** Missing mode means Normal so old cards keep their behavior. */
  mode?: MarkuCardMode
  /** Library reference of the workflow the draft was loaded from; empty for unsaved drafts. */
  activeWorkflowId?: string
  selectedWorkflowStepId?: string
  /** Editable workflow copy; the saved library lives in node configuration. */
  workflowDraft?: MarkuWorkflow | null
  workflowViewport?: MarkuWorkflowViewport
  /** Transient run results for the workflow results view. */
  workflowRun?: MarkuWorkflowRunData | null
}

export interface MarkuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof MarkuCardState> = [
  "inputText",
  "pathText",
  "module",
  "configText",
  "recursive",
  "dryRun",
  "enableUndo",
  "historyPath",
]
