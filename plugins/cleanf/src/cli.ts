#!/usr/bin/env node
/**
 * cleanf 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/cleanf/src/cli.ts` 搬。
 *
 * 接线：
 * - 默认交互面及 `ui` 走 `runInteractionCli`（`@hibernalglow/xaihi-cli-runtime/terminal`），
 *   动态装载 `./Tui.tsx` 的 `CleanfTui`（原版 OpenTUI Workbench）。
 * - 管道面保留 `preview` 与 `run`，配合 flag `--paths --presets --exclude --preview --json`。
 *
 * @module xaihi-cleanf/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  runInteractionCli,
} from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import {
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinLines,
  renderProgressBar,
  rich,
  runPipeProgram,
  terminalColumns,
  truncateVisible,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { CleanfInput, CleanfPresetId, CleanfResult } from './core.ts'
import { CLEANING_PRESETS, getDefaultPresets, parseCleanfPaths, runCleanf } from './core.ts'
import { createNodeCleanfRuntime } from './platform.ts'
import { createCleanfInteractionSchema, type CleanfInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('cleanf')
const PREVIEW_TARGET_LIMIT = 40

export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Remove empty folders, backup files, temp folders, and trash patterns.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createCleanfDefinition (
  defaults: Partial<CleanfInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<CleanfInput, CleanfResult> {
  let cancelled = false
  let paused = false
  let resumePaused: (() => void) | undefined
  const schema = createCleanfInteractionSchema({
    presetsText: defaults.presetsText || getDefaultPresets().join('\n'),
    exclude: defaults.exclude ?? '',
    preview: defaults.preview ?? true,
    ...defaults,
  }, language)

  return {
    schema,
    async run (input, onEvent) {
      cancelled = false
      paused = false
      const runtime = createNodeCleanfRuntime()
      return runCleanf(input, {
        ...runtime,
        isCancelled: () => cancelled,
        waitWhilePaused: async () => {
          while (paused && !cancelled) await new Promise<void>((resolve) => { resumePaused = resolve })
          resumePaused = undefined
        },
      }, onEvent)
    },
    pause () { paused = true },
    resume () { paused = false; resumePaused?.() },
    cancel () {
      cancelled = true
      paused = false
      resumePaused?.()
    },
  }
}

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  const isInteractiveLeg = args.length > 0 && ['ui', 'gd', 'guided'].includes(args[0] ?? '')
  if (isInteractiveLeg && (!host.stdin.isTTY || !host.stdout.isTTY)) {
    writeLine(host, `${CLI_NAME} ${args[0]} 交互模式已就绪（非交互环境退出）`)
    process.exitCode = 0
    return
  }

  await runInteractionCli({
    args,
    host,
    cliName: CLI_NAME,
    loadContext: () => ({ preferences: { mode: 'ui', renderer: 'opentui', theme: 'inherit' }, value: {} }),
    createDefinition: (defaults, language) => createCleanfDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).CleanfTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'File cleanup CLI: preview plans on the terminal face, removals need the recycle-bin seam (G10).' },
    subCommands: {
      preview: defineCommand({
        meta: { name: 'preview', description: 'Preview cleanup targets without deleting.' },
        args: cleanfArgs(),
        async run ({ args }) {
          await runCommand('preview', args, host)
        },
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Execute cleanup.' },
        args: cleanfArgs(),
        async run ({ args }) {
          await runCommand('run', args, host)
        },
      }),
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Open the rich guided terminal workflow.（未接）' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
    },
  })
}

function cleanfArgs () {
  return {
    paths: { type: 'string', description: 'Paths separated by semicolon or new lines. Use "-" to read the queue from stdin.' },
    presets: { type: 'string', description: 'Comma-separated presets.' },
    exclude: { type: 'string', description: 'Comma-separated exclude keywords.' },
    preview: { type: 'boolean', description: 'Preview mode. `preview` always previews; `run` needs --preview to stay a plan.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

async function resolvePathsValue (args: CliArgs, host: CliHost): Promise<string | undefined> {
  if (args.paths === '-' || (args.paths === undefined && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))) {
    return (await readStdinLines(host.stdin)).join(';')
  }
  return typeof args.paths === 'string' ? args.paths : undefined
}

function inputFromArgs (leg: 'preview' | 'run', args: CliArgs, paths: string | undefined): CleanfInput {
  const presets = typeof args.presets === 'string' && args.presets !== ''
    ? args.presets.split(',').map((item) => item.trim()).filter(Boolean) as CleanfPresetId[]
    : getDefaultPresets()
  return {
    paths: parseCleanfPaths(paths),
    presets,
    ...(typeof args.exclude === 'string' && args.exclude !== '' ? { exclude: args.exclude } : {}),
    preview: leg === 'preview' ? true : args.preview === true,
  }
}

async function runCommand (leg: 'preview' | 'run', args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const input = inputFromArgs(leg, args, await resolvePathsValue(args, host))

  let progressActive = false
  const result = await runCleanf(input, createNodeCleanfRuntime(), json ? undefined : (event) => {
    if (event.type === 'progress') {
      writeProgress(host, renderProgressBar(host, event.progress ?? 0, event.message, { label: CLI_NAME }))
      progressActive = true
      return
    }
    endProgress(host, progressActive)
    progressActive = false
    if (event.message.trim()) writeLine(host, rich(host, event.message, 'grey'))
  })
  endProgress(host, progressActive)

  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return
  }
  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeSummary(host, result, input.preview === true)
  if (!result.success) process.exitCode = 1
}

function writeSummary (host: CliHost, result: CleanfResult, preview: boolean): void {
  const data = result.data
  if (data === undefined) return
  const columns = terminalColumns(host)
  const detailLines = Object.entries(data.removedDetails).map(([key, count]) => {
    const preset = CLEANING_PRESETS[key]
    const name = preset?.name ?? key
    return `• ${name}: ${String(count)} 个`
  })
  const headline = preview
    ? `预览完成，找到 ${String(data.totalRemoved)} 个待删除项目。`
    : `已移入系统回收站: ${String(data.totalRemoved)} 个项目${data.skipped ? `，跳过 ${String(data.skipped)} 个` : ''}。`
  writeRichPanel(host, '清理总结', [headline, ...detailLines], {
    color: result.success ? 'green' : 'yellow',
    maxWidth: columns - 2,
    minWidth: Math.min(76, columns - 6),
  })

  if (preview && data.previewFiles.length) {
    writeLine(host)
    writeLine(host, rich(host, '待删除文件预览：', 'cyan'))
    for (const path of data.previewFiles.slice(0, PREVIEW_TARGET_LIMIT)) {
      writeLine(host, `  ${truncateVisible(path, columns - 6)}`)
    }
    if (data.previewFiles.length > PREVIEW_TARGET_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${String(data.previewFiles.length - PREVIEW_TARGET_LIMIT)} 个项目`, 'grey'))
    }
  }
}

function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

function endProgress (host: CliHost, active: boolean): void {
  if (active && host.stdout.isTTY) host.stdout.write('\n')
}

function sameRealpathAsSelf (entry: string): boolean {
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

const entry = process.argv[1]
if (entry !== undefined && sameRealpathAsSelf(entry)) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
