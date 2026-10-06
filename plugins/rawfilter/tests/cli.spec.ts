/**
 * rawfilter 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/rawfilter/src/cli.ts` 的 `createProgram` + `runAction` + `writePlanSummary`）。
 *
 * 期望值全部手抄，不来自被测函数：`Path is required.`、`Plan generated: N operation(s).`、
 * `Rawfilter completed: 1 trash, 1 multi, 0 shortcut(s), 0 error(s).`（上游 `core.ts:347`
 * 的模板）、汇总面板那三行的标签与两个空格分隔（上游 `:391-395`）、
 * `trash` / `multi/<组名>` / `<主名>.url` 这三条落点（上游 `core.ts:381-382`）。
 *
 * 阳性对照：
 * 1. `execute` 与 `execute --dryRun` 成对：预演不许动文件（真搬了这条就红）。
 * 2. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-rawfilter/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { RawfilterResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('rawfilter CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xrawfilter ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xrawfilter ui')
  })

  it('--help 列出三个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xrawfilter')
    for (const verb of ['scan', 'plan', 'execute', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('plan --help 给出上游的 flag 名（含 nameOnly 与 nameOnlyMode 那对别名）', async () => {
    const host = createHost()

    await runProgram(['plan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xrawfilter plan')
    for (const flag of ['--path <value>', '--nameOnly', '--nameOnlyMode', '--createShortcuts', '--trashOnly', '--minSimilarity <value>', '--dryRun', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('plan 只读：出两条操作，一个文件都不搬（阳性对照）', async () => {
    const root = await tempRoot('plan')
    const host = createHost()

    await runProgram(['plan', '--path', root, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as RawfilterResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Plan generated: 2 operation(s).')
    expect(result.data).toMatchObject({ archiveCount: 3, totalGroups: 1, duplicateGroups: 1, keptCount: 1, movedToTrash: 0, movedToMulti: 0 })
    expect((await readdir(root)).sort()).toEqual(['Game RAW.rar', 'Game [Chinese].zip', 'Game [English].zip'])
  })

  it('非 JSON 时打进度 + 汇总面板 + 计划行（上游同款形状）', async () => {
    const root = await tempRoot('plain')
    const host = createHost()

    await runProgram(['plan', '--path', root], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Scanning archive files.')
    expect(out).toContain('Plan generated: 2 operation(s).')
    expect(out).toContain('archives: 3  groups: 1  duplicate: 1')
    expect(out).toContain('kept: 1  trash: 0  multi: 0  shortcut: 0')
    expect(out).toContain('errors: 0  skipped: 0')
    expect(out).toContain('pending')
    expect(out).toContain('multi')
  })

  it('execute 不带 --dryRun 就真搬（内核默认 false），带上就一个文件都不动', async () => {
    const root = await tempRoot('live')
    const host = createHost()

    await runProgram(['execute', '--path', root, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as RawfilterResult
    expect(result.message).toBe('Rawfilter completed: 1 trash, 1 multi, 0 shortcut(s), 0 error(s).')
    expect(result.data).toMatchObject({ movedToTrash: 1, movedToMulti: 1, errorCount: 0 })
    expect(existsSync(join(root, 'trash', 'Game RAW.rar'))).toBe(true)
    expect(existsSync(join(root, 'multi', 'game', 'Game [English].zip'))).toBe(true)
    expect(existsSync(join(root, 'Game [English].zip'))).toBe(false)
    // 保留者优先，所以那条 [Chinese] 还在原位。
    expect(existsSync(join(root, 'Game [Chinese].zip'))).toBe(true)

    // 阳性对照：同一份夹具带上 --dryRun 就一个文件都不许动。
    const dry = await tempRoot('dry')
    const dryHost = createHost()
    await runProgram(['execute', '--path', dry, '--dryRun', '--json'], dryHost)
    const dryResult = JSON.parse(dryHost.stdoutText()) as RawfilterResult
    expect(dryResult.data).toMatchObject({ movedToTrash: 0, movedToMulti: 0, createdShortcuts: 0 })
    expect(await readdir(dry)).toHaveLength(3)
  })

  it('--trashOnly 把多出来的翻译版也丢进 trash（core.ts:365）', async () => {
    const root = await tempRoot('trash-only')
    const host = createHost()

    await runProgram(['execute', '--path', root, '--trashOnly', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as RawfilterResult
    expect(result.data).toMatchObject({ movedToTrash: 2, movedToMulti: 0 })
    expect((await readdir(join(root, 'trash'))).sort()).toEqual(['Game RAW.rar', 'Game [English].zip'])
  })

  it('--createShortcuts 给多出来的翻译版出 .url，源文件留在原地', async () => {
    const root = await tempRoot('shortcuts')
    const host = createHost()

    await runProgram(['execute', '--path', root, '--createShortcuts', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as RawfilterResult
    expect(result.data).toMatchObject({ createdShortcuts: 1, movedToMulti: 0 })
    expect((await readdir(join(root, 'multi', 'game'))).sort()).toEqual(['Game [English].url'])
    expect(existsSync(join(root, 'Game [English].zip'))).toBe(true)
  })

  it('--minSimilarity 0 把所有名字并成一组，缺省时 0.82 分成两组（core.ts:407-414）', async () => {
    const root = await tempRoot('threshold')
    await writeFile(join(root, 'A Book [Chinese].zip'), 'a', 'utf8')
    await writeFile(join(root, 'B Other [Chinese].zip'), 'b', 'utf8')
    await rm(join(root, 'Game [Chinese].zip'))
    await rm(join(root, 'Game [English].zip'))
    await rm(join(root, 'Game RAW.rar'))

    const loose = createHost()
    await runProgram(['plan', '--path', root, '--minSimilarity', '0', '--json'], loose)
    expect((JSON.parse(loose.stdoutText()) as RawfilterResult).data?.totalGroups).toBe(1)

    const strict = createHost()
    await runProgram(['plan', '--path', root, '--json'], strict)
    // 阳性对照：Dice('a book','b other') = 0 < 0.82 ⇒ 两条各自成组。
    expect((JSON.parse(strict.stdoutText()) as RawfilterResult).data?.totalGroups).toBe(2)
  })

  it('--minSimilarity 给了非数字时不炸，落回内核默认 0.82（cli.ts 的 numberArg）', async () => {
    const root = await tempRoot('bad-number')
    const host = createHost()

    await runProgram(['plan', '--path', root, '--minSimilarity', 'abc', '--json'], host)

    expect(process.exitCode).toBe(0)
    expect((JSON.parse(host.stdoutText()) as RawfilterResult).data?.totalGroups).toBe(1)
  })

  it('--path - 取 stdin 的第一行当目录（上游 cli.ts:211-215）', async () => {
    const root = await tempRoot('stdin')
    const host = createHost({ stdinText: `${root}\n` })

    await runProgram(['plan', '--path', '-', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as RawfilterResult
    expect(result.success).toBe(true)
    expect(result.data?.archiveCount).toBe(3)
  })

  it('没给目录时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['plan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('Path is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('目录不存在时退出码 1 并打印红色那句（上游 :249 的失败形状）', async () => {
    const host = createHost()

    await runProgram(['plan', '--path', '/definitely/not/here', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('Path does not exist: /definitely/not/here')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['plan', '--nope', 'x'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('未接的交互腿响亮拒绝、点名剪贴板那条要 ctx.subprocess，且不许先做参数校验', async () => {
    const host = createHost({ tty: true })

    await runProgram(['gd'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('@clack')
    expect(host.stderrText()).toContain('OpenTUI')
    expect(host.stderrText()).toContain('ctx.subprocess')
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

/** 三件同组归档：一件翻译版（保留者）、一件多出来的翻译版（multi/shortcut）、一件 raw（trash）。 */
async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-rawfilter-cli-${label}-`))
  tempRoots.push(root)
  await writeFile(join(root, 'Game [Chinese].zip'), 'chinese', 'utf8')
  await writeFile(join(root, 'Game [English].zip'), 'english', 'utf8')
  await writeFile(join(root, 'Game RAW.rar'), 'raw', 'utf8')
  return root
}

/** 假 stdin：给了 stdinText 才是可异步迭代的管道，否则留给"非管道"那条判据。 */
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
