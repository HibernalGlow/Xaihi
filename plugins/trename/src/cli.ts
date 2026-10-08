#!/usr/bin/env node
/**
 * trename 的终端面，从基线 tag `noxide` 的 `packages/nodes/trename/src/cli.ts`（668 行）搬来。
 * 保留的东西：六个子命令名 `scan` / `import` / `validate` / `rename` / `undo` / `history`
 * （上游 `:217-258`，与定义里的动作 id 同一套字，没有 kebab 分叉）、25 个 flag 名
 * （`commonArgs()`，`:269-297`：`--path` / `--paths` / `--input` / `--inputFile` / `--output` /
 * `--base` / `--basePath` / `--includeHidden` / `--hidden` / `--includeRoot` / `--noRoot` /
 * `--exclude` / `--excludeExts` / `--excludePattern` / `--excludePatterns` / `--split` /
 * `--maxLines` / `--compact` / `--mode` / `--dryRun` / `--execute` / `--batchId` /
 * `--undoPath` / `--jsonContent` / `--json`）、四条别名优先级（`inputFromArgs`，`:341-369`：
 * `inputFile || input`、`paths || path`、`includeHidden ?? hidden`、`noRoot ? false : includeRoot`、
 * `excludeExts || exclude`、`excludePatterns || excludePattern`、`maxLines ?? split`、
 * `basePath || base`）、`execute ? false : dryRun ?? true` 那条**默认预演**的闸门（`:365`）、
 * `-` 读 stdin 的 jsonContent 队列（`:344-352`，只有 `import` / `validate` / `rename` 三条腿
 * 会在"没给输入且 stdin 是管道"时整份读进来）、`--output` 的分段落盘
 * （`writeSegments`，`:371-380`：一段写原文件，多段写 `base_1.ext`…）、非 JSON 时的进度条 +
 * `执行总结` 面板（总计/待翻译/可重命名 一行、成功/失败/跳过 一行、`基础路径` 与 `操作 ID`
 * 只在有值时出现）+ 操作清单 30 行 / 冲突清单 30 行 / 历史 20 条 / JSON 预览 12 行
 * （`:577-606`）与那四句 `... 还有 N 个…`、`formatOperation` 在非 TTY 下退化成
 * `源 -> 目标`（`:609-617`）、以及 `result.success` 为假时退出码 1。
 *
 * 六处偏离，都写在能看见的地方：
 * 1. **路径与 JSON 走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，退出码 2）。
 *    与同批的 `crashu` / `formatv` / `timeu` 是同一处理由。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 的 `runGuidedInteraction` / `runGuided`（`cli.ts:382-562`，字段表在
 *    `./interaction.ts`，剪贴板读在 `platform.ts:88`）。本仓没有那两个包也不许引 `@xiranite/*`。
 *    三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument" 会把"这块内核
 *    没搬"说成"你参数没给对"（同类误导在 sleept 上刚修掉过）。缺口即台账 `G-clipboard-guided`。
 *    拒绝文案里给出的替代归属是 `trename_<action>` **工具**而不是 `/trename` 斜杠命令：
 *    本包 `inject` 只有 `tools`，宿主里没有那条命令（台账 G7；`src/help.ts` 也不传 `command`）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.trename]` 的 `enable_undo` /
 *    `undo_path` 与终端偏好（`resolveTrenameDefaults`，`:65-83`）。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是 `src/index.ts` 的
 *    `Config`，独立 bin 读不到 ⇒ 这里只剩命令行那份：`--undoPath` 是唯一来源，
 *    没给就交给 `platform.ts` 的 `defaultUndoPath()`，它**点名拒绝**（症状是"要求设置 undoPath"，
 *    不是"把撤销记录写进一个没人知道的地方"，ADR-0003 决定 2）。因此
 *    `undo` / `history` / `rename --execute` 这三条腿在 bin 上**必须带 `--undoPath`**，
 *    其余三条（`scan` / `import` / `validate` / 预演 `rename`）不受影响。
 *    上游那条 `enable_undo = false` 的拒绝（`:302-306`）**没搬**到 bin：bin 没有设置缝，
 *    它永远是 true，搬来就是一条测不到的死分支；同一道闸门在宿主侧是活的
 *    （`Config.enableUndo`，`src/index.ts` 的 `assertUndoEnabled`）。
 * 4. **危险动作在 bin 里照上游执行**（`rename --execute` 的真移文件）。宿主面那半边由
 *    `danger.all` 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，拿不到那条缝。
 *    与同批的 `crashu` / `formatv` / `timeu` 同一取舍（ADR-0003 决定 1）。即台账 `G-terminal-approval`。
 * 5. **stdin 队列加了一道异步流闸门**：上游 `:345` 直接 `await readStdinText(host.stdin)`，
 *    而本仓 vendored 那份 `readStdinText` 在非 TTY 且 stdin 不带 `Symbol.asyncIterator` 时会抛
 *    （`for await` 拿到一个普通对象）。这里改成"不是异步流就当没管道"，落回上游那句
 *    `Rename requires JSON content.` 而不是崩一次。
 * 6. **`--help` 那一屏由清单推导**：上游在 `runProgram` 开头调
 *    `writeTerminalNodeHelp(host, help, "zh")`，而那份 `help.ts` 通篇是旧壳的
 *    `xiranite trename …` 命令名（本仓 bin 是 `xtrename`）。这里走 `runNodeCliFace` 的
 *    citty 式 usage，`src/help.ts` 那份推导载荷留给聚合 CLI 装载。
 *
 * @module xaihi-trename/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinText,
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
import { runInteractionCli } from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import type { TrenameAction, TrenameData, TrenameInput, TrenameOperation, TrenameResult } from './core.ts'
import { runTrename } from './core.ts'
import { createNodeTrenameRuntime } from './platform.ts'
import { createTrenameInteractionSchema, type TrenameInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('trename')

/** 上游 `cli.ts:580` / `:587` / `:594` / `:603` 的四段行限：操作与冲突 30、历史 20、JSON 预览 12。 */
const SUMMARY_LINES = 30
const HISTORY_LINES = 20
const JSON_PREVIEW_LINES = 12

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Batch rename JSON workflow for scan, validate, rename, and undo.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createTrenameUiDefinition (
  defaults: Partial<TrenameInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<TrenameInput, TrenameResult> {
  const schema = createTrenameInteractionSchema({ undoPath: defaults.undoPath }, language)
  return {
    schema,
    run: (input, onEvent) => runTrename(input, createNodeTrenameRuntime(), onEvent),
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
    createDefinition: (defaults, language) => createTrenameUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).TrenameTui,
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
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/trename/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/trename/src/interaction.ts`），剪贴板读在 `platform.ts`，本包都不引它们'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`trename_<action>\` 工具（\`ctx.tools\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Batch rename JSON workflow with guided terminal mode.',
    },
    subCommands: {
      scan: defineCommand({
        meta: { name: 'scan', description: 'Scan folders into rename JSON.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('scan', args, host)
        },
      }),
      import: defineCommand({
        meta: { name: 'import', description: 'Import and count rename JSON.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('import', args, host)
        },
      }),
      validate: defineCommand({
        meta: { name: 'validate', description: 'Validate rename JSON against the filesystem.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('validate', args, host)
        },
      }),
      rename: defineCommand({
        meta: { name: 'rename', description: 'Plan or execute batch rename.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('rename', args, host)
        },
      }),
      undo: defineCommand({
        meta: { name: 'undo', description: 'Undo a previous executed rename batch.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('undo', args, host)
        },
      }),
      history: defineCommand({
        meta: { name: 'history', description: 'List undo batches.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSingleAction('history', args, host)
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

/** flag 名逐个对齐上游 `commonArgs()`（`:269-297`），一个都不新增、一个都不改名。 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Folder path.' },
    paths: { type: 'string', description: 'One or more paths. Quoted paths are supported.' },
    input: { type: 'string', description: 'JSON input file.' },
    inputFile: { type: 'string', description: 'JSON input file.' },
    output: { type: 'string', description: 'Write scan JSON to this file.' },
    base: { type: 'string', description: 'Base path for validate/rename.' },
    basePath: { type: 'string', description: 'Base path for validate/rename.' },
    includeHidden: { type: 'boolean', description: 'Include hidden files.' },
    hidden: { type: 'boolean', description: 'Alias for --includeHidden.' },
    includeRoot: { type: 'boolean', description: 'Include scanned folder as root node.' },
    noRoot: { type: 'boolean', description: 'Scan children directly.' },
    exclude: { type: 'string', description: 'Comma-separated excluded extensions.' },
    excludeExts: { type: 'string', description: 'Comma-separated excluded extensions.' },
    excludePattern: { type: 'string', description: 'Comma-separated excluded name patterns.' },
    excludePatterns: { type: 'string', description: 'Comma-separated excluded name patterns.' },
    split: { type: 'string', description: 'Max JSON lines per segment.' },
    maxLines: { type: 'string', description: 'Max JSON lines per segment.' },
    compact: { type: 'boolean', description: 'Use compact JSON output.' },
    mode: { type: 'string', description: 'Scan mode: normal or leak.' },
    dryRun: { type: 'boolean', description: 'Preview file operations.' },
    execute: { type: 'boolean', description: 'Execute rename instead of dry-run.' },
    batchId: { type: 'string', description: 'Undo batch id.' },
    undoPath: { type: 'string', description: 'Undo JSON store path.' },
    jsonContent: { type: 'string', description: 'Inline rename JSON content.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/** 上游 `runSingleAction`（`:299-312`）：跑一次，`--output` 只在 scan 成功时落盘。 */
async function runSingleAction (action: TrenameAction, args: CliArgs, host: CliHost): Promise<boolean> {
  const input = await inputFromArgs(action, args, host)
  const refusal = undoStoreRefusal(action, input)
  if (refusal !== undefined) {
    printRefusal(refusal, args.json === true, host)
    return false
  }
  const result = await runAction(input, args.json === true, host)
  if (typeof args.output === 'string' && action === 'scan' && result.success) await writeSegments(args.output, result.data?.segments ?? [])
  return result.success
}

/** 三条要碰撤销账本的腿：`undo` / `history` 必读，真执行的 `rename` 必写。 */
function needsUndoStore (action: TrenameAction, input: TrenameInput): boolean {
  if (action === 'undo' || action === 'history') return true
  return action === 'rename' && input.dryRun === false
}

/**
 * bin 的账本闸门：`--undoPath` 是本包唯一的来源（文件头第 3 条），没给就在**动手之前**拒绝。
 * 只靠 `platform.ts` 那句兜底不够——内核记批次在执行循环之后（`core.ts:467`），
 * 那样会变成"文件已经移完，然后才报缺配置"。宿主半边是同一刀（`src/index.ts` 的 `assertUndoStorePath`）。
 */
function undoStoreRefusal (action: TrenameAction, input: TrenameInput): string | undefined {
  if (!needsUndoStore(action, input)) return undefined
  if (typeof input.undoPath === 'string' && input.undoPath.trim() !== '') return undefined
  return `trename ${action}: 撤销账本位置没给（--undoPath）—— Xaihi 里没有"每插件数据目录"这个 API，路径必须显式给`
}

/**
 * 拒绝的输出形状：JSON 模式仍出一份结果对象，但**不带 data**——那一份是内核没产过的东西，
 * 伪造它等于让脚本读回一次它没跑过的运行（ADR-0011 的降级铁律：可以退化，不许假）。
 */
function printRefusal (message: string, json: boolean, host: CliHost): void {
  if (json) {
    writeJson(host, { success: false, message })
    process.exitCode = 1
    return
  }
  writeLine(host, rich(host, message, 'red', 'bold'))
  process.exitCode = 1
}

/** 上游 `runAction`（`:314-339`）：进度条 / JSON / 摘要三条分叉，失败退出码 1。 */
async function runAction (input: TrenameInput, json: boolean, host: CliHost): Promise<TrenameResult> {
  const runtime = createNodeTrenameRuntime({ ...(input.undoPath === undefined ? {} : { undoPath: input.undoPath }) })
  let progressActive = false
  const result = await runTrename(input, runtime, (event) => {
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
  writeTrenameSummary(host, result)
  if (!result.success) process.exitCode = 1
  return result
}

/**
 * 上游 `inputFromArgs`（`:341-369`）的判据逐条，只是把"可能 undefined 的可选属性"换成条件展开
 * （本仓 `exactOptionalPropertyTypes` 不吃 `paths: string | boolean | undefined`），
 * 并且没有那份配置文件默认值（文件头第 3 条）。
 */
async function inputFromArgs (action: TrenameAction, args: CliArgs, host: CliHost): Promise<TrenameInput> {
  const inputFile = stringValue(args.inputFile) || stringValue(args.input)
  let jsonContent = stringValue(args.jsonContent)
  if (args.jsonContent === undefined) {
    // 上游 `:344-352` 的三条分支：`-` 读 stdin；没给输入而这条腿吃 JSON 且 stdin 是管道也读 stdin；
    // 给了文件名就 readFile；其余是空串（让内核去说那句缺 JSON 的话）。
    if (inputFile === '-' || (!inputFile && isJsonConsumingAction(action) && hasPipedInput(host.stdin))) {
      jsonContent = await readStdinIfStreamable(host)
    } else if (inputFile) {
      jsonContent = await readFile(inputFile, 'utf8')
    } else {
      jsonContent = ''
    }
  }
  const paths = stringValue(args.paths) || stringValue(args.path)
  const includeHidden = typeof args.includeHidden === 'boolean' ? args.includeHidden : typeof args.hidden === 'boolean' ? args.hidden : undefined
  const includeRoot = args.noRoot === true ? false : typeof args.includeRoot === 'boolean' ? args.includeRoot : undefined
  const excludeExts = stringValue(args.excludeExts) || stringValue(args.exclude)
  const excludePatterns = stringValue(args.excludePatterns) || stringValue(args.excludePattern)
  const maxLines = numberArg(args.maxLines === undefined ? args.split : args.maxLines)
  const basePath = stringValue(args.basePath) || stringValue(args.base)
  const undoPath = stringValue(args.undoPath)
  return {
    action,
    ...(paths === '' ? {} : { paths }),
    ...(includeHidden === undefined ? {} : { includeHidden }),
    ...(includeRoot === undefined ? {} : { includeRoot }),
    ...(excludeExts === '' ? {} : { excludeExts }),
    ...(excludePatterns === '' ? {} : { excludePatterns }),
    ...(maxLines === undefined ? {} : { maxLines }),
    ...(typeof args.compact === 'boolean' ? { compact: args.compact } : {}),
    mode: args.mode === 'leak' ? 'leak' : 'normal',
    jsonContent,
    ...(basePath === '' ? {} : { basePath }),
    // 上游 `:365`：`execute ? false : dryRun ?? true` —— **两个都没给就是预演**。
    // 折成 `args.dryRun === true` 会把 bin 的默认翻成"真移文件"，与上游相反。
    dryRun: args.execute === true ? false : typeof args.dryRun === 'boolean' ? args.dryRun : true,
    ...(stringValue(args.batchId) === '' ? {} : { batchId: stringValue(args.batchId) }),
    ...(undoPath === '' ? {} : { undoPath }),
  }
}

/** 上游 `:345` 那三条吃 JSON 的腿（`import` / `validate` / `rename`）。 */
function isJsonConsumingAction (action: TrenameAction): boolean {
  return action === 'import' || action === 'validate' || action === 'rename'
}

/** 偏离 5：stdin 不是异步流就当"没有管道"，让内核去说那句缺 JSON 的话。 */
async function readStdinIfStreamable (host: CliHost): Promise<string> {
  if (!(Symbol.asyncIterator in Object(host.stdin))) return ''
  return await readStdinText(host.stdin)
}

/** 上游 `writeSegments`（`:371-380`）逐字：一段写原文件名，多段按 `_1`、`_2` 加序号。 */
async function writeSegments (output: string, segments: string[]): Promise<void> {
  if (segments.length <= 1) {
    await writeFile(output, `${segments[0] ?? ''}\n`, 'utf8')
    return
  }
  const dot = output.lastIndexOf('.')
  const base = dot >= 0 ? output.slice(0, dot) : output
  const ext = dot >= 0 ? output.slice(dot) : '.json'
  await Promise.all(segments.map((segment, index) => writeFile(`${base}_${index + 1}${ext}`, `${segment}\n`, 'utf8')))
}

/** 上游 `writeTrenameSummary`（`:564-607`）：执行总结面板 + 四段列表，行限 30 / 30 / 20 / 12。 */
function writeTrenameSummary (host: CliHost, result: TrenameResult): void {
  const data: TrenameData | undefined = result.data
  if (!data) return

  const columns = terminalColumns(host)
  const summaryLines = [
    `总计: ${rich(host, String(data.totalItems), 'green')}  待翻译: ${rich(host, String(data.pendingCount), 'yellow')}  可重命名: ${rich(host, String(data.readyCount), 'green')}`,
    `成功: ${rich(host, String(data.successCount), 'green')}  失败: ${rich(host, String(data.failedCount), 'red')}  跳过: ${rich(host, String(data.skippedCount), 'yellow')}`,
  ]
  if (data.basePath) summaryLines.push(`基础路径: ${data.basePath}`)
  if (data.operationId) summaryLines.push(`操作 ID: ${rich(host, data.operationId, 'cyan')}`)
  writeRichPanel(host, '执行总结', summaryLines, { color: result.success ? 'green' : 'yellow', maxWidth: columns - 2, minWidth: Math.min(76, columns - 6) })

  if (data.operations.length) {
    writeLine(host)
    writeLine(host, rich(host, '操作详情：', 'cyan'))
    for (const operation of data.operations.slice(0, SUMMARY_LINES)) writeLine(host, `  ${formatOperation(operation, host)}`)
    if (data.operations.length > SUMMARY_LINES) writeLine(host, rich(host, `  ... 还有 ${String(data.operations.length - SUMMARY_LINES)} 个操作`, 'grey'))
  }

  if (data.conflicts.length) {
    writeLine(host)
    writeLine(host, rich(host, `冲突详情 (${String(data.conflicts.length)})：`, 'yellow'))
    for (const conflict of data.conflicts.slice(0, SUMMARY_LINES)) writeLine(host, `  ${rich(host, '•', 'red')} ${conflict.message}`)
    if (data.conflicts.length > SUMMARY_LINES) writeLine(host, rich(host, `  ... 还有 ${String(data.conflicts.length - SUMMARY_LINES)} 个冲突`, 'grey'))
  }

  if (data.history.length) {
    writeLine(host)
    writeLine(host, rich(host, '操作历史：', 'cyan'))
    for (const batch of data.history.slice(0, HISTORY_LINES)) {
      const status = batch.undone ? rich(host, '已撤销', 'grey') : rich(host, '活跃', 'green')
      writeLine(host, `  ${rich(host, batch.id, 'cyan')}  ${status}  ${String(batch.operations.length)} 项  ${batch.timestamp}`)
    }
  }

  if (data.segments.length && data.jsonContent) {
    writeLine(host)
    writeLine(host, rich(host, 'JSON 预览：', 'cyan'))
    const previewLines = data.jsonContent.split('\n').slice(0, JSON_PREVIEW_LINES)
    for (const line of previewLines) writeLine(host, rich(host, `  ${truncateVisible(line, columns - 4)}`, 'grey'))
    if (data.jsonContent.split('\n').length > JSON_PREVIEW_LINES) writeLine(host, rich(host, '  ...', 'grey'))
  }
}

/** 上游 `formatOperation`（`:609-617`）：非 TTY 就退化成一行 `源 -> 目标`。 */
function formatOperation (operation: TrenameOperation, host: CliHost): string {
  if (!host.stdout.isTTY) return `${operation.originalPath} -> ${operation.newPath}`
  const columns = terminalColumns(host)
  const arrow = rich(host, '->', 'grey')
  const budget = Math.max(0, columns - 6)
  const sourceWidth = Math.max(8, Math.floor(budget * 0.48))
  const targetWidth = Math.max(0, budget - sourceWidth)
  return `${truncateVisible(operation.originalPath, sourceWidth)} ${arrow} ${truncateVisible(operation.newPath, targetWidth)}`
}

/** 上游 `numberArg`（`:644-647`）：`Number(value)` 有限才要。 */
function numberArg (value: string | boolean | undefined): number | undefined {
  if (value === undefined || typeof value === 'boolean') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const stringValue = (value: string | boolean | undefined): string => typeof value === 'string' ? value : ''

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
