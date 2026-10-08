import type { KisakiAction, KisakiTool } from "./core.js"

export type KisakiActivityKind = "scan" | "progress" | "operation" | "system"
export type KisakiActivityLevel = "info" | "success" | "warning" | "error"

export interface KisakiActivityLogEntry {
  id: string
  timestamp: number
  tool: KisakiTool
  kind: KisakiActivityKind
  level: KisakiActivityLevel
  message: string
  progress?: number
  action?: KisakiAction
  affectedCount?: number
  errorCount?: number
}

export type KisakiActivityLogInput = Omit<KisakiActivityLogEntry, "id" | "timestamp"> & { timestamp?: number }

export function appendKisakiActivityLog(entries: KisakiActivityLogEntry[], input: KisakiActivityLogInput, limit = 200): KisakiActivityLogEntry[] {
  const timestamp = input.timestamp ?? Date.now()
  const entry = { ...input, timestamp, id: `${timestamp}-${entries.length}-${input.kind}` }
  return [...entries, entry].slice(-Math.max(1, limit))
}

export function filterKisakiActivityLog(entries: KisakiActivityLogEntry[], query: string): KisakiActivityLogEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return entries
  return entries.filter((entry) => [entry.tool, entry.kind, entry.level, entry.action, entry.message].some((value) => String(value ?? "").toLocaleLowerCase().includes(needle)))
}

export function formatKisakiActivityMessage(level: KisakiActivityLevel, message: string, progress?: number): string {
  const marker = ({ info: "·", success: "✓", warning: "!", error: "×" } as const)[level]
  const percentage = progress === undefined ? "" : ` [${Math.round(progress)}%]`
  return `${marker}${percentage} ${message}`
}

export function formatKisakiActivityLogEntry(entry: KisakiActivityLogEntry): string {
  const time = new Date(entry.timestamp).toISOString()
  const result = entry.affectedCount === undefined ? "" : ` · ${entry.affectedCount} affected / ${entry.errorCount ?? 0} errors`
  return `${time} · ${entry.tool} · ${entry.kind} · ${formatKisakiActivityMessage(entry.level, entry.message, entry.progress)}${result}`
}

export function serializeKisakiActivityLog(entries: KisakiActivityLogEntry[]): string {
  return entries.map(formatKisakiActivityLogEntry).join("\n")
}
