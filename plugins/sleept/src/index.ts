/**
 * sleept 的宿主半边：电源状态、阻止休眠、立即睡眠。
 *
 * 三件事各自归位：
 * - 命令与解析在 `platform.ts`（纯函数，用真机夹具测）；
 * - 执行与子进程生命周期在 `exec.ts`（走 DSH 的 `ctx.subprocess`，不自建 spawn）；
 * - 危险语义只有一个出口：`sleep` 动作经 `xaihi.node/v1` 的 `danger.actionIn` 变成
 *   DSH 的 `ask`，审批 UI 与审计全在宿主，本包不碰。
 *
 * 定义只有一份真源：`package.json#xaihi.node`。
 *
 * @module xaihi-sleept
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
// 只取类型：它的 `declare module '@deepseek-ai/cordis'` 补上 `ctx.commands`，
// 运行时实现由宿主提供，本包不在产物里引它。
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, dangerFor, OPERATIONS_SERVICE, validateNodeDefinition, type OperationJournal } from '@hibernalglow/xaihi-sdk'
import { createInhibitor, createRunner, type InhibitorState } from './exec.ts'
import {
  parseHibernateEnabled,
  parseMacAssertions,
  parseMacCustom,
  parsePowercfgSetting,
  planAssertionProbe,
  planCommand,
  type PlannedCommand,
  type SleeptAction,
} from './platform.ts'

export const name = '@hibernalglow/xaihi-sleept'

export const inject = ['tools', 'subprocess', 'commands']

export interface Config {
  /** `block` 不带时长时用多少分钟。 */
  blockDefaultMinutes: Volatile<number>
}

export const Config = Schema.object({
  blockDefaultMinutes: Schema.number().default(60).volatile(),
})

/** 本包自己的节点定义；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

const secondsText = (value: number | null): string =>
  value === null ? 'Never' : value >= 3600 ? `${(Math.round((value / 3600) * 10) / 10).toString()} h` : `${Math.round(value / 60)} min`

/** 一份跨平台的状态载荷；面板和文本输出读同一份，不分叉。 */
export interface SleeptStatus {
  platform: string
  inhibitor: InhibitorState
  /** macOS：按电源段给出的设置。 */
  mac?: Record<string, { systemSleepSeconds: number | null; displaySleepSeconds: number | null; hibernateMode: number | null }>
  /** macOS：正在阻止休眠的进程。 */
  macHolders?: Array<{ pid: number; process: string; kind: string }>
  /** Windows：睡眠/休眠的空闲超时与休眠开关状态。 */
  windows?: {
    standby: { acSeconds: number | null; dcSeconds: number | null; known: boolean }
    hibernate: { acSeconds: number | null; dcSeconds: number | null; known: boolean }
    hibernateEnabled: boolean | null
  }
  /** 命令本身失败时的原因，界面要能看见。 */
  problems: string[]
}

export function apply(ctx: Context, config: Config): void {
  const platform = process.platform
  const runner = createRunner(ctx.subprocess, process.cwd())
  const inhibitor = createInhibitor(runner, (minutes) => {
    const command = planCommand(platform, 'block', { minutes })
    if (command === null) throw new Error('sleept: block has no command on this platform')
    return command
  })
  // 插件卸载（含热更）必须把睡眠拦截放掉，否则"节点已禁用但机器再也不睡"是一件
  // 只有第二天才会被发现的事。
  ctx.effect(() => () => { inhibitor.stop() }, 'sleept: release the sleep hold on unload')

  const collectStatus = async (): Promise<SleeptStatus> => {
    const problems: string[] = []
    const base: SleeptStatus = { platform, inhibitor: inhibitor.state(), problems }
    if (platform === 'darwin') {
      const custom = await runner.run(mustPlan('status'))
      if (custom.exitCode !== 0) problems.push(`pmset -g custom exited ${String(custom.exitCode)}: ${custom.errorText.trim()}`)
      const assertions = planAssertionProbe(platform)
      const holderText = assertions === null ? '' : (await runner.run(assertions)).text
      const parsed = parseMacAssertions(holderText)
      return {
        ...base,
        mac: parseMacCustom(custom.text),
        macHolders: parsed.holders.map(({ pid, process: name, kind }) => ({ pid, process: name, kind })),
      }
    }
    if (platform === 'win32') {
      const output = await runner.run(mustPlan('status'))
      if (output.exitCode !== 0) problems.push(`powercfg query exited ${String(output.exitCode)}: ${output.errorText.trim()}`)
      return {
        ...base,
        windows: {
          standby: parsePowercfgSetting(output.text, 'STANDBYIDLE'),
          hibernate: parsePowercfgSetting(output.text, 'HIBERNATEIDLE'),
          hibernateEnabled: parseHibernateEnabled(output.text),
        },
      }
    }
    problems.push(`unsupported platform: ${platform}`)
    return base
  }

  const mustPlan = (action: SleeptAction, options: { minutes?: number; suspendKind?: 'suspend' | 'hibernate' } = {}): PlannedCommand => {
    const command = planCommand(platform, action, options)
    if (command === null) throw new Error(`sleept: action "${action}" needs a command but the planner returned none`)
    return command
  }

  // 定义先校验一次：命令侧要用它算危险闸门，而这里必须是同一个真源，不能另写一张表。
  const validated = validateNodeDefinition(ownNodeDefinition())
  if (!validated.ok) throw new Error(`xaihi.node/v1 invalid: ${validated.errors.join('; ')}`)
  const nodeDefinition = validated.value

  const node = defineNode(ctx, {
    definition: nodeDefinition,
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async status({ run }) {
        const status = await collectStatus()
        run.resultView(status)
        const lines: string[] = [`platform: ${status.platform}`]
        if (status.mac !== undefined) {
          for (const [section, values] of Object.entries(status.mac)) {
            lines.push(`${section}: system sleep ${secondsText(values.systemSleepSeconds)}, display sleep ${secondsText(values.displaySleepSeconds)}, hibernatemode ${String(values.hibernateMode)}`)
          }
        }
        if (status.macHolders !== undefined) {
          lines.push(status.macHolders.length === 0 ? 'no process is holding off sleep' : `held off by: ${status.macHolders.map((holder) => `${holder.process}(pid ${String(holder.pid)})`).join(', ')}`)
        }
        if (status.windows !== undefined) {
          const { standby, hibernate, hibernateEnabled } = status.windows
          lines.push(`standby: AC ${secondsText(standby.acSeconds)} / DC ${secondsText(standby.dcSeconds)}`)
          lines.push(`hibernate: AC ${secondsText(hibernate.acSeconds)} / DC ${secondsText(hibernate.dcSeconds)}, enabled ${String(hibernateEnabled)}`)
        }
        lines.push(status.inhibitor.held
          ? `this node holds sleep off (hold #${String(status.inhibitor.holdId)}, expires ${status.inhibitor.expiresAt === null ? 'never' : new Date(status.inhibitor.expiresAt).toISOString()})`
          : 'this node holds nothing off')
        for (const problem of status.problems) lines.push(`PROBLEM: ${problem}`)
        return lines.join('\n')
      },

      async block({ inputs, run }) {
        const raw = inputs.minutes
        const minutes = typeof raw === 'number' && raw > 0 ? raw : config.blockDefaultMinutes.get()
        const state = inhibitor.start({ minutes })
        run.resultView(state)
        return state.held
          ? `sleep is held off (hold #${String(state.holdId)}, ${minutes} min${state.expiresAt === null ? ', until released' : ''})`
          : `failed to hold sleep off: ${JSON.stringify(state)}`
      },

      async unblock({ run }) {
        const state = inhibitor.stop()
        run.resultView(state)
        return state.held ? 'release requested, child still terminating' : 'nothing is held off'
      },

      async sleep({ inputs, run }) {
        const allowHibernate = inputs.allowHibernate === true
        if (platform === 'win32' && allowHibernate) {
          // 休眠没开时 SetSuspendState(bHibernate=true) 会静默什么都不做，
          // 所以先问一次，而不是"命令返回 0 但机器没动"。
          const enabled = parseHibernateEnabled((await runner.run(mustPlan('status'))).text)
          if (enabled === false) throw new Error('sleept: hibernation is disabled on this machine, refusing to "sleep" by doing nothing')
        }
        const command = mustPlan('sleep', platform === 'win32' ? { suspendKind: allowHibernate ? 'hibernate' : 'suspend' } : {})
        const result = await runner.run(command)
        run.resultView({ argv: command.argv, exitCode: result.exitCode, errorText: result.errorText })
        if (result.exitCode !== 0) {
          throw new Error(`sleept: ${command.argv.join(' ')} exited ${String(result.exitCode)}${result.errorText.trim() === '' ? '' : `: ${result.errorText.trim()}`}`)
        }
        return platform === 'darwin' ? 'pmset sleepnow accepted; the machine is going to sleep' : 'suspend requested through powrprof'
      },
    },
  })

  /**
   * 不经过模型的入口：composer 里输入 `/sleept status` 就直接执行
   * （`docs/subsystems/commands.md`："Execute against the receiving agent without sending
   * the command to the model"）。这也是面板按钮要走的同一条路。
   *
   * 它**不能**成为危险动作的后门：`node.invoke` 不过 `tools/pre-execute`，所以定义里
   * 标危险的动作在这里一律拒绝，要跑就得走带审批的工具路径。
   */
  ctx.effect(() => ctx.commands.register({
    name: 'sleept',
    description: 'Xaihi 休眠管理 / sleep control: /sleept status | block [minutes] | unblock',
    async handler({ rawInput }): Promise<CommandResult> {
      const parts = rawInput.trim().split(/\s+/).filter((part) => part !== '')
      const action = parts[0] ?? 'status'
      const args: Record<string, unknown> = { action }
      if (action === 'block' && parts[1] !== undefined) args.minutes = Number.parseInt(parts[1], 10)
      if (dangerFor(nodeDefinition, undefined, action, args) !== undefined) {
        return { kind: 'error', text: `refused /sleept ${action}: gated as dangerous, run it through the agent so DSH can ask for approval` }
      }
      try {
        return { kind: 'success', text: await node.invoke(action, args) }
      } catch (error) {
        return { kind: 'error', text: `sleept ${action} failed: ${String(error instanceof Error ? error.message : error)}` }
      }
    },
  }), 'sleept: slash command')
}
