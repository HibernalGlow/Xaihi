import type { KisakiEntry, KisakiGroup } from "./core.js"

export type KisakiSelectionApplyMode = "replace" | "add" | "remove" | "intersect"
export type KisakiGroupSelectionMode = "all-except-one" | "select-one" | "all-except-one-per-folder" | "all-except-one-matching-set"
export type KisakiSelectionSortField = "folderPath" | "fileName" | "fileSize" | "creationDate" | "modifiedDate" | "resolution" | "disk" | "fileType" | "hash" | "hardLinks"
export type KisakiSelectionMatchCondition = "none" | "contains" | "not-contains" | "starts-with" | "ends-with" | "equals"
export type KisakiSelectionTextColumn = "folderPath" | "fileName" | "fullPath"
export type KisakiDirectorySelectionMode = "keep-one-per-directory" | "select-all-in-directory" | "exclude-directory"

export interface KisakiSelectionSortCriterion {
  id: string
  field: KisakiSelectionSortField
  direction: "asc" | "desc"
  preferEmpty: boolean
  enabled: boolean
  filterCondition: KisakiSelectionMatchCondition
  filterValue: string
}

export interface KisakiGroupSelectionConfig {
  mode: KisakiGroupSelectionMode
  sortCriteria: KisakiSelectionSortCriterion[]
}

export interface KisakiTextSelectionConfig {
  column: KisakiSelectionTextColumn
  condition: Exclude<KisakiSelectionMatchCondition, "none">
  pattern: string
  useRegex: boolean
  caseSensitive: boolean
  matchWholeColumn: boolean
}

export interface KisakiDirectorySelectionConfig {
  mode: KisakiDirectorySelectionMode
  directories: string[]
}

export interface KisakiSelectionAssistantConfig {
  applyMode: KisakiSelectionApplyMode
  group: KisakiGroupSelectionConfig
  text: KisakiTextSelectionConfig
  directory: KisakiDirectorySelectionConfig
}

export interface KisakiSelectionResult {
  paths: string[]
  matchedPaths: string[]
  affectedCount: number
  error?: string
  errorCode?: "directory-required"
}

export interface KisakiSelectionStats {
  selectedCount: number
  selectedBytes: number
  reclaimableBytes: number
}

export interface KisakiSelectionHistory {
  past: string[][]
  present: string[]
  future: string[][]
  limit: number
}

export function createDefaultKisakiSelectionAssistantConfig(): KisakiSelectionAssistantConfig {
  return {
    applyMode: "replace",
    group: { mode: "all-except-one", sortCriteria: [{ id: "modified", field: "modifiedDate", direction: "desc", preferEmpty: false, enabled: true, filterCondition: "none", filterValue: "" }] },
    text: { column: "fullPath", condition: "contains", pattern: "", useRegex: false, caseSensitive: false, matchWholeColumn: false },
    directory: { mode: "keep-one-per-directory", directories: [] },
  }
}

export function applyKisakiGroupSelection(groups: KisakiGroup[], current: Iterable<string>, config: KisakiGroupSelectionConfig, mode: KisakiSelectionApplyMode): KisakiSelectionResult {
  const matched = new Set<string>()
  for (const group of groups) for (const path of groupCandidates(group, config)) matched.add(path)
  return selectionResult(current, matched, mode)
}

export function applyKisakiTextSelection(groups: KisakiGroup[], current: Iterable<string>, config: KisakiTextSelectionConfig, mode: KisakiSelectionApplyMode): KisakiSelectionResult {
  const matcher = createMatcher(config.pattern, config.caseSensitive, config.useRegex, config.matchWholeColumn ? "equals" : config.condition)
  if (matcher.error) return { paths: [...current], matchedPaths: [], affectedCount: 0, error: matcher.error }
  const matched = new Set<string>()
  for (const entry of selectableEntries(groups)) if (matcher.match(textColumn(entry.path, config.column))) matched.add(entry.path)
  return selectionResult(current, matched, mode)
}

export function applyKisakiDirectorySelection(groups: KisakiGroup[], current: Iterable<string>, config: KisakiDirectorySelectionConfig, mode: KisakiSelectionApplyMode): KisakiSelectionResult {
  if (config.mode !== "keep-one-per-directory" && config.directories.length === 0) return { paths: [...current], matchedPaths: [], affectedCount: 0, error: "At least one directory is required.", errorCode: "directory-required" }
  const matched = new Set<string>()
  if (config.mode === "keep-one-per-directory") {
    for (const group of groups) {
      const byDirectory = new Map<string, KisakiEntry[]>()
      for (const entry of group.entries) { if (entry.isReference) continue; const directory = dirname(entry.path); const items = byDirectory.get(directory) ?? []; items.push(entry); byDirectory.set(directory, items) }
      for (const entries of byDirectory.values()) for (const entry of entries.slice(1)) matched.add(entry.path)
    }
  } else {
    for (const entry of selectableEntries(groups)) if (config.directories.some((directory) => isInDirectory(entry.path, directory))) matched.add(entry.path)
  }
  return selectionResult(current, matched, mode)
}

export function applyKisakiSelectionMode(current: Iterable<string>, matched: Iterable<string>, mode: KisakiSelectionApplyMode): string[] {
  const before = new Set(current)
  const candidates = new Set(matched)
  if (mode === "replace") return [...candidates]
  if (mode === "add") return [...new Set([...before, ...candidates])]
  if (mode === "remove") return [...before].filter((path) => !candidates.has(path))
  return [...before].filter((path) => candidates.has(path))
}

export function invertKisakiSelection(groups: KisakiGroup[], current: Iterable<string>): string[] { const selected = new Set(current); return selectableEntries(groups).filter((entry) => !selected.has(entry.path)).map((entry) => entry.path) }
export function selectAllKisakiEntries(groups: KisakiGroup[]): string[] { return selectableEntries(groups).map((entry) => entry.path) }

export function calculateKisakiSelectionStats(groups: KisakiGroup[], selectedPaths: Iterable<string>): KisakiSelectionStats {
  const selected = new Set(selectedPaths)
  let selectedCount = 0, selectedBytes = 0, reclaimableBytes = 0
  for (const group of groups) {
    const selectedEntries = group.entries.filter((entry) => !entry.isReference && selected.has(entry.path))
    selectedCount += selectedEntries.length
    selectedBytes += selectedEntries.reduce((sum, entry) => sum + entry.size, 0)
    reclaimableBytes += Math.min(group.reclaimableBytes, selectedEntries.reduce((sum, entry) => sum + entry.size, 0))
  }
  return { selectedCount, selectedBytes, reclaimableBytes }
}

export function createKisakiSelectionHistory(initial: Iterable<string> = [], limit = 50): KisakiSelectionHistory { return { past: [], present: unique(initial), future: [], limit } }
export function pushKisakiSelectionHistory(history: KisakiSelectionHistory, paths: Iterable<string>): KisakiSelectionHistory { const next = unique(paths); if (samePaths(history.present, next)) return history; return { ...history, past: [...history.past, history.present].slice(-history.limit), present: next, future: [] } }
export function undoKisakiSelectionHistory(history: KisakiSelectionHistory): KisakiSelectionHistory { const previous = history.past.at(-1); return previous ? { ...history, past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future].slice(0, history.limit) } : history }
export function redoKisakiSelectionHistory(history: KisakiSelectionHistory): KisakiSelectionHistory { const next = history.future[0]; return next ? { ...history, past: [...history.past, history.present].slice(-history.limit), present: next, future: history.future.slice(1) } : history }

export function serializeKisakiSelectionAssistantConfig(config: KisakiSelectionAssistantConfig): string { return JSON.stringify({ version: 1, config }, null, 2) }
export function parseKisakiSelectionAssistantConfig(text: string): KisakiSelectionAssistantConfig {
  const parsed = JSON.parse(text) as { version?: unknown; config?: unknown }
  if (parsed.version !== 1 || !parsed.config || typeof parsed.config !== "object") throw new Error("Unsupported Kisaki selection assistant document.")
  const value = parsed.config as Partial<KisakiSelectionAssistantConfig>
  const defaults = createDefaultKisakiSelectionAssistantConfig()
  return { ...defaults, ...value, group: { ...defaults.group, ...value.group, sortCriteria: value.group?.sortCriteria?.map(normalizeCriterion) ?? defaults.group.sortCriteria }, text: { ...defaults.text, ...value.text }, directory: { ...defaults.directory, ...value.directory, directories: unique(value.directory?.directories ?? []) } }
}

function groupCandidates(group: KisakiGroup, config: KisakiGroupSelectionConfig): string[] {
  const entries = sortEntries(group.entries.filter((entry) => !entry.isReference), config.sortCriteria)
  if (config.mode === "select-one") return entries[0] ? [entries[0].path] : []
  if (config.mode === "all-except-one") return entries.slice(1).map((entry) => entry.path)
  if (config.mode === "all-except-one-per-folder") {
    const byFolder = new Map<string, KisakiEntry[]>()
    for (const entry of entries) { const folder = dirname(entry.path); const items = byFolder.get(folder) ?? []; items.push(entry); byFolder.set(folder, items) }
    return [...byFolder.values()].flatMap((items) => items.slice(1).map((entry) => entry.path))
  }
  const criterion = config.sortCriteria.find((item) => item.enabled)
  if (!criterion) return entries.slice(1).map((entry) => entry.path)
  const sets = new Map<string, KisakiEntry[]>()
  for (const entry of entries) { const key = String(fieldValue(entry, criterion.field) ?? "__empty__"); const items = sets.get(key) ?? []; items.push(entry); sets.set(key, items) }
  return [...sets.values()].slice(1).flatMap((items) => items.map((entry) => entry.path))
}

function sortEntries(entries: KisakiEntry[], criteria: KisakiSelectionSortCriterion[]): KisakiEntry[] {
  const enabled = criteria.filter((criterion) => criterion.enabled)
  let filtered = [...entries]
  for (const criterion of enabled) if (criterion.filterCondition !== "none" && criterion.filterValue) filtered = filtered.filter((entry) => createMatcher(criterion.filterValue, false, false, criterion.filterCondition).match(String(fieldValue(entry, criterion.field) ?? "")))
  return filtered.sort((left, right) => { for (const criterion of enabled) { const compared = compareValues(fieldValue(left, criterion.field), fieldValue(right, criterion.field), criterion); if (compared !== 0) return compared } return left.path.localeCompare(right.path, undefined, { numeric: true }) })
}

function fieldValue(entry: KisakiEntry, field: KisakiSelectionSortField): string | number | undefined {
  if (field === "folderPath") return dirname(entry.path)
  if (field === "fileName") return entry.name
  if (field === "fileSize") return entry.size
  if (field === "creationDate" || field === "modifiedDate") return entry.modifiedDate
  if (field === "resolution") return entry.width && entry.height ? entry.width * entry.height : undefined
  if (field === "disk") return /^[A-Za-z]:/.test(entry.path) ? entry.path.slice(0, 2).toUpperCase() : `/${entry.path.replace(/\\/g, "/").split("/").filter(Boolean)[0] ?? ""}`
  if (field === "fileType") return extension(entry.name)
  if (field === "hash") return entry.hash
  return undefined
}

function compareValues(left: string | number | undefined, right: string | number | undefined, criterion: KisakiSelectionSortCriterion): number {
  const leftEmpty = left === undefined || left === "", rightEmpty = right === undefined || right === ""
  if (leftEmpty !== rightEmpty) return (criterion.preferEmpty ? leftEmpty : !leftEmpty) ? -1 : 1
  const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true })
  return criterion.direction === "desc" ? -compared : compared
}

function selectionResult(current: Iterable<string>, matched: Set<string>, mode: KisakiSelectionApplyMode): KisakiSelectionResult { const before = unique(current), paths = applyKisakiSelectionMode(before, matched, mode); return { paths, matchedPaths: [...matched], affectedCount: symmetricDifference(before, paths) } }
function createMatcher(pattern: string, caseSensitive: boolean, regex: boolean, condition: KisakiSelectionMatchCondition): { match: (value: string) => boolean; error?: string } { if (!pattern) return { match: () => false }; if (regex) { try { const expression = new RegExp(pattern, caseSensitive ? "" : "i"); return { match: (value) => expression.test(value) } } catch (error) { return { match: () => false, error: error instanceof Error ? error.message : String(error) } } } const needle = caseSensitive ? pattern : pattern.toLocaleLowerCase(); return { match: (value) => { const candidate = caseSensitive ? value : value.toLocaleLowerCase(); if (condition === "contains") return candidate.includes(needle); if (condition === "not-contains") return !candidate.includes(needle); if (condition === "starts-with") return candidate.startsWith(needle); if (condition === "ends-with") return candidate.endsWith(needle); if (condition === "equals") return candidate === needle; return true } } }
function normalizeCriterion(value: Partial<KisakiSelectionSortCriterion>, index: number): KisakiSelectionSortCriterion { return { id: value.id ?? `criterion-${index}`, field: value.field ?? "modifiedDate", direction: value.direction ?? "desc", preferEmpty: value.preferEmpty ?? false, enabled: value.enabled ?? true, filterCondition: value.filterCondition ?? "none", filterValue: value.filterValue ?? "" } }
function selectableEntries(groups: KisakiGroup[]): KisakiEntry[] { return groups.flatMap((group) => group.entries.filter((entry) => !entry.isReference)) }
function textColumn(path: string, column: KisakiSelectionTextColumn): string { if (column === "fullPath") return path; if (column === "fileName") return path.replace(/\\/g, "/").split("/").at(-1) ?? path; return dirname(path) }
function dirname(path: string): string { const normalized = path.replace(/\\/g, "/"); const index = normalized.lastIndexOf("/"); return index > 0 ? normalized.slice(0, index) : "" }
function isInDirectory(path: string, directory: string): boolean { const normalizedPath = path.replace(/\\/g, "/").toLocaleLowerCase(); const normalizedDirectory = directory.replace(/\\/g, "/").replace(/\/$/, "").toLocaleLowerCase(); return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`) }
function extension(name: string): string { const index = name.lastIndexOf("."); return index > 0 ? name.slice(index + 1).toLocaleLowerCase() : "" }
function unique(values: Iterable<string>): string[] { return [...new Set(values)] }
function symmetricDifference(left: string[], right: string[]): number { const a = new Set(left), b = new Set(right); return left.filter((path) => !b.has(path)).length + right.filter((path) => !a.has(path)).length }
function samePaths(left: string[], right: string[]): boolean { return left.length === right.length && left.every((path, index) => path === right[index]) }
