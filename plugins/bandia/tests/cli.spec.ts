/**
 * bandia 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * "bin 里不执行"来自 `src/index.ts` 的 `inject = ['tools', 'subprocess']`、`src/exec.ts`
 * 的 `ctx.subprocess` 与 node-sdk 的 `OPERATIONS_SERVICE`；退出码 2 与那句
 * `No interactive terminal detected.` 来自 `src/cli-support.ts` 的 `runNodeCliFace`。
 * 期望值全部手抄（flag 名抄上游 `cli.ts:172-196`），不由被测函数现算。
 *
 * 阳性对照有三处：整条 `export-efu` 别名删掉之后第三条立刻红；`declaredActions()` 在清单
 * 空或形状漂时直接抛，而不是返回一串 `undefined` 让下面的循环假绿；把 `runHostedAction`
 * 的拒绝换成"打印成功"，第二条立刻红。
 *
 * @module xaihi-bandia/tests/cli
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'

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

describe('bandia 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThan(0)

    // 只 `toContain(名字)` 会假绿：`gd` 那条腿的描述里就写着 "guided"，把子命令整条删掉
    // 也照样查不出来。所以按 Subcommands 表格那一行的形状认（两个空格 + 名字 + 空白）。
    const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')
    for (const action of actions) {
      expect(row(action).test(help), `--help 的子命令表里没有动作 ${action}（清单与终端面漂了）`).toBe(true)
    }

    // 上游 `cli.ts:155` 那条连字符拼法也必须还在面上（它是指向同一条腿的别名）。
    expect(row('export-efu').test(help)).toBe(true)

    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('非 TTY 且无参数时拒绝，并给出 xbandia --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xbandia')
  })

  it('动作只拒绝不执行：executed=false，理由点名缺的那条 DSH 服务', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--paths', 'C:/in/book.zip', '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { node: string; action: string; executed: boolean; inputs: Record<string, unknown>; refused: string }
      expect(report.node).toBe('bandia')
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把已经移植的内核演成成功').toBe(false)
      expect(report.refused, '拒绝理由必须点名宿主侧那条服务，否则使用者不知道缺什么').toContain('ctx.subprocess')
      expect(report.refused).toContain('ctx.approval')
      expect(report.refused).toContain('OPERATIONS_SERVICE')
      expect(report.inputs.paths).toBe('C:/in/book.zip')
      process.exitCode = 0
    }
  })

  it('上游那条连字符拼法指回同一个动作 id（别名不许变成第五个动作）', async () => {
    const host = createHost()
    await runProgram(['export-efu', '--paths', 'C:/in/book.zip', '--json'], host)
    expect(process.exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { action: string; invoked: string }
    expect(report.invoked).toBe('export-efu')
    expect(report.action).toBe('export_efu')
    // 阳性对照：把 `export-efu` 整条子命令删掉，上面两条立刻读不到 JSON（stdout 是空的）。
    expect(declaredActions()).not.toContain('export-efu')
  })

  it('flag 名逐条对上游：`--mode` / `--prefix` / `--overwrite` / `--format` 这四个别名收得到', async () => {
    const host = createHost()
    await runProgram(['extract', '--path', 'C:/a.zip', '--mode', 'normal', '--prefix', '【a】', '--overwrite', 'skip', '--format', '7z', '--workers', '3', '--dry-run', '--json'], host)
    expect(process.exitCode).toBe(2)
    const inputs = (JSON.parse(host.stdoutText()) as { inputs: Record<string, unknown> }).inputs
    // 回显**不折叠别名**：谁赢是内核的事（`cli.ts:244-260`），拒绝面里先折一次就是演事实。
    expect(inputs).toEqual({ path: 'C:/a.zip', mode: 'normal', prefix: '【a】', overwrite: 'skip', format: '7z', workers: '3', dryRun: true })
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['extract', '--path', 'C:/a.zip', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('三条未接的腿响亮拒绝（退出码 2，不是 0），且不报"缺参"', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 未接却报了成功码`).toBe(2)
      expect(host.stderrText(), `${leg} 的拒绝里没说"未接"`).toContain('未接')
      // 阳性对照：未接的功能不许先报"Missing required argument"——那会把"这块没接上"
      // 说成"你参数没给对"。
      expect(host.stderrText()).not.toContain('Missing')
      process.exitCode = 0
    }
  })
})
