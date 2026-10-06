import type { LucideIcon } from "lucide-react"
import { Download, Filter, PencilLine, RefreshCw, Trash2 } from "lucide-react"
import type { EngineVAction } from "@xiranite/node-enginev/core"
import type { EngineVCardState } from "./types"

export const CONFIG_FIELDS = ["workshopPath", "outputPath", "template"] satisfies (keyof EngineVCardState)[]
export const UI_CONFIG_FIELDS = ["actionTrayPinned", "galleryColumns", "galleryCompact", "galleryShowMeta", "galleryShowPath"] satisfies (keyof EngineVCardState)[]

export const ACTIONS: Array<{
  value: EngineVAction
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: "scan",
    label: "扫描工坊",
    shortLabel: "扫描",
    description: "读取 Wallpaper Engine 工坊目录并生成画廊预览。",
    icon: RefreshCw,
  },
  {
    value: "filter",
    label: "筛选结果",
    shortLabel: "筛选",
    description: "按标题、分级、类型和标签过滤已扫描项目。",
    icon: Filter,
  },
  {
    value: "rename",
    label: "重命名计划",
    shortLabel: "重命名",
    description: "按模板预演或执行文件夹重命名。",
    icon: PencilLine,
  },
  {
    value: "export",
    label: "导出清单",
    shortLabel: "导出",
    description: "把筛选结果导出为 JSON 或路径列表。",
    icon: Download,
  },
  {
    value: "delete",
    label: "删除所选",
    shortLabel: "删除",
    description: "删除或移入回收站选中的工坊项目。",
    icon: Trash2,
  },
]
