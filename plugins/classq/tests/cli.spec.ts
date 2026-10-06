/**
 * classq 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/classq/src/cli.ts` 的 `runPipe` + 上游 `core.test.ts` 的常量）。
 *
 * 期望值全部手抄，不来自被测函数：`At least one root directory is required.`、
 * `ClassQ planned N item(s).`、`ClassQ applied N transfer(s).`、`wait` 这个默认目录名、
 * `already` 这个默认关键词、以及非 JSON 那三列
 * `status\tstage\tsourceName\t->\ttargetRelative`（上游 `cli.ts:48`）——两边都写在文件里。
 *
 * 阳性对照：
 * 1. `classify` 不加 `--apply` 与加 `--apply` 成对：预演不许动文件（真搬了这条就红）。
 *    这条同时钉上游 `:45` 那个表达式里"默认就是预演"那一半。
 * 2. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-classq/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { ClassqResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('classq CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xclassq ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xclassq ui')
  })

  it('--help 列出两个动作、run 别名与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xclassq')
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
    expect(help).toContain('Usage xclassq plan')
    expect(help).toContain('--paths <value>')
    expect(help).toContain('--keyword <value>')
    expect(help).toContain('--wait <value>')
    expect(help).toContain('--transfer <value>')
    expect(help).toContain('--existing <value>')
    expect(help).toContain('--apply')
    expect(help).toContain('--json')
  })

  it('plan 只读：ready 两条、一个文件都不搬（阳性对照）', async () => {
    const fixture = await createSet('plan')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as ClassqResult
    expect(result.success).toBe(true)
    expect(result.data?.keywordCount).toBe(1)
    expect(result.data?.readyCount).toBe(2)
    expect(result.data?.movedCount).toBe(0)
    expect(existsSync(fixture.pending)).toBe(true)
    expect(existsSync(join(fixture.root, 'wait', 'pending.zip'))).toBe(false)
  })

  it('非 JSON 时打结论 + 三列计划行（上游同款形状）', async () => {
    const fixture = await createSet('plain')
    const host = createHost()

    await runProgram(['plan', '--paths', fixture.root], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('ClassQ planned 3 item(s).')
    expect(out).toContain('found\tkeyword\talready\t->\twait')
    expect(out).toContain('ready\twait\tpending.zip\t->\twait/pending.zip')
  })

  it('classify 不加 --apply 仍是预演；加了才真搬（上游 cli.ts:45 那条表达式）', async () => {
    const preview = await createSingle('no-apply')
    const previewHost = createHost()
    await runProgram(['classify', '--paths', preview.root, '--json'], previewHost)
    expect(previewHost.stdoutText()).toContain('ClassQ planned 2 item(s).')
    expect(existsSync(preview.pending)).toBe(true)

    const live = await createSingle('apply')
    const host = createHost()
    await runProgram(['classify', '--paths', live.root, '--apply', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as ClassqResult
    expect(result.data?.movedCount).toBe(1)
    expect(existsSync(live.pending)).toBe(false)
    expect(await readFile(join(live.root, 'wait', 'pending.zip'), 'utf8')).toBe('pending')
  })

  it('--transfer copy 留源；run 是 classify 的同一条动作', async () => {
    const fixture = await createSingle('copy')
    const host = createHost()

    await runProgram(['classify', '--paths', fixture.root, '--transfer', 'copy', '--apply', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as ClassqResult
    expect(result.data?.copiedCount).toBe(1)
    expect(result.data?.movedCount).toBe(0)
    expect(existsSync(fixture.pending)).toBe(true)

    const aliasFixture = await createSingle('run-alias')
    const aliasHost = createHost()
    await runProgram(['run', '--paths', aliasFixture.root, '--apply', '--json'], aliasHost)
    const alias = JSON.parse(aliasHost.stdoutText()) as ClassqResult
    expect(alias.data?.movedCount).toBe(1)
  })

  it('--keyword / --wait 改的是清单里那两个默认词', async () => {
    const root = await tempRoot('words')
    await mkdir(join(root, 'done'))
    await writeFile(join(root, 'pending.zip'), 'pending', 'utf8')
    const host = createHost()

    await runProgram(['plan', '--paths', root, '--keyword', 'done', '--wait', 'later', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as ClassqResult
    expect(result.data?.keyword).toBe('done')
    expect(result.data?.waitKeyword).toBe('later')
    expect(result.data?.items[1]?.targetRelative).toBe('later/pending.zip')

    // 阳性对照：不加这两个 flag 时用的是内核的默认词（already / wait），这条 set 找不到关键词。
    const fallbackHost = createHost()
    await runProgram(['plan', '--paths', root, '--json'], fallbackHost)
    const fallback = JSON.parse(fallbackHost.stdoutText()) as ClassqResult
    expect(fallback.data?.keyword).toBe('already')
    expect(fallback.data?.items[0]?.reason).toBe('keyword_folder_missing')
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it('--paths - 把 stdin 的整列根目录读进来（上游 cli.ts:43 那条）', async () => {
    const first = await createSingle('stdin-a')
    const second = await createSingle('stdin-b')
    const host = createHost({ stdinLines: [first.root, second.root] })

    await runProgram(['plan', '--paths', '-', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as ClassqResult
    expect(result.data?.rootCount).toBe(2)
    expect(result.data?.keywordCount).toBe(2)
  })

  it('没给根目录时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['plan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one root directory is required.')
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
})

/** 一条关键词目录 + 两件同级项 ⇒ 计划里 3 行（1 keyword + 2 wait）。 */
async function createSet (label: string): Promise<{ root: string; pending: string }> {
  const root = await tempRoot(label)
  await mkdir(join(root, 'already'))
  const pending = join(root, 'pending.zip')
  await writeFile(pending, 'pending', 'utf8')
  await writeFile(join(root, 'extra.txt'), 'extra', 'utf8')
  return { root, pending }
}

/** 一条关键词目录 + 一件同级项 ⇒ 计划里 2 行，真执行时搬 1 件。 */
async function createSingle (label: string): Promise<{ root: string; pending: string }> {
  const root = await tempRoot(label)
  await mkdir(join(root, 'already'))
  const pending = join(root, 'pending.zip')
  await writeFile(pending, 'pending', 'utf8')
  return { root, pending }
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-classq-cli-${label}-`))
  tempRoots.push(root)
  return root
}

function createHost (options: { tty?: boolean; stdinLines?: string[] } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  // 假 stdin：只给 `isTTY`，需要队列时再挂一个 async 迭代器（vendored 支撑那条
  // `Symbol.asyncIterator in Object(stream)` 的判据靠它）。
  const stdin = { isTTY: options.tty === true } as unknown as CliHost['stdin']
  if (options.stdinLines !== undefined && options.tty !== true) {
    const lines = options.stdinLines
    ;(stdin as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = async function * iterate (): AsyncIterableIterator<string> {
      yield lines.join('\n')
    }
  }
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
