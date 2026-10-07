/**
 * mvz 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/mvz/src/cli.ts` 里 `createProgram`（`:138-186`）、`commonArgs`（`:188-203`）、
 * `inputFromArgs`（`:205-225`）与 `writeMvzSummary`（`:253-288`）那几支）。
 *
 * 期望值全部手抄，不由被测函数现算：`7z x C:/packs/book.zip`、`7z d`、
 * `delete complete: 1 succeeded, 0 failed.`、`No archive entries found.`、`--entry` 的
 * 分号/逗号/换行拆法，以及 **50 行**那个截断上限（上游 `:38`）。
 *
 * 三条真源在别处，这里只核对得上：
 * - 动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * - "bin 里不起进程"来自 `src/platform.ts` 的 `createMvzPlanRuntime()` 与 `MVZ_PROCESS_SEAM_REFUSAL`；
 * - 退出码 2 与那句 `No interactive terminal detected.` 来自 `src/cli-support.ts` 的 `runNodeCliFace`。
 *
 * 阳性对照：
 * 1. 同一条命令**带 `--dryRun` 就出计划（rc 0）、不带就拒绝（rc 2）**，成对出现；
 * 2. `--help` 认的是子命令表那一行（只 `toContain('guided')` 会假绿：`gd` 的描述里就写着它）；
 * 3. `declaredActions()` 在清单空或形状漂时直接抛，而不是返回一串 `undefined` 让循环假绿；
 * 4. 未接的三条腿不许先报参数错。
 *
 * @module xaihi-mvz/tests/cli
 */

import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import type { MvzResult } from '../src/core.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { MVZ_PROCESS_SEAM_REFUSAL } from '../src/platform.ts'

const tempDirs: string[] = []

/** 每个用例自己清一次退出码，否则一条用例的 `process.exitCode` 会脏到下一条。 */
afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
  process.exitCode = 0
})

function createHost (options: { tty?: boolean; stdinText?: string } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: createStdin(options),
    stdout: {
      isTTY: options.tty === true,
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

/** 假 stdin：给了 stdinText 才是可异步迭代的管道，否则留给"非管道"那条判据。 */
function createStdin (options: { tty?: boolean; stdinText?: string }): CliHost['stdin'] {
  if (options.tty === true) return { isTTY: true } as unknown as CliHost['stdin']
  if (options.stdinText === undefined) return { isTTY: false } as unknown as CliHost['stdin']
  const chunks = options.stdinText.split(/(?<=\n)/)
  return {
    isTTY: false,
    [Symbol.asyncIterator] () {
      let index = 0
      return {
        async next () {
          if (index >= chunks.length) return { done: true as const, value: undefined }
          return { done: false as const, value: Buffer.from(chunks[index++] ?? '', 'utf8') }
        },
      }
    },
  } as unknown as CliHost['stdin']
}

/**
 * 动作名单的唯一真源。形状不对就直接抛，不是返回一串 `undefined` 继续往下走：
 * 抄来的老写法把不存在的字段 `String()` 成 `undefined`，于是"至少 1 条"的下界照样成立。
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

/** `--help` 的子命令表那一行：两个空格 + 名字 + 空白（只 toContain 会假绿）。 */
const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')

describe('mvz 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThan(0)
    for (const action of actions) {
      expect(row(action).test(help), `--help 的子命令表里没有动作 ${action}（清单与终端面漂了）`).toBe(true)
    }
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)

    // flag 名单逐条对上游 commonArgs（`:188-203`）。
    const flagHost = createHost()
    await runProgram(['extract', '--help'], flagHost)
    for (const flag of ['--entry <value>', '--entries <value>', '--file <value>', '--output <value>',
      '--pattern <value>', '--replacement <value>', '--separator <value>', '--near', '--autoDir',
      '--flatten', '--dryRun', '--json']) {
      expect(flagHost.stdoutText(), `extract --help 里没有 ${flag}`).toContain(flag)
    }
  })

  it('非 TTY 且无参数时拒绝，并给出 mvz 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('mvz')
  })

  it('预演那条腿是真跑的：出计划、rc 0、一个进程都不起', async () => {
    const host = createHost()
    await runProgram([
      'extract', '--entry', 'C:/packs/book.zip//page/001.jpg', '--near', '--autoDir', '--dryRun', '--json',
    ], host)
    expect(process.exitCode ?? 0).toBe(0)

    const result = JSON.parse(host.stdoutText()) as MvzResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('extract complete: 1 succeeded, 0 failed.')
    expect(result.data?.preview[0]?.command).toContain('7z x C:/packs/book.zip')
    expect(result.data?.preview[0]?.output).toBe('C:/packs/book')
    expect(host.stdoutText()).not.toContain('refused')
  })

  it('不带 --dryRun 就是拒绝：executed=false，理由点名 ctx.subprocess（退出码 2）', async () => {
    // 每条动作都带上 rename 用得上的那两个 flag，否则"阳性对照那一半"会因为
    // 内核自己的 `Rename pattern is required.`（core.ts:115）而失败，与形状无关。
    const extra = ['--pattern', 'page/', '--replacement', 'images/']
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--entry', 'C:/packs/book.zip//page/001.jpg', ...extra, '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)

      const report = JSON.parse(host.stdoutText()) as {
        node: string; action: string; entryCount: number; archives: number; executed: boolean; refused: string
      }
      expect(report.node).toBe('mvz')
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把 7-Zip 演成成功').toBe(false)
      expect(report.entryCount).toBe(1)
      expect(report.archives).toBe(1)
      expect(report.refused, '拒绝理由必须点名宿主侧那条服务，否则使用者不知道缺什么').toContain('ctx.subprocess')
      // 拒绝那句同时上 stderr，且 stdout 仍是干净 JSON（不混流）。
      expect(host.stderrText()).toContain(MVZ_PROCESS_SEAM_REFUSAL)
      process.exitCode = 0

      // 阳性对照：同一份输入带上 --dryRun 就出计划（rc 0），两条形成本对。
      const dryHost = createHost()
      await runProgram([action, '--entry', 'C:/packs/book.zip//page/001.jpg', ...extra, '--dryRun', '--json'], dryHost)
      expect(process.exitCode, `${action} --dryRun 出计划却给了非 0`).toBe(0)
      process.exitCode = 0
    }
  })

  it('--dryRun=false 也算"要执行"：照样拒绝，不把显式假当成缺省', async () => {
    const host = createHost()
    await runProgram(['delete', '--entry', 'a.zip//x.txt', '--dryRun=false', '--json'], host)
    expect(process.exitCode).toBe(2)
    expect(JSON.parse(host.stdoutText()).executed).toBe(false)
  })

  it('非 JSON 的预演出 Summary 面板与预览行（上游 writeMvzSummary 那三段）', async () => {
    const host = createHost()
    await runProgram([
      'delete', '--entries', 'a.zip//x.txt;b.zip//y.txt', '--dryRun',
    ], host)
    expect(process.exitCode ?? 0).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('delete complete: 2 succeeded, 0 failed.')
    expect(out).toContain('archives: 2  files: 2')
    expect(out).toContain('success: 2  failed: 0')
    expect(out).toContain('待执行命令预览：')
    expect(out).toContain('7z d a.zip')
    expect(out).toContain('7z d b.zip')
  })

  it('move 的预演是 extract + delete 两条，命令行里带 &&（上游 :48-60 那条形状）', async () => {
    const host = createHost()
    await runProgram(['move', '--entry', 'C:/packs/book.zip//page/001.jpg', '--output', 'D:/out', '--dryRun', '--json'], host)
    expect(process.exitCode ?? 0).toBe(0)
    const result = JSON.parse(host.stdoutText()) as MvzResult
    expect(result.data?.preview.map((item) => item.action)).toEqual(['extract', 'delete'])
    expect(result.data?.results[0]?.command).toContain('&&')
  })

  it('rename 的预演给出成对的 old -> next（上游 :79-90）', async () => {
    const host = createHost()
    await runProgram([
      'rename', '--entry', 'C:/packs/book.zip//page/001.jpg',
      '--pattern', '^page/', '--replacement', 'images/', '--dryRun', '--json',
    ], host)
    const result = JSON.parse(host.stdoutText()) as MvzResult
    expect(result.data?.preview[0]?.renames).toEqual([{ old: 'page/001.jpg', next: 'images/001.jpg' }])
  })

  it('--entries - 与"没给条目且 stdin 是管道"都读 stdin（上游 inputFromArgs :208）', async () => {
    const explicit = createHost({ stdinText: 'C:/packs/a.zip//one.txt\nC:/packs/b.zip//two.txt\n' })
    await runProgram(['delete', '--entries', '-', '--dryRun', '--json'], explicit)
    expect(process.exitCode ?? 0).toBe(0)
    let result = JSON.parse(explicit.stdoutText()) as MvzResult
    expect(result.data?.totalArchives).toBe(2)
    expect(result.data?.totalFiles).toBe(2)

    process.exitCode = 0
    const implicit = createHost({ stdinText: 'C:/packs/a.zip//one.txt\n' })
    await runProgram(['delete', '--dryRun', '--json'], implicit)
    result = JSON.parse(implicit.stdoutText()) as MvzResult
    expect(result.data?.totalFiles).toBe(1)
  })

  it('--file 的内容当 fileText 交给内核（上游 :206 那一格，读的是 node:fs）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xaihi-mvz-cli-'))
    tempDirs.push(dir)
    const list = join(dir, 'entries.txt')
    await writeFile(list, 'C:/packs/book.zip//page/001.jpg\nC:/packs/book.zip//page/002.jpg\n', 'utf8')

    const host = createHost()
    await runProgram(['delete', '--file', list, '--dryRun', '--json'], host)
    const result = JSON.parse(host.stdoutText()) as MvzResult
    expect(result.data?.totalFiles).toBe(2)
    expect(result.data?.totalArchives).toBe(1)
  })

  it('一条条目都没有时是内核那句话，退出码 1（上游 :244、:250 的失败形状）', async () => {
    const host = createHost()
    await runProgram(['delete', '--entry', '这不是条目', '--dryRun', '--json'], host)
    expect(process.exitCode).toBe(1)
    const result = JSON.parse(host.stdoutText()) as MvzResult
    expect(result.message).toBe('No archive entries found.')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['delete', '--entry', 'a.zip//x.txt', '--dryRun', '--nope', 'b'], host)
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
      // 未接的功能先报"缺参"会把"这块没搬"说成"你参数没给对"。
      expect(host.stderrText()).not.toMatch(/Unknown option|requires a value|Missing required/)
      process.exitCode = 0
    }
  })
})
