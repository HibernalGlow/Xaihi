#!/usr/bin/env node
/**
 * nameu 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/nameu/src/cli.ts`
 * （8 行压成一行的那份，`runPipe` 在 `:6`）搬来。保留的东西：子命令名 `scan` / `plan` /
 * `rename` 与 `run` 这个别名（上游 `args.includes("run")` 也算 rename）、flag 名
 * `--mode` / `--no-recursive` / `--no-artist` / `--no-folder-normalize` / `--no-keep-time` /
 * `--dry-run` / `--json`、`-` 读 stdin 的队列写法（含"没给路径且 stdin 是管道就整份读进来"
 * 那条兜底）、非 JSON 时先 `result.message` 再逐行
 * `status\tsourcePath\t->\ttargetName`、**最多 80 行**（上游 `:6` 的 `items.slice(0, 80)`）、
 * 以及 `result.success` 为假时退出码 1。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **位置参路径改成 `--paths <a\nb>`**（与 samea / timeu 同一处理由）：本包的终端支撑是
 *    vendored 的 citty 子集，子命令之后不接受裸位置参。分隔符沿用内核的 `parseList`
 *    （`\n` 与逗号都算，上游 `core.ts:342`）。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts`（`runGuidedInteraction` + `./interaction.ts`），本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument"
 *    会把"这块内核没搬"说成"你参数没给对"（同一类误导在 sleept 上刚修掉过）。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.nameu]` 的 `mode` / `recursive` /
 *    `add_artist_name` / `normalize_folders` / `keep_timestamp` / `dry_run`
 *    （上游 `:3` 那份 `NameuNodeConfig`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里返回空默认，
 *    名单落回内核自带的三条 `DEFAULT_*`（`core.ts:76-78`，只有一份，不在这里抄第二份）。
 *    真接的连带后果要写清：上游那条 `dryRun: action !== "rename" || args.includes("--dry-run")
 *    || config?.dry_run === true` 在没有配置文件时，`xnameu rename` **就是真改名**
 *    （末项恒假）。这里保留同一个行为：`rename` 不带 `--dry-run` 就动文件。
 * 4. **不新增 flag**：内核还吃 `excludeKeywords` / `forbiddenArtistKeywords` /
 *    `archiveExtensions` 与 `path` / `listText` 那几条槽，但上游的终端面没有暴露它们
 *    （`node-definitions/nameu.json` 暴露了）⇒ bin 也不暴露，脚本化要改名单走宿主侧 `/nameu`。
 * 5. **危险动作在 bin 里照上游执行**：宿主面由 `danger.all` 变成 DSH 的 `ask`，审批在宿主；
 *    bin 不在宿主进程里拿不到那条缝，与 `samea` / `dissolvef` 同一取舍
 *    （`docs/adr/0003-migrated-node-file-state.md` 决定 1）。**记为缺口 `G-terminal-approval`**。
 *
 * 另一处"上游有、这里没有"：上游的 `runPipe` 调 `runNameu(input, runtime)` **不传 onEvent**，
 * 所以 bin 不转发进度。这一条照上游，不在这里给终端面加一条它没有的输出。
 *
 * @module xaihi-nameu/cli
 */

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
import type { NameuAction, NameuInput, NameuMode, NameuResult } from './core.ts'
import { runNameu } from './core.ts'
import { createNodeNameuRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('nameu')

/** 非 JSON 时最多打几行计划（上游 `cli.ts:6` 那个 80，不在这里另定一个数）。 */
const ITEM_LINES = 80

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Archive name normalization and rename preview.',
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --help\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/nameu/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/nameu/src/interaction.ts`），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`/nameu\`（\`ctx.commands\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Archive name normalization and rename preview.',
    },
    subCommands: {
      scan: defineCommand({
        meta: {
          name: 'scan',
          description: 'Scan artist folders and report what would change (never renames).',
        },
        args: nameuArgs(),
        async run ({ args }) {
          await runAction('scan', args, host)
        },
      }),
      plan: defineCommand({
        meta: {
          name: 'plan',
          description: 'Build the rename plan without touching files.',
        },
        args: nameuArgs(),
        async run ({ args }) {
          await runAction('plan', args, host)
        },
      }),
      rename: defineCommand({
        meta: {
          name: 'rename',
          description: 'Apply the plan as native renames (pass --dry-run to only preview).',
        },
        args: nameuArgs(),
        async run ({ args }) {
          await runAction('rename', args, host)
        },
      }),
      // 上游 `runPipe` 里 `args.includes('run')` 也算 rename（`cli.ts:6`），别名留在面上。
      run: defineCommand({
        meta: { name: 'run', description: 'Compatibility alias for rename.' },
        args: nameuArgs(),
        async run ({ args }) {
          await runAction('rename', args, host)
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

/**
 * flag 名逐个对齐上游 `runPipe`（`cli.ts:6`）；`--paths` 是文件头第 1 条说的那处偏离。
 * 三条 `--no-*` 与上游一样**只往下拨**：内核默认是 true，`false` 才需要说出口。
 */
function nameuArgs () {
  return {
    paths: { type: 'string', description: 'Artist folders or library roots, separated by newlines or commas. Use "-" to read the queue from stdin.' },
    mode: { type: 'string', description: 'Folder mode: multi (one artist per child folder) or single (the path itself is the artist folder).' },
    recursive: { type: 'boolean', description: 'Descend into subfolders (default true). Use --no-recursive to stay one level deep.' },
    artist: { type: 'boolean', description: 'Append the artist name to archive names (default true). Use --no-artist to leave them alone.' },
    folderNormalize: { type: 'boolean', description: 'Plan folder renames too (default true). Use --no-folder-normalize to keep folder names.' },
    keepTime: { type: 'boolean', description: 'Restore atime/mtime after renaming (default true). Use --no-keep-time to skip it.' },
    dryRun: { type: 'boolean', description: 'Plan only. On rename, passing --dry-run keeps files untouched; omitting it renames for real (same as the upstream bin).' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `cli.ts:6` 那三行 `-` 语义的等价物：队列里出现 `-` 就把**整份 stdin** 接在后面，
 * `-` 本身丢掉；一个路径都没给且 stdin 是管道时，把 stdin 当整个队列。
 * （`Symbol.asyncIterator` 那条守卫是上游同款判据，防止在非异步可迭代的假 stdin 上直接抛。）
 */
async function resolvePaths (args: CliArgs, host: CliHost): Promise<string[]> {
  const raw = typeof args.paths === 'string' ? args.paths.replace(/\\n/g, '\n') : undefined
  const items = raw === undefined
    ? []
    : raw.split(/\r?\n|,/).map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  if (items.includes('-')) {
    const fromStdin = await readStdinLines(host.stdin)
    return [...items.filter((item) => item !== '-'), ...fromStdin]
  }
  if (!items.length && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)) {
    return await readStdinLines(host.stdin)
  }
  return items
}

async function runAction (action: NameuAction, args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const paths = await resolvePaths(args, host)

  const input: NameuInput = {
    action,
    paths,
    ...(typeof args.mode === 'string' ? { mode: args.mode as NameuMode } : {}),
    ...(args.recursive === false ? { recursive: false } : {}),
    ...(args.artist === false ? { addArtistName: false } : {}),
    ...(args.folderNormalize === false ? { normalizeFolders: false } : {}),
    ...(args.keepTime === false ? { keepTimestamp: false } : {}),
    // 上游 `cli.ts:6` 逐字：`action !== "rename" || args.includes("--dry-run") || config?.dry_run === true`。
    // 第 3 条那份配置在本仓不存在（文件头第 3 条），所以这里只剩前两项。
    dryRun: action !== 'rename' || args.dryRun === true,
  }

  // 上游这里不传 onEvent：bin 不转发进度，照上游。
  const result: NameuResult = await runNameu(input, createNodeNameuRuntime())

  if (json) {
    writeJson(host, result)
  } else {
    writeLine(host, result.message)
    for (const item of result.data?.items.slice(0, ITEM_LINES) ?? []) {
      writeLine(host, `${item.status}\t${item.sourcePath}\t->\t${item.targetName}`)
    }
  }
  if (!result.success) process.exitCode = 1
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
