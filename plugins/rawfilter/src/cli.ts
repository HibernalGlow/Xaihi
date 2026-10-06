#!/usr/bin/env node
/**
 * rawfilter 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/rawfilter/src/cli.ts`
 * （479 行）搬来其中"非交互"的那几棵：`scan` / `plan` / `execute` 三个子命令
 * （上游 `:154-196`）、`commonArgs` 的 flag 名（`:198-209`）、stdin 取路径那两条兜底
 * （`:211-215`）、进度条与彩色汇总（`:228-252` + `:388-415`），以及
 * `result.success` 为假时退出码 1。
 *
 * 保留的上游形状，逐条：
 * - 非 JSON 先画覆盖当前行的进度（TTY 才 `\r` + 清行，非 TTY 就逐行打，`:448-458`），
 *   结论行按 `success` 上绿/红（`:249`）；
 * - 汇总面板三行 `archives / groups / duplicate`、`kept / trash / multi / shortcut`、
 *   `errors / skipped`（`:391-395`），计划行 **最多 80 条** 加 `... N more item(s)`
 *   （`:397-398`），有错误再补一块红色 Error 面板（`:399`）；
 * - 一行计划的拼法是 `状态 去向 文件名 -> 目标`，没有目标时是 `状态 去向 文件名 / 原因`
 *   （`:413`），状态与去向各有颜色（`:403-412`）。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`Tui.tsx`）与 `@clack/prompts`
 *    那套引导流（`:254-303` 的 `runGuided` + `interaction.ts` 的字段表）。本仓没有那两个包，
 *    也不许引 `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报
 *    "Missing required argument" 会把"这块内核没搬"说成"你参数没给对"。
 *    那条流里还挂着一件只有它才做的事：**从剪贴板取路径**（`:417` → 上游 `platform.ts:20-59`
 *    的 `execFile` 调 `pbpaste` / `powershell.exe`）。执行外部程序在 DSH 有 `ctx.subprocess`
 *    （`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬」），而独立 bin 不在宿主进程里拿不到
 *    那条缝 ⇒ **不搬、不伪造**，未接的报错里点名它（`G-terminal-clipboard`）。
 * 2. **`@xiranite/config` 那一层不读**：上游 `resolveRawfilterDefaults()`（`:54-72`）从
 *    `[nodes.rawfilter]` 取 `name_only_mode` / `create_shortcuts` / `trash_only` /
 *    `min_similarity` / `dry_run` 当缺省。按 `docs/adr/0013-config-goes-through-dsh-settings.md`
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里的 defaults 是空的，
 *    缺省落回内核自己那一套（`core.ts:156-166`）。**连带后果**：内核的 `dryRun` 默认是
 *    **false**，所以 `xrawfilter execute` 不带 `--dryRun` 就是真搬——与上游 bin 一致，
 *    不在这儿偷偷替它加一道上游没有的闸门。
 * 3. **`defaults.dry_run ?? ` 那一路径不存在**：上游用配置文件把 dry-run 兜住，这里只剩
 *    `--dryRun` / `--no-dryRun` 两种显式写法（flag 名与上游 `commonArgs` 逐字相同）。
 * 4. **危险动作在 bin 里照上游执行**：宿主面由 `danger.all` 变成 DSH 的 `ask`，审批在宿主；
 *    bin 拿不到那条缝，与 `samea` / `dissolvef` 同一取舍
 *    （`docs/adr/0003-migrated-node-file-state.md` 决定 1）。**记为缺口 `G-terminal-approval`**。
 *
 * @module xaihi-rawfilter/cli
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
  visibleWidth,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { RawfilterAction, RawfilterInput, RawfilterPlanItem, RawfilterResult } from './core.ts'
import { runRawfilter } from './core.ts'
import { createNodeRawfilterRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('rawfilter')

/** 非 JSON 时最多打几行计划（上游 `cli.ts:397` 那个 80，不在这里另定一个数）。 */
const PLAN_LINES = 80

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Group similar archives and move duplicate/raw versions to trash or multi.',
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
      + '引导流里那条"从剪贴板读路径"要 DSH 的 `ctx.subprocess`（独立 bin 拿不到），'
      + `脚本化请用 \`${CLI_NAME} plan --path <目录> --json\`。`,
  })
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包与文件，
 * 并且**不做任何参数校验**（见文件头第 1 条）。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --path <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/rawfilter/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/rawfilter/src/cli.ts:254-303` + `interaction.ts`），本包不引它；'
      + '它附带"从剪贴板读路径"那条要 DSH 的 `ctx.subprocess`，独立 bin 不在宿主进程里'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/rawfilter\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Archive similarity filter: group duplicates, keep the translated version, move the rest.',
    },
    subCommands: {
      scan: defineCommand({
        meta: { name: 'scan', description: 'Scan and group archives without changing files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSub('scan', args, host)
        },
      }),
      plan: defineCommand({
        meta: { name: 'plan', description: 'Preview file operations.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSub('plan', args, host)
        },
      }),
      execute: defineCommand({
        meta: { name: 'execute', description: 'Move duplicate/raw versions according to the plan (needs --no-dryRun to actually move).' },
        args: commonArgs(),
        async run ({ args }) {
          await runSub('execute', args, host)
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
        meta: { name: 'gd', description: 'Open the rich guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('gd', host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** flag 名逐字对齐上游 `commonArgs()`（`:198-209`），含 `nameOnly` 与 `nameOnlyMode` 这一对别名。 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Directory containing archive files. Use "-" to take the first path from stdin.' },
    nameOnly: { type: 'boolean', description: 'Use exact normalized names only.' },
    nameOnlyMode: { type: 'boolean', description: 'Alias for --nameOnly.' },
    createShortcuts: { type: 'boolean', description: 'Create shortcuts for multi versions instead of moving them.' },
    trashOnly: { type: 'boolean', description: 'Move every non-kept duplicate to trash.' },
    minSimilarity: { type: 'string', description: 'Fuzzy grouping threshold from 0 to 1.' },
    dryRun: { type: 'boolean', description: 'Preview without changing files. On execute, --no-dryRun moves for real (kernel default is false).' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

interface RawfilterCliOptions {
  path?: string
  nameOnly?: boolean
  nameOnlyMode?: boolean
  createShortcuts?: boolean
  trashOnly?: boolean
  minSimilarity?: string
  dryRun?: boolean
  json?: boolean
}

/**
 * 上游 `resolveRawfilterArgs`（`:211-215`）：`--path -` 或"没给 path 且 stdin 是管道"时，
 * 取 stdin 的**第一行**当目录。那条 `Symbol.asyncIterator` 守卫是本仓加的（与 linedup /
 * samea 同一写法）：没有它，非异步可迭代的 stdin（测试宿主、被重定向的怪 stdin）会在
 * `for await` 上直接抛 TypeError，把"你没给路径"说成"内核崩了"。
 */
async function resolveRawfilterArgs (options: RawfilterCliOptions, host: CliHost): Promise<RawfilterCliOptions> {
  const wantsStdin = options.path === '-' || (!options.path && hasPipedInput(host.stdin))
  if (!wantsStdin || !(Symbol.asyncIterator in Object(host.stdin))) return options
  const stdinLine = (await readStdinLines(host.stdin))[0] ?? ''
  return { ...options, path: stdinLine }
}

/** 上游 `inputFromArgs`（`:217-226`）；`defaults`（配置文件那一层）在本仓是空的，见文件头第 2 条。 */
function inputFromArgs (args: RawfilterCliOptions): RawfilterInput {
  const nameOnlyMode = args.nameOnly ?? args.nameOnlyMode
  const minSimilarity = args.minSimilarity !== undefined ? numberArg(args.minSimilarity) : undefined
  return {
    ...(args.path === undefined ? {} : { path: args.path }),
    ...(nameOnlyMode === undefined ? {} : { nameOnlyMode }),
    ...(args.createShortcuts === undefined ? {} : { createShortcuts: args.createShortcuts }),
    ...(args.trashOnly === undefined ? {} : { trashOnly: args.trashOnly }),
    ...(minSimilarity === undefined ? {} : { minSimilarity }),
    ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
  }
}

async function runSub (action: RawfilterAction, args: CliArgs, host: CliHost): Promise<void> {
  const options = await resolveRawfilterArgs(args as RawfilterCliOptions, host)
  await runAction({ action, ...inputFromArgs(options) }, options.json === true, host)
}

async function runAction (input: RawfilterInput & { action: RawfilterAction }, json: boolean, host: CliHost): Promise<void> {
  let progressActive = false
  const result: RawfilterResult = await runRawfilter(input, createNodeRawfilterRuntime(), (event) => {
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
  writePlanSummary(host, result)
  if (!result.success) process.exitCode = 1
}

/** 上游 `writePlanSummary`（`:388-400`）逐字：三行汇总 + 最多 80 条计划 + 红色 Error 面板。 */
function writePlanSummary (host: CliHost, result: RawfilterResult): void {
  const data = result.data
  if (!data) return
  writeRichPanel(host, 'Summary', [
    `archives: ${data.archiveCount}  groups: ${data.totalGroups}  duplicate: ${data.duplicateGroups}`,
    `kept: ${data.keptCount}  trash: ${data.movedToTrash}  multi: ${data.movedToMulti}  shortcut: ${data.createdShortcuts}`,
    `errors: ${data.errorCount}  skipped: ${data.skippedFiles}`,
  ], { color: result.success ? 'green' : 'yellow', minWidth: 76 })

  for (const item of data.plan.slice(0, PLAN_LINES)) writeLine(host, formatPlanItem(item, host))
  if (data.plan.length > PLAN_LINES) writeLine(host, rich(host, `... ${data.plan.length - PLAN_LINES} more item(s)`, 'grey'))
  if (data.errors.length) writeRichPanel(host, 'Error', data.errors.join('\n'), { color: 'red', minWidth: 76 })
}

/** 上游 `formatPlanItem`（`:402-415`）逐字：状态与去向各有颜色，文件名按剩余列宽截断。 */
function formatPlanItem (item: RawfilterPlanItem, host: CliHost): string {
  const status = item.status === 'success'
    ? rich(host, 'success', 'green')
    : item.status === 'error'
      ? rich(host, 'error', 'red')
      : item.status === 'skipped'
        ? rich(host, 'skipped', 'yellow')
        : item.status === 'kept'
          ? rich(host, 'kept', 'blue')
          : rich(host, 'pending', 'cyan')
  const destination = rich(host, item.destination, item.destination === 'trash' ? 'red' : item.destination === 'multi' ? 'magenta' : item.destination === 'shortcut' ? 'cyan' : 'blue')
  const suffix = item.targetPath ? ` -> ${truncateVisible(item.targetPath, 48)}` : ` / ${item.reason}`
  return `${status} ${destination} ${truncateVisible(item.fileName, terminalColumns(host) - visibleWidth(`${status} ${destination} `) - 24)}${suffix}`
}

function numberArg (value?: string | number): number | undefined {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 上游 `writeProgress`（`:448-454`）：TTY 才覆盖当前行，否则逐行打。 */
function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

/** 上游 `endProgress`（`:456-458`）：覆盖过当前行就要补一个换行，否则下一行会接在后面。 */
function endProgress (host: CliHost, active = true): void {
  if (active && host.stdout.isTTY) host.stdout.write('\n')
}

/**
 * 自执行闸门：与 linedup / samea 同一写法（`.bin` 软链下 argv[1] 未必等于
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
