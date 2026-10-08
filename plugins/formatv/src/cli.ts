#!/usr/bin/env node
/**
 * formatv 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/formatv/src/cli.ts`
 * （553 行）搬来。保留的东西：子命令名 `scan` / `add-nov` / `remove-nov` / `duplicates`
 * （上游 `:187-214` 的 kebab 拼法，与定义里的动作 id `add_nov` / `remove_nov` /
 * `check_duplicates` 是两套字，上游本来如此）、8 个 flag 名（`--path` / `--paths` /
 * `--recursive` / `--prefixName` / `--prefix` / `--dryRun` / `--reportPath` / `--json`）、
 * `--prefixName || --prefix` 那条别名优先级（`:242`）、`-` 读 stdin 的两条队列与
 * "stdin 不是异步流就原样返回"的闸门（`resolveFormatvArgs`，`:248-254`）、分隔符
 * `/[,;\r\n]/`（`splitArg`，`:531`）、非 JSON 时的进度条 + Summary 面板（普通 / 后缀 /
 * 前缀三行、`重复` 与 `前缀大于原件` 只在有内容时才出现、分隔线是 `─` 的
 * `min(70, columns-8)` 个）+ 操作清单与重复清单**各 50 行上限**（`:321` / `:335`）、
 * 超出时 `... 还有 N 个操作` / `... 还有 N 个重复`、以及 `result.success` 为假时退出码 1。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，
 *    退出码 2）。与同批的 timeu 是同一处理由。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 的 `runGuidedInteraction` + `./interaction.ts`；`guided` 那条腿还带着
 *    剪贴板读路径（`readClipboardText`，上游 `:449-498`）。本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument"
 *    会把"这块内核没搬"说成"你参数没给对"（同类误导在 sleept 上刚修掉过）。
 *    缺口记为 `G-clipboard-guided`。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.formatv]` 的 `recursive` /
 *    `prefix_name` / `dry_run` 与 `[nodes.formatv.output]` 的 `report_name_template` /
 *    `directory` / `overwrite`（`resolveFormatvDefaults`，`:84-101`）。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是
 *    `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里用上游那份 `DEFAULT_FORMATV_DEFAULTS`
 *    （模板 `formatv-{prefix}-duplicates.json`、`overwrite: true`、无 `directory`），
 *    一切以命令行给的为准；内核默认（`dryRun ?? false`）因此就是 bin 的默认，
 *    因此就是 bin 的默认 ⇒ `add-nov` / `remove-nov` 在 bin 上**默认真改名**，
 *    **要预演得显式写 `--dry-run`**；工作台那侧不一样：定义里的 `dryRun` 默认是 `true`。
 * 4. **危险动作在 bin 里照上游执行**（`add-nov` / `remove-nov` 的真改名）。宿主面那半边由
 *    `danger.all` 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，拿不到那条缝。
 *    与同批的 `timeu` / `dissolvef` 同一取舍（ADR-0003 决定 1）。**记为缺口**：
 *    `G-terminal-approval`。
 *
 * @module xaihi-formatv/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  canRunInteractiveCli,
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
import { runInteractionCli } from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import type { FormatvAction, FormatvData, FormatvInput, FormatvResult } from './core.ts'
import { DEFAULT_PREFIXES, runFormatv } from './core.ts'
import { createNodeFormatvRuntime } from './platform.ts'
import { createFormatvInteractionSchema, type FormatvInteractionValues } from './interaction.ts'
import { applyReportDefaults, DEFAULT_REPORT_DEFAULTS, type ReportDefaults } from './report-defaults.ts'

const CLI_NAME = nodeCliName('formatv')

/** 上游 `cli.ts:321` / `:335` 的两处 `slice(0, 50)`：操作清单与重复清单各 50 行。 */
const SUMMARY_LINES = 50

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Scan video folders, add/remove .nov suffixes, and check prefixed duplicates.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createFormatvUiDefinition (
  defaults: Partial<FormatvInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<FormatvInput, FormatvResult> {
  const schema = createFormatvInteractionSchema({
    recursive: defaults.recursive ?? false,
    prefixName: defaults.prefixName ?? 'hb',
    dryRun: defaults.dryRun ?? true,
    reportPath: '',
  }, language)
  return {
    schema,
    run: (input, onEvent) => runFormatv(input, createNodeFormatvRuntime(), onEvent),
  }
}

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  const isInteractiveLeg = args.length > 0 && ['ui', 'gd', 'guided'].includes(args[0] ?? '')
  if (isInteractiveLeg && (!host.stdin.isTTY || !host.stdout.isTTY || typeof (host.stdin as any).on !== 'function')) {
    writeLine(host, `${CLI_NAME} ${args[0]} 交互模式已就绪（非交互环境退出）`)
    process.exitCode = 0
    return
  }

  await runInteractionCli({
    args,
    host,
    cliName: CLI_NAME,
    loadContext: () => ({ preferences: { mode: 'ui', renderer: 'opentui', theme: 'inherit' }, value: {} }),
    createDefinition: (defaults, language) => createFormatvUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).FormatvTui,
  })
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包与文件，
 * 并且**不做任何参数校验**（见文件头第 2 条）。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} scan --path <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/formatv/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/formatv/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/formatv\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Video .nov suffix and duplicate checker with guided terminal mode.',
    },
    subCommands: {
      scan: defineCommand({
        meta: { name: 'scan', description: 'Scan video files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('scan', args, host)
        },
      }),
      'add-nov': defineCommand({
        meta: { name: 'add-nov', description: 'Add .nov suffix to normal video files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('add_nov', args, host)
        },
      }),
      'remove-nov': defineCommand({
        meta: { name: 'remove-nov', description: 'Remove .nov suffix from .nov video files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('remove_nov', args, host)
        },
      }),
      duplicates: defineCommand({
        meta: { name: 'duplicates', description: 'Check prefixed files against original duplicates.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('check_duplicates', args, host)
        },
      }),
      // ↓ 上游有、本包没带的那三条腿：面在这儿，实现不在这儿。
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
          await runProgram(['guided'], host)
        },
      }),
    },
  })
}

/** flag 名逐个对齐上游 `commonArgs()`（`:225-236`），含 `--prefix` 这条 `--prefixName` 的别名。 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Input file or folder path.' },
    paths: { type: 'string', description: 'Comma, semicolon, or newline separated paths.' },
    recursive: { type: 'boolean', description: 'Recurse into folders.' },
    prefixName: { type: 'string', description: 'Prefix config name, default hb.' },
    prefix: { type: 'string', description: 'Alias for --prefixName.' },
    dryRun: { type: 'boolean', description: 'Plan renames or skip duplicate report writing.' },
    reportPath: { type: 'string', description: 'Duplicate report JSON path.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `resolveFormatvArgs`（`:248-254`）逐字：`-` 或"没给而 stdin 是管道"才读 stdin，
 * 且 stdin 必须带 `Symbol.asyncIterator`，否则原样返回；`path` 取第一行、`paths` 用 `;` 拼。
 */
async function resolvePathQueues (args: CliArgs, host: CliHost): Promise<CliArgs> {
  const piped = hasPipedInput(host.stdin)
  const needsPath = args.path === '-' || (args.path === undefined && piped)
  const needsPaths = args.paths === '-' || (args.paths === undefined && piped)
  if (!needsPath && !needsPaths) return args
  if (!(Symbol.asyncIterator in Object(host.stdin))) return args
  const lines = await readStdinLines(host.stdin)
  return {
    ...args,
    ...(needsPath ? { path: lines[0] } : {}),
    ...(needsPaths ? { paths: lines.join(';') } : {}),
  }
}

/**
 * 上游 `inputFromArgs`（`:238-246`）的四条判据逐字，只是把"可能 undefined 的可选属性"换成
 * 条件展开（本仓 `exactOptionalPropertyTypes` 不吃 `paths: string[] | undefined`）。
 * `--prefixName || --prefix` 的优先级照 `:242`。
 */
function inputFromArgs (args: CliArgs): FormatvInput {
  const paths = splitArg(args.paths, typeof args.path === 'string' ? [args.path] : [])
  const prefixName = typeof args.prefixName === 'string' && args.prefixName !== ''
    ? args.prefixName
    : typeof args.prefix === 'string' ? args.prefix : undefined
  return {
    ...(paths.length === 0 ? {} : { paths }),
    ...(typeof args.recursive === 'boolean' ? { recursive: args.recursive } : {}),
    ...(prefixName === undefined || prefixName === '' ? {} : { prefixName }),
    ...(typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
    ...(typeof args.reportPath === 'string' && args.reportPath !== '' ? { reportPath: args.reportPath } : {}),
  }
}

async function runSubcommand (action: FormatvAction, args: CliArgs, host: CliHost): Promise<void> {
  const merged = await resolvePathQueues(args, host)
  await runAction({ action, ...inputFromArgs(merged) }, args.json === true, host)
}

/** 上游 `runAction`（`:256-282`）：先接配置默认，再跑内核，进度条与摘要各按 `--json` 分叉。 */
async function runAction (input: FormatvInput & { action: FormatvAction }, json: boolean, host: CliHost): Promise<FormatvResult> {
  const runtime = createNodeFormatvRuntime()
  const defaults: ReportDefaults = DEFAULT_REPORT_DEFAULTS
  const prepared = await applyReportDefaults(input, defaults, runtime)
  let progressActive = false
  const result = await runFormatv(prepared, runtime, (event) => {
    if (json) return
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
    return result
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeFormatvSummary(host, result.data)
  if (!result.success) process.exitCode = 1
  return result
}

/** 上游 `writeFormatvSummary`（`:284-345`）：三行计数 + 条件分隔线 + 两段列表，行限 50。 */
function writeFormatvSummary (host: CliHost, data: FormatvData | undefined): void {
  if (!data) return

  const columns = terminalColumns(host)
  const divider = rich(host, '─'.repeat(Math.min(70, columns - 8)), 'grey')

  const lines: string[] = [
    `${rich(host, '普通', 'green')}  ${String(data.normalCount)} 个`,
    `${rich(host, '后缀', 'yellow')}  ${String(data.novCount)} 个`,
  ]

  for (const [name, count] of Object.entries(data.prefixedCounts)) {
    const prefix = DEFAULT_PREFIXES.find((item) => item.name === name)
    const label = prefix?.prefix ?? name
    const desc = prefix?.description ?? ''
    lines.push(`${rich(host, '前缀', 'blue')}  ${String(count)} 个 ${label} (${desc})`)
  }

  if (data.duplicateCount > 0 || data.prefixedLarger.length > 0) {
    lines.push(divider)
    lines.push(`${rich(host, '重复', 'magenta')}  ${String(data.duplicateCount)} 个`)
    lines.push(`${rich(host, '前缀大于原件', 'red')}  ${String(data.prefixedLarger.length)} 对`)
  }

  if (data.successCount > 0 || data.errorCount > 0 || data.skippedCount > 0) {
    lines.push(divider)
    lines.push(`${rich(host, '成功', 'green')}  ${String(data.successCount)}   ${rich(host, '跳过', 'yellow')}  ${String(data.skippedCount)}   ${rich(host, '失败', 'red')}  ${String(data.errorCount)}`)
  }

  if (data.reportPath) {
    lines.push(divider)
    lines.push(`${rich(host, '报告', 'cyan')}  ${data.reportPath}`)
  }

  writeRichPanel(host, 'Summary', lines, { color: 'green', maxWidth: columns - 2, minWidth: Math.min(76, columns - 6) })

  for (const item of data.operations.slice(0, SUMMARY_LINES)) {
    const status = item.status === 'success'
      ? rich(host, 'success', 'green')
      : item.status === 'error'
        ? rich(host, 'error', 'red')
        : item.status === 'skipped'
          ? rich(host, 'skipped', 'yellow')
          : rich(host, 'planned', 'cyan')
    writeLine(host, `  ${status} ${item.sourcePath} ${rich(host, '->', 'grey')} ${item.targetPath}${item.reason ? ` / ${item.reason}` : ''}`)
  }
  if (data.operations.length > SUMMARY_LINES) {
    writeLine(host, rich(host, `  ... 还有 ${String(data.operations.length - SUMMARY_LINES)} 个操作`, 'grey'))
  }

  for (const item of data.duplicates.slice(0, SUMMARY_LINES)) {
    writeLine(host, `  ${rich(host, 'duplicate', 'magenta')} ${truncateVisible(item, columns - 6)}`)
  }
  if (data.duplicates.length > SUMMARY_LINES) {
    writeLine(host, rich(host, `  ... 还有 ${String(data.duplicates.length - SUMMARY_LINES)} 个重复`, 'grey'))
  }

  if (data.errors.length) {
    writeRichPanel(host, 'Error', data.errors.join('\n'), { color: 'red', minWidth: 76 })
  }
}

/** 上游 `cli.ts:520-532` 的两个小函数，判据逐字。 */
function splitArg (value: string | boolean | undefined, seed: string[] = []): string[] {
  return [...seed, ...String(typeof value === 'string' ? value : '').split(/[,;\r\n]/)].map((item) => item.trim()).filter(Boolean)
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
