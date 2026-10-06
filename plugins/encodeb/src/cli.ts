#!/usr/bin/env node
/**
 * encodeb 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/encodeb/src/cli.ts`
 * （624 行）搬来。保留的东西：子命令名 `find` / `preview` / `recover`、全部 8 个 flag 名
 * （`--paths` / `--preset` / `--srcEncoding` / `--dstEncoding` / `--transform` /
 * `--strategy` / `--limit` / `--json`）、`--paths -` 与"没给 `--paths` 而 stdin 是管道"
 * 那两条 stdin 队列（上游 `:174`：整份读进来用 `;` 拼回去，随后 `inputFromArgs` 再按 `;` 切）、
 * 预设表的优先级链（上游 `:216-228`：显式 flag → 配置 → `ENCODEB_PRESETS[preset]` → 字面默认
 * `cp437` / `cp936` / `recode` / `replace` / `200`）、非 JSON 时的输出形状
 * （结论一行 + find 打 `matches` 逐行、preview 打 `src -> dst` 逐行，`:250-257`）、
 * 以及 `PREVIEW_LIMIT = 40`（`:40`，只在上游 guided 腿的面板里用到，这里连同它一起搬）。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，
 *    退出码 2）。上游 `writeUsage` 里那句 `encodeb find|preview|recover <paths...>`
 *    因此在本 bin 上是 `--paths`。与同批的 `crashu` / `timeu` 同一处理由。
 * 2. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`runTerminalUi` + `./Tui.tsx`）与
 *    `@clack/prompts` 的 `runGuidedInteraction` + 本包 `interaction.ts` 那张字段表
 *    （`promptRich` / `selectRich` / `confirmRich` / `promptPathLines` 一整套）。三条腿
 *    **都不带任何参数校验**——未接的功能先报 "Missing required argument" 会把"这块内核没搬"
 *    说成"你参数没给对"（同类误导在 sleept 上刚修掉过）。`guided` 那条腿还顺带着上游的
 *    `readClipboardText()`（`platform.ts:32-71`，走 `node:child_process`）与
 *    `verifyPaths()`：缺口沿用台账 **G5**。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.encodeb]` 的
 *    `preset` / `src_encoding` / `dst_encoding` / `transform` / `strategy` / `limit`
 *    （`resolveEncodebDefaults`，`:74-93`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`
 *    那条通路整块不搬，同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到
 *    （台账 **G2**）⇒ 这里直接用上游那条链的配置缺席结果：`defaults` 全空，
 *    一切以命令行给的为准，缺的落回预设表与内核默认。
 * 4. **`recode` / `auto` 两个 transform 在本包跑不了**：上游那套转码坐在 `iconv-lite` +
 *    `chardet` 上，两颗都不在本仓依赖闭包里（详见 `src/platform.ts` 文件头）。于是
 *    `preview` / `recover` 在**动第一条文件之前**抛 `CODEC_UNAVAILABLE`，bin 收成一个
 *    stderr 一句话 + 退出码 1；`find` 与 `--transform decode-hash-u` /
 *    `normalize-middle-dot` 那两条腿**真能跑**。这条是本包当前最大的可见退化。
 * 5. **失败必须改退出码**：上游 `runAction`（`:230-258`）在 scripted 腿上
 *    **不设** `process.exitCode`——`--json` 拿到 `success:false` 也是退出 0，
 *    而它自己的 guided 腿是设的（`:313` `if (!ok) process.exitCode = 1`）。
 *    这里按 guided 腿那条补平（含第 4 条那句拒绝），因为 `encodeb recover && deploy`
 *    这种写法在退出码说谎时是安全的假象。同批的 `crashu` / `formatv` / `migratef`
 *    上游腿本来就是退出 1，所以这条只是把 encodeb 拉回一致的面上。
 *
 * 危险动作在 bin 里照上游执行（`recover` 的真改名）：宿主面那半边由 `danger.actionIn`
 * 变成 DSH 的 `ask`，审批与审计在宿主；bin 不在宿主进程里，拿不到那条缝。
 * 这与同批的 `crashu` / `formatv` 是同一个取舍（ADR-0003 决定 1），缺口 **G6**。
 *
 * @module xaihi-encodeb/cli
 */

import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinLines,
  renderProgressBar,
  rich,
  runNodeCliFace,
  runPipeProgram,
  truncateVisible,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { EncodebAction, EncodebData, EncodebInput, EncodebStrategy, EncodebTransform } from './core.ts'
import { ENCODEB_PRESETS, parseEncodebPaths, runEncodeb } from './core.ts'
import { createNodeEncodebRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('encodeb')

/** 上游 `cli.ts:40` 的 `PREVIEW_LIMIT`：guided 面板的清单上限。 */
const PREVIEW_LIMIT = 40

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Preview and recover garbled filenames by re-decoding path components.',
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
      + `脚本化请用 \`${CLI_NAME} find --paths <目录> --json\`。`,
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
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} find --paths <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/encodeb/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/encodeb/src/interaction.ts`，101 行），本包不引它'
  writeError(host, `\`${CLI_NAME} ${name}\` 未接：${what}。替代归属是工作台面板与宿主侧的工具面（\`encodeb_find\` / \`encodeb_preview\` / \`encodeb_recover\`）。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: {
      name: CLI_NAME,
      description: 'Filename encoding recovery with a Clack guided mode.',
    },
    subCommands: {
      find: defineCommand({
        meta: { name: 'find', description: 'Find suspicious garbled filenames.' },
        args: encodebArgs(),
        async run ({ args }) {
          await runSubcommand('find', args, host)
        },
      }),
      preview: defineCommand({
        meta: { name: 'preview', description: 'Preview filename re-encoding mappings.' },
        args: encodebArgs(),
        async run ({ args }) {
          await runSubcommand('preview', args, host)
        },
      }),
      recover: defineCommand({
        meta: { name: 'recover', description: 'Apply filename recovery.' },
        args: encodebArgs(),
        async run ({ args }) {
          await runSubcommand('recover', args, host)
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

/** flag 名逐个对齐上游 `encodebArgs()`（`:203-214`），一个都不新增、一个都不改名。 */
function encodebArgs () {
  return {
    paths: { type: 'string', description: 'Paths separated by semicolon or new lines.' },
    preset: { type: 'string', description: 'Built-in repair preset or custom.' },
    srcEncoding: { type: 'string', description: 'Source encoding, e.g. cp437.' },
    dstEncoding: { type: 'string', description: 'Destination encoding, e.g. cp936.' },
    transform: { type: 'string', description: 'recode, decode-hash-u, or normalize-middle-dot.' },
    strategy: { type: 'string', description: 'replace or copy.' },
    limit: { type: 'string', description: 'Maximum preview/find results.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `resolveEncodebDefaults`（`:74-93`）在读不到配置文件时返回 `{}`，
 * 于是 `:216-228` 那条链的配置那一格永远是空的（台账 **G2**）。这里把那份缺席写成常量，
 * 而不是假装有一个 `EncodebDefaults` 实例。
 */
interface EncodebCliOptions {
  paths?: string
  preset?: string
  srcEncoding?: string
  dstEncoding?: string
  transform?: string
  strategy?: string
  limit?: string
  json?: boolean
}

/**
 * 上游 `:174` 那条 stdin 队列：`--paths` 给 `-`（或没给而 stdin 是管道）就整份读进来
 * 用 `;` 拼回去——随后 `inputFromArgs` 按 `;` 切（上游 `:221` 的 `.split(";")`）。
 */
async function resolveStdinPaths (args: CliArgs, host: CliHost): Promise<{ paths?: string }> {
  const piped = hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)
  const wantsPaths = args.paths === '-' || (args.paths === undefined && piped)
  if (!wantsPaths) return {}
  const queue = await readStdinLines(host.stdin)
  return { paths: queue.join(';') }
}

/**
 * 上游 `inputFromArgs`（`:216-228`）逐条：预设表只有一份真源（内核导出的
 * `ENCODEB_PRESETS`，`core.ts:52-62`，里面**没有** `custom`），链尾那两个
 * `?? "cp437"` / `?? "cp936"` / `?? "recode"` 是上游自己写在这层的字面默认，
 * 原样保留（它们与内核默认同值，这里不"顺手"删掉上游的一格）。
 */
function inputFromArgs (args: CliArgs): EncodebInput {
  const options = args as EncodebCliOptions
  const presetId = options.preset ?? 'auto'
  const preset = ENCODEB_PRESETS[presetId as keyof typeof ENCODEB_PRESETS]
  return {
    paths: parseEncodebPaths((options.paths ?? '').split(';')),
    ...(typeof options.srcEncoding === 'string' && options.srcEncoding !== ''
      ? { srcEncoding: options.srcEncoding }
      : { srcEncoding: preset?.srcEncoding ?? 'cp437' }),
    ...(typeof options.dstEncoding === 'string' && options.dstEncoding !== ''
      ? { dstEncoding: options.dstEncoding }
      : { dstEncoding: preset?.dstEncoding ?? 'cp936' }),
    // 顺序照上游 `:224`：预设先落，显式 `--transform` 覆盖它（写反了就是"flag 说了不算"）。
    ...(preset === undefined ? {} : { transform: preset.transform }),
    ...(isTransform(options.transform) ? { transform: options.transform as EncodebTransform } : {}),
    strategy: options.strategy === 'copy' ? 'copy' as EncodebStrategy : 'replace' as EncodebStrategy,
    limit: Number(options.limit ?? 200),
  }
}

/** 上游 `:224` 那串判据：只有内核词表里的四个值才算声明了 transform。 */
function isTransform (value: string | undefined): value is EncodebTransform {
  return value === 'auto' || value === 'recode' || value === 'decode-hash-u' || value === 'normalize-middle-dot'
}

/** 上游 `:169-192` 三条子命令体：都走同一个 `runAction`，差别只有 `action`。 */
async function runSubcommand (action: EncodebAction, args: CliArgs, host: CliHost): Promise<void> {
  const queues = await resolveStdinPaths(args, host)
  const merged: CliArgs = { ...args, ...queues }
  const json = args.json === true
  const input: EncodebInput & { action: EncodebAction } = { ...inputFromArgs(merged), action }
  let progressActive = false
  let result
  try {
    result = await runEncodeb(input, createNodeEncodebRuntime(), (event) => {
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
  } catch (error) {
    // 文件头第 4 条那句 codec 拒绝从这里落地：上游是让它一路抛到自执行闸门
    // （`cli.ts:617-624`），这里提前一步收成 stderr 一句话 + 退出码 1，
    // 好让 `--json` 的消费者看到的是同一句话而不是半份 JSON。
    endProgress(host, progressActive)
    writeError(host, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  endProgress(host, progressActive)

  if (json) {
    writeJson(host, result)
    // 文件头第 5 条：上游 scripted 腿不设退出码，这里按它自己 guided 腿（`:313`）补平。
    if (!result.success) process.exitCode = 1
    return
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeEncodebList(host, input.action, result.data)
  if (!result.success) process.exitCode = 1
}

/** 上游 `runAction` 非 JSON 那两条腿（`:251-257`）：find 打逐行 match，preview 打逐行 `src -> dst`。 */
function writeEncodebList (host: CliHost, action: EncodebAction | undefined, data: EncodebData | undefined): void {
  if (!data) return
  const columns = truncateColumns(host)
  if (action === 'find') {
    for (const match of data.matches.slice(0, PREVIEW_LIMIT)) writeLine(host, truncateVisible(match, columns))
    if (data.matches.length > PREVIEW_LIMIT) writeLine(host, rich(host, `... 还有 ${String(data.matches.length - PREVIEW_LIMIT)} 条`, 'grey'))
    return
  }
  if (action === 'preview') {
    for (const mapping of data.mappings.slice(0, PREVIEW_LIMIT)) {
      writeLine(host, `${truncateVisible(mapping.src, columns)} ${rich(host, '->', 'grey')} ${mapping.dst}`)
    }
    if (data.mappings.length > PREVIEW_LIMIT) writeLine(host, rich(host, `... 还有 ${String(data.mappings.length - PREVIEW_LIMIT)} 条`, 'grey'))
  }
}

/** 上游 `formatMapping` 用的宽度算式（`:580-586`）里那一格的列数来源。 */
function truncateColumns (host: CliHost): number {
  const width = host.stdout.columns ?? 80
  return Math.max(20, width - 20)
}

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

/**
 * 自执行闸门：与 linedup / crashu / formatv 同一写法（`.bin` 软链下 argv[1] 未必等于
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
