#!/usr/bin/env node
/**
 * bandia 的终端面（**只拒绝、不执行**那一档）。
 *
 * 动作名单与 flag 名单都有真源：子命令名取 `package.json#xaihi.node.actions`
 * （`extract` / `compress` / `repack` / `export_efu`），外加上游 `cli.ts:155` 那条
 * `export-efu` 的拼法作别名（与 `plugins/crashu/src/cli.ts` 把 `execute` 留作 `move`
 * 别名是同一处理由：面上有的名字不能在这里消失）；flag 名逐个抄上游
 * `cli.ts:172-196` 的 `commonArgs()`，一个都不新增、一个都不改名。
 *
 * 内核（`src/core.ts`）这次是**真搬来了**，但这一面仍然一律退出码 2 并点名缺的那条缝。
 * 为什么不在 bin 里把内核跑一遍：
 * 1. `BandiaRuntime` 的三条外部程序方法（`findBandizip` / `runCommand` / `openEverything`）
 *    在 Xaihi 走 DSH 的 `ctx.subprocess`（`docs/service-mapping.md`「子进程 / 命令执行 ⇒
 *    不搬基础件」），而那条缝只活在宿主进程的 `apply()` 里 ⇒ 就是缺口 **G1** 那一类
 *    （判据形状同 `plugins/logx/src/cli.ts`）。在 bin 里自己 `execFile` 一个 `bz.exe`
 *    等于给 DSH 已经提供的能力另长一条腿，AGENTS.md 明令不许。
 * 2. 批准缝 `ctx.approval` 也在宿主（缺口 **G6**）：定义里那份 `pluginExport` 危险闸门经
 *    `defineNode` 变成 `tools/pre-execute` 的 `ask`；从终端直接跑没有批准环节可展示，
 *    所以 `--force` 一类的形状一律不做。
 * 3. 进度与运行账本在 xaihi-core 的 `OPERATIONS_SERVICE`，bin 拿不到。
 * 4. `Config.bandizipPath` 的值在 `ctx.settings` 面（缺口 **G2**，ADR-0013），bin 读不到 ⇒
 *    这里不读 `BANDIZIP_PATH` 环境变量，也不猜一个安装路径。
 *
 * `ui` / `gd` / `guided` 三条交互腿未接：全屏 TUI 在 OpenTUI 上、引导流在
 * `@clack/prompts` 上（上游 `Tui.tsx` 与 `interaction.ts`），都不随本包发布
 * （判据见 `src/cli-support.ts` 顶部）。三条腿留在 `--help` 里响亮拒绝，比静默消失好读。
 * 上游引导流那条腿还顺带用剪贴板取路径（`--clipboard` → `platform.ts:37` 的
 * `readClipboardText()`，走 `node:child_process`），与缺口 **G5** 同源，本包同样不搬。
 *
 * @module xaihi-bandia/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  runInteractionCli,
} from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  nodeCliName,
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { BandiaInput, BandiaResult } from './core.ts'
import { runBandia } from './core.ts'
import { createBandiaInteractionSchema, type BandiaInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('bandia')

/**
 * 动作名单的唯一真源是 `package.json#xaihi.node.actions`。这里列的是它四条 id 的字面量，
 * 加上上游那条 `export-efu` 拼法（`<noxide>/cli.ts:155`）；清单漂了由
 * `tests/cli.spec.ts` 的第一条用例按清单逐条比出来，不靠这里自觉。
 */
const NODE_ACTIONS = ['extract', 'compress', 'repack', 'export_efu', 'export-efu'] as const

/** 清单里真的声明的四条动作 id（别名不算），用于 `--json` 载荷里的 `action` 字段。 */
const MANIFEST_ACTION_BY_ALIAS: Record<string, string> = {
  'export-efu': 'export_efu',
}

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

/**
 * 为什么不能在 bin 里执行。`--json` 的载荷与 stderr 用同一句话，不分叉。
 * 缺的那几条要**点名到服务名**：只说"不支持"，使用者无从判断是内核没搬还是宿主没起。
 */
const REFUSAL = '本节点的内核已移植（src/core.ts），但执行需要的三条缝只在宿主进程里有：'
  + '外部程序（Bandizip 与 `which` 探测）走 DSH 的 ctx.subprocess，危险动作的批准走 ctx.approval'
  + '（经 defineNode 的 tools/pre-execute），进度与运行记录走 xaihi-core 的 OPERATIONS_SERVICE；'
  + 'Bandizip 位置的覆盖在 ctx.settings 的 Config.bandizipPath。'
  + '无模型的入口请用工作台面板或宿主侧的动作调用；在 bin 里自行 spawn 是被禁止的（缺口 G1/G6）。'

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Batch extract, compress, repack, and export archive paths with Bandizip.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createBandiaUiDefinition (
  defaults: Partial<BandiaInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<BandiaInput, BandiaResult> {
  let cancelled = false
  let paused = false
  let resumePaused: (() => void) | undefined
  const schema = createBandiaInteractionSchema(defaults, language)
  return {
    schema,
    async run (input, onEvent) {
      cancelled = false
      paused = false
      return runBandia(input, onEvent)
    },
    pause () { paused = true },
    resume () { paused = false; resumePaused?.() },
    cancel () {
      cancelled = true
      paused = false
      resumePaused?.()
    },
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
    createDefinition: (defaults, language) => createBandiaUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).BandiaTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Bandizip batch archive workflow with guided terminal mode.' },
    subCommands: {
      extract: defineCommand({
        meta: { name: 'extract', description: 'Extract archive paths.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('extract', args, host)
        },
      }),
      compress: defineCommand({
        meta: { name: 'compress', description: 'Compress source paths to archives.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('compress', args, host)
        },
      }),
      repack: defineCommand({
        meta: { name: 'repack', description: 'Compress extracted folders back through archive mappings.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('repack', args, host)
        },
      }),
      export_efu: defineCommand({
        meta: { name: 'export_efu', description: 'Export archive or extracted paths to Everything EFU.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('export_efu', args, host)
        },
      }),
      // 上游 `cli.ts:155` 用的是连字符拼法；两条都在面上，指向同一条腿。
      'export-efu': defineCommand({
        meta: { name: 'export-efu', description: 'Alias for export_efu (upstream spelling).' },
        args: actionArgs(),
        async run ({ args }) {
          // 传**字面**子命令名：载荷里的 `invoked` 要能读回"你敲的是哪一条"，
          // 而 `action` 由 MANIFEST_ACTION_BY_ALIAS 折回清单里那个 id。
          await runHostedAction('export-efu', args, host)
        },
      }),
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
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
    },
  })
}

/**
 * flag 名单逐个抄上游 `cli.ts:172-196`，含那三组别名（`mode` / `prefix` / `overwrite`）与
 * `format`+`compressFormat` 两条同义 flag。`--json` 是本仓支撑那条（同 crashu、logx）。
 * 类型只有 `string` / `boolean` 两种：`cli-support.ts` 那份 citty 子集就这两个。
 */
function actionArgs () {
  return {
    path: { type: 'string', description: 'Single path.' },
    paths: { type: 'string', description: 'Comma, semicolon, or newline separated paths.' },
    mappings: { type: 'string', description: 'Mapping JSON or archive=>folder lines.' },
    mappingFile: { type: 'string', description: 'Mapping JSON file.' },
    outputDir: { type: 'string', description: 'Archive output directory for compress.' },
    outputPath: { type: 'string', description: 'EFU output path.' },
    deleteAfter: { type: 'boolean', description: 'Delete archive after successful extract.' },
    useTrash: { type: 'boolean', description: 'Use recycle bin when deleting archives.' },
    parallel: { type: 'boolean', description: 'Extract archives concurrently.' },
    workers: { type: 'string', description: 'Parallel worker count.' },
    extractMode: { type: 'string', description: 'auto or normal.' },
    mode: { type: 'string', description: 'Alias for --extractMode.' },
    outputPrefix: { type: 'string', description: 'Normal extract output folder prefix.' },
    prefix: { type: 'string', description: 'Alias for --outputPrefix.' },
    overwriteMode: { type: 'string', description: 'overwrite, skip, or rename.' },
    overwrite: { type: 'string', description: 'Alias for --overwriteMode.' },
    format: { type: 'string', description: 'zip or 7z.' },
    compressFormat: { type: 'string', description: 'zip or 7z.' },
    deleteSource: { type: 'boolean', description: 'Delete source after successful compression.' },
    open: { type: 'boolean', description: 'Open EFU in Everything.' },
    dryRun: { type: 'boolean', description: 'Plan commands without executing Bandizip.' },
    clipboard: { type: 'boolean', description: 'Read paths from clipboard.（随引导流未接，缺口 G5）' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 四条动作共用的一条腿：**只回显收到的输入，不动文件系统**。
 * 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
 */
async function runHostedAction (action: string, args: CliArgs, host: CliHost): Promise<void> {
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  const manifestAction = MANIFEST_ACTION_BY_ALIAS[action] ?? action
  if (args.json === true) {
    writeJson(host, { node: 'bandia', action: manifestAction, invoked: action, inputs: echoInputs(args), executed: false, refused: REFUSAL })
  } else {
    writeError(host, `${CLI_NAME} ${action} 未接：${REFUSAL}`)
  }
  process.exitCode = 2
}

/**
 * 原样回显，不"顺手"替内核做归一化：`--mode` 与 `--extractMode` 谁赢是内核的事
 * （上游 `cli.ts:244-260` 的 `inputFromArgs` 才有这个优先级），拒绝面里先折一次就是
 * 把一个还没执行的判断演成事实。
 */
function echoInputs (args: CliArgs): Record<string, unknown> {
  const echoed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (key === 'json') continue
    echoed[key] = value
  }
  return echoed
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包，并且**不做任何参数校验**——
 * 未接的功能先报"缺参"会把"这块内核没接上"说成"你参数没给对"。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} extract --paths <文本> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/bandia/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/bandia/src/interaction.ts`），本包不引它'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧的动作调用。`)
  process.exitCode = 2
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
