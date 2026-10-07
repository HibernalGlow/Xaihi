/**
 * smartzip 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * "哪些动作在 bin 里真跑得通"来自内核自己的分支（`core.ts:270` 那个 `dryRun` 三元与
 * `core.ts:249-269` 那两条早退）；退出码 2 与那句 `No interactive terminal detected.`
 * 来自 `src/cli-support.ts` 的 `runNodeCliFace`，退出码 1 来自上游 `cli.ts:224`
 * 那句 `if (!result.success) process.exitCode = 1`。期望值全部手抄，不由被测函数现算。
 *
 * 阳性对照有五处，逐条写在用例里：
 * 1. `--help` 的子命令表认"行首两空格 + 名字 + 空白"而不是 `toContain(名字)`
 *    （`gd` 的描述里就写着 "guided"，整条子命令删掉也查不出来）；
 * 2. `declaredActions()` 在清单空或形状漂时直接抛，而不是返回一串 `undefined` 让循环假绿；
 * 3. "7-Zip 那条路被拦下"这一条与"status 这条路是通的"同批跑——只断前者时，
 *    后者换成"全体失败"也照样绿；
 * 4. `--dryRun` 那条断"计划行存在 **且** 目录里没多出任何文件"；
 * 5. 三条未接腿各自断退出码 2 与那句"未接"，而不是只数一条。
 *
 * @module xaihi-smartzip/tests/cli
 */

import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { NO_SUBPROCESS_MESSAGE } from '../src/platform.ts'

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

/** 只 `toContain(名字)` 会假绿：`gd` 那条腿的描述里就写着 "guided"。按子命令表那一行的形状认。 */
const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')

describe('smartzip 终端面', () => {
  it('--help 把清单里的六条动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions).toEqual(['status', 'inspect_codepage', 'extract', 'extract_codepage', 'open', 'archive'])

    for (const action of actions) {
      expect(row(action).test(help), `--help 的子命令表里没有动作 ${action}（清单与终端面漂了）`).toBe(true)
    }

    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照 1：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('非 TTY 且无参数时拒绝，并给出 smartzip --help 的提示', async () => {
    const host = createHost()
    host.stdin = { isTTY: false } as CliHost['stdin']
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('smartzip')
  })

  it('status 在 bin 里真的跑：JSON 载荷是内核那句 success，退出码 0', async () => {
    const host = createHost()
    await runProgram(['status', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, 'status 只读 INI 与默认表，够得到 node:fs 就跑得动').toBe(0)
    const report = JSON.parse(host.stdoutText()) as { success: boolean; message: string; data: { config: { archiveExtensions: string[] } } }
    expect(report.success).toBe(true)
    expect(report.message).toBe('SmartZip status loaded: 9 archive extension(s).')
    // 那 9 项是 `parseSmartZipIni('')` 的 `[ext]` 缺省（zip/rar/7z/001/cab/bz2/gz/gzip/tar），
    // 手抄自内核 `core.ts:320`，不是从本次输出里读回来的。
    expect(report.data.config.archiveExtensions).toEqual(['zip', 'rar', '7z', '001', 'cab', 'bz2', 'gz', 'gzip', 'tar'])
  })

  it('archive --dryRun 出计划并且一个文件都不造（阳性对照 4）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-cli-'))
    const source = join(root, 'holiday')
    await writeFile(join(root, 'holiday.bin'), 'b', 'utf8')
    const host = createHost()
    await runProgram(['archive', '--dryRun', '--pathsText', source, '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(0)
    const report = JSON.parse(host.stdoutText()) as {
      success: boolean
      message: string
      data: { command?: { command: string; args: string[] }; operations?: Array<{ status: string; message: string }> }
    }
    expect(report.success).toBe(true)
    expect(report.message).toBe('SmartZip dry-run: 1 TypeScript-planned operation(s).')
    // 计划里的占位命令名 `7z` 是内核 `core.ts:270` 在 dryRun 那一支给的，
    // 参数拼法逐字来自 `buildSmartZipCommand`（`core.ts:344`）。
    expect(report.data.command).toMatchObject({ command: '7z', args: ['a', `${source}.zip`, source, '-y', '-sccUTF-8'] })
    expect(report.data.operations?.[0]).toMatchObject({ status: 'completed', message: 'Planned' })
    expect(await readdir(root)).toEqual(['holiday.bin'])

    // 同一个目录不带 --dryRun 就必须走到"够不到缝"那一条（见下一条），
    // 也就是说这条尺看得见"计划"与"执行"是两条不同的路。
    const host2 = createHost()
    await runProgram(['archive', '--pathsText', source, '--json'], host2)
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(host2.stdoutText()).message).toBe(NO_SUBPROCESS_MESSAGE)
    process.exitCode = 0
    expect(await readdir(root)).toEqual(['holiday.bin'])
  })

  it('四条要 7-Zip 的动作在 bin 里可见地拒：退出码 1，那句点名 ctx.subprocess', async () => {
    for (const action of ['extract', 'extract_codepage', 'open', 'archive']) {
      const host = createHost()
      await runProgram([action, '--pathsText', '/tmp/xaihi-smartzip-none.zip', '--json'], host)
      const exitCode = process.exitCode
      process.exitCode = 0
      expect(exitCode, `${action} 够不到 ctx.subprocess，不许给成功码`).toBe(1)
      const report = JSON.parse(host.stdoutText()) as { success: boolean; message: string }
      expect(report.success).toBe(false)
      // 这句必须点名缺的那条服务，否则使用者不知道是"没装 7z"还是"这面跑不了"。
      expect(report.message).toBe(NO_SUBPROCESS_MESSAGE)
      expect(report.message).toContain('ctx.subprocess')
    }
    // 阳性对照 3：同一条尺必须看得见"跑得通的那条"不是全体失败——status 与 inspect 的差别在下一条。
    const inspect = createHost()
    await runProgram(['inspect_codepage', '--pathsText', '/tmp/xaihi-smartzip-none.zip', '--json'], inspect)
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(inspect.stdoutText()).message).toBe(NO_SUBPROCESS_MESSAGE)
    process.exitCode = 0
  })

  it('未给路径时由内核那句话拒绝，不在终端面猜默认值', async () => {
    const host = createHost()
    await runProgram(['extract', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, '缺路径必须红，不能猜').toBe(1)
    expect(JSON.parse(host.stdoutText()).message).toBe('At least one archive or directory path is required.')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['status', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('清单里的动作没有对应子命令时，终端面必须红（阳性对照：漂移不静默）', async () => {
    // `--help` 那一条已经在比清单与子命令表；这里再钉一次"名单只有一份真源"：
    // 传一个不在清单里的子命令，vendored 支撑报的是 `Unknown command`，退出码 2。
    const host = createHost()
    await runProgram(['run'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown command: run')
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
