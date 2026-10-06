import { ClipboardList, FilePenLine, FolderTree, Play, ScanLine } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { NameuAction } from "@xiranite/node-nameu/core"

export interface NameuActionMeta {
  value: NameuAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive: boolean
}

export const ACTIONS: NameuActionMeta[] = [
  {
    value: "scan",
    label: "扫描文件",
    shortLabel: "扫描",
    description: "读取艺术家目录和归档文件，不生成改名计划。",
    icon: ScanLine,
    destructive: false,
  },
  {
    value: "plan",
    label: "预览改名",
    shortLabel: "预览",
    description: "生成文件名清理和艺术家名补全计划。",
    icon: ClipboardList,
    destructive: false,
  },
  {
    value: "rename",
    label: "执行改名",
    shortLabel: "改名",
    description: "按当前计划重命名文件和目录，需要确认。",
    icon: Play,
    destructive: true,
  },
]

export const MODES = [
  { value: "multi", label: "库目录", icon: FolderTree },
  { value: "single", label: "单个作者", icon: FilePenLine },
] as const

export const NODE_ICON = FilePenLine
