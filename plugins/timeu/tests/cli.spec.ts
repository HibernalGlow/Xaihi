/**
 * timeu 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/timeu/src/cli.ts` + 上游 `core.test.ts` 的常量），不是"我以为它做什么"。
 *
 * 期望值全部手抄：`At least one file or directory path is required.`、
 * `backupCount=1` / `restoredCount=1`、记录文件名 `timeu-timestamps.json`、
 * 以及 `--json` 输出整个 `TimeuResult` 这一条，都来自上游文件或
 * `node-definitions/timeu.json`；没有一条是把被测函数跑一遍再抄回来的。
 *
 * 阳性对照有两处：
 * 1. `--no-dry-run` 那一对（真动作 vs 预演）：删掉内核的 dryRun 判据，"预演不写字"就红。
 * 2. 未接腿那条：既是拒绝形状的正控（未接分支被改成执行 ⇒ 红），也是 sleept 刚修过的
 *    bug 的尺（未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-timeu/tests/cli
 */

import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { runProgram, program, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { TimeuResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('timeu CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xtimeu ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xtimeu ui')
  })

  it('--help 列出三个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xtimeu')
    for (const verb of ['scan', 'backup', 'restore', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    // 未接的腿在帮助里就写着"未接"，不许让人读成"能跑，只是我没用对"。
    expect(help).toContain('未接')
  })

  it('scan --help 给出上游的 flag 名', async () => {
    const host = createHost()

    await runProgram(['scan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xtimeu scan')
    expect(help).toContain('--record <value>')
    expect(help).toContain('--paths <value>')
    expect(help).toContain('--includeDirectories')
    expect(help).toContain('--recursive')
  })

  it('scan 只读：给出计划，记录文件一个字都不写（阳性对照）', async () => {
    const fixture = await createFixture('scan')
    const host = createHost()

    await runProgram(['scan', '--paths', `${join(fixture.dir, 'a.txt')}\\n${join(fixture.dir, 'b.txt')}`, '--record', fixture.record, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as TimeuResult
    expect(result.success).toBe(true)
    expect(result.data?.scannedCount).toBe(2)
    expect(existsSync(fixture.record)).toBe(false)
  })

  it('backup 不带 --no-dry-run 时仍是预演（上游同款默认）', async () => {
    const fixture = await createFixture('backup-dry')
    const host = createHost()

    await runProgram(['backup', '--paths', join(fixture.dir, 'a.txt'), '--record', fixture.record, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as TimeuResult
    expect(result.data?.backupCount).toBe(0)
    expect(existsSync(fixture.record)).toBe(false)
  })

  it('backup --no-dry-run 写记录文件，restore --no-dry-run 把 mtime 写回去', async () => {
    const fixture = await createFixture('live')
    await utimes(fixture.a, new Date(111000), new Date(222000))

    const backupHost = createHost()
    await runProgram(['backup', '--paths', fixture.a, '--record', fixture.record, '--no-dry-run', '--json'], backupHost)
    expect(backupHost.stdoutText()).not.toContain('undefined')
    const backed = JSON.parse(backupHost.stdoutText()) as TimeuResult
    expect(backed.data?.backupCount).toBe(1)
    expect(JSON.parse(await readFile(fixture.record, 'utf8'))[0]).toMatchObject({ path: fixture.a, atimeMs: 111000, mtimeMs: 222000 })

    await utimes(fixture.a, new Date(999000), new Date(888000))

    const restoreHost = createHost()
    await runProgram(['restore', '--paths', fixture.a, '--record', fixture.record, '--no-dry-run', '--json'], restoreHost)
    const restored = JSON.parse(restoreHost.stdoutText()) as TimeuResult
    expect(restored.data?.restoredCount).toBe(1)
    expect(Math.round(statSync(fixture.a).mtimeMs)).toBe(222000)
    expect(Math.round(statSync(fixture.a).atimeMs)).toBe(111000)
  })

  it('没给路径时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['scan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one file or directory path is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('--paths - 从 stdin 读队列（上游的 `-` 写法）', async () => {
    const fixture = await createFixture('stdin')
    const host = createHost({ stdinLines: [fixture.a, fixture.b] })

    await runProgram(['scan', '--paths', '-', '--record', fixture.record, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as TimeuResult
    expect(result.data?.scannedCount).toBe(2)
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['scan', '--paths', 'a', '--nope', 'b'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('未接的交互腿响亮拒绝并点名缺的东西，且不许先做参数校验（sleept 那个 bug 的尺）', async () => {
    const host = createHost({ tty: true })

    await runProgram(['gd'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('@clack')
    expect(host.stderrText()).toContain('OpenTUI')
    expect(host.stderrText()).not.toContain('Missing required argument')

    // 结构尺：三条未接腿一个参数都不许标 required。
    // 阳性对照：给 `ui` 加一条 `required: true`，这条立刻红。
    expect(UNWIRED_INTERACTIVE_LEGS).toEqual(['ui', 'gd', 'guided'])
    const subs = program.subCommands ?? {}
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const specs = Object.values(subs[leg]?.args ?? {})
      expect(specs.every((spec) => spec.required !== true)).toBe(true)
    }
  })

  it('非 JSON 时先打内核说的话，再打结论行（上游同款顺序）', async () => {
    const fixture = await createFixture('plain')
    const host = createHost()

    await runProgram(['scan', '--paths', fixture.a, '--record', fixture.record], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Collecting timestamp targets.')
    expect(out).toContain('TimeU planned 1 item(s).')
    expect(out.indexOf('Collecting timestamp targets.')).toBeLessThan(out.indexOf('TimeU planned 1 item(s).'))
  })
})

async function createFixture (label: string): Promise<{ dir: string; a: string; b: string; record: string }> {
  const dir = await mkdtemp(join(tmpdir(), `xaihi-timeu-cli-${label}-`))
  tempRoots.push(dir)
  const a = join(dir, 'a.txt')
  const b = join(dir, 'b.txt')
  await writeFile(a, 'a', 'utf8')
  await writeFile(b, 'b', 'utf8')
  await mkdir(join(dir, 'sub'))
  return { dir, a, b, record: join(dir, 'timeu-timestamps.json') }
}

function createHost (options: { tty?: boolean; stdinLines?: string[] } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  const stdin = options.stdinLines === undefined
    ? ({ isTTY: options.tty === true } as unknown as CliHost['stdin'])
    : ({
        isTTY: false,
        [Symbol.asyncIterator]: async function * iterate (): AsyncGenerator<Buffer> {
          yield Buffer.from(`${options.stdinLines?.join('\n') ?? ''}\n`)
        },
      } as unknown as CliHost['stdin'])
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin,
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
