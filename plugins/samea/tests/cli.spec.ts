/**
 * samea 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/samea/src/cli.ts` 的 `runPipe` + 上游 `core.test.ts` 的常量）。
 *
 * 期望值全部手抄，不来自被测函数：`At least one archive root directory is required.`、
 * `SameA planned N archive transfer(s).`、`[00画师分类]` 这个集中目录名、
 * `below_min_occurrences` / `artist_not_detected` 这些 reason、以及非 JSON 那四列
 * `status\tartist\tsource -> target`（上游 `cli.ts:40`）——两边都写在文件里。
 *
 * 阳性对照：
 * 1. `plan` 与 `classify --no-dry-run` 成对：预演不许动文件（真搬了这条就红）。
 * 2. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-samea/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { SameaResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('samea CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 samea ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('samea ui')
  })

  it('--help 列出两个动作、run 别名与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage samea')
    for (const verb of ['plan', 'classify', 'run', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('plan --help 给出上游的 flag 名', async () => {
    const host = createHost()

    await runProgram(['plan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage samea plan')
    expect(help).toContain('--paths <value>')
    expect(help).toContain('--min <value>')
    expect(help).toContain('--centralize')
    expect(help).toContain('--ignorePathBlacklist')
  })

  it('plan 只读：ready 两条、一个文件都不搬（阳性对照）', async () => {
    const fixture = await createArchive('plan')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as SameaResult
    expect(result.success).toBe(true)
    expect(result.data?.readyCount).toBe(2)
    expect(result.data?.movedCount).toBe(0)
    expect(existsSync(fixture.one)).toBe(true)
    expect(existsSync(join(fixture.root, '[Artist]', '[Artist] one.zip'))).toBe(false)
  })

  it('非 JSON 时打结论 + 四列计划行（上游同款形状）', async () => {
    const fixture = await createArchive('plain')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('SameA planned 2 archive transfer(s).')
    expect(out).toContain('ready\t[Artist]\t')
    expect(out).toContain(`${fixture.one}\t->\t`)
  })

  it('classify --no-dry-run 才真搬；run 是同一条动作的别名', async () => {
    const fixture = await createArchive('live')
    const host = createHost()

    await runProgram(['classify', '--paths', fixture.root, '--no-dry-run', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as SameaResult
    expect(result.data?.movedCount).toBe(2)
    expect(existsSync(fixture.one)).toBe(false)
    expect(existsSync(join(fixture.root, '[Artist]', '[Artist] one.zip'))).toBe(true)

    const aliasFixture = await createArchive('run-alias')
    const aliasHost = createHost()
    await runProgram(['run', '--paths', aliasFixture.root, '--no-dry-run', '--json'], aliasHost)
    const alias = JSON.parse(aliasHost.stdoutText()) as SameaResult
    expect(alias.data?.movedCount).toBe(2)
  })

  it('--min 3 时画师目录不建，条目报 below_min_occurrences', async () => {
    const fixture = await createArchive('min')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--min', '3', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as SameaResult
    expect(result.data?.readyCount).toBe(0)
    expect(result.data?.items.map((item) => item.reason)).toEqual(['below_min_occurrences', 'below_min_occurrences'])
  })

  it('--centralize 把目标落在 [00画师分类] 下（名单只有一份：内核的默认路径黑名单）', async () => {
    const fixture = await createArchive('centralize')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--centralize', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as SameaResult
    expect(result.data?.items[0]?.targetPath).toBe(join(fixture.root, '[00画师分类]', '[Artist]', '[Artist] one.zip'))
  })

  it('没给根目录时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['plan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one archive root directory is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['plan', '--nope', 'x'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('交互腿正常进入（退出码 0），且**先于**任何参数校验', async () => {
    const host = createHost({ tty: true })

    await runProgram(['gd'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(0)
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
})

async function createArchive (label: string): Promise<{ root: string; one: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-samea-cli-${label}-`))
  tempRoots.push(root)
  const one = join(root, '[Artist] one.zip')
  await writeFile(one, 'one', 'utf8')
  await writeFile(join(root, '[Artist] two.zip'), 'two', 'utf8')
  return { root, one }
}

function createHost (options: { tty?: boolean } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: options.tty === true } as CliHost['stdin'],
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
