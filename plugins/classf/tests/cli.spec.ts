/**
 * classf 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * flag 名单来自同一份定义的 `fields[].id`；"bin 里为什么跑不出结果"来自
 * `src/platform.ts` 的那两个常量（缺口 G10 与 G5），退出码 2 与那句
 * `No interactive terminal detected.` 来自 `src/cli-support.ts` 的 `runNodeCliFace`。
 * 期望值全部手抄，不由被测函数现算。
 *
 * 阳性对照有四处：整条 `guided` 子命令删掉第一条立刻红（只 `toContain` 查不出这种漂移，
 * `gd` 的描述里就写着 "guided"）；`declaredActions()` 在清单空或形状漂时直接抛，而不是
 * 返回一串 `undefined` 让下面的循环假绿；"给了路径"与"没给路径"必须说出**两句不同的**
 * 拒绝（少一条就看不出缝缺失被折叠成了一句）；把 `--json` 的 `executed` 从 `false`
 * 改成 `true`（也就是把拒绝换成"打印成功"）第三条立刻红。
 *
 * @module xaihi-classf/tests/cli
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { CLIPBOARD_UNWIRED, SIBLING_KERNEL_UNWIRED } from '../src/platform.ts'

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
 * 抄来的老写法把不存在的字段 `String()` 成 `undefined`，于是"至少 1 条"的下界照样
 * 成立，循环里却全员拿着 `undefined` 去比。
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

describe('classf 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThan(0)
    expect(actions).toEqual(['plan', 'classify'])

    // 只 `toContain(名字)` 会假绿：`gd` 那条腿的描述里就写着 "guided"，把子命令整条删掉
    // 也照样查不出来。所以按 Subcommands 表格那一行的形状认（两个空格 + 名字 + 空白）。
    const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')
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

  it('非 TTY 且无参数时拒绝，并给出 classf --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('classf')
  })

  it('给了路径也是拒绝：executed=false，理由点名兄弟内核那条缝（G10）', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--paths-text', '/archives', '--json'], host)
      expect(process.exitCode, `${action} 跑不出结果却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { action: string; executed: boolean; refused: string; success: boolean }
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把"缝不在"演成"跑完了"').toBe(false)
      expect(report.success).toBe(false)
      expect(report.refused, '拒绝理由必须点名缺的那三条内核，否则使用者不知道缺什么').toBe(SIBLING_KERNEL_UNWIRED)
      expect(report.refused).toContain('runSamea')
      expect(report.refused).toContain('G10')
      process.exitCode = 0
    }
  })

  it('不给路径时说的是另一句：缺的是剪贴板那条缝（G5）', async () => {
    const host = createHost()
    await runProgram(['plan', '--json'], host)
    expect(process.exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { executed: boolean; refused: string }
    expect(report.executed).toBe(false)
    // 阳性对照：两条拒绝必须分得开——内核先判剪贴板再判兄弟内核（`core.ts:87`）。
    // 若哪天折叠成一句，这条就红，而不是悄悄少一条可读回的降级。
    expect(report.refused).toBe(CLIPBOARD_UNWIRED)
    expect(report.refused).not.toBe(SIBLING_KERNEL_UNWIRED)
    expect(report.refused).toContain('G5')
    process.exitCode = 0
  })

  it('--dry-run 也不改变结局：预演同样要先过兄弟内核', async () => {
    const host = createHost()
    await runProgram(['plan', '--paths-text', '/archives', '--dry-run', '--json'], host)
    expect(process.exitCode).toBe(2)
    expect((JSON.parse(host.stdoutText()) as { refused: string }).refused).toBe(SIBLING_KERNEL_UNWIRED)
    process.exitCode = 0
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['plan', '--paths-text', '/archives', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('三个队列开关都能关（--no-<name>），关掉不会把拒绝换成成功', async () => {
    const host = createHost()
    await runProgram(['plan', '--paths-text', '/archives', '--no-already-enabled', '--wait-enabled', '--del-enabled', '--json'], host)
    expect(process.exitCode).toBe(2)
    expect((JSON.parse(host.stdoutText()) as { refused: string }).refused).toBe(SIBLING_KERNEL_UNWIRED)
    process.exitCode = 0
  })

  it('交互腿 ui 与 gd/guided 正常进入（退出码 0），且**先于**任何参数校验', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 执行成功`).toBe(0)
      expect(host.stderrText()).not.toContain('Unknown option')
      process.exitCode = 0
    }
  })
})
