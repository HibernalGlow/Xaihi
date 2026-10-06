import type { LinkuAction, LinkuData } from "@xiranite/node-linku/core"

export type LinkuPhase =
  | "idle"
  | "running"
  | "completed"
  | "error"

export type LinkuDisplayTab = "links" | "pathInfo" | "logs"

export interface LinkuCardState {
  path?: string
  target?: string
  configPath?: string
  action?: LinkuAction
  phase?: LinkuPhase
  progress?: number
  progressText?: string
  result?: LinkuData | null
  logs?: string[]
}

export interface LinkuStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

/** comp.data 中属于"配置覆盖"的字段，可保存到 TOML */
export const CONFIG_FIELDS: Array<keyof LinkuCardState> = [
  "path",
  "target",
  "configPath",
]
