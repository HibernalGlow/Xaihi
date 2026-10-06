import {
  Clipboard,
  FolderOpen,
  Info,
  Link2,
  ListChecks,
  RefreshCw,
  RotateCcw,
  type LucideIcon,
} from "lucide-react"
import type { LinkuAction } from "@xiranite/node-linku/core"

export interface LinkuActionMeta {
  value: LinkuAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  /** 需要源路径 + 目标路径 */
  needsTarget: boolean
  /** 改动文件系统的风险操作 */
  destructive: boolean
}

export const ACTIONS: LinkuActionMeta[] = [
  {
    value: "info",
    label: "查询路径",
    shortLabel: "查询",
    description: "读取路径信息：是否存在、类型、是否为符号链接、链接目标、体积。",
    icon: Info,
    needsTarget: false,
    destructive: false,
  },
  {
    value: "create",
    label: "创建链接",
    shortLabel: "创建",
    description: "为源路径创建一个指向它的符号链接（目标位置）。会写入链接记录。",
    icon: Link2,
    needsTarget: true,
    destructive: true,
  },
  {
    value: "move_link",
    label: "移动并链接",
    shortLabel: "移动",
    description: "把源路径移动到目标位置，再在原位创建指向新位置的符号链接。",
    icon: FolderOpen,
    needsTarget: true,
    destructive: true,
  },
  {
    value: "list",
    label: "列出链接",
    shortLabel: "列表",
    description: "读取配置文件中记录的全部符号链接。",
    icon: ListChecks,
    needsTarget: false,
    destructive: false,
  },
  {
    value: "recover",
    label: "恢复链接",
    shortLabel: "恢复",
    description: "按记录批量重建符号链接，统计成功与失败计数。",
    icon: RefreshCw,
    needsTarget: false,
    destructive: true,
  },
  {
    value: "restore",
    label: "还原链接",
    shortLabel: "还原",
    description: "校验已记录的链接后，将目标移回原路径，并删除对应链接记录。",
    icon: RotateCcw,
    needsTarget: false,
    destructive: true,
  },
]

export const PASTE_ICON = Clipboard
