#!/usr/bin/env node
/**
 * samea 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/samea/src/cli.ts`
 * （51 行）搬来。保留的东西：子命令名 `plan` / `classify` 与 `run` 这个别名、flag 名
 * `--min` / `--centralize` / `--ignore-path-blacklist` / `--dry-run` / `--json`、
 * `-` 读 stdin 的根目录队列（上游 `:36-37`，含"无显式路径且 stdin 是管道就整份读进来"
 * 那条兜底）、非 JSON 时先 `result.message` 再逐行
 * `status\tartistName\tsourcePath\t->\ttargetPath`、**最多 100 行**（上游 `:40` 的
 * `items.slice(0, 100)`）、以及 `result.success` 为假时退出码 1。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **位置参路径改成 `--paths <a\nb>`**（与 timeu 同一处理由）：本包的终端支撑是 vendored
 *    的 citty 子集，子命令之后不接受裸位置参。分隔符沿用内核的 `parseList`（`\n` 与逗号都算）。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts`（`runGuidedInteraction` + `./interaction.ts`），本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument"
 *    会把"这块内核没搬"说成"你参数没给对"（同一类误导在 sleept 上刚修掉过）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.samea]` 的
 *    `min_occurrences` / `centralize` / `dry_run` 与四份名单（artist / path / regex /
 *    archive_extensions）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里返回空默认，
 *    名单落回内核自带的默认黑名单（`core.ts` 的 `DEFAULT_*`，只有一份，不在这里抄第二份）。
 *    真接的连带后果：上游的 `classify` 在 bin 里**永远预演**
 *    （`dryRun: action !== 'classify' || args.includes('--dry-run') || config?.dry_run !== false`，
 *    没有那份 toml 时末项恒真）。这里没有配置文件，所以 `--no-dry-run` 就是唯一的真执行开关。
 * 4. **`--min` 之外不新增 flag**：内核还吃 `includeDirectories` / `skipGroupedDirectories`，
 *    但上游的终端面与 `node-definitions/samea.json` 都没暴露它们 ⇒ 这里也不暴露。
 * 5. **危险动作在 bin 里照上游执行**：宿主面由 `danger.all` 变成 DSH 的 `ask`，审批在宿主；
 *    bin 不在宿主进程里拿不到那条缝，与 `dissolvef` 同一取舍
 *    （`docs/adr/0003-migrated-node-file-state.md` 决定 1）。**记为缺口 `G-terminal-approval`**。
 *
 * @module xaihi-samea/cli
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
import type { SameaAction, SameaInput, SameaResult } from './core.ts'
import { runSamea } from './core.ts'
import { createNodeSameaRuntime } from './platform.ts'
import { createSameaInteractionSchema, type SameaInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('samea')

/** 非 JSON 时最多打几行计划（上游 `cli.ts:40` 那个 100，不在这里另定一个数）。 */
const ITEM_LINES = 100

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Extract artist metadata from archive names and organize matching archives.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createSameaUiDefinition (
  defaults: Partial<SameaInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<SameaInput, SameaResult> {
  const schema = createSameaInteractionSchema(defaults, language)
  return {
    schema,
    run: (input, onEvent) => runSamea(input, createNodeSameaRuntime(), onEvent),
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
    createDefinition: (defaults, language) => createSameaUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).SameaTui,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --help\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/samea/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/samea/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/samea\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Extract artist metadata from archive names and organize matching archives.',
    },
    subCommands: {
      plan: defineCommand({
        meta: {
          name: 'plan',
          description: 'Preview artist folders and planned transfers without moving anything.',
        },
        args: sameaArgs(),
        async run ({ args }) {
          await runAction('plan', args, host)
        },
      }),
      classify: defineCommand({
        meta: {
          name: 'classify',
          description: 'Move ready archives into their artist folders (needs --no-dry-run to actually move).',
        },
        args: sameaArgs(),
        async run ({ args }) {
          await runAction('classify', args, host)
        },
      }),
      // 上游 `runPipe` 里 `args.includes('run')` 也算 classify（`cli.ts:34`），别名留在面上。
      run: defineCommand({
        meta: {
          name: 'run',
          description: 'Compatibility alias for classify.',
        },
        args: sameaArgs(),
        async run ({ args }) {
          await runAction('classify', args, host)
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
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
    },
  })
}

/** flag 名逐个对齐上游 `runPipe`（`:31-42`）；`--paths` 是文件头第 1 条说的那处偏离。 */
function sameaArgs () {
  return {
    paths: { type: 'string', description: 'Archive roots, separated by newlines or commas. Use "-" to read the queue from stdin.' },
    min: { type: 'string', description: 'Minimum occurrences before an artist folder is built (1..100).' },
    centralize: { type: 'boolean', description: 'Collect artist folders under [00画师分类].' },
    ignorePathBlacklist: { type: 'boolean', description: 'Ignore the path blacklist while scanning.' },
    dryRun: { type: 'boolean', description: 'Plan only (default true). Use --no-dry-run on classify to actually move archives.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * `--paths` 可以是 `-`（上游的 stdin 队列写法）；上游还有一条"没给路径且 stdin 是管道
 * 就整份读进来"的兜底（`cli.ts:37`），那条也留着——分隔语义仍交给内核的 `parseList`。
 */
async function resolvePaths (args: CliArgs, host: CliHost): Promise<string | undefined> {
  const raw = args.paths
  if (typeof raw === 'string' && raw !== '-') return raw.replace(/\\n/g, '\n')   // 内联写法与本仓 linedup 的 `--source` 同一口径：`\n` 是换行
  if (typeof raw === 'string' && raw === '-') return (await readStdinLines(host.stdin)).join('\n')
  if (hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)) return (await readStdinLines(host.stdin)).join('\n')
  return undefined
}

async function runAction (action: SameaAction, args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const listText = await resolvePaths(args, host)
  const min = typeof args.min === 'string' ? Number(args.min) : undefined

  const input: SameaInput = {
    action,
    ...(listText === undefined ? {} : { listText }),
    ...(min === undefined || !Number.isFinite(min) ? {} : { minOccurrences: min }),
    ...(typeof args.centralize === 'boolean' ? { centralize: args.centralize } : {}),
    ...(typeof args.ignorePathBlacklist === 'boolean' ? { ignorePathBlacklist: args.ignorePathBlacklist } : {}),
    ...(typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
  }

  const result: SameaResult = await runSamea(input, createNodeSameaRuntime(), (event) => {
    if (!json && event.message) writeLine(host, event.message)
  })

  if (json) {
    writeJson(host, result)
  } else {
    writeLine(host, result.message)
    for (const item of result.data?.items.slice(0, ITEM_LINES) ?? []) {
      writeLine(host, `${item.status}\t${item.artistName}\t${item.sourcePath}\t->\t${item.targetPath}`)
    }
  }
  if (!result.success) process.exitCode = 1
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
