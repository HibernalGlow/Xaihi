/**
 * trename 终端面的验收：断的是**基线那份 CLI 的形状**
 * （`<Xiranite>` tag `noxide` 的 `packages/nodes/trename/src/cli.ts`，668 行）
 * 与基线 `core.test.ts` 里的常量。
 *
 * 期望值全部手抄，不来自被测函数：内核那六句模板
 * （`Scan complete: 2 item(s), 1 segment(s).`、`Rename plan complete: 1 operation(s), 0 skipped.`、
 * `Rename complete: 1 succeeded, 0 failed, 0 skipped.`、`Undo complete: 1 succeeded, 0 failed.`、
 * `Path does not exist: …`、`Rename requires JSON content.`）抄自 `core.ts:407` / `:435` / `:471` /
 * `:515` / `:240` / `:428`；面板标题 `执行总结`、四段小标题 `操作详情：` / `冲突详情 (1)：` /
 * `操作历史：` / `JSON 预览：`、以及 `  ... 还有 N 个操作` 抄自 `cli.ts:575-605`；
 * 30 / 20 / 12 三段行限抄自 `cli.ts:580` / `:594` / `:603`。
 * 另外三条形状抄自基线 `cli.test.ts`（132 行）：成功那一趟 stderr 为空、stdout 是纯 JSON
 * （`:44-45`），`history` 读回一批且 `undone: false`（`:71-73`），撤销之后回读成 `undone: true`
 * （`:81` 的 `expectEntries` 那一面）。
 * 拒绝文案（`--undoPath` 缺失那一句）是本包的 DI 闸门，出处在 `src/cli.ts` 的 `undoStoreRefusal`。
 *
 * 阳性对照：
 * 1. 预演不许动磁盘、`--execute` 才动（同一份夹具跑两遍，先验不动）。
 * 2. `rename --execute` 不带 `--undoPath` 时**一个文件都不许动**（闸门在动手之前，ADR-0003 决定 2）。
 * 3. `--hidden` / `--exclude` / `--base` / `--split` 是别名：只接主名的话另一条会静默落回内核默认。
 * 4. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * stdin 那两条队列（`--inputFile -` / 管道里整份 JSON）在这里没法喂真管道，
 * 判据留在 `src/cli.ts` 的 `readStdinIfStreamable`（照上游 `:344-352` 的形状 + 偏离 5 那道闸门），
 * 标为**未证**。
 *
 * @module xaihi-trename/tests/cli
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { TrenameResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('trename CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xtrename ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xtrename ui')
  })

  it('--help 列出六个动作与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xtrename')
    for (const verb of ['scan', 'import', 'validate', 'rename', 'undo', 'history', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('scan --help 给出上游的 25 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['scan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xtrename scan')
    for (const flag of ['--path <value>', '--paths <value>', '--input <value>', '--inputFile <value>', '--output <value>',
      '--base <value>', '--basePath <value>', '--exclude <value>', '--excludeExts <value>', '--excludePattern <value>',
      '--excludePatterns <value>', '--split <value>', '--maxLines <value>', '--mode <value>', '--batchId <value>',
      '--undoPath <value>', '--jsonContent <value>',
      '--includeHidden', '--hidden', '--includeRoot', '--noRoot', '--compact', '--dryRun', '--execute', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('scan 出 JSON：两个条目、一段，源目录名进 root', async () => {
    const host = createHost()
    const fixture = await createFixture('scan')

    await runProgram(['scan', '--path', fixture.gallery, '--json'], host)

    expect(process.exitCode).toBe(0)
    // 上游 `cli.test.ts:44-45` 那两条：成功那一趟 stderr 必须是空的，stdout 是一份纯 JSON。
    expect(host.stderrText()).toBe('')
    expect(host.stdoutText().trim().startsWith('{')).toBe(true)
    const result = JSON.parse(host.stdoutText()) as TrenameResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Scan complete: 2 item(s), 1 segment(s).')
    expect(result.data?.totalItems).toBe(2)
    expect(result.data?.basePath).toBe(fixture.root)
    expect(result.data?.jsonContent).toContain('"src_dir": "gallery"')
  })

  it('scan --output 落盘；--noRoot --split 3 时按段落成 _1…_4', async () => {
    const single = createHost()
    const fixture = await createFixture('output')
    const outFile = join(fixture.root, 'scan.json')

    await runProgram(['scan', '--path', fixture.gallery, '--output', outFile], single)
    expect(existsSync(outFile)).toBe(true)
    expect(readFileSync(outFile, 'utf8')).toContain('"src_dir": "gallery"')

    // 阳性对照：`--noRoot`（`:357` 的那个三元）把四个文件摊进 root（notes.txt 被默认表排除），
    // `--split`（`--maxLines` 的别名）3 行 ⇒ 手推：每段起算 2 行 + 每节点 1 行，
    // 2+1+1 = 4 > 3 ⇒ **每段只装一个节点 ⇒ 四段**（`:371-380` 因此写 `_1`…`_4`）。
    const many = await createFixture('segments')
    for (const name of ['c.jpg', 'd.jpg', 'e.jpg']) await writeFile(join(many.gallery, name), 'x', 'utf8')
    const split = createHost()
    await runProgram(['scan', '--path', many.gallery, '--noRoot', '--split', '3', '--output', join(many.root, 'out.json')], split)
    for (const suffix of ['_1', '_2', '_3', '_4']) {
      expect(existsSync(join(many.root, `out${suffix}.json`))).toBe(true)
    }
    expect(existsSync(join(many.root, 'out.json'))).toBe(false)
  })

  it('预演（内核默认）一个文件都不动，--execute 才动，undo 再搬回去', async () => {
    const fixture = await createFixture('rename')
    const plan = createHost()

    await runProgram(['rename', '--inputFile', fixture.json, '--base', fixture.gallery, '--json'], plan)
    expect(plan.stdoutText()).not.toBe('')
    const planned = JSON.parse(plan.stdoutText()) as TrenameResult
    expect(planned.success).toBe(true)
    expect(planned.message).toBe('Rename plan complete: 1 operation(s), 0 skipped.')
    // 阳性对照：预演不许动磁盘。
    expect(existsSync(join(fixture.gallery, 'a.jpg'))).toBe(true)
    expect(existsSync(join(fixture.gallery, 'cover.jpg'))).toBe(false)

    // 阳性对照：不带 `--undoPath` 的 `--execute` 必须在**动手之前**被拒（本包的 DI 闸门）。
    const blocked = createHost()
    await runProgram(['rename', '--inputFile', fixture.json, '--base', fixture.gallery, '--execute', '--json'], blocked)
    const blockedExit = process.exitCode
    process.exitCode = 0
    expect(blockedExit).toBe(1)
    expect(blocked.stdoutText()).toContain('撤销账本位置没给')
    expect(existsSync(join(fixture.gallery, 'a.jpg'))).toBe(true)
    expect(existsSync(join(fixture.gallery, 'cover.jpg'))).toBe(false)

    const live = createHost()
    await runProgram(['rename', '--inputFile', fixture.json, '--base', fixture.gallery, '--execute', '--undoPath', fixture.undo, '--json'], live)
    const executed = JSON.parse(live.stdoutText()) as TrenameResult
    expect(executed.message).toBe('Rename complete: 1 succeeded, 0 failed, 0 skipped.')
    expect(existsSync(join(fixture.gallery, 'a.jpg'))).toBe(false)
    expect(existsSync(join(fixture.gallery, 'cover.jpg'))).toBe(true)
    expect(existsSync(fixture.undo)).toBe(true)

    // 上游 `cli.test.ts:68-73`：history 读回**一批**，且那时还没被撤销。
    const history = createHost()
    await runProgram(['history', '--undoPath', fixture.undo, '--json'], history)
    const listed = JSON.parse(history.stdoutText()) as TrenameResult
    expect(listed.message).toBe('History loaded: 1 batch(es).')
    expect(listed.data?.history).toHaveLength(1)
    expect(listed.data?.history[0]?.undone).toBe(false)

    const undo = createHost()
    await runProgram(['undo', '--undoPath', fixture.undo, '--json'], undo)
    expect((JSON.parse(undo.stdoutText()) as TrenameResult).message).toBe('Undo complete: 1 succeeded, 0 failed.')
    expect(existsSync(join(fixture.gallery, 'a.jpg'))).toBe(true)

    // 上游 `cli.test.ts:81` 的另一面：撤销过的批次在历史里回读成 `undone: true`。
    const after = createHost()
    await runProgram(['history', '--undoPath', fixture.undo, '--json'], after)
    expect((JSON.parse(after.stdoutText()) as TrenameResult).data?.history[0]?.undone).toBe(true)

    // 阳性对照：账本没了位置就查不了历史（上一条能跑是因为 --undoPath 给到位）。
    const noStore = createHost()
    await runProgram(['history', '--json'], noStore)
    const historyExit = process.exitCode
    process.exitCode = 0
    expect(historyExit).toBe(1)
    expect(noStore.stdoutText()).toContain('撤销账本位置没给')
  })

  it('别名各接一条：--hidden、--exclude、--input', async () => {
    const fixture = await createFixture('aliases')
    await writeFile(join(fixture.gallery, '.secret.jpg'), 'x', 'utf8')

    const hidden = createHost()
    await runProgram(['scan', '--path', fixture.gallery, '--json'], hidden)
    expect((JSON.parse(hidden.stdoutText()) as TrenameResult).message).toBe('Scan complete: 2 item(s), 1 segment(s).')

    // 阳性对照：`--hidden` 是 `--includeHidden` 的别名（`:356` 的 `??`），带上就多一个条目。
    const shown = createHost()
    await runProgram(['scan', '--path', fixture.gallery, '--hidden', '--json'], shown)
    expect((JSON.parse(shown.stdoutText()) as TrenameResult).message).toBe('Scan complete: 3 item(s), 1 segment(s).')

    // 阳性对照：`--exclude` 是 `--excludeExts` 的别名（`:358` 的 `||`）。给了 .jpg 就顶掉整份
    // 默认表（`.txt` 因此不再被排除）：children 剩 notes.txt ⇒ 目录自己 + 它 = 2。
    const excluded = createHost()
    await runProgram(['scan', '--path', fixture.gallery, '--exclude', 'jpg', '--json'], excluded)
    expect((JSON.parse(excluded.stdoutText()) as TrenameResult).data?.totalItems).toBe(2)

    // 阳性对照：`--input` 与 `--inputFile` 同义（`:342` 的 `||`）。
    const viaInput = createHost()
    await runProgram(['import', '--input', fixture.json, '--json'], viaInput)
    expect((JSON.parse(viaInput.stdoutText()) as TrenameResult).message).toBe('Import complete: 1 item(s), 1 ready.')
  })

  it('--mode leak 只留没有前缀的压缩包', async () => {
    const fixture = await createFixture('leak')
    await writeFile(join(fixture.gallery, '2024.01 done.zip'), 'x', 'utf8')
    await writeFile(join(fixture.gallery, 'raw pack.zip'), 'x', 'utf8')

    const host = createHost()
    await runProgram(['scan', '--path', fixture.gallery, '--mode', 'leak', '--json'], host)
    const result = JSON.parse(host.stdoutText()) as TrenameResult
    expect(result.success).toBe(true)
    expect(result.data?.jsonContent).toContain('raw pack.zip')
    expect(result.data?.jsonContent).not.toContain('2024.01 done.zip')

    // 阳性对照：`--mode` 只认字面 leak，别的落回 normal（`core.ts:197`）。
    const other = createHost()
    await runProgram(['scan', '--path', fixture.gallery, '--mode', 'LEAK', '--json'], other)
    expect((JSON.parse(other.stdoutText()) as TrenameResult).data?.jsonContent).toContain('2024.01 done.zip')
  })

  it('非 JSON 时打结论 + 执行总结面板 + 四段列表（上游同款形状）', async () => {
    const host = createHost()
    const fixture = await createFixture('summary')

    await runProgram(['rename', '--inputFile', fixture.json, '--base', fixture.gallery], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Rename plan complete: 1 operation(s), 0 skipped.')
    expect(out).toContain('执行总结')
    expect(out).toContain('总计:')
    expect(out).toContain('可重命名:')
    expect(out).toContain('操作详情：')
    expect(out).toContain('基础路径:')
    expect(out).toContain('JSON 预览：')
  })

  it('冲突那条走 `冲突详情 (1)：`，并把冲突数报进退出码 0 的那一侧', async () => {
    const fixture = await createFixture('conflict')
    await writeFile(join(fixture.gallery, 'taken.jpg'), 'x', 'utf8')
    const bad = JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'taken.jpg' }] })
    const host = createHost()

    await runProgram(['rename', '--jsonContent', bad, '--base', fixture.gallery], host)

    expect(process.exitCode).toBe(0)
    expect(host.stdoutText()).toContain('Rename plan complete: 0 operation(s), 1 skipped.')
    expect(host.stdoutText()).toContain('冲突详情 (1)：')
    expect(host.stdoutText()).toContain('Target already exists')
  })

  it('缺输入时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['rename', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('Rename requires JSON content.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('路径不存在与不是目录说的是两句不同的话', async () => {
    const fixture = await createFixture('paths')
    const gone = createHost()
    await runProgram(['scan', '--path', join(fixture.root, 'nope'), '--json'], gone)
    const goneExit = process.exitCode
    process.exitCode = 0
    expect(goneExit).toBe(1)
    expect(gone.stdoutText()).toContain('Path does not exist:')

    const file = createHost()
    await runProgram(['scan', '--path', join(fixture.gallery, 'a.jpg'), '--json'], file)
    expect(file.stdoutText()).toContain('Path is not a directory:')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['scan', '--nope', 'x'], host)

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
    expect(host.stderrText()).toContain('xtrename scan')
    expect(host.stderrText()).not.toContain('Missing required argument')
    // 替代归属只说真注册过的东西：本包不 inject `commands`，所以不许出现 `/trename`（台账 G7）。
    expect(host.stderrText()).toContain('trename_<action>')
    expect(host.stderrText()).not.toContain('/trename')

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

interface Fixture {
  root: string
  gallery: string
  json: string
  undo: string
}

/**
 * 夹具手搭（照基线 `core.test.ts` 那份内存树的目录版）：
 * `gallery/a.jpg` + `gallery/notes.txt`，`rename.json` 写的是 `a.jpg → cover.jpg`，
 * `undo.json` 只是路径（默认不存在，撤销记录由被测代码自己写出来）。
 */
async function createFixture(label: string): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `xaihi-trename-cli-${label}-`)))
  tempRoots.push(root)
  const gallery = join(root, 'gallery')
  await mkdir(gallery, { recursive: true })
  await writeFile(join(gallery, 'a.jpg'), 'x', 'utf8')
  await writeFile(join(gallery, 'notes.txt'), 'note', 'utf8')
  const json = join(root, 'rename.json')
  // 目标名故意与源名**只差大小写以外**的内容：macOS 的 APFS 默认大小写不敏感，
  // `a.jpg → A.jpg` 这种夹具在真盘上"改名成功"与"根本没动"读回来是同一个样子。
  await writeFile(json, JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'cover.jpg' }] }), 'utf8')
  return { root, gallery, json, undo: join(root, 'undo.json') }
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
