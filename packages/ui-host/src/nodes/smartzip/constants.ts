import { Archive, FolderOpen, ScanLine, ScanSearch, SquareTerminal } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { SmartZipAction } from "@xiranite/node-smartzip/core"

export interface SmartZipActionMeta {
  value: SmartZipAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  destructive: boolean
}

export const ACTIONS: SmartZipActionMeta[] = [
  {
    value: "status",
    label: "查看状态",
    shortLabel: "状态",
    description: "加载 SmartZip 配置，列出归档扩展名和密码。",
    icon: ScanLine,
    destructive: false,
  },
  {
    value: "inspect_codepage",
    label: "预检文件名编码",
    shortLabel: "预检编码",
    description: "读取 ZIP 原始文件名字节，展示候选代码页、置信度和对应预览。",
    icon: ScanSearch,
    destructive: false,
  },
  {
    value: "extract",
    label: "解压归档",
    shortLabel: "解压",
    description: "使用自动检测的 7-Zip 解压选中的归档文件。",
    icon: SquareTerminal,
    destructive: true,
  },
  {
    value: "extract_codepage",
    label: "代码页解压",
    shortLabel: "代码页",
    description: "用指定代码页解压归档，处理非 ASCII 文件名。",
    icon: SquareTerminal,
    destructive: true,
  },
  {
    value: "open",
    label: "打开归档",
    shortLabel: "打开",
    description: "使用系统默认程序打开归档文件。",
    icon: FolderOpen,
    destructive: false,
  },
  {
    value: "archive",
    label: "创建归档",
    shortLabel: "打包",
    description: "把选中路径打包成归档文件。",
    icon: Archive,
    destructive: true,
  },
]

export const DESTRUCTIVE_ACTIONS: SmartZipAction[] = ["extract", "extract_codepage", "archive"]

export function isDestructiveAction(action: SmartZipAction): boolean {
  return DESTRUCTIVE_ACTIONS.includes(action)
}

export function actionI18nKey(action: SmartZipAction): string {
  return action.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}
