import type { LucideIcon } from "lucide-react"
import { FileArchive, FolderOpen, Package, Search, Sparkles } from "lucide-react"
import type { RepackuAction } from "@xiranite/node-repacku/core"
import type { RepackuCardState } from "./types"

export const CONFIG_FIELDS: (keyof RepackuCardState)[] = ["path", "configPath", "typesText", "minCount", "deleteAfter", "dryRun", "action"]

export interface RepackuActionMeta {
  value: RepackuAction
  label: string
  description: string
  icon: LucideIcon
}

export const ACTIONS: RepackuActionMeta[] = [
  { value: "analyze", label: "分析", description: "扫描文件夹并写出配置计划。", icon: Search },
  { value: "full", label: "完整流程", description: "先分析，再按计划执行重打包。", icon: Sparkles },
  { value: "compress", label: "按配置压缩", description: "从已有配置或当前路径执行压缩。", icon: FileArchive },
  { value: "single-pack", label: "单层打包", description: "打包一级子目录和散图。", icon: Package },
  { value: "gallery-pack", label: "画集打包", description: "查找画集目录并逐个单层打包。", icon: FolderOpen },
]
