/**
 * migratef 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/migratef/src/cli.ts`，569 行）与上游 `core.test.ts` 的常量。
 *
 * 期望值全部手抄，不来自被测函数：`Plan generated: 1 item(s).`、
 * `Move completed: 1 success, 0 skipped, 0 failed.`、`Copy completed: …`、
 * `Loaded 1 history record(s).`、`Undo completed: 1 success, 0 failed.` 五句模板
 * （上游 `core.ts:124`、`:273`、`:311`、`:357`）、`... N more item(s)`（`cli.ts:483`）、
 * Summary 面板那五行标签（`:474-480`）、8 个 flag 名（`:229-240`）、分隔符
 * `/[,;\r\n]/`（`:543`）——两边都写在文件里。
 *
 * 阳性对照（这一包最关键的一条在第 4 条）：
 * 1. `plan` 与 `--dryRun` 一对、`move` 一条：预演不许动文件（真搬了这两条就红）。
 * 2. `--mode flat` 只搬一层、`--mode preserve` 保留结构：两种模式各钉一次。
 * 3. 真搬盘 → 撤销一次 → 文件回到原位：整条腿在真 `node:fs` 上闭环，
 *    不是靠假 runtime 记账（`tests/core.spec.ts` 那份是假件，这里换真盘）。
 * 4. **没给 `--historyPath` 的 `move` 必须被拦在动第一条文件之前**（ADR-0003 决定 2）：
 *    既查退出码与文案，也回读磁盘确认**一个文件都没动**。这条是"文件动了、
 *    撤销记录没落"那个事故的尺。
 * 5. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * @module xaihi-migratef/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { MigratefResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('migratef CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xmigratef ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xmigratef ui')
  })

  it('--help 列出五个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xmigratef')
    for (const verb of ['plan', 'move', 'copy', 'history', 'undo', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('plan --help 给出上游的 8 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['plan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xmigratef plan')
    for (const flag of ['--path <value>', '--source <value>', '--target <value>', '--mode <value>',
      '--historyPath <value>', '--batchId <value>', '--dryRun', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('plan 只读：flat 一层、preserve 保结构，一个文件都不搬（阳性对照）', async () => {
    const fixture = await createFixture('plan')
    const flat = createHost()
    await runProgram(['plan', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst, '--json'], flat)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(flat.stdoutText()) as MigratefResult
    expect(result.success).toBe(true)
    // 手抄上游 `core.ts:124`。
    expect(result.message).toBe('Plan generated: 1 item(s).')
    expect(result.data?.plan[0]).toMatchObject({
      sourcePath: join(fixture.src, 'a.txt'),
      targetPath: join(fixture.dst, 'a.txt'),
      kind: 'file',
      status: 'pending',
    })
    // 阳性对照：预演不许动盘，嵌套那条也不该进 flat 的清单。
    expect(existsSync(join(fixture.src, 'a.txt'))).toBe(true)
    expect(existsSync(join(fixture.dst, 'a.txt'))).toBe(false)
    expect(result.data?.plan.some((item) => item.sourcePath.endsWith('deep/b.txt'))).toBe(false)

    const preserved = createHost()
    await runProgram(['plan', '--mode', 'preserve', '--source', fixture.src, '--target', fixture.dst, '--json'], preserved)
    const items = (JSON.parse(preserved.stdoutText()) as MigratefResult).data?.plan ?? []
    expect(items).toHaveLength(2)
    // 阳性对照：preserve 收两层 ⇒ flat 没收的那条在这儿必须有。
    expect(items.some((item) => item.sourcePath.endsWith('deep/b.txt'))).toBe(true)
  })

  it('没给 --historyPath 的 move 拦在动第一条文件之前（ADR-0003 决定 2）', async () => {
    const fixture = await createFixture('move-no-journal')
    const host = createHost()

    await runProgram(['move', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst, '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stderrText()).toContain('Config.historyPath')
    // 这一条才是重点：拒绝发生在内核之前 ⇒ 磁盘必须还是原样。
    expect(existsSync(join(fixture.src, 'a.txt'))).toBe(true)
    expect(existsSync(join(fixture.dst, 'a.txt'))).toBe(false)
    // 阳性对照：同一个缺席的 `plan` **不该**被拦（它不碰账本），这就是可见的退化面。
    const planned = createHost()
    await runProgram(['plan', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst, '--json'], planned)
    expect(planned.stdoutText()).toContain('Plan generated')
  })

  it('move → history → undo 在真盘上闭环，账本落在 --historyPath', async () => {
    const fixture = await createFixture('move-undo')
    const journal = join(fixture.root, 'undo.json')

    const moved = createHost()
    await runProgram(['move', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst, '--historyPath', journal, '--json'], moved)
    expect(moved.stdoutText()).not.toBe('')
    const result = JSON.parse(moved.stdoutText()) as MigratefResult
    // 手抄上游 `core.ts:273` 的消息模板。
    expect(result.message).toBe('Move completed: 1 success, 0 skipped, 0 failed.')
    expect(result.data?.operationId).not.toBe('')
    expect(existsSync(join(fixture.src, 'a.txt'))).toBe(false)
    expect(existsSync(join(fixture.dst, 'a.txt'))).toBe(true)
    expect(await readFile(journal, 'utf8')).toContain('flat move to')

    const listed = createHost()
    await runProgram(['history', '--historyPath', journal, '--json'], listed)
    const history = JSON.parse(listed.stdoutText()) as MigratefResult
    // 手抄上游 `core.ts:311`。
    expect(history.message).toBe('Loaded 1 history record(s).')
    expect(history.data?.history[0]?.action).toBe('move')

    const undone = createHost()
    await runProgram(['undo', '--historyPath', journal, '--json'], undone)
    const undo = JSON.parse(undone.stdoutText()) as MigratefResult
    // 手抄上游 `core.ts:357`。
    expect(undo.message).toBe('Undo completed: 1 success, 0 failed.')
    expect(existsSync(join(fixture.src, 'a.txt'))).toBe(true)
    expect(existsSync(join(fixture.dst, 'a.txt'))).toBe(false)
    expect(await readFile(journal, 'utf8')).toContain('"undone": true')

    // 阳性对照：撤完再撤一次就没有批次可撤了（`core.ts:317` 那条 `!item.undone`）。
    const again = createHost()
    await runProgram(['undo', '--historyPath', journal, '--json'], again)
    expect(process.exitCode).toBe(1)
    expect(again.stdoutText()).toContain('No undoable batch found.')
  })

  it('copy 留源、--dryRun 不动盘（两种执行面各钉一次）', async () => {
    const fixture = await createFixture('copy')
    const journal = join(fixture.root, 'undo.json')

    const copied = createHost()
    await runProgram(['copy', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst, '--historyPath', journal, '--json'], copied)
    // 手抄上游 `core.ts:273` 的 copy 分支。
    expect((JSON.parse(copied.stdoutText()) as MigratefResult).message).toBe('Copy completed: 1 success, 0 skipped, 0 failed.')
    expect(existsSync(join(fixture.src, 'a.txt'))).toBe(true)
    expect(existsSync(join(fixture.dst, 'a.txt'))).toBe(true)

    // 阳性对照：`move --dryRun` 一条文件都不许动（内核在计划分支就 return，`core.ts:123`）。
    const dryFixture = await createFixture('dryrun')
    const dryRun = createHost()
    await runProgram(['move', '--mode', 'flat', '--source', dryFixture.src, '--target', dryFixture.dst, '--dryRun', '--json'], dryRun)
    expect((JSON.parse(dryRun.stdoutText()) as MigratefResult).message).toBe('Plan generated: 1 item(s).')
    expect(existsSync(join(dryFixture.src, 'a.txt'))).toBe(true)
    expect(existsSync(join(dryFixture.dst, 'a.txt'))).toBe(false)
  })

  it('非 JSON 时打结论 + Summary 面板 + 逐条计划（上游同款形状）', async () => {
    const fixture = await createFixture('plain')
    const host = createHost()

    await runProgram(['plan', '--mode', 'flat', '--source', fixture.src, '--target', fixture.dst], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Plan generated: 1 item(s).')
    expect(out).toContain('Summary')
    // 手抄上游 `cli.ts:474-480` 的那五行标签。
    expect(out).toContain('moved/copied: 0')
    expect(out).toContain('skipped: 0')
    expect(out).toContain('errors: 0')
    expect(out).toContain('pending: 1')
    expect(out).toContain('total: 1')
    expect(out).toContain('pending')

    // 阳性对照：`history` 有记录时多一段 `Undo history:`，没记录时**不许**印空段。
    const empty = createHost()
    await runProgram(['history', '--historyPath', join(fixture.root, 'nope.json')], empty)
    expect(empty.stdoutText()).toContain('Loaded 0 history record(s).')
    expect(empty.stdoutText()).not.toContain('Undo history:')
  })

  it('--source 与 --path 是同一条 stdin 队列（上游 :169-176 只读一次）', async () => {
    const fixture = await createFixture('stdin')
    const explicit = createHost({ stdin: async function * () { yield `${fixture.src}\n` } })

    await runProgram(['plan', '--mode', 'flat', '--source', '-', '--target', fixture.dst, '--json'], explicit)
    expect((JSON.parse(explicit.stdoutText()) as MigratefResult).message).toBe('Plan generated: 1 item(s).')

    // 阳性对照：没给 `--source` 而 stdin 是管道 ⇒ 同一条队列；给 `-` 而 stdin 空 ⇒ 内核说话。
    const implicit = createHost({ stdin: async function * () { yield `${fixture.src}\n` } })
    await runProgram(['plan', '--mode', 'flat', '--target', fixture.dst, '--json'], implicit)
    expect((JSON.parse(implicit.stdoutText()) as MigratefResult).message).toBe('Plan generated: 1 item(s).')

    const emptyPipe = createHost({ stdin: async function * () { /* 没有行 */ } })
    await runProgram(['plan', '--source', '-', '--target', fixture.dst, '--json'], emptyPipe)
    expect(process.exitCode).toBe(1)
    // 手抄上游 `core.ts:137`。
    expect(emptyPipe.stdoutText()).toContain('At least one source path is required.')
  })

  it('逗号与分号都算分隔符（上游 splitArg 的 /[,;\\r\\n]/）', async () => {
    const fixture = await createFixture('separators')
    const host = createHost()

    await runProgram(['plan', '--mode', 'flat', '--source', `${fixture.src};${fixture.extra}`, '--target', fixture.dst, '--json'], host)

    const result = JSON.parse(host.stdoutText()) as MigratefResult
    expect(result.message).toBe('Plan generated: 2 item(s).')
    // 阳性对照：`--path` 是同一判据的另一半（上游 `inputFromArgs` 用的是 `source || path`）。
    const viaPath = createHost()
    await runProgram(['plan', '--mode', 'flat', '--path', `${fixture.src},${fixture.extra}`, '--target', fixture.dst, '--json'], viaPath)
    expect((JSON.parse(viaPath.stdoutText()) as MigratefResult).message).toBe('Plan generated: 2 item(s).')
  })

  it('来源目录不存在时说的是另一句话（两条闸门不共用文案）', async () => {
    const fixture = await createFixture('missing-source')
    const host = createHost()

    await runProgram(['plan', '--mode', 'flat', '--source', join(fixture.root, 'gone'), '--target', fixture.dst, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as MigratefResult
    // 内核不抛：条目被标成 `source_missing`（`core.ts:145`）。
    expect(result.message).toBe('Plan generated: 0 item(s).')
    expect(result.data?.plan[0]).toMatchObject({ status: 'skipped', reason: 'source_missing' })
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

    await runProgram(['guided'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('@clack')
    expect(host.stderrText()).toContain('OpenTUI')
    expect(host.stderrText()).toContain('xmigratef plan')
    expect(host.stderrText()).not.toContain('Missing required argument')
    // 上游 guided 腿那个硬编码 Windows 默认目录不该随本包出现在任何一条文案里。
    expect(host.stderrText()).not.toContain('1Hub')

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

/**
 * 夹具手搭（照上游 `core.test.ts` 那份内存假件的目录版）：
 * `src/a.txt` + `src/deep/b.txt`（flat 只收一层，正好用来分开两种模式）、
 * `extra/c.txt`（分隔符那条用例的第二来源）、`dst`（空）。
 */
async function createFixture(label: string): Promise<{ root: string; src: string; dst: string; extra: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-migratef-cli-${label}-`))
  tempRoots.push(root)
  const src = join(root, 'src')
  const dst = join(root, 'dst')
  const extra = join(root, 'extra')
  await mkdir(join(src, 'deep'), { recursive: true })
  await mkdir(dst, { recursive: true })
  await mkdir(extra, { recursive: true })
  await writeFile(join(src, 'a.txt'), 'a', 'utf8')
  await writeFile(join(src, 'deep', 'b.txt'), 'b', 'utf8')
  await writeFile(join(extra, 'c.txt'), 'c', 'utf8')
  return { root, src, dst, extra }
}

function createHost(options: { tty?: boolean; stdin?: () => AsyncIterable<string> } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  const stdin = options.stdin === undefined
    ? { isTTY: options.tty === true }
    : Object.assign(options.stdin(), { isTTY: false })
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: stdin as CliHost['stdin'],
    stdout: {
      isTTY: options.tty === true,
      columns: 120,
      write(chunk: string) {
        stdout += chunk
        return true
      },
    },
    stderr: {
      isTTY: false,
      columns: 120,
      write(chunk: string) {
        stderr += chunk
        return true
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}
