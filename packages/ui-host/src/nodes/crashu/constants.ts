import { FolderSearch, MoveRight, Search, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CrashuConflictPolicy, CrashuMoveDirection } from "@xiranite/node-crashu/core"
import type { CrashuAction } from "./types"

export interface CrashuActionMeta {
  value: CrashuAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive?: boolean
}

export const ACTIONS: CrashuActionMeta[] = [
  {
    value: "scan",
    label: "扫描匹配",
    shortLabel: "扫描",
    description: "扫描源目录，匹配相似文件夹名，不移动文件。",
    icon: Search,
  },
  {
    value: "plan",
    label: "生成计划",
    shortLabel: "计划",
    description: "扫描并生成移动计划，列出每项来源与目标。",
    icon: FolderSearch,
  },
  {
    value: "move",
    label: "执行移动",
    shortLabel: "移动",
    description: "按计划移动匹配文件夹到目标位置。需要目标目录。",
    icon: MoveRight,
    destructive: true,
  },
]

export const MOVE_DIRECTIONS: Array<{ value: CrashuMoveDirection; label: string; description: string }> = [
  { value: "to_target", label: "源→目标", description: "把源文件夹移动到目标命名目录下。" },
  { value: "to_source", label: "目标→源", description: "把目标文件夹移动到源命名目录下。" },
]

export const CONFLICT_POLICIES: Array<{ value: CrashuConflictPolicy; label: string; description: string }> = [
  { value: "skip", label: "跳过", description: "目标已存在时跳过该项。" },
  { value: "rename", label: "改名", description: "目标已存在时自动添加序号后缀。" },
  { value: "overwrite", label: "覆盖", description: "目标已存在时先删除再移动（危险）。" },
]

export const DEFAULT_THRESHOLD = 0.6

export const NODE_ICON = Zap
