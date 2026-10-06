import { confirm as clackConfirm, isCancel as isClackCancel, select as clackSelect, text as clackText } from "@clack/prompts"
import boxen from "boxen"
import { Chalk } from "chalk"
import stringWidth from "string-width"
import type { Readable, Writable } from "node:stream"
import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionDefinition,
} from "./interaction.js"
import { createTerminalTranslator, type TerminalLanguage } from "./i18n.js"
export { defineCommand, runMain } from "citty"

export interface CliHost {
  cwd: string
  env: Record<string, string | undefined>
  stdin: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }
  stdout: { columns?: number; isTTY?: boolean; write: (chunk: string) => unknown }
  stderr: { columns?: number; isTTY?: boolean; write: (chunk: string) => unknown }
}

export interface CliCommand {
  name: string
  description: string
  run: (args: string[], host: CliHost) => Promise<void> | void
}

export interface SelectRichOption<Value extends string | number | boolean> {
  value: Value
  label?: string
  hint?: string
  disabled?: boolean
}

export interface CliEventLike {
  type: string
  progress?: number
  message: string
}

export interface CliEventRenderOptions {
  label?: string
  progressWidth?: number
}

export const NODE_CLI_PREFIX = "x"
export const LEGACY_NODE_CLI_PREFIX = "xiranite-"

export function nodeCliName(nodeId: string): string {
  return `${NODE_CLI_PREFIX}${nodeId}`
}

export function normalizeNodeCliName(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith(LEGACY_NODE_CLI_PREFIX)) return normalized.slice(LEGACY_NODE_CLI_PREFIX.length)
  if (NODE_CLI_PREFIX && normalized.startsWith(NODE_CLI_PREFIX) && normalized.length > NODE_CLI_PREFIX.length) {
    return normalized.slice(NODE_CLI_PREFIX.length)
  }
  return normalized
}

export class CliUsageError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "CliUsageError"
  }
}

export class CliPromptExitError extends Error {
  constructor(message = "Prompt cancelled.") {
    super(message)
    this.name = "CliPromptExitError"
  }
}

export function createCliHost(): CliHost {
  return {
    cwd: process.cwd(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  }
}

export function writeJson(host: CliHost, value: unknown): void {
  host.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function writeLine(host: CliHost, message = ""): void {
  host.stdout.write(`${message}\n`)
}

export function writeError(host: CliHost, message: string): void {
  host.stderr.write(`${message}\n`)
}

export function canRunInteractiveCli(host: CliHost = createCliHost()): boolean {
  return Boolean(host.stdin.isTTY && host.stdout.isTTY)
}

/**
 * Detect whether stdin is piped (not a TTY).
 * Use this to decide if stdin input should be read automatically.
 */
export function hasPipedInput(stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): boolean {
  return !stream.isTTY
}

/**
 * Read all non-empty lines from a readable stream (defaults to process.stdin).
 * Returns an empty array when stdin is a TTY (no piped input), so it is safe
 * to call unconditionally without blocking on interactive terminals.
 */
export async function readStdinLines(stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): Promise<string[]> {
  if (stream.isTTY) return []
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

/**
 * Read all text from a readable stream (defaults to process.stdin).
 * Returns an empty string when stdin is a TTY (no piped input).
 * Use this for nodes that need raw text (JSON, Markdown, TOML) rather than line-based paths.
 */
export async function readStdinText(stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): Promise<string> {
  if (stream.isTTY) return ""
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

export type RichColor = "blue" | "cyan" | "green" | "grey" | "magenta" | "red" | "white" | "yellow"
export type RichStyle = RichColor | "bold" | "dim" | "inverse"

export function rich(host: CliHost, text: string, ...styles: RichStyle[]): string {
  if (styles.length === 0) return text
  return styles.reduce((value, style) => applyRichStyle(host, value, style), text)
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "")
}

export function visibleWidth(text: string): number {
  return stringWidth(stripAnsi(text))
}

export function padVisibleEnd(text: string, targetWidth: number): string {
  return `${text}${" ".repeat(Math.max(0, targetWidth - visibleWidth(text)))}`
}

export function terminalColumns(host: CliHost, fallback = 80): number {
  const fromStdout = Number(host.stdout.columns)
  if (Number.isFinite(fromStdout) && fromStdout > 0) return Math.floor(fromStdout)

  const fromXiraniteEnv = Number(host.env.XIRANITE_CLI_COLUMNS)
  if (Number.isFinite(fromXiraniteEnv) && fromXiraniteEnv > 0) return Math.floor(fromXiraniteEnv)

  const fromEnv = Number(host.env.COLUMNS)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)

  return fallback
}

export function renderRichLabel(host: CliHost, label: string, color: RichColor = "blue"): string {
  return boxen(rich(host, label, color), {
    borderColor: boxenColor(color),
    borderStyle: "round",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  })
}

export function renderRichPanel(
  host: CliHost,
  title: string,
  lines: string[] | string,
  options: { color?: RichColor; maxWidth?: number; minWidth?: number } = {},
): string {
  const color = options.color ?? "blue"
  const content = Array.isArray(lines) ? lines : lines.split(/\r?\n/)
  const minWidth = options.minWidth ?? 0
  const maxWidth = Math.max(24, options.maxWidth ?? terminalColumns(host) - 2)
  const requestedContentWidth = Math.max(minWidth, ...content.map((line) => visibleWidth(line)))
  const width = Math.min(maxWidth, requestedContentWidth + 4)
  const innerWidth = Math.max(1, width - 4)
  const displayLines = content.map((line) => truncateVisible(line, innerWidth))
  return boxen(displayLines.join("\n"), {
    borderColor: boxenColor(color),
    borderStyle: "round",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    title,
    width,
  })
}

export function writeRichPanel(host: CliHost, title: string, lines: string[] | string, options: { color?: RichColor; maxWidth?: number; minWidth?: number } = {}): void {
  writeLine(host, renderRichPanel(host, title, lines, options))
}

export function renderProgressBar(
  host: CliHost,
  progress: number,
  message: string,
  options: { width?: number; label?: string } = {},
): string {
  const value = Math.max(0, Math.min(100, Math.round(progress)))
  const columns = terminalColumns(host)
  const label = options.label ? `${rich(host, options.label, "blue", "bold")} ` : ""
  const percent = rich(host, `${value.toString().padStart(3)}%`, "yellow")
  let width = options.width ?? 32
  if (!options.width) {
    const fixedWidth = visibleWidth(label) + width + 1 + visibleWidth(percent) + 1
    const messageBudget = columns - fixedWidth
    if (messageBudget < 18) width = Math.max(8, width - (18 - messageBudget))
  }
  const filled = Math.round((value / 100) * width)
  const empty = Math.max(0, width - filled)
  const bar = `${rich(host, "━".repeat(filled), "cyan")}${rich(host, "─".repeat(empty), "grey")}`
  const prefix = `${label}${bar} ${percent} `
  return `${prefix}${truncateVisible(message, Math.max(0, columns - visibleWidth(prefix)))}`
}

export function renderCliEvent(host: CliHost, event: CliEventLike, options: CliEventRenderOptions = {}): string {
  if (event.type === "progress") {
    return renderProgressBar(host, event.progress ?? 0, event.message, {
      label: options.label,
      width: options.progressWidth,
    })
  }
  return truncateVisible(event.message, terminalColumns(host))
}

export function writeCliEvent(host: CliHost, event: CliEventLike, options: CliEventRenderOptions = {}): void {
  writeLine(host, renderCliEvent(host, event, options))
}

export async function promptRich(host: CliHost, prompt: string, defaultValue = ""): Promise<string> {
  try {
    const answer = await clackText({
      message: prompt,
      defaultValue: defaultValue || undefined,
      ...clackContext(host),
    })
    if (isClackCancel(answer)) throw new CliPromptExitError()
    return answer.trim() || defaultValue
  } catch (error) {
    if (isPromptExitError(error)) throw new CliPromptExitError()
    throw error
  }
}

export async function confirmRich(host: CliHost, prompt: string, defaultValue = false): Promise<boolean> {
  try {
    const answer = await clackConfirm({
      message: prompt,
      initialValue: defaultValue,
      active: "是",
      inactive: "否",
      ...clackContext(host),
    })
    if (isClackCancel(answer)) throw new CliPromptExitError()
    return answer
  } catch (error) {
    if (isPromptExitError(error)) throw new CliPromptExitError()
    throw error
  }
}

export async function selectRich<Value extends string | number | boolean>(
  host: CliHost,
  prompt: string,
  options: SelectRichOption<Value>[],
  config: { initialValue?: Value; maxItems?: number } = {},
): Promise<Value> {
  try {
    type ClackSelectOptions = Parameters<typeof clackSelect<Value>>[0]
    const answer = await clackSelect<Value>({
      message: prompt,
      options: options as ClackSelectOptions["options"],
      initialValue: config.initialValue,
      maxItems: config.maxItems,
      ...clackContext(host),
    })
    if (isClackCancel(answer)) throw new CliPromptExitError()
    return answer
  } catch (error) {
    if (isPromptExitError(error)) throw new CliPromptExitError()
    throw error
  }
}

export async function runGuidedInteraction<Input, Result>(
  definition: TerminalInteractionDefinition<Input, Result>,
  options: { host: CliHost; language: TerminalLanguage; help?: import("@xiranite/contract").NodeHelp },
): Promise<void> {
  const { host, language } = options
  const { schema } = definition
  const t = createTerminalTranslator(language)
  const values: InteractionValues = { ...schema.initialValues }

  try {
    if (options.help) {
      const { formatTerminalNodeHelp } = await import("./help.js")
      writeRichPanel(host, language === "zh" ? "帮助" : "Help", formatTerminalNodeHelp(options.help, language), { color: "cyan", minWidth: 48 })
    }
    writeRichPanel(host, schema.title, schema.description, { color: "blue", minWidth: 48 })
    let fieldIndex = 0
    while (true) {
      const fields = schema.fields.filter((field) => field.visibleWhen?.(values) ?? true)
      if (fieldIndex >= fields.length) break
      const field = fields[fieldIndex]
      if (!field) break
      const value = await promptGuidedField(host, field, values, t)
      values[field.id] = value
      fieldIndex += 1
    }

    const input = schema.toInput(values)
    const formError = schema.validate?.(values, input) ?? null
    if (formError) {
      writeError(host, formError)
      process.exitCode = 2
      return
    }

    writeRichPanel(host, t("preview"), [...schema.preview(input)], {
      color: schema.isDangerous(input) ? "red" : "cyan",
      minWidth: 48,
    })
    const dangerPrompt = schema.isDangerous(input) ? schema.dangerPrompt?.(input) : undefined
    if (schema.isDangerous(input)) writeLine(host, rich(host, dangerPrompt?.body ?? t("hazardNotice"), "red", "bold"))
    const confirmed = await confirmRich(host, dangerPrompt?.confirmLabel ?? (schema.isDangerous(input) ? t("runReal") : t("confirm")), !schema.isDangerous(input))
    if (!confirmed) {
      writeLine(host, rich(host, t("cancel"), "yellow"))
      return
    }

    const result = await definition.run(input, (event) => {
      if (event.type === "progress") {
        writeLine(host, renderProgressBar(host, event.progress ?? 0, event.message, { label: schema.id }))
      } else if (event.message.trim()) {
        writeLine(host, rich(host, event.message, "grey"))
      }
    })
    const summary = schema.result(result)
    writeLine(host, rich(host, summary.message, summary.success ? "green" : "red", "bold"))
    if (summary.lines?.length) {
      writeRichPanel(host, schema.title, [...summary.lines], { color: summary.success ? "green" : "red", minWidth: 48 })
    }
    if (!summary.success) process.exitCode = 1
  } catch (error) {
    if (error instanceof CliPromptExitError) {
      writeLine(host, rich(host, t("cancel"), "yellow"))
      return
    }
    throw error
  }
}

async function promptGuidedField(
  host: CliHost,
  field: InteractionField,
  values: InteractionValues,
  t: ReturnType<typeof createTerminalTranslator>,
): Promise<InteractionValue> {
  if (field.kind === "select" || field.kind === "boolean") {
    const fieldOptions = field.kind === "boolean"
      ? [{ value: true, label: t("yes") }, { value: false, label: t("no") }]
      : [...(field.options ?? [])]
    return selectRich(host, field.label, fieldOptions, { initialValue: values[field.id] })
  }

  if (field.kind === "path-list") {
    while (true) {
      const paths = await promptPathLines(host, field.label)
      const value = paths.join("\n")
      const validationError = field.validate?.(value, values) ?? null
      if (!validationError) return value
      writeError(host, validationError)
    }
  }

  while (true) {
    const raw = await promptRich(host, field.label, String(values[field.id] ?? ""))
    const value: InteractionValue = field.kind === "number" && raw.trim() !== "" ? Number(raw) : raw
    const validationError = field.validate?.(value, values) ?? null
    if (!validationError) return value
    writeError(host, validationError)
  }
}

export async function promptPathLines(
  host: CliHost,
  prompt: string,
  options: { separator?: RegExp; hint?: string } = {},
): Promise<string[]> {
  const separator = options.separator ?? /[,;\r\n]/
  const hint = options.hint ?? "逐行回车，空行结束；单行内可用分号或逗号分隔"
  const collected: string[] = []
  writeLine(host, rich(host, `${hint}。`, "grey"))
  while (true) {
    const suffix = collected.length ? ` (已收集 ${collected.length} 条，留空结束)` : " (留空结束)"
    const answer = await promptRich(host, `${prompt}${suffix}`, "")
    if (!answer) break
    for (const part of answer.split(separator)) {
      const trimmed = part.trim().replace(/^["']|["']$/g, "")
      if (trimmed && !collected.includes(trimmed)) collected.push(trimmed)
    }
  }
  return collected
}

export function shellQuote(value: string): string {
  if (process.platform === "win32") return `"${value.replace(/"/g, '\\"')}"`
  return `'${value.replace(/'/g, "'\\''")}'`
}

export async function runCliCommand(command: CliCommand, args = process.argv.slice(2)): Promise<void> {
  const host = createCliHost()
  if (args.includes("--help") || args.includes("-h")) {
    writeLine(host, `${command.name}: ${command.description}`)
    return
  }

  try {
    await command.run(args, host)
  } catch (error) {
    if (error instanceof CliUsageError) {
      writeError(host, error.message)
      process.exitCode = error.exitCode
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    writeError(host, message)
    process.exitCode = 1
  }
}

function shouldColor(host: CliHost): boolean {
  if (host.env.NO_COLOR !== undefined) return false
  if (host.env.FORCE_COLOR && host.env.FORCE_COLOR !== "0") return true
  if (host.env.XIRANITE_FORCE_COLOR === "1") return true
  return Boolean(host.stdout.isTTY)
}

function createChalk(host: CliHost): InstanceType<typeof Chalk> {
  return new Chalk({ level: shouldColor(host) ? 3 : 0 })
}

function applyRichStyle(host: CliHost, text: string, style: RichStyle): string {
  const chalk = createChalk(host)
  switch (style) {
    case "blue": return chalk.blueBright(text)
    case "cyan": return chalk.cyanBright(text)
    case "green": return chalk.greenBright(text)
    case "grey": return chalk.gray(text)
    case "magenta": return chalk.magentaBright(text)
    case "red": return chalk.redBright(text)
    case "white": return chalk.whiteBright(text)
    case "yellow": return chalk.yellowBright(text)
    case "bold": return chalk.bold(text)
    case "dim": return chalk.dim(text)
    case "inverse": return chalk.inverse(text)
  }
}

function boxenColor(color: RichColor): "blue" | "cyan" | "gray" | "green" | "magenta" | "red" | "white" | "yellow" {
  return color === "grey" ? "gray" : color
}

function clackContext(host: CliHost) {
  return {
    input: host.stdin as unknown as Readable,
    output: host.stdout as unknown as Writable,
  }
}

function isPromptExitError(error: unknown): boolean {
  return error instanceof Error && (error.name === "ExitPromptError" || error.name === "AbortPromptError")
}

export function truncateVisible(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  if (maxWidth === 1) return visibleWidth(text) > 1 ? "…" : text
  if (visibleWidth(text) <= maxWidth) return text
  let width = 0
  let result = ""
  for (const char of Array.from(text)) {
    const nextWidth = stringWidth(char)
    if (width + nextWidth > maxWidth - 1) break
    result += char
    width += nextWidth
  }
  return `${result}…`
}
