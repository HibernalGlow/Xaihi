import { ClipboardList, Copy, FolderSearch, FolderTree, MoveRight, Play, Search, TimerReset } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ClassqAction, ClassqTransferMode } from "@xiranite/node-classq/core"

export interface ClassqActionMeta {
  value: ClassqAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export interface ClassqTransferMeta {
  value: ClassqTransferMode
  label: string
  description: string
  icon: LucideIcon
}

export const ACTIONS: ClassqActionMeta[] = [
  {
    value: "plan",
    label: "Scan roots",
    shortLabel: "Scan",
    description: "Find keyword folders and preview wait transfers.",
    icon: Search,
  },
  {
    value: "classify",
    label: "Classify wait",
    shortLabel: "Classify",
    description: "Apply ready wait-folder transfers.",
    icon: Play,
  },
]

export const TRANSFER_MODES: ClassqTransferMeta[] = [
  {
    value: "move",
    label: "Move",
    description: "Move sibling items into wait folders.",
    icon: MoveRight,
  },
  {
    value: "copy",
    label: "Copy",
    description: "Copy sibling items and keep originals.",
    icon: Copy,
  },
]

export const NODE_ICON = FolderSearch
export const PLAN_ICON = ClipboardList
export const ROOT_ICON = FolderTree
export const WAIT_ICON = TimerReset
