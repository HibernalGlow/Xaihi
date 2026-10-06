import { Clock3, History, RotateCcw } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { TimeuAction } from "@xiranite/node-timeu/core"

export interface TimeuActionMeta {
  value: TimeuAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const ACTIONS: TimeuActionMeta[] = [
  {
    value: "scan",
    label: "扫描时间",
    shortLabel: "扫描",
    description: "读取当前时间戳并生成记录预览。",
    icon: Clock3,
  },
  {
    value: "backup",
    label: "备份时间",
    shortLabel: "备份",
    description: "写入 JSON 时间戳记录，供后续恢复。",
    icon: History,
  },
  {
    value: "restore",
    label: "恢复时间",
    shortLabel: "恢复",
    description: "按记录恢复访问时间和修改时间。",
    icon: RotateCcw,
  },
]

export const NODE_ICON = Clock3
