#!/usr/bin/env node
/**
 * marku 的终端面，从 `<Xiranite>` tag `noxide` 基线
 * `packages/nodes/marku/src/cli.ts`（**496 行**）搬来。保留的东西：子命令名
 * `text` / `run` / `history` / `undo` / `workflow` / `guided`、全部 14 个 flag 名
 * （`--module` / `--path` / `--paths` / `--input` / `--inputFile` / `--outputFile` / `--config` /
 * `--recursive` / `--dryRun` / `--write` / `--enableUndo` / `--historyPath` / `--undoId` / `--json`）
 * 加 workflow 那三条（`--workflow` / `--workflowFile` / `--name`）、`--input -` 与管道 stdin
 * 那两条队列（基线 `:218`）、分隔符 `/[,;\r\n]/`（基线 `splitArg`，`:459-461`）、
 * `--write` 覆盖 `dryRun`（`:230`）、`--module` 非法时静默落回 `markt`（`:221-223`）、
 * `runAction` 里"先写完 `--outputFile` 再看 `--json`"的顺序（`:283`）、
 * `writeMarkuSummary` 的四段形状与**各 20 行上限**（`:437` / `:441` / `:452`）、
 * 以及 `result.success` 为假时退出码 1。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，退出码 2）。
 *    与同批的 `crashu` / `timeu` 是同一处理由，不在这里再抄一份第二参数解析器。
 * 2. **`guided` / `ui` / `gd` 未接**：基线 `runProgram`（`:125`）整条走
 *    `runInteractionCli` + `createMarkuInteractionSchema`（`@xiranite/cli-runtime/interaction`）、
 *    `runTerminalUi` + `./Tui.tsx`（OpenTUI）、`runGuidedInteraction` + `selectRich` /
 *    `confirmRich` / `promptPathLines` / `promptRich`（@clack 那一整套），本仓没有那些包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报 `Missing required argument`
 *    会把"这块内核没搬"说成"你参数没给对"（同类误导在 `sleept` 上刚修掉过）。
 *    `guided` 还顺带着基线 `platform.ts` 的剪贴板读（`readClipboardText()`，缺口 **G5**）与
 *    `markuPreferences()`（`TerminalPreferenceController` → `updateNodeConfigFile`，缺口 **G2**），
 *    两者都没搬，理由写在 `src/platform.ts` 头注释第 2 条。
 *    基线那份词表本身仍然逐字搬着（`src/interaction.ts` + `src/interaction-types.ts` 垫片），
 *    它是 `package.json#xaihi.node` 的可比对出处。
 * 3. **`@xiranite/config` 那一层不读**：基线从这里取 `[nodes.marku]` 的
 *    `enable_undo` / `history_path` / `default_module` / `workflowLibrary`
 *    （`resolveMarkuDefaults`，`:87-105`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里直接用基线
 *    `catch` 分支那份回退（`{ enableUndo: true }`，`:103`），`historyPath` / `defaultModule`
 *    一律"没给"。后果要说清楚：**`undo` / `history` / `run --write`（带 `--enableUndo`）这三条腿
 *    在不给 `--historyPath` 时会由 `src/platform.ts` 的 `defaultHistoryPath()` 响亮拒绝**
 *    （基线在这里能落盘是因为它有那条 toml 通路）。缺口是台账里已经记着的 **G1/G2** 那两面，
 *    本包另记一条：账本路径在 bin 上只能由 flag 给。
 * 4. **`workflow --name` 拒绝**（基线 `:243-258` 从配置的 `workflowLibrary` 里找命名工作流）：
 *    settings 缝在 bin 够不到（台账 **G2**）。这条是**先报原因、再做校验**的形状，不返回
 *    `undefined` 让内核那句 `Workflow definition is missing or malformed.` 盖住真实原因。
 *    `--workflow` 与 `--workflowFile` 两条照基线跑（`normalizeMarkuWorkflow` 那份校验不动）。
 * 5. **危险动作在 bin 里照基线执行**（`run --write` 的真写盘、`undo` 的回写）。宿主面那半边由
 *    `danger.all` 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，拿不到那条缝。
 *    这与同批的 `crashu` / `dissolvef` / `timeu` 是同一个取舍（ADR-0003 决定 1，台账 **G6**）。
 *
 * @module xaihi-marku/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
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
import type { MarkuAction, MarkuInput, MarkuModuleId, MarkuResult } from './core.ts'
import { MARKU_MODULES, runMarku } from './core.ts'
import { createNodeMarkuRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('marku')

interface MarkuCliOptions {
  module?: string
  path?: string
  paths?: string
  input?: string
  inputFile?: string
  outputFile?: string
  config?: string
  recursive?: boolean
  dryRun?: boolean
  write?: boolean
  enableUndo?: boolean
  historyPath?: string
  undoId?: string
  json?: boolean
  workflow?: string
  workflowFile?: string
  name?: string
}

/**
 * 基线 `:71-79` 那份 `MarkuDefaults`。注释里的 "TOML" 指的是**没搬的那条配置通路**
 * （`xiranite.config.toml` 的 `[nodes.marku]`，见文件头第 3 条）；本包里它只剩一个回退值。
 */
interface MarkuDefaults {
  /** Whether undo recording is enabled (TOML `enable_undo`, default true). */
  enableUndo: boolean
  /** TOML `history_path`; falls back to platform default when undefined. */
  historyPath?: string
  /** TOML `default_module`; falls back to "markt" when undefined/invalid. */
  defaultModule?: string
}

/** 基线 `resolveMarkuDefaults` 的 `catch` 分支（`:103`）：配置读不到时它回的就是这一份。 */
const CONFIG_LESS_DEFAULTS: MarkuDefaults = { enableUndo: true }

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Markdown module toolbox with text, file, diff, and undo modes.',
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
      // 基线 `:125` 的 `runPipe`：无参时打一行可用子命令，有参才进程序本体。
      if (pipeArgs.length === 0) {
        writeLine(pipeHost, `${CLI_NAME} ui | gd | text | run | history | undo`)
        return
      }
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI + 基线 `Tui.tsx`）与引导流（`@clack` + `interaction.ts` 那份 schema，'
      + '还有偏好读写要的宿主 settings 缝）都不随本包发布，'
      + `脚本化请用 \`${CLI_NAME} text --module markt --input "# Title" --json\`。`,
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
  // 基线 `runGuided`（`:296-300`）那句原样：非交互终端先给一条脚本化路子。
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} text --module markt --input "# Title" --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（基线 `packages/nodes/marku/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（基线 `packages/nodes/marku/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板 xaihi.workspace.marku。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Markdown processing toolbox with guided terminal mode.' },
    subCommands: {
      text: defineCommand({
        meta: { name: 'text', description: 'Process inline text or an input file.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('text', args as CliArgs, host)
        },
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Process Markdown files or folders.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('run', args as CliArgs, host)
        },
      }),
      history: defineCommand({
        meta: { name: 'history', description: 'Show undo history.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('history', args as CliArgs, host)
        },
      }),
      undo: defineCommand({
        meta: { name: 'undo', description: 'Undo the latest or selected write run.' },
        args: commonArgs(),
        async run ({ args }) {
          await runSubcommand('undo', args as CliArgs, host)
        },
      }),
      workflow: defineCommand({
        meta: { name: 'workflow', description: 'Run an ordered multi-step workflow over text or files.' },
        args: {
          ...commonArgs(),
          workflow: { type: 'string', description: 'Inline workflow JSON: { id, name, steps: [{ module, config }] }.' },
          workflowFile: { type: 'string', description: 'Read workflow JSON from this file.' },
          name: { type: 'string', description: 'Named workflow resolved from [nodes.marku].workflowLibrary.（未接：bin 够不到 settings 缝）' },
        } as const,
        async run ({ args }) {
          const options = args as MarkuCliOptions
          const json = Boolean(args.json)
          if (options.name !== undefined && String(options.name).trim() !== '') {
            writeError(host, `\`${CLI_NAME} workflow --name\` 未接：命名工作流住在配置的 workflowLibrary 里，独立 bin 读不到 settings 缝（docs/service-mapping.md G2）。替代：--workflow '<JSON>' 或 --workflowFile <path>。`)
            process.exitCode = 2
            return
          }
          const workflow = await resolveWorkflowDefinition(options, host)
          await runAction({ action: 'workflow', workflow, ...await inputFromArgs(options, host) }, json, host, options)
        },
      }),
      // ↓ 基线有、本包没带的那三条腿：面在这儿，实现不在这儿。
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

/** flag 名逐个对齐基线 `commonArgs()`（`:195-212`），一个都不新增、一个都不改名。 */
function commonArgs () {
  return {
    module: { type: 'string', description: `Module: ${MARKU_MODULES.map((item) => item.id).join(', ')}` },
    path: { type: 'string', description: 'Input file or folder path.' },
    paths: { type: 'string', description: 'Comma, semicolon, or newline separated paths.' },
    input: { type: 'string', description: 'Inline Markdown text.' },
    inputFile: { type: 'string', description: 'Read Markdown text from this file.' },
    outputFile: { type: 'string', description: 'Write text-mode output to this file.' },
    config: { type: 'string', description: 'Module config JSON.' },
    recursive: { type: 'boolean', description: 'Recurse into folders.' },
    dryRun: { type: 'boolean', description: 'Preview file changes without writing.' },
    write: { type: 'boolean', description: 'Write file changes. Overrides dry-run.' },
    enableUndo: { type: 'boolean', description: 'Record undo state when writing.' },
    historyPath: { type: 'string', description: 'Undo history JSON path.' },
    undoId: { type: 'string', description: 'Undo record id.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 基线 `inputFromArgs`（`:214-235`）的判据逐条，只是把"可能 undefined 的可选属性"换成条件
 * 展开：本仓的 `exactOptionalPropertyTypes` 不吃 `inputText: string | undefined`。
 * stdin 那条队列也照基线：`--input -`，或 `--input` 没给而 stdin 是管道。
 */
async function inputFromArgs (args: MarkuCliOptions, host: CliHost): Promise<MarkuInput> {
  const defaults = CONFIG_LESS_DEFAULTS
  const wantsStdin = args.input === '-' || (!args.input && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))
  const inputText = args.inputFile
    ? await readFile(args.inputFile, 'utf8')
    : wantsStdin
      ? await readStdinText(host.stdin)
      : args.input
  const module = args.module
    ? (isMarkuModule(args.module) ? args.module : 'markt')
    : (defaults.defaultModule && isMarkuModule(defaults.defaultModule) ? defaults.defaultModule : 'markt')
  return {
    module,
    paths: splitArg(args.paths, args.path ? [args.path] : []),
    ...(inputText === undefined ? {} : { inputText }),
    stepConfig: parseConfig(args.config),
    ...(typeof args.recursive === 'boolean' ? { recursive: args.recursive } : {}),
    ...(args.write ? { dryRun: false } : typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
    enableUndo: args.enableUndo ?? defaults.enableUndo,
    // 基线是 `args.historyPath ?? defaults.historyPath`（`:232`）。`defaults.historyPath` 在
    // 本包恒为 undefined（文件头第 3 条：没有 toml 那一层），所以这里只剩"flag 给了就传"，
    // 没给就交给内核走 `runtime.defaultHistoryPath()` —— 而那条在本包是响亮拒绝（第 3 条后果）。
    ...(args.historyPath === undefined || args.historyPath === '' ? {} : { historyPath: args.historyPath }),
    ...(args.undoId === undefined ? {} : { undoId: args.undoId }),
  }
}

/** 基线 `:237-258` 的 `resolveWorkflowDefinition`；`--name` 那一支在本包被文件头第 4 条挡掉。 */
async function resolveWorkflowDefinition (options: MarkuCliOptions, host: CliHost): Promise<unknown> {
  if (options.workflow?.trim()) return parseWorkflowJson(options.workflow)
  if (options.workflowFile) return parseWorkflowJson(await readFile(options.workflowFile, 'utf8'))
  // 基线的第三支（从配置的 workflowLibrary 里按 name 找）没有可读的 settings 缝；
  // 上面 `workflow` 子命令体已经把 `--name` 拦在报原因之后，这里只剩"没给" ⇒ undefined，
  // 让内核报它自己那句 canonical missing/malformed 失败，不在这里复制一条校验。
  void host
  return undefined
}

function parseWorkflowJson (value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

/** 基线 `:260-266`：非法 id 落回 `markt`（`MARKU_MODULES` 的次序就是词表的次序）。 */
function isMarkuModule (value?: string): value is MarkuModuleId {
  return MARKU_MODULES.some((item) => item.id === value)
}

/**
 * 基线 `:268-293` 的 `runAction` 逐字：进度 → 结果 → `--outputFile` 先写 → `--json` 分叉。
 * 返回 `result.success` 是给测试用的（基线不返回）。
 */
async function runAction (input: MarkuInput & { action: MarkuAction }, json: boolean, host: CliHost, options: MarkuCliOptions): Promise<boolean> {
  let progressActive = false
  const result = await runMarku(input, createNodeMarkuRuntime(), (event) => {
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

  if (options.outputFile && result.data?.outputText) await writeFile(options.outputFile, result.data.outputText, 'utf8')
  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return result.success
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeMarkuSummary(host, result)
  if (!result.success) process.exitCode = 1
  return result.success
}

/** 子命令体：基线 `:146` / `:153` / `:160` / `:167` 四条同形（`action` 之后接 `inputFromArgs`）。 */
async function runSubcommand (action: MarkuAction, args: CliArgs, host: CliHost): Promise<void> {
  const options = args as MarkuCliOptions
  const input = { action, ...await inputFromArgs(options, host) }
  // 文件头第 3 条的闸门：**真写盘 + 仍要记账 + 没给 `--historyPath`** 就在动手之前拒。
  // 基线在这儿不需要它，因为它有一个 toml 边上的默认账本路径；那条通路不搬之后，
  // 让内核照跑会先写完文件、再在 `recordUndo` 里抛出 `defaultHistoryPath()` 那句
  // （`core.ts:186-188`：`run` 腿的账本记在写盘**之后**），现场就成了"改了一半、回不去"。
  // 宿主面那侧是同一个判据、更早的位置（`src/index.ts` 的 `journalGate()`），两面话要说得一样。
  // `enableUndo: false` 是上游自己允许的形状（不记账，也就不需要路径），不拦。
  if (action === 'run' && input.dryRun === false && input.enableUndo !== false && !input.historyPath) {
    writeError(host, `marku: --historyPath is required with --write（撤销账本的路径必须显式给，理由见 ${CLI_NAME} 文件头第 3 条与 ADR-0003 决定 2）。替代：去掉 --write 先预演，或 --historyPath <json>。`)
    process.exitCode = 2
    return
  }
  await runAction(input, Boolean(args.json), host, options)
}

/**
 * 基线 `writeMarkuSummary`（`:428-457`）：Summary 面板 + 每文件一行 + Output 面板 +
 * Undo history 列表，两处 `slice(0, 20)` 与那句 `... N more file(s)` 全部原样。
 */
function writeMarkuSummary (host: CliHost, result: MarkuResult): void {
  const data = result.data
  if (!data) return

  if (data.filesProcessed !== undefined) {
    writeRichPanel(host, 'Summary', [
      `files: ${String(data.filesProcessed)}  changed: ${String(data.filesChanged ?? 0)}`,
    ], { color: result.success ? 'green' : 'yellow', minWidth: 48 })

    for (const diff of data.diffs?.slice(0, 20) ?? []) {
      const status = diff.changed ? rich(host, 'changed', 'yellow') : rich(host, 'same', 'grey')
      writeLine(host, `${status} ${truncateVisible(diff.file, terminalColumns(host) - 16)}`)
    }
    if ((data.diffs?.length ?? 0) > 20) writeLine(host, rich(host, `... ${String((data.diffs?.length ?? 0) - 20)} more file(s)`, 'grey'))
  }

  if (data.outputText && data.outputText !== data.inputText) {
    writeLine(host)
    writeRichPanel(host, 'Output', truncateVisible(data.outputText, terminalColumns(host) - 6), { color: 'green', minWidth: 48 })
  }

  if (data.history?.length) {
    writeLine(host)
    writeLine(host, rich(host, 'Undo history:', 'cyan'))
    for (const record of data.history.slice(0, 20)) {
      const status = record.undone ? rich(host, 'undone', 'grey') : rich(host, 'active', 'green')
      writeLine(host, `${status} ${record.id} ${rich(host, record.module, 'magenta')} ${String(record.files.length)} file(s)`)
    }
  }
}

/** 基线 `:459-461` / `:463-471` 那两个小函数，判据逐字（三字符分隔符、只收 JSON 对象）。 */
function splitArg (value?: string, seed: string[] = []): string[] {
  return [...seed, ...(value ?? '').split(/[,;\r\n]/)].map((item) => item.trim()).filter(Boolean)
}

function parseConfig (value?: string): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

function endProgress (host: CliHost, active = true): void {
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
