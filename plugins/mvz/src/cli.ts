#!/usr/bin/env node
/**
 * mvz 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/mvz/src/cli.ts` 搬。
 *
 * 保留的东西：四条子命令名与顺序（`extract / move / delete / rename`，上游 `:142-177`）、
 * flag 名单（`--entry --entries --file --output --pattern --replacement --separator --near
 * --autoDir --flatten --dryRun --json`，上游 `commonArgs()` 在 `:188-203`）、
 * `-` 读 stdin 那条队列判据与"一个都没给且 stdin 是管道就把整份读进来"的兜底（`:208`）、
 * `entry/entries` 按 `[,;\r\n]` 拆（上游 `splitArg` 在 `:502-504`）、`--file` 走 `readFile`
 * 当 `fileText`（`:206`）、非 JSON 那一段的 **Summary 面板 + 预览行 + 结果行**与
 * `PREVIEW_LIMIT = 50`（`:38`、`:253-288`）、进度条只在非 JSON 时打（`:229-239`）、
 * 以及 `result.success` 为假时退出码 1（`:244`、`:250`）。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **非预演一律拒绝（退出码 2）**：本包的执行走 DSH 的 `ctx.subprocess`
 *    （`src/platform.ts`），独立 bin 不在宿主进程里拿不到那条缝（G1/G6 那一类）。
 *    上游那份 `runCommand` 是 `execFile`（基线 `platform.ts:72-85`），**不搬**——
 *    在 bin 里自己 spawn 等于绕开 `docs/service-mapping.md` 那一行判过的结论。
 *    拒绝**在参数校验之前**：未接的动作先报"你少给了一个 flag"会把"这块缝不在"说成
 *    "你用错了命令"（同一类误导在 `plugins/sleept/src/cli.ts` 的 `at` 上刚被改掉）。
 *    预演那一条腿是真跑的：`core.ts` 在 `dryRun` 为真时一次机器都不碰（`:112`、`:144`、`:218`），
 *    所以用的是同一份内核 + `createMvzPlanRuntime()`，不是终端面另写的假内核。
 * 2. **不读 `[nodes.mvz]` 配置**（上游 `resolveMvzDefaults`，`:58-77`）：按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置住在磁盘上的 toml"通路整块不搬，
 *    同一批默认值现在住在 `src/index.ts` 的 `Config`，独立 bin 读不到（缺口 G2）。
 *    连带后果要写清：上游 `dryRun: args.dryRun ?? defaults.dryRun` 在没有那份文件时**恒为
 *    undefined**，也就是"不带 `--dryRun` 就真起 7-Zip"。这里保留同一个判据（第 1 条那条拒绝
 *    正是它的落点），不把它改成"默认预演"——那会替使用者改掉上游的默认。
 * 3. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`loadScreen` 里的 `./Tui.tsx`）与
 *    `@clack` 引导流（`interaction.ts` + `runGuidedInteraction`），本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**，同 `plugins/nameu/src/cli.ts` 第 2 条。
 *    上游 `guided` 那条腿还依赖 `readClipboardText()`（基线 `platform.ts:22-38`，`node:child_process`），
 *    那一格是 G5 记过的：不搬、不伪造。
 * 4. **无参那一格**：上游 `runInteractionCli` 在无参且非 TTY 时是那句
 *    `No interactive terminal detected.`（退出码 2），本面用 vendored 支撑里的同一个判据
 *    （`src/cli-support.ts` 的 `runNodeCliFace`），不自编"默认跑 extract"。
 * 5. **危险动作在 bin 里没有批准环节可展示**（缺口 G6）：宿主面由 `danger` 变成 DSH 的 `ask`；
 *    这一面第 1 条已经先拒了，所以不提供 `--force` 一类的形状。
 *
 * @module xaihi-mvz/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
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
import type { MvzAction, MvzData, MvzInput, MvzResult } from './core.ts'
import { parseMvzEntries, runMvz } from './core.ts'
import { MVZ_PROCESS_SEAM_REFUSAL, createMvzPlanRuntime } from './platform.ts'
import { createMvzInteractionSchema, type MvzInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('mvz')

/** 上游 `cli.ts:38` 的 `PREVIEW_LIMIT`，预览行与结果行共用。 */
const PREVIEW_LIMIT = 50

/** 动作名单的唯一真源是 `package.json#xaihi.node.actions`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS: readonly MvzAction[] = ['extract', 'move', 'delete', 'rename']

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Delete, extract, move, or rename archive-internal files from archive//path lines.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createMvzUiDefinition (
  defaults: Partial<MvzInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<MvzInput, MvzResult> {
  const schema = createMvzInteractionSchema(defaults, language)
  return {
    schema,
    run: (input, event) => runMvz(input, createMvzPlanRuntime(), event),
  }
}

/** 派发形状接入 @hibernalglow/xaihi-cli-runtime 的 runInteractionCli。 */
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
    createDefinition: (defaults, language) => createMvzUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).MvzTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  const actionSpec = (action: MvzAction, description: string): CliCommandSpec => defineCommand({
    meta: { name: action, description },
    args: commonArgs(),
    async run ({ args }) {
      await runAction(action, args, host)
    },
  })

  return defineCommand({
    meta: { name: CLI_NAME, description: '7-Zip archive member workflow: dry-run plans on the terminal face, execution on the host face.' },
    subCommands: {
      // 描述逐条抄上游 `:143`、`:152`、`:161`、`:170`。
      extract: actionSpec('extract', 'Extract matching archive-internal files.'),
      move: actionSpec('move', 'Extract matching files, then delete them from archives.'),
      delete: actionSpec('delete', 'Delete matching archive-internal files.'),
      rename: actionSpec('rename', 'Rename matching archive-internal files with a regex replacement.'),
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
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

/**
 * flag 名与说明逐条对齐上游 `commonArgs()`（`:188-203`）。
 * 上游那批 `boolean` flag 没有 `default`，本仓 vendored 解析器也没有——于是 `--near` 缺席就是
 * `undefined`，交给内核用它自己的缺省（文件头第 2 条那个口径）。
 */
function commonArgs () {
  return {
    entry: { type: 'string', description: 'Single archive//internal entry.' },
    entries: { type: 'string', description: 'Newline, comma, or semicolon separated archive//internal entries.' },
    file: { type: 'string', description: 'Text file containing archive//internal entries.' },
    output: { type: 'string', description: 'Output directory for extract or move.' },
    pattern: { type: 'string', description: 'Regex pattern for rename.' },
    replacement: { type: 'string', description: 'Replacement text for rename.' },
    separator: { type: 'string', description: 'Archive/internal separator, default //.' },
    near: { type: 'boolean', description: 'Extract next to each archive.' },
    autoDir: { type: 'boolean', description: 'Append archive stem as output folder.' },
    flatten: { type: 'boolean', description: 'Use 7z e instead of 7z x.' },
    dryRun: { type: 'boolean', description: 'Plan commands without executing 7-Zip. This is the only leg the standalone bin can run.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/** 上游 `splitArg`（`:502-504`）：seed 在前，`[,;\r\n]` 拆，逐项 trim 后去空。 */
function splitArg (value: string | undefined, seed: string[] = []): string[] {
  return [...seed, ...(value ?? '').split(/[,;\r\n]/)].map((item) => item.trim()).filter(Boolean)
}

/**
 * 上游 `inputFromArgs`（`:205-225`）里"条目从哪来"那一刀，逐条对齐：
 * `--entry -` / `--entries -` 都把整份 stdin 当队列；两个都没给且 stdin 是管道时同样读 stdin。
 * （`Symbol.asyncIterator` 那条守卫是上游同款判据，防止在不可异步迭代的假 stdin 上直接抛。）
 */
async function resolveEntries (args: CliArgs, host: CliHost): Promise<string[]> {
  const entry = typeof args.entry === 'string' ? args.entry : undefined
  const entries = typeof args.entries === 'string' ? args.entries : undefined
  const wantsStdin = entry === '-' || entries === '-'
    || (entry === undefined && entries === undefined
      && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))
  if (wantsStdin) return await readStdinLines(host.stdin)
  return splitArg(entries, entry === undefined ? [] : [entry])
}

/**
 * flag → 内核输入。
 *
 * `dryRun` **不做任何兜底**：上游是 `args.dryRun ?? defaults.dryRun`，那份 defaults 来自
 * `xiranite.config.toml`（本仓没有，见文件头第 2 条），所以省略时就是 `undefined` ⇒ 内核执行。
 * 这一格在执行之前就被 `runAction` 拒掉了，`undefined` 因此只出现在拒绝路径上。
 */
async function inputFromArgs (action: MvzAction, args: CliArgs, host: CliHost): Promise<MvzInput> {
  const fileText = typeof args.file === 'string' ? await readFile(args.file, 'utf8') : undefined
  const files = await resolveEntries(args, host)
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined
  const output = text(args.output)
  const pattern = text(args.pattern)
  const replacement = text(args.replacement)
  const separator = text(args.separator)
  return {
    action,
    ...(fileText === undefined ? {} : { fileText }),
    files,
    ...(output === undefined ? {} : { output }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(replacement === undefined ? {} : { replacement }),
    ...(separator === undefined ? {} : { separator }),
    ...(typeof args.near === 'boolean' ? { near: args.near } : {}),
    ...(typeof args.autoDir === 'boolean' ? { autoDir: args.autoDir } : {}),
    ...(typeof args.flatten === 'boolean' ? { flatten: args.flatten } : {}),
    ...(typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
  }
}

async function runAction (action: MvzAction, args: CliArgs, host: CliHost): Promise<void> {
  // 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  const json = args.json === true

  // 第 1 处偏离：要起 7-Zip 的那条路在这里拒绝，**在任何参数校验与 stdin 读取之前**。
  if (args.dryRun !== true) {
    refuse(action, args, host, json)
    return
  }

  const input = await inputFromArgs(action, args, host)
  // 上游的 runAction 会转发进度（`:229-239`）：JSON 模式下丢掉，非 JSON 打进度条。
  let progressActive = false
  const result = await runMvz(input, createMvzPlanRuntime(), (event) => {
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
    return
  }
  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeSummary(host, result)
  if (!result.success) process.exitCode = 1
}

/**
 * 拒绝那一格：`--json` 的载荷与 stderr 用同一句话（`MVZ_PROCESS_SEAM_REFUSAL`，真源在
 * `src/platform.ts`，两处不分叉）。载荷里带上**已经解析出来的条目数与压缩包数**——那是纯函数
 * `parseMvzEntries` 的产物，所以"给你看你要动什么"这一步不算假绿，也没有碰机器。
 */
function refuse (action: MvzAction, args: CliArgs, host: CliHost, json: boolean): void {
  const parsed = parseMvzEntries(splitArg(
    typeof args.entries === 'string' ? args.entries : undefined,
    typeof args.entry === 'string' ? [args.entry] : [],
  ))
  const archives = new Set(parsed.map((entry) => entry.archivePath)).size
  const report = {
    node: 'mvz',
    action,
    entryCount: parsed.length,
    archives,
    dryRun: false,
    executed: false,
    refused: MVZ_PROCESS_SEAM_REFUSAL,
  }
  if (json) writeJson(host, report)
  writeError(host, `${CLI_NAME} ${action} 未接：${MVZ_PROCESS_SEAM_REFUSAL}`)
  process.exitCode = 2
}

/** 上游 `writeMvzSummary`（`:253-288`）：Summary 面板 + 预览段 + 结果段，两处都截到 50。 */
function writeSummary (host: CliHost, result: MvzResult): void {
  const data = result.data as MvzData | undefined
  if (data === undefined) return
  const columns = terminalColumns(host)
  writeRichPanel(host, 'Summary', [
    `action: ${data.action}`,
    `archives: ${String(data.totalArchives)}  files: ${String(data.totalFiles)}`,
    `success: ${String(data.successCount)}  failed: ${String(data.failedCount)}`,
  ], { color: result.success ? 'green' : 'yellow', minWidth: 76 })

  if (data.preview.length) {
    writeLine(host, rich(host, '待执行命令预览：', 'cyan'))
    for (const item of data.preview.slice(0, PREVIEW_LIMIT)) {
      const action = rich(host, item.action, 'magenta')
      const arrow = rich(host, '->', 'grey')
      const command = truncateVisible(item.command ?? '', Math.max(0, columns - 6))
      writeLine(host, `  ${action} ${item.archive} ${arrow} ${command}`)
    }
    if (data.preview.length > PREVIEW_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${String(data.preview.length - PREVIEW_LIMIT)} 条预览`, 'grey'))
    }
  }

  if (data.results.length) {
    writeLine(host, rich(host, '执行结果：', 'cyan'))
    for (const item of data.results.slice(0, PREVIEW_LIMIT)) {
      const status = item.success ? rich(host, 'ok', 'green') : rich(host, 'fail', 'red')
      const action = rich(host, item.action, 'magenta')
      const archive = truncateVisible(item.archive, Math.max(0, columns - 8))
      writeLine(host, `  ${status} ${action} ${archive}`)
      if (item.message) writeLine(host, rich(host, `    ${item.message}`, 'grey'))
    }
    if (data.results.length > PREVIEW_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${String(data.results.length - PREVIEW_LIMIT)} 条结果`, 'grey'))
    }
  }
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包与文件，
 * 并且**不做任何参数校验**（见文件头第 3 条）。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} extract --entry archive.zip//file.txt --dryRun --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/mvz/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/mvz/src/interaction.ts`），本包不引它；'
      + '那条腿还依赖剪贴板读取（G5：`readClipboardText` 没搬）'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧的工具 \`mvz_extract\` 那一组。`)
  process.exitCode = 2
}

/** 上游 `writeProgress`（`:506-512`）：TTY 走行内覆盖，非 TTY 成行打印。 */
function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

/** 上游 `endProgress`（`:514-516`）。 */
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
