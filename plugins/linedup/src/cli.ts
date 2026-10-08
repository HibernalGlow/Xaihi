#!/usr/bin/env node
/**
 * linedup 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/linedup/src/cli.ts`
 * 搬来（ADR-0006：动词是移植，不是重新设计）。
 *
 * 保留的东西：子命令名与每个 flag 的名字、`--json` 的输出形状、
 * `kept=<n> removed=<m>` 那行收尾、缺源文本时那句错误、非 TTY 无参时
 * `No interactive terminal detected.`（退出码 2）。
 *
 * 两处偏离，都写在能看见的地方：
 * 1. `runProgram` 里 catch 异常并写成 stderr。上游的 linedup 那份不 catch（异常直接
 *    冒到 Node，同样是非 0 退出码），这里跟同批的 `nodes/sleept/src/cli.ts`、
 *    `nodes/dissolvef/src/cli.ts` 对齐——它们两个都 catch。
 * 2. `ui` / `gd` / `guided` 三条交互腿未接：上游用 `@xiranite/cli-runtime/terminal`
 *    的 OpenTUI 与 `@clack/prompts`，本仓既没有那两个包，也不许引 `@xiranite/*`。
 *    见 `src/cli-support.ts` 顶部的出处清单。
 *
 * @module xaihi-linedup/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import {
  runInteractionCli,
  type InteractionCliContext,
} from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import { filterLines, splitLines } from './core.ts'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinText,
  runPipeProgram,
  writeError,
  writeLine,
} from './cli-support.ts'
import type { CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import {
  createLinedupInteractionSchema,
  runLinedupInteraction,
  type LinedupInput,
  type LinedupResult,
  type LinedupInteractionValues,
} from './interaction.ts'

const CLI_NAME = nodeCliName('linedup')

export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

interface FilterOptions {
  source?: string
  sourceFile?: string
  filter?: string
  filterFile?: string
  outputFile?: string
  json?: boolean
  caseInsensitive?: boolean
  preserveOrder?: boolean
}

interface LinedupDefaults {
  sourceFile?: string
  filterFile?: string
  outputFile?: string
  caseInsensitive?: boolean
  preserveOrder?: boolean
}

async function resolveLinedupDefaults (): Promise<LinedupDefaults> {
  return {}
}

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Filter source lines by removing any line containing a filter token.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createLinedupDefinition (
  defaults: Partial<LinedupInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<LinedupInput, LinedupResult> {
  const schema = createLinedupInteractionSchema({ ...defaults }, language)
  return {
    schema,
    async run (input) {
      return runLinedupInteraction(input)
    },
  }
}

/** 派发形状接入 @hibernalglow/xaihi-cli-runtime 的 runInteractionCli。 */
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
    createDefinition: (defaults, language) => createLinedupDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).LinedupTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Line filter with Typer-style commands and a Clack guided mode.',
    },
    subCommands: {
      filter: defineCommand({
        meta: {
          name: 'filter',
          description: 'Filter line content from inline strings or files.',
        },
        args: {
          source: { type: 'string', description: 'Inline source text. Use \\n for new lines.' },
          sourceFile: { type: 'string', description: 'Source file path.' },
          filter: { type: 'string', description: 'Inline filter text. Use \\n for new lines.' },
          filterFile: { type: 'string', description: 'Filter file path.' },
          outputFile: { type: 'string', description: 'Write kept lines to this file.' },
          json: { type: 'boolean', description: 'Print JSON result.' },
          caseInsensitive: { type: 'boolean', description: 'Match filters case-insensitively.' },
          preserveOrder: { type: 'boolean', description: 'Preserve source order instead of sorting output.' },
        },
        async run ({ args }) {
          const defaults = await resolveLinedupDefaults()
          await runFilter(args as FilterOptions, host, defaults)
        },
      }),
      ui: defineCommand({
        meta: {
          name: 'ui',
          description: 'Open the full terminal UI using OpenTUI.',
        },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      gd: defineCommand({
        meta: {
          name: 'gd',
          description: 'Open the compact guided terminal workflow.',
        },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      guided: defineCommand({
        meta: {
          name: 'guided',
          description: 'Open a rich terminal guided workflow.',
        },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
    },
  })
}

async function runFilter (options: FilterOptions, host: CliHost, defaults: LinedupDefaults = {}): Promise<void> {
  const sourceText = options.source === '-' || (!options.source && hasPipedInput(host.stdin))
    ? await readStdinText(host.stdin)
    : await readInput(options.source, options.sourceFile)
  const filterText = options.filter === '-' || (!options.filter && hasPipedInput(host.stdin))
    ? await readStdinText(host.stdin)
    : await readInput(options.filter, options.filterFile)

  if (!sourceText.trim()) {
    throw new Error('Missing source content. Use --source or --sourceFile, or run guided mode.')
  }

  const caseInsensitive = options.caseInsensitive ?? defaults.caseInsensitive ?? false
  const preserveOrder = options.preserveOrder ?? defaults.preserveOrder ?? false

  const result = filterLines({
    sourceLines: splitLines(sourceText),
    filterLines: splitLines(filterText),
    caseSensitive: !caseInsensitive,
    sort: !preserveOrder,
  })

  const outputFile = options.outputFile ?? defaults.outputFile
  if (outputFile) {
    await writeFile(outputFile, `${result.filteredLines.join('\n')}\n`, 'utf8')
  }

  if (options.json) {
    writeLine(host, JSON.stringify(result, null, 2))
    return
  }

  writeLine(host, result.filteredLines.join('\n'))
  writeLine(host, `kept=${result.keptCount} removed=${result.removedCount}`)
}

async function readInput (inline?: string, filePath?: string): Promise<string> {
  if (filePath) {
    return readFile(filePath, 'utf8')
  }
  return (inline ?? '').replace(/\\n/g, '\n')
}

/** argv[1] 与本模块经 realpath 后是否同指一个文件：npm 装出的 bin 软链（`…/bin/<id>`）
 * 解析到真身后点亮；聚合 CLI 引本模块时 argv[1] 是它自己的入口，比对失败不点亮。 */
function sameRealpathAsSelf (entry: string): boolean {
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

/**
 * 自执行闸门：`argv[1]` 经 realpath 后与本模块同指一个文件才点亮。
 * 2026-10-07 之前这里用的是 `/\bcli\.[cm]?[jt]s$/` 正则匹配裸 `argv[1]`——而 npm
 * 装出的 bin 是以节点 id 命名的软链（`…/bin/<id>`），正则不匹配，实机
 * `npm i -g file:` 后 `bin/<id> --help` 静默 rc=0（阳性对照：真路径
 * `node lib/cli.js --help` 正常）。上游 sleept 原用 `pathToFileURL(argv[1]).href`
 * 比较，本仓按同一条比较形状补上 realpath：bin 软链直跑点亮；聚合 CLI 引本模块
 * 时 argv[1] 是它自己的入口，不点亮。
 */
const entry = process.argv[1]
if (entry !== undefined && sameRealpathAsSelf(entry)) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
