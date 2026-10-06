import { ArrowRightLeft, ClipboardList, Copy, FolderCheck, FolderInput, FolderSymlink, MoveRight, Play, Trash2, Workflow } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ClassfAction, ClassfClassifyMode, ClassfPlacementMode, ClassfTransferMode } from "@xiranite/node-classf/core"

export interface ClassfActionMeta {
  value: ClassfAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export interface ClassfModeMeta {
  value: ClassfClassifyMode
  label: string
  description: string
  icon: LucideIcon
}

export interface ClassfTransferMeta {
  value: ClassfTransferMode
  label: string
  description: string
  icon: LucideIcon
}

export interface ClassfPlacementMeta { value: ClassfPlacementMode; label: string; description: string; icon: LucideIcon }

export const ACTIONS: ClassfActionMeta[] = [
  {
    value: "plan",
    label: "Build plan",
    shortLabel: "Plan",
    description: "Preview already, wait, or target transfers.",
    icon: ClipboardList,
  },
  {
    value: "classify",
    label: "Classify items",
    shortLabel: "Classify",
    description: "Apply ready move or copy transfers.",
    icon: Play,
  },
]

export const CLASSIFY_MODES: ClassfModeMeta[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Selected items go to already; remaining siblings go to wait.",
    icon: FolderSymlink,
  },
  {
    value: "only",
    label: "Already only",
    description: "Selected items go to already, without wait candidates.",
    icon: FolderCheck,
  },
  {
    value: "del",
    label: "Del only",
    description: "Only blacklisted artists are routed to del.",
    icon: Trash2,
  },
]

export const TRANSFER_MODES: ClassfTransferMeta[] = [
  {
    value: "move",
    label: "Move",
    description: "Move source paths into the planned folders.",
    icon: MoveRight,
  },
  {
    value: "copy",
    label: "Copy",
    description: "Copy source paths and keep originals in place.",
    icon: Copy,
  },
]

export const PLACEMENT_MODES: ClassfPlacementMeta[] = [
  { value: "local", label: "就地分流", description: "在每个文件当前所在目录创建 already 或 wait。", icon: FolderInput },
  { value: "root", label: "根目录分流", description: "在给定根目录下创建 already 或 wait，并完整保留相对路径。", icon: FolderSymlink },
]

export const NODE_ICON = Workflow
export const PLAN_ICON = ArrowRightLeft
