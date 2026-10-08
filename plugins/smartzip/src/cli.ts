#!/usr/bin/env node
/**
 * SmartZip 的终端面：上游那份 `packages/nodes/smartzip/src/cli.ts`（259 行）里
 * **非交互的那一棵**（`pipe()`，`:169-225`）搬过来，形状是
 * "一条动作一个子命令 → 拼 `SmartZipInput` → 跑 `runSmartZip` → 打 `result.message`
 * 或整份 JSON → `success:false` 时退出码 1"（上游 `:218-224` 那几行逐条对应）。
 * 事件行在非 JSON 模式逐条打（上游 `:219`），不画进度条（上游 smartzip 这一棵本来就没有，
 * 那是 rawfilter 那一棵的东西）。
 *
 * 子命令名单**只从 `package.json#xaihi.node.actions` 生成**（与 `src/help.ts`、
 * `src/index.ts` 同一个真源）：上游那份文件里的 `status|cp|x|xc|o|a` 六个缩写**不搬**——
 * 缩写来自 `runInteractionCli` 的 pipe 面（`:181-194`），本仓的面上一个动作只有一个名字，
 * 就是清单里那个 id。少一条静态边就少一处"帮助里印得出来、跑起来不认识"。
 *
 * ## 四处偏离，都写在能看见的地方
 *
 * 1. **`@xiranite/config` 那一层不读**（上游 `:28-31` 的 `loadNodeConfigWithHints` /
 *    `updateNodeConfigFile`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值（`ini_path` / `passwords` / `code_page` / `database_path` / `record_run` /
 *    `dry_run`）在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ 这里的 defaults
 *    是空的，缺省落回内核自己那一套。**连带后果**：内核的 `dryRun` 默认是 **false**
 *    （`core.ts:233`），所以 `smartzip extract` 不带 `--dryRun` 走的是"真执行"那一条——
 *    而那条在本 bin 里必然被第 2 条拦下，不会动到任何文件。
 * 2. **7-Zip 起不来：这一面只出计划**。`ctx.subprocess` 活在宿主进程里（缺口 G1/G6 那一族：
 *    DSH 的服务缝在插件进程内，能装进 `$PATH` 的那一面在外面），所以 bin 里构造的运行时
 *    **没有** `runCommand` ⇒ `find7z` / `execute` / `inspectCodePages` 那几处一碰就抛
 *    `NO_SUBPROCESS_MESSAGE`（`src/platform.ts`），内核把它折成 `success:false` 的一句、
 *    这里折成退出码 1。**不折成"7-Zip 没装"**：那会把"够不到缝"报成使用者的机器上没装 7z，
 *    是伪造读数。于是这一面上今天真跑得通的是：`status`（只读 INI 与内核默认表）、
 *    四条执行动作的 `--dryRun` 计划（`core.ts:270` 那个三元在 dryRun 时跳过 `find7z`，
 *    计划行由 `buildSmartZipCommand` 出）、以及 `extract --dryRun` 的目录展开
 *    （`resolveInputPaths` 是 `node:fs` 的真枚举）。`inspect_codepage` 需要 7-Zip 列文件树，
 *    在这一面是**可见地拒**。
 * 3. **位置参数与 `--code-page auto` 那种写法不搬**：vendored 支撑（`src/cli-support.ts`）
 *    的 `parseArgs` 只认 `--flag value` / `--flag=value` / 布尔取反，**没有位置参数**，
 *    也不认 `auto` 这种哨兵值（缺口 **G12**，bitv / classf 已撞过同一条）。所以路径走
 *    `--pathsText`（换行分隔，`-` 表示从 stdin 逐行读，与上游 `:204-207` 那句兜底同源），
 *    码页走 `--codePage <整数>`，`auto` 写作 `0`（内核 `core.ts:230` 那句判据本来就把
 *    非正整数折成 0，语义不变）。
 * 4. **危险动作的批准缝在这一面不存在**（缺口 **G6**）：宿主侧 `danger.all` 经 `defineNode`
 *    变成 DSH 的 `ask`，bin 里没有 `ctx.approval` 可展示 ⇒ 这里不自己造确认框，也不做
 *    `--force` 那种形状；拦得住第 1 条的那只手是第 2 条（没有 `ctx.subprocess` 就动不了文件）。
 *
 * `ui` / `gd` / `guided` 三条交互腿**留在面上并响亮拒绝**：全屏 TUI 在 OpenTUI 上、
 * 引导流在 `@clack/prompts` 上（上游 `interaction.ts` 那份字段表），都不随本包发布。
 * 三条腿都不带任何参数校验——未接的功能先报"缺参"会把"这块没搬"说成"你参数没给对"。
 *
 * @module xaihi-smartzip/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
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
import { runInteractionCli } from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import type { SmartZipAction, SmartZipInput, SmartZipResult } from './core.ts'
import { runSmartZip } from './core.ts'
import { createNodeSmartZipRuntime } from './platform.ts'
import { createSmartZipInteractionSchema, type SmartZipInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('smartzip')

/** 内核认得的六个动作（`core.ts:86` 那份 `SmartZipAction`）；清单漂出这个名单就抛。 */
const KERNEL_ACTIONS: readonly SmartZipAction[] = ['status', 'inspect_codepage', 'extract', 'extract_codepage', 'open', 'archive']

/** 一条子命令需要的两个字段：内核认得的动作 id 与清单里那句英文描述。 */
interface CliAction {
  id: SmartZipAction
  labelEn: string
}

/**
 * 动作名单的唯一真源：`package.json#xaihi.node.actions`。
 * 读它而不是抄一份，是因为抄的那一份会漂——`runHostedAction` 里那条守卫就是拿它对账的。
 * 子命令名与描述都来自这一份，不另抄文案。
 */
function declaredActions (): CliAction[] {
  const pkg = createRequire(import.meta.url)('../package.json') as {
    xaihi?: { node?: { actions?: Array<{ id?: unknown; label?: { en?: unknown } }> } }
  }
  const actions = pkg.xaihi?.node?.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error(`${CLI_NAME}: package.json#xaihi.node.actions 缺失或为空，终端面无从生成子命令`)
  }
  return actions.map((entry, index): CliAction => {
    const id = entry?.id
    if (typeof id !== 'string' || !(KERNEL_ACTIONS as readonly string[]).includes(id)) {
      throw new Error(`${CLI_NAME}: 清单第 ${index} 条动作 ${String(id)} 不在内核的 SmartZipAction 里`)
    }
    const labelEn = entry?.label?.en
    // 上面那条 membership 检查已经把 `id` 收在 KERNEL_ACTIONS 那六个字面量里了，
    // 这里只是把这件事告诉类型系统（TS 不从 `readonly string[]`.includes 收窄）。
    return { id: id as SmartZipAction, labelEn: typeof labelEn === 'string' && labelEn !== '' ? labelEn : id }
  })
}

const NODE_ACTIONS = declaredActions()

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'TypeScript archive workflows with automatic 7-Zip discovery.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

function createSmartZipUiDefinition (
  defaults: Partial<SmartZipInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<SmartZipInput, SmartZipResult> {
  return {
    schema: createSmartZipInteractionSchema(defaults, language),
    run: (input, onEvent) => runSmartZip(input, createNodeSmartZipRuntime(), onEvent),
  }
}

/** 派发形状接入 @hibernalglow/xaihi-cli-runtime 的 runInteractionCli。 */
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
    createDefinition: (defaults, language) => createSmartZipUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).SmartZipTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  const subCommands: Record<string, CliCommandSpec> = {}
  for (const { id: action, labelEn } of NODE_ACTIONS) {
    subCommands[action] = defineCommand({
      meta: { name: action, description: labelEn },
      args: actionArgs(),
      async run ({ args }) {
        await runHostedAction(action, args, host)
      },
    })
  }
  // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
  for (const leg of UNWIRED_INTERACTIVE_LEGS) {
    subCommands[leg] = defineCommand({
      meta: {
        name: leg,
        description: leg === 'ui'
          ? 'Open the full terminal UI using OpenTUI.（未接）'
          : leg === 'gd'
            ? 'Open the compact guided terminal workflow.（未接）'
            : 'Compatibility alias for gd.（未接）',
      },
      async run () {
        await runProgram([leg], host)
      },
    })
  }
  return defineCommand({
    meta: { name: CLI_NAME, description: 'TypeScript archive workflows with automatic 7-Zip discovery.' },
    subCommands,
  })
}

/**
 * flag 名单就是清单里除 `action` 之外的那六个字段（`fields[].id`，定义加字段时这里与
 * `package.json` 一起动），码页与 `--dry-run` 的名字沿用上游 `cli.ts:177` 那条 usage。
 */
function actionArgs () {
  return {
    pathsText: { type: 'string', description: 'Archive or directory paths, one per line. Use "-" to append paths read from stdin.' },
    iniPath: { type: 'string', description: 'Legacy SmartZip .ini to load configuration from.' },
    codePage: { type: 'string', description: 'Filename codepage for extract_codepage; 0 = let the kernel recommend one (upstream "auto").' },
    databasePath: { type: 'string', description: 'JSONL run-record path. Empty = the kernel derives .xiranite/smartzip-runs.jsonl.' },
    recordRun: { type: 'boolean', description: 'Append a redacted run record. Kernel default: on when databasePath is set.' },
    dryRun: { type: 'boolean', description: 'Plan only. Kernel default is false (execute); --no-dryRun is therefore the same as omitting it here.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 一条动作的执行：拼 `SmartZipInput` → 跑内核 → 按上游 `:222-224` 打 JSON 或消息。
 * 运行时**不带 `runCommand`**（文件头第 2 条），所以任何真要碰 7-Zip 的动作会以
 * `NO_SUBPROCESS_MESSAGE` 结束，退出码 1，而不是被演成成功。
 */
async function runHostedAction (action: SmartZipAction, args: CliArgs, host: CliHost): Promise<void> {
  if (!NODE_ACTIONS.some((entry) => entry.id === action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  const json = args.json === true
  const input = await inputFromCli(action, args, host)
  const result: SmartZipResult = await runSmartZip(input, createNodeSmartZipRuntime(), (event) => {
    if (!json && event.message !== '') writeLine(host, event.message)
  })
  if (json) writeJson(host, result)
  else writeLine(host, result.message)
  if (!result.success) process.exitCode = 1
}

/**
 * flag → 内核入参。`recordRun` / `dryRun` 只在**真的写过**那个 flag 时才下发：
 * 内核自己的默认是 `recordRun = Boolean(databasePath)`（`core.ts:232`）与
 * `dryRun = false`（`core.ts:233`），把没写过的情形折成 `false` 会抹掉前一条。
 */
async function inputFromCli (action: SmartZipAction, args: CliArgs, host: CliHost): Promise<SmartZipInput> {
  const input: SmartZipInput = { action }
  const paths = await pathsFrom(args.pathsText, host)
  if (paths.length > 0) input.paths = paths
  if (typeof args.iniPath === 'string' && args.iniPath.trim() !== '') input.iniPath = args.iniPath.trim()
  if (typeof args.databasePath === 'string' && args.databasePath.trim() !== '') input.databasePath = args.databasePath.trim()
  const codePage = codePageOf(args.codePage)
  if (codePage !== undefined) input.codePage = codePage
  if (typeof args.recordRun === 'boolean') input.recordRun = args.recordRun
  if (typeof args.dryRun === 'boolean') input.dryRun = args.dryRun
  return input
}

/** 上游 `:203-207`：`-` 表示把 stdin 的各行接上来（bin 没有位置参数，见文件头第 3 条）。 */
async function pathsFrom (value: unknown, host: CliHost): Promise<string[]> {
  const lines = String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
  if (!lines.includes('-')) return lines
  const rest = lines.filter((line) => line !== '-')
  // 那条 `Symbol.asyncIterator` 守卫与 rawfilter / linedup / samea 同一写法：没有它，
  // 非异步可迭代的 stdin（测试宿主、被重定向的怪 stdin）会在 `for await` 上直接抛 TypeError，
  // 把"你没给路径"说成"内核崩了"。
  if (!(Symbol.asyncIterator in Object(host.stdin))) return rest
  const fromStdin = (await readStdinLines(host.stdin)).map((line) => line.trim()).filter((line) => line !== '')
  return [...rest, ...fromStdin]
}

/** `--codePage` 只收正整数；`auto` 与垃圾值都折成"不给"，让内核自己那判据去折 0（`core.ts:230`）。 */
function codePageOf (value: unknown): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(String(value), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包，并且**不做任何参数校验**——
 * 未接的功能先报"缺参"会把"这块没搬"说成"你参数没给对"。
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
    // 旧品牌只写在注释与文件头的"出处位"：这句是使用者读到的文案，
    // 点名"上游 terminal 运行时那一层"就够了（判据见 docs/adr/0010-brand-is-xaihi.md）。
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/smartzip/src/Tui.tsx` + 上游 terminal 运行时那一层），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/smartzip/src/cli.ts:82-96` + `interaction.ts`），本包不引它'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与模型面的 \`smartzip_*\` 工具（DSH 的 tools 服务）。`)
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
