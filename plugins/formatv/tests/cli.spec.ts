/**
 * formatv 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/formatv/src/cli.ts`）与上游 `core.test.ts` 的常量。
 *
 * 期望值全部手抄，不来自被测函数：`At least one path is required.`、
 * `Scan completed: 1 normal, 1 .nov.`、`Add .nov completed: 1 success, 0 skipped, 0 error(s).`、
 * `Remove .nov completed: 1 success, 0 skipped, 0 error(s).`、
 * `Duplicate check completed: 1 duplicate(s).`、报告缺省名 `formatv-hb-duplicates.json`、
 * 摘要里的 `普通` / `后缀` / `前缀` / `重复` 四行（上游 `cli.ts:292-306`），
 * 以及 50 行上限（上游 `cli.ts:321`）。
 *
 * 阳性对照：
 * 1. `scan` / `--dry-run` 一对与真动作一条：预演不许改文件名（真改了这两条就红）。
 * 2. 递归那条：同一份嵌套夹具，`scan` 与 `--recursive` 必须数出 1 与 2 个——
 *    `recursive-enumeration` 这条 hostRequirement 的全部差别就在这一个数上。
 * 3. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * `--prefix` 是 `--prefixName` 的别名（上游 `cli.ts:242` 的 `||`），但它的取值在本包**不可观测**：
 * `check_duplicates` 认不出前缀名时会兜回 `prefixes[0]`（`core.ts:296`），而默认表里只有 `hb`，
 * 所以给 `hb` 与不给是同一个结果。这里只在 `--help` 上钉它存在，不假装能测出差别。
 *
 * stdin 队列那两条（`--path -` / `--paths -`）在这里没法喂真管道，判据留在
 * `src/cli.ts` 的 `resolvePathQueues`（照上游 `:248-254` 的形状），标为未证。
 *
 * @module xaihi-formatv/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { FormatvResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('formatv CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 formatv ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('formatv ui')
  })

  it('--help 列出四个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage formatv')
    for (const verb of ['scan', 'add-nov', 'remove-nov', 'duplicates', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('scan --help 给出上游的 8 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['scan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage formatv scan')
    for (const flag of ['--path <value>', '--paths <value>', '--prefixName <value>', '--prefix <value>',
      '--reportPath <value>', '--recursive', '--dryRun', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('scan 只读：三个桶各一条，一个文件名都不改（阳性对照）', async () => {
    const fixture = await createVideoFixture('scan')
    const host = createHost()

    await runProgram(['scan', '--path', fixture.v, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as FormatvResult
    expect(result.success).toBe(true)
    expect(result.data?.normalCount).toBe(1)
    expect(result.data?.novCount).toBe(1)
    expect(result.data?.prefixedCounts.hb).toBe(1)
    // 手抄上游 `core.ts:141` 的 scan 消息模板。
    expect(result.message).toBe('Scan completed: 1 normal, 1 .nov.')
    expect(existsSync(fixture.a)).toBe(true)
    expect(existsSync(`${fixture.a}.nov`)).toBe(false)
  })

  it('递归边界：同一份嵌套夹具，scan 数 1 个、--recursive 数 2 个', async () => {
    const flat = createHost()
    const fixture = await createVideoFixture('recursive')
    await runProgram(['scan', '--path', fixture.v, '--json'], flat)
    expect((JSON.parse(flat.stdoutText()) as FormatvResult).data?.normalCount).toBe(1)

    // 阳性对照：`visit` 里 `entry.isDirectory && recursive` 那一支（上游 `core.ts:177`）。
    const deep = createHost()
    await runProgram(['scan', '--path', fixture.v, '--recursive', '--json'], deep)
    expect((JSON.parse(deep.stdoutText()) as FormatvResult).data?.normalCount).toBe(2)
  })

  it('add-nov 默认真改名，--dry-run 才不动；remove-nov 说得是另一句话', async () => {
    const live = createHost()
    const fixture = await createVideoFixture('add-live')
    await runProgram(['add-nov', '--path', fixture.v, '--json'], live)

    const result = JSON.parse(live.stdoutText()) as FormatvResult
    expect(result.data?.successCount).toBe(1)
    expect(result.message).toBe('Add .nov completed: 1 success, 0 skipped, 0 error(s).')
    expect(existsSync(`${fixture.a}.nov`)).toBe(true)

    // 阳性对照：同一份夹具加 `--dry-run` 就必须一个都不改。
    const idle = createHost()
    const dry = await createVideoFixture('add-dry')
    await runProgram(['add-nov', '--path', dry.v, '--dry-run', '--json'], idle)
    const planned = JSON.parse(idle.stdoutText()) as FormatvResult
    expect(planned.data?.successCount).toBe(0)
    expect(planned.message).toBe('Add .nov completed: 1 planned, 0 skipped, 0 error(s).')
    expect(existsSync(`${dry.a}.nov`)).toBe(false)

    const back = createHost()
    const novFixture = await createVideoFixture('remove-live')
    await writeFile(join(novFixture.v, 'b.mkv.nov'), 'bbb', 'utf8')
    await runProgram(['remove-nov', '--path', novFixture.v, '--json'], back)
    const removed = JSON.parse(back.stdoutText()) as FormatvResult
    expect(removed.message).toBe('Remove .nov completed: 1 success, 0 skipped, 0 error(s).')
    expect(existsSync(join(novFixture.v, 'b.mkv'))).toBe(true)
  })

  it('duplicates 把报告落在第一个路径旁边；--dry-run 不写盘且 reportPath 为空', async () => {
    const live = createHost()
    const dup = await createDuplicateFixture('dup-live')
    await runProgram(['duplicates', '--path', dup.v, '--json'], live)
    const result = JSON.parse(live.stdoutText()) as FormatvResult
    expect(result.data?.duplicateCount).toBe(1)
    expect(result.data?.duplicates).toEqual([dup.original])
    expect(result.data?.prefixedLarger[0]?.prefixedSize).toBe(20)
    expect(result.message).toBe('Duplicate check completed: 1 duplicate(s).')
    expect(result.data?.reportPath).toBe(join(dup.v, 'formatv-hb-duplicates.json'))
    expect(existsSync(join(dup.v, 'formatv-hb-duplicates.json'))).toBe(true)

    // 阳性对照：同一份夹具加 `--dry-run` 就不许落盘，返回值里的 reportPath 也得是空串。
    const idle = createHost()
    const dry = await createDuplicateFixture('dup-dry')
    await runProgram(['duplicates', '--path', dry.v, '--dry-run', '--json'], idle)
    const planned = JSON.parse(idle.stdoutText()) as FormatvResult
    expect(planned.data?.reportPath).toBe('')
    expect(existsSync(join(dry.v, 'formatv-hb-duplicates.json'))).toBe(false)
  })

  it('--reportPath 指定报告位置，缺省命名就不出现', async () => {
    const host = createHost()
    const dup = await createDuplicateFixture('report-path')
    const target = join(dup.root, 'out', 'report.json')

    await runProgram(['duplicates', '--path', dup.v, '--reportPath', target, '--json'], host)

    const result = JSON.parse(host.stdoutText()) as FormatvResult
    expect(result.data?.reportPath).toBe(target)
    expect(existsSync(target)).toBe(true)
    expect(existsSync(join(dup.v, 'formatv-hb-duplicates.json'))).toBe(false)
  })

  it('非 JSON 时打结论 + Summary 面板 + 前缀行（上游同款形状）', async () => {
    const host = createHost()
    const fixture = await createVideoFixture('plain')

    await runProgram(['scan', '--path', fixture.v], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Scan completed: 1 normal, 1 .nov.')
    expect(out).toContain('Summary')
    expect(out).toContain('普通')
    expect(out).toContain('后缀')
    expect(out).toContain('前缀')
    expect(out).toContain('HandBrake transcode file')
  })

  it('非 JSON 的 duplicates 摘要里有重复与前缀更大两行', async () => {
    const host = createHost()
    const dup = await createDuplicateFixture('plain-dup')

    await runProgram(['duplicates', '--path', dup.v], host)

    const out = host.stdoutText()
    expect(out).toContain('重复')
    expect(out).toContain('前缀大于原件')
    expect(out).toContain('报告')
    expect(out).toContain('duplicate')
  })

  it('没给路径时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['scan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one path is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['scan', '--nope', 'x'], host)

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

/** 上游 `core.test.ts` 那份夹具的目录版：直属四个文件 + 一个子目录里再放一个视频。 */
async function createVideoFixture(label: string): Promise<{ root: string; v: string; a: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-formatv-cli-${label}-`))
  tempRoots.push(root)
  const v = join(root, 'v')
  await mkdir(join(v, 'sub'), { recursive: true })
  const a = join(v, 'a.mp4')
  await writeFile(a, 'aaaa', 'utf8')
  await writeFile(join(v, 'b.mkv.nov'), 'bbb', 'utf8')
  await writeFile(join(v, '[#hb]c.mp4'), 'cccc', 'utf8')
  await writeFile(join(v, 'readme.txt'), 'readme', 'utf8')
  await writeFile(join(v, 'sub', 'd.mp4'), 'dddd', 'utf8')
  return { root, v, a }
}

/** 前缀件 20 字节、原件 10 字节 ⇒ `prefixedLarger` 成立（判据是严格大于，`core.ts:308`）。 */
async function createDuplicateFixture(label: string): Promise<{ root: string; v: string; original: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-formatv-cli-${label}-`))
  tempRoots.push(root)
  const v = join(root, 'v')
  await mkdir(v, { recursive: true })
  const original = join(v, 'a.mp4')
  await writeFile(original, '0123456789', 'utf8')
  await writeFile(join(v, '[#hb]a.mp4'), '01234567890123456789', 'utf8')
  return { root, v, original }
}

function createHost(options: { tty?: boolean } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: options.tty === true } as CliHost['stdin'],
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
