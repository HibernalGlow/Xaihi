import { FileJson, FolderSearch, ScanSearch } from "lucide-react"
import type { TrenameScanMode } from "@xiranite/node-trename/core"

export const DEFAULT_EXCLUDE_EXTS_TEXT = ".json,.txt,.html,.htm,.md,.log"

export const SCAN_MODES: Array<{
  value: TrenameScanMode
  label: string
  shortLabel: string
  description: string
  icon: typeof FolderSearch
}> = [
  {
    value: "normal",
    label: "普通扫描",
    shortLabel: "普通",
    description: "扫描目录内可重命名的文件和子目录。",
    icon: FolderSearch,
  },
  {
    value: "leak",
    label: "漏扫模式",
    shortLabel: "漏扫",
    description: "偏向找出还没有按规则处理过的归档文件。",
    icon: ScanSearch,
  },
]

export const JSON_ACTION = {
  label: "JSON",
  description: "导入、编辑、复制 rename JSON。",
  icon: FileJson,
}
