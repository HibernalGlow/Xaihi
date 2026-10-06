import { Archive, Brush, FileText, FolderTree, Sparkles, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CleanfPresetId } from "@xiranite/node-cleanf/core"

export interface CleanfPresetMeta {
  descriptionKey: string
  id: CleanfPresetId
  icon: LucideIcon
  labelKey: string
}

export const PRESET_METAS: CleanfPresetMeta[] = [
  {
    id: "empty_folders",
    labelKey: "presets.emptyFolders.label",
    descriptionKey: "presets.emptyFolders.description",
    icon: FolderTree,
  },
  {
    id: "backup_files",
    labelKey: "presets.backupFiles.label",
    descriptionKey: "presets.backupFiles.description",
    icon: Archive,
  },
  {
    id: "temp_folders",
    labelKey: "presets.tempFolders.label",
    descriptionKey: "presets.tempFolders.description",
    icon: Trash2,
  },
  {
    id: "trash_files",
    labelKey: "presets.trashFiles.label",
    descriptionKey: "presets.trashFiles.description",
    icon: Trash2,
  },
  {
    id: "hb_txt_files",
    labelKey: "presets.hbTxtFiles.label",
    descriptionKey: "presets.hbTxtFiles.description",
    icon: FileText,
  },
  {
    id: "log_files",
    labelKey: "presets.logFiles.label",
    descriptionKey: "presets.logFiles.description",
    icon: FileText,
  },
  {
    id: "upscale",
    labelKey: "presets.upscale.label",
    descriptionKey: "presets.upscale.description",
    icon: Sparkles,
  },
]

export const DEFAULT_SELECTED_PRESETS: CleanfPresetId[] = ["empty_folders", "backup_files"]

export const NODE_ICON = Brush
