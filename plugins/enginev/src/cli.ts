#!/usr/bin/env node
/**
 * enginev 的终端面（**只拒绝、不执行**那一档）。
 *
 * 动作名单与 flag 名单都有真源：子命令名取 `package.json#xaihi.node.actions`
 * （`scan` / `filter` / `rename` / `delete` / `export`，与上游 `cli.ts:117-147` 那五条
 * 一一对应），flag 名逐个抄上游 `cli.ts:158-182` 的 `commonArgs()`（含 `rating` /
 * `output` 这两条别名），一个都不新增、一个都不改名。
 *
 * 内核（`src/core.ts`）这次是**真搬来了**，但这一面仍然一律退出码 2 并点名缺的那几条缝。
 * 为什么不在 bin 里把内核跑一遍：
 * 1. **批准缝** `ctx.approval` 只活在宿主（缺口 **G6**）：定义里 `rename` / `delete`
 *    在非预演时是 `danger.all`，经 `defineNode` 变成 `tools/pre-execute` 的 `ask`；
 *    从终端直接跑没有批准环节可展示，所以 `--execute` 这类"绕过批准"的形状**不做**
 *    ——上游那条 `--execute`（`cli.ts:157` 的 `execute: "Execute rename/delete instead of
 *    dry-run."`）在这里只作为 flag 名保留在面上，真跑到那条腿一律拒绝。
 * 2. 进度与运行记录在 xaihi-core 的 `OPERATIONS_SERVICE`，bin 拿不到（同 `crashu`、`logx`）。
 * 3. `Config.workshopPath` 等默认值在 `ctx.settings` 面（缺口 **G2**，ADR-0013）：
 *    上游那份 `[nodes.enginev]` 的 TOML 默认（`workshop_root` / `template` / `export_path`
 *    / `export_format` / `max_workers`）在这里读不到，于是这一面**没有**任何配置兜底，
 *    只有命令行给的值——而命令行给的值最终也要走被上面那条拒绝拦住的那一次执行。
 * 4. 台账给这个节点记的 hostRequirements 是 `os-native` + `recursive-enumeration` +
 *    `file-io`：一次 `scan` 就要把整棵工坊目录树铺开算尺寸。批准缝与账本两头都在宿主，
 *    这一面能给的只有"收到了哪些参数"，给不了可核对的结果。
 *
 * `ui` / `gd` / `guided` 三条交互腿未接：全屏 TUI 在 OpenTUI 上、引导流在 `@clack/prompts`
 * 上（上游 `Tui.tsx` 与 `interaction.ts`），都不随本包发布（判据见 `src/cli-support.ts` 顶部）。
 * 上游引导流还从剪贴板取路径（`platform.ts:32-57` 的 `readClipboardText()`，
 * 走 `node:child_process`），与缺口 **G5** 同源，本包同样不搬。
 *
 * @module xaihi-enginev/cli
 */

import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  nodeCliName,
  runNodeCliFace,
  runPipeProgram,
  writeError,
  writeJson,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'

const CLI_NAME = nodeCliName('enginev')

/**
 * 动作名单的唯一真源是 `package.json#xaihi.node.actions`。这里列的是它那五条 id 的字面量；
 * 清单漂了由 `tests/cli.spec.ts` 的第一条用例按清单逐条比出来，不靠这里自觉。
 */
const NODE_ACTIONS = ['scan', 'filter', 'rename', 'delete', 'export'] as const

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
  + '危险动作的批准走 DSH 的 ctx.approval（经 defineNode 的 tools/pre-execute），'
  + '进度与运行记录走 xaihi-core 的 OPERATIONS_SERVICE，工坊目录等默认值走 ctx.settings 的 Config。'
  + '无模型的入口请用工作台面板或宿主侧的动作调用；在 bin 里直接改盘是被禁止的（缺口 G6/G2）。'

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Scan, filter, rename, delete, and export Wallpaper Engine workshop folders.',
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
      + '而本节点的执行需要 ctx.approval 与运行账本，两样都只在宿主进程里。',
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Wallpaper Engine workshop scanner and batch folder manager.' },
    subCommands: {
      scan: defineCommand({
        meta: { name: 'scan', description: 'Scan a Wallpaper Engine workshop folder.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('scan', args, host)
        },
      }),
      filter: defineCommand({
        meta: { name: 'filter', description: 'Filter scanned or freshly scanned wallpapers.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('filter', args, host)
        },
      }),
      rename: defineCommand({
        meta: { name: 'rename', description: 'Plan or execute batch folder rename/copy.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('rename', args, host)
        },
      }),
      delete: defineCommand({
        meta: { name: 'delete', description: 'Plan or execute wallpaper folder deletion.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('delete', args, host)
        },
      }),
      export: defineCommand({
        meta: { name: 'export', description: 'Export filtered wallpapers as JSON or paths.' },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction('export', args, host)
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
        meta: { name: 'guided', description: 'Open the rich guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/**
 * flag 名单逐个抄上游 `cli.ts:158-182`（含 `rating` = `contentRating` 的别名、
 * `output` = `exportPath` 的别名，以及 `dryRun` / `execute` 这一对方向相反的开关）。
 * 类型只有 `string` / `boolean` 两种：`src/cli-support.ts` 那份 citty 子集就这两个。
 */
function actionArgs () {
  return {
    path: { type: 'string', description: 'Workshop folder path.' },
    wallpapersFile: { type: 'string', description: 'JSON file containing wallpapers from a previous scan.' },
    title: { type: 'string', description: 'Title filter.' },
    contentRating: { type: 'string', description: 'Content rating filter.' },
    rating: { type: 'string', description: 'Alias for --contentRating.' },
    type: { type: 'string', description: 'Wallpaper type filter.' },
    tags: { type: 'string', description: 'Comma-separated tag filter.' },
    ids: { type: 'string', description: 'Comma-separated workshop ids.' },
    template: { type: 'string', description: 'Rename template.' },
    descMaxLength: { type: 'string', description: 'Description placeholder max length.' },
    nameMaxLength: { type: 'string', description: 'Final folder name max length.' },
    dryRun: { type: 'boolean', description: 'Preview file operations.' },
    execute: { type: 'boolean', description: 'Execute rename/delete instead of dry-run.（要 ctx.approval，缺口 G6）' },
    permanent: { type: 'boolean', description: 'Delete permanently instead of trash.' },
    copyMode: { type: 'boolean', description: 'Copy folders to --targetPath instead of renaming in place.' },
    targetPath: { type: 'string', description: 'Target folder for copy mode.' },
    output: { type: 'string', description: 'Export output path.' },
    exportPath: { type: 'string', description: 'Export output path.' },
    format: { type: 'string', description: 'Export format: json or paths.' },
    exportFormat: { type: 'string', description: 'Export format: json or paths.' },
    sortField: { type: 'string', description: 'Sort field.' },
    sortOrder: { type: 'string', description: 'asc or desc.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 五条动作共用的一条腿：**只回显收到的输入，不动文件系统**。
 * 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
 */
async function runHostedAction (action: string, args: CliArgs, host: CliHost): Promise<void> {
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  if (args.json === true) {
    writeJson(host, { node: 'enginev', action, inputs: echoInputs(args), executed: false, refused: REFUSAL })
  } else {
    writeError(host, `${CLI_NAME} ${action} 未接：${REFUSAL}`)
  }
  process.exitCode = 2
}

/**
 * 原样回显，不"顺手"替内核做归一化：`rating` 与 `contentRating` 谁赢、`output` 与
 * `exportPath` 谁赢都是内核/上游 `inputFromArgs`（`cli.ts:218-242`）的事，
 * 拒绝面里先折一次就等于把一个还没执行的判断演成事实。
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
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包与文件，
 * 并且**不做任何参数校验**——未接的功能先报"缺参"会把"这块内核没接上"说成"你参数没给对"。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} scan --path <工坊目录> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/enginev/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/enginev/src/interaction.ts`），本包不引它'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧的动作调用。`)
  process.exitCode = 2
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
