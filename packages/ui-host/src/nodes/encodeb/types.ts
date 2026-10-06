import type { EncodebMapping, EncodebStrategy, EncodebTransform } from "@xiranite/node-encodeb/core"

export type { EncodebStrategy } from "@xiranite/node-encodeb/core"

export type EncodebPhase =
  | "idle"
  | "scanning"
  | "previewing"
  | "executing"
  | "completed"
  | "error"

export type EncodebPreset = "auto" | "cn" | "jp" | "kr" | "jp_from_cn" | "jp_iso2022_from_cn" | "latin1_utf8" | "hash_u" | "middle_dot" | "custom"

export type EncodebAction = "find" | "preview" | "recover"

export interface EncodebCardState {
  pathText?: string
  preset?: EncodebPreset
  srcEncoding?: string
  dstEncoding?: string
  transform?: EncodebTransform
  strategy?: EncodebStrategy
  phase?: EncodebPhase
  progress?: number
  progressText?: string
  logs?: string[]
  mappings?: EncodebMapping[]
  matches?: string[]
}

export interface EncodebStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export const CONFIG_FIELDS: Array<keyof EncodebCardState> = [
  "pathText",
  "preset",
  "srcEncoding",
  "dstEncoding",
  "transform",
  "strategy",
]
