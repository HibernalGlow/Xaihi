import type { LogxAction, LogxData, LogxInput } from "@xiranite/node-logx/core"

export type LogxPhase = "idle" | "running" | "completed" | "error"
export type LogxCompactTab = "query" | "events" | "summary"

export interface LogxCardState {
  action?: LogxAction
  directory?: string
  minimumSeverity?: LogxInput["minimumSeverity"]
  scope?: string
  eventName?: string
  sessionId?: string
  search?: string
  since?: string
  until?: string
  limit?: number
  order?: LogxInput["order"]
  phase?: LogxPhase
  progress?: number
  status?: string
  result?: LogxData | null
}
