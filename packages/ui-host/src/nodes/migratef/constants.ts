import { FolderTree, Layers, MoveRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { MigratefMode } from "@xiranite/node-migratef/core"
import type { MigratefActionMode } from "./types"

export interface MigratefModeMeta {
  value: MigratefMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const MODES: MigratefModeMeta[] = [
  { value: "preserve", label: "保持结构", shortLabel: "保持", description: "保留源目录的相对层级，迁移到目标下。", icon: FolderTree },
  { value: "flat", label: "扁平模式", shortLabel: "扁平", description: "丢弃目录层级，把文件直接放进目标。", icon: Layers },
  { value: "direct", label: "直接迁移", shortLabel: "直接", description: "把源目录整体移动/复制到目标下。", icon: MoveRight },
]

export interface MigratefActionMeta {
  value: MigratefActionMode
  label: string
  shortLabel: string
  description: string
}

export const ACTIONS: MigratefActionMeta[] = [
  { value: "move", label: "移动", shortLabel: "移动", description: "把源文件移动到目标，源位置会被清空。" },
  { value: "copy", label: "复制", shortLabel: "复制", description: "复制源文件到目标，保留源位置。" },
]
