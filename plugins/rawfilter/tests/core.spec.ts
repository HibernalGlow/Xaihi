/**
 * rawfilter 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，不调用被测函数得到）：
 * - 第 1 组五条逐字抄自上游 `packages/nodes/rawfilter/src/core.test.ts`（tag `noxide`），
 *   连它那份 `createMemoryRuntime` / `join` / `dirname` / `basename` 一起搬
 *   （`/work/multi/game/Game [English].url` 那条字符串是上游手写的）。
 * - 其余用例钉的是上游 `core.ts` 里**写了但没被测到**的分支，注释里给出上游行号
 *   （`core.ts:<n>` 指 `<Xiranite>` tag `noxide` 那份文件）。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-rawfilter/tests/core
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readlink, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { RawfilterDirEntry, RawfilterPathInfo, RawfilterRuntime } from '../src/core.ts'
import {
  ARCHIVE_EXTENSIONS,
  buildRawfilterPlan,
  classifyVariant,
  createArchive,
  groupArchivesInDir,
  isArchiveFile,
  normalizeArchiveName,
  normalizeRawfilterInput,
  runRawfilter,
  scoreArchiveName,
  similarity,
} from '../src/core.ts'
import { createNodeRawfilterRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

/**
 * 上游 `core.test.ts:49-97` 那份内存 runtime 逐字搬来，连它**自己那三个假路径函数**
 * 一起搬（`join` = `parts.join('/').replace(/\/+/g,'/')`，不是 `node:path` 的那份；
 * 真文件系统的用例也照这套拼，因为 mkdtemp 给的是不含重复斜杠的绝对路径）。
 */
function createMemoryRuntime (root: string, fileNames: string[]): RawfilterRuntime & { operations: string[] } {
  const files = new Set(fileNames.map((name) => join(root, name)))
  const dirs = new Set([root])
  const operations: string[] = []

  const runtime: RawfilterRuntime & { operations: string[] } = {
    operations,
    async pathInfo (path: string): Promise<RawfilterPathInfo> {
      return { path, exists: files.has(path) || dirs.has(path), isFile: files.has(path), isDirectory: dirs.has(path) }
    },
    async listDir (path: string): Promise<RawfilterDirEntry[]> {
      return [...files]
        .filter((file) => dirname(file) === path)
        .map((file) => ({ name: basename(file), path: file, isFile: true, isDirectory: false }))
    },
    async ensureDir (path: string): Promise<void> {
      dirs.add(path)
    },
    async moveFile (source: string, target: string): Promise<void> {
      operations.push(`move:${source}->${target}`)
      files.delete(source)
      files.add(target)
      dirs.add(dirname(target))
    },
    async createShortcut (source: string, target: string): Promise<void> {
      operations.push(`shortcut:${source}->${target}`)
      files.add(target)
      dirs.add(dirname(target))
    },
    join,
    dirname,
    basename,
  }

  return runtime
}

function join (...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

function dirname (path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

// 上游 `core.test.ts:95-97` 那个 basename 也逐字搬（runtime 的字面量参数就是它）。
function basename (path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

const TRIO = [
  'Circle - Same Book [Chinese].zip',
  'Circle - Same Book [English].zip',
  'Circle - Same Book RAW.rar',
]

describe('rawfilter core（上游 core.test.ts 五条逐字搬来）', () => {
  it('去掉变体标记后规范化归档名', () => {
    expect(normalizeArchiveName('Circle - Same Book [Chinese].zip')).toBe('circle same book')
    expect(normalizeArchiveName('Circle - Same Book RAW.rar')).toBe('circle same book')
  })

  it('区分翻译版与 raw 版', () => {
    expect(classifyVariant('title [Chinese].zip')).toBe('translated')
    expect(classifyVariant('title RAW.zip')).toBe('raw')
    expect(classifyVariant('title.zip')).toBe('unknown')
  })

  it('raw 重复版进 trash，多出来的翻译版进 multi', async () => {
    const runtime = createMemoryRuntime('/work', TRIO)
    const groups = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.82 })
    const plan = await buildRawfilterPlan(groups, '/work', { trashOnly: false, createShortcuts: false }, runtime)

    expect(plan.filter((item) => item.status === 'kept')).toHaveLength(1)
    expect(plan.find((item) => item.fileName.includes('RAW'))?.destination).toBe('trash')
    expect(plan.find((item) => item.fileName.includes('English'))?.destination).toBe('multi')
  })

  it('extra translated 走 shortcut 模式时执行一次快捷方式', async () => {
    const runtime = createMemoryRuntime('/work', ['Game [Chinese].zip', 'Game [English].zip'])
    const result = await runRawfilter({ action: 'execute', path: '/work', createShortcuts: true }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.createdShortcuts).toBe(1)
    expect(runtime.operations).toEqual(['shortcut:/work/Game [English].zip->/work/multi/game/Game [English].url'])
  })

  it('目录不存在 ⇒ 校验失败（不是空计划）', async () => {
    const runtime = createMemoryRuntime('/work', [])
    const result = await runRawfilter({ action: 'plan', path: '/missing' }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    // 阳性对照：这句话是内核自己说的，三条门槛各有不同文案（core.ts:175-178）。
    expect(result.message).toBe('Path does not exist: /missing')
    const notDir = createMemoryRuntime('/work', ['file.zip'])
    const second = await runRawfilter({ action: 'plan', path: '/work/file.zip' }, notDir)
    expect(second.message).toBe('Path is not a directory: /work/file.zip')
    const empty = await runRawfilter({ action: 'plan', path: '  ' }, createMemoryRuntime('/work', []))
    expect(empty.message).toBe('Path is required.')
  })
})

describe('rawfilter 输入归一（上游 core.ts:156-166 的字面量）', () => {
  it('一条都不给时的默认值：action=execute、dryRun=false', () => {
    expect(normalizeRawfilterInput({})).toEqual({
      action: 'execute', path: '', nameOnlyMode: false, createShortcuts: false, trashOnly: false, minSimilarity: 0.82, dryRun: false,
    })
    // 阳性对照：定义里 `dryRun` 的默认是 true（界面上默认预演），内核这里必须是 false。
    // 两份真源都不许"统一"，改了这条就红。
    expect(normalizeRawfilterInput({ dryRun: true }).dryRun).toBe(true)
  })

  it('snake_case 别名可用，camelCase 优先；path 会剥空白与引号', () => {
    expect(normalizeRawfilterInput({ name_only_mode: true, create_shortcuts: true, trash_only: true, min_similarity: 0.5 })).toMatchObject({
      nameOnlyMode: true, createShortcuts: true, trashOnly: true, minSimilarity: 0.5,
    })
    expect(normalizeRawfilterInput({ nameOnlyMode: false, name_only_mode: true }).nameOnlyMode).toBe(false)
    // `clean()`（core.ts:496-498）= trim 之后用 `^["']|["']$` 的**全局** replace 剥两侧引号。
    expect(normalizeRawfilterInput({ path: ' "/work" ' }).path).toBe('/work')

    // `clampSimilarity`（core.ts:500-503）：非有限值回 0.82，其余夹到 0..1。
    expect(normalizeRawfilterInput({ minSimilarity: Number.NaN }).minSimilarity).toBe(0.82)
    expect(normalizeRawfilterInput({ minSimilarity: 5 }).minSimilarity).toBe(1)
    expect(normalizeRawfilterInput({ minSimilarity: -3 }).minSimilarity).toBe(0)
  })
})

describe('rawfilter 词表与打分（上游 core.ts:91-145 + 301-308）', () => {
  it('归档扩展名表逐字 13 条，含 .tar.gz 这类复合后缀与 .001', () => {
    expect(ARCHIVE_EXTENSIONS).toEqual(['.zip', '.rar', '.7z', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.cbz', '.cbr', '.001'])
    expect(isArchiveFile('Part.001')).toBe(true)
    expect(isArchiveFile('note.txt')).toBe(false)
  })

  it('剥扩展名先按长度降序找：Book.tar.gz 不会只剩 Book.tar', () => {
    expect(normalizeArchiveName('Book.tar.gz')).toBe('book')
    // 阳性对照：表里没有的后缀退化成"去掉最后一个点之后"（core.ts:466）——
    // 'note.tar.bz3' 不在表里，于是只剥掉 '.bz3'，剩下的那个点被换成空格。
    expect(normalizeArchiveName('note.tar.bz3')).toBe('note tar')
  })

  it('打分：translated 100 / unknown 50 / raw 10，质量词 +12、低质词 -20，长度补 ≤0.8', () => {
    expect(scoreArchiveName('t [Chinese].zip')).toBeCloseTo(100 + 11 / 100, 10)
    expect(scoreArchiveName('t [Chinese] [sample].zip')).toBeCloseTo(100 - 20 + 20 / 100, 10)
    expect(scoreArchiveName('t [Chinese] [Complete].zip')).toBeCloseTo(100 + 12 + 22 / 100, 10)
    expect(scoreArchiveName('t RAW.zip')).toBeCloseTo(10 + 5 / 100, 10)
    // 阳性对照：raw 永远排不过 unknown，unknown 永远排不过 translated。
    expect(scoreArchiveName('t.zip')).toBeGreaterThan(scoreArchiveName('t RAW.zip'))
    expect(scoreArchiveName('t [Chinese].zip')).toBeGreaterThan(scoreArchiveName('t.zip'))
  })

  it('similarity 是 Dice 系数：2*共享/(两边词数)', () => {
    expect(similarity('a b c', 'a b c')).toBe(1)
    expect(similarity('a b c', 'a b d')).toBeCloseTo(4 / 6, 10)
    expect(similarity('a', 'b')).toBe(0)
    // 阳性对照：空串与空串走 `a === b` 那条快捷返回 1（core.ts:311）——
    // 这就是"规范化后为空的两个名字会被并成一组"的原因。
    expect(similarity('', '')).toBe(1)
  })

  it('createArchive：groupKey 是去掉空格的规范化名，变体与分数各按名判', () => {
    expect(createArchive('Game [Chinese].zip')).toEqual({
      name: 'Game [Chinese].zip',
      path: 'Game [Chinese].zip',
      normalizedName: 'game',
      groupKey: 'game',
      variant: 'translated',
      score: 100.14,
    })
    // 阳性对照：`eng` 排在 `english` 之前，所以 [English] 的名字会被切成 "lish"
    // （markerRegex 是非全局的，只换第一处命中，core.ts:287 + 473-475）。
    expect(normalizeArchiveName('English:[中文].zip')).toBe('lish')
  })
})

describe('rawfilter 计划分支（上游 core.ts 里没被测到的那几条）', () => {
  it('单文件组 ⇒ kept/single_file_group，不出目标（core.ts:230-233 + 393-405）', async () => {
    const runtime = createMemoryRuntime('/work', ['Solo [Chinese].zip'])
    const groups = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.82 })
    const plan = await buildRawfilterPlan(groups, '/work', { trashOnly: false, createShortcuts: false }, runtime)
    expect(plan).toEqual([
      {
        groupKey: 'solo', groupLabel: 'solo', fileName: 'Solo [Chinese].zip', sourcePath: '/work/Solo [Chinese].zip',
        targetPath: '', destination: 'keep', status: 'kept', variant: 'translated', reason: 'single_file_group',
      },
    ])
  })

  it('trashOnly ⇒ 非保留者一律 trash/trash_only，多出翻译版也不进 multi（core.ts:365）', async () => {
    const runtime = createMemoryRuntime('/work', TRIO)
    const groups = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.82 })
    const plan = await buildRawfilterPlan(groups, '/work', { trashOnly: true, createShortcuts: true }, runtime)
    const pending = plan.filter((item) => item.status === 'pending')
    expect(pending.map((item) => item.destination)).toEqual(['trash', 'trash'])
    expect(pending.map((item) => item.reason)).toEqual(['trash_only', 'trash_only'])
  })

  it('unknown 与 raw 各自的原因串（core.ts:369-371）', async () => {
    const runtime = createMemoryRuntime('/work', ['Book [Chinese].zip', 'Book.zip', 'Book RAW.zip'])
    const groups = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.82 })
    const plan = await buildRawfilterPlan(groups, '/work', { trashOnly: false, createShortcuts: false }, runtime)
    expect(plan.find((item) => item.fileName === 'Book.zip')?.reason).toBe('untranslated_duplicate')
    expect(plan.find((item) => item.fileName === 'Book RAW.zip')?.reason).toBe('raw_version_replaced')
    expect(plan.find((item) => item.fileName === 'Book [Chinese].zip')?.reason).toBe('preferred_version')
  })

  it('目标已存在时后缀是 " (2)"，且插在扩展名之前（core.ts:374-391 + 490-494）', async () => {
    const runtime = createMemoryRuntime('/work', [
      ...TRIO,
      'multi/circle same book/Circle - Same Book [English].zip',
    ])
    const result = await runRawfilter({ action: 'execute', path: '/work', dryRun: false }, runtime)
    expect(result.success).toBe(true)
    expect(runtime.operations).toEqual([
      'move:/work/Circle - Same Book [English].zip->/work/multi/circle same book/Circle - Same Book [English] (2).zip',
      'move:/work/Circle - Same Book RAW.rar->/work/trash/Circle - Same Book RAW.rar',
    ])
  })

  it('组标签规范化为空时回落到原始文件名，且 sanitize 把冒号换成下划线（core.ts:214 + 485-488）', async () => {
    // 两个名字规范化后都是空串。走 nameOnlyMode 那条精确匹配才并得成一组：
    // 相似度模式比的是 `archive.normalizedName` 与 `group.label`（`:410`），而这里
    // label 已经回落到原始文件名（`normalizedName || name`，`:214`），空 vs 非空 ⇒ 0 分。
    // 建组的是分数更高的第一条 '[Chinese]:[中文].zip'，所以目录名来自它、冒号被换成 '_'。
    const runtime = createMemoryRuntime('/work', ['[Chinese]:[中文].zip', '[中文]:[汉化].zip'])
    const result = await runRawfilter({ action: 'execute', path: '/work', dryRun: false, nameOnlyMode: true }, runtime)
    expect(result.success).toBe(true)
    expect(runtime.operations).toEqual([
      'move:/work/[中文]:[汉化].zip->/work/multi/[Chinese]_[中文].zip/[中文]:[汉化].zip',
    ])
  })

  it('nameOnlyMode 只按 groupKey 精确匹配，相似度再高也不并组（core.ts:212）', async () => {
    const runtime = createMemoryRuntime('/work', ['Book [Chinese].zip', 'Book Two [Chinese].zip'])
    const fuzzy = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.5 })
    expect(fuzzy).toHaveLength(1)

    // 阳性对照：换成 nameOnlyMode 就分成两组，并且返回前按 **label** 排（core.ts:218-219），
    // 'book' 是 'book two' 的前缀 ⇒ 在前；这条顺序不是插入顺序（插入的是分数更高的那条）。
    const exact = await groupArchivesInDir('/work', runtime, { nameOnlyMode: true, minSimilarity: 0.5 })
    expect(exact.map((group) => group.key)).toEqual(['book', 'booktwo'])
  })

  it('组按 label 排、组内按分数排（core.ts:218-219 + 356-358）', async () => {
    const runtime = createMemoryRuntime('/work', ['Zeta [Chinese].zip', 'Alpha RAW.zip', 'Alpha.zip'])
    const groups = await groupArchivesInDir('/work', runtime, { nameOnlyMode: false, minSimilarity: 0.82 })
    expect(groups.map((group) => group.label)).toEqual(['alpha', 'zeta'])
    expect(groups[0]?.files.map((file) => file.name)).toEqual(['Alpha.zip', 'Alpha RAW.zip'])
  })

  it('没有归档 ⇒ 不报错，出一句"No archive files found."（core.ts:183-185）', async () => {
    const runtime = createMemoryRuntime('/work', ['note.txt'])
    const result = await runRawfilter({ action: 'plan', path: '/work' }, runtime)
    expect(result.success).toBe(true)
    expect(result.message).toBe('No archive files found.')
    expect(result.data).toMatchObject({ archiveCount: 0, totalGroups: 0, plan: [], groups: [], errors: [], errorCount: 0 })
  })

  it('scan 与 plan 都只出计划；execute 才动文件（core.ts:189-193）', async () => {
    for (const action of ['scan', 'plan'] as const) {
      const runtime = createMemoryRuntime('/work', TRIO)
      const result = await runRawfilter({ action, path: '/work' }, runtime)
      expect(result.message).toBe('Plan generated: 2 operation(s).')
      expect(runtime.operations).toEqual([])
      expect(result.data).toMatchObject({ archiveCount: 3, totalGroups: 1, duplicateGroups: 1, keptCount: 1, movedToTrash: 0, movedToMulti: 0 })
    }

    // 阳性对照：execute + dryRun=true 仍然一行都不许执行（`:189` 那条或逻辑）。
    const dry = createMemoryRuntime('/work', TRIO)
    await runRawfilter({ action: 'execute', path: '/work', dryRun: true }, dry)
    expect(dry.operations).toEqual([])
  })

  it('执行的消息模板与计数只数 success 行（core.ts:342-349 + 416-431）', async () => {
    const runtime = createMemoryRuntime('/work', TRIO)
    const result = await runRawfilter({ action: 'execute', path: '/work', dryRun: false }, runtime)
    expect(result.message).toBe('Rawfilter completed: 1 trash, 1 multi, 0 shortcut(s), 0 error(s).')
    expect(result.data).toMatchObject({ movedToTrash: 1, movedToMulti: 1, createdShortcuts: 0, errorCount: 0, skippedFiles: 0 })
    expect(result.data?.plan.filter((item) => item.status === 'pending')).toEqual([])
    expect(result.data?.plan.filter((item) => item.status === 'success')).toHaveLength(2)
  })

  it('进度事件是百分数 10 / 35 / 40.. / 100（core.ts:180 + 187 + 331 + 343）', async () => {
    const events: Array<{ progress?: number | undefined; message: string }> = []
    await runRawfilter({ action: 'execute', path: '/work', dryRun: false }, createMemoryRuntime('/work', TRIO),
      (event) => events.push({ progress: event.progress, message: event.message }))
    expect(events.map((event) => event.progress)).toEqual([10, 35, 40, 68, 100])
    expect(events.map((event) => event.message)).toEqual([
      'Scanning archive files.',
      'Grouped 3 archive file(s).',
      'Circle - Same Book [English].zip',
      'Circle - Same Book RAW.rar',
      'Rawfilter completed.',
    ])
  })

  it('执行中抛错 ⇒ 记一条 error 并把这次判为失败（core.ts:337-339 + 346）', async () => {
    const runtime = createMemoryRuntime('/work', TRIO)
    runtime.moveFile = async () => { throw new Error('EACCES: permission denied') }
    const result = await runRawfilter({ action: 'execute', path: '/work', dryRun: false }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(2)
    expect(result.data?.errors).toEqual([
      'Circle - Same Book [English].zip: EACCES: permission denied',
      'Circle - Same Book RAW.rar: EACCES: permission denied',
    ])
    expect(result.message).toBe('Rawfilter completed: 0 trash, 0 multi, 0 shortcut(s), 2 error(s).')
  })
})

describe('rawfilter platform（真文件系统上的枚举语义）', () => {
  it('pathInfo 会 resolve：返回的永远是绝对路径（与 nameu 那份的唯一差别）', async () => {
    const root = await tempRoot('pathinfo')
    const info = await createNodeRawfilterRuntime().pathInfo(join(root, 'nope'))
    expect(info).toEqual({ path: join(root, 'nope'), exists: false, isFile: false, isDirectory: false })
    expect((await createNodeRawfilterRuntime().pathInfo('.')).path).toBe(process.cwd())
  })

  it('符号链接不算归档 ⇒ 既不进组也不搬', async () => {
    const root = await tempRoot('symlink')
    const real = join(root, 'Game [Chinese].zip')
    await writeFile(real, 'x', 'utf8')
    await symlink(real, join(root, 'Game [English].zip'), 'file')

    const groups = await groupArchivesInDir(root, createNodeRawfilterRuntime(), { nameOnlyMode: false, minSimilarity: 0.82 })
    expect(groups.map((group) => group.label)).toEqual(['game'])
    expect(groups[0]?.files.map((file) => file.name)).toEqual(['Game [Chinese].zip'])
    // 阳性对照：把 listDir 改成逐项 stat，那条软链就会被当成第二件归档进组。
  })

  it('真搬一次：重复版落进 trash/…，multi 走 symlink，预演那遍一个字节都没动', async () => {
    const root = await tempRoot('live')
    const chinese = join(root, 'Game [Chinese].zip')
    const english = join(root, 'Game [English].zip')
    const raw = join(root, 'Game RAW.rar')
    await writeFile(chinese, 'chinese', 'utf8')
    await writeFile(english, 'english', 'utf8')
    await writeFile(raw, 'raw', 'utf8')
    const runtime = createNodeRawfilterRuntime()

    const dry = await runRawfilter({ action: 'execute', path: root, dryRun: true }, runtime)
    expect(dry.data?.movedToTrash).toBe(0)
    expect(existsSync(english)).toBe(true)

    const live = await runRawfilter({ action: 'execute', path: root, createShortcuts: true }, runtime)
    expect(live.success).toBe(true)
    expect(live.data).toMatchObject({ movedToTrash: 1, createdShortcuts: 1, errorCount: 0 })
    expect(existsSync(raw)).toBe(false)
    expect(existsSync(join(root, 'trash', 'Game RAW.rar'))).toBe(true)

    const shortcut = join(root, 'multi', 'game', 'Game [English].url')
    // 快捷方式指向的是**它自己那条源文件**（`createShortcut(item.sourcePath, …)`，
    // core.ts:334），保留者那条 [Chinese] 留在原地。上一条已经证过 English 不再在根目录。
    expect(await readlink(shortcut)).toBe(english)
    // 阳性对照：源文件本体不许被搬走（快捷方式不是移动）。
    expect(existsSync(english)).toBe(true)
    expect(readFileSync(english, 'utf8')).toBe('english')
    expect((await readdir(join(root, 'multi', 'game'))).sort()).toEqual(['Game [English].url'])
    expect((await stat(join(root, 'trash'))).isDirectory()).toBe(true)
  })
})

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-rawfilter-${label}-`))
  tempRoots.push(root)
  return root
}
