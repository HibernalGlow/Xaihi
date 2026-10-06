/**
 * cleanf 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/cleanf/src/core.ts`
 * （353 行）逐字搬来：七条预设表、三条预设组合、深度倒序的删除次序、`both` 那条类型判定
 * 全部原样，**一处逻辑都没改**。差异实测（剥掉注释与空行后逐行比）：两边各 **314 条有效行**，
 * 其中 **4 条**不同，全部是下面点名的类型层让步；**删掉的上游行 = 0**
 * （第 1 行的 import 说明符是改写，不是删除）。
 *
 * 那条 import 换成本包的 `./contract.ts` 垫片：`@xiranite/*` 在本仓是 `workspace:*`，
 * 一写进依赖全仓 pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释、ADR-0002）。
 *
 * **类型层让步（逐条，行号指本文件）**：本仓 `tsconfig.base.json:11-12` 开了
 * `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes`，上游 `tsconfig.app.json`
 * 只有 `strict`。四处，函数体只碰了两个**非空断言**，其余都在接口声明上：
 * - `:267` `CLEANING_PRESETS[id]!`（`planCleanf`，上游 `:213`）——`Record<string, T>` 在本仓
 *   取值多一层 `undefined`；上游那句 `.filter(Boolean)` 原样留着（它不是类型收窄，是去重保险）；
 * - `:334` `paths[index]!`（`runCleanf` 的循环，上游 `:279`）——循环界由上一行的 `length` 保证，
 *   数组本身刚被 `parseCleanfPaths` 过 `filter(Boolean)`；
 * - `:119` `CleanfData.undoBatchCount?: number | undefined`、`:120` `.undoPersistent?: boolean | undefined`
 *   （上游 `:67-68`）——这两格在 `runCleanf`（上游 `:311-312`）与 `undoCleanf`（`:334-335`）里
 *   由 `removed.undoBatchCount` / `state?.count` 直接填，开了 EOPT 之后"传了 undefined"与
 *   "没这个键"是两件事。
 *
 * 台账里这个节点的 hostRequirements 是 `os-native` + `recursive-enumeration` + `file-io`，
 * 而**这份文件本身零 I/O**：枚举与移除都从 `CleanfRuntime` 那 4 个方法注入
 * （`scanPath` / `removeTargets` / `undoLatest?` / `undoState?`），落地在 `src/platform.ts`
 * （那一份按"逐调用决定"写着每条落到哪条 DSH 缝、哪一条今天只能响亮拒绝）。
 * **枚举语义一条都不许"改进"**（行号指上游那份文件）：
 * - 预设表 `CLEANING_PRESETS` 七条，`enabled` 为真的是五条：`empty_folders` / `backup_files` /
 *   `temp_folders` / `trash_files` / `hb_txt_files`，`log_files` 与 `upscale` 默认**关**
 *   （`:99-158`）；`getDefaultPresets()` 就是按 `enabled` 现推的（`:197-199`），
 *   这份名单不在别处再抄第二份。
 * - 匹配是**正则**且带 `i` 标志：`new RegExp(rule.pattern, "i").test(item.name)`（`:205-208`），
 *   上游的 pattern 全是 `String.raw` 写的 regex 串（`.bak$`、`^temp_.*$`、`^\[#hb\].*\.txt$`…），
 *   不是 glob，不在这里换成任何匹配库。
 * - `trash_files` 那条是 `type: "both"` ⇒ 文件与目录都算（`:128`）；`matchesPattern` 里
 *   "类型不符就先否"（`:206`）是它唯一的前置判定。
 * - 两轮顺序有含义：先把非 `empty_folders` 的预设按 items 过一遍，**再**做空目录那一轮；
 *   空目录的判据是"这个目录的孩子**全部**已经被排进 targets"（`:239-249`），
 *   所以嵌套空目录会一起被收；`scheduled` 那张去重表是这两轮之间唯一的耦合点。
 * - 删除次序 `sortTargetsForRemoval`：深度倒序，同深度按路径长度倒序（`:259-261`）——
 *   这条决定"先删里再删外"，不许改成字典序。
 * - `parseCleanfPaths` 的分隔符是换行**或分号**（`:188-191`），且只剥**首尾**引号；
 *   `parseExcludeKeywords` 只认逗号（`:193-195`）。两个函数不共用一套分隔符，别统一。
 * - `isExcluded` 是 `path.includes(keyword)` 的子串判据（`:201-203`），不是路径段相等。
 * - 空 `paths` 那句 `No valid paths provided.`（`:272`）、`previewFiles` 只在预演里填
 *   （`:294`）、进度那三个数（`:280` 的 40 上限、`:298` 的 70、`:300` 的 100）都是内核说的话。
 * - 撤销那条腿：runtime 没给 `undoLatest` 时内核自己回
 *   `Cleanf undo is unavailable in this runtime.`（`:321-323`）——本仓今天走的就是这条路，
 *   那句话不是我们编的拒绝文案（见 `src/platform.ts` 文件头与报告里的新缺口 G10）。
 *
 * @module xaihi-cleanf/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type CleanfItemType = "file" | "dir"
export type CleanfAction = "clean" | "undo"
export type CleanfPresetId =
  | "empty_folders"
  | "backup_files"
  | "temp_folders"
  | "trash_files"
  | "hb_txt_files"
  | "log_files"
  | "upscale"
  | string

export interface CleanfInput {
  action?: CleanfAction
  paths?: string[]
  presets?: CleanfPresetId[]
  exclude?: string
  preview?: boolean
}

export interface CleanfItem {
  path: string
  name: string
  type: CleanfItemType
  parentPath: string | null
  depth: number
}

export interface CleanfPattern {
  pattern: string
  type: CleanfItemType | "both"
  description: string
}

export interface CleanfPreset {
  id: CleanfPresetId
  name: string
  description: string
  functionName: "remove_empty_folders" | "remove_backup_and_temp"
  patterns?: CleanfPattern[]
  enabled: boolean
}

export interface CleanfTarget {
  path: string
  name: string
  type: CleanfItemType
  preset: CleanfPresetId
  reason: string
  depth: number
}

export interface CleanfPlan {
  targets: CleanfTarget[]
  removedDetails: Record<string, number>
}

export interface CleanfData {
  totalRemoved: number
  removedDetails: Record<string, number>
  previewFiles: string[]
  skipped: number
  restored?: number
  undoAvailable?: boolean
  // 类型层让步 3/4（本仓开了 exactOptionalPropertyTypes，上游没开；见文件头）
  undoBatchCount?: number | undefined
  undoPersistent?: boolean | undefined
}

export interface CleanfRemovalResult {
  removed: number
  skipped: number
  undoable?: number
  undoBatchCount?: number
  undoPersistent?: boolean
}

export interface CleanfUndoResult {
  succeeded: number
  failed: number
}

export interface CleanfUndoState {
  available: boolean
  count: number
  persistent: boolean
}

export interface CleanfRuntime {
  scanPath: (path: string) => Promise<CleanfItem[]>
  removeTargets: (targets: CleanfTarget[]) => Promise<CleanfRemovalResult>
  undoLatest?: () => Promise<CleanfUndoResult>
  undoState?: () => CleanfUndoState
}

export type CleanfResult = NodeRunResult<CleanfData>

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

export interface CleanfPresetCombination {
  id: string
  name: string
  description: string
  presets: CleanfPresetId[]
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

export function parseCleanfPaths(textOrPaths: string | string[] | undefined): string[] {
  const values = Array.isArray(textOrPaths) ? textOrPaths : (textOrPaths ?? "").split(/\r?\n|;/)
  return values.map((path) => path.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}

export function parseExcludeKeywords(exclude?: string): string[] {
  return (exclude ?? "").split(",").map((value) => value.trim()).filter(Boolean)
}

export function getDefaultPresets(): CleanfPresetId[] {
  return Object.values(CLEANING_PRESETS).filter((preset) => preset.enabled).map((preset) => preset.id)
}

export function isExcluded(path: string, keywords: string[]): boolean {
  return keywords.some((keyword) => path.includes(keyword))
}

export function matchesPattern(item: CleanfItem, rule: CleanfPattern): boolean {
  if (rule.type !== "both" && rule.type !== item.type) return false
  return new RegExp(rule.pattern, "i").test(item.name)
}

export function planCleanf(items: CleanfItem[], input: CleanfInput): CleanfPlan {
  const presetIds = input.presets?.length ? input.presets : getDefaultPresets()
  const excludeKeywords = parseExcludeKeywords(input.exclude)
  // 类型层让步 1/4：本仓开了 noUncheckedIndexedAccess（上游没开），Record 取值因此多了 undefined 一层。
  // 上游那句 .filter(Boolean) 原样留着（它不是类型收窄，只是去重保险），这里只加一个非空断言。
  const selected = presetIds.map((id) => CLEANING_PRESETS[id]!).filter(Boolean)
  const targets: CleanfTarget[] = []
  const scheduled = new Set<string>()
  const childrenByParent = new Map<string, CleanfItem[]>()

  for (const item of items) {
    if (!item.parentPath) continue
    const children = childrenByParent.get(item.parentPath) ?? []
    children.push(item)
    childrenByParent.set(item.parentPath, children)
  }

  const addTarget = (item: CleanfItem, preset: CleanfPreset, reason: string) => {
    if (scheduled.has(item.path) || isExcluded(item.path, excludeKeywords)) return
    scheduled.add(item.path)
    targets.push({ path: item.path, name: item.name, type: item.type, preset: preset.id, reason, depth: item.depth })
  }

  for (const preset of selected) {
    if (preset.functionName !== "remove_backup_and_temp") continue
    for (const item of items) {
      const rule = preset.patterns?.find((pattern) => matchesPattern(item, pattern))
      if (rule) addTarget(item, preset, rule.description)
    }
  }

  const emptyPreset = selected.find((preset) => preset.id === "empty_folders")
  if (emptyPreset) {
    const dirs = items.filter((item) => item.type === "dir").sort((a, b) => b.depth - a.depth)
    for (const dir of dirs) {
      if (scheduled.has(dir.path) || isExcluded(dir.path, excludeKeywords)) continue
      const children = childrenByParent.get(dir.path) ?? []
      if (children.every((child) => scheduled.has(child.path))) {
        addTarget(dir, emptyPreset, "Empty folder")
      }
    }
  }

  const removedDetails: Record<string, number> = {}
  for (const target of targets) {
    removedDetails[target.preset] = (removedDetails[target.preset] ?? 0) + 1
  }

  return { targets: sortTargetsForRemoval(targets), removedDetails }
}

export function sortTargetsForRemoval(targets: CleanfTarget[]): CleanfTarget[] {
  return [...targets].sort((a, b) => b.depth - a.depth || b.path.length - a.path.length)
}

export async function runCleanf(
  input: CleanfInput,
  runtime: CleanfRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<CleanfResult> {
  if (input.action === "undo") return undoCleanf(runtime, onEvent)

  const paths = parseCleanfPaths(input.paths)
  if (!paths.length) {
    return { success: false, message: "No valid paths provided.", data: emptyData() }
  }

  const allTargets: CleanfTarget[] = []
  const details: Record<string, number> = {}

  for (let index = 0; index < paths.length; index += 1) {
    // 类型层让步 2/4：循环界由上一行的 length 保证，数组本身刚被 parse 过并 filter(Boolean)。
    const path = paths[index]!
    onEvent({ type: "progress", progress: Math.round((index / paths.length) * 40), message: `Scanning ${path}` })
    const items = await runtime.scanPath(path)
    const plan = planCleanf(items, input)
    allTargets.push(...plan.targets)
    for (const [key, value] of Object.entries(plan.removedDetails)) {
      details[key] = (details[key] ?? 0) + value
    }
  }

  if (input.preview) {
    onEvent({ type: "progress", progress: 100, message: `Preview found ${allTargets.length} item(s).` })
    return {
      success: true,
      message: `Preview completed, found ${allTargets.length} item(s).`,
      data: { totalRemoved: allTargets.length, removedDetails: details, previewFiles: allTargets.map((target) => target.path), skipped: 0 },
    }
  }

  onEvent({ type: "progress", progress: 70, message: `Removing ${allTargets.length} item(s).` })
  const removed = await runtime.removeTargets(allTargets)
  onEvent({ type: "progress", progress: 100, message: "Cleanup completed." })

  return {
    success: true,
    message: `Cleanup completed, moved ${removed.removed} item(s) to the recycle bin.`,
    data: {
      totalRemoved: removed.removed,
      removedDetails: details,
      previewFiles: [],
      skipped: removed.skipped,
      undoAvailable: Boolean(removed.undoable),
      undoBatchCount: removed.undoBatchCount,
      undoPersistent: removed.undoPersistent,
    },
  }
}

async function undoCleanf(
  runtime: CleanfRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<CleanfResult> {
  if (!runtime.undoLatest) {
    return { success: false, message: "Cleanf undo is unavailable in this runtime.", data: emptyData() }
  }

  onEvent({ type: "progress", progress: 10, message: "Restoring the latest Cleanf cleanup batch." })
  const restored = await runtime.undoLatest()
  const state = runtime.undoState?.()
  onEvent({ type: "progress", progress: 100, message: `Restored ${restored.succeeded} item(s).` })
  const data: CleanfData = {
    ...emptyData(),
    restored: restored.succeeded,
    skipped: restored.failed,
    undoAvailable: state?.available ?? false,
    undoBatchCount: state?.count,
    undoPersistent: state?.persistent,
  }
  if (restored.failed) {
    return {
      success: false,
      message: `Undo restored ${restored.succeeded} item(s) and failed for ${restored.failed} item(s).`,
      data,
    }
  }
  if (!restored.succeeded) {
    return { success: true, message: "No Cleanf cleanup batch is available to undo.", data }
  }
  const suffix = state?.available ? ` ${state.count} earlier batch(es) remain available.` : ""
  return { success: true, message: `Undo completed, restored ${restored.succeeded} item(s).${suffix}`, data }
}

function emptyData(): CleanfData {
  return { totalRemoved: 0, removedDetails: {}, previewFiles: [], skipped: 0 }
}
