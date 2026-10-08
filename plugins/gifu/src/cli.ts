#!/usr/bin/env node
/**
 * Gifu 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/gifu/src/cli.ts`（412 行）
 * 搬"非交互"那一棵的面：三条子命令与顺序（`inspect / plan / make`，上游 `:229-231`）、
 * `pipeArgs()` 那 28 条 flag 的名字、别名与说明逐条（`:328-359`）、`-` 与"没给路径且 stdin
 * 是管道"就读 stdin 那条判据（`:244-245`）、`ui / gd / guided` 三条交互腿（`:216-228`）、
 * 无参且非 TTY 时那句 `No interactive terminal detected.`（`:139-143`）、`--json` 打印整份
 * 结果与 `result.success` 为假时退出码 1（`:248-250`）。
 *
 * 一处结构性偏离，写在能看见的地方：
 * 1. **三条动作腿在独立 bin 里一律拒绝（退出码 2）**，而且**这不是"只缺执行"而是"连计划都出不了"**：
 *    本包每一次外部程序调用（7-Zip 数图 / 解包、ffmpeg 缩放与编码、ffprobe 读尺寸）都走 DSH 的
 *    `ctx.subprocess`（`src/platform.ts`），独立 bin 不在宿主进程里拿不到那条缝（缺口 G1/G6 那一类：
 *    缝活在插件进程里，`$PATH` 上那一面活在它外面）。上游的 `plan` / `inspect` 也要先
 *    `7z l -slt` 把每个归档里的图片数出来（`core.ts:279`），所以本面**没有** mvz 那种"预演那一条腿
 *    真跑"的形状；退化成"猜一个图片数"的计划就是伪造数据。拒绝**在任何参数校验之前**：未接的动作
 *    先报"你少给了一个 flag"会把"这条缝不在"说成"你用错了命令"。
 *    缺的那条缝的名字写在拒绝文案里（唯一真源 `src/platform.ts` 的 `GIFU_PROCESS_SEAM_REFUSAL`，
 *    stderr 与 `--json` 的 `refused` 字段共用同一句，不分叉）。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`loadScreen` 里的 `./Tui.tsx`）与
 *    `@clack` 引导流（`interaction.ts` + `runGuidedInteraction`），本仓没有那两个包也不许引
 *    `@xiranite/*`。三条腿**都不带任何参数校验**，与 `plugins/mvz/src/cli.ts` 第 3 条同一判据。
 * 3. **不读 `[nodes.gifu]` 配置**（上游 `resolveGifuDefaults`，`:255-296` 那 24 个键）：按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置住在磁盘上的 toml"通路整块不搬，
 *    同一批默认值现在住在 `src/index.ts` 的 `Config`，独立 bin 读不到（缺口 G2）。连带后果：
 *    上游那条 `defaults.dry_run` 的兜底在这里不存在，缺省一律落回内核自己那份
 *    `defaultGifuInput`（`core.ts:187-216`）——内核的 `dryRun` 默认是 **true**，这一格与清单一致。
 * 4. **`--paths` 换成一条字符串 flag**：上游是 `paths: { type: "positional" }` 加
 *    `normalizeMultiplePaths()`（`:374-390`）把多个位置参拼成 `a;b` 再交给内核。本仓 vendored
 *    解析器没有 positional 这一档（`src/cli-support.ts` 的 `CliArgSpec` 只有 `string | boolean`），
 *    所以面直接收那份**拼好的**串：`xgifu plan --paths "a.zip;b.zip"` 进到内核的是同一个字符串，
 *    `parsePathList`（`core.ts:614-616`）按 `\n` 与 `;` 拆。上游那个拼装函数因此没有对应物，
 *    **不搬**一份死代码；要多条路径请用 `;` 或 `--listFile`（`:332` 那条 flag 原样在面上）。
 * 5. **危险动作在 bin 里没有批准环节可展示**（缺口 G6）：宿主面由清单的 `danger` 变成 DSH 的 `ask`，
 *    这一面第 1 条已经先拒了，所以不提供 `--force` / `--live` 一类的形状——`--live` 只在
 *    `--help` 的 flag 名单里出现（上游原样），它改的是 `dryRun`，而 `dryRun` 走到哪一步都还要那条缝。
 *
 * @module xaihi-gifu/cli
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
import type { GifuAction, GifuInput, GifuResult, GifuRuntime } from './core.ts'
import { parsePathList, runGifu } from './core.ts'
import { GIFU_PROCESS_SEAM_REFUSAL, createNodeGifuRuntime } from './platform.ts'
import { createGifuInteractionSchema, type GifuInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('gifu')

/** 动作名单的唯一真源是 `package.json#xaihi.node.actions`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS: readonly GifuAction[] = ['inspect', 'plan', 'make']

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Convert image archives to GIF, WebP, APNG, WebM, or MP4 with the native media runtime.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createGifuUiDefinition (
  defaults: Partial<GifuInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<GifuInput, GifuResult> {
  let activeRuntime: GifuRuntime | undefined
  return {
    schema: createGifuInteractionSchema(defaults, language),
    async run (input, onEvent) {
      activeRuntime = createNodeGifuRuntime()
      return runGifu(input, activeRuntime, onEvent)
    },
    cancel () {
      activeRuntime?.cancel?.()
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
    createDefinition: (defaults, language) => createGifuUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).GifuTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  const actionSpec = (action: GifuAction, description: string): CliCommandSpec => defineCommand({
    meta: { name: action, description },
    args: pipeArgs(),
    async run ({ args }) {
      await runAction(action, args, host)
    },
  })

  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Native archive-to-animation converter with OpenTUI, guide, and pipeline modes.',
    },
    subCommands: {
      // 描述逐条抄上游 `:229`、`:230`、`:231`。
      inspect: actionSpec('inspect', 'Inspect archive image entries without writing files.'),
      plan: actionSpec('plan', 'Plan native output paths without writing files.'),
      make: actionSpec('make', 'Convert archives; use --live to write output files.'),
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full OpenTUI workbench.（未接）' },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided flow.（未接）' },
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
 * flag 名单逐条对齐上游 `pipeArgs()`（`:328-359`）：28 条里的 27 条原名原说明搬过来
 * （`--list-file` / `--out-dir` 那类 kebab 写法由 vendored 解析器的 camelCase 归一化认，
 * `src/cli-support.ts:210-213`），唯一换掉的是那条 positional（文件头第 4 条）。
 * 本仓的解析器没有 `default` 这一档，于是缺席就是 `undefined`，交回内核自己那份
 * `defaultGifuInput`（文件头第 3 条）。
 */
function pipeArgs () {
  return {
    paths: { type: 'string', description: 'Archive/folder paths joined by semicolons; use "-" to take them from stdin.' },
    config: { type: 'string', description: 'Legacy gifu TOML path.' },
    listFile: { type: 'string', description: 'Text file containing one path per line.' },
    recursive: { type: 'boolean', description: 'Scan directories recursively.' },
    noRecursive: { type: 'boolean', description: 'Do not recurse into directories.' },
    format: { type: 'string', description: 'gif, webp, apng, webm, mp4, or auto.' },
    outDir: { type: 'string', description: 'Output directory.' },
    outMode: { type: 'string', description: 'same or separate.' },
    namePrefix: { type: 'string', description: 'Output name prefix.' },
    nameTemplate: { type: 'string', description: 'Output name template.' },
    duration: { type: 'string', description: 'Frame duration in milliseconds.' },
    loop: { type: 'string', description: 'Loop count; 0 is infinite.' },
    quality: { type: 'string', description: 'WebP quality, 1-100.' },
    webpMethod: { type: 'string', description: 'WebP effort, 0-6.' },
    ffmpegThreads: { type: 'string', description: 'FFmpeg threads; 0 is automatic.' },
    webmCrf: { type: 'string', description: 'WebM CRF, 0-63.' },
    webmCpuUsed: { type: 'string', description: 'WebM cpu-used, 0-8.' },
    mp4Preset: { type: 'string', description: 'MP4 NVENC preset p1-p7.' },
    mp4Cq: { type: 'string', description: 'MP4 CQ, 0-63.' },
    maxWorkers: { type: 'string', description: 'Parallel archives; 0 is automatic.' },
    extractSingle: { type: 'boolean', description: 'Extract single-image archives.' },
    noExtractSingle: { type: 'boolean', description: 'Skip single-image archives.' },
    overwrite: { type: 'boolean', description: 'Overwrite existing outputs.' },
    dryRun: { type: 'boolean', description: 'Preview without writing files.' },
    live: { type: 'boolean', description: 'Allow make to write output files.' },
    recordRun: { type: 'boolean', description: 'Append a JSONL run record.' },
    databasePath: { type: 'string', description: 'JSONL run record path.' },
    json: { type: 'boolean', description: 'Print only JSON to stdout.' },
  } as const
}

/**
 * 三条动作腿：把 `--paths` 按上游那一条判据解出来（`-` 或"没给且 stdin 是管道"就读 stdin，
 * 上游 `:244-245`），然后**拒绝**。为什么要先解路径：拒绝的那份 JSON 里要回显使用者给的东西，
 * 让他一眼看清"我给的输入被读到了，缺的是那条缝"，而不是一句和输入无关的话。
 * 解路径用的是内核自己的 `parsePathList`（纯函数），不是终端面另写的一份拆法。
 */
async function runAction (action: GifuAction, args: CliArgs, host: CliHost): Promise<void> {
  // 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  const json = args.json === true
  const paths = await resolvePaths(args, host)
  // 运行时那半边（`createGifuUnwiredRuntime`）里 `listArchiveImages` / `convertArchive`
  // 抛的是同一句；这里先把话说完，是为了不把拒绝咽成内核里一条 `status:"failed"` 的计划行，
  // 那会把"这条缝不在"显示成"某个归档读坏了"。
  if (json) {
    writeJson(host, { node: 'gifu', action, paths, executed: false, refused: GIFU_PROCESS_SEAM_REFUSAL })
  } else {
    writeError(host, `${CLI_NAME} ${action} 未接：${GIFU_PROCESS_SEAM_REFUSAL}`)
  }
  process.exitCode = 2
}

/** 上游 `:244-245` 那条：`-` 与"没给且 stdin 是管道"都算。 */
async function resolvePaths (args: CliArgs, host: CliHost): Promise<string[]> {
  const given = typeof args.paths === 'string' ? args.paths : undefined
  const wantsStdin = given === '-' || (given === undefined && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))
  if (wantsStdin) return parsePathList((await readStdinLines(host.stdin)).join('\n'))
  return parsePathList(given ?? '')
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包，并且**不做任何参数校验**（文件头第 2 条）。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} --help\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/gifu/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/gifu/src/cli.ts:178-191` + `interaction.ts`），本包不引它；'
      + '它跑起来的每一条归档也都还要 DSH 的 `ctx.subprocess`，独立 bin 不在宿主进程里'
  // 替代归属只点名本包真的注册了的东西：三条工具（`ctx.tools`）与工作台面板。
  // 本包 `inject` 里没有 `commands`，所以这里不印一条宿主里不存在的 `/gifu`（缺口 G7）。
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的 \`gifu_inspect\` / \`gifu_plan\` / \`gifu_make\`（\`ctx.tools\`）。`)
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
