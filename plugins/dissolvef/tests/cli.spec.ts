/**
 * dissolvef 终端面的验收：前两条是上游 `packages/nodes/dissolvef/src/cli.test.ts`
 * （tag `noxide`）逐条搬来的用例，第三条是本仓**多加的那道闸门**的阳性对照。
 *
 * 期望值不来自被测函数：结构断言（`nestedCount=1`、`successCount=2`、撤销后文件回到
 * `outer/inner/leaf/page.txt`）抄自上游 CLI 用例与本包 `tests/core.spec.ts`
 * 的 "executes nested dissolve and undo"，两边都是手写的常量。
 *
 * @module xaihi-dissolvef/tests/cli
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DissolvefResult } from '../src/core.ts'
import type { CliHost } from '../src/cli-support.ts'
import { runProgram } from '../src/cli.ts'

const cases = new Set<string>()

afterEach(async () => {
  for (const dir of cases) {
    await rm(dir, { recursive: true, force: true })
  }
  cases.clear()
  process.exitCode = 0
})

describe('dissolvef CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 dissolvef ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('dissolvef')
    expect(host.stderrText()).toContain('dissolvef ui')
  })

  it('真跑 nested 解散与撤销，纯 JSON 输出（上游同款用例）', async () => {
    const fixture = await createNestedFixture()
    const runHost = createHost()

    await runProgram([
      'nested',
      '--path',
      fixture.folder,
      '--historyPath',
      fixture.historyPath,
      '--similarityThreshold',
      '0',
      '--json',
    ], runHost)

    expect(process.exitCode).toBe(0)
    expect(runHost.stdoutText().trim().startsWith('{')).toBe(true)
    expect(runHost.stderrText()).toBe('')
    const result = JSON.parse(runHost.stdoutText()) as DissolvefResult
    expect(result.success).toBe(true)
    expect(result.data?.nestedCount).toBe(1)
    expect(result.data?.successCount).toBe(2)
    expect(existsSync(join(fixture.folder, 'page.txt'))).toBe(true)
    expect(existsSync(join(fixture.folder, 'inner'))).toBe(false)

    const undoHost = createHost()
    await runProgram(['undo', '--historyPath', fixture.historyPath, '--json'], undoHost)

    const undo = JSON.parse(undoHost.stdoutText()) as DissolvefResult
    expect(undo.success).toBe(true)
    expect(undo.data?.successCount).toBe(2)
    expect(existsSync(fixture.deepFile)).toBe(true)
  })

  it('没有 --historyPath 时拒绝动文件（阳性对照：删掉闸门这条就红）', async () => {
    const fixture = await createNestedFixture()
    const host = createHost()

    await runProgram(['nested', '--path', fixture.folder, '--similarityThreshold', '0', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('拒绝执行')
    expect(host.stdoutText()).toBe('')
    // 文件一格没动：内核 `executePlan` 是"先搬完再记账"，没有闸门就是搬完了才失败。
    expect(existsSync(fixture.deepFile)).toBe(true)
    expect(existsSync(join(fixture.folder, 'inner'))).toBe(true)
    expect(existsSync(fixture.historyPath)).toBe(false)
  })

  it('plan 只读：给出待执行计划，不写盘也不写历史', async () => {
    const fixture = await createNestedFixture()
    const host = createHost()

    await runProgram(['plan', '--path', fixture.folder, '--similarityThreshold', '0', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as DissolvefResult
    expect(result.success).toBe(true)
    expect(result.data?.plan.length).toBe(2)
    expect(existsSync(fixture.deepFile)).toBe(true)
    expect(existsSync(fixture.historyPath)).toBe(false)
  })

  it('路径不存在时判失败（退出码 1），错误写在 result 里', async () => {
    const fixture = await createNestedFixture()
    const host = createHost()

    await runProgram(['plan', '--path', join(fixture.root, 'nope'), '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    const result = JSON.parse(host.stdoutText()) as DissolvefResult
    expect(result.success).toBe(false)
    expect(result.message).toContain('Path does not exist')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['plan', '--nope', 'x'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('--help 列出十个子命令', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    for (const verb of ['plan', 'dissolve', 'nested', 'media', 'archive', 'direct', 'collect-archives', 'history', 'undo', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('Usage dissolvef')
  })
})

async function createNestedFixture (): Promise<{ root: string; folder: string; deepFile: string; historyPath: string }> {
  const root = await mkdtempCase()
  const folder = join(root, 'outer')
  const deepest = join(folder, 'inner', 'leaf')
  const deepFile = join(deepest, 'page.txt')
  const historyPath = join(root, 'history.json')
  await mkdir(deepest, { recursive: true })
  await writeFile(deepFile, 'hello', 'utf8')
  return { root, folder, deepFile, historyPath }
}

async function mkdtempCase (): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const root = await mkdtemp(join(tmpdir(), `xaihi-dissolvef-cli-${randomUUID()}-`))
  cases.add(root)
  return root
}

function createHost (): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: false } as CliHost['stdin'],
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
