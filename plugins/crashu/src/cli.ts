#!/usr/bin/env node
/**
 * crashu 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/crashu/src/cli.ts`
 * （553 行）搬来。保留的东西：子命令名 `scan` / `plan` / `move` 与 `execute` 这个别名、
 * 全部 13 个 flag 名（`--source` / `--sourcePaths` / `--targetPath` / `--targetNames` /
 * `--destinationPath` / `--threshold` / `--similarityThreshold` / `--autoMove` /
 * `--moveDirection` / `--conflictPolicy` / `--pairsFileName` / `--dryRun` / `--json`）、
 * `-` 读 stdin 那两条队列（上游 `:189`：`sourcePaths` 整份读进来用 `;` 拼、`source` 只取
 * 第一行）、分隔符 `/[,;\r\n]/`（上游 `splitArg`，`:511`）、非 JSON 时的进度条 +
 * Summary 面板 + `相似文件夹` / `移动计划` 两段列表与**各 40 行上限**（上游 `:300` 与
 * `:311` 的 `slice(0, 40)`）、超出时那句 `... 还有 N 个匹配` / `... 还有 N 条计划`
 * （`:305` / `:324`）、以及 `result.success` 为假时退出码 1。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，
 *    退出码 2）。与同批的 timeu 是同一处理由，不在这里再抄一份第二参数解析器。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 的 `runGuidedInteraction` + `./interaction.ts`（rich prompt 那一整套），
 *    本仓没有那两个包也不许引 `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报
 *    "Missing required argument" 会把"这块内核没搬"说成"你参数没给对"（同类误导在 sleept
 *    上刚修掉过）。`guided` 那条腿还顺带着上游的 `readClipboardText()`（剪贴板读路径）与
 *    两个硬编码默认目录（`cli.ts:36-37`）；缺口记为 `G-clipboard-guided`。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.crashu.output]` 的
 *    `pairs_file_name` / `directory` / `overwrite`（`resolveCrashuDefaults`，`:155-178`）。
 *    按 `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是
 *    `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里直接用上游那份 `fallback`
 *    （`pairsFileName: "folder_pairs.json"`、`directory: undefined`、`overwrite: false`，
 *    即 `:156-160`），一切以命令行给的为准；内核默认（`dryRun ?? false`、阈值 `0.6`）
 *    因此就是 bin 的默认 ⇒ `move` / `execute` 在 bin 上**默认真搬盘**（这两条子命令把
 *    `autoMove` 顶真，`core.ts:148` 那四条判据就只剩 `dryRun` 拦着），
 *    **要预演得显式写 `--dry-run`**；工作台那侧不一样：定义里的 `dryRun` 默认是 `true`。
 * 4. **危险动作在 bin 里照上游执行**（`move` 的真搬盘）。宿主面那半边由 `danger.all`
 *    变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，拿不到那条缝。这与同批的
 *    `timeu` / `dissolvef` 是同一个取舍（`docs/adr/0003-migrated-node-file-state.md` 决定 1）。
 *    **记为缺口**：`G-terminal-approval`。
 *
 * @module xaihi-crashu/cli
 */

import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinLines,
  renderProgressBar,
  rich,
  runNodeCliFace,
  runPipeProgram,
  terminalColumns,
  truncateVisible,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { CrashuAction, CrashuConflictPolicy, CrashuData, CrashuInput, CrashuMoveDirection } from './core.ts'
import { runCrashu } from './core.ts'
import { createNodeCrashuRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('crashu')

/** 上游 `cli.ts:39` 的 `DEFAULT_PAIRS_FILE`，也是内核 `normalizeCrashuInput` 用的那个默认名。 */
const DEFAULT_PAIRS_FILE = 'folder_pairs.json'

/** 上游 `cli.ts:300` / `:311` 的两处 `slice(0, 40)`：相似清单与计划清单各 40 行。 */
const SUMMARY_LINES = 40

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Match similar folder names and optionally move matched folders.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + `脚本化请用 \`${CLI_NAME} scan --sourcePaths <文本> --json\`。`,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} scan --source <folder> --targetPath <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/crashu/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/crashu/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/crashu\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Folder similarity matcher with guided terminal mode.',
    },
    subCommands: {
      scan: defineCommand({
        meta: { name: 'scan', description: 'Find similar folders.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('scan', args, host)
        },
      }),
      plan: defineCommand({
        meta: { name: 'plan', description: 'Preview move operations.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('plan', args, host)
        },
      }),
      move: defineCommand({
        meta: { name: 'move', description: 'Move matched folders.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('move', args, host)
        },
      }),
      // 上游 `cli.ts:208-215`：`execute` 是 `move` 的别名，同样把 autoMove 顶成真。
      execute: defineCommand({
        meta: { name: 'execute', description: 'Alias for move.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('execute', args, host)
        },
      }),
      // ↓ 上游有、本包没带的那三条腿：面在这儿，实现不在这儿。
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        async run () {
          await runUnwiredFace('ui', host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('gd', host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Open the rich guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** flag 名逐个对齐上游 `commonArgs()`（`:226-242`），一个都不新增、一个都不改名。 */
function commonArgs () {
  return {
    source: { type: 'string', description: 'Source directory. Repeat with --sourcePaths for more.' },
    sourcePaths: { type: 'string', description: 'Comma, semicolon, or newline separated source directories.' },
    targetPath: { type: 'string', description: 'Directory whose child folder names are targets.' },
    targetNames: { type: 'string', description: 'Comma, semicolon, or newline separated target names.' },
    destinationPath: { type: 'string', description: 'Move destination root.' },
    threshold: { type: 'string', description: 'Similarity threshold from 0 to 1.' },
    similarityThreshold: { type: 'string', description: 'Similarity threshold from 0 to 1.' },
    autoMove: { type: 'boolean', description: 'Allow move actions.' },
    moveDirection: { type: 'string', description: 'to_target or to_source.' },
    conflictPolicy: { type: 'string', description: 'skip, overwrite, or rename.' },
    pairsFileName: { type: 'string', description: 'Pairs JSON file name.' },
    dryRun: { type: 'boolean', description: 'Preview without moving.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/** 上游 `cli.ts:156-160` 那份 `fallback`：没有配置文件时 `resolveCrashuDefaults` 返回的就是它。 */
interface CrashuOutputDefaults {
  pairsFileName: string
  directory?: string
  overwrite: boolean
}

const CONFIG_LESS_DEFAULTS: CrashuOutputDefaults = {
  pairsFileName: DEFAULT_PAIRS_FILE,
  directory: undefined,
  overwrite: false,
}

/**
 * 上游 `:189` 那两条 stdin 队列：`sourcePaths` 给 `-`（或没给而 stdin 是管道）就整份读进来
 * 用 `;` 拼回去，`source` 同条件只取第一行。上游是两条各自 `await readStdinLines(...)`，
 * 第二次拿到的是空数组——这里保持同一个形状，不"优化"成只读一次。
 */
async function resolveStdinQueues (args: CliArgs, host: CliHost): Promise<{ sourcePaths?: string; source?: string }> {
  const piped = hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)
  const wantsPaths = args.sourcePaths === '-' || (args.sourcePaths === undefined && piped)
  const wantsSource = args.source === '-' || (args.source === undefined && piped)
  if (!wantsPaths && !wantsSource) return {}
  const pathsQueue = wantsPaths ? await readStdinLines(host.stdin) : []
  const sourceQueue = wantsSource ? await readStdinLines(host.stdin) : []
  return {
    ...(wantsPaths ? { sourcePaths: pathsQueue.join(';') } : {}),
    ...(sourceQueue.length > 0 ? { source: sourceQueue[0] } : {}),
  }
}

/**
 * 上游 `inputFromArgs`（`:244-257`）的判据逐条，只是把"可能 undefined 的可选属性"换成条件
 * 展开：本仓的 `exactOptionalPropertyTypes` 不吃 `sourcePaths: string[] | undefined`。
 * 优先级也照上游：flag 给了就用 flag，否则用配置默认（配置这一层见文件头第 3 条）。
 */
function inputFromArgs (args: CliArgs, defaults: CrashuOutputDefaults): CrashuInput {
  const sourcePaths = splitArg(args.sourcePaths, typeof args.source === 'string' ? [args.source] : [])
  const targetNames = splitArg(args.targetNames)
  const destinationPath = typeof args.destinationPath === 'string' ? args.destinationPath : defaults.directory
  const similarityThreshold = numberArg(args.similarityThreshold ?? args.threshold)
  const conflictPolicy = resolveConflictPolicy(
    typeof args.conflictPolicy === 'string' ? args.conflictPolicy : undefined,
    defaults.overwrite,
  )
  const moveDirection = isDirection(args.moveDirection) ? args.moveDirection : undefined
  const pairsFileName = typeof args.pairsFileName === 'string' ? args.pairsFileName : defaults.pairsFileName
  return {
    ...(sourcePaths.length === 0 ? {} : { sourcePaths }),
    ...(targetNames.length === 0 ? {} : { targetNames }),
    ...(typeof args.targetPath === 'string' ? { targetPath: args.targetPath } : {}),
    ...(destinationPath === undefined || destinationPath === '' ? {} : { destinationPath }),
    ...(similarityThreshold === undefined ? {} : { similarityThreshold }),
    ...(typeof args.autoMove === 'boolean' ? { autoMove: args.autoMove } : {}),
    ...(moveDirection === undefined ? {} : { moveDirection }),
    ...(conflictPolicy === undefined ? {} : { conflictPolicy }),
    ...(pairsFileName === '' ? {} : { pairsFileName }),
    ...(typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
  }
}

/** 上游 `:189/:197/:205/:213` 四条子命令体：`move` 与 `execute` 都在 args 之后把 autoMove 顶真。 */
async function runSubcommand (action: CrashuAction, args: CliArgs, host: CliHost): Promise<void> {
  const queues = await resolveStdinQueues(args, host)
  const merged: CliArgs = { ...args, ...queues }
  const input: CrashuInput & { action: CrashuAction } = {
    action,
    ...inputFromArgs(merged, CONFIG_LESS_DEFAULTS),
    ...(action === 'move' || action === 'execute' ? { autoMove: true } : {}),
  }
  await runAction(input, args.json === true, host)
}

async function runAction (input: CrashuInput & { action: CrashuAction }, json: boolean, host: CliHost): Promise<boolean> {
  let progressActive = false
  const result = await runCrashu(input, createNodeCrashuRuntime(), (event) => {
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
    return result.success
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeCrashuSummary(host, result.data)
  if (!result.success) process.exitCode = 1
  return result.success
}

/** 上游 `writeCrashuSummary`（`:286-330`）：Summary 面板 + 两段列表 + Error 面板，行限 40。 */
function writeCrashuSummary (host: CliHost, data: CrashuData | undefined): void {
  if (!data) return

  const columns = terminalColumns(host)
  const summaryLines = [
    `matched: ${rich(host, String(data.similarFound), 'yellow')}  moved: ${rich(host, String(data.movedCount), 'green')}  skipped: ${rich(host, String(data.skippedCount), 'grey')}  errors: ${rich(host, String(data.errorCount), data.errorCount ? 'red' : 'grey')}`,
    data.pairsFile ? `pairsFile: ${data.pairsFile}` : '',
  ].filter(Boolean)
  writeRichPanel(host, 'Summary', summaryLines, { color: data.errorCount ? 'yellow' : 'green', minWidth: Math.min(76, columns - 6) })

  if (data.similarFolders.length) {
    writeLine(host)
    writeLine(host, rich(host, '相似文件夹：', 'cyan'))
    for (const item of data.similarFolders.slice(0, SUMMARY_LINES)) {
      const percent = rich(host, `${Math.round(item.similarity * 100)}%`, 'yellow')
      const arrow = rich(host, '->', 'grey')
      writeLine(host, `  ${percent}  ${truncateVisible(item.path, Math.max(20, columns - 32))}  ${arrow}  ${item.target}`)
    }
    if (data.similarFolders.length > SUMMARY_LINES) writeLine(host, rich(host, `  ... 还有 ${String(data.similarFolders.length - SUMMARY_LINES)} 个匹配`, 'grey'))
  }

  if (data.plan.length) {
    writeLine(host)
    writeLine(host, rich(host, '移动计划：', 'cyan'))
    for (const item of data.plan.slice(0, SUMMARY_LINES)) {
      const status = item.status === 'success'
        ? rich(host, 'success', 'green')
        : item.status === 'error'
          ? rich(host, 'error', 'red')
          : item.status === 'skipped'
            ? rich(host, 'skipped', 'yellow')
            : rich(host, 'planned', 'cyan')
      const tail = item.destinationPath
        ? `  ${rich(host, '->', 'grey')}  ${truncateVisible(item.destinationPath, Math.max(20, columns - 40))}`
        : `  ${rich(host, '/', 'grey')}  ${item.reason}`
      writeLine(host, `  ${status}  ${truncateVisible(item.sourcePath, Math.max(20, columns - 40))}${tail}`)
    }
    if (data.plan.length > SUMMARY_LINES) writeLine(host, rich(host, `  ... 还有 ${String(data.plan.length - SUMMARY_LINES)} 条计划`, 'grey'))
  }

  if (data.errors.length) {
    writeRichPanel(host, 'Error', data.errors.join('\n'), { color: 'red', minWidth: Math.min(76, columns - 6) })
  }
}

/** 上游 `cli.ts:510-532` 那四个小函数，判据逐字（`splitArg` 的三字符分隔符、`numberArg` 的 isFinite）。 */
function splitArg (value: string | boolean | undefined, seed: string[] = []): string[] {
  return [...seed, ...String(typeof value === 'string' ? value : '').split(/[,;\r\n]/)].map((item) => item.trim()).filter(Boolean)
}

function numberArg (value: string | number | boolean | undefined): number | undefined {
  // 上游签名是 `string | number`；本仓的 flag 表把值收成 `string | boolean | undefined`，
  // 而 `--threshold` / `--similarityThreshold` 都是 string 型 ⇒ 布尔进不来，挡掉只为过类型。
  if (typeof value === 'boolean') return undefined
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isDirection (value: string | boolean | undefined): value is CrashuMoveDirection {
  return value === 'to_target' || value === 'to_source'
}

function isConflict (value?: string): value is CrashuConflictPolicy {
  return value === 'skip' || value === 'overwrite' || value === 'rename'
}

function resolveConflictPolicy (value: string | undefined, overwriteDefault: boolean): CrashuConflictPolicy | undefined {
  if (isConflict(value)) return value
  if (value === undefined && overwriteDefault) return 'overwrite'
  return undefined
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

/**
 * 自执行闸门：与 linedup / dissolvef / timeu 同一写法（`.bin` 软链下 argv[1] 未必等于
 * `import.meta.url`，而聚合 CLI 引本模块时 argv[1] 是它自己的入口，两条都不该点亮）。
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
