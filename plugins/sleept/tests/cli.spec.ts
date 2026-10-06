/**
 * sleept 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：
 * - 动作清单来自 `package.json#xaihi.node.actions`（ADR-0013 之后节点能力的唯一真源）；
 * - "只规划、不执行"来自 `src/exec.ts` 顶部那条纪律（执行一律走 DSH 的 `ctx.subprocess`，
 *   独立 bin 不在宿主进程里，拿不到那条缝）；
 * - 平台主命令（darwin 是 `pmset`、win32 是 `powercfg`）来自 CONTEXT.md 的 inhibitor 词条
 *   与上游 `packages/nodes/sleept/src/cli.ts` 的形状，**不是**跑一遍被测函数抄下来的。
 *
 * 阳性对照有三处：`--help` 里塞一个不存在的名字必须查不到；`block --minutes 5` 必须
 * 不再报"缺 --minutes"；`sleep` 的拒绝理由必须点名"批准"，否则危险动作那道闸就是装饰。
 *
 * @module xaihi-sleept/tests/cli
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_TIMER_ACTIONS, runProgram } from '../src/cli.ts'

/** 每个用例自己清一次退出码，否则一条用例的 `process.exitCode` 会脏到下一条。 */
afterEach(() => {
  process.exitCode = 0
})

function createHost(): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: true } as CliHost['stdin'],
    stdout: {
      isTTY: false,
      columns: 120,
      write (chunk: string) {
        stdout += chunk
        return true
      },
    },
    stderr: {
      isTTY: false,
      columns: 120,
      write (chunk: string) {
        stderr += chunk
        return true
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}

/** 动作清单的唯一真源。 */
/**
 * 动作清单的唯一真源。形状不对就直接抛，不是返回一串 `undefined` 继续往下走：
 * 上一版就是 `String(entry.name)` 把不存在的字段变成 `undefined`，
 * 于是"至少 4 条"那个下界照样成立，循环里却全员拿着 `undefined` 去比。
 */
function declaredActions(): string[] {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    xaihi?: { node?: { actions?: Array<{ id?: unknown }> } }
  }
  const actions = manifest.xaihi?.node?.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('package.json#xaihi.node.actions 缺失或为空：这条尺没有真源可比')
  }
  return actions.map((entry, index) => {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`第 ${index} 条动作没有 id（真源形状漂了，不是断言该迁就的东西）`)
    }
    return entry.id
  })
}

const PLATFORM_BINARY: Record<string, string> = { darwin: 'pmset', win32: 'powercfg' }

describe('sleept 终端面', () => {
  it('--help 把六个动作与四条未接的定时器一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThanOrEqual(4)
    for (const action of actions) expect(help, `--help 里没有动作 ${action}`).toContain(action)

    // 上游那四个定时器**留在面板上并标明未接**，不是删掉了事。
    for (const timer of UNWIRED_TIMER_ACTIONS) {
      expect(help, `--help 里少了未接的定时器 ${timer}`).toContain(timer)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('status 只规划不执行：executed=false，理由点名 ctx.subprocess', async () => {
    const host = createHost()
    await runProgram(['status', '--json'], host)
    expect(process.exitCode, '未执行的动作必须给非零退出码，不然聚合 CLI 以为成功').toBe(2)

    const report = JSON.parse(host.stdoutText()) as {
      action: string
      platform: string
      argv: string[][]
      executed: boolean
      refused: string
    }
    expect(report.action).toBe('status')
    expect(report.executed, 'bin 里绝不许真执行电源动作').toBe(false)
    expect(report.refused).toContain('ctx.subprocess')

    const expected = PLATFORM_BINARY[report.platform]
    if (expected !== undefined) {
      expect(report.argv.length, `${report.platform} 上 status 至少要规划一条命令`).toBeGreaterThan(0)
      for (const argv of report.argv) expect(argv[0], `规划了别的平台的命令：${argv.join(' ')}`).toBe(expected)
    }
    // macOS 的状态有两半：只看 `-g custom` 会漏掉"谁在拦"。
    if (report.platform === 'darwin') {
      expect(report.argv.map((argv) => argv.join(' ')).join('\n')).toContain('assertions')
    }
  })

  it('sleep 的拒绝理由点名"批准"：危险动作不许被 bin 绕过', async () => {
    const host = createHost()
    await runProgram(['sleep', '--json'], host)
    expect(process.exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { executed: boolean; refused: string }
    expect(report.executed).toBe(false)
    expect(report.refused, '立即睡眠是危险动作，拒绝理由必须说清批准缝在哪').toMatch(/批准/)
  })

  it('block 不给时长就拒绝：不拿宿主 Config 的默认值偷偷顶上', async () => {
    const host = createHost()
    await runProgram(['block'], host)
    expect(process.exitCode, '缺参必须红，不能猜 60 分钟').not.toBe(0)
    const message = `${host.stdoutText()}${host.stderrText()}`
    expect(message).toContain('--minutes')
    expect(message, '拒绝时必须点名那份读不到的宿主默认值，否则使用者不知道去哪配').toContain('Config.blockDefaultMinutes')

    // 阳性对照：给了时长就不该再报这条。
    const given = createHost()
    await runProgram(['block', '--minutes', '5', '--json'], given)
    expect(given.stdoutText() + given.stderrText()).not.toContain('Missing --minutes')
    expect(JSON.parse(given.stdoutText()).executed).toBe(false)
  })

  it('countdown 这四条响亮地报"未接"，并说清缺的是哪块内核', async () => {
    for (const timer of UNWIRED_TIMER_ACTIONS) {
      const host = createHost()
      await runProgram([timer], host)
      expect(process.exitCode, `${timer} 未接却报了成功码`).toBe(2)
      const message = host.stderrText()
      expect(message, `${timer} 的拒绝里没说"未接"`).toContain('未接')
      expect(message, `${timer} 的拒绝里没交代缺的内核`).toContain('定时器内核')
      process.exitCode = 0
    }
  })
})
