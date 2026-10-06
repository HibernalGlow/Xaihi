import type { InteractionFieldKind } from "../interaction.js"

export type TerminalIconStyle = "unicode" | "nerd"
const unicode = { action: "▶", boolean: "◆", danger: "⚠", field: "•", logs: "≡", number: "∷", path: "▣", result: "✓", section: "▤", select: "◉", settings: "☷", status: "●", text: "✎" } as const
const nerd: Partial<Record<keyof typeof unicode, string>> = { action: "󰐊", danger: "󰀪", logs: "󰆍", path: "󰉋", result: "󰄬", settings: "󰒓", status: "󰋼" }
export type TerminalSemanticIcon = keyof typeof unicode

export function terminalIcon(name: TerminalSemanticIcon, style: TerminalIconStyle = "unicode"): string {
  return style === "nerd" ? nerd[name] ?? unicode[name] : unicode[name]
}

export function fieldIcon(kind: InteractionFieldKind, role?: "action"): string {
  if (role === "action") return unicode.action
  if (kind === "number") return unicode.number
  if (kind === "text" || kind === "multiline") return unicode.text
  if (kind === "path-list") return unicode.path
  if (kind === "select") return unicode.select
  if (kind === "boolean") return unicode.boolean
  return unicode.field
}
