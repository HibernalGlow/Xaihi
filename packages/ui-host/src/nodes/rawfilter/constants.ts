import { FileSearch, FolderSearch, ShieldAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { RawfilterAction } from "@xiranite/node-rawfilter/core"

export interface RawfilterActionMeta {
  value: RawfilterAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive: boolean
}

export const ACTIONS: RawfilterActionMeta[] = [
  {
    value: "scan",
    label: "扫描分组",
    shortLabel: "扫描",
    description: "只扫描目录内的归档文件并按相似度分组，不生成处理计划。",
    icon: FolderSearch,
    destructive: false,
  },
  {
    value: "plan",
    label: "生成计划",
    shortLabel: "计划",
    description: "扫描并生成保留/移动/快捷方式计划，但不实际改动文件。",
    icon: FileSearch,
    destructive: false,
  },
  {
    value: "execute",
    label: "执行过滤",
    shortLabel: "过滤",
    description: "按计划真实移动重复/原始版本到 trash 或 multi 目录，不可撤销。",
    icon: ShieldAlert,
    destructive: true,
  },
]

export const DEFAULT_MIN_SIMILARITY = 0.82
