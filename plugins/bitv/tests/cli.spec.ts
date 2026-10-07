/**
 * bitv 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * "bin 里不执行"来自 `src/platform.ts` 那句 `BITV_PROCESS_SEAM_REFUSAL`（外部程序那一格要的是
 * DSH 的 `ctx.subprocess`，独立 bin 不在宿主进程里）；退出码 2 与那句
 * `No interactive terminal detected.` 来自 `src/cli-support.ts` 的 `runNodeCliFace`。
 * 期望值全部手抄，不由被测函数现算。
 *
 * 阳性对照有四处：
 * 1. 整条 `report` 子命令删掉，第一条立刻红（只 `toContain` 查不出这种漂移——`gd` 的描述里
 *    就写着 "guided"，所以这里按 `Subcommands` 表格那一行的形状认）。
 * 2. `declaredActions()` 在清单空或形状漂时**直接抛**，而不是返回一串 `undefined` 让下面的
 *    循环假绿。
 * 3. 把 `runSeamBlockedAction` 的拒绝换成"打印成功"，第二、三条立刻红。
 * 4. 断言的是 stderr / `--json` 里的 `refused` **等于** `src/platform.ts` 那份常量：
 *    在 `src/cli.ts` 里另抄一句拒绝文案就红了（一条真源，两处出口）。
 *
 * @module xaihi-bitv/tests/cli
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { BITV_PROCESS_SEAM_REFUSAL } from '../src/platform.ts'

/** 每个用例自己清一次退出码，否则一条用例的 `process.exitCode` 会脏到下一条。 */
afterEach(() => {
  process.exitCode = 0
})

function createHost (): CliHost & { stdoutText: () => string; stderrText: () => string } {
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

/**
 * 动作名单的唯一真源。形状不对就直接抛，不是返回一串 `undefined` 继续往下走：
 * 否则"至少 1 条"的下界照样成立，循环里却全员拿着 `undefined` 去比，这条尺就成了假的。
 */
function declaredActions (): string[] {
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

/** `Subcommands` 表格那一行：两个空格 + 名字 + 至少一个空格（padEnd 的结果）。 */
const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')

describe('bitv 终端面', () => {
  it('--help 把清单里的四条动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions).toEqual(['status', 'analyze', 'classify', 'report'])

    for (const action of actions) {
      expect(row(action).test(help), `--help 的子命令表里没有动作 ${action}（清单与终端面漂了）`).toBe(true)
    }

    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('四条动作一律拒绝执行：exit 2、executed=false，理由点名 ctx.subprocess', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      // 不夹带别的 flag：`report` 那条腿上 `--path` 根本没声明（上游那里它是 `--report`），
      // 混进来会把"拒绝执行"这条尺测成"参数解析"。
      await runProgram([action, '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { node: string; action: string; executed: boolean; refused: string }
      expect(report.node).toBe('bitv')
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把"探针起不来"演成成功').toBe(false)
      expect(report.refused).toContain('ctx.subprocess')
      // 阳性对照：终端面与运行时共用那一句，谁另抄一份就红。
      expect(report.refused).toBe(BITV_PROCESS_SEAM_REFUSAL)
      process.exitCode = 0
    }
  })

  it('不带 --json 时 stderr 印同一句话（一条真源，两处出口）', async () => {
    const host = createHost()
    await runProgram(['analyze'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toBe(`bitv analyze 未接：${BITV_PROCESS_SEAM_REFUSAL}\n`)
    expect(host.stdoutText()).toBe('')
  })

  it('拒绝在参数校验**之前**：不带 --path 也只报缺缝，不报缺参', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action], host)
      process.exitCode = 0
      const text = `${host.stdoutText()}${host.stderrText()}`
      expect(text, `${action} 的拒绝里没说"未接"`).toContain('未接')
      expect(text).toContain('ctx.subprocess')
      // 阳性对照：把"这块内核接不了"说成"你参数没给对"，是这条要拦的误导。
      expect(text).not.toContain('Missing')
      expect(text).not.toContain('requires a value')
    }
  })

  it('--json 回读 flag：--apply 关掉预演、--move 顶掉默认（与上游同一跳法）', async () => {
    const plain = createHost()
    await runProgram(['classify', '--json'], plain)
    process.exitCode = 0
    const first = JSON.parse(plain.stdoutText()) as { dryRun: boolean; transferMode: string }
    expect(first.dryRun).toBe(true)
    expect(first.transferMode).toBe('copy')

    const applied = createHost()
    await runProgram(['classify', '--apply', '--move', '--json'], applied)
    process.exitCode = 0
    const second = JSON.parse(applied.stdoutText()) as { dryRun: boolean; transferMode: string }
    expect(second.dryRun).toBe(false)
    expect(second.transferMode).toBe('move')

    // 阳性对照：`--dry-run` 与 `--apply` 同时写时 apply 赢（上游 `:214` 就是那个判序）。
    const both = createHost()
    await runProgram(['report', '--dry-run', '--apply', '--json'], both)
    process.exitCode = 0
    expect((JSON.parse(both.stdoutText()) as { dryRun: boolean }).dryRun).toBe(false)
  })

  it('非 TTY 且无参数时拒绝，并给出 bitv --help 的提示', async () => {
    const host = createHost()
    host.stdin.isTTY = false
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('bitv')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['analyze', '--path', 'D:/videos', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope.')
  })

  it('位置参不支持（vendored 支撑的契约）：`bitv analyze D:/videos` 是用法错，不是猜路径', async () => {
    const host = createHost()
    await runProgram(['analyze', 'D:/videos'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown argument')
  })

  it('交互腿 ui 与 gd/guided 正常进入（退出码 0），且**先于**任何参数校验', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 执行成功`).toBe(0)
      process.exitCode = 0
    }
  })

  it('`--recursive` 与 `--no-recursive` 都认（上游那对布尔），而不是被判成未知 flag', async () => {
    for (const flag of ['--recursive', '--no-recursive']) {
      const host = createHost()
      await runProgram(['analyze', flag, '--json'], host)
      const exitCode = process.exitCode
      process.exitCode = 0
      expect(exitCode, `${flag} 那条腿的出口码不对`).toBe(2)
      // 阳性对照：flag 不认的话走的是"Unknown option"那条用法错，stdout 会是空的。
      expect(host.stderrText(), `${flag} 被判成了未知选项：${host.stderrText()}`).not.toContain('Unknown option')
      const report = JSON.parse(host.stdoutText()) as { action: string; executed: boolean }
      expect(report.action).toBe('analyze')
      expect(report.executed).toBe(false)
    }
  })
})
