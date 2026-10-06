import { runGuidedInteraction, writeError, type CliHost } from "../index.js"
import { requireInteractiveMode, resolveCliInvocation, resolveTerminalUiFlags, type CliInteractionPreferences, type TerminalInteractionDefinition, type TerminalRenderer } from "../interaction.js"
import { resolveTerminalLanguage, type TerminalLanguage } from "./i18n.js"
import { isBunRuntime, reexecTerminalUiWithBun } from "./bun-runtime.js"
import { listTerminalThemes } from "./theme.js"
import type { ReactNode } from "react"
import type { NodeHelp } from "@xiranite/contract"
import { writeTerminalNodeHelp } from "../help.js"
import { bindDefinitionToTaskQueue, createTerminalTaskQueueController, type TerminalTaskQueueController } from "./task-queue.js"

export interface TerminalUiScreenProps<Input, Result> {
  definition: TerminalInteractionDefinition<Input, Result>
  language: TerminalLanguage
  theme?: string
  preferences?: TerminalPreferenceController
  taskQueue?: TerminalTaskQueueController
  help?: NodeHelp
  onExit: () => void
}

export type TerminalUiScreen<Input, Result> = (props: TerminalUiScreenProps<Input, Result>) => ReactNode

export interface RunTerminalUiOptions<Input = unknown, Result = unknown> {
  renderer?: TerminalRenderer
  language?: TerminalLanguage | string
  theme?: string
  host: CliHost
  reexec?: { entrypoint: string; args: readonly string[] }
  preferences?: TerminalPreferenceController
  screen?: TerminalUiScreen<Input, Result>
  loadScreen?: () => Promise<TerminalUiScreen<Input, Result>>
  taskQueue?: TerminalTaskQueueController
  help?: NodeHelp
}

export interface TerminalPreferenceValues {
  theme: string
  defaultMode: "ui" | "gd" | "pipe"
  language: TerminalLanguage
}

export interface TerminalPreferenceController {
  nodeId: string
  current: TerminalPreferenceValues
  save: (values: TerminalPreferenceValues) => Promise<void>
  restore: () => Promise<TerminalPreferenceValues>
}

export interface InteractionCliContext<Context> {
  preferences: CliInteractionPreferences
  value: Context
}

export interface RunInteractionCliOptions<Context, Input, Result> {
  args: string[]
  host: CliHost
  cliName: string
  loadContext: () => Promise<InteractionCliContext<Context>>
  createDefinition: (context: Context, language: TerminalLanguage) => TerminalInteractionDefinition<Input, Result>
  runPipe: (args: string[], host: CliHost) => Promise<void>
  runUi?: <RunInput, RunResult>(definition: TerminalInteractionDefinition<RunInput, RunResult>, options: RunTerminalUiOptions<RunInput, RunResult>) => Promise<void>
  runGuide?: typeof runGuidedInteraction
  screen?: TerminalUiScreen<Input, Result>
  loadScreen?: () => Promise<TerminalUiScreen<Input, Result>>
  createPreferences?: (context: Context, values: TerminalPreferenceValues) => TerminalPreferenceController | undefined
  reexecEntrypoint?: string
  help?: NodeHelp
}

export async function runTerminalUi<Input, Result>(
  definition: TerminalInteractionDefinition<Input, Result>,
  options: RunTerminalUiOptions<Input, Result>,
): Promise<void> {
  const language = resolveTerminalLanguage(options.language, options.host.env)
  if (!isBunRuntime()) {
    await reexecTerminalUiWithBun(options.host, options.reexec)
    return
  }
  const { runOpenTuiTerminalUi } = await import("./opentui/runner.js")
  await runOpenTuiTerminalUi(definition, { ...options, renderer: "opentui", language })
}

/** Shared ui/gd/pipe dispatcher used by independently distributed node CLIs. */
export async function runInteractionCli<Context, Input, Result>(options: RunInteractionCliOptions<Context, Input, Result>): Promise<void> {
  const { args, host } = options
  if (args[0] === "help" || args.includes("--help") || args.includes("-h")) {
    if (options.help) writeTerminalNodeHelp(host, options.help, resolveTerminalLanguage(undefined, host.env))
    else await options.runPipe(args, host)
    return
  }
  if (args.length === 0 && (!host.stdin.isTTY || !host.stdout.isTTY)) {
    writeError(host, `No interactive terminal detected. Use \`${options.cliName} --help\` or run \`${options.cliName} ui\` in a terminal.`)
    process.exitCode = 2
    return
  }

  const explicit = resolveCliInvocation(args, host, "ui")
  if (args.length > 0 && explicit !== "pipe") {
    const ttyError = requireInteractiveMode(host, explicit)
    if (ttyError) {
      writeError(host, ttyError)
      process.exitCode = 2
      return
    }
  }
  if (explicit === "pipe") {
    await options.runPipe(args, host)
    return
  }

  const loaded = await options.loadContext()
  const invocation = args.length === 0 ? resolveCliInvocation(args, host, loaded.preferences.mode) : explicit
  if (invocation === "pipe") {
    await options.runPipe([], host)
    return
  }
  const flags = resolveTerminalUiFlags(args.slice(1), {
    renderer: loaded.preferences.renderer,
    language: loaded.preferences.language ?? "zh",
    theme: loaded.preferences.theme,
  })
  if (flags.error || flags.args.length || !flags.renderer || !flags.language) {
    writeError(host, flags.error ?? `Unknown ${invocation} argument: ${flags.args[0]}.`)
    process.exitCode = 2
    return
  }
  if (flags.theme && flags.theme !== "inherit" && !listTerminalThemes().includes(flags.theme)) {
    writeError(host, `Unknown terminal theme: ${flags.theme}. Available themes: inherit, ${listTerminalThemes().join(", ")}.`)
    process.exitCode = 2
    return
  }

  const definition = options.createDefinition(loaded.value, flags.language)
  if (invocation === "gd") {
    await (options.runGuide ?? runGuidedInteraction)(definition, { host, language: flags.language })
    return
  }
  const values: TerminalPreferenceValues = { theme: flags.theme ?? loaded.preferences.theme ?? "nord", defaultMode: loaded.preferences.mode, language: flags.language }
  const taskQueue = createTerminalTaskQueueController(host.env)
  const uiDefinition = bindDefinitionToTaskQueue(definition, taskQueue)
  await (options.runUi ?? runTerminalUi)(uiDefinition, {
    host,
    renderer: flags.renderer,
    language: flags.language,
    theme: flags.theme,
    preferences: options.createPreferences?.(loaded.value, values),
    screen: options.screen,
    loadScreen: options.loadScreen,
    taskQueue,
    help: options.help,
    reexec: options.reexecEntrypoint ? { entrypoint: options.reexecEntrypoint, args } : undefined,
  })
}

export {
  createCliI18n,
  createI18nTranslator,
  createTerminalTranslator,
  resolveTerminalLanguage,
  terminalMessages,
  type CliI18nResources,
  type I18nInterpolationValues,
  type TerminalLanguage,
  type TerminalMessageKey,
} from "./i18n.js"
export { listTerminalThemes, registerTerminalTheme, resolveTerminalTheme, type TerminalTheme } from "./theme.js"
export { isBunRuntime, reexecTerminalUiWithBun } from "./bun-runtime.js"
export { formatTerminalNodeHelp, writeTerminalNodeHelp } from "../help.js"
export { bindDefinitionToTaskQueue, createTerminalTaskQueueController, type TerminalTaskQueueController, type TerminalTaskQueueItem } from "./task-queue.js"
