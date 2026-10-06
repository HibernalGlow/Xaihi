import { Archive, FileStack, FolderInput, FolderTree, Image, Layers, PackageOpen, RotateCcw, Undo2, Video } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { DissolvefConflictMode } from "@xiranite/node-dissolvef/core"
import type { DissolvefBundleMode } from "./types"

export interface DissolvefModeMeta {
  value: DissolvefBundleMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const BUNDLE_MODES: DissolvefModeMeta[] = [
  {
    value: "nested",
    label: "嵌套溶解",
    shortLabel: "嵌套",
    description: "把单层嵌套子文件夹的内容上提到父级，删除空壳。",
    icon: FolderTree,
  },
  {
    value: "media",
    label: "单媒体溶解",
    shortLabel: "媒体",
    description: "把只含单个媒体文件的文件夹里的媒体文件上提，删除空壳。",
    icon: Video,
  },
  {
    value: "archive",
    label: "单归档溶解",
    shortLabel: "归档",
    description: "把只含单个归档文件的文件夹里的归档上提，删除空壳。",
    icon: Archive,
  },
]

export const CONFLICT_MODES: Array<{ value: DissolvefConflictMode; label: string; description: string }> = [
  { value: "auto", label: "自动", description: "目录覆盖、文件跳过。" },
  { value: "skip", label: "跳过", description: "目标已存在时跳过该项。" },
  { value: "overwrite", label: "覆盖", description: "目标已存在时先删除再移动（危险）。" },
  { value: "rename", label: "改名", description: "目标已存在时自动添加序号后缀。" },
]

export const DEFAULT_THRESHOLD = 0.6

export const NODE_ICON = FolderInput

export const MEDIA_TYPE_ICONS = {
  video: Video,
  archive: Archive,
  image: Image,
} as const

export const HISTORY_ICON = RotateCcw
export const UNDO_ICON = Undo2
export const PLAN_ICON = Layers
export const DISSOLVE_ICON = FileStack
export const DIRECT_ICON = PackageOpen
