#!/usr/bin/env node
/**
 * BitV 的终端面：子命令名与 flag 名单从基线 `packages/nodes/bitv/src/cli.ts`（415 行）搬，
 * **执行那一律拒绝**。保住的东西：四条动作子命令 `status` / `analyze` / `classify` / `report`
 * （上游 `:351-353` 的 `parseAction` 就是这四条，别名一个不加）、三条未接的交互腿
 * `ui` / `gd` / `guided`（`guided` 是 `gd` 的兼容别名，上游 `:364` 那句原话）、flag 名单
 * `--path` / `--report` / `--target` / `--output` / `--step` / `--levels` /
 * `--recursive` / `--no-recursive` / `--copy` / `--move` / `--dry-run` / `--apply` /
 * `--json`（上游 `:243-297` 的 `parsePipeOptions`），以及 `--help` 与退出码 2 的契约
 * （由 vendored 支撑 `src/cli-support.ts` 定下）。
 *
 * **为什么四条动作全都拒绝**：`findFfprobe` 与 `runFfprobeJson` 这两格要的是 DSH 的
 * `ctx.subprocess`（`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬基础件」那一行），
 * 而独立 bin 不在宿主进程里，拿不到那条缝 ⇒ `status` 查不到探针、`analyze` / `classify`
 * 一条视频都探不了。`report` 是唯一一条"预演时其实只读 JSON"的腿，它照样拒绝，两个理由：
 * 1. 同一个子命令上挂着 `--apply`，那一步要 `link` + `unlink` 动文件，而 bin 里没有批准缝
 *    （缺口 G6：`danger.all` 变成的 `ask` 只活在宿主侧）——一条腿半通半不通比整条不通更难读；
 * 2. 四条腿共用一份拒绝文案（真源 `src/platform.ts` 的 `BITV_PROCESS_SEAM_REFUSAL`），
 *    面上一致，使用者不用逐条猜哪条今天能跑。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，退出码 2），
 *    上游的 `xbitv analyze D:/videos` 在这里是 `xbitv analyze --path D:/videos`
 *    （上游 `:306` 本来也收 `--path`）。与 `crashu` / `timeu` 是同一处理由。
 * 2. **重复 flag 后者赢**：上游 `--path` 可以写多次、每条都进队列（`:287` 的
 *    `result.paths.push(value)`），vendored 支撑把同名 flag 折成一个值 ⇒ 这里只拿到最后一条。
 *    要多条路径就写多行：内核 `parseBitvPaths` 本来就会按换行切（`core.ts:166-178`）。
 * 3. **短 flag 不认**：`-p` / `-t` / `-o` / `-s` / `-l` / `-R`（上游 `:308-315`）在这条支撑上
 *    一律 `Unknown argument`，只有长拼法能用。
 * 4. **`--copy` 与 `--move` 同时给时按 `move`**：上游是按出现顺序后者赢，而支撑只给一张布尔表，
 *    这里取更不安全的那一侧先亮出来。反正今天这条腿整条拒绝（见上面那段）。
 *
 * 上游 `resolveBitvDefaults`（`:332-356`，`@xiranite/config` 那份
 * `[nodes.bitv]`：`paths` / `report_path` / `target_path` / `output_path` / `recursive` /
 * `bitrate_step_mbps` / `max_levels` / `transfer_mode` / `dry_run`）**整块不读**：
 * 按 `docs/adr/0013-config-goes-through-dsh-settings.md` 那条 toml 通路不搬，同一批值在
 * Xaihi 是 `src/index.ts` 的 `Config`，而独立 bin 读不到 settings 面（缺口 G2）。
 * 于是这里只有"命令行给的 > 内核 `BITV_DEFAULTS`"两级，`--apply` 那一跳照上游
 * （`:214` 的 `parsed.apply ? false : …`）：`--apply` 是唯一能把预演关掉的东西。
 *
 * `ui` / `gd` / `guided` 三条交互腿未接：全屏 TUI 在 OpenTUI 上、引导流在 @clack 上，
 * 都不随本包发布（判据见 `src/cli-support.ts` 顶部）。三条腿留在 `--help` 里响亮拒绝，
 * 比静默消失好读——面板上少了才叫缺能力，写着"未接"只是还没搬。
 *
 * @module xaihi-bitv/cli
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
import { BITV_PROCESS_SEAM_REFUSAL } from './platform.ts'

const CLI_NAME = nodeCliName('bitv')

/** 动作名单的唯一真源是 `package.json#xaihi.node`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS = ['status', 'analyze', 'classify', 'report'] as const

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Native ffprobe video bitrate analysis and classification.',
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
      + `而本节点四条动作要跑的 ffprobe 一律走 DSH 的 \`ctx.subprocess\`（\`src/platform.ts\`），独立 bin 拿不到那条缝。脚本化请用 \`${CLI_NAME} --help\` 看这一面今天能做什么。`,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Native ffprobe video bitrate analysis and classification.' },
    subCommands: {
      status: defineCommand({
        meta: { name: 'status', description: 'Environment status（检查 ffprobe 是否可用）' },
        args: statusArgs(),
        async run ({ args }) {
          await runSeamBlockedAction('status', args, host)
        },
      }),
      analyze: defineCommand({
        meta: { name: 'analyze', description: 'Analyze bitrate（扫描视频并按码率分档）' },
        args: analyzeArgs(),
        async run ({ args }) {
          await runSeamBlockedAction('analyze', args, host)
        },
      }),
      classify: defineCommand({
        meta: { name: 'classify', description: 'Analyze and classify（分析后按档位规划目录）' },
        args: classifyArgs(),
        async run ({ args }) {
          await runSeamBlockedAction('classify', args, host)
        },
      }),
      report: defineCommand({
        meta: { name: 'report', description: 'Classify from report（按已有 JSON 报告分类）' },
        args: reportArgs(),
        async run ({ args }) {
          await runSeamBlockedAction('report', args, host)
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
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** `--json` 是四条腿共用的那一格（上游 `:250`）。 */
function jsonArg () {
  return { json: { type: 'boolean', description: 'Print JSON result.' } } as const
}

/** 上游 `:262-272`：`--recursive` / `--no-recursive` 是一对布尔，不是一个可带值的 flag。 */
function recursiveArg () {
  return {
    recursive: { type: 'boolean', description: 'Scan subdirectories (--no-recursive turns it off).' },
  } as const
}

/** 上游 `:274-282` 的四个模式 flag：`--copy` / `--move` / `--dry-run` / `--apply`。 */
function transferArgs () {
  return {
    copy: { type: 'boolean', description: 'Transfer mode: copy (default).' },
    move: { type: 'boolean', description: 'Transfer mode: move (hard link + unlink, cross-device falls back).' },
    dryRun: { type: 'boolean', description: 'Plan destinations only. This is the default.' },
    apply: { type: 'boolean', description: 'Turn the preview off. Needs the subprocess seam, so it is refused here.' },
  } as const
}

/** 上游 `:308-315` 的数值两格：`--step`（Mbps 步长）与 `--levels`（档位数量）。 */
function bitrateArgs () {
  return {
    step: { type: 'string', description: 'Bitrate step in Mbps (positive number).' },
    levels: { type: 'string', description: 'Number of bitrate levels (1..1000).' },
  } as const
}

function statusArgs () {
  return { ...jsonArg() }
}

function analyzeArgs () {
  return {
    path: { type: 'string', description: 'Video file or directory. Repeatable upstream; here the last one wins — put several paths on separate lines.' },
    output: { type: 'string', description: 'Write the analysis report to this path (never overwrites).' },
    ...bitrateArgs(),
    ...recursiveArg(),
    ...jsonArg(),
  } as const
}

function classifyArgs () {
  return {
    path: { type: 'string', description: 'Video file or directory.' },
    target: { type: 'string', description: 'Target directory for the bitrate folders.' },
    ...bitrateArgs(),
    ...recursiveArg(),
    ...transferArgs(),
    ...jsonArg(),
  } as const
}

function reportArgs () {
  return {
    report: { type: 'string', description: 'Path to a saved JSON analysis report.' },
    target: { type: 'string', description: 'Target directory; upstream falls back to the directory holding the report.' },
    ...bitrateArgs(),
    ...transferArgs(),
    ...jsonArg(),
  } as const
}

/**
 * 四条动作共用的出口：**先报缺的那条缝，再谈参数**。
 * 上游 `cli.ts:216-238` 在这里会把 `runBitv` 跑起来（探针走 `createNodeBitvRuntime`），
 * 而那一格要的是 `ctx.subprocess`；bin 够不到，所以这一腿今天只能整条拒绝。
 * 不在拒绝之前先报"缺 `--path`"：未接的能力先报参数错，会把"这条缝拿不到"说成
 * "你参数没给对"（同一类误导在 `crashu` / `sleept` 上刚修掉过）。
 * `--json` 的载荷与 stderr 用同一句话，不分叉——文案真源在 `src/platform.ts`。
 */
async function runSeamBlockedAction (action: string, args: CliArgs, host: CliHost): Promise<void> {
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  if (args.json === true) {
    writeJson(host, {
      node: 'bitv',
      action,
      executed: false,
      refused: BITV_PROCESS_SEAM_REFUSAL,
      // 参数怎么拼的一起回读，省得使用者以为"改了写法就能跑"。
      dryRun: resolveDryRun(args),
      transferMode: resolveTransferMode(args),
    })
  } else {
    writeError(host, `${CLI_NAME} ${action} 未接：${BITV_PROCESS_SEAM_REFUSAL}`)
  }
  process.exitCode = 2
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包，并且**不做任何参数校验**
 * （见文件头第 2 条）。
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
  // 出处（`<Xiranite>` tag `noxide` 的 `packages/nodes/bitv/src/Tui.tsx` 与
  // `src/interaction.ts`，走的是 `@xiranite/cli-runtime` 的 terminal 与 guided 两条腿）写在这里，
  // 不进印给使用者看的那句话：打印出来的文案属于品牌面（ADR-0010）。
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（基线那份 `Tui.tsx` + 上游终端运行时的 terminal 腿），本包不引它'
    : '引导流的字段表在 @clack/prompts 上（基线那份 `interaction.ts`），本包不引它'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧的四个工具 \`bitv_status\` / \`bitv_analyze\` / \`bitv_classify\` / \`bitv_report\`。`)
  process.exitCode = 2
}

/**
 * 上游 `:214` 的那一跳：`--apply` 是**唯一**能关掉预演的东西
 * （`dryRun: parsed.apply ? false : parsed.dryRun ?? defaults.dryRun ?? BITV_DEFAULTS.dryRun`）。
 * 上游的 `defaults.*` 那一节读的是 toml（缺口 G2），本包没有那条通路，所以只剩两级：
 * flag 给的 > 内核的 `dryRun` 默认（预演）。今天这两个函数只被回读进 `--json` 的载荷，
 * 没有任何一条路会把它们交给内核。
 */
function resolveDryRun (args: CliArgs): boolean {
  if (args.apply === true) return false
  return args.dryRun === undefined ? true : args.dryRun === true
}

/** 上游 `:213` 的 `parsed.transferMode ?? defaults.transferMode ?? BITV_DEFAULTS.transferMode`。 */
function resolveTransferMode (args: CliArgs): 'copy' | 'move' {
  if (args.move === true) return 'move'
  if (args.copy === true) return 'copy'
  return 'copy'
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
