#!/usr/bin/env node
/**
 * sleept 的终端面。上游真源：`<Xiranite>` 当前 HEAD（`v1.0.0-587-g8e42280f`）的
 * `packages/nodes/sleept/src/cli.ts`（742 行）——本仓按它的接线形状移植，不是照抄全文：
 *
 * - **已接**：`ui` / `gd` / `guided` 走 `runInteractionCli`（`@hibernalglow/xaihi-cli-runtime/terminal`），
 *   `loadScreen` 动态装载 `./Tui.tsx` 的 `SleeptTui`，引导流读 `./interaction.ts` 的 schema，
 *   运行时由 `./runtime.ts` 的 `createNodeSleeptRuntime` 提供（上游 `platform.ts` 的运行时工厂）。
 * - **有意不搬**：上游 `resolveSleeptDefaults` 从 `@xiranite/config/node` 读配置文件——按
 *   ADR-0013 本仓没有这条通路（配置只走 DSH settings，独立 bin 读不到宿主半边），所以
 *   `loadContext` 交给 schema 自带默认值；上游 `createPreferenceController` 的偏好持久化
 *   同因不搬（终端偏好设置页在本 bin 里改动不落盘，这是 ADR-0011 意义上的可见退化）。
 * - **执行闸门**：TUI/引导流里的电源动作全部过 `dryrun` 闸（默认 true，关掉要使用者在
 *   交互面上亲手切，终端面那一下按键就是当场授权）；`--help` 与管道子命令没有交互闸，
 *   电源动作照旧拒绝（`refusalReason`）。
 *
 * 管道面（`status` / `block` / …）保持原状：本节点的执行一律经 DSH 的 `ctx.subprocess`
 * （`src/exec.ts`），独立 bin 只做规划（`planCommand` / `planAssertionProbe`，纯函数），
 * 随后拒绝执行。无模型的入口另有宿主侧 slash command（`src/index.ts`）。
 *
 * @module xaihi-sleept/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  runInteractionCli,
  type InteractionCliContext,
} from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import {
  createCliHost,
  defineCommand,
  nodeCliName,
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
  rich,
  terminalColumns,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import { planAssertionProbe, planCommand, type PlannedCommand, type SleeptAction } from './platform.ts'
import { runSleept, type NetTriggerMode, type SleeptInput, type SleeptResult } from './core.ts'
import { createSleeptInteractionSchema, type SleeptInteractionAction } from './interaction.ts'
import { createNodeSleeptRuntime } from './runtime.ts'

const CLI_NAME = nodeCliName('sleept')

/** 本节点定义里的动作（真源 `package.json#xaihi.node.actions`）。 */
const NODE_ACTIONS: readonly SleeptAction[] = ['status', 'block', 'unblock', 'sleep', 'displayOff', 'screensaver']

/**
 * 上游有、本仓内核还没搬的定时器子命令：留在面上，跑起来拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_TIMER_ACTIONS = ['countdown', 'at', 'netspeed', 'cpu'] as const

const SLEEPT_MAX_WAIT_HELP = 'Maximum wait in seconds; use 0 to monitor indefinitely.'

interface Planned {
  action: SleeptAction
  platform: NodeJS.Platform
  argv: string[][]
  longLived: boolean
}

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Sleep control: read power state, hold sleep off, or sleep now (macOS and Windows).',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/**
 * 独立 bin 读不到宿主 settings（ADR-0013），交互偏好与定时器默认值一律交给
 * schema 自带的那份（`createSleeptInteractionSchema` 只收 `!== undefined` 的键，
 * 空对象 = 全默认；`dryrun` 默认 true，见 schema）。
 */
interface SleeptDefaults {
  action?: SleeptInteractionAction
  powerMode?: import('./schedule.ts').PowerMode
  hours?: number
  minutes?: number
  seconds?: number
  targetDatetime?: string
  uploadThreshold?: number
  downloadThreshold?: number
  netDuration?: number
  netTriggerMode?: NetTriggerMode
  cpuThreshold?: number
  cpuDuration?: number
  dryrun?: boolean
  maxWaitSeconds?: number
}

async function loadSleeptContext (): Promise<InteractionCliContext<SleeptDefaults>> {
  return {
    preferences: { mode: 'ui', renderer: 'opentui', theme: 'inherit' },
    value: {},
  }
}

/** 上游 `createSleeptUiDefinition`（cli.ts 214-261 行）的同形移植；runtime 换本仓的 `./runtime.ts`。 */
function createSleeptUiDefinition (
  defaults: SleeptDefaults,
  language: TerminalLanguage,
): TerminalInteractionDefinition<SleeptInput, SleeptResult> {
  let cancelled = false
  let paused = false
  let resumePaused: (() => void) | undefined
  const schema = createSleeptInteractionSchema({ ...defaults }, language)
  return {
    schema,
    async run (input, onEvent) {
      cancelled = false
      paused = false
      const runtime = createNodeSleeptRuntime()
      return runSleept(input, {
        ...runtime,
        isCancelled: () => cancelled,
        waitWhilePaused: async () => {
          while (paused && !cancelled) await new Promise<void>((resolve) => { resumePaused = resolve })
          resumePaused = undefined
        },
      }, onEvent)
    },
    pause () { paused = true },
    resume () { paused = false; resumePaused?.() },
    cancel () {
      cancelled = true
      paused = false
      resumePaused?.()
    },
  }
}

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runInteractionCli({
    args,
    host,
    cliName: CLI_NAME,
    loadContext: () => loadSleeptContext(),
    createDefinition: (defaults, language) => createSleeptUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).SleeptTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Sleep control CLI: planned commands on the terminal face, execution on the host face.' },
    subCommands: {
      'ui': defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.' },
        args: {
          renderer: { type: 'string', description: 'opentui.' },
          lang: { type: 'string', description: 'en or zh.' },
          theme: { type: 'string', description: 'default, dracula, or high-contrast.' },
        },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      'gd': defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      'guided': defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.' },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
      status: defineCommand({
        meta: { name: 'status', description: 'Report idle sleep/hibernate timeouts and who holds sleep off.' },
        args: { json: { type: 'boolean', description: 'Print JSON result.' } },
        async run ({ args }) {
          await runNodeAction('status', {}, Boolean(args.json), host)
        },
      }),
      block: defineCommand({
        meta: { name: 'block', description: 'Prevent system sleep for the given duration.' },
        args: {
          minutes: { type: 'string', description: 'Hold duration in minutes (integer >= 1).' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run ({ args }) {
          await runNodeAction('block', { minutes: positiveMinutes(args) }, Boolean(args.json), host)
        },
      }),
      unblock: defineCommand({
        meta: { name: 'unblock', description: 'Terminate the holding child and give sleep back.' },
        args: { json: { type: 'boolean', description: 'Print JSON result.' } },
        async run ({ args }) {
          await runNodeAction('unblock', {}, Boolean(args.json), host)
        },
      }),
      sleep: defineCommand({
        meta: { name: 'sleep', description: 'Put the machine to sleep now (gated as dangerous; needs approval).' },
        args: {
          allowHibernate: { type: 'boolean', description: 'Hibernate instead of sleep (Windows only).' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run ({ args }) {
          const options = process.platform === 'win32'
            ? { suspendKind: (args.allowHibernate === true ? 'hibernate' : 'suspend') as 'hibernate' | 'suspend' }
            : {}
          await runNodeAction('sleep', options, Boolean(args.json), host)
        },
      }),
      displayOff: defineCommand({
        meta: { name: 'displayOff', description: 'Turn the display off without sleeping.' },
        args: { json: { type: 'boolean', description: 'Print JSON result.' } },
        async run ({ args }) {
          await runNodeAction('displayOff', {}, Boolean(args.json), host)
        },
      }),
      screensaver: defineCommand({
        meta: { name: 'screensaver', description: 'Start the screensaver immediately.' },
        args: { json: { type: 'boolean', description: 'Print JSON result.' } },
        async run ({ args }) {
          await runNodeAction('screensaver', {}, Boolean(args.json), host)
        },
      }),
      // ↓ 上游的四个定时器子命令：面在这儿，内核不在这儿。
      countdown: defineCommand({
        meta: { name: 'countdown', description: 'Run a countdown timer.（未接：本 bin 没有喂内核的 SleeptRuntime）' },
        args: timerArgs(),
        async run () {
          await runUnwiredTimer('countdown', host)
        },
      }),
      at: defineCommand({
        meta: { name: 'at', description: 'Run at a specific datetime.（未接：本 bin 没有喂内核的 SleeptRuntime）' },
        args: {
          // **不标 required**：`at` 这一条是"未接"的定时器，先做参数校验会让症状变成
      // "Missing required argument: target."，使用者读到的是"我参数没给对"，
      // 而事实是"这块内核还没搬"——同一类误导，方向相反（对照本文件顶部那条
      // "静默消失比响亮拒绝更糟"）。参数等内核真落地再收。
      target: { type: 'string', description: 'Target datetime: YYYY-MM-DD HH:MM:SS.' },
          power: { type: 'string', description: 'sleep, hibernate, shutdown, or restart.' },
          dryrun: { type: 'boolean', description: 'Simulate the power action.' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run () {
          await runUnwiredTimer('at', host)
        },
      }),
      netspeed: defineCommand({
        meta: { name: 'netspeed', description: 'Trigger after sustained low network throughput.（未接：本 bin 没有喂内核的 SleeptRuntime）' },
        args: {
          upload: { type: 'string', description: 'Upload threshold in KB/s.' },
          download: { type: 'string', description: 'Download threshold in KB/s.' },
          duration: { type: 'string', description: 'Low-speed duration in minutes.' },
          trigger: { type: 'string', description: 'both or any.' },
          maxWait: { type: 'string', description: SLEEPT_MAX_WAIT_HELP },
          power: { type: 'string', description: 'sleep, hibernate, shutdown, or restart.' },
          dryrun: { type: 'boolean', description: 'Simulate the power action.' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run () {
          await runUnwiredTimer('netspeed', host)
        },
      }),
      cpu: defineCommand({
        meta: { name: 'cpu', description: 'Trigger after sustained low CPU usage.（未接：本 bin 没有喂内核的 SleeptRuntime）' },
        args: {
          threshold: { type: 'string', description: 'CPU threshold percentage.' },
          duration: { type: 'string', description: 'Low-CPU duration in minutes.' },
          maxWait: { type: 'string', description: SLEEPT_MAX_WAIT_HELP },
          power: { type: 'string', description: 'sleep, hibernate, shutdown, or restart.' },
          dryrun: { type: 'boolean', description: 'Simulate the power action.' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run () {
          await runUnwiredTimer('cpu', host)
        },
      }),
    },
  })
}

function timerArgs () {
  return {
    hours: { type: 'string', description: 'Hours.' },
    minutes: { type: 'string', description: 'Minutes.' },
    seconds: { type: 'string', description: 'Seconds.' },
    power: { type: 'string', description: 'sleep, hibernate, shutdown, or restart.' },
    dryrun: { type: 'boolean', description: 'Simulate the power action.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * `block --minutes`：定义里的规则是 `integerAtLeast 1`。
 * 不给时长时**不猜**：宿主用的是 `Config.blockDefaultMinutes`（默认 60），而按
 * `docs/adr/0013-config-goes-through-dsh-settings.md`，那份值只在宿主进程里读得到，
 * bin 里读不到就拒绝，而不是偷偷换成"一直持有"。
 */
function positiveMinutes (args: CliArgs): number {
  const raw = args.minutes
  if (raw === undefined || raw === true || String(raw).trim() === '') {
    throw new Error('Missing --minutes: the host default lives in Config.blockDefaultMinutes, which a standalone bin cannot read.')
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --minutes: ${String(raw)} is not an integer >= 1.`)
  }
  return parsed
}

/** 每个动作"为什么不能在这里执行"的一句话，界面与 stderr 用同一份。 */
function refusalReason (action: SleeptAction, planned: Planned): string {
  if (action === 'sleep') {
    return '立即睡眠会打断键盘前的人，定义里 `danger.actionIn` 把它标成危险动作：'
      + '批准缝在 DSH 的 approval（工具路径）里，bin 直接执行等于绕过批准。'
  }
  if (action === 'unblock' && planned.argv.length === 0) {
    return '`unblock` 的动作对象是宿主进程里那个持有睡眠的子进程（`src/exec.ts` 的 Inhibitor），'
      + 'bin 里没有那份状态，杀不到东西。'
  }
  return '本包的执行一律走 DSH 的 `ctx.subprocess`（`src/exec.ts`），独立 bin 不在宿主进程里，'
    + '拿不到那条缝。无模型的入口请用宿主侧的 `/sleept`（`ctx.commands`）。'
}

async function runNodeAction (
  action: SleeptAction,
  options: { minutes?: number; suspendKind?: 'suspend' | 'hibernate' },
  json: boolean,
  host: CliHost,
): Promise<void> {
  if (!NODE_ACTIONS.includes(action)) {
    throw new Error(`sleept: action "${action}" is not in package.json#xaihi.node.actions.`)
  }

  const platform = process.platform
  let planned: Planned
  try {
    const commands: PlannedCommand[] = []
    const command = planCommand(platform, action, options)
    if (command !== null) commands.push(command)
    // macOS 的状态有两半：`-g custom` 与 `-g assertions`，只看前者会漏掉"谁在拦"。
    if (action === 'status') {
      const probe = planAssertionProbe(platform)
      if (probe !== null) commands.push(probe)
    }
    planned = {
      action,
      platform,
      argv: commands.map((entry) => [...entry.argv]),
      longLived: action === 'block',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (json) writeJson(host, { action, platform, planned: [], executed: false, error: message })
    else writeLine(host, rich(host, message, 'red', 'bold'))
    process.exitCode = 1
    return
  }

  const reason = refusalReason(action, planned)
  if (json) {
    writeJson(host, { ...planned, executed: false, refused: reason })
    process.exitCode = 2
    return
  }

  const columns = terminalColumns(host)
  const lines = planned.argv.length === 0
    ? [`${rich(host, '命令', 'cyan')}  （这个动作不发命令，它动的是宿主进程里的状态）`]
    : planned.argv.map((argv) => `${rich(host, '命令', 'cyan')}  ${argv.join(' ')}`)
  if (planned.longLived) lines.push(`${rich(host, '生命周期', 'cyan')}  长驻，靠宿主的 terminate 收尾`)
  writeRichPanel(host, `${CLI_NAME} · 只规划，未执行`, lines, {
    color: 'blue',
    maxWidth: columns - 2,
    minWidth: Math.min(76, columns - 6),
  })
  writeError(host, `${CLI_NAME} ${action} 未接：${reason}`)
  process.exitCode = 2
}

async function runUnwiredTimer (name: string, host: CliHost): Promise<void> {
  // 名单就是上面那一份：新增一条"未接"却没登记，这里先炸，不要让拒绝文案自己漂出去。
  if (!(UNWIRED_TIMER_ACTIONS as readonly string[]).includes(name)) {
    throw new Error(`sleept: "${name}" 不在 UNWIRED_TIMER_ACTIONS 里，却走了未接分支`)
  }
  writeError(host, `${CLI_NAME} ${name} 未接：上游 sleept 的定时器内核（`
    + '`<Xiranite>/packages/nodes/sleept/src/core.ts` 的 `runSleept`，countdown / specific_time / netspeed / cpu）'
    + '已经搬进本仓，就在 `src/core.ts`；缺的是喂它的 `SleeptRuntime`——内核每一步都靠注入的 '
    + '`sleep` / `getCpuPercent` / `getNetCounters` / `executePowerAction`，而本包的执行一律走 DSH 的 '
    + '`ctx.subprocess`（`src/exec.ts`），独立 bin 不在宿主进程里，拿不到那条缝。'
    + '宿主侧那半边（`src/index.ts` 的 `defineNode`）登记的是电源节点那六个动作，也还没把这四条接进去。')
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
