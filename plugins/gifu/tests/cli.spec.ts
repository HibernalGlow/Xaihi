/**
 * gifu 终端面的验收：断的是**上游那份 CLI 的形状**加上"这一面跑不动"这件事本身。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * flag 名单（28 条里我们那 27 条）与三条子命令的描述逐字手抄自基线
 * `packages/nodes/gifu/src/cli.ts:328-359`（`pipeArgs()`）与 `:229-231`；
 * "bin 里不执行"来自 `src/platform.ts` 那条缝（`ctx.subprocess`）与 `src/index.ts` 的
 * `inject = ['tools', 'subprocess']`；退出码 2 与那句 `No interactive terminal detected.`
 * 来自 `src/cli-support.ts` 的 `runNodeCliFace`。期望值全部手抄，不由被测函数现算。
 *
 * 阳性对照有四处：
 * 1. 整条 `guided` 子命令删掉第一条立刻红（只 `toContain` 查不出这种漂移，`gd` 的说明里
 *    就写着 "guided"），并且那条尺必须查不到一个不存在的名字；
 * 2. `declaredActions()` 在清单空或形状漂时直接抛，而不是返回一串 `undefined` 让循环假绿；
 * 3. **不给 `--paths` 也必须落到"缺那条缝"那句话说**——把它换成 `Missing required argument`
 *    就是把"这条缝不在"演成"你参数没给对"（`plugins/sleept` 那条刚被改掉的同类误导）；
 * 4. `--nope` 那一条：未声明的 flag 仍是用法错（拒绝≠放松解析），退出码 2 但**没有**那句
 *    缝的话，两条正负对照互相把对方钉住。
 *
 * @module xaihi-gifu/tests/cli
 */

import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { GIFU_PROCESS_SEAM_REFUSAL } from '../src/platform.ts'

/** 每个用例自己清一次退出码，否则一条用例的 `process.exitCode` 会脏到下一条。 */
afterEach(() => {
  process.exitCode = 0
})

function createHost(stdinChunks: readonly string[] = []): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    // 空数组 = 一条什么都不发的异步可迭代流，`isTTY` 留 undefined ⇒ 与"有管道进来"同一形状；
    // 想走 stdin 那条判据的用例自己给 chunks（`hasPipedInput` 只看 `!isTTY`）。
    stdin: Readable.from(stdinChunks) as unknown as CliHost['stdin'],
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

/** 逐字手抄自基线 `cli.ts:328-359` 的 `pipeArgs()`（`paths` 那条 positional 除外，见 cli.ts 文件头第 4 条）。 */
const UPSTREAM_FLAGS = [
  '--paths <value>', '--config <value>', '--listFile <value>', '--recursive', '--noRecursive',
  '--format <value>', '--outDir <value>', '--outMode <value>', '--namePrefix <value>',
  '--nameTemplate <value>', '--duration <value>', '--loop <value>', '--quality <value>',
  '--webpMethod <value>', '--ffmpegThreads <value>', '--webmCrf <value>', '--webmCpuUsed <value>',
  '--mp4Preset <value>', '--mp4Cq <value>', '--maxWorkers <value>', '--extractSingle',
  '--noExtractSingle', '--overwrite', '--dryRun', '--live', '--recordRun', '--databasePath <value>',
  '--json',
]

describe('gifu 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toHaveLength(3)

    // 只 `toContain(名字)` 会假绿：`gd` 那条腿的说明里就写着 "guided"，把子命令整条删掉
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

    // 三条动作的说明逐字对上游 `:229-231`。
    expect(help).toContain('Inspect archive image entries without writing files.')
    expect(help).toContain('Plan native output paths without writing files.')
    expect(help).toContain('Convert archives; use --live to write output files.')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('plan --help 给出上游那 28 条 flag 的名字与类型形状', async () => {
    const host = createHost()
    await runProgram(['plan', '--help'], host)
    expect(process.exitCode ?? 0).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage gifu plan')
    for (const flag of UPSTREAM_FLAGS) expect(help, `--help 里没有 ${flag}`).toContain(flag)
    // 上游那条 positional 换成了一条 string flag（本仓解析器没有 positional 这一档）。
    expect(help).not.toContain('[paths]')
  })

  it('非 TTY 且无参数时拒绝，并给出 gifu --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('gifu')
  })

  it('三条动作只拒绝不执行：executed=false，理由点名 ctx.subprocess 那条缝', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--paths', '/tmp/a.zip;/tmp/b.cbz', '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { action: string; paths: string[]; executed: boolean; refused: string }
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把没缝的动作演成成功').toBe(false)
      // 回显的是内核自己那份 parsePathList 拆出来的两条（`;` 是上游那条 positional 的拼法）。
      expect(report.paths).toEqual(['/tmp/a.zip', '/tmp/b.cbz'])
      expect(report.refused, '拒绝理由必须点名那条缝，否则使用者不知道缺什么').toContain('ctx.subprocess')
      expect(report.refused).toContain('dsh-subprocess-local')
      expect(report.refused).toBe(GIFU_PROCESS_SEAM_REFUSAL)
      process.exitCode = 0
    }
  })

  it('没给 --paths 也说的是"缺那条缝"，不是"你参数没给对"', async () => {
    const host = createHost()
    await runProgram(['plan', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, '未接的动作必须先说缝，不许报用法错').toBe(2)
    const report = JSON.parse(host.stdoutText()) as { paths: string[]; refused: string }
    expect(report.paths).toEqual([])
    expect(report.refused).toContain('ctx.subprocess')
    expect(`${host.stdoutText()}${host.stderrText()}`).not.toContain('Missing required argument')
  })

  it('--paths - 走上游那条 stdin 判据，回显拆好的路径', async () => {
    const host = createHost(['/tmp/from-stdin.zip\n# 注释行不算路径\n/tmp/second.cbz\n'])
    await runProgram(['inspect', '--paths', '-', '--json'], host)
    expect(process.exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { paths: string[] }
    expect(report.paths).toEqual(['/tmp/from-stdin.zip', '/tmp/second.cbz'])
  })

  it('kebab 写法仍然认（上游那些 --out-dir / --webp-method 别名的落点）', async () => {
    const host = createHost()
    await runProgram(['make', '--paths', '/tmp/a.zip', '--out-dir', '/tmp/out', '--webp-method', '4', '--no-recursive', '--json'], host)
    // 认得这些 flag 的证据就是"走到了缝的拒绝"，而不是 `Unknown option`。
    expect(process.exitCode).toBe(2)
    expect(host.stdoutText()).toContain('ctx.subprocess')
    expect(host.stderrText()).not.toContain('Unknown option')
  })

  it('未知 flag 判为用法错（退出码 2），而且不会被缝的话盖过去', async () => {
    const host = createHost()
    await runProgram(['plan', '--paths', '/tmp/a.zip', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
    expect(host.stdoutText()).not.toContain('ctx.subprocess')
  })

  it('交互腿 ui 与 gd/guided 正常进入（退出码 0），且**先于**任何参数校验', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 执行成功`).toBe(0)
      process.exitCode = 0
    }
  })
})
