import { Eye, Film, ListChecks } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { GifuAction, GifuFormat, GifuOutputMode } from "@xiranite/node-gifu/core"

export interface GifuActionMeta {
  value: GifuAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive: boolean
}

export const ACTIONS: GifuActionMeta[] = [
  {
    value: "inspect",
    label: "检查归档",
    shortLabel: "检查",
    description: "扫描目录和压缩包，统计可转换图片序列，不生成输出文件。",
    icon: Eye,
    destructive: false,
  },
  {
    value: "plan",
    label: "生成计划",
    shortLabel: "计划",
    description: "计算输出文件名、命令参数和运行记录路径。",
    icon: ListChecks,
    destructive: false,
  },
  {
    value: "make",
    label: "生成动画",
    shortLabel: "生成",
    description: "使用原生 TypeScript 工作流生成 GIF/WebP/APNG/视频文件。",
    icon: Film,
    destructive: true,
  },
]

export const FORMAT_OPTIONS: Array<{ value: GifuFormat; label: string }> = [
  { value: "webp", label: "WebP" },
  { value: "gif", label: "GIF" },
  { value: "apng", label: "APNG" },
  { value: "webm", label: "WebM" },
  { value: "mp4", label: "MP4" },
  { value: "auto", label: "Auto" },
]

export const OUTPUT_MODE_OPTIONS: Array<{ value: GifuOutputMode; label: string }> = [
  { value: "same", label: "同目录" },
  { value: "separate", label: "独立目录" },
]
