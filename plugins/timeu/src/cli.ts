#!/usr/bin/env node
/**
 * timeu 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/timeu/src/cli.ts`
 * （237 行）搬来。保留的东西：子命令名 `scan` / `backup` / `restore`、flag 名
 * `--record` / `--no-recursive` / `--include-directories` / `--dry-run` / `--json`、
 * `--json` 输出的是整个 `TimeuResult`、非 JSON 时先把内核的 progress 事件当行打出来、
 * 结论行是 `result.message`、**运行失败判退出码 1**（上游 `:215`），
 * 以及 `-` 读 stdin 路径队列（上游 `:195-198`）。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **位置参路径改成 `--paths <a\nb>`**。上游自己 parse 参数（`args.slice(1).filter(…)`），
 *    而本包的终端支撑是 vendored 的 citty 子集（`src/cli-support.ts`），
 *    它在子命令之后不接受裸位置参（`Unknown argument: <token>.`，退出码 2）。
 *    为了不在这里再抄一份第二参数解析器（那正是 `check-vendored` 要防的漂），
 *    路径走 flag；分隔符沿用内核自己的 `parseList`（`\n` 与逗号都算）。
 * 2. **`ui` / `gd` / `guided` 未接**：上游那两条腿分别是 OpenTUI
 *    （`@xiranite/cli-runtime/terminal` 的 `runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 引导流（`runGuidedInteraction` + `./interaction.ts`），
 *    本仓既没有那两个包也不许引 `@xiranite/*`（`pnpm-workspace.yaml` 顶部注释）。
 *    该由谁替：工作台面板（`frontend/Panel.tsx` 那条 remote 半边在
 *    `packages/ui-host/src/nodes/timeu/`）与宿主侧 `ctx.commands` 的 `/timeu`。
 *    三条腿**都不带任何参数校验**：未接的功能先报 "Missing required argument" 会把
 *    "这块内核没搬"说成"你参数没给对"（同一类误导在 sleept 上刚修掉过）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.timeu]` 的
 *    `record_path` / `recursive` / `include_directories` / `dry_run` 当默认值。
 *    按 `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是
 *    `src/index.ts` 的 `Config`，只有跑在 DSH 进程里才读得到，独立 bin 读不到 ⇒
 *    这里返回空默认，一切以命令行给的为准；内核自己的默认（recursive=true、dryRun=true）
 *    因此就是 bin 的默认，**要真动文件得显式写 `--no-dry-run`**。
 * 4. **危险动作在 bin 里照上游执行**（`backup` / `restore` 的真写盘）。宿主面那半边
 *    由 `danger.all` 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，
 *    拿不到那条缝。这与同批的 `dissolvef` 是同一个取舍（它的 `dissolve` / `undo` 也在
 *    终端面真动文件，见 `docs/adr/0003-migrated-node-file-state.md` 决定 1），
 *    保护来自默认 dry-run 与"先跑 scan/plan 再跑真动作"这两条，而不是在这里再设一道
 *    上游没有的拒绝。**记为缺口**：`G-terminal-approval`（见 `docs/service-mapping.md`）。
 *
 * @module xaihi-timeu/cli
 */

import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  nodeCliName,
  readStdinLines,
  runNodeCliFace,
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { TimeuAction, TimeuInput, TimeuResult } from './core.ts'
import { runTimeu } from './core.ts'
import { createNodeTimeuRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('timeu')

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Back up and restore file timestamps.',
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
      + `脚本化请用 \`${CLI_NAME} scan --paths <文本> --json\`。`,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} scan --help\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/timeu/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/timeu/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/timeu\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Back up and restore file timestamps from JSON records.',
    },
    subCommands: {
      scan: defineCommand({
        meta: {
          name: 'scan',
          description: 'Collect paths and report the timestamps that would be recorded (never writes).',
        },
        args: timeuArgs(),
        async run ({ args }) {
          await runAction('scan', args, host)
        },
      }),
      backup: defineCommand({
        meta: {
          name: 'backup',
          description: 'Write atime/mtime/ctime/birthtime into the JSON record file.',
        },
        args: timeuArgs(),
        async run ({ args }) {
          await runAction('backup', args, host)
        },
      }),
      restore: defineCommand({
        meta: {
          name: 'restore',
          description: 'Apply stored atime/mtime back onto existing files.',
        },
        args: timeuArgs(),
        async run ({ args }) {
          await runAction('restore', args, host)
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

/** flag 名逐个对齐上游 `runPipe`（`:166-220`）；`--paths` 是文件头第 1 条说的那处偏离。 */
function timeuArgs () {
  return {
    paths: { type: 'string', description: 'Paths, separated by newlines or commas. Use "-" to read the queue from stdin.' },
    record: { type: 'string', description: 'Timestamp record file (timeu-timestamps.json next to the first target when omitted).' },
    recursive: { type: 'boolean', description: 'Recurse into directories (default true; --no-recursive to stop).' },
    includeDirectories: { type: 'boolean', description: 'Treat directories themselves as timestamp targets.' },
    dryRun: { type: 'boolean', description: 'Plan only (default true). Use --no-dry-run to let backup/restore touch the disk.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * `--paths` 的值可能是 `-`（上游的 stdin 队列写法）。读回来的行按换行拼回去，
 * 分隔语义仍交给内核的 `parseList`，这里不另定一套切法规则。
 */
async function resolvePaths (args: CliArgs, host: CliHost): Promise<string | undefined> {
  const raw = args.paths
  if (typeof raw !== 'string') return undefined
  if (raw !== '-') return raw.replace(/\\n/g, '\n')   // 内联写法与本仓 linedup 的 `--source` 同一口径：`\n` 是换行
  return (await readStdinLines(host.stdin)).join('\n')
}

async function runAction (action: TimeuAction, args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const listText = await resolvePaths(args, host)
  const recordPath = typeof args.record === 'string' ? args.record : undefined

  const input: TimeuInput = {
    action,
    ...(listText === undefined ? {} : { listText }),
    ...(recordPath === undefined || recordPath === '' ? {} : { recordPath }),
    ...(typeof args.recursive === 'boolean' ? { recursive: args.recursive } : {}),
    ...(typeof args.includeDirectories === 'boolean' ? { includeDirectories: args.includeDirectories } : {}),
    ...(typeof args.dryRun === 'boolean' ? { dryRun: args.dryRun } : {}),
  }

  const result: TimeuResult = await runTimeu(input, createNodeTimeuRuntime(), (event) => {
    // 上游同款：非 JSON 时把内核 progress 说的话当普通行打出来（`--json` 下必须只有一份 JSON）。
    if (!json && event.message) writeLine(host, event.message)
  })

  if (json) writeJson(host, result)
  else writeLine(host, result.message)
  if (!result.success) process.exitCode = 1
}

/**
 * 自执行闸门：与 linedup / dissolvef 同一写法（`.bin` 软链下 argv[1] 未必等于
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
