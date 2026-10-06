import type { CliHost } from "./index.js"

export type InteractionMode = "ui" | "gd"
export type CliInvocationMode = InteractionMode | "pipe"
export type CliDefaultMode = CliInvocationMode
export type TerminalRenderer = "opentui"
export type InteractionValue = string | number | boolean
export type InteractionValues = Record<string, InteractionValue>
export type InteractionFieldKind = "text" | "multiline" | "path-list" | "number" | "select" | "boolean"

export interface InteractionOption<Value extends InteractionValue = InteractionValue> {
  value: Value
  label: string
  hint?: string
  disabled?: boolean
}

export interface InteractionField {
  id: string
  label: string
  description?: string
  kind: InteractionFieldKind
  /** Renderer-neutral hint for a primary workflow/action selector. */
  role?: "action"
  options?: readonly InteractionOption[]
  placeholder?: string
  /** Preferred editor height for multiline and path-list fields. */
  lines?: number
  min?: number
  max?: number
  step?: number
  visibleWhen?: (values: Readonly<InteractionValues>) => boolean
  validate?: (value: InteractionValue, values: Readonly<InteractionValues>) => string | null
}

export interface TerminalViewSection {
  id: string
  title: string
  description?: string
  fieldIds: readonly string[]
}

export interface TerminalViewMetric {
  label: string
  value: string
}

export interface TerminalViewDisplay {
  primary: string
  secondary?: string
  metrics?: readonly TerminalViewMetric[]
  table?: TerminalViewTable
}

export interface TerminalViewTableColumn {
  id: string
  label: string
  width?: number
}

export interface TerminalViewTable {
  columns: readonly TerminalViewTableColumn[]
  rows: readonly Readonly<Record<string, string>>[]
  emptyMessage?: string
}

/**
 * Renderer-neutral content grouping owned by the independently distributed
 * node. It intentionally contains no positions, widths, widgets, or input API.
 */
export interface TerminalInteractionView {
  sections: readonly TerminalViewSection[]
  dashboard: {
    title: string
    description?: string
    display: (values: Readonly<InteractionValues>) => TerminalViewDisplay
  }
}

export interface TerminalInteractionSchema<Input, Result> {
  id: string
  title: string
  description: string
  initialValues: InteractionValues
  fields: readonly InteractionField[]
  view?: TerminalInteractionView
  toInput: (values: Readonly<InteractionValues>) => Input
  validate?: (values: Readonly<InteractionValues>, input: Input) => string | null
  preview: (input: Input) => readonly string[]
  isDangerous: (input: Input) => boolean
  dangerPrompt?: (input: Input) => {
    title: string
    body: string
    confirmLabel: string
  }
  result: (result: Result) => {
    success: boolean
    message: string
    lines?: readonly string[]
    table?: TerminalViewTable
  }
}

export interface TerminalInteractionEvent {
  type: string
  progress?: number
  message: string
}

export interface TerminalInteractionDefinition<Input, Result> {
  schema: TerminalInteractionSchema<Input, Result>
  run: (input: Input, onEvent: (event: TerminalInteractionEvent) => void) => Promise<Result>
  cancel?: () => void | Promise<void>
  pause?: () => void | Promise<void>
  resume?: () => void | Promise<void>
}

export interface TerminalRendererResolution {
  renderer?: TerminalRenderer
  args: string[]
  error?: string
}

export interface TerminalUiFlagDefaults {
  renderer?: TerminalRenderer
  language?: "en" | "zh"
  theme?: string
}

export interface TerminalUiFlagResolution extends TerminalRendererResolution {
  language?: "en" | "zh"
  theme?: string
}

export interface CliInteractionPreferencesSource {
  cli?: {
    default_mode?: CliDefaultMode
    renderer?: TerminalRenderer
    language?: "en" | "zh"
    theme?: string
  }
}

export interface CliInteractionPreferences {
  mode: CliDefaultMode
  renderer: TerminalRenderer
  language?: "en" | "zh"
  theme: string
}

/**
 * Routes an invocation without ever accidentally rendering an interactive UI
 * into a pipeline. `guided` is retained as the legacy spelling of `gd`.
 */
export function resolveCliInvocation(args: readonly string[], host: CliHost, defaultMode: CliDefaultMode = "ui"): CliInvocationMode {
  const first = args[0]?.toLowerCase()
  if (first === "ui") return "ui"
  if (first === "gd" || first === "guided") return "gd"
  if (args.length > 0) return "pipe"
  return host.stdin.isTTY && host.stdout.isTTY ? defaultMode : "pipe"
}

export function requireInteractiveMode(host: CliHost, mode: InteractionMode): string | null {
  return host.stdin.isTTY && host.stdout.isTTY ? null : `\`${mode}\` mode requires an interactive terminal. Use a subcommand with --json for scripted use.`
}

/** Extracts the renderer flag without exposing it to node-specific schemas. */
export function resolveTerminalRenderer(args: readonly string[], defaultRenderer: TerminalRenderer = "opentui"): TerminalRendererResolution {
  let renderer: string = defaultRenderer
  const remaining: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (arg === "--renderer") {
      const value = args[index + 1]
      if (!value) return { args: remaining, error: "--renderer requires opentui." }
      renderer = value.toLowerCase()
      index += 1
      continue
    }
    if (arg.startsWith("--renderer=")) {
      renderer = arg.slice("--renderer=".length).toLowerCase()
      continue
    }
    remaining.push(arg)
  }

  if (renderer !== "opentui") {
    return { args: remaining, error: `Unknown terminal renderer: ${renderer}. Use opentui.` }
  }
  return { renderer, args: remaining }
}

export function resolveTerminalUiFlags(
  args: readonly string[],
  defaults: TerminalUiFlagDefaults = {},
): TerminalUiFlagResolution {
  let renderer: string = defaults.renderer ?? "opentui"
  let language: string | undefined = defaults.language
  let theme = defaults.theme
  const remaining: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    const [name, inlineValue] = arg.split("=", 2)
    if (name !== "--renderer" && name !== "--lang" && name !== "--theme") {
      remaining.push(arg)
      continue
    }
    const value = inlineValue || args[index + 1]
    if (!value) return { args: remaining, error: `${name} requires a value.` }
    if (!inlineValue) index += 1
    if (name === "--renderer") renderer = value.toLowerCase()
    if (name === "--lang") language = value.toLowerCase().startsWith("zh") ? "zh" : value.toLowerCase().startsWith("en") ? "en" : value
    if (name === "--theme") theme = value.toLowerCase()
  }

  if (renderer !== "opentui") {
    return { args: remaining, error: `Unknown terminal renderer: ${renderer}. Use opentui.` }
  }
  if (language !== undefined && language !== "en" && language !== "zh") {
    return { args: remaining, error: `Unknown terminal language: ${language}. Use en or zh.` }
  }
  return { renderer, language, theme, args: remaining }
}

export function resolveInteractionPreferences(source: CliInteractionPreferencesSource | undefined): CliInteractionPreferences {
  const configuredTheme = source?.cli?.theme?.trim().toLowerCase()
  return {
    mode: source?.cli?.default_mode ?? "ui",
    renderer: source?.cli?.renderer ?? "opentui",
    language: source?.cli?.language,
    theme: configuredTheme || "nord",
  }
}
