import { FolderOpen, MoveRight, PencilLine, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { MvzAction } from "@xiranite/node-mvz/core"

export interface MvzActionMeta {
  value: MvzAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive?: boolean
}

export const ACTIONS: MvzActionMeta[] = [
  { value: "extract", label: "提取", shortLabel: "提取", description: "从压缩包提取文件到目标目录。", icon: FolderOpen },
  { value: "move", label: "移动", shortLabel: "移动", description: "提取文件并从压缩包中删除原文件。", icon: MoveRight, destructive: true },
  { value: "delete", label: "删除", shortLabel: "删除", description: "从压缩包中删除指定文件。", icon: Trash2, destructive: true },
  { value: "rename", label: "重命名", shortLabel: "重命名", description: "按正则模式重命名压缩包内的文件。", icon: PencilLine },
]

export function findActionMeta(value: MvzAction | undefined): MvzActionMeta {
  return ACTIONS.find((item) => item.value === value) ?? ACTIONS[0]!
}
