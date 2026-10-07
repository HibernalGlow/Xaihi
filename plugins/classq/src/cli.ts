#!/usr/bin/env node
/**
 * classq 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/classq/src/cli.ts`
 * （55 行）搬来。保留的东西：子命令名 `plan` / `classify` 与 `run` 这个别名
 * （上游 `:40` 的 `args.includes("classify") || args.includes("run")`）、flag 名
 * `--keyword` / `--wait` / `--transfer` / `--existing` / `--dry-run` / `--apply` / `--json`、
 * `-` 读 stdin 的根目录队列（上游 `:43`，含"无显式路径且 stdin 是管道就整份读进来"
 * 那条兜底）、非 JSON 时先 `result.message` 再逐行
 * `status\tstage\tsourceName\t->\ttargetRelative`、**最多 80 行**（上游 `:48` 的
 * `items.slice(0, 80)`）、以及 `result.success` 为假时退出码 1。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **位置参根目录改成 `--paths <a\nb>`**（与 samea 同一处理由）：本包的终端支撑是 vendored
 *    的 citty 子集，子命令之后不接受裸位置参，而上游 `pathArgs` 是靠"滤掉已知命令与 flag 名"
 *    把位置参挑出来的。分隔符沿用内核的 `parseList`（`\n` 与逗号都算），所以 `-` 与管道那两条
 *    仍然读成多行根目录。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts`（`runInteractionCli` + `./interaction.ts`），本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument"
 *    会把"这块内核没搬"说成"你参数没给对"（同一类误导在 sleept 上刚修掉过）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.classq]` 的
 *    `keyword` / `wait_keyword` / `transfer_mode` / `existing_policy`
 *    （`cli.ts:41` 的 `loadNodeConfigWithHints`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里只认 flag，
 *    缺省落回内核自己的 `already` / `wait` / `move` / `merge`（名单只有一份，不在这里抄第二份）。
 *    `dryRun` 那条表达式**不含配置**（上游 `:45` 的
 *    `action !== "classify" || args.includes("--dry-run") || !args.includes("--apply")`），
 *    所以 bin 里 `classify` 不加 `--apply` 永远只出计划，这条原样保留。
 * 4. **不新增 flag**：内核还吃 `path`（单数）与 `listText`，但上游的终端面与
 *    `node-definitions/classq.json` 都没暴露它们 ⇒ 这里也不暴露，两条槽都由 `--paths` 喂。
 * 5. **危险动作在 bin 里照上游执行**：宿主面由 `danger.all` 变成 DSH 的 `ask`，审批在宿主；
 *    bin 不在宿主进程里拿不到那条缝，与 `samea` / `dissolvef` 同一取舍
 *    （`docs/adr/0003-migrated-node-file-state.md` 决定 1）。**记为缺口 `G-terminal-approval`**。
 *
 * @module xaihi-classq/cli
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
  runNodeCliFace,
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { ClassqAction, ClassqExistingPolicy, ClassqInput, ClassqResult, ClassqTransferMode } from './core.ts'
import { runClassq } from './core.ts'
import { createNodeClassqRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('classq')

/** 非 JSON 时最多打几行计划（上游 `cli.ts:48` 那个 80，不在这里另定一个数）。 */
const ITEM_LINES = 80

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Keyword-folder wait routing.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

export async function runProgram(args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + `脚本化请用 \`${CLI_NAME} plan --paths <文本> --json\`。`,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --paths <文本> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/classq/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/classq/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/classq\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Keyword-folder wait routing.',
    },
    subCommands: {
      plan: defineCommand({
        meta: {
          name: 'plan',
          description: 'Find keyword folders and preview the wait-folder transfers without moving anything.',
        },
        args: classqArgs(),
        async run ({ args }) {
          await runAction('plan', args, host)
        },
      }),
      classify: defineCommand({
        meta: {
          name: 'classify',
          description: 'Move or copy ready siblings into the wait folders (needs --apply to actually transfer).',
        },
        args: classqArgs(),
        async run ({ args }) {
          await runAction('classify', args, host)
        },
      }),
      // 上游 `runPipe` 里 `args.includes("run")` 也算 classify（`cli.ts:40`），别名留在面上。
      run: defineCommand({
        meta: {
          name: 'run',
          description: 'Compatibility alias for classify.',
        },
        args: classqArgs(),
        async run ({ args }) {
          await runAction('classify', args, host)
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
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** flag 名逐个对齐上游 `runPipe`（`:45` 的 `valueFor` 那四个 + `--dry-run` / `--apply` / `--json`）；`--paths` 是文件头第 1 条说的那处偏离。 */
function classqArgs () {
  return {
    paths: { type: 'string', description: 'Root directories, separated by newlines or commas. Use "-" to read the queue from stdin.' },
    keyword: { type: 'string', description: 'Keyword folder name to look for (default already).' },
    wait: { type: 'string', description: 'Wait folder name (default wait).' },
    transfer: { type: 'string', description: 'Transfer mode for ready items: move or copy.' },
    existing: { type: 'string', description: 'Existing-target policy: merge (report conflict) or skip (report target_exists_skip).' },
    dryRun: { type: 'boolean', description: 'Plan only (default true on classify, same as upstream).' },
    apply: { type: 'boolean', description: 'Actually transfer on classify.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * `--paths` 可以是 `-`（上游的 stdin 队列写法）；上游还有一条"没给路径且 stdin 是管道
 * 就整份读进来"的兜底（`cli.ts:44`），那条也留着——分隔语义仍交给内核的 `parseList`。
 */
async function resolvePaths (args: CliArgs, host: CliHost): Promise<string | undefined> {
  const raw = args.paths
  if (typeof raw === 'string' && raw !== '-') return raw.replace(/\\n/g, '\n')   // 内联写法与本仓 linedup / samea 的 `--paths` 同一口径：`\n` 是换行
  if (typeof raw === 'string' && raw === '-') return (await readStdinLines(host.stdin)).join('\n')
  if (hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)) return (await readStdinLines(host.stdin)).join('\n')
  return undefined
}

/** 上游 `:45` 那条表达式的 vendored 版本：`--dry-run` 与"没给 `--apply`"两条都算预演。 */
function dryRunOf (action: ClassqAction, args: CliArgs): boolean {
  return action !== 'classify' || args.dryRun === true || args.apply !== true
}

async function runAction (action: ClassqAction, args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const listText = await resolvePaths(args, host)

  const input: ClassqInput = {
    action,
    ...(listText === undefined ? {} : { listText }),
    ...(typeof args.keyword === 'string' ? { keyword: args.keyword } : {}),
    ...(typeof args.wait === 'string' ? { waitKeyword: args.wait } : {}),
    ...(typeof args.transfer === 'string' ? { transferMode: args.transfer as ClassqTransferMode } : {}),
    ...(typeof args.existing === 'string' ? { existingPolicy: args.existing as ClassqExistingPolicy } : {}),
    dryRun: dryRunOf(action, args),
  }

  const result: ClassqResult = await runClassq(input, createNodeClassqRuntime(), (event) => {
    if (!json && event.message) writeLine(host, event.message)
  })

  if (json) {
    writeJson(host, result)
  } else {
    writeLine(host, result.message)
    for (const item of result.data?.items.slice(0, ITEM_LINES) ?? []) {
      writeLine(host, `${item.status}\t${item.stage}\t${item.sourceName}\t->\t${item.targetRelative}`)
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
