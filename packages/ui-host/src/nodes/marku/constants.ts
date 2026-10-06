import { Braces, FileCode, FileDiff, ListTree, Replace, ScanText, Table2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { MarkuModuleId } from "@xiranite/node-marku/core"

export interface MarkuModuleMeta {
  id: MarkuModuleId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const MODULES: MarkuModuleMeta[] = [
  { id: "markt", label: "标题/列表互转", shortLabel: "Markt", description: "在 Markdown 标题与列表之间互相转换。", icon: ListTree },
  { id: "consecutive_header", label: "连续标题清理", shortLabel: "连续标题", description: "合并或删除相邻的连续标题行。", icon: ScanText },
  { id: "content_dedup", label: "内容去重", shortLabel: "去重", description: "按标题、图片、段落去重 Markdown 内容。", icon: FileDiff },
  { id: "html2sy_table", label: "HTML 表格转 MD", shortLabel: "HTML 表格", description: "把 HTML <table> 转换为 Markdown 表格。", icon: Table2 },
  { id: "title_convert", label: "标题层级调整", shortLabel: "标题层级", description: "整体偏移 Markdown 标题层级。", icon: FileCode },
  { id: "content_replace", label: "内容替换", shortLabel: "替换", description: "按字面或正则模式批量替换内容。", icon: Replace },
  { id: "single_orderlist_remover", label: "单项列表清理", shortLabel: "单项列表", description: "移除孤立的有序列表编号。", icon: ScanText },
  { id: "image_path_replacer", label: "图片路径改写", shortLabel: "图片路径", description: "按 base url 或相对前缀改写图片路径。", icon: FileCode },
  { id: "t2list", label: "表格转列表", shortLabel: "表格→列表", description: "把 Markdown 表格转换成无序列表。", icon: Braces },
]

export function findModuleMeta(id: string | undefined): MarkuModuleMeta {
  return MODULES.find((item) => item.id === id) ?? MODULES[0]!
}
