#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { createCliHost, normalizeNodeCliName, renderRichPanel, rich, terminalColumns, writeError, writeLine } from "@xiranite/cli-runtime"
import type { CliCommand, CliHost } from "@xiranite/cli-runtime"
import { createTerminalTaskQueueController, isBunRuntime, reexecTerminalUiWithBun } from "@xiranite/cli-runtime/terminal"
import { createXiraniteWorkspaceClient } from "@xiranite/api/client"
import { localizeNodeHelp } from "@xiranite/contract"
import type { NodeHelp } from "@xiranite/contract"
import { GENERATED_NODE_CLI_REGISTRY } from "./node-cli-registry.generated.js"

export interface NodeCliRegistration {
  id: string
  packageName: string
  bin: string
  description: string
}

interface NodeCliModule {
  cli?: CliCommand
}

interface NodeHelpModule {
  help?: NodeHelp
}

interface NodeHelpLabels {
  whenToUse: string
  workflows: string
  commands: string
  fields: string
  safety: string
  required: string
  defaultMode: string
  destructive: string
  note: string
  tip: string
}

export const NODE_CLI_REGISTRY: NodeCliRegistration[] = GENERATED_NODE_CLI_REGISTRY

export function normalizeNodeId(value: string): string {
  return normalizeNodeCliName(value)
}

export function findNodeCli(value: string): NodeCliRegistration | undefined {
  const id = normalizeNodeId(value)
  return NODE_CLI_REGISTRY.find((entry) => entry.id === id || entry.bin === value.trim().toLowerCase())
}

export function formatHelp(): string {
  return [
    "xiranite [ui | logs | <node> [args]]",
    "",
    "Commands:",
    "  ui                   Open the fullscreen Xiranite terminal workspace",
    "  list                 List node commands",
    "  logs [command]       Analyze structured application logs",
    "  help <node>          Show a node command help",
    "  <node> [args]        Run a node CLI, for example `xiranite cleanf preview --help`",
    "",
    "No args after <node> are forwarded as-is, so `xiranite cleanf` opens that node's guided mode in an interactive terminal.",
  ].join("\n")
}

export function formatNodeList(): string {
  const width = Math.max(...NODE_CLI_REGISTRY.map((entry) => entry.id.length))
  return NODE_CLI_REGISTRY
    .map((entry) => `${entry.id.padEnd(width)}  ${entry.bin.padEnd(width + 9)}  ${entry.description}`)
    .join("\n")
}

export async function runProgram(args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  const [command, ...rest] = args

  if (!command && host.stdin.isTTY && host.stdout.isTTY) {
    await runWorkspaceUi(host)
    return
  }

  if (!command || command === "--help" || command === "-h") {
    writeLine(host, formatHelp())
    return
  }

  if (command === "ui") {
    if (!host.stdin.isTTY || !host.stdout.isTTY) {
      writeError(host, "`xiranite ui` requires an interactive terminal.")
      process.exitCode = 2
      return
    }
    await runWorkspaceUi(host)
    return
  }

  if (command === "list") {
    writeLine(host, formatNodeList())
    return
  }

  if (command === "logs") {
    const { runProgram: runLogs } = await import("@xiranite/logging/cli")
    await runLogs(rest, host)
    return
  }

  if (command === "help") {
    const plain = rest.includes("--plain") || rest.includes("-p")
    const locale = readLangArg(rest) ?? detectCliLocale(host)
    const nodeId = readHelpNodeArg(rest)
    if (!nodeId) {
      writeLine(host, formatHelp())
      return
    }
    await showNodeHelp(nodeId, { plain, locale }, host)
    return
  }

  await runNodeCli(command, rest, host)
}

async function runWorkspaceUi(host: CliHost): Promise<void> {
  if (!isBunRuntime()) {
    await reexecTerminalUiWithBun(host, { entrypoint: process.argv[1]!, args: ["ui"] })
    return
  }

  const baseUrl = host.env.XIRANITE_BACKEND_URL?.trim()
  const token = host.env.XIRANITE_BACKEND_TOKEN?.trim()
  const workspace = baseUrl
    ? (() => {
        const client = createXiraniteWorkspaceClient(baseUrl, { token })
        return { available: true, load: () => client.loadSnapshot(), save: async (snapshot: Parameters<typeof client.persistSnapshot>[0]) => { await client.persistSnapshot(snapshot) } }
      })()
    : {
        available: false,
        reason: "未配置 XIRANITE_BACKEND_URL，当前为只读离线工作台。",
        load: async () => ({ workspaces: [{ id: "offline", label: "离线工作区", createdAt: Date.now(), updatedAt: Date.now() }], lanes: [], components: [] }),
        save: async () => undefined,
      }
  const { renderXiraniteTui } = await import("./tui-runner.js")
  const taskQueue = createTerminalTaskQueueController(host.env)
  await runWorkspaceNavigation(
    () => renderXiraniteTui({ host, nodes: NODE_CLI_REGISTRY, workspace, taskQueue }),
    (nodeId) => runNodeCli(nodeId, ["ui"], host),
  )
}

export async function runWorkspaceNavigation(
  renderWorkspace: () => Promise<string | undefined>,
  openNode: (nodeId: string) => Promise<void>,
): Promise<void> {
  while (true) {
    const nodeId = await renderWorkspace()
    if (!nodeId) return
    await openNode(nodeId)
  }
}

export async function runNodeCli(nodeId: string, args: string[], host: CliHost = createCliHost()): Promise<void> {
  const registration = findNodeCli(nodeId)
  if (!registration) {
    writeError(host, `Unknown node "${nodeId}". Run \`xiranite list\` to see available commands.`)
    process.exitCode = 2
    return
  }

  const cli = await loadNodeCli(registration)
  await cli.run(args, host)
}

export async function showNodeHelp(
  nodeId: string,
  options: { plain?: boolean; locale?: string } = {},
  host: CliHost = createCliHost(),
): Promise<void> {
  const registration = findNodeCli(nodeId)
  if (!registration) {
    writeError(host, `Unknown node "${nodeId}". Run \`xiranite list\` to see available commands.`)
    process.exitCode = 2
    return
  }

  const help = await loadNodeHelp(registration)
  if (!help) {
    await runNodeCli(nodeId, ["--help"], host)
    return
  }

  const localizedHelp = localizeNodeHelp(help, options.locale ?? detectCliLocale(host))
  const labels = nodeHelpLabels(options.locale ?? detectCliLocale(host))
  const useRich = Boolean(host.stdout.isTTY) && !options.plain
  writeLine(host, useRich ? formatNodeHelpRich(registration, localizedHelp, host, labels) : formatNodeHelpPlain(registration, localizedHelp, labels))
}

async function loadNodeCli(registration: NodeCliRegistration): Promise<CliCommand> {
  const module = await import(`${registration.packageName}/cli`) as NodeCliModule
  if (!module.cli) {
    throw new Error(`${registration.packageName}/cli does not export cli.`)
  }
  return module.cli
}

async function loadNodeHelp(registration: NodeCliRegistration): Promise<NodeHelp | undefined> {
  try {
    const module = await import(`${registration.packageName}/help`) as NodeHelpModule
    return module.help
  } catch {
    return undefined
  }
}

export function formatNodeHelpPlain(registration: NodeCliRegistration, help: NodeHelp, labels: NodeHelpLabels = nodeHelpLabels()): string {
  const lines = [
    `${help.title} (${registration.id})`,
    help.short,
  ]
  if (help.description && help.description !== help.short) {
    lines.push("", help.description)
  }

  if (help.whenToUse?.length) {
    lines.push("", `${labels.whenToUse}:`)
    for (const item of help.whenToUse) lines.push(`  - ${item}`)
  }

  if (help.workflows.length) {
    lines.push("", `${labels.workflows}:`)
    for (const workflow of help.workflows) {
      lines.push(`  ${workflow.title}${workflow.summary ? ` - ${workflow.summary}` : ""}`)
      for (const step of workflow.ui ?? []) lines.push(`    UI: ${step}`)
      for (const step of workflow.cli ?? []) lines.push(`    CLI: ${step}`)
      for (const tip of workflow.tips ?? []) lines.push(`    ${labels.tip}: ${tip}`)
    }
  }

  if (help.commands.length) {
    lines.push("", `${labels.commands}:`)
    for (const command of help.commands) {
      lines.push(`  ${command.title}${command.command ? ` (${command.command})` : ""}`)
      if (command.description) lines.push(`    ${command.description}`)
      for (const example of command.examples) {
        lines.push(`    $ ${example.command}`)
        if (example.description) lines.push(`      ${example.description}`)
      }
    }
  }

  if (help.fields?.length) {
    lines.push("", `${labels.fields}:`)
    for (const field of help.fields) {
      const flags = [field.type, field.required ? labels.required : undefined].filter(Boolean).join(", ")
      lines.push(`  ${field.name}${flags ? ` (${flags})` : ""}: ${field.description}`)
    }
  }

  if (help.safety) {
    lines.push("", `${labels.safety}:`)
    if (help.safety.defaultMode) lines.push(`  ${labels.defaultMode}: ${help.safety.defaultMode}`)
    for (const item of help.safety.destructive ?? []) lines.push(`  ${labels.destructive}: ${item}`)
    for (const item of help.safety.notes ?? []) lines.push(`  ${labels.note}: ${item}`)
  }

  return lines.join("\n")
}

function formatNodeHelpRich(registration: NodeCliRegistration, help: NodeHelp, host: CliHost, labels: NodeHelpLabels = nodeHelpLabels()): string {
  const columns = terminalColumns(host)
  const sections = [
    renderRichPanel(
      host,
      `${help.title} / ${registration.bin}`,
      [
        rich(host, help.short, "bold"),
        ...(help.description && help.description !== help.short ? ["", help.description] : []),
      ],
      { color: "blue", maxWidth: columns - 2, minWidth: Math.min(72, columns - 6) },
    ),
  ]

  if (help.whenToUse?.length) {
    sections.push(renderRichPanel(host, labels.whenToUse, help.whenToUse.map((item) => `- ${item}`), {
      color: "cyan",
      maxWidth: columns - 2,
      minWidth: Math.min(72, columns - 6),
    }))
  }

  if (help.workflows.length) {
    sections.push(renderRichPanel(host, labels.workflows, renderWorkflowLines(help, labels), {
      color: "magenta",
      maxWidth: columns - 2,
      minWidth: Math.min(72, columns - 6),
    }))
  }

  if (help.commands.length) {
    sections.push(renderRichPanel(host, labels.commands, renderCommandLines(help, host), {
      color: "green",
      maxWidth: columns - 2,
      minWidth: Math.min(72, columns - 6),
    }))
  }

  if (help.fields?.length) {
    sections.push(renderRichPanel(host, labels.fields, help.fields.map((field) => {
      const meta = [field.type, field.required ? labels.required : undefined].filter(Boolean).join(", ")
      return `${field.name}${meta ? ` (${meta})` : ""}: ${field.description}`
    }), {
      color: "yellow",
      maxWidth: columns - 2,
      minWidth: Math.min(72, columns - 6),
    }))
  }

  if (help.safety) {
    const lines = [
      ...(help.safety.defaultMode ? [`${labels.defaultMode}: ${help.safety.defaultMode}`] : []),
      ...(help.safety.destructive ?? []).map((item) => `${labels.destructive}: ${item}`),
      ...(help.safety.notes ?? []).map((item) => `${labels.note}: ${item}`),
    ]
    if (lines.length) {
      sections.push(renderRichPanel(host, labels.safety, lines, {
        color: "red",
        maxWidth: columns - 2,
        minWidth: Math.min(72, columns - 6),
      }))
    }
  }

  return sections.join("\n\n")
}

function renderWorkflowLines(help: NodeHelp, labels: NodeHelpLabels): string[] {
  return help.workflows.flatMap((workflow) => [
    workflow.summary ? `${workflow.title} - ${workflow.summary}` : workflow.title,
    ...(workflow.ui ?? []).map((step) => `  UI: ${step}`),
    ...(workflow.cli ?? []).map((step) => `  CLI: ${step}`),
    ...(workflow.tips ?? []).map((tip) => `  ${labels.tip}: ${tip}`),
  ])
}

function renderCommandLines(help: NodeHelp, host: CliHost): string[] {
  return help.commands.flatMap((command) => [
    command.command ? `${command.title} - ${rich(host, command.command, "cyan")}` : command.title,
    ...(command.description ? [`  ${command.description}`] : []),
    ...command.examples.flatMap((example) => [
      `  $ ${rich(host, example.command, "green")}`,
      ...(example.description ? [`    ${example.description}`] : []),
    ]),
  ])
}

function readLangArg(args: string[]): string | undefined {
  const index = args.findIndex((arg) => arg === "--lang" || arg === "--locale")
  if (index >= 0) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith("--lang=") || arg.startsWith("--locale="))
  return inline?.split("=", 2)[1]
}

function readHelpNodeArg(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue
    if (arg === "--plain" || arg === "-p" || arg.startsWith("--lang=") || arg.startsWith("--locale=")) continue
    if (arg === "--lang" || arg === "--locale") {
      index += 1
      continue
    }
    if (!arg.startsWith("-")) return arg
  }
  return undefined
}

function detectCliLocale(host: CliHost): string | undefined {
  return host.env.XIRANITE_LANG
    ?? host.env.LC_ALL
    ?? host.env.LC_MESSAGES
    ?? host.env.LANG
}

function nodeHelpLabels(locale?: string): NodeHelpLabels {
  const normalized = (locale ?? "").toLowerCase()
  if (normalized.startsWith("zh")) {
    return {
      whenToUse: "适用场景",
      workflows: "工作流",
      commands: "命令",
      fields: "字段",
      safety: "安全提示",
      required: "必填",
      defaultMode: "默认模式",
      destructive: "危险操作",
      note: "提示",
      tip: "建议",
    }
  }
  return {
    whenToUse: "When to use",
    workflows: "Workflows",
    commands: "Commands",
    fields: "Fields",
    safety: "Safety",
    required: "required",
    defaultMode: "Default mode",
    destructive: "Destructive",
    note: "Note",
    tip: "Tip",
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await runProgram()
  } catch (error) {
    const host = createCliHost()
    writeError(host, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
