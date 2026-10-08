#!/usr/bin/env node
/**
 * linku 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/linku/src/cli.ts`
 * （501 行）搬来**脚本化那一条腿**。保留的东西：子命令名
 * `info` / `create` / `move` / `list` / `import` / `restore` / `recover`（`move` 仍是
 * `move_link` 那条动作，上游 `:187` 就是这么映射的）、flag 名 `--path` / `--target` /
 * `--configPath` / `--includeInvalid` / `--json`、`-` 与"没给路径且 stdin 是管道"那条
 * **只取第一行**的兜底（上游 `:249-253` 的 `readStdinLines(...)[0]`）、
 * 每条腿往内核递的字段形状（`import` 只给 `path` / `configPath` / `includeInvalid`，
 * 其余动作给 `path` / `target` / `configPath`）、非 JSON 时的中文标签
 * （路径 / 存在 / 类型 / 软链接 / 链接目标 / 目标存在 / 大小 / 文件数 / 恢复 / 失败 /
 * 已还原 / 导入 / 跳过，上游 `:430-470`）、`kindLabel` 那四个词、以及
 * `result.success` 为假时退出码 1。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **`guided` / `ui` / `gd` 三条腿未接**：上游分别是 `@clack/prompts`
 *    （`runGuided` + `resolvePaths` + `readClipboardText`，`:263-395`）与 OpenTUI
 *    （`runTerminalUi` + `./Tui.tsx`），本仓没有那两个包也不许引 `@xiranite/*`。
 *    三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument"
 *    会把"这块内核没搬"说成"你参数没给对"（同一类误导在 sleept 上刚修掉过）。
 *    随之不搬的还有剪贴板优先那条（`readClipboardText`，它只服务 guided）。
 * 2. **非 JSON 的输出不是彩色面板**：上游用 `writeRichPanel` / `renderProgressBar`
 *    （boxen + chalk）。本包的 vendored 支撑里有同形的实现，但那条腿的**信息集**是
 *    "标签 + 值"，配色与框不是判据；这里逐行打同一批标签值，进度只打 `event.message`。
 *    这是终端面里唯一"形状换了、内容没换"的地方，`tests/cli.spec.ts` 钉的是标签与数值。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.linku]` 的
 *    `default_path` / `default_target`（`cli.ts:59-74`）。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是 `src/index.ts`
 *    的 `Config`，独立 bin 读不到 ⇒ 这里返回空默认，路径只能从 flag 来。
 *    连带后果：**没有 `--configPath` 且宿主没配 `Config.recordsPath` 时，
 *    任何要读写记录的动作都在碰文件之前抛 `RECORDS_PATH_GAP`**（`src/platform.ts`）。
 *    `info` 不碰记录文件，所以它没配也能跑——这与上游一致。
 * 4. **不新增 flag**：内核还吃 `includeInvalid` 之外的东西吗？不吃；但上游定义
 *    （`node-definitions/linku.json`）里**没有 `import` 这个动作**，尽管内核与终端面都有它。
 *    清单是词表真源 ⇒ 宿主侧没有 `linku_import` 工具，`import` 只能从这条腿走（见 `src/index.ts`
 *    文件头第 2 条）。这里不替它补声明。
 * 5. **危险动作在 bin 里照上游执行**：宿主面由 `danger.actionIn` 变成 DSH 的 `ask`，审批在宿主；
 *    bin 不在宿主进程里拿不到那条缝，与 `samea` / `classq` 同一取舍
 *    （`docs/adr/0003-migrated-node-file-state.md` 决定 1）。**记为缺口 `G-terminal-approval`**。
 *
 * @module xaihi-linku/cli
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
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import { runInteractionCli } from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import type { LinkuInput, LinkuPathKind, LinkuResult } from './core.ts'
import { runLinku } from './core.ts'
import { assertRecordsConfigured, createNodeLinkuRuntime } from './platform.ts'
import { createLinkuInteractionSchema, type LinkuInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('linku')

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 * `guided` 是上游 `createProgram` 里真存在过的子命令（`:229-234`），`ui` / `gd` 是
 * `runInteractionCli` 那条派发（`resolveCliInvocation`）给的。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Create, move, list, and recover symlink records.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createLinkuUiDefinition (
  defaults: Partial<LinkuInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<LinkuInput, LinkuResult> {
  const schema = createLinkuInteractionSchema(defaults, language)
  return {
    schema,
    run: (input, onEvent) => runLinku(input, createNodeLinkuRuntime(), onEvent),
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
    createDefinition: (defaults, language) => createLinkuUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).LinkuTui,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} info --path <path> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/linku/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表与剪贴板优先那条在 `@clack/prompts` 上（上游 `packages/nodes/linku/src/interaction.ts` 与 `cli.ts:263-395`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/linku\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Symlink manager with a scripted terminal face.',
    },
    subCommands: {
      info: defineCommand({
        meta: { name: 'info', description: 'Show file, directory, or symlink information.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'info', ...inputFromArgs(await resolvePathArgs(args, host)) }, args.json === true, host)
        },
      }),
      create: defineCommand({
        meta: { name: 'create', description: 'Create a symlink from --target to --path.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'create', ...inputFromArgs(await resolvePathArgs(args, host)) }, args.json === true, host)
        },
      }),
      // 上游子命令名是 `move`，动作名是 `move_link`（`cli.ts:187`）——两个名字都留着。
      move: defineCommand({
        meta: { name: 'move', description: 'Move --path to --target and create a link at the original path.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'move_link', ...inputFromArgs(await resolvePathArgs(args, host)) }, args.json === true, host)
        },
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List recorded links.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'list', ...inputFromArgs(await resolvePathArgs(args, host)) }, args.json === true, host)
        },
      }),
      // 上游 `import` 那条只递 path / configPath / includeInvalid（`cli.ts:204-209`），
      // 不吃 default_path / default_target ⇒ 这里也不给它兜底。
      import: defineCommand({
        meta: { name: 'import', description: 'Import legacy linku.toml records; invalid links are skipped by default.' },
        args: commonArgs(),
        async run ({ args }) {
          const opts = await resolvePathArgs(args, host)
          await runAction({
            action: 'import',
            ...(opts.path === undefined ? {} : { path: opts.path }),
            ...(opts.configPath === undefined ? {} : { configPath: opts.configPath }),
            includeInvalid: opts.includeInvalid === true,
          }, args.json === true, host)
        },
      }),
      restore: defineCommand({
        meta: { name: 'restore', description: 'Move a recorded live link target back to its original path and remove the record.' },
        args: commonArgs(),
        async run ({ args }) {
          const opts = await resolvePathArgs(args, host)
          await runAction({
            action: 'restore',
            ...(opts.path === undefined ? {} : { path: opts.path }),
            ...(opts.configPath === undefined ? {} : { configPath: opts.configPath }),
          }, args.json === true, host)
        },
      }),
      recover: defineCommand({
        meta: { name: 'recover', description: 'Recover missing or incorrect recorded symlinks.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'recover', ...inputFromArgs(await resolvePathArgs(args, host)) }, args.json === true, host)
        },
      }),
      // ↓ 上游有、本包没带的三条腿：面在这儿，实现不在这儿。
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

/** flag 名逐个对齐上游 `commonArgs()`（`:239-247`），一个都不增、一个都不减。 */
function commonArgs () {
  return {
    path: { type: 'string', description: 'Source path.' },
    target: { type: 'string', description: 'Target path or symlink path.' },
    configPath: { type: 'string', description: 'Link records file. 未给时用 Config.recordsPath；两者都没给时读写在碰文件之前被拒绝（见 src/platform.ts）。' },
    includeInvalid: { type: 'boolean', description: 'Import invalid or missing legacy records (default: false).' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `resolveLinkuPathArgs`（`:249-253`）：`--path -` 或"没给 path 且 stdin 是管道"时，
 * 读 stdin 的**第一行**当路径（不是整列）。
 */
async function resolvePathArgs (args: CliArgs, host: CliHost): Promise<{ path?: string; target?: string; configPath?: string; includeInvalid?: boolean }> {
  const raw = typeof args.path === 'string' ? args.path : undefined
  const wantsStdin = raw === '-' || (raw === undefined && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))
  const path = wantsStdin ? (await readStdinLines(host.stdin))[0] ?? '' : raw
  return {
    ...(path === undefined ? {} : { path }),
    ...(typeof args.target === 'string' ? { target: args.target } : {}),
    ...(typeof args.configPath === 'string' ? { configPath: args.configPath } : {}),
    ...(typeof args.includeInvalid === 'boolean' ? { includeInvalid: args.includeInvalid } : {}),
  }
}

interface LinkuOptions {
  path?: string
  target?: string
  configPath?: string
  includeInvalid?: boolean
}

/**
 * 上游 `inputFromArgs`（`:255-261`）去掉 config 默认值那一半后的形状（见文件头第 3 条）。
 * `exactOptionalPropertyTypes` 开着 ⇒ 没给的键**不给**，交回内核自己那句校验。
 */
function inputFromArgs (args: LinkuOptions): LinkuInput {
  return {
    ...(args.path === undefined ? {} : { path: args.path }),
    ...(args.target === undefined ? {} : { target: args.target }),
    ...(args.configPath === undefined ? {} : { configPath: args.configPath }),
  }
}

async function runAction (input: LinkuInput, json: boolean, host: CliHost): Promise<LinkuResult> {
  // 独立 bin 读不到 `Config`，所以记录位置的**唯一**来源是 `--configPath`；
  // 没给就在碰文件系统之前拒（闸门本体在 `platform.ts`，见文件头第 3 条）。
  assertRecordsConfigured(input.action ?? 'info', input.configPath, undefined)
  const result = await runLinku(input, createNodeLinkuRuntime(input.configPath), (event) => {
    if (!json && event.message.trim() !== '') writeLine(host, event.message)
  })

  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return result
  }

  writeLine(host, result.message)
  writeLinkuSummary(host, result)
  if (!result.success) process.exitCode = 1
  return result
}

/** 内容照上游 `writeLinkuSummary`（`:424-471`）那四块；配色与框见文件头第 2 条。 */
function writeLinkuSummary (host: CliHost, result: LinkuResult): void {
  const data = result.data
  if (data === undefined) return

  if (data.pathInfo) {
    const info = data.pathInfo
    const lines = [
      `路径: ${info.path}`,
      `存在: ${info.exists ? '是' : '否'}`,
      `类型: ${kindLabel(info.kind)}`,
      `软链接: ${info.isSymlink ? '是' : '否'}`,
    ]
    if (info.linkTarget) lines.push(`链接目标: ${info.linkTarget}`)
    if (typeof info.targetExists === 'boolean') lines.push(`目标存在: ${info.targetExists ? '是' : '否'}`)
    if (typeof info.sizeMb === 'number') lines.push(`大小: ${info.sizeMb.toFixed(2)} MB`)
    if (typeof info.fileCount === 'number') lines.push(`文件数: ${info.fileCount}`)
    for (const line of lines) writeLine(host, line)
  }

  for (const link of data.links) {
    writeLine(host, `• ${link.link}`)
    writeLine(host, `  -> ${link.target}`)
    writeLine(host, `  ${link.type || 'unknown'}  ${link.createdAt}`)
  }

  if (result.success && (data.recoveredCount > 0 || data.failedCount > 0)) {
    writeLine(host, `恢复: ${String(data.recoveredCount)}  失败: ${String(data.failedCount)}`)
  }
  if (data.restoredCount > 0) writeLine(host, `已还原: ${String(data.restoredCount)}`)
  if (data.importedCount > 0 || data.skippedCount > 0) {
    writeLine(host, `导入: ${String(data.importedCount)}  跳过: ${String(data.skippedCount)}`)
  }
}

/** 上游 `kindLabel`（`:473-480`）逐字。 */
function kindLabel (kind: LinkuPathKind): string {
  switch (kind) {
    case 'dir': return '目录'
    case 'file': return '文件'
    case 'missing': return '缺失'
    default: return '其他'
  }
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
