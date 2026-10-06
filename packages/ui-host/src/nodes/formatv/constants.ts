import { Copy, FolderSync, Minus, Plus, RefreshCw, Search, Video } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { FormatvAction } from "./types"

export interface FormatvActionMeta {
  value: FormatvAction
  label: string
  shortLabel: string
  icon: LucideIcon
  description: string
}

export const ACTIONS: FormatvActionMeta[] = [
  {
    value: "scan",
    label: "扫描视频",
    shortLabel: "扫描",
    icon: RefreshCw,
    description: "扫描目录内的视频文件，分类普通、.nov 和带前缀文件。",
  },
  {
    value: "add_nov",
    label: "添加 .nov",
    shortLabel: "加 .nov",
    icon: Plus,
    description: "给普通视频文件追加 .nov 后缀，避免播放器扫描。",
  },
  {
    value: "remove_nov",
    label: "移除 .nov",
    shortLabel: "去 .nov",
    icon: Minus,
    description: "移除视频文件的 .nov 后缀，恢复可播放状态。",
  },
  {
    value: "check_duplicates",
    label: "查重",
    shortLabel: "查重",
    icon: Search,
    description: "检查带前缀文件与原文件是否重复，输出报告。",
  },
]

export const DEFAULT_PREFIX_NAME = "hb"

export const RESULT_ICON = Video
export const LOG_ICON = Copy
export const STATS_ICON = FolderSync
