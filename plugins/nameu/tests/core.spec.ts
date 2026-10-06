/**
 * nameu 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，不调用被测函数得到）：
 * - 第 1 组四条逐字抄自上游 `packages/nodes/nameu/src/core.test.ts`（tag `noxide`）：
 *   `FANBOX 作品Artist.zip`、`BookArtist.zip`、`target_name_exists`、
 *   `[['/library/Artist/Book [cbr].zip', '/library/Artist/BookArtist.zip']]` 与
 *   `setTimes` 的 `[..., 1000, 2000]`，连它那份 `fakeRuntime` / `infoFor` 的形状一起搬。
 * - 其余用例钉的是上游 `core.ts` 里**写了但没被测到**的分支，每条都在注释里给出
 *   上游行号（`core.ts:<n>` 指 `<Xiranite>` tag `noxide` 那份文件）。
 *
 * 每条尺都配阳性对照，写在同一条用例里；对照失效的写法（把被测函数当期望值）不用。
 *
 * @module xaihi-nameu/tests/core
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { NameuDirEntry, NameuPathInfo, NameuRuntime } from '../src/core.ts'
import { buildNameuPlan, normalizeArchiveName, normalizeFolderName, normalizeNameuInput, runNameu } from '../src/core.ts'
import { createNodeNameuRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

/** 上游 `core.test.ts:72-86` 那份 fakeRuntime 逐字搬来（假 join/dirname/basename 规则全保留）。 */
function fakeRuntime (options: {
  dirs: Record<string, Array<{ name: string; path: string; isFile: boolean; isDirectory: boolean }>>
  renames?: Array<[string, string]>
  setTimes?: Array<[string, number, number]>
  failRename?: string
}): NameuRuntime {
  return {
    pathInfo: async (path) => infoFor(path, options.dirs),
    listDir: async (path) => options.dirs[path] ?? [],
    rename: async (from, to) => {
      if (options.failRename === from) throw new Error(`EXDEV: cannot rename ${from}`)
      options.renames?.push([from, to])
    },
    setTimes: async (path, atimeMs, mtimeMs) => { options.setTimes?.push([path, atimeMs, mtimeMs]) },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (path) => path.replace(/[/\\][^/\\]+$/, '') || '.',
    basename: (path) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
  }
}

/** 上游 `core.test.ts:88-95` 那份 infoFor 逐字搬来：目录桶命中算目录，任何桶里的条目路径命中算文件。 */
function infoFor (path: string, dirs: Record<string, Array<{ path: string; isFile: boolean; isDirectory: boolean }>>): NameuPathInfo {
  if (dirs[path]) return { path, exists: true, isFile: false, isDirectory: true, atimeMs: 1000, mtimeMs: 2000 }
  for (const entries of Object.values(dirs)) {
    const entry = entries.find((item) => item.path === path)
    if (entry) return { path, exists: true, isFile: entry.isFile, isDirectory: entry.isDirectory, atimeMs: 1000, mtimeMs: 2000 }
  }
  return { path, exists: false, isFile: false, isDirectory: false, atimeMs: 0, mtimeMs: 0 }
}

const file = (name: string, directory = '/library/Artist'): NameuDirEntry => ({ name, path: `${directory}/${name}`, isFile: true, isDirectory: false })
const dir = (name: string, directory = '/library'): NameuDirEntry => ({ name, path: `${directory}/${name}`, isFile: false, isDirectory: true })

describe('nameu core（上游 core.test.ts 四条逐字搬来）', () => {
  it('规范化归档名并补上画师名', () => {
    expect(normalizeArchiveName('PIXIV FANBOX {3000@PX} [cbr] 作品.zip', 'Artist', {
      addArtistName: true,
      excludeKeywords: [],
      forbiddenArtistKeywords: [],
    })).toBe('FANBOX 作品Artist.zip')
    // 阳性对照：`addArtistName: false` 时那个后缀不许出现（去掉那条判断这条就红）。
    expect(normalizeArchiveName('PIXIV FANBOX {3000@PX} [cbr] 作品.zip', 'Artist', {
      addArtistName: false,
      excludeKeywords: [],
      forbiddenArtistKeywords: [],
    })).toBe('FANBOX 作品.zip')
  })

  it('multi 模式按直接子目录当画师目录来规划', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/library': [dir('Artist')],
        '/library/Artist': [file('Book [cbr].zip')],
      },
    })
    const result = await runNameu({ action: 'plan', paths: ['/library'], mode: 'multi' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.readyCount).toBe(1)
    expect(result.data?.items[0]).toMatchObject({
      sourceName: 'Book [cbr].zip',
      targetName: 'BookArtist.zip',
      artistName: 'Artist',
      status: 'ready',
    })
  })

  it('目标名已被占用 ⇒ conflict，不改名', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/library/Artist': [file('Book [cbr].zip'), file('BookArtist.zip')],
      },
    })
    const result = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single' }, runtime)
    expect(result.data?.conflictCount).toBe(1)
    expect(result.data?.items.find((item) => item.status === 'conflict')?.reason).toBe('target_name_exists')
  })

  it('ready 条目真改名并保留时间戳', async () => {
    const renames: Array<[string, string]> = []
    const setTimes: Array<[string, number, number]> = []
    const runtime = fakeRuntime({
      dirs: { '/library/Artist': [file('Book [cbr].zip')] },
      renames,
      setTimes,
    })
    const result = await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.renamedCount).toBe(1)
    expect(renames).toEqual([['/library/Artist/Book [cbr].zip', '/library/Artist/BookArtist.zip']])
    expect(setTimes).toEqual([['/library/Artist/BookArtist.zip', 1000, 2000]])

    // 阳性对照：`keepTimestamp: false` 时 setTimes 一次都不许发（core.ts:123）。
    const dryRenames: Array<[string, string]> = []
    const noTimes: Array<[string, number, number]> = []
    await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false, keepTimestamp: false },
      fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] }, renames: dryRenames, setTimes: noTimes }))
    expect(dryRenames).toEqual([['/library/Artist/Book [cbr].zip', '/library/Artist/BookArtist.zip']])
    expect(noTimes).toEqual([])
  })
})

describe('nameu 输入归一（上游 core.ts:76-96 的字面量）', () => {
  it('一条都不给时的默认值与三条默认名单', () => {
    const normalized = normalizeNameuInput({})
    expect(normalized).toMatchObject({
      action: 'plan', path: '', listText: '', mode: 'multi',
      recursive: true, addArtistName: true, normalizeFolders: true, keepTimestamp: true, dryRun: true,
    })
    expect(normalized.paths).toEqual([])
    // 三条名单逐字（core.ts:76-78）。
    expect(normalized.archiveExtensions).toEqual(['.zip', '.rar', '.7z', '.cbz', '.cbr'])
    expect(normalized.excludeKeywords).toEqual(['[00待分类]', '[00去图]', '[01来]'])
    expect(normalized.forbiddenArtistKeywords).toEqual(['[bili]', '[weibo]', '[02来]'])

    // 阳性对照：显式给了名单就**整体替换**，不与默认名单合并（`:92-94` 的 `?.length ? … : DEFAULT`）。
    expect(normalizeNameuInput({ excludeKeywords: ['only'] }).excludeKeywords).toEqual(['only'])
    expect(normalizeNameuInput({ archiveExtensions: [] }).archiveExtensions).toEqual(['.zip', '.rar', '.7z', '.cbz', '.cbr'])
  })

  it('archiveExtensions 入表就转小写，paths 是 path + paths + listText 的并集去重', () => {
    expect(normalizeNameuInput({ archiveExtensions: ['.ZIP', '.CbZ'] }).archiveExtensions).toEqual(['.zip', '.cbz'])
    // `:84` 那条并集：path 在最前，然后 paths，然后按 `\n|,` 切开的 listText；`uniqueClean` 去重去空。
    expect(normalizeNameuInput({ path: '/a', paths: ['/a', '/b '], listText: '/b,\n/c' }).paths).toEqual(['/a', '/b', '/c'])
  })
})

describe('nameu 计划分支（上游 core.ts 里没被测到的那几条）', () => {
  it('一个路径都没给 ⇒ 内核自己报那句，并记一条 error 条目（core.ts:105 + 326-332）', async () => {
    const result = await runNameu({ action: 'plan', paths: [] }, fakeRuntime({ dirs: {} }))
    expect(result.success).toBe(false)
    expect(result.message).toBe('At least one artist folder or library root is required.')
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]).toMatchObject({ status: 'error', kind: 'archive', reason: 'At least one artist folder or library root is required.' })
    // 阳性对照：给一个（哪怕不存在的）路径就不是这句话。
    const other = await runNameu({ action: 'plan', paths: ['/library'] }, fakeRuntime({ dirs: {} }))
    expect(other.message).toBe('NameU planned 1 item(s).')
  })

  it('根不是目录 ⇒ skipped/path_not_directory，不进 errorCount（core.ts:140-143）', async () => {
    const result = await runNameu({ action: 'plan', paths: ['/library/missing'], mode: 'single' }, fakeRuntime({ dirs: {} }))
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ scannedCount: 1, skippedCount: 1, errorCount: 0, readyCount: 0, conflictCount: 0 })
    expect(result.data?.items[0]).toEqual({
      sourcePath: '/library/missing', targetPath: '/library/missing', sourceName: 'missing', targetName: 'missing',
      artistName: '/library', kind: 'folder', status: 'skipped', reason: 'path_not_directory',
    })
    // 阳性对照：`skipped` 是状态不是错误——把它当错误计数的写法会在这条红。
    expect(result.data?.errors).toEqual([])
  })

  it('命中排除词的路径整条跳过（core.ts:169-171）', async () => {
    const runtime = fakeRuntime({ dirs: { '/library/[00待分类]': [file('x.zip', '/library/[00待分类]')] } })
    const result = await runNameu({ action: 'plan', paths: ['/library/[00待分类]'], mode: 'single' }, runtime)
    expect(result.data?.items).toEqual([
      { sourcePath: '/library/[00待分类]', targetPath: '/library/[00待分类]', sourceName: '[00待分类]', targetName: '[00待分类]', artistName: '/library', kind: 'folder', status: 'skipped', reason: 'excluded_path' },
    ])
  })

  it('multi 根下没有画师子目录时，把根自己当画师目录（core.ts:152-155）', async () => {
    const runtime = fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] } })
    const result = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'multi' }, runtime)
    expect(result.data?.readyCount).toBe(1)
    expect(result.data?.items[0]).toMatchObject({ artistName: 'Artist', targetName: 'BookArtist.zip', status: 'ready' })
  })

  it('目标已在盘上但没被列出来 ⇒ target_path_exists（core.ts:218-221）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/library/Artist': [file('Book [cbr].zip')],
        // 第二桶只为让 infoFor 认得那个绝对路径：文件在盘上，却不在 listDir 的返回里。
        '/ghost': [file('BookArtist.zip', '/library/Artist')],
      },
    })
    const result = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single' }, runtime)
    expect(result.data?.items[0]).toMatchObject({ status: 'conflict', reason: 'target_path_exists', targetPath: '/library/Artist/BookArtist.zip' })
    expect(result.data?.errors).toEqual(['/library/Artist/Book [cbr].zip: target_path_exists'])
    // 阳性对照：conflict 不算 error ⇒ success 仍为真（`:323` 只数 errorCount）。
    expect(result.success).toBe(true)
    expect(result.data?.errorCount).toBe(0)
  })

  it('名字本来就规范 ⇒ unchanged，且不发 rename（core.ts:212-214）', async () => {
    const renames: Array<[string, string]> = []
    const runtime = fakeRuntime({ dirs: { '/library/Artist': [file('BookArtist.zip')] }, renames })
    const result = await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false }, runtime)
    expect(result.data?.items[0]).toMatchObject({ status: 'unchanged', sourcePath: '/library/Artist/BookArtist.zip', targetPath: '/library/Artist/BookArtist.zip' })
    expect(result.data?.unchangedCount).toBe(1)
    expect(renames).toEqual([])
  })

  it('recursive=false 只走一层；开时才下钻（core.ts:189）', async () => {
    const dirs = {
      // 目录名 `作品A` 会被 normalizeFolderName 改动，所以它自己也出一行计划（`:182-188`）。
      '/library/Artist': [dir('作品A', '/library/Artist'), file('top.zip', '/library/Artist')],
      '/library/Artist/作品A': [file('deep.zip', '/library/Artist/作品A')],
    }
    const shallow = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single', recursive: false }, fakeRuntime({ dirs }))
    expect(shallow.data?.items.map((item) => item.sourceName)).toEqual(['作品A', 'top.zip'])

    // 阳性对照：默认的 recursive=true 会把 deep.zip 也算进来（`:189` 那条 queue.push）。
    const deep = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single' }, fakeRuntime({ dirs }))
    expect(deep.data?.items.map((item) => item.sourceName)).toEqual(['作品A', 'top.zip', 'deep.zip'])
  })

  it('normalizeFolders=false 时不给目录出改名计划（core.ts:182-188）', async () => {
    const dirs = { '/library/Artist': [dir('作品A', '/library/Artist')] }
    const off = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single', normalizeFolders: false }, fakeRuntime({ dirs }))
    expect(off.data?.items).toEqual([])

    // 阳性对照：默认开时那条目录改名计划就是 normalizeFolderName 的产物（kind: 'folder'）。
    const on = await runNameu({ action: 'plan', paths: ['/library/Artist'], mode: 'single' }, fakeRuntime({ dirs }))
    expect(on.data?.items[0]).toMatchObject({ kind: 'folder', sourceName: '作品A', targetName: '作品 A', status: 'ready' })
  })

  it('rename 抛错时记一条 error 并把这次判为失败（core.ts:125-127 + 322-324）', async () => {
    const result = await runNameu(
      { action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false },
      fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] }, failRename: '/library/Artist/Book [cbr].zip' }),
    )
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]).toMatchObject({ status: 'error', reason: 'EXDEV: cannot rename /library/Artist/Book [cbr].zip' })
    expect(result.data?.errors).toEqual(['/library/Artist/Book [cbr].zip: EXDEV: cannot rename /library/Artist/Book [cbr].zip'])
  })

  it('dryRun（默认 true）下 rename 动作也不发一次改名（core.ts:109-111）', async () => {
    const renames: Array<[string, string]> = []
    const runtime = fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] }, renames })
    const result = await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single' }, runtime)
    expect(result.message).toBe('NameU planned 1 item(s).')
    expect(renames).toEqual([])
    // 阳性对照：同一条输入关掉 dryRun 就真的改（否则上面那条是空话）。
    const live: Array<[string, string]> = []
    await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false },
      fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] }, renames: live }))
    expect(live).toHaveLength(1)
  })

  it('进度事件是百分数 15 与 65（core.ts:106 + 113，接线层据此定 total=100）', async () => {
    const events: Array<{ type: string; progress?: number; message: string }> = []
    await runNameu({ action: 'rename', paths: ['/library/Artist'], mode: 'single', dryRun: false },
      fakeRuntime({ dirs: { '/library/Artist': [file('Book [cbr].zip')] }, renames: [] }), (event) => events.push(event))
    expect(events.map((event) => event.progress)).toEqual([15, 65])
    expect(events.map((event) => event.message)).toEqual(['Scanning NameU folders.', 'Renaming planned items.'])
  })
})

describe('nameu 名字规范化（上游 cleanupName 的每条替换）', () => {
  it('全角括号与花括号活动标签：替换表按声明顺序生效（core.ts:240-255）', () => {
    // `[【］]` 那两条把全角括号换成半角；`{1000@PX}` 整块删掉（`:247`）。
    expect(normalizeFolderName('【画师】')).toBe('[画师]')
    expect(normalizeFolderName('A{1000@PX}B')).toBe('AB')
    expect(normalizeFolderName('A{100w@WD}B')).toBe('AB')
    // 阳性对照：`{}` 里不是活动标签形状时不走那条正则，走"空花括号/任意花括号"那两条（`:251`）。
    expect(normalizeFolderName('A{note}B')).toBe('AB')
  })

  it('重复的方括号内容只留第一份（core.ts:262-270）', () => {
    expect(normalizeFolderName('[Sample] Book [sample]')).toBe('[Sample] Book')
    // 阳性对照：内容不同就两份都留（seen 的键是去空格小写后的内容）。
    expect(normalizeFolderName('[Sample] Book [other]')).toBe('[Sample] Book [other]')
  })

  it('Digital→DL、PIXIV FANBOX→FANBOX，并在中日韩与拉丁之间补空格（core.ts:258 + 272-277）', () => {
    expect(normalizeFolderName('Digital')).toBe('DL')
    expect(normalizeFolderName('作品A')).toBe('作品 A')
    expect(normalizeFolderName('A作品')).toBe('A 作品')
  })

  it('已有画师名就不再补；命中禁用词或排除词也不补（core.ts:228-230 + 279-283）', () => {
    const base = { addArtistName: true, excludeKeywords: [], forbiddenArtistKeywords: [] }
    expect(normalizeArchiveName('Book TheArtist.zip', 'The Artist', base)).toBe('Book TheArtist.zip')
    expect(normalizeArchiveName('Book.zip', 'The Artist', base)).toBe('BookThe Artist.zip')
    // 阳性对照：文件名里没有画师名时才补（去掉 hasArtistName 那半边这条会红）。
    expect(normalizeArchiveName('book.zip', '[bili] A', { ...base, forbiddenArtistKeywords: ['[bili]'] })).toBe('book.zip')
    expect(normalizeArchiveName('book.zip', 'A', { ...base, excludeKeywords: ['skip'] })).toBe('bookA.zip')
    expect(normalizeArchiveName('skip book.zip', 'A', { ...base, excludeKeywords: ['skip'] })).toBe('skip book.zip')
  })

  it('主名截到 80，扩展名在截完之后才拼（core.ts:231 + 300-303）', () => {
    const long = `${'x'.repeat(90)}.zip`
    const next = normalizeArchiveName(long, '', { addArtistName: true, excludeKeywords: [], forbiddenArtistKeywords: [] })
    expect(next).toBe(`${'x'.repeat(80)}.zip`)
    expect(next).toHaveLength(84)
  })

  it('splitExt：点开头的文件（.zip）不拆主名（core.ts:294-298）', () => {
    expect(normalizeArchiveName('.zip', 'Artist', { addArtistName: true, excludeKeywords: [], forbiddenArtistKeywords: [] })).toBe('.zipArtist')
  })
})

describe('nameu buildNameuPlan 直接可用（不经 runNameu 的那层 try/catch）', () => {
  it('多个根各出一份计划，顺序就是 paths 的顺序（core.ts:137-160）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/a/Artist': [file('one.zip', '/a/Artist')],
        '/b/Artist': [file('two.zip', '/b/Artist')],
      },
    })
    const items = await buildNameuPlan(normalizeNameuInput({ paths: ['/b/Artist', '/a/Artist'], mode: 'single' }), runtime)
    expect(items.map((item) => item.sourcePath)).toEqual(['/b/Artist/two.zip', '/a/Artist/one.zip'])
    expect(items.map((item) => item.targetName)).toEqual(['twoArtist.zip', 'oneArtist.zip'])
  })
})

describe('nameu platform（真文件系统上的枚举语义）', () => {
  it('符号链接既不算归档也不算目录 ⇒ 既不排改名也不下钻', async () => {
    const root = await tempRoot('symlink')
    const artist = join(root, 'Artist')
    await mkdir(artist)
    const real = join(artist, 'Book [cbr].zip')
    await writeFile(real, 'x', 'utf8')
    await symlink(real, join(artist, 'Book link.zip'), 'file')
    await mkdir(join(artist, 'sub'))
    await symlink(join(artist, 'sub'), join(artist, 'sub-link'), 'dir')

    const result = await runNameu({ action: 'plan', paths: [artist], mode: 'single' }, createNodeNameuRuntime())
    const sources = result.data?.items.map((item) => item.sourcePath) ?? []
    expect(sources).toContain(real)
    // 阳性对照：把 listDir 改成逐项 stat，这两条就红（软链会被当成归档排出改名计划）。
    expect(sources).not.toContain(join(artist, 'Book link.zip'))
    expect(sources).not.toContain(join(artist, 'sub-link'))
  })

  it('真改一次名：目标在、源消失、内容跟着走；预演那遍一个文件都没动', async () => {
    const root = await tempRoot('live-rename')
    const artist = join(root, 'Artist')
    await mkdir(artist)
    const source = join(artist, 'Book [cbr].zip')
    await writeFile(source, 'payload', 'utf8')
    const target = join(artist, 'BookArtist.zip')
    const runtime = createNodeNameuRuntime()

    const dry = await runNameu({ action: 'rename', paths: [artist], mode: 'single' }, runtime)
    expect(dry.data?.renamedCount).toBe(0)
    expect(existsSync(source)).toBe(true)
    expect(existsSync(target)).toBe(false)

    const live = await runNameu({ action: 'rename', paths: [artist], mode: 'single', dryRun: false }, runtime)
    expect(live.success).toBe(true)
    expect(live.data?.renamedCount).toBe(1)
    expect(existsSync(source)).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('payload')
  })

  it('pathInfo 不 resolve：返回的就是传进去的那个路径（platform.ts 与 rawfilter 那份的唯一差别）', async () => {
    const root = await tempRoot('pathinfo')
    const target = join(root, 'sub')
    await mkdir(target)
    const info = await createNodeNameuRuntime().pathInfo('relative-ish/path')
    expect(info).toEqual({ path: 'relative-ish/path', exists: false, isFile: false, isDirectory: false, atimeMs: 0, mtimeMs: 0 })
    const found = await createNodeNameuRuntime().pathInfo(target)
    expect(found.path).toBe(target)
    expect(found.isDirectory).toBe(true)
  })
})

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-nameu-${label}-`))
  tempRoots.push(root)
  return root
}
