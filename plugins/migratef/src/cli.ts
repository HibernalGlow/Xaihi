#!/usr/bin/env node
/**
 * migratef 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/migratef/src/cli.ts`
 * （569 行）搬来。保留的东西：子命令名与 `runProgram` 的派发形状、8 个 flag 名
 * （`--path` / `--source` / `--target` / `--mode` / `--historyPath` / `--batchId` /
 * `--dryRun` / `--json`）、stdin 那两条队列（上游 `:169-176`：`--source -` 或不给 `--source`
 * 而 stdin 是管道 ⇒ 整份读进来用 `;` 拼，`--path` 同一条队列**只读一次**）、
 * `splitArg` 的分隔符 `/[,;\r\n]/`（`:543`）、`mode` 缺省 `preserve`、`dryRun` 用
 * `Boolean(args.dryRun)`（`:249` ⇒ bin 上**默认真搬盘**）、非 JSON 时的进度条 +
 * Summary 面板五行 + **30 行计划上限**（`:482`）与 `... N more item(s)`（`:483`）+
 * Error 面板 + `Undo history:` 段与 **20 条上限**（`:489-494`）、`result.success` 为假时
 * 退出码 1（`:260` / `:266`），以及 `formatPlanItem` 那套按列宽分配的截法（`:498-519`）。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：终端支撑是 vendored 的 citty 子集（`src/cli-support.ts`），
 *    子命令之后不接受裸位置参（`Unknown argument: <token>.`，退出码 2）。与同批的
 *    `crashu` / `encodeb` 同一处理由。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 的 `runGuidedInteraction` + `./interaction.ts` 那张字段表。三条腿
 *    **都不带任何参数校验**——未接的功能先报 "Missing required argument" 会把"这块内核没搬"
 *    说成"你参数没给对"（同类误导在 sleept 上刚修掉过）。`guided` 那条腿还顺带着上游的
 *    `readClipboardText()`（`platform.ts:35-74`，走 `node:child_process`）与硬编码的
 *    `E:\1Hub\EH\2EHV` 默认目标目录（`cli.ts:39`）：缺口沿用台账 **G5**，那条 Windows
 *    路径因此**不进本包**（它既不是 Xaihi 的默认值，也不该是）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.migratef]` 的
 *    `history_path` 与 `enable_undo`（`resolveMigratefDefaults`，`:67-82`）。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md` 那条通路整块不搬，同一些值在
 *    Xaihi 是 `src/index.ts` 的 `Config.historyPath`，独立 bin 读不到（台账 **G2**）⇒
 *    这里直接用上游那份 catch 分支的 `{ enableUndo: true, historyPath: undefined }`
 *    （`:80`），一切以命令行给的为准。`enableUndo` 上游读完从不消费，这里也不发明用途。
 * 4. **账本闸门在动第一条文件之前**（`requireHistoryPath`，ADR-0003 决定 2）：内核
 *    `executePlan` 是先搬文件、后记账本（`core.ts:269`），所以"没给账本位置"必须拦在
 *    跑内核之前，而不是等于"文件动了、撤销记录没落"。后果写在面上：
 *    `xmigratef move` / `copy`（不带 `--dryRun`）与 `history` / `undo` 不给
 *    `--historyPath` ⇒ stderr 一句点名 `Config.historyPath` 的话 + 退出码 1；
 *    `plan` 与带 `--dryRun` 的那两条**不需要配置**也照跑（可见退化，不是崩）。
 *
 * 危险动作在 bin 里照上游执行（`move` / `copy` / `undo` 的真改盘）。宿主面那半边由
 * `danger.pluginExport` 经 `defineNode` 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在
 * 宿主进程里，拿不到那条缝。这与同批的 `crashu` / `formatv` 是同一个取舍
 * （`docs/adr/0003-migrated-node-file-state.md` 决定 1），缺口 **G6**。
 *
 * @module xaihi-migratef/cli
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
  visibleWidth,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import { runInteractionCli } from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import type { MigratefAction, MigratefInput, MigratefMode, MigratePlanItem, MigratefResult } from './core.ts'
import { runMigratef } from './core.ts'
import { createNodeMigratefRuntime, requireHistoryPath } from './platform.ts'
import { createMigratefInteractionSchema, type MigratefInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('migratef')

/** 上游 `cli.ts:482` 与 `:490` 的两处上限：计划清单 30 行、撤销历史 20 条。 */
const PLAN_LINES = 30
const HISTORY_LINES = 20

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Move or copy files with preserve, flat, and direct modes plus undo history.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createMigratefUiDefinition (
  defaults: Partial<MigratefInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<MigratefInput, MigratefResult> {
  const schema = createMigratefInteractionSchema({
    historyPath: defaults.historyPath,
    dryRun: true,
  }, language)
  return {
    schema,
    run: (input, event) => runMigratef(input, createNodeMigratefRuntime(), event),
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
    createDefinition: (defaults, language) => createMigratefUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).MigratefTui,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --source a --target b --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/migratef/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/migratef/src/interaction.ts`，214 行），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的五个工具（\`migratef_plan\` … \`migratef_undo\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'File migrator with preserve/flat/direct modes and an undo journal.',
    },
    subCommands: {
      plan: defineCommand({
        meta: { name: 'plan', description: 'Preview a migration plan.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('plan', args, host)
        },
      }),
      move: defineCommand({
        meta: { name: 'move', description: 'Move files or folders.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('move', args, host)
        },
      }),
      copy: defineCommand({
        meta: { name: 'copy', description: 'Copy files or folders.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('copy', args, host)
        },
      }),
      history: defineCommand({
        meta: { name: 'history', description: 'Show undo history.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('history', args, host)
        },
      }),
      undo: defineCommand({
        meta: { name: 'undo', description: 'Undo a migration batch.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('undo', args, host)
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

/** flag 名逐个对齐上游 `commonArgs()`（`:229-240`），一个都不新增、一个都不改名。 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Comma-separated source paths.' },
    source: { type: 'string', description: 'Comma-separated source paths.' },
    target: { type: 'string', description: 'Target directory.' },
    mode: { type: 'string', description: 'preserve, flat, or direct.' },
    historyPath: { type: 'string', description: 'Undo history JSON path.' },
    batchId: { type: 'string', description: 'Undo batch id.' },
    dryRun: { type: 'boolean', description: 'Preview without changing files.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `:169-176` 那两条 stdin 队列：`source` 或 `path` 给 `-`（或该 flag 没给而 stdin
 * 是管道）就**一次** `readStdinLines` 把整份读进来用 `;` 拼，然后分别赋给两个 flag。
 * 上游读的是同一个 `stdinValue`，这里也读一次——两次读第二份必空，那是 bug 不是形状。
 */
async function resolveStdinQueues (args: CliArgs, host: CliHost): Promise<CliArgs> {
  const readablePipe = hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)
  const sourceFromStdin = args.source === '-' || (args.source === undefined && readablePipe)
  const pathFromStdin = args.path === '-' || (args.path === undefined && readablePipe)
  if (!sourceFromStdin && !pathFromStdin) return args
  const stdinValue = (await readStdinLines(host.stdin)).join(';')
  return {
    ...args,
    ...(sourceFromStdin ? { source: stdinValue } : {}),
    ...(pathFromStdin ? { path: stdinValue } : {}),
  }
}

/**
 * 上游 `inputFromArgs`（`:242-251`）的判据逐条，只是把"可能 undefined 的可选属性"换成
 * 条件展开（本仓的 `exactOptionalPropertyTypes` 关掉是给内核用的，接线层自己按新写法走）。
 * 优先级也照上游：flag 给了就用 flag，否则用配置默认（配置这一层见文件头第 3 条：恒缺省）。
 */
function inputFromArgs (args: CliArgs): MigratefInput {
  const source = typeof args.source === 'string' ? args.source : undefined
  const path = typeof args.path === 'string' ? args.path : undefined
  const mode = typeof args.mode === 'string' ? args.mode : undefined
  const historyPath = typeof args.historyPath === 'string' ? args.historyPath : undefined
  const batchId = typeof args.batchId === 'string' ? args.batchId : undefined
  return {
    sourcePaths: splitArg(source ?? path),
    ...(typeof args.target === 'string' ? { targetPath: args.target } : {}),
    mode: isMode(mode) ? mode : 'preserve' as MigratefMode,
    ...(historyPath === undefined ? {} : { historyPath }),
    ...(batchId === undefined ? {} : { batchId }),
    dryRun: args.dryRun === true,
  }
}

function isMode (value: string | undefined): value is MigratefMode {
  return value === 'preserve' || value === 'flat' || value === 'direct'
}

/** 上游 `runSubcommand`（`:166-178`）：先接 stdin 队列，再拼 action。 */
async function runSubcommand (action: MigratefAction, args: CliArgs, host: CliHost): Promise<void> {
  const merged = await resolveStdinQueues(args, host)
  const input: MigratefInput & { action: MigratefAction } = { action, ...inputFromArgs(merged) }
  // 文件头第 4 条：账本位置没出处就**不跑内核**（内核是先搬后记账）。
  try {
    requireHistoryPath(action, input)
  } catch (error) {
    writeError(host, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  await runAction(input, args.json === true, host)
}

async function runAction (input: MigratefInput & { action: MigratefAction }, json: boolean, host: CliHost): Promise<void> {
  // 上游 `:254-256`：JSON 腿**不接进度回调**（进度会污染 stdout 上的 JSON），
  // 非 JSON 腿走 `runMigratefWithProgress`。
  const result = json
    ? await runMigratef(input, createNodeMigratefRuntime())
    : await runMigratefWithProgress(input, host)

  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeMigratefSummary(host, result)
  if (!result.success) process.exitCode = 1
}

async function runMigratefWithProgress (input: MigratefInput, host: CliHost): Promise<MigratefResult> {
  let progressActive = false
  const result = await runMigratef(input, createNodeMigratefRuntime(), (event) => {
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
  return result
}

/** 上游 `writeMigratefSummary`（`:467-496`）：Summary 五行 + 30 行计划 + Error 面板 + 20 条历史。 */
function writeMigratefSummary (host: CliHost, result: MigratefResult): void {
  const data = result.data
  if (!data) return
  const columns = terminalColumns(host)
  const plan = data.plan ?? []
  const pendingCount = plan.filter((item) => item.status === 'pending').length

  writeRichPanel(host, 'Summary', [
    `moved/copied: ${data.migratedCount}`,
    `skipped: ${data.skippedCount}`,
    `errors: ${data.errorCount}`,
    pendingCount ? `pending: ${pendingCount}` : '',
    `total: ${data.totalCount}`,
  ].filter(Boolean), { color: result.success ? 'green' : 'yellow', minWidth: Math.min(76, columns - 6) })

  for (const item of plan.slice(0, PLAN_LINES)) writeLine(host, formatPlanItem(item, host))
  if (plan.length > PLAN_LINES) writeLine(host, rich(host, `... ${String(plan.length - PLAN_LINES)} more item(s)`, 'grey'))
  if (data.errors.length) writeRichPanel(host, 'Error', data.errors.join('\n'), { color: 'red', minWidth: 76 })

  const history = data.history ?? []
  if (history.length) {
    writeLine(host)
    writeLine(host, rich(host, 'Undo history:', 'cyan'))
    for (const item of history.slice(0, HISTORY_LINES)) {
      const undone = item.undone ? rich(host, ' (undone)', 'grey') : ''
      writeLine(host, `  ${rich(host, item.id, 'magenta')} ${item.action} ${item.operations.length}${undone}`)
    }
    if (history.length > HISTORY_LINES) writeLine(host, rich(host, `... ${String(history.length - HISTORY_LINES)} more record(s)`, 'grey'))
  }
}

/** 上游 `formatPlanItem`（`:498-519`）的判据逐字：非 TTY 整行不截，TTY 按 0.48 分给源路径。 */
function formatPlanItem (item: MigratePlanItem, host: CliHost): string {
  const status = item.status === 'success'
    ? rich(host, 'success', 'green')
    : item.status === 'error'
      ? rich(host, 'error', 'red')
      : item.status === 'skipped'
        ? rich(host, 'skipped', 'yellow')
        : rich(host, 'pending', 'cyan')
  const arrow = ` ${rich(host, '->', 'grey')} `
  const prefix = `${status} `
  if (!host.stdout.isTTY) return `${prefix}${item.sourcePath}${arrow}${item.targetPath || item.reason || ''}`

  const columns = terminalColumns(host)
  const budget = Math.max(0, columns - visibleWidth(prefix) - visibleWidth(arrow))
  if (budget < 20) return `${prefix}${truncateVisible(item.sourcePath, budget)}`

  const sourceWidth = Math.max(8, Math.floor(budget * 0.48))
  const targetWidth = Math.max(0, budget - sourceWidth)
  const source = truncateVisible(item.sourcePath, sourceWidth)
  const target = truncateVisible(item.targetPath || item.reason || '', targetWidth)
  return `${prefix}${source}${arrow}${target}`
}

/** 上游 `splitArg`（`:542-544`）：逗号、分号、换行都算分隔符，逐条 trim 后去空。 */
function splitArg (value: string | undefined): string[] {
  return (value ?? '').split(/[,;\r\n]/).map((item) => item.trim()).filter(Boolean)
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
