/**
 * encodb 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/encodeb/src/cli.ts`，624 行）与上游 `core.test.ts` 的常量。
 *
 * 期望值全部手抄，不来自被测函数：`No valid paths provided.`（`core.ts:143`）、
 * `Find completed, 2 item(s).` / `Preview completed, 1 item(s).` 的消息模板（`core.ts:173`）、
 * `_recovered` 这个复制腿的目录后缀（`platform.ts:245`）、`セ.txt` 与 `魔法·少女.txt`
 * 两个转码结果（手抄 `platform.ts:189-195` 与 `:76`）、8 个 flag 名（`cli.ts:203-214`）、
 * `--paths` 那条 stdin 队列用 `;` 拼（`cli.ts:174`）——两边都写在文件里。
 *
 * 阳性对照：
 * 1. `preview` 不动盘、`recover` 动盘：两条腿各钉一次（预演真改了名就红）。
 * 2. 默认预设（`auto`）那条**必须**点名 codec 缺席，而同一条腿换成 `--transform
 *    decode-hash-u` 必须真出映射 —— 只接一条的话另一条会被静默当成"没有乱码"。
 * 3. `find` 全程不碰转码：同一条夹具下 `find` 成功而 `preview` 拒绝 ⇒ 拒绝不是全局故障。
 * 4. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 * 5. `--limit` 抬小就必须少一条（`core.ts:99` 到 limit 就 break）。
 *
 * @module xaihi-encodeb/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { EncodebResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('encodeb CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xencodeb ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xencodeb ui')
  })

  it('--help 列出三个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xencodeb')
    for (const verb of ['find', 'preview', 'recover', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('find --help 给出上游的 8 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['find', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xencodeb find')
    for (const flag of ['--paths <value>', '--preset <value>', '--srcEncoding <value>', '--dstEncoding <value>',
      '--transform <value>', '--strategy <value>', '--limit <value>', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('find 不需要 codec：三条乱码一条正常，退出码 0', async () => {
    const host = createHost()
    const fixture = await createFixture('find')

    await runProgram(['find', '--paths', fixture.root, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as EncodebResult
    expect(result.success).toBe(true)
    // 手抄上游 `core.ts:173` 的消息模板；三条乱码 = 方块、GBK 假名、`#U` 各一条。
    expect(result.message).toBe('Find completed, 3 item(s).')
    expect(result.data?.matches.map((item) => item.split('/').at(-1)).sort()).toEqual(['#U30BB.txt', '╘.txt', '僥僗僩.txt'])
    expect(existsSync(join(fixture.root, 'normal.txt'))).toBe(true)

    // 阳性对照：`--limit 1` 只留第一条（`core.ts:99` 到 limit 就 break，不是跳过后面的）。
    const limited = createHost()
    await runProgram(['find', '--paths', fixture.root, '--limit', '1', '--json'], limited)
    expect((JSON.parse(limited.stdoutText()) as EncodebResult).data?.matches).toHaveLength(1)
  })

  it('默认预设（auto）点名 codec 缺席，而 --transform decode-hash-u 真出映射', async () => {
    const host = createHost()
    const fixture = await createFixture('preview-default')

    await runProgram(['preview', '--paths', fixture.root, '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stderrText()).toContain('iconv-lite')
    expect(host.stderrText()).toContain('chardet')
    // 阳性对照：这条拒绝发生在动文件之前 ⇒ 一个字节都没改。
    expect(existsSync(join(fixture.root, '#U30BB.txt'))).toBe(true)

    // 阳性对照：同一条腿换成不依赖 codec 的 transform 就必须真出映射。
    const free = createHost()
    await runProgram(['preview', '--paths', fixture.root, '--transform', 'decode-hash-u', '--json'], free)
    expect(free.stdoutText()).not.toBe('')
    const result = JSON.parse(free.stdoutText()) as EncodebResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Preview completed, 1 item(s).')
    // 手抄上游 `platform.ts:189-195`：`#U30BB` 解成 `セ`，扩展名原样。
    expect(result.data?.mappings[0]?.dst).toBe(join(fixture.root, 'セ.txt'))
    // 阳性对照：`preview` 只读 ⇒ 名字还在原地。
    expect(existsSync(join(fixture.root, '#U30BB.txt'))).toBe(true)
  })

  it('recover --transform normalize-middle-dot 真的改名，原名字不再存在', async () => {
    const host = createHost()
    const fixture = await createMiddleDotFixture('recover-replace')

    await runProgram(['recover', '--paths', fixture.root, '--transform', 'normalize-middle-dot', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as EncodebResult
    expect(result.message).toBe('Recovery completed, processed 1 path(s).')
    expect(result.data?.processed).toBe(1)
    // 手抄上游 `platform.ts:76` 那一行：`・` → `·`。
    expect(existsSync(join(fixture.root, '魔法·少女.txt'))).toBe(true)
    expect(existsSync(join(fixture.root, '魔法・少女.txt'))).toBe(false)
  })

  it('recover --strategy copy 落到 _recovered，原文件一个都不动', async () => {
    const host = createHost()
    const fixture = await createFixture('recover-copy')

    await runProgram(['recover', '--paths', fixture.root, '--transform', 'decode-hash-u', '--strategy', 'copy', '--json'], host)

    expect(process.exitCode).toBe(0)
    // 上游 `platform.ts:245`：目录 + copy ⇒ 目的地是 `<解析后的路径>_recovered`。
    expect(existsSync(`${fixture.root}_recovered`)).toBe(true)
    expect(existsSync(join(`${fixture.root}_recovered`, 'セ.txt'))).toBe(true)
    // 阳性对照：copy 腿不删源。
    expect(existsSync(join(fixture.root, '#U30BB.txt'))).toBe(true)
  })

  it('非 JSON 时打结论 + 逐行 src -> dst（上游同款形状）', async () => {
    const host = createHost()
    const fixture = await createFixture('plain')

    await runProgram(['preview', '--paths', fixture.root, '--transform', 'decode-hash-u'], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Preview completed, 1 item(s).')
    expect(out).toContain('->')
    expect(out).toContain('セ.txt')

    // 阳性对照：`find` 那条腿打的是逐行路径，没有箭头。
    const found = createHost()
    await runProgram(['find', '--paths', fixture.root], found)
    expect(found.stdoutText()).toContain('Find completed, 3 item(s).')
    expect(found.stdoutText()).not.toContain('->')
  })

  it('--paths 给 - 或不给而 stdin 是管道时，整份 stdin 拼成 ; 分隔（上游 :174）', async () => {
    const fixture = await createFixture('stdin')
    const explicit = createHost({ stdin: async function * () { yield `${fixture.root}\n` } })

    await runProgram(['find', '--paths', '-', '--json'], explicit)
    expect(explicit.stdoutText()).not.toBe('')
    expect((JSON.parse(explicit.stdoutText()) as EncodebResult).data?.matches).toHaveLength(3)

    // 阳性对照：没给 `--paths` 而 stdin 是管道 ⇒ 走同一条队列（`hasPipedInput` 那半边判据）。
    const implicit = createHost({ stdin: async function * () { yield `${fixture.root}\n` } })
    await runProgram(['find', '--json'], implicit)
    expect((JSON.parse(implicit.stdoutText()) as EncodebResult).data?.matches).toHaveLength(3)

    // 阳性对照：stdin 是 TTY 时**不读**，报的是内核那句"No valid paths provided."。
    const ttyHost = createHost({ tty: true })
    await runProgram(['find', '--json'], ttyHost)
    expect(ttyHost.stdoutText()).toContain('No valid paths provided.')
  })

  it('路径不存在时由 runtime 说话（ENOENT，退出码 1），不是参数校验抢先', async () => {
    const host = createHost()

    await runProgram(['find', '--paths', join(tmpdir(), 'xaihi-encodeb-does-not-exist'), '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stderrText()).toContain('ENOENT')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('路径全被过滤光时由内核说话（No valid paths provided.）', async () => {
    const host = createHost()

    // 只给空白：`parseEncodebPaths` 的 `trim()` 把它变成空串再被 `filter(Boolean)` 丢掉
    // （`core.ts:78`）。注意 `' , '` 是**另一回事** —— 它 trim 成 `,`，是一条真路径。
    await runProgram(['find', '--paths', '   ', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('No valid paths provided.')
    // 阳性对照：这两条闸门不共用文案（上面那条是 ENOENT）。
    expect(host.stdoutText()).not.toContain('ENOENT')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['find', '--nope', 'x'], host)

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
    // 面级拒绝必须给一条能走的脚本化路子。
    expect(host.stderrText()).toContain('xencodeb find')
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

/**
 * 夹具手搭：`╘.txt`（方块字符那条判据）、`僥僗僩.txt`（cp437→GBK 假名那条）、
 * `#U30BB.txt`（`#U` 那条）与 `normal.txt`（一条都不中的对照）⇒ 可疑的是**三条**。
 * 外面再套一层 parent：`--strategy copy` 的目的地是 `<路径>_recovered`，那是 fixture
 * root 的**兄弟目录**（上游 `platform.ts:245`），只登记 root 就清不掉它。
 */
async function createFixture(label: string): Promise<{ root: string }> {
  const parent = await mkdtemp(join(tmpdir(), `xaihi-encodeb-cli-${label}-`))
  tempRoots.push(parent)
  const root = join(parent, 'data')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, '╘.txt'), 'box', 'utf8')
  await writeFile(join(root, '僥僗僩.txt'), 'kana', 'utf8')
  await writeFile(join(root, '#U30BB.txt'), 'escape', 'utf8')
  await writeFile(join(root, 'normal.txt'), 'plain', 'utf8')
  return { root }
}

async function createMiddleDotFixture(label: string): Promise<{ root: string }> {
  const parent = await mkdtemp(join(tmpdir(), `xaihi-encodeb-cli-${label}-`))
  tempRoots.push(parent)
  const root = join(parent, 'data')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, '魔法・少女.txt'), 'dot', 'utf8')
  return { root }
}

function createHost(options: { tty?: boolean; stdin?: () => AsyncGenerator<string> } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  const iterable = options.stdin === undefined ? undefined : options.stdin()
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: (iterable === undefined
      ? { isTTY: options.tty === true }
      // 真异步迭代器：`readStdinLines` 要 `Symbol.asyncIterator in Object(stdin)` 才肯读。
      : Object.assign(iterable, { isTTY: false })) as CliHost['stdin'],
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
