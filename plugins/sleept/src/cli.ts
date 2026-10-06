#!/usr/bin/env node
/**
 * sleept 的终端面，对照 `<Xiranite>` tag `noxide` 的 `packages/nodes/sleept/src/cli.ts`。
 *
 * 这一档是三个节点里**形状差得最远**的一个，原因写在明处：
 * 上游的 sleept 是**定时器**——`countdown / at / netspeed / cpu` 四个触发器 + 触发后的
 * 电源动作，逻辑在 `packages/nodes/sleept/src/core.ts` 的 `runSleept`。本仓的 sleept 是
 * **电源节点**——`status / block / unblock / sleep / displayOff / screensaver`
 * （真源：`package.json#xaihi.node`），那份定时器内核**现在在 `src/core.ts`**
 * （两条纯函数在 `src/duration.ts`，交互面的折参在 `src/interaction.ts`——工作台那两条
 * value-import 已经从"未迁"变成解析得到）。**内核在这儿，四条定时器子命令在这个 bin 里仍然是未接**：
 * `runSleept` 一寸一寸都靠注入的 `SleeptRuntime`（`sleep` / `getCpuPercent` / `getNetCounters` /
 * `executePowerAction`），缺的不是算法，是喂它的那台运行时。
 * 于是：
 * - 本节点定义里的六个动作成为子命令，flag 与退出码按上游终端面的形状给；
 * - 上游那四个定时器子命令**留在 `--help` 里**，跑起来一律"未接"（退出码 2）。
 *   静默消失比响亮拒绝更糟：那样聚合 CLI 的面板看起来像"这个节点少了四个能力"，
 *   而不是"这块运行时还没接"。
 *
 * 执行这一半也**未接**：本包的执行一律经 DSH 的 `ctx.subprocess`（`src/exec.ts` 顶部写了
 * 为什么不自建 spawn），而独立 bin 不在宿主进程里，拿不到那条缝。所以 CLI 只做到
 * "把平台计划算出来给你看"（`planCommand` / `planAssertionProbe` 都是纯函数，复用 `src/platform.ts`，
 * 不在此另写一份平台分支），随后拒绝执行。无模型的入口另有宿主侧的 slash command
 * （`src/index.ts` 的 `ctx.commands.register({ name: 'sleept' })`），它同样不许碰
 * 被 `danger.actionIn` 标红的 `sleep`。
 *
 * @module xaihi-sleept/cli
 */

import {
  createCliHost,
  defineCommand,
  nodeCliName,
  runNodeCliFace,
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

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + '而且本节点的执行本来就只活在宿主进程里（`ctx.subprocess`）。',
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Sleep control CLI: planned commands on the terminal face, execution on the host face.' },
    subCommands: {
      'ui': defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
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
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      'guided': defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
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

/** 自执行闸门：与 linedup / dissolvef 同一写法。 */
const entry = process.argv[1] ?? ''
if (/\bcli\.[cm]?[jt]s$/.test(entry.replace(/\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
