import type { InteractionField, InteractionValues } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { NodeHelpField } from "./contract.js"

import type { KisakiAction, KisakiInput, KisakiTool } from "./core.js"
import { resolveKisakiSimilarVideoCrop } from "./similar-video-crop.js"
import { parseKisakiExtensionTokens, parseKisakiList, reconcileKisakiReferences, serializeKisakiExtensionTokens } from "./source-inputs.js"
import { DEFAULT_TEMPORARY_FILE_EXTENSIONS } from "./temporary-file-extensions.js"

type OptionId = Exclude<keyof KisakiInput, "action" | "tool" | "includedDirectories" | "includedDirectoriesReferenced" | "excludedDirectories" | "excludedItems" | "allowedExtensions" | "excludedExtensions" | "minimumFileSize" | "maximumFileSize" | "recursive" | "useCache" | "threadCount" | "filterText" | "sortBy" | "descending" | "selectedPaths" | "destinationDirectory" | "destinationItems" | "renameItems" | "exifItems" | "videoOptimizerItems" | "deleteMode" | "copyMode" | "preserveStructure" | "conflictPolicy" | "outputPath" | "outputFormat" | "exportScope" | "exportEntries" | "dryRun" | "similarVideosCropDetect">
type OptionValue = string | number | boolean
type OptionKind = "boolean" | "number" | "select" | "text"

export interface KisakiOptionDefinition {
  id: OptionId
  tools: readonly KisakiTool[]
  kind: OptionKind
  label: { zh: string; en: string }
  defaultValue: OptionValue
  min?: number
  max?: number
  step?: number
  choices?: ReadonlyArray<{ value: string; label?: string }>
  cliFlag?: string
  requiredNativeCapabilities?: readonly string[]
}

const DUPLICATE = ["duplicate-files"] as const
const BIG_FILES = ["big-files"] as const
const SIMILAR_IMAGES = ["similar-images"] as const
const SIMILAR_VIDEOS = ["similar-videos"] as const
const SIMILAR_MEDIA = ["similar-images", "similar-videos"] as const
const MUSIC = ["duplicate-music"] as const
const BROKEN = ["broken-files"] as const
const TEMPORARY = ["temporary-files"] as const
const VIDEO_OPTIMIZER = ["video-optimizer"] as const

export const KISAKI_TOOL_OPTIONS: readonly KisakiOptionDefinition[] = [
  option("checkMethod", DUPLICATE, "select", "判断方式", "Duplicate check", "hash", "--check", [{ value: "hash", label: "Hash" }, { value: "name", label: "名称 / Name" }, { value: "size", label: "大小 / Size" }, { value: "size-and-name", label: "大小与名称 / Size and name" }]),
  option("hashType", DUPLICATE, "select", "哈希算法", "Hash algorithm", "blake3", "--hash", ["blake3", "xxh3", "crc32"]),
  numberOption("duplicateMinimumGroupSize", DUPLICATE, "最小组大小", "Minimum group size", 1, "--min-group", 1, 10_000),
  booleanOption("caseSensitiveNames", DUPLICATE, "名称区分大小写", "Case-sensitive names", false, "--case-sensitive"),
  booleanOption("ignoreHardLinks", DUPLICATE, "忽略硬链接", "Ignore hard links", true, "--ignore-hard-links"),
  booleanOption("usePrehash", DUPLICATE, "使用预哈希", "Use prehash", true, "--prehash"),
  numberOption("numberOfFiles", BIG_FILES, "结果数量", "Result count", 50, "--count", 1, 100_000),
  booleanOption("biggestFirst", BIG_FILES, "优先最大文件", "Biggest first", true, "--biggest-first"),
  guiBooleanOption("emptyFilesSearchZeroByteContent", ["empty-files"], "检查仅含 NUL 的文件", "Check NUL-only files", false, "empty-files.content-checkers"),
  guiBooleanOption("emptyFilesSearchNonPrintableContent", ["empty-files"], "检查仅含非打印字符的文件", "Check non-printable files", false, "empty-files.content-checkers"),
  guiTextOption("temporaryFileExtensions", TEMPORARY, "临时文件扩展名", "Temporary extensions", DEFAULT_TEMPORARY_FILE_EXTENSIONS, "temporary-files.custom-extensions"),
  numberOption("similarity", SIMILAR_MEDIA, "最大差异", "Maximum difference", 10, "--similarity", 0, 40),
  option("similarImagesHashSize", SIMILAR_IMAGES, "select", "Hash 尺寸", "Hash size", 16, "--image-hash-size", ["8", "16", "32", "64"]),
  option("similarImagesHashAlgorithm", SIMILAR_IMAGES, "select", "Hash 算法", "Hash algorithm", "mean", "--image-hash", ["mean", "gradient", "blockhash", "vert-gradient", "double-gradient", "median"]),
  option("similarImagesResizeAlgorithm", SIMILAR_IMAGES, "select", "缩放算法", "Resize algorithm", "lanczos3", "--image-resize", ["lanczos3", "gaussian", "catmull-rom", "triangle", "nearest"]),
  booleanOption("similarImagesIgnoreSameSize", SIMILAR_IMAGES, "忽略相同尺寸", "Ignore same size", false, "--image-ignore-same-size"),
  guiBooleanOption("similarImagesIgnoreSameResolution", SIMILAR_IMAGES, "忽略相同分辨率", "Ignore same resolution", false, "similar-images.same-resolution-exclusion"),
  guiOption("similarImagesGeometricInvariance", SIMILAR_IMAGES, "select", "几何变换比较", "Geometric invariance", "off", "similar-images.geometric-invariance", [{ value: "off", label: "关闭 / Off" }, { value: "mirror-flip", label: "镜像与翻转 / Mirror and flip" }, { value: "mirror-flip-rotate-90", label: "镜像、翻转与 90° 旋转 / Mirror, flip and 90° rotation" }]),
  numberOption("similarImagesFolderThreshold", SIMILAR_IMAGES, "文件夹阈值", "Folder threshold", 2, "--folder-threshold", 1, 10_000),
  booleanOption("similarVideosIgnoreSameSize", SIMILAR_VIDEOS, "忽略相同尺寸", "Ignore same size", false, "--video-ignore-same-size"),
  guiBooleanOption("similarVideosIgnoreSameResolution", SIMILAR_VIDEOS, "忽略相同分辨率", "Ignore same resolution", false, "similar-videos.same-resolution-exclusion"),
  numberOption("similarVideosSkipForward", SIMILAR_VIDEOS, "跳过开头（秒）", "Skip forward (seconds)", 15, "--video-skip", 0, 300),
  numberOption("similarVideosHashDuration", SIMILAR_VIDEOS, "Hash 时长（秒）", "Hash duration (seconds)", 10, "--video-duration", 2, 60),
  booleanOption("similarVideosLetterboxCrop", SIMILAR_VIDEOS, "检测黑边", "Detect letterbox bars", true, "--video-letterbox-crop"),
  guiNumberOption("similarVideosWindowCount", SIMILAR_VIDEOS, "采样窗口数", "Window count", 5, 1, 20, 1, "similar-videos.similario"),
  guiNumberOption("similarVideosDurationTolerancePct", SIMILAR_VIDEOS, "时长容差（%）", "Duration tolerance (%)", 20, 0, 100, 1, "similar-videos.similario"),
  guiNumberOption("similarVideosMinMatchingWindows", SIMILAR_VIDEOS, "最小匹配窗口比例", "Minimum matching windows", 0.6, 0, 1, 0.05, "similar-videos.similario"),
  guiNumberOption("similarVideosSubclipMinMatch", SIMILAR_VIDEOS, "子片段最小匹配比例", "Minimum subclip match", 0.5, 0, 1, 0.05, "similar-videos.similario"),
  guiBooleanOption("similarVideosCheckAudioContent", SIMILAR_VIDEOS, "按音频内容比较", "Compare audio content", false, "similar-videos.audio"),
  option("musicCheckType", MUSIC, "select", "音频判断方式", "Audio check type", "tags", "--music-check", [{ value: "tags", label: "标签 / Tags" }, { value: "fingerprint", label: "音频指纹 / Fingerprint" }]),
  booleanOption("musicApproximateComparison", MUSIC, "近似标签比较", "Approximate tag comparison", true, "--music-approximate"),
  booleanOption("musicCompareTitle", MUSIC, "比较标题", "Compare title", true, "--music-title"),
  booleanOption("musicCompareArtist", MUSIC, "比较艺术家", "Compare artist", true, "--music-artist"),
  booleanOption("musicCompareBitrate", MUSIC, "比较比特率", "Compare bitrate", false, "--music-bitrate"),
  booleanOption("musicCompareGenre", MUSIC, "比较流派", "Compare genre", false, "--music-genre"),
  booleanOption("musicCompareYear", MUSIC, "比较年份", "Compare year", false, "--music-year"),
  booleanOption("musicCompareLength", MUSIC, "比较时长", "Compare length", false, "--music-length"),
  numberOption("musicMaximumDifference", MUSIC, "最大差异", "Maximum difference", 10, "--music-difference", 0, 10),
  numberOption("musicMinimumFragmentDuration", MUSIC, "最小片段时长", "Minimum fragment duration", 15, "--music-fragment", 0, 3600),
  booleanOption("musicCompareFingerprintsOnlyWithSimilarTitles", MUSIC, "指纹仅比较相似标题", "Fingerprint only with similar titles", true, "--music-similar-title"),
  booleanOption("brokenAudio", BROKEN, "检查音频", "Check audio", true, "--broken-audio"),
  booleanOption("brokenPdf", BROKEN, "检查 PDF", "Check PDF", true, "--broken-pdf"),
  booleanOption("brokenArchive", BROKEN, "检查压缩包", "Check archives", true, "--broken-archive"),
  booleanOption("brokenImage", BROKEN, "检查图片", "Check images", true, "--broken-image"),
  guiBooleanOption("brokenVideoFfprobe", BROKEN, "快速检查视频 (FFprobe)", "Fast video check (FFprobe)", false, "broken-files.multi-checker"),
  guiBooleanOption("brokenVideoFfmpeg", BROKEN, "完整解码检查视频 (FFmpeg)", "Full video decode (FFmpeg)", false, "broken-files.multi-checker"),
  guiBooleanOption("brokenFont", BROKEN, "检查字体", "Check fonts", false, "broken-files.multi-checker"),
  guiBooleanOption("brokenMarkup", BROKEN, "检查标记文件", "Check markup files", false, "broken-files.multi-checker"),
  guiOption("videoOptimizerMode", VIDEO_OPTIMIZER, "select", "优化模式", "Optimization mode", "transcode", "scan.video-optimizer", [{ value: "transcode", label: "转码 / Transcode" }, { value: "crop", label: "裁剪黑边 / Crop" }]),
  guiTextOption("videoOptimizerExcludedCodecs", VIDEO_OPTIMIZER, "跳过视频编码", "Excluded video codecs", "h265,av1,vp9", "scan.video-optimizer"),
  guiNumberOption("videoOptimizerBlackPixelThreshold", VIDEO_OPTIMIZER, "黑色像素阈值", "Black pixel threshold", 32, 0, 128, 1, "scan.video-optimizer"),
  guiNumberOption("videoOptimizerBlackBarMinPercentage", VIDEO_OPTIMIZER, "黑边最小比例（%）", "Black bar minimum (%)", 90, 50, 100, 1, "scan.video-optimizer"),
  guiNumberOption("videoOptimizerMaxSamples", VIDEO_OPTIMIZER, "最大采样数", "Maximum samples", 20, 5, 1000, 1, "scan.video-optimizer"),
  guiNumberOption("videoOptimizerMinCropSize", VIDEO_OPTIMIZER, "最小裁剪边距", "Minimum crop margin", 5, 1, 1000, 1, "scan.video-optimizer"),
]

export function getKisakiToolOptions(tool: KisakiTool): readonly KisakiOptionDefinition[] {
  return KISAKI_TOOL_OPTIONS.filter((definition) => definition.tools.includes(tool))
}

export function getKisakiGuiToolOptions(tool: KisakiTool, nativeCapabilities: ReadonlySet<string>): readonly KisakiOptionDefinition[] {
  return getKisakiToolOptions(tool).filter((definition) => definition.requiredNativeCapabilities?.every((capability) => nativeCapabilities.has(capability)) ?? true)
}

export function getKisakiTerminalToolOptions(tool: KisakiTool): readonly KisakiOptionDefinition[] {
  return terminalOptions().filter((definition) => definition.tools.includes(tool))
}

export function kisakiOptionDefaults(): Partial<KisakiInput> {
  return Object.fromEntries(KISAKI_TOOL_OPTIONS.map((definition) => [definition.id, definition.defaultValue]))
}

export function createKisakiOptionFields(language: TerminalLanguage): InteractionField[] {
  return terminalOptions().map((definition) => ({
    id: definition.id,
    label: definition.label[language === "zh" ? "zh" : "en"],
    kind: definition.kind,
    min: definition.min,
    max: definition.max,
    step: definition.kind === "number" ? definition.step ?? 1 : undefined,
    options: definition.choices?.map((choice) => ({ value: choice.value, label: choice.label ?? human(choice.value) })),
    visibleWhen: (values: InteractionValues) => values.action === "scan" && definition.tools.includes(values.tool as KisakiTool),
  }))
}

export function createKisakiOptionHelpFields(language: TerminalLanguage): NodeHelpField[] {
  const key = language === "zh" ? "zh" : "en"
  return terminalOptions().map((definition) => {
    const cliFlag = definition.cliFlag!
    const flag = definition.kind === "boolean" ? `${cliFlag} / --no-${cliFlag.slice(2)}` : cliFlag
    const tools = definition.tools.join(", ")
    const choices = definition.choices?.map((choice) => choice.value).join(" | ")
    const bounds = definition.kind === "number" ? [definition.min, definition.max].filter((value) => value !== undefined).join("–") : undefined
    const details = choices ? `${language === "zh" ? "可选值" : "Values"}: ${choices}` : bounds ? `${language === "zh" ? "范围" : "Range"}: ${bounds}` : undefined
    return {
      name: flag,
      type: definition.kind,
      description: `${definition.label[key]} · ${language === "zh" ? "适用于" : "Tools"}: ${tools}${details ? ` · ${details}` : ""}`,
      defaultValue: String(definition.defaultValue),
    }
  })
}

export function valuesToKisakiOptions(values: Record<string, unknown>): Partial<KisakiInput> {
  return Object.fromEntries(KISAKI_TOOL_OPTIONS.map((definition) => [definition.id, coerceOptionValue(definition, values[definition.id])]))
}

/**
 * Shared GUI/CLI/TUI boundary. Surfaces keep their own widgets, but they all
 * translate display values into the core scan contract here.
 */
export function createKisakiScanInput(tool: KisakiTool, values: Record<string, unknown>): KisakiInput {
  const includedDirectories = parseKisakiList(values.includedDirectoriesText ?? values.includedDirectories)
  return {
    action: "scan",
    tool,
    includedDirectories,
    includedDirectoriesReferenced: reconcileKisakiReferences(includedDirectories, values.includedDirectoriesReferencedText ?? values.includedDirectoriesReferenced),
    excludedDirectories: parseKisakiList(values.excludedDirectoriesText ?? values.excludedDirectories),
    excludedItems: parseKisakiList(values.excludedItemsText ?? values.excludedItems),
    allowedExtensions: extensionText(values.allowedExtensions),
    excludedExtensions: extensionText(values.excludedExtensions),
    minimumFileSize: optionalNumber(values.minimumFileSize),
    maximumFileSize: optionalNumber(values.maximumFileSize),
    recursive: values.recursive !== false,
    useCache: values.useCache !== false,
    saveAlsoAsJson: values.saveAlsoAsJson === true,
    deleteOutdatedCache: values.deleteOutdatedCache !== false,
    cacheFolderPath: text(values.cacheFolderPath),
    configFolderPath: text(values.configFolderPath),
    duplicateMinimalHashCacheSizeKiB: optionalNumber(values.duplicateMinimalHashCacheSizeKiB),
    duplicateMinimalPrehashCacheSizeKiB: optionalNumber(values.duplicateMinimalPrehashCacheSizeKiB),
    threadCount: optionalNumber(values.threadCount),
    filterText: text(values.filterText),
    ...valuesToKisakiOptions(values),
    simiuSetsEnabled: values.simiuSetsEnabled === true,
    simiuSetsScanOrder: values.simiuSetsScanOrder as KisakiInput["simiuSetsScanOrder"],
    simiuSetsNamePrefix: text(values.simiuSetsNamePrefix),
    simiuSetsMinimumGroupSize: optionalNumber(values.simiuSetsMinimumGroupSize),
    simiuSetsOperationMode: values.simiuSetsOperationMode as KisakiInput["simiuSetsOperationMode"],
    similarVideosLetterboxCrop: resolveKisakiSimilarVideoCrop(values).letterboxCrop,
  }
}

export function createKisakiOperationInput(action: Exclude<KisakiAction, "scan">, values: Record<string, unknown>): KisakiInput {
  const outputPath = text(values.outputPath)
  const simiuAction = action === "simiu-apply" || action === "simiu-undo"
  return {
    action,
    tool: values.tool as KisakiTool | undefined,
    selectedPaths: lines(values.selectedPathsText ?? values.selectedPaths),
    destinationDirectory: text(values.destinationDirectory),
    destinationItems: Array.isArray(values.destinationItems) ? values.destinationItems as NonNullable<KisakiInput["destinationItems"]> : [],
    renameItems: Array.isArray(values.renameItems) ? values.renameItems as NonNullable<KisakiInput["renameItems"]> : parseRenameItems(values.renameItemsText),
    deleteMode: values.deleteMode === "permanent" ? "permanent" : "trash",
    copyMode: values.copyMode === true,
    preserveStructure: values.preserveStructure === true,
    conflictPolicy: ["skip", "overwrite", "rename", "error"].includes(String(values.conflictPolicy)) ? values.conflictPolicy as NonNullable<KisakiInput["conflictPolicy"]> : "skip",
    outputPath,
    outputFormat: outputPath?.toLowerCase().endsWith(".csv") || values.outputFormat === "csv" ? "csv" : "json",
    exportScope: ["selected", "visible", "all"].includes(String(values.exportScope)) ? values.exportScope as NonNullable<KisakiInput["exportScope"]> : "selected",
    exportEntries: Array.isArray(values.exportEntries) ? values.exportEntries as NonNullable<KisakiInput["exportEntries"]> : [],
    ...(simiuAction ? {
      simiuSetsOperationMode: values.simiuSetsOperationMode as KisakiInput["simiuSetsOperationMode"],
      simiuSetsOperations: Array.isArray(values.simiuSetsOperations) ? values.simiuSetsOperations as NonNullable<KisakiInput["simiuSetsOperations"]> : [],
      simiuSetsUndoLogPath: text(values.simiuSetsUndoLogPath),
      simiuSetsCleanEmptyDirectories: values.simiuSetsCleanEmptyDirectories !== false,
    } : {}),
    dryRun: action === "save" ? false : values.dryRun !== false,
  }
}

export function parseKisakiCliOptions(args: string[]): Partial<KisakiInput> {
  const result: Record<string, OptionValue> = {}
  for (const definition of terminalOptions()) {
    const cliFlag = definition.cliFlag!
    if (definition.kind === "boolean") {
      if (args.includes(cliFlag)) result[definition.id] = true
      if (args.includes(`--no-${cliFlag.slice(2)}`)) result[definition.id] = false
      continue
    }
    const index = args.indexOf(cliFlag)
    if (index < 0 || args[index + 1] === undefined) continue
    result[definition.id] = coerceOptionValue(definition, args[index + 1])
  }
  const legacyCropDetect = optionValueFor(args, "--video-crop")
  if (result.similarVideosLetterboxCrop === undefined && legacyCropDetect !== undefined) {
    result.similarVideosLetterboxCrop = resolveKisakiSimilarVideoCrop({ similarVideosCropDetect: legacyCropDetect }).letterboxCrop
  }
  return result as Partial<KisakiInput>
}

export const KISAKI_CLI_VALUE_FLAGS = new Set([...terminalOptions().filter((definition) => definition.kind !== "boolean").map((definition) => definition.cliFlag!), "--video-crop"])

type TerminalOptionDefinition = KisakiOptionDefinition & { cliFlag: string; kind: Exclude<OptionKind, "text"> }
function terminalOptions(): TerminalOptionDefinition[] { return KISAKI_TOOL_OPTIONS.filter((definition): definition is TerminalOptionDefinition => Boolean(definition.cliFlag) && definition.kind !== "text") }
function option(id: OptionId, tools: readonly KisakiTool[], kind: OptionKind, zh: string, en: string, defaultValue: OptionValue, cliFlag: string, choices?: readonly (string | { value: string; label?: string })[]): KisakiOptionDefinition {
  return { id, tools, kind, label: { zh, en }, defaultValue, cliFlag, choices: choices?.map((choice) => typeof choice === "string" ? { value: choice } : choice) }
}
function numberOption(id: OptionId, tools: readonly KisakiTool[], zh: string, en: string, defaultValue: number, cliFlag: string, min: number, max: number) { return { ...option(id, tools, "number", zh, en, defaultValue, cliFlag), min, max, step: 1 } }
function booleanOption(id: OptionId, tools: readonly KisakiTool[], zh: string, en: string, defaultValue: boolean, cliFlag: string) { return option(id, tools, "boolean", zh, en, defaultValue, cliFlag) }
function guiOption(id: OptionId, tools: readonly KisakiTool[], kind: OptionKind, zh: string, en: string, defaultValue: OptionValue, requiredNativeCapability: string, choices?: readonly (string | { value: string; label?: string })[]): KisakiOptionDefinition {
  return { id, tools, kind, label: { zh, en }, defaultValue, requiredNativeCapabilities: [requiredNativeCapability], choices: choices?.map((choice) => typeof choice === "string" ? { value: choice } : choice) }
}
function guiBooleanOption(id: OptionId, tools: readonly KisakiTool[], zh: string, en: string, defaultValue: boolean, requiredNativeCapability: string) { return guiOption(id, tools, "boolean", zh, en, defaultValue, requiredNativeCapability) }
function guiNumberOption(id: OptionId, tools: readonly KisakiTool[], zh: string, en: string, defaultValue: number, min: number, max: number, step: number, requiredNativeCapability: string) { return { ...guiOption(id, tools, "number", zh, en, defaultValue, requiredNativeCapability), min, max, step } }
function guiTextOption(id: OptionId, tools: readonly KisakiTool[], zh: string, en: string, defaultValue: string, requiredNativeCapability: string) { return guiOption(id, tools, "text", zh, en, defaultValue, requiredNativeCapability) }
function coerceOptionValue(definition: KisakiOptionDefinition, value: unknown): OptionValue { const candidate = value ?? definition.defaultValue; return typeof definition.defaultValue === "number" ? Number(candidate) : typeof definition.defaultValue === "boolean" ? candidate !== false && candidate !== "false" : String(candidate) }
function human(value: string) { return value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") }
function lines(value: unknown): string[] { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null || String(value).trim() === "") return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined }
function text(value: unknown): string | undefined { return value === undefined || value === null ? undefined : String(value) }
function extensionText(value: unknown): string | undefined { const tokens = parseKisakiExtensionTokens(value); return tokens.length ? serializeKisakiExtensionTokens(tokens) : undefined }
function parseRenameItems(value: unknown): NonNullable<KisakiInput["renameItems"]> { return lines(value).map((line) => { const separator = line.lastIndexOf("\t"); if (separator < 0) return null; const path = line.slice(0, separator).trim(), properExtension = line.slice(separator + 1).trim(); return path && properExtension ? { path, properExtension } : null }).filter((item): item is NonNullable<typeof item> => item !== null) }
function optionValueFor(args: string[], flag: string): string | undefined { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
