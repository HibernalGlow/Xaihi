import type { LinedupFilterResult } from "@xiranite/node-linedup/core"

export type LinedupPhase = "idle" | "ready" | "completed" | "error"
export type LinedupDisplayTab = "preview" | "kept" | "removed" | "logs"

export interface LinedupCardState {
  sourceText?: string
  filterText?: string
  caseSensitive?: boolean
  sort?: boolean
  phase?: LinedupPhase
  result?: LinedupFilterResult | null
  logs?: string[]
}

export interface LinedupStatusMeta {
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  description: string
  iconClass: string
  label: string
  tone: "idle" | "running" | "success" | "error"
}
