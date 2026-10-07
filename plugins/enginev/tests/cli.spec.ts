/**
 * enginev 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * "bin 里不执行"来自 `src/index.ts` 的 `inject = ['tools']`、定义里的 `danger.all`
 * （批准缝 `ctx.approval` 只在宿主）与 node-sdk 的 `OPERATIONS_SERVICE`；
 * 退出码 2 与那句 `No interactive terminal detected.` 来自 `src/cli-support.ts` 的
 * `runNodeCliFace`。期望值全部手抄（flag 名抄上游 `cli.ts:158-182`），不由被测函数现算。
 *
 * 阳性对照有三处：把 `runHostedAction` 的拒绝换成"打印成功"，第三条立刻红；
 * `declaredActions()` 在清单空或形状漂时直接抛，而不是返回一串 `undefined` 让循环假绿；
 * 把 `--rating` / `--output` 这两条别名拼错或删掉，第四条读不到那两个键。
 *
 * @module xaihi-enginev/tests/cli
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

describe('enginev 终端面', () => {
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

    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('非 TTY 且无参数时拒绝，并给出 enginev --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('enginev')
  })

  it('动作只拒绝不执行：executed=false，理由点名缺的那条 DSH 服务', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--path', 'E:/SteamLibrary/workshop', '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { node: string; action: string; executed: boolean; inputs: Record<string, unknown>; refused: string }
      expect(report.node).toBe('enginev')
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把已经移植的内核演成成功').toBe(false)
      expect(report.refused, '拒绝理由必须点名宿主侧那条服务，否则使用者不知道缺什么').toContain('ctx.approval')
      expect(report.refused).toContain('OPERATIONS_SERVICE')
      expect(report.refused).toContain('ctx.settings')
      expect(report.inputs.path).toBe('E:/SteamLibrary/workshop')
      process.exitCode = 0
    }
  })

  it('flag 名逐条对上游：两条别名与那一对方向相反的开关都收得到', async () => {
    const host = createHost()
    await runProgram([
      'rename', '--path', 'E:/w', '--rating', 'Mature', '--output', 'E:/out.json',
      '--template', '{title}_{id}', '--execute', '--permanent', '--json',
    ], host)
    expect(process.exitCode).toBe(2)
    const inputs = (JSON.parse(host.stdoutText()) as { inputs: Record<string, unknown> }).inputs
    // 回显**不折叠别名**：`rating` 与 `contentRating` 谁赢是内核的事（`cli.ts:226`），
    // `output` 与 `exportPath` 同理（`cli.ts:240`）。拒绝面里先折一次就是演事实。
    expect(inputs).toEqual({
      path: 'E:/w', rating: 'Mature', output: 'E:/out.json', template: '{title}_{id}', execute: true, permanent: true,
    })
  })

  it(`--dry-run 与 --execute 同时给也不在这里裁决（上游那句 \`args.execute ? false : args.dryRun ?? true\` 不在拒绝面里跑）`, async () => {
    const host = createHost()
    await runProgram(['delete', '--ids', '111', '--dry-run', '--execute', '--json'], host)
    expect(process.exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { executed: boolean; inputs: Record<string, unknown> }
    expect(report.inputs.dryRun).toBe(true)
    expect(report.inputs.execute).toBe(true)
    expect(report.executed).toBe(false)
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['scan', '--path', 'E:/w', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('交互腿 ui 与 gd/guided 正常进入（退出码 0），且**先于**任何参数校验', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 执行成功`).toBe(0)
      // 阳性对照：未接的功能不许先报"Missing required argument"——那会把"这块没接上"
      // 说成"你参数没给对"。
      expect(host.stderrText()).not.toContain('Missing')
      process.exitCode = 0
    }
  })
})
