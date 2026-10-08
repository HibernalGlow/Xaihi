import { KISAKI_TOOLS } from "./scanner-vocabulary.js"
import type { KisakiInput, KisakiTool } from "./core.js"
import { resolveKisakiSimilarVideoCrop } from "./similar-video-crop.js"
import { KISAKI_TOOL_OPTIONS, createKisakiScanInput } from "./tool-options.js"

export interface KisakiScanPreset {
  version: 1
  id: string
  name: string
  tool: KisakiTool
  input: KisakiInput
  createdAt: number
  updatedAt: number
}

export interface KisakiScanPresetDocument {
  schema: "xiranite.czkawka.scan-presets"
  version: 1
  presets: KisakiScanPreset[]
}

export function saveKisakiScanPreset(presets: KisakiScanPreset[], options: { id?: string; name: string; input: KisakiInput; now?: number; createId?: () => string }): { presets: KisakiScanPreset[]; preset: KisakiScanPreset } {
  const name = options.name.trim()
  if (!name) throw new Error("Preset name is required.")
  const now = options.now ?? Date.now()
  const existing = options.id ? presets.find((preset) => preset.id === options.id) : undefined
  const preset: KisakiScanPreset = {
    version: 1,
    id: existing?.id ?? options.createId?.() ?? createPresetId(),
    name,
    tool: normalizeTool(options.input.tool),
    input: canonicalScanInput(options.input),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return { preset, presets: existing ? presets.map((item) => item.id === existing.id ? preset : item) : [...presets, preset] }
}

export function deleteKisakiScanPreset(presets: KisakiScanPreset[], id: string): KisakiScanPreset[] { return presets.filter((preset) => preset.id !== id) }

export function exportKisakiScanPresets(presets: KisakiScanPreset[]): string {
  const document: KisakiScanPresetDocument = { schema: "xiranite.czkawka.scan-presets", version: 1, presets: presets.map(validatePreset) }
  return `${JSON.stringify(document, null, 2)}\n`
}

export function importKisakiScanPresets(text: string, existing: KisakiScanPreset[] = [], mode: "merge" | "replace" = "merge"): KisakiScanPreset[] {
  if (text.length > 1_000_000) throw new Error("Preset document is too large.")
  const value = JSON.parse(text) as Partial<KisakiScanPresetDocument>
  if (value.schema !== "xiranite.czkawka.scan-presets" || value.version !== 1 || !Array.isArray(value.presets)) throw new Error("Unsupported Kisaki preset document.")
  const imported = value.presets.map(validatePreset)
  if (mode === "replace") return imported
  const merged = new Map(existing.map((preset) => [preset.id, validatePreset(preset)]))
  for (const preset of imported) merged.set(preset.id, preset)
  return [...merged.values()]
}

/** Maps a canonical preset back to the shared GUI/CLI/TUI interaction field names. */
export function kisakiScanPresetToValues(preset: KisakiScanPreset): Record<string, unknown> {
  const input = canonicalScanInput(preset.input)
  const values: Record<string, unknown> = {
    tool: preset.tool,
    includedDirectoriesText: input.includedDirectories?.join("\n") ?? "",
    includedDirectoriesReferencedText: input.includedDirectoriesReferenced?.join("\n") ?? "",
    excludedDirectoriesText: input.excludedDirectories?.join("\n") ?? "",
    excludedItemsText: input.excludedItems?.join("; ") ?? "",
    allowedExtensions: input.allowedExtensions ?? "",
    excludedExtensions: input.excludedExtensions ?? "",
    minimumFileSize: input.minimumFileSize === undefined ? "" : String(input.minimumFileSize),
    maximumFileSize: input.maximumFileSize === undefined ? "" : String(input.maximumFileSize),
    recursive: input.recursive ?? true,
    useCache: input.useCache ?? true,
    saveAlsoAsJson: input.saveAlsoAsJson ?? false,
    deleteOutdatedCache: input.deleteOutdatedCache ?? true,
    cacheFolderPath: input.cacheFolderPath ?? "",
    configFolderPath: input.configFolderPath ?? "",
    duplicateMinimalHashCacheSizeKiB: input.duplicateMinimalHashCacheSizeKiB ?? 256,
    duplicateMinimalPrehashCacheSizeKiB: input.duplicateMinimalPrehashCacheSizeKiB ?? 256,
    threadCount: input.threadCount ?? 0,
  }
  for (const option of KISAKI_TOOL_OPTIONS) if (input[option.id] !== undefined) values[option.id] = typeof option.defaultValue === "number" ? String(input[option.id]) : input[option.id]
  return values
}

export function kisakiScanPresetFromValues(name: string, values: Record<string, unknown>, options: { id?: string; presets?: KisakiScanPreset[]; now?: number; createId?: () => string } = {}) {
  return saveKisakiScanPreset(options.presets ?? [], { ...options, name, input: createKisakiScanInput(normalizeTool(values.tool), values) })
}

function canonicalScanInput(input: KisakiInput): KisakiInput {
  const blocked = new Set(["selectedPaths", "destinationDirectory", "destinationItems", "renameItems", "deleteMode", "copyMode", "preserveStructure", "conflictPolicy", "outputPath", "outputFormat", "exportScope", "exportEntries", "dryRun"])
  const { similarVideosCropDetect: _legacyCropDetect, ...current } = input
  const similarVideoCrop = resolveKisakiSimilarVideoCrop(input)
  return Object.fromEntries(Object.entries({ ...current, action: "scan", tool: normalizeTool(input.tool), similarVideosLetterboxCrop: similarVideoCrop.letterboxCrop }).filter(([key, value]) => !blocked.has(key) && value !== undefined)) as KisakiInput
}

function validatePreset(value: unknown): KisakiScanPreset {
  if (!value || typeof value !== "object") throw new Error("Invalid Kisaki preset.")
  const preset = value as Partial<KisakiScanPreset>
  if (preset.version !== 1 || typeof preset.id !== "string" || !preset.id.trim() || typeof preset.name !== "string" || !preset.name.trim() || typeof preset.createdAt !== "number" || typeof preset.updatedAt !== "number" || !preset.input || typeof preset.input !== "object") throw new Error("Invalid Kisaki preset.")
  return { version: 1, id: preset.id.trim(), name: preset.name.trim(), tool: normalizeTool(preset.tool), input: canonicalScanInput(preset.input), createdAt: preset.createdAt, updatedAt: preset.updatedAt }
}

function normalizeTool(value: unknown): KisakiTool { return KISAKI_TOOLS.includes(value as KisakiTool) ? value as KisakiTool : "duplicate-files" }
function createPresetId(): string { return globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }
