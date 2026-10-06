#!/usr/bin/env node
/**
 * Repacku 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/repacku/src/cli.ts`
 * （**605 行**）搬来其中"非交互"的那几棵：五条子命令 `analyze` / `compress` / `full` /
 * `single-pack` / `gallery-pack`（上游 `:223-270`）、`commonArgs` 的 flag 名与拼法
 * （`:272-290`，含 `config`/`configPath`、`output`/`outputPath` 两对别名与
 * `gallery`/`single` 那两条 `compress` 下的兼容别名）、stdin 取路径那两条兜底
 * （`:451-461`）、进度条 + 结论行 + Summary 三行 + 最多 80 条操作行 + 红色 Error 面板
 * （`:498-532`、`:576-596`），以及 `result.success` 为假时退出码 1。
 *
 * 内核仍然是本包的 `src/core.ts`（同一份 `runRepacku`，不另写第二套逻辑），跑的是
 * `src/platform.ts` 的 `createRepackuPlannerRuntime()`。
 *
 * 与上游最大的不同**只有一条**，而且它不是"没做完"，是本仓的边界：
 * **真压缩在独立 bin 里一律拒绝（退出码 2），点名缺的那条缝。**
 * 上游这里直接 `execFile` 7z / PowerShell（`platform.ts:1,203-236`）；Xaihi 侧执行外部程序
 * 只有 DSH 的 `ctx.subprocess`（Provider `dsh-subprocess-local`），那条缝接在
 * `src/index.ts` 里，bin 不在宿主进程里拿不到它 ⇒ 见 `REPACKU_EXECUTION_REFUSAL`
 * （`src/platform.ts`）。落点因此是台账 G1 写的那条口径："bin 面 = 计划器 + 只读查询"：
 * - `analyze`（扫目录 + 写一份 config JSON）与**任何动作配 `--dryRun`** 都真跑——两者都不写归档；
 * - 其余组合在**动手之前**拒绝，不等内核回一串 `error` 状态。
 * 顺带一个好处：这条闸门把"危险动作在 bin 里没有批准环节"（台账 G6）在本包变成空集——
 * 能跑的那两种组合都不落在上游 `is_dangerous` 的判据里（`interaction.ts:88`）。
 *
 * 其余四处偏离，都写在能看见的地方：
 * 1. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`Tui.tsx` +
 *    `@xiranite/cli-runtime/terminal`）与 `@clack/prompts` 那套引导流
 *    （`:292-433` 的 `runGuided` + `interaction.ts` 的字段表 + `GUIDED_TASKS` 那张任务表）。
 *    本仓没有那两个包，也不许引 `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报
 *    "Missing required argument" 会把"这条腿没搬"说成"你参数没给对"。
 * 2. **`@xiranite/config` 那一层不读**：上游 `resolveRepackuDefaults()`（`:86-99`）从
 *    `xiranite.config.toml [nodes.repacku]` 取 `default_root` / `default_output_dir` / `types` /
 *    `delete_after` / `min_count` / `gallery_marker` 当缺省。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是 `src/index.ts` 的
 *    `Config`，独立 bin 读不到 ⇒ 这里的 defaults 是空的，缺省落回内核自己那一套
 *    （`core.ts:185-197`）。**连带后果**：内核的 `dryRun` 默认是 **false**（`:193`），
 *    所以不带 `--dryRun` 就是"要真写归档"的那一路——上面那条闸门正是拦它，
 *    而 `--dryRun` 与 `--no-dryRun` 两种写法都与上游 flag 名逐字相同。
 * 3. **`--clipboard` 未接**：上游 `inputFromArgs`（`:465-467`）在没给路径时调
 *    `readClipboardText()`（`platform.ts:39-55`，`pbpaste` / `Get-Clipboard` / `wl-paste`）。
 *    它也是外部程序，走的还是那条 `ctx.subprocess` ⇒ 不搬、不伪造（台账 **G5**），
 *    flag 留在面上、用了就点名缺什么。
 * 4. **`runProgram` 的派发器换成 vendored 那份**：上游 `runInteractionCli`（`:151-167`）带
 *    `loadContext` / `createDefinition` / `loadScreen` / `createPreferences` 四样，分别是
 *    TOML 读取、@clack 字段表、OpenTUI 屏幕与偏好写回（`updateNodeConfigFile`，`:170-184`）。
 *    本包一条都给不出，所以用 `src/cli-support.ts` 的 `runNodeCliFace`（去 TUI 的那份），
 *    `--help` 短路与"非 TTY 且无参数"那句拒绝的形状与上游一致。
 *
 * @module xaihi-repacku/cli
 */

import {
  canRunInteractiveCli,
  CliUsageError,
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
import type { RepackuAction, RepackuInput, RepackuOperation, RepackuResult } from './core.ts'
import { runRepacku } from './core.ts'
import { REPACKU_EXECUTION_REFUSAL, createRepackuPlannerRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('repacku')

/** 操作行数是上游 `cli.ts:526-527` 那个 `slice(0, 80)` + `... N more operation(s)`，不在这里另定一个数。 */
const OPERATION_LINES = 80

/** 动作名单的唯一真源是 `package.json#xaihi.node`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS: readonly RepackuAction[] = ['analyze', 'compress', 'full', 'single-pack', 'gallery-pack']

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Analyze folder trees and repack folders into zip archives.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/** 派发形状对齐 vendored 支撑里的 `runNodeCliFace`（`--help` 短路与无参拒绝都在那儿）。 */
export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + '而真压缩要的外部程序只有宿主进程里的 `ctx.subprocess` 那条缝接得上；'
      + `脚本化请用 \`${CLI_NAME} analyze --path <目录> --json\` 或任何动作配 \`--dryRun\`。`,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Folder repacking workflow with built-in guided mode.' },
    subCommands: {
      analyze: defineCommand({
        meta: { name: 'analyze', description: 'Analyze a folder and write a repacku config JSON.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('analyze', args, host)
        },
      }),
      compress: defineCommand({
        meta: { name: 'compress', description: 'Compress from an existing config, or run gallery/single pack modes.' },
        args: commonArgs(),
        async run ({ args }) {
          await runCompressCommand(args, host)
        },
      }),
      full: defineCommand({
        meta: { name: 'full', description: 'Analyze and then compress in one flow.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('full', args, host)
        },
      }),
      'single-pack': defineCommand({
        meta: { name: 'single-pack', description: 'Pack first-level child folders and loose image files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('single-pack', args, host)
        },
      }),
      'gallery-pack': defineCommand({
        meta: { name: 'gallery-pack', description: 'Find gallery folders and run single-pack in each one.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('gallery-pack', args, host)
        },
      }),
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
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
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/**
 * flag 名逐字对齐上游 `commonArgs()`（`:272-290`），含 `config`/`configPath`、
 * `output`/`outputPath` 两对别名和 `gallery`/`single` 那两条 `compress` 下的兼容别名。
 * `--clipboard` 的描述里写明未接（文件头第 3 条），免得用完了才知道这条路不通。
 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Folder path. Use "-" to take the first path from stdin.' },
    paths: { type: 'string', description: 'Comma, semicolon, or newline separated folder paths.' },
    config: { type: 'string', description: 'Config JSON path.' },
    configPath: { type: 'string', description: 'Config JSON path.' },
    types: { type: 'string', description: 'Target file types, comma separated, for example image,document.' },
    output: { type: 'string', description: 'Config output path.' },
    outputPath: { type: 'string', description: 'Config output path.' },
    clipboard: { type: 'boolean', description: 'Read folder path from clipboard when --path is omitted.（未接：要 ctx.subprocess）' },
    deleteAfter: { type: 'boolean', description: 'Delete source files after successful compression.' },
    dryRun: { type: 'boolean', description: 'Plan operations without writing archives. bin 面只跑这一档。' },
    gallery: { type: 'boolean', description: 'Compatibility alias for gallery-pack under compress.' },
    single: { type: 'boolean', description: 'Compatibility alias for single-pack under compress.' },
    minCount: { type: 'string', description: 'Minimum matching direct files before compression.' },
    galleryMarker: { type: 'string', description: 'Folder name marker used by gallery-pack.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

interface RepackuCliOptions {
  path?: string
  paths?: string
  config?: string
  configPath?: string
  types?: string
  output?: string
  outputPath?: string
  clipboard?: boolean
  deleteAfter?: boolean
  dryRun?: boolean
  gallery?: boolean
  single?: boolean
  minCount?: string
  galleryMarker?: string
  json?: boolean
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} analyze --path <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/repacku/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表与 `GUIDED_TASKS` 那张任务表在 @clack/prompts 那一层上（上游 `cli.ts:292-433` + `interaction.ts`），本包不引它；'
      + '它附带"从剪贴板读路径"那条要 DSH 的 `ctx.subprocess`，独立 bin 不在宿主进程里'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧注册的工具 \`repacku_*\`。`)
  process.exitCode = 2
}

/** 上游 `runSingleAction`（`:435-439`）。 */
async function runSingleAction (action: RepackuAction, args: CliArgs, host: CliHost): Promise<void> {
  const options = await resolveRepackuArgs(args as RepackuCliOptions, host)
  const input = inputFromArgs(options)
  await runGuarded([{ action, ...input }], options.json === true, host)
}

/**
 * 上游 `runCompressCommand`（`:441-449`）：`compress` 下面 `--gallery` / `--single` 是
 * 两条兼容别名，给了就换成那两条动作，一个都没给才是 `compress` 自己。
 */
async function runCompressCommand (args: CliArgs, host: CliHost): Promise<void> {
  const options = await resolveRepackuArgs(args as RepackuCliOptions, host)
  const input = inputFromArgs(options)
  const actions: RepackuAction[] = []
  if (options.gallery === true) actions.push('gallery-pack')
  if (options.single === true) actions.push('single-pack')
  if (actions.length === 0) actions.push('compress')
  await runGuarded(actions.map((action) => ({ action, ...input })), options.json === true, host)
}

/**
 * 上游 `resolveRepackuArgs`（`:451-461`）：`--path -` / `--paths -`，或"没给且 stdin 是管道"时，
 * 从 stdin 取（`path` 取第一行，`paths` 取全部行拼成 `;` 串）。
 * 那条 `Symbol.asyncIterator` 守卫是本仓加的（与 linedup / rawfilter 同一写法）：没有它，
 * 非异步可迭代的 stdin（测试宿主、被重定向的怪 stdin）会在 `for await` 上直接抛 TypeError，
 * 把"你没给路径"说成"内核崩了"。
 */
async function resolveRepackuArgs (options: RepackuCliOptions, host: CliHost): Promise<RepackuCliOptions> {
  const pathFromStdin = options.path === '-' || (!options.path && hasPipedInput(host.stdin))
  const pathsFromStdin = options.paths === '-' || (!options.paths && hasPipedInput(host.stdin))
  if (!pathFromStdin && !pathsFromStdin) return options
  if (!(Symbol.asyncIterator in Object(host.stdin))) return options
  const stdinLines = await readStdinLines(host.stdin)
  const resolved: RepackuCliOptions = { ...options }
  if (pathFromStdin) resolved.path = stdinLines[0] ?? ''
  if (pathsFromStdin) resolved.paths = stdinLines.join(';')
  return resolved
}

/**
 * 上游 `inputFromArgs`（`:463-479`），两处不同：
 * - `--clipboard` 那一格（`:465-467`）**不接**：读剪贴板是外部程序，见文件头第 3 条。
 *   用了它就直接拒绝并点名缺的缝，不静默忽略——静默忽略等于把"你没给路径"说成
 *   "这条命令什么都能干但什么都没干"。
 * - `minCount` 走上游同款 `numberArg`（`:559-562`）。
 */
function inputFromArgs (args: RepackuCliOptions): Omit<RepackuInput, 'action'> {
  const paths = splitPaths(args.paths, args.path ? [args.path] : [])
  if (args.clipboard === true && paths.length === 0) {
    throw new CliUsageError(`${CLI_NAME} --clipboard 未接：${REPACKU_EXECUTION_REFUSAL}`)
  }
  return {
    paths,
    configPath: args.configPath || args.config,
    types: args.types,
    outputPath: args.outputPath || args.output,
    deleteAfter: args.deleteAfter,
    dryRun: args.dryRun,
    minCount: numberArg(args.minCount),
    galleryMarker: args.galleryMarker,
  }
}

/**
 * 本包唯一新增的闸门（上游没有，因为上游的 bin 自带 `execFile`）：
 * 需要压缩程序的那一路在独立 bin 里**动手之前**拒绝。
 *
 * `analyze` 不在内：内核那条腿只扫目录 + 写 config JSON（`core.ts:341-350` →
 * `analyzeToConfig` `:440-472`），一次 `compress*` 都不调。
 */
function needsCompressor (input: RepackuInput): boolean {
  return input.action !== 'analyze' && input.dryRun !== true
}

async function runGuarded (inputs: RepackuInput[], json: boolean, host: CliHost): Promise<void> {
  // 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
  for (const input of inputs) {
    const action = input.action ?? 'full'
    if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
      throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
    }
  }
  const blocked = inputs.find(needsCompressor)
  if (blocked !== undefined) {
    const payload = {
      node: 'repacku',
      action: blocked.action,
      executed: false,
      refused: REPACKU_EXECUTION_REFUSAL,
      hint: `加 --dryRun 只出计划；真执行请用宿主里注册的工具 repacku_${String(blocked.action)}。`,
    }
    if (json) writeJson(host, payload)
    else writeError(host, `${CLI_NAME} ${String(blocked.action)} 未执行：${REPACKU_EXECUTION_REFUSAL}`)
    process.exitCode = 2
    return
  }
  await runActions(inputs, json, host)
}

/** 上游 `runActions`（`:481-496`）：`--json` 且多条时并发跑并印数组，否则逐条跑、失败就停。 */
async function runActions (inputs: RepackuInput[], json: boolean, host: CliHost): Promise<void> {
  if (json && inputs.length > 1) {
    const results = await Promise.all(inputs.map((input) => runRepacku(input, createRepackuPlannerRuntime())))
    writeJson(host, results)
    if (results.some((result) => !result.success)) process.exitCode = 1
    return
  }
  for (const input of inputs) {
    const result = await runAction(input, json, host)
    if (!result.success) break
  }
}

/** 上游 `runAction`（`:498-532`）：进度条 → 结论行 → Summary 面板 → 操作行 → Error 面板。 */
async function runAction (input: RepackuInput, json: boolean, host: CliHost): Promise<RepackuResult> {
  let progressActive = false
  const result = await runRepacku(input, createRepackuPlannerRuntime(), (event) => {
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
  writeSummary(host, result)
  if (!result.success) process.exitCode = 1
  return result
}

/** 上游 Summary 三行（`:521-525`）逐字：`config` / `folders entire selective skip` / `operations planned compressed failed skipped`。 */
function writeSummary (host: CliHost, result: RepackuResult): void {
  const data = result.data
  if (!data) return
  writeRichPanel(host, 'Summary', [
    data.configPath ? `config: ${data.configPath}` : '',
    `folders: ${data.totalFolders}  entire: ${data.entireCount}  selective: ${data.selectiveCount}  skip: ${data.skipCount}`,
    `operations: ${data.totalOperations}  planned: ${data.plannedCount}  compressed: ${data.compressedCount}  failed: ${data.failedCount}  skipped: ${data.skippedCount}`,
  ].filter(Boolean), { color: result.success ? 'green' : 'yellow', minWidth: 76 })

  for (const operation of data.operations.slice(0, OPERATION_LINES)) writeLine(host, formatOperation(operation, host))
  if (data.operations.length > OPERATION_LINES) writeLine(host, rich(host, `... ${data.operations.length - OPERATION_LINES} more operation(s)`, 'grey'))
  if (data.errors.length) writeRichPanel(host, 'Error', data.errors.join('\n'), { color: 'red', minWidth: 76 })
}

/** 上游 `formatOperation`（`:576-596`）逐字：四种状态各有颜色，`entire` 蓝 / 其余紫，路径按剩余列宽分配。 */
function formatOperation (operation: RepackuOperation, host: CliHost): string {
  const extensions = operation.extensions.length ? ` [${operation.extensions.join(',')}]` : ''
  const status = operation.status === 'success'
    ? rich(host, 'success', 'green')
    : operation.status === 'error'
      ? rich(host, 'error', 'red')
      : operation.status === 'skipped'
        ? rich(host, 'skipped', 'yellow')
        : rich(host, 'planned', 'cyan')
  const mode = rich(host, operation.mode, operation.mode === 'entire' ? 'blue' : 'magenta')
  if (!host.stdout.isTTY) return `${status} ${mode}${extensions} ${operation.sourcePath} ${rich(host, '->', 'grey')} ${operation.targetPath}`

  const prefix = `${status} ${mode}${extensions} `
  const arrow = ` ${rich(host, '->', 'grey')} `
  const pathBudget = Math.max(0, terminalColumns(host) - visibleWidth(prefix) - visibleWidth(arrow))
  if (pathBudget < 20) return `${prefix}${truncateVisible(operation.sourcePath, pathBudget)}`

  const sourceWidth = Math.max(8, Math.floor(pathBudget * 0.48))
  const targetWidth = Math.max(0, pathBudget - sourceWidth)
  return `${prefix}${truncateVisible(operation.sourcePath, sourceWidth)}${arrow}${truncateVisible(operation.targetPath, targetWidth)}`
}

/** 上游 `splitPaths` / `cleanPath`（`:549-557`）：`,;` 与换行都算分隔符，先去一对引号再丢空串。 */
function splitPaths (value?: string, seed: string[] = []): string[] {
  return [...seed, ...(value ?? '').split(/[,;\r\n]/)]
    .map(cleanPath)
    .filter(Boolean)
}

function cleanPath (value = ''): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

function numberArg (value?: string | number): number | undefined {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 上游 `writeProgress`（`:564-570`）：TTY 才覆盖当前行，否则逐行打。 */
function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

/** 上游 `endProgress`（`:572-574`）：覆盖过当前行就要补一个换行，否则下一行会接在后面。 */
function endProgress (host: CliHost, active: boolean): void {
  if (active && host.stdout.isTTY) host.stdout.write('\n')
}

/**
 * 自执行闸门：与同批节点同一写法（`.bin` 软链下 argv[1] 未必等于 `import.meta.url`，
 * 而聚合 CLI 引本模块时 argv[1] 是它自己的入口，两条都不该点亮）。
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
