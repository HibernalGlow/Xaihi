/**
 * nameu 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/nameu/src/cli.ts` 里 `runPipe`（`:6`）那一支）。
 *
 * 期望值全部手抄，不来自被测函数：`At least one artist folder or library root is required.`、
 * `NameU planned N item(s).`、`BookArtist.zip` / `Book.zip` 这些目标名、非 JSON 那三列
 * `status\tsourcePath\t->\ttargetName`（上游 `:6` 的 `writeLine`）、以及 **80 行**上限。
 *
 * 阳性对照：
 * 1. `rename` 不带 `--dry-run` **必须真改名**（上游无配置文件时就是这个语义），
 *    带 `--dry-run` 必须一个文件都不动——两条成对，缺一条另一条就没有意义。
 * 2. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-nameu/tests/cli
 */

import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { NameuResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('nameu CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 nameu ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('nameu ui')
  })

  it('--help 列出三个动作、run 别名与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage nameu')
    for (const verb of ['scan', 'plan', 'rename', 'run', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('plan --help 给出上游的 flag 名', async () => {
    const host = createHost()

    await runProgram(['plan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage nameu plan')
    for (const flag of ['--paths <value>', '--mode <value>', '--recursive', '--artist', '--folderNormalize', '--keepTime', '--dryRun', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('plan 只读：multi 模式按子目录出计划，一个文件都不改（阳性对照）', async () => {
    const fixture = await createLibrary('plan')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--mode', 'multi', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as NameuResult
    expect(result.success).toBe(true)
    expect(result.data?.readyCount).toBe(1)
    expect(result.data?.items[0]).toMatchObject({ sourceName: 'Book [cbr].zip', targetName: 'BookArtist.zip', artistName: 'Artist', status: 'ready' })
    expect(existsSync(fixture.book)).toBe(true)
    expect(existsSync(join(fixture.artist, 'BookArtist.zip'))).toBe(false)
  })

  it('非 JSON 时打结论 + 三列计划行（上游同款形状）', async () => {
    const fixture = await createLibrary('plain')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--mode', 'multi'], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('NameU planned 1 item(s).')
    expect(out).toContain(`ready\t${fixture.book}\t->\tBookArtist.zip`)
  })

  it('rename 不带 --dry-run 就真改名（上游无配置文件时的语义）', async () => {
    const fixture = await createLibrary('live')
    const host = createHost()

    await runProgram(['rename', '--paths', fixture.artist, '--mode', 'single', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as NameuResult
    expect(result.data?.renamedCount).toBe(1)
    expect(existsSync(fixture.book)).toBe(false)
    expect(existsSync(join(fixture.artist, 'BookArtist.zip'))).toBe(true)

    // 阳性对照：同一份夹具带上 --dry-run 就一个文件都不许动。
    const dry = await createLibrary('dry')
    const dryHost = createHost()
    await runProgram(['rename', '--paths', dry.artist, '--mode', 'single', '--dry-run', '--json'], dryHost)
    const dryResult = JSON.parse(dryHost.stdoutText()) as NameuResult
    expect(dryResult.data?.renamedCount).toBe(0)
    expect(existsSync(dry.book)).toBe(true)
  })

  it('run 是 rename 的同一条动作（上游 cli.ts:6 那个别名）', async () => {
    const fixture = await createLibrary('run-alias')
    const host = createHost()

    await runProgram(['run', '--paths', fixture.artist, '--mode', 'single', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as NameuResult
    expect(result.data?.action).toBe('rename')
    expect(result.data?.renamedCount).toBe(1)
  })

  it('--no-artist 不补画师名，--no-recursive 只走一层', async () => {
    const fixture = await createLibrary('flags')
    const host = createHost()
    await runProgram(['plan', '--paths', fixture.artist, '--mode', 'single', '--no-artist', '--json'], host)
    const result = JSON.parse(host.stdoutText()) as NameuResult
    expect(result.data?.items[0]).toMatchObject({ targetName: 'Book.zip', status: 'ready' })

    const nested = await createLibrary('nested')
    await mkdir(join(nested.artist, 'sub'))
    await writeFile(join(nested.artist, 'sub', 'Deep [cbr].zip'), 'deep', 'utf8')
    const shallowHost = createHost()
    await runProgram(['plan', '--paths', nested.artist, '--mode', 'single', '--no-recursive', '--json'], shallowHost)
    const shallow = JSON.parse(shallowHost.stdoutText()) as NameuResult
    expect(shallow.data?.items.map((item) => item.sourceName)).toEqual(['Book [cbr].zip'])
  })

  it('multi 与 single 的差别：multi 不碰根目录散落的归档', async () => {
    const fixture = await createLibrary('modes')
    const rootFile = join(fixture.root, 'Root.zip')
    await writeFile(rootFile, 'root', 'utf8')

    const multiHost = createHost()
    await runProgram(['plan', '--paths', fixture.root, '--mode', 'multi', '--json'], multiHost)
    const multi = JSON.parse(multiHost.stdoutText()) as NameuResult
    expect(multi.data?.items.map((item) => item.sourcePath)).toEqual([fixture.book])

    const singleHost = createHost()
    await runProgram(['plan', '--paths', fixture.root, '--mode', 'single', '--json'], singleHost)
    const single = JSON.parse(singleHost.stdoutText()) as NameuResult
    // 阳性对照：single 把根自己当画师目录，那条散落的归档就进了计划。
    expect(single.data?.items.some((item) => item.sourcePath === rootFile && item.artistName === basename(fixture.root))).toBe(true)
  })

  it('--paths - 从 stdin 取队列（上游 cli.ts:6 那条 "-" 兜底）', async () => {
    const fixture = await createLibrary('stdin')
    const host = createHost({ stdinText: `${fixture.artist}\n` })

    await runProgram(['plan', '--paths', '-', '--mode', 'single', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as NameuResult
    expect(result.data?.items.map((item) => item.sourcePath)).toEqual([fixture.book])
  })

  it('没给目录时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['plan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one artist folder or library root is required.')
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

/** `root/Artist/Book [cbr].zip`——画师目录与归档各一件，multi/single 两条腿都够走。 */
async function createLibrary (label: string): Promise<{ root: string; artist: string; book: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-nameu-cli-${label}-`))
  tempRoots.push(root)
  const artist = join(root, 'Artist')
  await mkdir(artist)
  const book = join(artist, 'Book [cbr].zip')
  await writeFile(book, 'book', 'utf8')
  return { root, artist, book }
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
