import { BarChart3, FileBarChart, Gauge, ScanLine, Waypoints } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { BitvAction } from "@xiranite/node-bitv/core"

export type { BitvAction }

export interface BitvActionMeta {
  value: BitvAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive: boolean
}

export const ACTIONS: readonly BitvActionMeta[] = [
  { value: "analyze", label: "视频分析", shortLabel: "分析", description: "扫描视频或目录，计算码率、时长与分级。", icon: BarChart3, destructive: false },
  { value: "classify", label: "分类视频", shortLabel: "分类", description: "按码率级别复制或移动视频到目标目录。", icon: Waypoints, destructive: true },
  { value: "report", label: "从报告分类", shortLabel: "报告", description: "从既有 BitV JSON 报告恢复分类计划。", icon: FileBarChart, destructive: true },
  { value: "status", label: "检查 ffprobe", shortLabel: "环境", description: "确认本机视频探测器是否可用。", icon: ScanLine, destructive: false },
] as const

export const NODE_META = { id: "bitv", title: "BitV", description: "使用 ffprobe 分析视频码率，并按分级安全地整理视频文件。", icon: Gauge } as const
