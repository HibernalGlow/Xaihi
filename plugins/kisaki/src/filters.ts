import type { KisakiEntry, KisakiGroup, KisakiTool } from "./core.js"

export type { KisakiTool } from "./core.js"

export type KisakiSizeUnit = "B" | "KB" | "MB" | "GB" | "TB"
export type KisakiMarkFilter = "all" | "selected" | "unselected" | "group-some-selected" | "group-all-selected" | "group-none-selected" | "reference"
export type KisakiPathMatchMode = "contains" | "not-contains" | "starts-with" | "ends-with" | "regex"
export type KisakiDatePreset = "today" | "last-7-days" | "last-30-days" | "last-year" | "custom"
export type KisakiAspectRatio = "any" | "16:9" | "4:3" | "1:1"
export type KisakiFormatCategory = "images" | "videos" | "audio" | "documents" | "archives" | "folders" | "other"
export const KISAKI_NO_EXTENSION = "__no_extension__"
export type KisakiTextField = "name" | "path" | "metadata" | "detail"
export type KisakiBuiltinFilterPreset = "none" | "large-files" | "small-files" | "recently-modified" | "old-files"

export interface KisakiStoredFilterPreset {
  id: string
  name: string
  state: KisakiFilterState
}

export interface KisakiRangeFilter {
  enabled: boolean
  min?: number
  max?: number
  unit?: KisakiSizeUnit
}

export interface KisakiFilterState {
  text: { enabled: boolean; pattern: string; regex: boolean; caseSensitive: boolean; fields: KisakiTextField[] }
  mark: KisakiMarkFilter
  groupCount: KisakiRangeFilter
  groupSize: KisakiRangeFilter
  fileSize: KisakiRangeFilter
  extension: { enabled: boolean; mode: "include" | "exclude"; extensions: string[]; excludedCategories: KisakiFormatCategory[] }
  modifiedDate: { enabled: boolean; preset: KisakiDatePreset; start?: number; end?: number }
  path: { enabled: boolean; mode: KisakiPathMatchMode; pattern: string; caseSensitive: boolean }
  similarity: KisakiRangeFilter
  resolution: { enabled: boolean; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; aspectRatio: KisakiAspectRatio }
  showAllInFilteredGroups: boolean
}

export interface KisakiExtensionStat {
  extension: string
  totalCount: number
  filteredCount: number
  totalBytes: number
  filteredBytes: number
}

export interface KisakiCategoryStat {
  category: KisakiFormatCategory
  totalCount: number
  filteredCount: number
}

export interface KisakiFilterStats {
  totalItems: number
  filteredItems: number
  totalGroups: number
  filteredGroups: number
  totalBytes: number
  filteredBytes: number
  selectedItems: number
  activeFilterCount: number
  extensions: KisakiExtensionStat[]
  categories: KisakiCategoryStat[]
}

export interface KisakiFilterResult {
  groups: KisakiGroup[]
  stats: KisakiFilterStats
  pathPatternError?: string
  textPatternError?: string
}

export function createDefaultKisakiFilterState(): KisakiFilterState {
  return {
    text: { enabled: false, pattern: "", regex: false, caseSensitive: false, fields: ["name", "path", "metadata", "detail"] },
    mark: "all",
    groupCount: { enabled: false, min: 2, max: 100 },
    groupSize: { enabled: false, min: 0, max: 100, unit: "GB" },
    fileSize: { enabled: false, min: 0, max: 100, unit: "GB" },
    extension: { enabled: false, mode: "include", extensions: [], excludedCategories: [] },
    modifiedDate: { enabled: false, preset: "custom" },
    path: { enabled: false, mode: "contains", pattern: "", caseSensitive: false },
    similarity: { enabled: false, min: 0, max: 100 },
    resolution: { enabled: false, aspectRatio: "any" },
    showAllInFilteredGroups: true,
  }
}

export function applyKisakiBuiltinFilterPreset(preset: KisakiBuiltinFilterPreset, now = Date.now()): KisakiFilterState {
  const state = createDefaultKisakiFilterState()
  if (preset === "large-files") state.fileSize = { enabled: true, min: 100, max: 102_400, unit: "MB" }
  if (preset === "small-files") state.fileSize = { enabled: true, min: 0, max: 1024, unit: "KB" }
  if (preset === "recently-modified") state.modifiedDate = { enabled: true, preset: "last-30-days" }
  if (preset === "old-files") state.modifiedDate = { enabled: true, preset: "custom", start: 0, end: now - 365 * 24 * 60 * 60 * 1000 }
  return state
}

export function normalizeKisakiFilterState(value: Partial<KisakiFilterState> | undefined): KisakiFilterState {
  const defaults = createDefaultKisakiFilterState()
  if (!value) return defaults
  return {
    ...defaults,
    ...value,
    text: { ...defaults.text, ...value.text, fields: [...(value.text?.fields ?? defaults.text.fields)] },
    groupCount: { ...defaults.groupCount, ...value.groupCount },
    groupSize: { ...defaults.groupSize, ...value.groupSize },
    fileSize: { ...defaults.fileSize, ...value.fileSize },
    extension: { ...defaults.extension, ...value.extension, extensions: [...(value.extension?.extensions ?? [])], excludedCategories: [...(value.extension?.excludedCategories ?? [])] },
    modifiedDate: { ...defaults.modifiedDate, ...value.modifiedDate },
    path: { ...defaults.path, ...value.path },
    similarity: { ...defaults.similarity, ...value.similarity },
    resolution: { ...defaults.resolution, ...value.resolution },
  }
}

export function serializeKisakiFilterPresets(presets: KisakiStoredFilterPreset[]): string { return JSON.stringify({ version: 1, presets }, null, 2) }

export function parseKisakiFilterPresets(text: string): KisakiStoredFilterPreset[] {
  const parsed = JSON.parse(text) as { version?: unknown; presets?: unknown }
  if (parsed.version !== 1 || !Array.isArray(parsed.presets)) throw new Error("Unsupported Kisaki filter preset document.")
  return parsed.presets.map((preset, index) => {
    if (!preset || typeof preset !== "object") throw new Error(`Invalid preset at index ${index}.`)
    const value = preset as { id?: unknown; name?: unknown; state?: unknown }
    if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name || !value.state || typeof value.state !== "object") throw new Error(`Invalid preset at index ${index}.`)
    return { id: value.id, name: value.name, state: normalizeKisakiFilterState(value.state as Partial<KisakiFilterState>) }
  })
}

export function applyKisakiFilters(groups: KisakiGroup[], selectedPaths: Iterable<string>, state: KisakiFilterState, now = Date.now(), tool?: KisakiTool): KisakiFilterResult {
  const selected = new Set(selectedPaths)
  const textMatcher = createTextMatcher(state.text.pattern, state.text.caseSensitive, state.text.regex)
  const pathMatcher = createPathMatcher(state.path.pattern, state.path.caseSensitive, state.path.mode)
  const filteredGroups: KisakiGroup[] = []

  for (const group of groups) {
    if (!matchesGroupRanges(group, state) || !matchesGroupMark(group, selected, state.mark)) continue
    const matchedEntries = group.entries.filter((entry) => matchesEntry(entry, selected, state, now, textMatcher.match, pathMatcher.match, tool))
    if (matchedEntries.length === 0) continue
    filteredGroups.push({ ...group, entries: state.showAllInFilteredGroups && hasEntryFilter(state) ? group.entries : matchedEntries })
  }

  return {
    groups: filteredGroups,
    stats: calculateKisakiFilterStats(groups, filteredGroups, selected, state, tool),
    ...(pathMatcher.error ? { pathPatternError: pathMatcher.error } : {}),
    ...(textMatcher.error ? { textPatternError: textMatcher.error } : {}),
  }
}

export function countActiveKisakiFilters(state: KisakiFilterState): number {
  return Number(state.text.enabled && Boolean(state.text.pattern))
    + Number(state.mark !== "all")
    + Number(state.groupCount.enabled)
    + Number(state.groupSize.enabled)
    + Number(state.fileSize.enabled)
    + Number(state.extension.enabled && (state.extension.extensions.length > 0 || state.extension.excludedCategories.length > 0))
    + Number(state.modifiedDate.enabled)
    + Number(state.path.enabled && Boolean(state.path.pattern))
    + Number(state.similarity.enabled)
    + Number(state.resolution.enabled)
}

export function supportsSimilarityFilter(tool: KisakiTool): boolean { return tool === "similar-images" || tool === "similar-videos" }
export function supportsResolutionFilter(tool: KisakiTool): boolean { return tool === "similar-images" || tool === "similar-videos" }

function matchesGroupRanges(group: KisakiGroup, state: KisakiFilterState): boolean {
  if (state.groupCount.enabled && !inRange(group.entries.length, state.groupCount.min, state.groupCount.max)) return false
  if (state.groupSize.enabled && !inRange(group.totalBytes, sizeBoundary(state.groupSize.min, state.groupSize.unit), sizeBoundary(state.groupSize.max, state.groupSize.unit))) return false
  return true
}

function matchesGroupMark(group: KisakiGroup, selected: Set<string>, mark: KisakiMarkFilter): boolean {
  if (mark === "all" || mark === "selected" || mark === "unselected" || mark === "reference") return true
  const selectable = group.entries.filter((entry) => !entry.isReference)
  const selectedCount = selectable.filter((entry) => selected.has(entry.path)).length
  if (mark === "group-some-selected") return selectedCount > 0 && selectedCount < selectable.length
  if (mark === "group-all-selected") return selectable.length > 0 && selectedCount === selectable.length
  return selectedCount === 0
}

function matchesEntry(entry: KisakiEntry, selected: Set<string>, state: KisakiFilterState, now: number, textMatch: (value: string) => boolean, pathMatch: (value: string) => boolean, tool?: KisakiTool): boolean {
  if (state.mark === "selected" && !selected.has(entry.path)) return false
  if (state.mark === "unselected" && (entry.isReference || selected.has(entry.path))) return false
  if (state.mark === "reference" && !entry.isReference) return false
  if (state.text.enabled && state.text.pattern && !textMatch(entrySearchText(entry, state.text.fields))) return false
  if (state.fileSize.enabled && !inRange(entry.size, sizeBoundary(state.fileSize.min, state.fileSize.unit), sizeBoundary(state.fileSize.max, state.fileSize.unit))) return false
  if (state.extension.enabled && state.extension.excludedCategories.includes(categoryOf(entry, tool))) return false
  if (state.extension.enabled && state.extension.extensions.length > 0) {
    const extensions = new Set(state.extension.extensions.map(normalizeExtension))
    const included = extensions.has(extensionOf(entry.path))
    if (state.extension.mode === "include" ? !included : included) return false
  }
  if (state.modifiedDate.enabled && !matchesDate(entry.modifiedDate, state.modifiedDate, now)) return false
  if (state.path.enabled && state.path.pattern && !pathMatch(entry.path)) return false
  if (state.similarity.enabled && !inRange(parseNumeric(entry.similarity), state.similarity.min, state.similarity.max)) return false
  if (state.resolution.enabled && !matchesResolution(entry, state.resolution)) return false
  return true
}

function hasEntryFilter(state: KisakiFilterState): boolean {
  return state.text.enabled || state.mark === "selected" || state.mark === "unselected" || state.mark === "reference" || state.fileSize.enabled || state.extension.enabled || state.modifiedDate.enabled || state.path.enabled || state.similarity.enabled || state.resolution.enabled
}

function calculateKisakiFilterStats(original: KisakiGroup[], filtered: KisakiGroup[], selected: Set<string>, state: KisakiFilterState, tool?: KisakiTool): KisakiFilterStats {
  const originalEntries = original.flatMap((group) => group.entries)
  const filteredEntries = filtered.flatMap((group) => group.entries)
  const extensionMap = new Map<string, KisakiExtensionStat>()
  const categoryMap = new Map<KisakiFormatCategory, KisakiCategoryStat>()
  for (const entry of originalEntries) {
    const extension = extensionOf(entry.path) || KISAKI_NO_EXTENSION
    const current = extensionMap.get(extension) ?? { extension, totalCount: 0, filteredCount: 0, totalBytes: 0, filteredBytes: 0 }
    current.totalCount += 1
    current.totalBytes += entry.size
    extensionMap.set(extension, current)
    const category = categoryOf(entry, tool)
    const categoryStat = categoryMap.get(category) ?? { category, totalCount: 0, filteredCount: 0 }
    categoryStat.totalCount += 1
    categoryMap.set(category, categoryStat)
  }
  for (const entry of filteredEntries) {
    const extension = extensionOf(entry.path) || KISAKI_NO_EXTENSION
    const current = extensionMap.get(extension) ?? { extension, totalCount: 0, filteredCount: 0, totalBytes: 0, filteredBytes: 0 }
    current.filteredCount += 1
    current.filteredBytes += entry.size
    extensionMap.set(extension, current)
    const category = categoryOf(entry, tool)
    const categoryStat = categoryMap.get(category) ?? { category, totalCount: 0, filteredCount: 0 }
    categoryStat.filteredCount += 1
    categoryMap.set(category, categoryStat)
  }
  return {
    totalItems: originalEntries.length,
    filteredItems: filteredEntries.length,
    totalGroups: original.length,
    filteredGroups: filtered.length,
    totalBytes: sumBytes(originalEntries),
    filteredBytes: sumBytes(filteredEntries),
    selectedItems: originalEntries.filter((entry) => selected.has(entry.path)).length,
    activeFilterCount: countActiveKisakiFilters(state),
    extensions: [...extensionMap.values()].sort((left, right) => right.filteredCount - left.filteredCount || right.totalCount - left.totalCount || left.extension.localeCompare(right.extension)),
    categories: [...categoryMap.values()].sort((left, right) => CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)),
  }
}

function matchesDate(value: number, config: KisakiFilterState["modifiedDate"], now: number): boolean {
  const timestamp = value > 0 && value < 10_000_000_000 ? value * 1000 : value
  const day = 24 * 60 * 60 * 1000
  let start = config.start ?? 0
  let end = config.end ?? Number.MAX_SAFE_INTEGER
  if (config.preset === "today") { const date = new Date(now); date.setHours(0, 0, 0, 0); start = date.getTime(); end = now }
  if (config.preset === "last-7-days") { start = now - 7 * day; end = now }
  if (config.preset === "last-30-days") { start = now - 30 * day; end = now }
  if (config.preset === "last-year") { start = now - 365 * day; end = now }
  return timestamp >= start && timestamp <= end
}

function matchesResolution(entry: KisakiEntry, config: KisakiFilterState["resolution"]): boolean {
  if (!entry.width || !entry.height) return false
  if (!inRange(entry.width, config.minWidth, config.maxWidth) || !inRange(entry.height, config.minHeight, config.maxHeight)) return false
  if (config.aspectRatio === "any") return true
  const [expectedWidth, expectedHeight] = config.aspectRatio.split(":").map(Number)
  return Math.abs(entry.width / entry.height - expectedWidth! / expectedHeight!) <= 0.02
}

function createPathMatcher(pattern: string, caseSensitive: boolean, mode: KisakiPathMatchMode): { match: (value: string) => boolean; error?: string } {
  if (mode === "regex") return createRegexMatcher(pattern, caseSensitive)
  const needle = caseSensitive ? pattern : pattern.toLocaleLowerCase()
  return { match: (value) => { const candidate = caseSensitive ? value : value.toLocaleLowerCase(); if (mode === "contains") return candidate.includes(needle); if (mode === "not-contains") return !candidate.includes(needle); if (mode === "starts-with") return candidate.startsWith(needle); return candidate.endsWith(needle) } }
}

function createTextMatcher(pattern: string, caseSensitive: boolean, regex: boolean): { match: (value: string) => boolean; error?: string } {
  if (regex) return createRegexMatcher(pattern, caseSensitive)
  const needle = caseSensitive ? pattern : pattern.toLocaleLowerCase()
  return { match: (value) => (caseSensitive ? value : value.toLocaleLowerCase()).includes(needle) }
}

function createRegexMatcher(pattern: string, caseSensitive: boolean): { match: (value: string) => boolean; error?: string } {
  try { const expression = new RegExp(pattern, caseSensitive ? "" : "i"); return { match: (value) => expression.test(value) } }
  catch (error) { return { match: () => false, error: error instanceof Error ? error.message : String(error) } }
}

function entrySearchText(entry: KisakiEntry, fields: KisakiTextField[]): string {
  const values: unknown[] = []
  if (fields.includes("name")) values.push(entry.name)
  if (fields.includes("path")) values.push(entry.path)
  if (fields.includes("metadata")) values.push(entry.title, entry.artist, entry.genre, entry.year, entry.length, entry.bitrate, entry.width, entry.height, entry.similarity)
  if (fields.includes("detail")) values.push(entry.detail, entry.error, entry.properExtension, entry.secondaryPath, entry.status)
  return values.filter((value) => value !== undefined && value !== "").join("\n")
}
function sizeBoundary(value: number | undefined, unit: KisakiSizeUnit | undefined): number | undefined { return value === undefined ? undefined : value * ({ B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit ?? "B"]) }
function inRange(value: number, min?: number, max?: number): boolean { return (min === undefined || value >= min) && (max === undefined || value <= max) }
function extensionOf(path: string): string { const name = path.replace(/\\/g, "/").split("/").at(-1) ?? ""; const index = name.lastIndexOf("."); return index > 0 ? name.slice(index + 1).toLocaleLowerCase() : "" }
function normalizeExtension(value: string): string { const normalized = value.trim().replace(/^\./, "").toLocaleLowerCase(); return normalized === KISAKI_NO_EXTENSION || normalized === "(无扩展名)" || normalized === "(no extension)" ? "" : normalized }
const CATEGORY_ORDER: KisakiFormatCategory[] = ["images", "videos", "audio", "documents", "archives", "folders", "other"]
const CATEGORY_EXTENSIONS: Record<Exclude<KisakiFormatCategory, "folders" | "other">, Set<string>> = {
  images: new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic", "jxl", "svg", "raw", "cr2", "nef", "arw"]),
  videos: new Set(["mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", "m4v", "mpeg", "mpg", "ts"]),
  audio: new Set(["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "ape"]),
  documents: new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "epub"]),
  archives: new Set(["zip", "7z", "rar", "tar", "gz", "bz2", "xz", "zst", "cab", "iso"]),
}
function categoryOf(entry: KisakiEntry, tool?: KisakiTool): KisakiFormatCategory { if (tool === "empty-folders") return "folders"; const extension = extensionOf(entry.path); for (const category of ["images", "videos", "audio", "documents", "archives"] as const) if (CATEGORY_EXTENSIONS[category].has(extension)) return category; return "other" }
function parseNumeric(value: string | undefined): number { const result = Number.parseFloat(value ?? ""); return Number.isFinite(result) ? result : -1 }
function sumBytes(entries: KisakiEntry[]): number { return entries.reduce((sum, entry) => sum + entry.size, 0) }
