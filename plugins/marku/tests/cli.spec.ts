/**
 * marku 终端面的验收：断的是**基线那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/marku/src/cli.ts`，496 行）与基线 `core.ts` 的消息文案。
 *
 * 期望值全部手抄，不来自被测函数：`Text processed: changed.`、`Processed 1 file(s), 1 changed (dry-run).`、
 * `Workflow processed 1 file(s), 1 changed.`、`No input paths or text provided.`、
 * `No Markdown files found.`、`No undoable record found.`、`Loaded 1 history record(s).`、
 * `hello marku` / `gamma\n` 这些结果串，`--- a/input.md` 这个 diff header，
 * `files: 1  changed: 1` 与 `changed|same <file>` 两列（基线 `cli.ts:434` / `:439`），
 * `Undo history:`（`:451`），以及 20 行上限（`:437` / `:452`）——两边都写在文件里。
 *
 * 阳性对照（"关掉防御就立刻红"）：
 * 1. 预演与真写一对：`run` 默认 `dryRun: true` ⇒ 文件一个字节都不许变；
 *    `--write` 才落盘并留账本（基线 `:230` 的 `args.write ? false : args.dryRun`）。
 * 2. `run --write` 不给 `--historyPath` ⇒ **动手之前**拒绝，夹具里的文件必须没被动过
 *    （文件头第 3 条那条闸门；照基线跑会先写完再在记账时抛，现场就成了半程）。
 * 3. `--enableUndo false` 那一侧：上游允许"写盘但不记账"，闸门不许把它也拦下来
 *    （拦了就是替使用者发明一条新拒绝）。
 * 4. `--module` 非法静默落回 `markt`（基线 `:221-223`）：同一份 config 在
 *    `content_replace` 下改字、在 `markt` 下不改字，两头都钉才看得见这条改写真的发生。
 * 5. `--paths` 的分隔符 `[,;\r\n]`（基线 `:459-461`）：一条 flag 给两个路径 ⇒ 处理 2 个文件。
 * 6. 未接腿那条：既是拒绝形状的正控，也是 `sleept` 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * stdin 那条队列（`--input -` / 管道）在这里没法喂真管道，判据留在 `src/cli.ts` 的
 * `inputFromArgs`（照基线 `:216-220` 的形状），标为未证。
 *
 * 本包现状：内核第 2 行的 `diff` 与 `markdown-ast.ts` 的 `remark` 本仓没装
 * （请求写在 `src/core.ts` / `src/markdown-ast.ts` 头注释与移植报告里），
 * 所以这些用例在依赖落地之前 import 就失败——不是 skip，也不放宽断言。
 *
 * @module xaihi-marku/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { MarkuResult } from '../src/core.ts'

/** 上游 `content_replace` 的那份 config：不依赖 AST，两个面都能算出同一结果。 */
const REPLACE_CONFIG = JSON.stringify({ patterns: [{ from: 'world', to: 'marku' }] })

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('marku CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xmarku 的脚本化路子', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xmarku')
  })

  it('--help 列出四个动作、workflow 与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xmarku')
    for (const verb of ['text', 'run', 'history', 'undo', 'workflow', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('text --help 给出基线的 14 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['text', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xmarku text')
    for (const flag of ['--module <value>', '--path <value>', '--paths <value>', '--input <value>',
      '--inputFile <value>', '--outputFile <value>', '--config <value>', '--historyPath <value>',
      '--undoId <value>', '--recursive', '--dryRun', '--write', '--enableUndo', '--json']) {
      expect(help).toContain(flag)
    }
    // 对照：workflow 那三条 flag 只在该子命令上出现（基线 `:172-177`）。
    expect(help).not.toContain('--workflowFile')
    const workflow = createHost()
    await runProgram(['workflow', '--help'], workflow)
    expect(workflow.stdoutText()).toContain('--workflowFile <value>')
    expect(workflow.stdoutText()).toContain('--name <value>')
  })

  it('text 处理内联文本并给 diff（基线 :151-160 那条腿）', async () => {
    const host = createHost()

    await runProgram(['text', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--input', 'hello world', '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Text processed: changed.')
    expect(result.data?.outputText).toBe('hello marku')
    expect(result.data?.filesProcessed).toBe(1)
    expect(result.data?.filesChanged).toBe(1)
    // 手推：文本腿的 diff 用默认文件名 `input.md`（`core.ts:153` / `:338`）。
    expect(result.data?.diffText).toContain('--- a/input.md')
    expect(result.data?.diffText).toContain('-hello world')
    expect(result.data?.diffText).toContain('+hello marku')
  })

  it('text 文本没变时说的是 no changes，且计数是 0 不是 1', async () => {
    const host = createHost()

    await runProgram(['text', '--module', 'content_replace', '--config', '{"patterns":[]}', '--input', 'same\n', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.message).toBe('Text processed: no changes.')
    expect(result.data?.filesChanged).toBe(0)
    expect(result.data?.diffText).toBe('')
  })

  it('--inputFile 读文件、--outputFile 写结果（基线 :216-220 与 :283）', async () => {
    const fixture = await createFixture({ 'in.md': 'hello world\n' })
    const host = createHost()
    const outPath = join(fixture.root, 'out.md')

    await runProgram(['text', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--inputFile', fixture.file('in.md'), '--outputFile', outPath, '--json'], host)

    expect(await readFile(outPath, 'utf8')).toBe('hello marku\n')
    // 阳性对照：`--outputFile` 只在有 `outputText` 时才写（基线那句 `&&` 的短路）⇒
    // `run` 腿的 `data.outputText` 是空串（`core.ts:533-546` 的默认），就不该冒出这个文件。
    const quiet = createHost()
    const missing = join(fixture.root, 'never.md')
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('in.md'), '--outputFile', missing, '--json'], quiet)
    expect(existsSync(missing)).toBe(false)
  })

  it('--module 非法时静默落回 markt（基线 :221-223 的正控）', async () => {
    const bogus = createHost()
    await runProgram(['text', '--module', 'boom_module', '--config', REPLACE_CONFIG, '--input', 'hello world', '--json'], bogus)
    const result = JSON.parse(bogus.stdoutText()) as MarkuResult
    // markt 对一句纯文本（没有 ATX 标题）什么都不做 ⇒ 落回那条腿才有的读数。
    expect(result.success).toBe(true)
    expect(result.data?.outputText).toBe('hello world')
    expect(result.data?.filesChanged).toBe(0)

    // 阳性对照：同一个 config 交给合法的 content_replace 就必须改字。
    const good = createHost()
    await runProgram(['text', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--input', 'hello world', '--json'], good)
    expect((JSON.parse(good.stdoutText()) as MarkuResult).data?.outputText).toBe('hello marku')
  })

  it('run 默认只预演：一个字节都不改，也不留账本', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const host = createHost()

    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md'), '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.data?.filesProcessed).toBe(1)
    expect(result.data?.filesChanged).toBe(1)
    // 手抄基线 `core.ts:191` 的消息模板（预演带 ` (dry-run)`）。
    expect(result.message).toBe('Processed 1 file(s), 1 changed (dry-run).')
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('hello world\n')
    expect(result.data?.undoId).toBe('')
    expect(existsSync(fixture.file('undo.json'))).toBe(false)
    // 对照：预演的 diff 在 `data.diffs` 里，按 basename 打 header（`core.ts:183`）。
    expect(result.data?.diffs[0]).toMatchObject({ file: fixture.file('a.md'), changed: true })
    expect(result.data?.diffs[0]!.diff).toContain('--- a/a.md')
  })

  it('run --write 落盘并记账，history 读得回来，undo 回滚', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const journal = fixture.file('undo.json')

    const wrote = createHost()
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md'), '--write', '--historyPath', journal, '--json'], wrote)
    const result = JSON.parse(wrote.stdoutText()) as MarkuResult
    // 手抄基线 `core.ts:191`：非预演那句没有 `(dry-run)` 后缀。
    expect(result.message).toBe('Processed 1 file(s), 1 changed.')
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('hello marku\n')
    expect(result.data?.undoId).toBeTruthy()
    expect(existsSync(journal)).toBe(true)

    const listed = createHost()
    await runProgram(['history', '--historyPath', journal, '--json'], listed)
    const history = JSON.parse(listed.stdoutText()) as MarkuResult
    expect(history.message).toBe('Loaded 1 history record(s).')
    expect(history.data?.history).toHaveLength(1)
    expect(history.data?.history[0]!.module).toBe('content_replace')
    expect(history.data?.history[0]!.files).toHaveLength(1)

    const undone = createHost()
    await runProgram(['undo', '--historyPath', journal, '--json'], undone)
    expect((JSON.parse(undone.stdoutText()) as MarkuResult).message).toBe('Undo completed: 1 file(s).')
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('hello world\n')

    // 阳性对照：账本已全部撤销 ⇒ 第二次 undo 说"没有可撤销的记录"，不许二次回写。
    const twice = createHost()
    await runProgram(['undo', '--historyPath', journal, '--json'], twice)
    const second = process.exitCode
    process.exitCode = 0
    expect(second).toBe(1)
    expect((JSON.parse(twice.stdoutText()) as MarkuResult).message).toBe('No undoable record found.')
  })

  it('--undoId 指定记录，找不到时报那句带 id 的话', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const journal = fixture.file('undo.json')
    const wrote = createHost()
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md'), '--write', '--historyPath', journal, '--json'], wrote)
    const undoId = (JSON.parse(wrote.stdoutText()) as MarkuResult).data?.undoId

    const missing = createHost()
    await runProgram(['undo', '--historyPath', journal, '--undoId', 'nope', '--json'], missing)
    expect(process.exitCode).toBe(1)
    // 手抄基线 `core.ts:427` 的模板。
    expect((JSON.parse(missing.stdoutText()) as MarkuResult).message).toBe('Undo record not found: nope')

    const byId = createHost()
    await runProgram(['undo', '--historyPath', journal, '--undoId', String(undoId), '--json'], byId)
    expect((JSON.parse(byId.stdoutText()) as MarkuResult).success).toBe(true)
  })

  it('run --write 不给 --historyPath 就在动手之前拒绝，文件没被动过（防御的正控）', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const host = createHost()

    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md'), '--write'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('--historyPath is required with --write')
    // 这条是"为什么要早拒"的证据：照基线跑，这里会是已经改过的内容。
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('hello world\n')
    expect(host.stdoutText()).toBe('')
  })

  it('--write --no-enableUndo 是上游允许的形状：写盘而不记账', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const host = createHost()

    // 布尔 flag 的"假"写法走 vendored citty 子集的 `--no-x` 取反（`parseArgs` 认这个前缀），
    // 而不是 `--enableUndo false`——后者会被当成多余的位置参（退出码 2）。
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md'), '--write', '--no-enableUndo', '--json'], host)

    // 阳性对照（反向）：闸门不许把"显式不记账"也拦下来，那是替使用者发明拒绝。
    expect(host.stderrText()).not.toContain('--historyPath is required')
    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.success).toBe(true)
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('hello marku\n')
    expect(result.data?.undoId).toBe('')
  })

  it('history / undo 没给 --historyPath 时由 platform 那句拒绝点名（退出码 1）', async () => {
    const host = createHost()

    await runProgram(['history', '--json'], host)

    expect(process.exitCode).toBe(1)
    // 手抄 `src/platform.ts` 的那句拒绝：DSH 没有"每插件数据目录"，路径必须显式给。
    expect(host.stdoutText()).toContain('no historyDir configured')
    expect(host.stdoutText()).toContain('historyPath')
  })

  it('--paths 一条 flag 用分号切两个文件（基线 :459-461 的 [,;\\r\\n]）', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n', 'b.md': 'world\n' })
    const host = createHost()

    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', `${fixture.file('a.md')};${fixture.file('b.md')}`, '--json'], host)

    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.data?.filesProcessed).toBe(2)
    expect(result.message).toBe('Processed 2 file(s), 2 changed (dry-run).')
    // 阳性对照：`--path` 位置参那条腿（基线 `:226` 的 seed）也收一条。
    const single = createHost()
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--path', fixture.file('a.md'), '--json'], single)
    expect((JSON.parse(single.stdoutText()) as MarkuResult).data?.filesProcessed).toBe(1)
  })

  it('--recursive 才下降子目录，.txt 一律不算（基线 core.ts:305-322）', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n', 'sub/b.md': 'world\n', 'note.txt': 'hello world\n' })

    const flat = createHost()
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--path', fixture.root, '--json'], flat)
    expect((JSON.parse(flat.stdoutText()) as MarkuResult).data?.filesProcessed).toBe(1)

    // 阳性对照：加 `--recursive` 就看见 sub/b.md ⇒ 两个文件，note.txt 始终不进。
    const deep = createHost()
    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--path', fixture.root, '--recursive', '--json'], deep)
    const result = JSON.parse(deep.stdoutText()) as MarkuResult
    expect(result.data?.filesProcessed).toBe(2)
    expect(result.data?.diffs.map((item) => item.file)).toEqual([join(fixture.root, 'a.md'), join(fixture.root, 'sub', 'b.md')])
  })

  it('非 JSON 时打结论 + Summary 面板 + 每文件一行（基线 :428-457 的形状）', async () => {
    const fixture = await createFixture({ 'a.md': 'hello world\n' })
    const host = createHost()

    await runProgram(['run', '--module', 'content_replace', '--config', REPLACE_CONFIG, '--paths', fixture.file('a.md')], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Processed 1 file(s), 1 changed (dry-run).')
    expect(out).toContain('Summary')
    expect(out).toContain('files: 1  changed: 1')
    expect(out).toContain('changed')
    expect(out).toContain('a.md')
  })

  it('workflow 腿：内联 JSON 逐步喂输出，--name 拒绝并点名 settings 缝', async () => {
    const host = createHost()
    const workflow = JSON.stringify({
      id: 'wf',
      name: 'seq',
      steps: [
        { id: 's1', module: 'content_replace', config: { patterns: [{ from: 'alpha', to: 'beta' }] } },
        { id: 's2', module: 'content_replace', config: { patterns: [{ from: 'beta', to: 'gamma' }] } },
      ],
    })

    await runProgram(['workflow', '--workflow', workflow, '--input', 'alpha\n', '--json'], host)

    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Workflow processed text: changed.')
    expect(result.data?.outputText).toBe('gamma\n')
    expect(result.data?.workflow?.stepCount).toBe(2)
    expect(result.data?.workflow?.workflowName).toBe('seq')
    expect(result.data?.workflow?.sources[0]?.steps.map((step) => step.outputText)).toEqual(['beta\n', 'gamma\n'])

    // 阳性对照：`--name` 找的是配置里的 workflowLibrary，bin 够不到 settings 缝 ⇒
    // 必须先报原因，不许退化成内核那句 "missing or malformed"。
    const named = createHost()
    await runProgram(['workflow', '--name', 'seq', '--input', 'alpha\n', '--json'], named)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(named.stderrText()).toContain('workflowLibrary')
    expect(named.stderrText()).not.toContain('missing or malformed')

    // 对照：什么都没给时才由内核说话（基线 `:243-258` 返回 undefined 的那条路）。
    const bare = createHost()
    await runProgram(['workflow', '--input', 'alpha\n', '--json'], bare)
    expect(process.exitCode).toBe(1)
    expect((JSON.parse(bare.stdoutText()) as MarkuResult).message).toContain('missing or malformed')
  })

  it('workflow 坏模块在评估之前就失败（基线 core.ts:214-215）', async () => {
    const fixture = await createFixture({ 'a.md': 'alpha\n' })
    const host = createHost()
    const workflow = JSON.stringify({ id: 'wf', name: 'guarded', steps: [{ id: 's1', module: 'boom_module', config: {} }] })

    await runProgram(['workflow', '--workflow', workflow, '--path', fixture.file('a.md'), '--write', '--historyPath', fixture.file('undo.json'), '--json'], host)

    expect(process.exitCode).toBe(1)
    const result = JSON.parse(host.stdoutText()) as MarkuResult
    expect(result.message).toContain('unknown module: boom_module')
    expect(await readFile(fixture.file('a.md'), 'utf8')).toBe('alpha\n')
    expect(existsSync(fixture.file('undo.json'))).toBe(false)
  })

  it('没给任何输入时由内核说话（退出码 1），不是参数校验抢先', async () => {
    const host = createHost()

    await runProgram(['run', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('No input paths or text provided.')
    expect(host.stderrText()).not.toContain('Missing required argument')

    // 阳性对照：路径给了但里面没有 Markdown ⇒ 另一句（两条闸门不共用文案）。
    const empty = await createFixture({ 'readme.txt': 'x\n' })
    const none = createHost()
    await runProgram(['run', '--path', empty.root, '--json'], none)
    expect((JSON.parse(none.stdoutText()) as MarkuResult).message).toBe('No Markdown files found.')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['text', '--nope', 'x'], host)

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
    // 面级拒绝必须给一条能走的脚本化路子。
    expect(host.stderrText()).toContain('xmarku text')
    expect(host.stderrText()).not.toContain('Missing required argument')

    // 结构尺：三条未接腿一个参数都不许标 required。
    // 阳性对照：给 `ui` 加一条 `required: true`，这条立刻红。
    expect(UNWIRED_INTERACTIVE_LEGS).toEqual(['ui', 'gd', 'guided'])
    const subs = program.subCommands ?? {}
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const specs = Object.values(subs[leg]?.args ?? {})
      expect(specs.every((spec) => spec.required !== true)).toBe(true)
    }
    // 对照：`--name` 那条未接的 flag 也没被标 required（同一个失真形状）。
    expect(Object.values(subs.workflow?.args ?? {}).every((spec) => spec.required !== true)).toBe(true)
  })
})

/**
 * 夹具：在 `mkdtemp` 出来的目录里按名字建文件（`sub/b.md` 会连目录一起建）。
 * 前缀 `xaihi-marku-cli-` 与 `crashu` / `samea` 同写法（临时目录前缀属于 Xaihi，ADR-0010）。
 */
async function createFixture(seeds: Record<string, string>): Promise<{ root: string; file: (name: string) => string }> {
  const root = await mkdtemp(join(tmpdir(), 'xaihi-marku-cli-'))
  tempRoots.push(root)
  for (const [name, content] of Object.entries(seeds)) {
    const path = join(root, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content, 'utf8')
  }
  return { root, file: (name: string) => join(root, name) }
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
