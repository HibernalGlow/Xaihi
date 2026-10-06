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

import { readFile, writeFile } from 'node:fs/promises'
import { filterLines, splitLines } from './core.ts'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinText,
  runNodeCliFace,
  runPipeProgram,
  writeError,
  writeLine,
} from './cli-support.ts'
import type { CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'

const CLI_NAME = nodeCliName('linedup')

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

/**
 * 未接：上游在这里读 `xiranite.config.toml` 的 `[nodes.linedup]`
 * （`@xiranite/config` 的 `loadNodeConfigWithHints`）。Xaihi 没有"配置文件在 cwd 旁边"
 * 这一层——同一些默认值在宿主侧是 `src/index.ts` 的 `Config`（cordis 的 Schema），
 * 只有跑在 DSH 进程里才读得到，独立 bin 读不到。所以这里返回空默认，flag 一律以命令行给的为准。
 */
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

/** 派发形状对齐上游的 `runInteractionCli`（见 cli-support 末尾）。 */
export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await legacyRunProgram(pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '引导流（@clack）与全屏 TUI（OpenTUI）都不随本包发布，'
      + `脚本化请用 \`${CLI_NAME} filter --source <文本> --filter <文本> --json\`。`,
  })
}

async function legacyRunProgram (args: readonly string[], host: CliHost): Promise<void> {
  if (args.length === 0) {
    await runGuided(host)
    return
  }
  await runPipeProgram(createProgram(host), args, host)
}

/**
 * 未接：上游的 `runGuided` 要 `selectRich` / `promptRich`（`@clack/prompts`）、
 * 剪贴板（`./platform.js` 的 `readClipboardText`，本包没有这个模块）与
 * `analyzeReadLines`（本包 `src/core.ts` 只搬了 filterLines/splitLines/explainRemovals）。
 * 该由谁替：DSH 的面板（`frontend/Panel.tsx`）与 `ctx.commands`。
 */
async function runGuided (host: CliHost): Promise<void> {
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} filter --help\` for scripted use.`)
    process.exitCode = 2
    return
  }
  writeError(host, `\`${CLI_NAME} guided\` 未接：引导流的选项树在 @clack 上，本包不引它。`)
  process.exitCode = 2
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
      guided: defineCommand({
        meta: {
          name: 'guided',
          description: 'Open a rich terminal guided workflow.',
        },
        async run () {
          await runGuided(host)
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

/**
 * 自执行闸门：上游两个写法不一（sleept 比 `pathToFileURL(argv[1]).href`，
 * linedup/dissolvef 用 `cli.[jt]s$` 正则）。取正则那条——`.bin` 软链下 argv[1]
 * 未必等于 `import.meta.url`，而聚合 CLI 引本模块时 argv[1] 是它自己的入口，
 * 两条都不该点亮。
 */
const entry = process.argv[1] ?? ''
if (/\bcli\.[cm]?[jt]s$/.test(entry.replace(/\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
