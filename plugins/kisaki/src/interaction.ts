import type { InteractionField, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import { KISAKI_TERMINAL_TOOLS, type KisakiTerminalTool, type KisakiTool } from "./scanner-vocabulary.js"
import type { KisakiInput, KisakiResult } from "./core.js"
import { createKisakiOperationInput, createKisakiOptionFields, createKisakiScanInput, kisakiOptionDefaults } from "./tool-options.js"
import { buildKisakiAnalysis } from "./analysis.js"

export type KisakiInteractionValues = InteractionValues & {
  action: "scan" | "delete" | "move" | "rename" | "save"
  tool: KisakiTool
  includedDirectoriesText: string
  includedDirectoriesReferencedText: string
  excludedDirectoriesText: string
  excludedItemsText: string
  allowedExtensions: string
  excludedExtensions: string
  minimumFileSize: number
  maximumFileSize: number
  recursive: boolean
  useCache: boolean
  saveAlsoAsJson: boolean
  deleteOutdatedCache: boolean
  cacheFolderPath: string
  configFolderPath: string
  duplicateMinimalHashCacheSizeKiB: number
  duplicateMinimalPrehashCacheSizeKiB: number
  threadCount: number
  filterText: string
  selectedPathsText: string
  destinationDirectory: string
  deleteMode: "trash" | "permanent"
  copyMode: boolean
  preserveStructure: boolean
  conflictPolicy: "skip" | "overwrite" | "rename" | "error"
  outputPath: string
  exportScope: "selected" | "visible" | "all"
  renameItemsText: string
  dryRun: boolean
}

const LABELS_ZH: Record<KisakiTool, string> = {
  "duplicate-files": "重复文件",
  "empty-folders": "空文件夹",
  "big-files": "大文件",
  "empty-files": "空文件",
  "temporary-files": "临时文件",
  "similar-images": "相似图片",
  "similar-videos": "相似视频",
  "duplicate-music": "重复音频",
  "invalid-symlinks": "无效符号链接",
  "broken-files": "损坏文件",
  "bad-extensions": "不正确扩展名",
  "bad-names": "坏文件名",
  "exif-remover": "EXIF 清理",
  "video-optimizer": "视频优化",
}

/**
 * The scanners a terminal face may route to, in palette order — the same vocabulary the `tool` field below
 * publishes, read from here instead of from `core.js`: a CLI may not import the node's engine as a value
 * (ADR-0074 §5), while this module is the node's shared data contract that all three faces read.
 */
export const kisakiTerminalTools: readonly KisakiTerminalTool[] = KISAKI_TERMINAL_TOOLS

export function createKisakiInteractionSchema(defaults: Partial<KisakiInteractionValues> = {}, language: TerminalLanguage = "zh"): TerminalInteractionSchema<KisakiInput, KisakiResult> {
  const zh = language === "zh"
  const initialValues = { action: "scan", tool: "duplicate-files", includedDirectoriesText: "", includedDirectoriesReferencedText: "", excludedDirectoriesText: "", excludedItemsText: "", allowedExtensions: "", excludedExtensions: "", minimumFileSize: 1, maximumFileSize: Number.MAX_SAFE_INTEGER, recursive: true, useCache: true, saveAlsoAsJson: false, deleteOutdatedCache: true, cacheFolderPath: "", configFolderPath: "", duplicateMinimalHashCacheSizeKiB: 256, duplicateMinimalPrehashCacheSizeKiB: 256, threadCount: 0, filterText: "", selectedPathsText: "", destinationDirectory: "", deleteMode: "trash", copyMode: false, preserveStructure: false, conflictPolicy: "skip", outputPath: "", exportScope: "selected", renameItemsText: "", dryRun: true, ...kisakiOptionDefaults(), ...defined(defaults) } as KisakiInteractionValues
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "命令" : "Command", kind: "select", role: "action", options: [{ value: "scan", label: zh ? "⌕ 扫描" : "⌕ Scan" }, { value: "delete", label: zh ? "♲ 删除" : "♲ Delete" }, { value: "move", label: zh ? "⇄ 移动/复制" : "⇄ Move/copy" }, { value: "rename", label: zh ? "✎ 修正扩展名" : "✎ Fix extension" }, { value: "save", label: zh ? "⇩ 导出" : "⇩ Export" }] },
    { id: "tool", label: zh ? "扫描工具" : "Scanner", kind: "select", options: KISAKI_TERMINAL_TOOLS.map((tool) => ({ value: tool, label: zh ? LABELS_ZH[tool] : human(tool) })) },
    { id: "includedDirectoriesText", label: zh ? "包含目录" : "Included directories", kind: "path-list", lines: 4, visibleWhen: scanOnly },
    { id: "includedDirectoriesReferencedText", label: zh ? "参考目录" : "Reference directories", kind: "path-list", lines: 3, visibleWhen: scanOnly },
    { id: "excludedDirectoriesText", label: zh ? "排除目录" : "Excluded directories", kind: "path-list", lines: 3, visibleWhen: scanOnly },
    { id: "excludedItemsText", label: zh ? "排除项目/通配模式" : "Excluded items / patterns", kind: "multiline", lines: 3, visibleWhen: scanOnly },
    { id: "allowedExtensions", label: zh ? "允许扩展名" : "Allowed extensions", kind: "text", visibleWhen: scanOnly },
    { id: "excludedExtensions", label: zh ? "排除扩展名" : "Excluded extensions", kind: "text", visibleWhen: scanOnly },
    { id: "minimumFileSize", label: zh ? "最小字节" : "Minimum bytes", kind: "number", min: 0, step: 1, visibleWhen: scanOnly },
    { id: "maximumFileSize", label: zh ? "最大字节" : "Maximum bytes", kind: "number", min: 1, step: 1, visibleWhen: scanOnly },
    { id: "recursive", label: zh ? "递归扫描" : "Recursive", kind: "boolean", visibleWhen: scanOnly },
    { id: "useCache", label: zh ? "使用缓存" : "Use cache", kind: "boolean", visibleWhen: scanOnly },
    { id: "saveAlsoAsJson", label: zh ? "同时保存 JSON 缓存" : "Also save JSON cache", kind: "boolean", visibleWhen: scanOnly },
    { id: "deleteOutdatedCache", label: zh ? "清理过期缓存项" : "Delete outdated cache entries", kind: "boolean", visibleWhen: scanOnly },
    { id: "cacheFolderPath", label: zh ? "自定义缓存目录" : "Custom cache directory", kind: "text", visibleWhen: scanOnly },
    { id: "configFolderPath", label: zh ? "自定义配置目录" : "Custom config directory", kind: "text", visibleWhen: scanOnly },
    { id: "duplicateMinimalHashCacheSizeKiB", label: zh ? "Hash 最小缓存文件（KiB）" : "Minimum hash cache file (KiB)", kind: "number", min: 1, step: 1, visibleWhen: duplicateScanOnly },
    { id: "duplicateMinimalPrehashCacheSizeKiB", label: zh ? "Prehash 最小缓存文件（KiB）" : "Minimum prehash cache file (KiB)", kind: "number", min: 1, step: 1, visibleWhen: duplicateScanOnly },
    { id: "threadCount", label: zh ? "扫描线程（0 = 自动）" : "Scan threads (0 = auto)", kind: "number", min: 0, max: 256, step: 1, visibleWhen: scanOnly },
    ...createKisakiOptionFields(language),
    { id: "filterText", label: zh ? "结果过滤" : "Result filter", kind: "text", visibleWhen: scanOnly },
    { id: "selectedPathsText", label: zh ? "操作路径" : "Operation paths", kind: "path-list", lines: 5, visibleWhen: (values) => values.action !== "scan" && values.action !== "rename" },
    { id: "destinationDirectory", label: zh ? "目标目录" : "Destination", kind: "text", visibleWhen: moveOnly },
    { id: "deleteMode", label: zh ? "删除方式" : "Delete mode", kind: "select", visibleWhen: deleteOnly, options: [{ value: "trash", label: zh ? "回收站" : "Trash" }, { value: "permanent", label: zh ? "永久删除" : "Permanent" }] },
    { id: "copyMode", label: zh ? "复制而非移动" : "Copy instead of move", kind: "boolean", visibleWhen: moveOnly },
    { id: "preserveStructure", label: zh ? "保留目录结构" : "Preserve structure", kind: "boolean", visibleWhen: moveOnly },
    { id: "conflictPolicy", label: zh ? "目标冲突" : "Target conflict", kind: "select", visibleWhen: moveOnly, options: [{ value: "skip", label: zh ? "跳过" : "Skip" }, { value: "overwrite", label: zh ? "覆盖" : "Overwrite" }, { value: "rename", label: zh ? "自动改名" : "Auto rename" }, { value: "error", label: zh ? "报告错误" : "Error" }] },
    { id: "outputPath", label: zh ? "导出路径" : "Export path", kind: "text", visibleWhen: saveOnly },
    { id: "exportScope", label: zh ? "导出范围" : "Export scope", kind: "select", visibleWhen: saveOnly, options: [{ value: "selected", label: zh ? "选择项" : "Selected" }, { value: "visible", label: zh ? "当前视图" : "Current view" }, { value: "all", label: zh ? "全部结果" : "All results" }] },
    { id: "renameItemsText", label: zh ? "路径与正确扩展名（Tab 分隔）" : "Path and proper extension (tab separated)", kind: "multiline", lines: 5, visibleWhen: renameOnly },
    { id: "dryRun", label: zh ? "仅预演" : "Dry run", kind: "boolean", visibleWhen: (values) => values.action === "delete" || values.action === "move" || values.action === "rename" },
  ]
  return {
    id: "kisaki",
    title: "Kisaki",
    description: zh ? "11 项文件分析工具与安全结果管理" : "Eleven file-analysis tools with safe result management",
    initialValues,
    fields,
    view: { sections: [{ id: "tool", title: zh ? "工具与目录" : "Tool and directories", fieldIds: ["tool", "includedDirectoriesText", "excludedDirectoriesText", "recursive", "useCache"] }, { id: "filters", title: zh ? "过滤与算法" : "Filters and algorithms", fieldIds: fields.slice(3).map((field) => field.id) }], dashboard: { title: "Kisaki", display: (values) => ({ primary: lines(values.includedDirectoriesText)[0] ?? "Kisaki", secondary: zh ? LABELS_ZH[values.tool as KisakiTool] : human(String(values.tool)), metrics: [] }) } },
    toInput: (values) => values.action === "scan" ? createKisakiScanInput(values.tool as KisakiTool, values) : createKisakiOperationInput(values.action as "delete" | "move" | "rename" | "save", values),
    validate: (_values, input) => input.action === "scan" ? input.includedDirectories?.length ? null : zh ? "请至少添加一个包含目录。" : "Add at least one included directory." : !input.selectedPaths?.length ? zh ? "请至少添加一个操作路径。" : "Add at least one operation path." : input.action === "move" && !input.destinationDirectory && !input.destinationItems?.length ? zh ? "请选择目标目录。" : "Choose a destination directory." : input.action === "rename" && !input.renameItems?.length ? zh ? "请输入路径与正确扩展名。" : "Enter paths and proper extensions." : input.action === "save" && !input.outputPath ? zh ? "请输入导出路径。" : "Enter an export path." : null,
    preview: (input) => input.action === "scan" ? [`${input.includedDirectories?.length ?? 0} root(s)`, human(input.tool ?? "duplicate-files")] : [`${input.selectedPaths?.length ?? 0} path(s)`, input.dryRun === false ? "LIVE" : "DRY RUN"],
    isDangerous: (input) => (input.action === "delete" || input.action === "move" || input.action === "rename") && input.dryRun === false,
    dangerPrompt: (input) => ({ title: zh ? "确认真实文件操作" : "Confirm live file operation", body: zh ? `将对 ${input.selectedPaths?.length ?? 0} 个路径执行真实${operationVerb(input, true)}。` : `This will ${operationVerb(input, false)} ${input.selectedPaths?.length ?? 0} path(s).`, confirmLabel: zh ? "确认执行" : "Execute" }),
    result: (result) => ({ success: result.success, message: result.message, lines: result.data ? analysisLines(result.data) : [] }),
  }
}

export function kisakiToolLabel(tool: KisakiTool, language: TerminalLanguage = "zh"): string { return language === "zh" ? LABELS_ZH[tool] : human(tool) }
function analysisLines(data: NonNullable<KisakiResult["data"]>): string[] { const analysis = buildKisakiAnalysis(data.groups, [], data.tool); return [`Files: ${data.fileCount}`, `Groups: ${data.groupCount}`, `Reclaimable: ${data.reclaimableBytes} B`, `Formats: ${analysis.formats.slice(0, 5).map((item) => `${item.format}=${item.count}`).join(", ") || "none"}`, ...(data.tool === "similar-images" ? [`Similar folders: ${data.similarFolders?.map((item) => `${item.path}=${item.count}`).join(", ") || "none"}`] : [])] }
const defined = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
const lines = (value: unknown) => String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
const human = (value: string) => value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
const scanOnly = (values: InteractionValues) => values.action === "scan"
const duplicateScanOnly = (values: InteractionValues) => values.action === "scan" && values.tool === "duplicate-files"
const moveOnly = (values: InteractionValues) => values.action === "move"
const deleteOnly = (values: InteractionValues) => values.action === "delete"
const saveOnly = (values: InteractionValues) => values.action === "save"
const renameOnly = (values: InteractionValues) => values.action === "rename"
const operationVerb = (input: KisakiInput, zh: boolean) => input.action === "delete" ? zh ? "删除" : "delete" : input.action === "rename" ? zh ? "改名" : "rename" : input.copyMode ? zh ? "复制" : "copy" : zh ? "移动" : "move"
