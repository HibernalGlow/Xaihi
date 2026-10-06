/**
 * linedup 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/linedup/src/cli.test.ts` 逐条抄过来），不是"我以为它做什么"。
 * 期望值全部手抄自上游用例与 `src/core.ts` 的既有测试，不由被测函数现算。
 *
 * 阳性对照在 `缺少源文本时拒绝` 那条：把 `runFilter` 里的 `!sourceText.trim()` 闸门删掉，
 * 这条就变红（空源文本会被当成"过滤成功，kept=0"）。
 *
 * @module xaihi-linedup/tests/cli
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { runProgram } from '../src/cli.ts'

const RUN_ROOT = resolve(import.meta.dirname, '../artifacts/test-runs/linedup-cli')
const cases = new Set<string>()

afterEach(async () => {
  for (const dir of cases) {
    await rm(dir, { recursive: true, force: true })
  }
  cases.clear()
  process.exitCode = 0
})

describe('linedup CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xlinedup ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xlinedup')
    expect(host.stderrText()).toContain('xlinedup ui')
  })

  it('内联文本过滤并输出 JSON（脚本化用法）', async () => {
    const host = createHost()

    await runProgram(['filter', '--source', 'alpha\\nbeta-one\\ngamma', '--filter', 'beta', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as {
      filteredLines: string[]
      removedLines: string[]
      keptCount: number
      removedCount: number
    }
    expect(result.filteredLines).toEqual(['alpha', 'gamma'])
    expect(result.removedLines).toEqual(['beta-one'])
    expect(result.keptCount).toBe(2)
    expect(result.removedCount).toBe(1)
  })

  it('读文件并写输出文件，kebab 与 camel 两种 flag 拼法都认', async () => {
    const fixture = await createFixture('file-output')
    const host = createHost()

    await runProgram([
      'filter',
      '--sourceFile',
      resolve(fixture, 'source.txt'),
      '--filter-file',
      resolve(fixture, 'filter.txt'),
      '--output-file',
      resolve(fixture, 'kept.txt'),
      '--preserve-order',
    ], host)

    expect(process.exitCode).toBe(0)
    expect(await readFile(resolve(fixture, 'kept.txt'), 'utf8')).toBe('gamma\nalpha\n')
    expect(host.stdoutText()).toContain('gamma\nalpha')
    expect(host.stdoutText()).toContain('kept=2 removed=2')
  })

  it('--help 列出子命令与 flag', async () => {
    const host = createHost()

    await runProgram(['filter', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xlinedup filter')
    expect(help).toContain('--sourceFile')
    expect(help).toContain('--caseInsensitive')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['filter', '--source', 'a', '--nope', 'b'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('缺少源文本时拒绝，而不是当成"过滤成功 0 行"（阳性对照）', async () => {
    const host = createHost()

    // stdin 是 TTY（见 createHost），所以不会有管道输入兜底。
    await runProgram(['filter', '--filter', 'beta'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stderrText()).toContain('Missing source content')
    expect(host.stdoutText()).toBe('')
  })
})

async function createFixture (name: string): Promise<string> {
  const dir = resolve(RUN_ROOT, `${name}-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'source.txt'), 'gamma\nbeta-one\nalpha\nbeta-two\n', 'utf8')
  await writeFile(resolve(dir, 'filter.txt'), 'beta\n', 'utf8')
  cases.add(dir)
  return dir
}

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
