/**
 * Cleanf's preset catalog: the list the host cleans by and the list every face shows the operator.
 *
 * `CLEANING_PRESETS`, `PRESET_COMBINATIONS` and `getDefaultPresets()` used to live only in `core.ts`, so the guided
 * picker in `interaction.ts` had to value-import core to seed its options — and `cli.ts` loads `interaction.ts`, so
 * that single edge evaluated the whole engine in the face process (ADR-0074 §5; the same hole `sleept/src/schedule.ts`
 * closed for the timer vocabulary). The catalog lives here and `core.ts` forwards the three names under the same
 * spellings, so `planCleanf` on the host and the terminal schema in `interaction.ts` read one table — and faces that
 * need it later take this module, never core. In-package consumers import it by relative path; no package subpath is
 * published until a face outside this package actually reads it.
 *
 * Data and one pure derivation only: the item/target types stay in `core.ts` because they are the operation
 * contract, and nothing here touches the disk.
 */
import type { CleanfPreset, CleanfPresetCombination, CleanfPresetId } from "./core.ts"

export const CLEANING_PRESETS: Record<string, CleanfPreset> = {
  empty_folders: {
    id: "empty_folders",
    name: "Empty folders",
    description: "Recursively remove empty folders.",
    functionName: "remove_empty_folders",
    enabled: true,
  },
  backup_files: {
    id: "backup_files",
    name: "Backup files",
    description: "Remove .bak backup files.",
    functionName: "remove_backup_and_temp",
    patterns: [{ pattern: String.raw`.*\.bak$`, type: "file", description: "Backup file" }],
    enabled: true,
  },
  temp_folders: {
    id: "temp_folders",
    name: "Temp folders",
    description: "Remove folders whose names start with temp_.",
    functionName: "remove_backup_and_temp",
    patterns: [{ pattern: String.raw`^temp_.*$`, type: "dir", description: "Temp folder" }],
    enabled: true,
  },
  trash_files: {
    id: "trash_files",
    name: "Trash files",
    description: "Remove .trash files and folders.",
    functionName: "remove_backup_and_temp",
    patterns: [{ pattern: String.raw`.*\.trash$`, type: "both", description: "Trash item" }],
    enabled: true,
  },
  hb_txt_files: {
    id: "hb_txt_files",
    name: "[#hb] text",
    description: "Remove txt files whose names start with [#hb].",
    functionName: "remove_backup_and_temp",
    patterns: [{ pattern: String.raw`^\[#hb\].*\.txt$`, type: "file", description: "[#hb] text file" }],
    enabled: true,
  },
  log_files: {
    id: "log_files",
    name: "Log files",
    description: "Remove common log files.",
    functionName: "remove_backup_and_temp",
    patterns: [
      { pattern: String.raw`.*\.log$`, type: "file", description: "Log file" },
      { pattern: String.raw`.*\.log\.\d+$`, type: "file", description: "Rotated log file" },
    ],
    enabled: false,
  },
  upscale: {
    id: "upscale",
    name: "Upscale files",
    description: "Remove .upbak files.",
    functionName: "remove_backup_and_temp",
    patterns: [{ pattern: String.raw`.*\.upbak$`, type: "file", description: "upbak file" }],
    enabled: false,
  },
}

export const PRESET_COMBINATIONS: CleanfPresetCombination[] = [
  {
    id: "advanced",
    name: "高级清理",
    description: "标准清理 + [#hb]文本文件",
    presets: ["empty_folders", "backup_files", "temp_folders", "trash_files", "hb_txt_files"],
  },
  {
    id: "upscale",
    name: "upscale 环境清理",
    description: "包含日志与 upscale 缓存清理（谨慎使用）",
    presets: ["empty_folders", "backup_files", "temp_folders", "trash_files", "hb_txt_files", "log_files", "upscale"],
  },
  {
    id: "complete",
    name: "完整清理",
    description: "包含所有清理项目（谨慎使用）",
    presets: Object.keys(CLEANING_PRESETS),
  },
]

export function getDefaultPresets(): CleanfPresetId[] {
  return Object.values(CLEANING_PRESETS).filter((preset) => preset.enabled).map((preset) => preset.id)
}
