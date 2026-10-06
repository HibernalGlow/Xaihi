/**
 * marku 内核的保真测试：断的是"从 `noxide` 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组 12 条**逐条手抄**自基线 `packages/nodes/marku/src/core.test.ts`（tag `noxide`，
 *   210 行）的全部用例，连它那份 `createMemoryRuntime` 与自带的 `join` / `dirname` /
 *   `basename` 假实现一起搬（`"# A\n# A\n"`、`"# A\n"`、`"- Title\n  - Child\n"`、
 *   `"hello marku"`、`"Write failed at /doc/b.md: disk full"`、`"/history/undo.json"`
 *   全是上游手写的常量），`defaultHistoryPath()` 也照它的 `() => "/history/undo.json"`。
 * - 第 2 组钉基线 `core.test.ts` **没有**覆盖的分支，真源是 `core.ts` 的行号，逐条写在注释里：
 *   `normalizeMarkuInput`（`:123-137`）、`uniqueClean` / `clean`（`:525-531`）、
 *   `collectMarkdownFiles` 的排序与不递归（`:305-322`）、`isMarkdownFile`（`:504-506`）、
 *   `createUnifiedDiff` 的空 diff 与默认文件名（`:338-342`）、
 *   `history` 的 20 条上限（`:418-421`）、账本只留 100 条（`:450`）、
 *   `parseHistory` 把损坏 JSON 当空历史（`:458-467`）、`undo` 缺省时取第一条未撤销（`:426`）、
 *   `applyMarkuModule` 那五个**纯正则**模块（`:344-416`，不需要 AST 的那五条腿）。
 * - 第 2 组每个期望值都是手推的（推导写在用例里），不由被测函数算出来。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * 本包现状要说清楚：内核第 2 行的 `diff` 与邻居 `markdown-ast.ts` 的 `remark` 本仓**没装**
 * （请求与影响面在 `src/core.ts` / `src/markdown-ast.ts` 头注释与移植报告里），
 * 所以这一档用例在依赖落地之前**一条都跑不到**——这不是 skip，而是 import 就失败。
 * 用例照写、不放宽、不删：`diff` 与 `remark` 装上那一刻它们就是验收判据。
 *
 * @module xaihi-marku/tests/core
 */

import { describe, expect, it } from 'vitest'
import type { MarkuDirEntry, MarkuPathInfo, MarkuRuntime } from '../src/core.ts'
import {
  applyMarkuModule,
  collectMarkdownFiles,
  createUnifiedDiff,
  isMarkuModuleId,
  MARKU_MODULES,
  normalizeMarkuInput,
  runMarku,
} from '../src/core.ts'

describe('marku core（基线 core.test.ts 12 条逐条搬来）', () => {
  // 基线 `core.test.ts:5-8`。
  it('markt converts headings to lists', () => {
    expect(applyMarkuModule('markt', '# Title\n## Child\n', { mode: 'h2l', indent: 2 })).toBe('- Title\n  - Child\n')

    // 阳性对照：`indent` 换成 4 就要看到四空格一级（`markdown-transforms.ts:12-27` 的 padding），
    // 与 `mode: "l2h"` 那条反向腿分得开。
    expect(applyMarkuModule('markt', '# Title\n## Child\n', { mode: 'h2l', indent: 4 })).toBe('- Title\n    - Child\n')
    expect(applyMarkuModule('markt', '- Title\n  - Child\n', { mode: 'l2h', indent: 2 })).toBe('# Title\n## Child\n')
  })

  // 基线 `core.test.ts:10-13`。
  it('content replace supports JSON patterns', () => {
    expect(applyMarkuModule('content_replace', 'hello world', { patterns: JSON.stringify([{ from: 'world', to: 'marku' }]) }))
      .toBe('hello marku')

    // 阳性对照：`patterns` 给成**字符串数组的非法形状**（`parsePatterns` 只认
    // `from` 是字符串的对象，`core.ts:469-484`）就一个字都不改。
    expect(applyMarkuModule('content_replace', 'hello world', { patterns: ['world'] })).toBe('hello world')
    // 对照：`to` 缺省就是删除（`core.ts:378` 的 `pattern.to ?? ""`）。
    expect(applyMarkuModule('content_replace', 'hello world', { patterns: [{ from: ' world' }] })).toBe('hello')
  })

  // 基线 `core.test.ts:15-23`。
  it('creates unified diff for changed text', () => {
    const diff = createUnifiedDiff('a\nkeep\nstable\n', 'b\nkeep\nstable\n', 'x.md')
    expect(diff).toContain('--- a/x.md')
    expect(diff).toContain('-a')
    expect(diff).toContain('+b')
    expect(diff).toContain(' keep')
    expect(diff).not.toContain('-keep')
    expect(diff).not.toContain('+keep')

    // 阳性对照：两边相同就是空串（`core.ts:339`），不是"只有 header 的补丁"。
    expect(createUnifiedDiff('same\n', 'same\n', 'x.md')).toBe('')
  })

  // 基线 `core.test.ts:25-31`。
  it('runs file dry-run without writing', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': '# A\n# A\n' })
    const result = await runMarku({ module: 'content_dedup', paths: ['/doc/a.md'], dryRun: true }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.filesChanged).toBe(1)
    expect(runtime.files.get('/doc/a.md')).toBe('# A\n# A\n')

    // 阳性对照：预演不许留撤销记录（`core.ts:186-188` 的 `!normalized.dryRun`）。
    expect(runtime.files.has('/history/undo.json')).toBe(false)
    expect(result.data?.undoId).toBe('')
  })

  // 基线 `core.test.ts:33-41`。
  it('writes files and can undo', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': '# A\n# A\n' })
    const result = await runMarku({ module: 'content_dedup', paths: ['/doc/a.md'], dryRun: false }, runtime)
    expect(result.data?.filesChanged).toBe(1)
    expect(runtime.files.get('/doc/a.md')).toBe('# A\n')
    const undo = await runMarku({ action: 'undo' }, runtime)
    expect(undo.success).toBe(true)
    expect(runtime.files.get('/doc/a.md')).toBe('# A\n# A\n')

    // 阳性对照：账本已经全被撤销，第二次 `undo` 必须说"没有可撤销的记录"（`core.ts:427`），
    // 不许把同一次写回放第二遍。
    const twice = await runMarku({ action: 'undo' }, runtime)
    expect(twice.success).toBe(false)
    expect(twice.message).toBe('No undoable record found.')
  })

  const replaceStep = (id: string, from: string, to: string) => ({
    id,
    module: 'content_replace',
    config: { patterns: [{ from, to }] },
  })

  // 基线 `core.test.ts:49-60`。
  it('workflow runs editor text through steps in order without touching paths', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'alpha\n' })
    const workflow = { id: 'wf', name: 'seq', steps: [replaceStep('s1', 'alpha', 'beta'), replaceStep('s2', 'beta', 'gamma')] }

    const result = await runMarku({ action: 'workflow', workflow, inputText: 'alpha\n', paths: ['/doc/a.md'] }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.outputText).toBe('gamma\n')
    expect(result.data?.workflow?.sources).toHaveLength(1)
    expect(result.data?.workflow?.sources[0]?.steps.map((step) => step.outputText)).toEqual(['beta\n', 'gamma\n'])
    expect(runtime.files.get('/doc/a.md')).toBe('alpha\n')

    // 阳性对照：`workflow` 腿里 `inputText` 优先于 `paths`（`core.ts:223`），
    // 所以 `filesProcessed` 是 1（那段文本），不是那个文件。
    expect(result.data?.filesProcessed).toBe(1)
    expect(result.data?.workflow?.stepCount).toBe(2)
    expect(result.data?.workflow?.workflowName).toBe('seq')
  })

  // 基线 `core.test.ts:62-80`。
  it('workflow processes files independently and writes final outputs with undo', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'alpha\n', '/doc/b.md': 'beta\n' })
    const workflow = { id: 'wf', name: 'pipeline', steps: [replaceStep('s1', 'alpha', 'beta'), replaceStep('s2', 'beta', 'gamma')] }

    const result = await runMarku({ action: 'workflow', workflow, paths: ['/doc'], dryRun: false }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.filesProcessed).toBe(2)
    expect(result.data?.filesChanged).toBe(2)
    // Sources never feed one another: b.md starts from its own original text.
    expect(runtime.files.get('/doc/a.md')).toBe('gamma\n')
    expect(runtime.files.get('/doc/b.md')).toBe('gamma\n')
    expect(result.data?.undoId).toBeTruthy()

    const undo = await runMarku({ action: 'undo' }, runtime)
    expect(undo.success).toBe(true)
    expect(runtime.files.get('/doc/a.md')).toBe('alpha\n')
    expect(runtime.files.get('/doc/b.md')).toBe('beta\n')
  })

  // 基线 `core.test.ts:82-93`。
  it('workflow dry-run returns diffs without writing or recording undo', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'alpha\n' })
    const workflow = { id: 'wf', name: 'dry', steps: [replaceStep('s1', 'alpha', 'beta')] }

    const result = await runMarku({ action: 'workflow', workflow, paths: ['/doc/a.md'], dryRun: true }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.diffs[0]?.changed).toBe(true)
    expect(result.data?.undoId).toBe('')
    expect(runtime.files.get('/doc/a.md')).toBe('alpha\n')
    expect(runtime.files.has('/history/undo.json')).toBe(false)
  })

  // 基线 `core.test.ts:95-105`。
  it('workflow with an unknown module fails validation before any evaluation or write', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'alpha\n' })
    const workflow = { id: 'wf', name: 'guarded', steps: [replaceStep('s1', 'alpha', 'beta'), { id: 's2', module: 'boom_module', config: {} }] }

    const result = await runMarku({ action: 'workflow', workflow, paths: ['/doc'], dryRun: false }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toContain('unknown module: boom_module')
    expect(result.data?.workflow).toBeUndefined()
    expect(runtime.files.get('/doc/a.md')).toBe('alpha\n')

    // 阳性对照：校验是在**评估之前**做的（`core.ts:214-215`），所以坏模块那条腿
    // 一条 step 结果都不该有 —— `sources` 也不该出现。
    expect(result.data?.diffs).toEqual([])
  })

  // 基线 `core.test.ts:107-123`。
  it('workflow step failure stops later sources and retains prior results without writing', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'ok\n', '/doc/b.md': 'ok\n', '/doc/c.md': 'ok\n' })
    const workflow = {
      id: 'wf',
      name: 'stop',
      steps: [{ id: 's1', module: 'content_replace', config: { patterns: [{ from: 'ok', to: 'x', regex: true, flags: '@invalid' }] } }],
    }

    const result = await runMarku({ action: 'workflow', workflow, paths: ['/doc'], dryRun: false }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toContain('Step 1 (content_replace) failed')
    // Evaluation stopped at the first failing source (a.md, sorted first); nothing was written.
    expect(result.data?.workflow?.sources).toHaveLength(1)
    expect(runtime.files.get('/doc/a.md')).toBe('ok\n')
    expect(runtime.files.get('/doc/c.md')).toBe('ok\n')

    // 阳性对照：坏 flag 那条**必须**在评估期抛（`applyWorkflowStep` → `transformContentReplace`
    // 的 `new RegExp(from, "@invalid")`），并且 `undoId` 是空串——写盘与记账都在评估之后。
    expect(result.data?.undoId).toBe('')
    expect(runtime.files.has('/history/undo.json')).toBe(false)
  })

  // 基线 `core.test.ts:125-145`。
  it('workflow write failure keeps the undo record and reports the exact path', async () => {
    const runtime = createMemoryRuntime({ '/doc/a.md': 'alpha\n', '/doc/b.md': 'alpha\n' })
    const originalWrite = runtime.writeText.bind(runtime)
    runtime.writeText = async (path: string, content: string) => {
      if (path === '/doc/b.md') throw new Error('disk full')
      await originalWrite(path, content)
    }
    const workflow = { id: 'wf', name: 'partial', steps: [replaceStep('s1', 'alpha', 'beta')] }

    const result = await runMarku({ action: 'workflow', workflow, paths: ['/doc'], dryRun: false }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Write failed at /doc/b.md: disk full')
    expect(result.data?.undoId).toBeTruthy()

    runtime.writeText = originalWrite
    const undo = await runMarku({ action: 'undo', undoId: result.data?.undoId }, runtime)
    expect(undo.success).toBe(true)
    expect(runtime.files.get('/doc/a.md')).toBe('alpha\n')
    expect(runtime.files.get('/doc/b.md')).toBe('alpha\n')

    // 阳性对照：`workflow` 腿的账本记在写盘**之前**（`core.ts:276-278`，注释原话
    // "No retry and no silent rollback"）⇒ 半程失败也留得住回退依据。
    // 同一条夹具喂给 `run` 腿时顺序相反（`core.ts:186`：写完才记），两条腿不许"统一"。
    const runLeg = createMemoryRuntime({ '/doc/a.md': 'alpha\n' })
    const runResult = await runMarku({ action: 'run', module: 'content_replace', stepConfig: { patterns: [{ from: 'alpha', to: 'beta' }] }, paths: ['/doc/a.md'], dryRun: false }, runLeg)
    expect(runResult.success).toBe(true)
    expect(runResult.data?.undoId).toBe('abc123')
    expect(runLeg.files.get('/doc/a.md')).toBe('beta\n')
  })

  // 基线 `core.test.ts:147-160`。
  it('workflow rejects empty definitions and missing sources', async () => {
    const runtime = createMemoryRuntime({})
    const empty = await runMarku({ action: 'workflow', workflow: { id: 'wf', name: 'empty', steps: [] } }, runtime)
    expect(empty.success).toBe(false)
    expect(empty.message).toContain('no steps')

    const missing = await runMarku({ action: 'workflow' }, runtime)
    expect(missing.success).toBe(false)
    expect(missing.message).toContain('missing or malformed')

    const noSource = await runMarku({ action: 'workflow', workflow: { id: 'wf', name: 'x', steps: [replaceStep('s1', 'a', 'b')] } }, runtime)
    expect(noSource.success).toBe(false)
    expect(noSource.message).toBe('No input paths or text provided.')

    // 阳性对照：`history` 与 `undo` 也不许被当成"没有源"这句话——两条闸门文案不同
    // （`core.ts:163` 只在 text/run 那条腿上说话）。
    const undoMissing = await runMarku({ action: 'undo' }, runtime)
    expect(undoMissing.message).toBe('No undoable record found.')
  })
})

describe('normalizeMarkuInput 与内核默认（基线 core.test.ts 未覆盖，判据照 core.ts:123-137）', () => {
  it('action 由输入形状推，snake_case 与 camelCase 都吃', () => {
    // 手推：`inputText` 非空 ⇒ `text`，否则 `run`（`:125` 的三元）。
    expect(normalizeMarkuInput({ inputText: '# Hi' }).action).toBe('text')
    expect(normalizeMarkuInput({ input_text: '# Hi' }).action).toBe('text')
    expect(normalizeMarkuInput({ paths: ['/a.md'] }).action).toBe('run')
    expect(normalizeMarkuInput({}).action).toBe('run')

    // 阳性对照：snake_case 那一套必须真的生效，而不是被 camelCase 的空值盖掉。
    const snake = normalizeMarkuInput({ input_text: 'x', step_config: { mode: 'l2h' }, dry_run: false, enable_undo: false, history_path: ' /h.json ', undo_id: 'u1', recursive: true })
    expect(snake).toMatchObject({ inputText: 'x', stepConfig: { mode: 'l2h' }, dryRun: false, enableUndo: false, historyPath: '/h.json', undoId: 'u1', recursive: true })

    // 对照：内核默认是 `dryRun: true`（`:132`），与 crashu 那份（默认 false）方向相反。
    expect(normalizeMarkuInput({}).dryRun).toBe(true)
    expect(normalizeMarkuInput({}).enableUndo).toBe(true)
    expect(normalizeMarkuInput({}).recursive).toBe(false)
    expect(normalizeMarkuInput({}).module).toBe('markt')
  })

  it('paths 去空白、剥一层引号、Set 保序去重', () => {
    // 手推：clean(" '/a' ") ⇒ "/a"，与后面那个裸 "/a" 撞 Set；空串被 filter(Boolean) 丢掉
    // （`:525-531`），顺序是**首次出现序**。
    expect(normalizeMarkuInput({ paths: [" '/a' ", '/a', '', ' /b '] }).paths).toEqual(['/a', '/b'])

    // 阳性对照：没给 `paths` 时是空数组，不是 `undefined`（`uniqueClean(input.paths ?? [])`）。
    expect(normalizeMarkuInput({}).paths).toEqual([])
  })

  it('isMarkuModuleId 与 MARKU_MODULES 的九条次序（词表与图标的配对依据）', () => {
    expect(MARKU_MODULES.map((item) => item.id)).toEqual([
      'markt', 'consecutive_header', 'content_dedup', 'html2sy_table', 'title_convert',
      'content_replace', 'single_orderlist_remover', 'image_path_replacer', 't2list',
    ])
    expect(isMarkuModuleId('markt')).toBe(true)
    // 阳性对照：次序是 `interaction.ts` 那串图标 `≡ # ◇ ▦ Aa ↔ 1. ▣ ☷` 的下标来源，
    // 任意两条互换都会让下面这条"最后一个是 t2list"红。
    expect(MARKU_MODULES[8]!.id).toBe('t2list')
    expect(isMarkuModuleId('MARKT')).toBe(false)
    expect(isMarkuModuleId('boom_module')).toBe(false)
    // 对照：非法模块在 `runMarku` 里说的是内核那句（`:149`），不是"没有路径"那句。
    return runMarku({ module: 'boom_module', paths: ['/doc/a.md'] }, createMemoryRuntime({ '/doc/a.md': 'a\n' })).then((result) => {
      expect(result.message).toBe('Unknown module: boom_module')
      expect(result.data?.errors).toEqual(['Unknown module: boom_module'])
    })
  })
})

describe('collectMarkdownFiles 与 createUnifiedDiff 的形状（core.ts:305-322, 338-342）', () => {
  it('非递归只收一层，递归才下降，排序是 numeric-aware', async () => {
    const runtime = createMemoryRuntime({
      '/doc/a.md': 'a\n',
      '/doc/a2.md': 'a2\n',
      '/doc/a10.md': 'a10\n',
      '/doc/note.txt': 'skip\n',
      '/doc/UP.MARKDOWN': 'upper\n',
      '/doc/sub/b.md': 'b\n',
    })

    // 手推：`.md|.markdown|.mdown`（大小写不敏感，`core.ts:504-506`）⇒ note.txt 不进、
    // UP.MARKDOWN 进；比较器是 `localeCompare(…, { numeric: true, sensitivity: 'base' })`
    // ⇒ 忽略大小写按字母序（`a` < `u`，所以 UP.MARKDOWN 排最后），且 a2 排在 a10 前面
    // （纯字典序会反过来，那条就是 numeric 的正控）。
    const flat = await collectMarkdownFiles(['/doc'], false, runtime)
    expect(flat).toEqual(['/doc/a.md', '/doc/a2.md', '/doc/a10.md', '/doc/UP.MARKDOWN'])

    // 阳性对照：`recursive: true` 才看见 sub/b.md；不存在的路径被 `pathInfo.exists` 静默跳过。
    // 手推整份次序：比较器比的是**整串**，`/doc/s…` 落在 `/doc/U…` 前面（忽略大小写后 s < u），
    // 所以降下来的那条不是追加在末尾。
    const deep = await collectMarkdownFiles(['/doc', '/nope'], true, runtime)
    expect(deep).toEqual(['/doc/a.md', '/doc/a2.md', '/doc/a10.md', '/doc/sub/b.md', '/doc/UP.MARKDOWN'])
    const missing = await collectMarkdownFiles(['/nope'], true, runtime)
    expect(missing).toEqual([])

    // 对照：同一路径给两遍只算一次（`[...new Set(files)]`），`runMarku` 因此不会重复处理。
    const dupes = await collectMarkdownFiles(['/doc/a.md', '/doc/a.md'], false, runtime)
    expect(dupes).toEqual(['/doc/a.md'])
  })

  it('diff 的默认文件名与"没有变化"那句话', () => {
    // 手推：默认 filename 是 `input.md`（`:338`），header 从补丁里第一个 `--- ` 切起。
    expect(createUnifiedDiff('a\n', 'b\n')).toContain('--- a/input.md')
    expect(createUnifiedDiff('a\n', 'a\n')).toBe('')

    // 对照：文本腿在无变化时说的是 `no changes`（`:154`），计数是 0 而不是 1。
    return runMarku({ action: 'text', module: 't2list', inputText: 'plain\n' }, createMemoryRuntime({})).then((result) => {
      expect(result.message).toBe('Text processed: no changes.')
      expect(result.data?.filesChanged).toBe(0)
      expect(result.data?.diffText).toBe('')
      expect(result.data?.filesProcessed).toBe(1)
    })
  })
})

describe('五个不依赖 AST 的模块（core.ts:344-416）与账本上限（core.ts:418-451）', () => {
  it('consecutive_header 的三种模式', () => {
    const text = '# A\n# B\n# C\ntail\n'
    // 手推：`remove`（默认）丢掉跟在标题后面的标题行；`keep_first` 走同一个分支；
    // `merge` 用 ` / ` 拼，并把后一条的 `#` 前缀剥掉（`:350-352`）。
    expect(applyMarkuModule('consecutive_header', text, {})).toBe('# A\ntail\n')
    expect(applyMarkuModule('consecutive_header', text, { mode: 'keep_first' })).toBe('# A\ntail\n')
    expect(applyMarkuModule('consecutive_header', text, { processing_mode: 'merge' })).toBe('# A / B / C\ntail\n')

    // 阳性对照：模式名认不出来时**既不 merge 也不 keep**，走 `remove`（那条 `else if` 的
    // 两个分支合成一条）——写成一个 switch 漏一条就会静默保留重复标题。
    expect(applyMarkuModule('consecutive_header', text, { mode: 'nonsense' })).toBe('# A\ntail\n')
  })

  it('html2sy_table 补空列并剥内联标签', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>'
    // 手推：宽度取最宽行 2，短的那行补一个空串 ⇒ 表体是 `| 1 |  |`。
    expect(applyMarkuModule('html2sy_table', html, {}))
      .toBe('| A | B |\n| --- | --- |\n| 1 |  |')

    // 阳性对照：`&nbsp;` / `&amp;` / 内联标签都被 `cleanHtml` 收掉（`:500-502`）。
    expect(applyMarkuModule('html2sy_table', '<table><tr><td>a&nbsp;<b>c</b>&amp;d</td></tr></table>', {}))
      .toBe('| a c&d |\n| --- |')
    // 对照：没有 `<tr>` 的 `<table>` 原样留着（`:365` 的 `if (!rows.length) return table`）。
    expect(applyMarkuModule('html2sy_table', '<table></table>', {})).toBe('<table></table>')
  })

  it('single_orderlist_remover 只剥孤立的一条，t2list 按表头展开', () => {
    // 手推：夹在两条编号行之间的那条不动（`:389-393` 的前后邻居判据）。
    expect(applyMarkuModule('single_orderlist_remover', '1. solo\n', {})).toBe('solo\n')
    expect(applyMarkuModule('single_orderlist_remover', '1. a\n2. b\n', {})).toBe('1. a\n2. b\n')

    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n'
    expect(applyMarkuModule('t2list', table, {})).toBe('- A: 1; B: 2\n- A: 3; B: 4\n')

    // 阳性对照：缺分隔行就不是表格，原样输出（`isTableRow` + 那行 `:?-{3,}` 判据，`:403`）。
    expect(applyMarkuModule('t2list', '| A | B |\n| 1 | 2 |\n', {})).toBe('| A | B |\n| 1 | 2 |\n')
  })

  it('history 只回前 20 条，账本坏掉就当空历史', async () => {
    const records = Array.from({ length: 25 }, (_unused, index) => ({
      id: `r${String(index)}`,
      timestamp: '2026-01-01T00:00:00.000Z',
      module: 'markt',
      summary: `marku markt: 1 file(s)`,
      files: [{ path: '/doc/a.md', content: 'x\n' }],
    }))
    const runtime = createMemoryRuntime({})
    await runtime.writeText('/history/undo.json', JSON.stringify(records))

    const listed = await runMarku({ action: 'history' }, runtime)
    expect(listed.success).toBe(true)
    expect(listed.message).toBe('Loaded 25 history record(s).')
    // 手推：消息数的是**全部**记录（`:420` 的 `records.length`），
    // 而 `data.history` 只回前 20 条（同那一行的 `slice(0, 20)`）。
    expect(listed.data?.history).toHaveLength(20)
    expect(listed.data?.history[0]?.id).toBe('r0')

    // 阳性对照：缺省 `undo` 取的是**第一条未撤销**（`:426`），给了 id 就按 id 找。
    const byId = await runMarku({ action: 'undo', undoId: 'r24' }, runtime)
    expect(byId.success).toBe(true)
    expect(byId.data?.undoId).toBe('r24')

    // 对照：损坏 JSON / 不是数组 / 条目缺字段一律当空历史，不抛（`:458-467`）。
    const broken = createMemoryRuntime({})
    await broken.writeText('/history/undo.json', '{ not json')
    expect((await runMarku({ action: 'history' }, broken)).data?.history).toEqual([])
    const shaped = createMemoryRuntime({})
    await shaped.writeText('/history/undo.json', JSON.stringify([{ id: 1, files: 'no' }]))
    expect((await runMarku({ action: 'history' }, shaped)).data?.history).toEqual([])

    // 对照：写盘时账本只留前 100 条（`:450` 的 `slice(0, 100)`）——25 条 + 新的一条仍全在。
    const grown = createMemoryRuntime({ '/doc/a.md': '# A\n# A\n' })
    await grown.writeText('/history/undo.json', JSON.stringify(records))
    const wrote = await runMarku({ action: 'run', module: 'content_dedup', paths: ['/doc/a.md'], dryRun: false }, grown)
    const saved = JSON.parse(String(grown.files.get('/history/undo.json'))) as Array<{ id: string }>
    expect(wrote.data?.undoId).toBe('abc123')
    expect(saved).toHaveLength(26)
    expect(saved[0]!.id).toBe('abc123')
  })

  it('没有路径也没有文本时是内核说话（core.ts:163），不是接线层编的第二句', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runMarku({ action: 'run', paths: [] }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('No input paths or text provided.')

    // 阳性对照：路径给了但一个 .md 都没有 ⇒ 是**另一句**（`:166`），两条闸门不共用文案。
    const none = await runMarku({ action: 'run', paths: ['/doc'] }, createMemoryRuntime({ '/doc/readme.txt': 'x\n' }))
    expect(none.message).toBe('No Markdown files found.')
  })
})

/**
 * 基线 `core.test.ts:162-210` 那份内存 runtime 逐字搬来（含它自己的 `join` / `dirname` /
 * `basename` 假实现与 `defaultHistoryPath: () => "/history/undo.json"`），
 * 这样上面 12 条用例读的是同一套假文件系统语义。
 */
function createMemoryRuntime (seed: Record<string, string>): MarkuRuntime & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed))
  const dirs = new Set<string>(['/'])
  for (const path of files.keys()) dirs.add(dirname(path))

  return {
    files,
    async pathInfo (path: string): Promise<MarkuPathInfo> {
      return { path, exists: files.has(path) || dirs.has(path), isFile: files.has(path), isDirectory: dirs.has(path) }
    },
    async listDir (path: string): Promise<MarkuDirEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`
      const names = new Set<string>()
      for (const file of files.keys()) {
        if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split('/')[0])
      }
      return [...names].map((name) => {
        const child = join(path, name)
        return { name, path: child, isFile: files.has(child), isDirectory: dirs.has(child) }
      })
    },
    async readText (path: string): Promise<string | null> {
      return files.get(path) ?? null
    },
    async writeText (path: string, content: string): Promise<void> {
      files.set(path, content)
      dirs.add(dirname(path))
    },
    join,
    dirname,
    basename,
    now: () => new Date('2026-01-01T00:00:00Z'),
    randomId: () => 'abc123',
    defaultHistoryPath: () => '/history/undo.json',
  }
}

function join (...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

function dirname (path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

function basename (path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
