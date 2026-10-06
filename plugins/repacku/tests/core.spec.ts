/**
 * Repacku 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，不调用被测函数得到）：
 * - 第 1 组五条逐字抄自上游 `packages/nodes/repacku/src/core.test.ts`（tag `noxide`，182 行），
 *   连它那份 `createMemoryRuntime` / `normalize` / `dirname` / `basename` / `extname` 一起搬
 *   （`/root/root_config.json` 与 `.avif,.bmp,.gif,…` 那串排序后的扩展名都是上游手写的字面量）。
 * - 其余用例钉的是上游 `core.ts` 里**写了但上游测试没测到**的分支，注释里给出上游行号
 *   （`core.ts:<n>` 指 `<Xiranite>` tag `noxide` 那份 894 行的文件）。
 * - 最后两条钉 `dryRun` 那对**互相矛盾的默认值**（台账 G8）：内核一份、清单一份，
 *   两边各一条，谁被"顺手对齐"都会红。
 *
 * 每条尺都配阳性对照，写在同一条用例里。假 runtime 的 `compress*` 只往 `compressCalls`
 * 里记一行再回成功，所以"有没有真按下压缩"这件事在这台机器上是读得回来的。
 *
 * @module xaihi-repacku/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { RepackuCompressionResult, RepackuDirEntry, RepackuFolderNode, RepackuPathInfo, RepackuRuntime } from '../src/core.ts'
import {
  BLACKLIST_KEYWORDS,
  DEFAULT_FILE_TYPES,
  analyzeFolderStructure,
  collectCompressionOperations,
  countCompressionModes,
  getFileType,
  isArchiveFile,
  isBlacklistedPath,
  isFileInTypes,
  normalizeRepackuInput,
  parseRepackuConfig,
  runRepacku,
  selectSinglePackFolderSources,
  serializeRepackuConfig,
} from '../src/core.ts'

/** `emptyData()`（core.ts:813-831）那 14 个键，排序后逐字。 */
const REPACKU_DATA_KEYS = [
  'compressedCount', 'configPath', 'entireCount', 'errors', 'failedCount', 'folderTree', 'galleryCount',
  'operations', 'plannedCount', 'selectiveCount', 'skipCount', 'skippedCount', 'totalFolders', 'totalOperations',
]

describe('repacku core（上游 core.test.ts 的五条，逐字）', () => {
  it('analyzes folder compression modes', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.png', 100)
    runtime.file('/root/mixed/001.jpg', 100)
    runtime.file('/root/mixed/info.txt', 10)
    runtime.file('/root/archive/source.zip', 100)
    runtime.file('/root/archive/001.jpg', 100)
    runtime.file('/root/archive/002.jpg', 100)
    runtime.file('/root/tiny/one.jpg', 100)

    const tree = await analyzeFolderStructure('/root', runtime, { targetFileTypes: ['image'] })
    expect(tree?.compressMode).toBe('skip')
    const modes = Object.fromEntries((tree?.children ?? []).map((child) => [child.name, child.compressMode]))
    expect(modes.book).toBe('entire')
    expect(modes.mixed).toBe('skip')
    expect(modes.archive).toBe('selective')
    expect(modes.tiny).toBe('skip')

    // 阳性对照：这把尺看不见没有的目录；`mixed` 之所以是 skip 是那条 txt 让它变成"部分命中"
    // （core.ts:611-612：matching 1 < minCount 2），删掉它同一目录就升到 entire。
    expect(modes.nope).toBeUndefined()
    const withoutTxt = createMemoryRuntime()
    withoutTxt.file('/root/mixed/001.jpg', 100)
    withoutTxt.file('/root/mixed/002.jpg', 100)
    const upgraded = await analyzeFolderStructure('/root', withoutTxt, { targetFileTypes: ['image'] })
    expect(upgraded?.children.find((child) => child.name === 'mixed')?.compressMode).toBe('entire')
  })

  it('writes config and plans full dry run', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.png', 100)
    runtime.file('/root/archive/source.zip', 100)
    runtime.file('/root/archive/001.jpg', 100)
    runtime.file('/root/archive/002.jpg', 100)

    const result = await runRepacku({ action: 'full', path: '/root', types: 'image', dryRun: true }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.configPath).toBe('/root/root_config.json')
    expect(parseRepackuConfig(runtime.writes['/root/root_config.json'] ?? '').folderTree.name).toBe('root')
    expect(result.data?.plannedCount).toBe(2)
    expect(result.data?.operations.map((item) => item.mode).sort()).toEqual(['entire', 'selective'])

    // 阳性对照：预演一条都不许真按下去；而"分析产物"确实写了盘（只那一个文件）。
    expect(runtime.compressCalls).toEqual([])
    expect(Object.keys(runtime.writes)).toEqual(['/root/root_config.json'])
  })

  it('compresses from config through injected runtime', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.png', 100)
    await runRepacku({ action: 'analyze', path: '/root', types: 'image' }, runtime)

    const result = await runRepacku({ action: 'compress', configPath: '/root/root_config.json' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.compressedCount).toBe(1)
    expect(runtime.compressCalls[0]).toEqual(['whole', '/root/book', '/root/book.zip'])

    // 阳性对照：这一条走的是"非预演"，所以按下去的次数必须 >0，且 plannedCount 是 0；
    // 归档落在**同级**（wholeFolderArchivePath，core.ts:842-844），不是目录内部。
    expect(runtime.compressCalls.length).toBe(1)
    expect(result.data?.plannedCount).toBe(0)
    expect(result.data?.operations[0]?.targetPath).toBe('/root/book.zip')
  })

  it('single-pack skips folders that already contain archives and packs loose images', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/pack/clean/001.jpg', 100)
    runtime.file('/pack/clean/002.jpg', 100)
    runtime.file('/pack/has-archive/source.zip', 100)
    runtime.file('/pack/a.jpg', 100)
    runtime.file('/pack/b.png', 100)

    const result = await runRepacku({ action: 'single-pack', path: '/pack' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.compressedCount).toBe(2)
    expect(result.data?.skippedCount).toBe(1)
    expect(runtime.compressCalls).toContainEqual(['whole', '/pack/clean', '/pack/clean.zip'])
    expect(runtime.compressCalls).toContainEqual(['files', '/pack', '/pack/pack.zip', '.avif,.bmp,.gif,.ico,.jpeg,.jpg,.jxl,.png,.psd,.raw,.sha1,.svg,.tiff,.webp'])

    // 阳性对照：被跳过的那条**不进** compress 表；它的 `error` 是上游那个字面量
    // `contains_archive`（core.ts:633），状态是 `skipped` 而不是 `error`。
    const skipped = (result.data?.operations ?? []).filter((item) => item.status === 'skipped')
    expect(skipped.map((item) => item.sourcePath)).toEqual(['/pack/has-archive'])
    expect(skipped[0]?.error).toBe('contains_archive')
    expect(runtime.compressCalls).not.toContainEqual(['whole', '/pack/has-archive', '/pack/has-archive.zip'])
  })

  it('gallery-pack finds marked folders', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/g/alpha. 画集/a.jpg', 100)
    runtime.file('/g/alpha. 画集/b.jpg', 100)

    const result = await runRepacku({ action: 'gallery-pack', path: '/g' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.galleryCount).toBe(1)
    expect(result.data?.compressedCount).toBe(1)

    // 阳性对照：判据是 `name.includes(marker)`（core.ts:689），标记不命中的目录不算画集。
    const other = createMemoryRuntime()
    other.file('/g/alpha/a.jpg', 100)
    other.file('/g/alpha/b.jpg', 100)
    const none = await runRepacku({ action: 'gallery-pack', path: '/g' }, other)
    expect(none.data?.galleryCount).toBe(0)
    expect(none.data?.compressedCount).toBe(0)
  })
})

describe('repacku core（上游写了、上游测试没测到的分支）', () => {
  it('类型表：.sha1 同时挂在 text 与 image 上，声明次序决定归 text', () => {
    expect(DEFAULT_FILE_TYPES.text).toContain('.sha1')
    expect(DEFAULT_FILE_TYPES.image).toContain('.sha1')
    expect(getFileType('checksum.sha1')).toBe('text')
    expect(getFileType('001.jpg')).toBe('image')
    // 名字兜底那三条（core.ts:319-321）。
    expect(getFileType('README')).toBe('text')
    expect(getFileType('LICENSE.txt')).toBe('text')
    // 阳性对照：表里没有、名字里也没关键词的扩展名回 null，不是回一个编出来的 "unknown"。
    expect(getFileType('thing.nope')).toBeNull()
  })

  it('空的目标类型数组 = 全部类型，不是"没有类型"', () => {
    expect(isFileInTypes('001.jpg', [])).toBe(true)
    expect(isFileInTypes('manual.pdf', [])).toBe(true)
    expect(isFileInTypes('001.jpg', ['image'])).toBe(true)
    // 阳性对照：认不出类型的文件（getFileType 回 null）在**有**目标类型时按扩展名兜底
    // （core.ts:328-329），兜不住才是 false。
    expect(isFileInTypes('thing.nope', ['image'])).toBe(false)
    expect(isFileInTypes('thing.png', ['image', 'document'])).toBe(true)
    expect(isArchiveFile('source.zip')).toBe(true)
    expect(isArchiveFile('001.jpg')).toBe(false)
  })

  it('黑名单是小写子串匹配，路径里任何一段含 temp 都算', () => {
    expect(BLACKLIST_KEYWORDS).toContain('node_modules')
    expect(isBlacklistedPath('/a/Temp/b')).toBe(true)
    expect(isBlacklistedPath('/a/.git/objects')).toBe(true)
    expect(isBlacklistedPath('/a/画集/b')).toBe(true)
    // 阳性对照：正常画集工作目录（不含那两个词）不被拦。
    expect(isBlacklistedPath('/library/book-001')).toBe(false)
  })

  it('entire 只要有一个非 skip 的子目录就降级成 selective', async () => {
    const withKid = createMemoryRuntime()
    withKid.file('/parent/001.jpg', 100)
    withKid.file('/parent/002.jpg', 100)
    withKid.file('/parent/kid/003.jpg', 100)
    withKid.file('/parent/kid/004.jpg', 100)
    const tree = await analyzeFolderStructure('/parent', withKid, { targetFileTypes: ['image'] })
    expect(tree?.children[0]?.compressMode).toBe('entire')
    expect(tree?.compressMode).toBe('selective')

    // 阳性对照：子目录拿掉，同样的父层就是 entire——降级那一刀确实来自子节点
    // （core.ts:563-565），不是来自文件数。
    const alone = createMemoryRuntime()
    alone.file('/parent/001.jpg', 100)
    alone.file('/parent/002.jpg', 100)
    expect((await analyzeFolderStructure('/parent', alone, { targetFileTypes: ['image'] }))?.compressMode).toBe('entire')
  })

  it('selective 的归档落在目录内部，entire 的落在同级', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.jpg', 100)
    runtime.file('/root/mixed/source.zip', 100)
    runtime.file('/root/mixed/001.jpg', 100)
    runtime.file('/root/mixed/002.jpg', 100)
    const folderTree = await analyzeFolderStructure('/root', runtime, { targetFileTypes: ['image'] })
    expect(folderTree).not.toBeNull()
    const config = { folderTree: folderTree as RepackuFolderNode, config: { timestamp: '', targetFileTypes: ['image'], minCount: 2 } }
    const operations = collectCompressionOperations(config, runtime)
    expect(operations.map((item) => `${item.mode}:${item.targetPath}`).sort()).toEqual([
      'entire:/root/book.zip',
      'selective:/root/mixed/mixed.zip',
    ])
    expect(countCompressionModes(config.folderTree)).toEqual({ total: 3, entire: 1, selective: 1, skip: 1 })

    // 阳性对照：entire 那条不带扩展名清单；selective 那条只带**命中那些文件**的扩展名
    // （source.zip 不在 image 里，所以不该出现 .zip）。
    expect(operations.find((item) => item.mode === 'entire')?.extensions).toEqual([])
    expect(operations.find((item) => item.mode === 'selective')?.extensions).toEqual(['.jpg'])
    // `fileCount` 数的是**命中 image 的那两条**（core.ts:304 的 sumCounts(fileExtensions)），
    // 躺在同目录里的 source.zip 不算进去——它只是让这一层从 entire 变成 selective 的理由。
    expect(operations.find((item) => item.mode === 'selective')?.fileCount).toBe(2)
    expect(operations.every((item) => item.status === 'planned')).toBe(true)
  })

  it('config 序列化格式与 snake_case 回读，模式认不出的折成 skip', () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    const folderTree = emptyNode('/root')
    const written = serializeRepackuConfig({
      folderTree,
      config: { timestamp: '2026-01-01T00:00:00.000Z', targetFileTypes: ['image'], minCount: 3 },
    })
    expect(written.endsWith('\n')).toBe(true)
    expect(written.includes('\n  "folderTree": {\n')).toBe(true)
    expect(written.includes('"minCount": 3')).toBe(true)

    const parsed = parseRepackuConfig(JSON.stringify({
      folder_tree: { path: '/root', name: 'root', compress_mode: 'nonsense', total_files: 3, file_types: { image: 3 }, children: [] },
      config: { min_count: 5, target_file_types: 'image,document' },
    }))
    expect(parsed.folderTree.compressMode).toBe('skip')
    expect(parsed.folderTree.totalFiles).toBe(3)
    expect(parsed.config.minCount).toBe(5)
    expect(parsed.config.targetFileTypes).toEqual(['image', 'document'])
    // timestamp 缺省是 epoch（core.ts:264），不是"今天"。
    expect(parsed.config.timestamp).toBe(new Date(0).toISOString())

    // 阳性对照：缺 folderTree 的那份必须抛，而不是回一棵空树假装能压。
    expect(() => parseRepackuConfig('{"config":{}}')).toThrow('Config is missing folderTree.')
    expect(() => parseRepackuConfig('[]')).toThrow('Config is missing folderTree.')
    expect(() => parseRepackuConfig('null')).toThrow('Invalid repacku config.')
  })

  it('失败路径逐条回内核自己那句话，不抛出去', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/file.jpg', 10)

    expect((await runRepacku({ action: 'analyze' }, runtime)).message).toBe('Path is required.')
    expect((await runRepacku({ action: 'analyze', path: '/nope' }, runtime)).message).toBe('Path does not exist: /nope')
    expect((await runRepacku({ action: 'full', path: '/nope' }, runtime)).success).toBe(false)
    expect((await runRepacku({ action: 'compress' }, runtime)).message).toBe('Config path or folder path is required.')
    // 单条文件（不是目录）：single-pack 那句来自它自己的校验（core.ts:401-402）。
    expect((await runRepacku({ action: 'single-pack', path: '/file.jpg' }, runtime)).message).toBe('Path is not a directory: /file.jpg')

    // 阳性对照：失败那次的计数形状是 `failedCount: 1` + 一条 errors（failure()，core.ts:833-835），
    // 不是 0——"什么都没发生"与"发生了一次失败"必须分得开。
    const failed = await runRepacku({ action: 'analyze' }, runtime)
    expect(failed.data?.failedCount).toBe(1)
    expect(failed.data?.errors).toEqual(['Path is required.'])
  })

  it('没有任何操作时回全 0 的空账，键一条不少', async () => {
    const runtime = createMemoryRuntime()
    await runtime.ensureDir('/empty')
    const result = await runRepacku({ action: 'single-pack', path: '/empty', dryRun: true }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.totalOperations).toBe(0)
    expect(result.data?.operations).toEqual([])
    // 阳性对照：`emptyData` 的 14 个键一个都不缺——少一个键意味着少一个能读回来的状态。
    expect(Object.keys(result.data ?? {}).sort()).toEqual(REPACKU_DATA_KEYS)
  })

  it('单层打包的子目录顺序是自然序（numeric collate）', () => {
    const entries = [
      { name: 'ch10', path: '/p/ch10', isDirectory: true },
      { name: 'ch2', path: '/p/ch2', isDirectory: true },
      { name: 'a-loose', path: '/p/a-loose', isDirectory: false },
    ]
    expect(selectSinglePackFolderSources(entries).map((entry) => entry.name)).toEqual(['ch2', 'ch10'])
    // 阳性对照：文件不进名单，哪怕名字排在最前面。
    expect(selectSinglePackFolderSources(entries).some((entry) => !entry.isDirectory)).toBe(false)
  })

  it('progress 事件按内核那几个固定点位出来', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.png', 100)
    const seen: Array<number | undefined> = []
    await runRepacku({ action: 'analyze', path: '/root', types: 'image' }, runtime, (event) => seen.push(event.progress))
    // analyzeToConfig 的 20 / 75 / 100（core.ts:451,458,466）。
    expect(seen).toEqual([20, 75, 100])

    // 阳性对照：`full` 多出来的那两点是执行那一路（单条操作 20，收尾 100；
    // operationProgress 的夹取见 core.ts:846-848），不是分析那三点的重复。
    const both: Array<number | undefined> = []
    await runRepacku({ action: 'full', path: '/root', types: 'image', dryRun: true }, runtime, (event) => both.push(event.progress))
    expect(both).toEqual([20, 75, 100, 20, 100])
  })
})

describe('repacku 的 dryRun：两份默认值互相矛盾，各钉一条（台账 G8）', () => {
  it('内核那份：`dryRun` 缺省 false ⇒ 默认就写真归档（core.ts:193）', async () => {
    expect(normalizeRepackuInput({}).dryRun).toBe(false)
    expect(normalizeRepackuInput({ action: 'full', path: '/root' }).dryRun).toBe(false)
    expect(normalizeRepackuInput({ dry_run: true }).dryRun).toBe(true)
    // 阳性对照：这条不是空话——不带 dryRun 跑一次，compress 调用表必须**非空**。
    const runtime = createMemoryRuntime()
    runtime.file('/root/book/001.jpg', 100)
    runtime.file('/root/book/002.png', 100)
    const result = await runRepacku({ action: 'full', path: '/root', types: 'image' }, runtime)
    expect(result.data?.compressedCount).toBe(1)
    expect(runtime.compressCalls.length).toBe(1)
  })

  it('清单那份：`dryRun` 字段的界面默认是 true ⇒ 面板默认预演（node-definitions/repacku.json）', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      xaihi?: { node?: { fields?: Array<{ id?: string; default?: unknown; kind?: string }> } }
    }
    const field = pkg.xaihi?.node?.fields?.find((item) => item.id === 'dryRun')
    expect(field?.kind).toBe('boolean')
    expect(field?.default).toEqual({ boolean: true })
    // 阳性对照：两边**必须不相等**。哪天有人把一边对齐了，这条就红——那正是 G8 说的
    // "看起来统一了，实际把另一种形状藏起来了"。
    expect(field?.default).not.toEqual({ boolean: normalizeRepackuInput({}).dryRun })
    // 上游另一条布尔默认（deleteAfter）两边一致，也钉住：清单 false / 内核 false。
    const deleteAfter = pkg.xaihi?.node?.fields?.find((item) => item.id === 'deleteAfter')
    expect(deleteAfter?.default).toEqual({ boolean: false })
    expect(normalizeRepackuInput({}).deleteAfter).toBe(false)
    // 清单里另三条字面值：types 默认 image、minCount 默认 2、galleryMarker 默认 `. 画集`。
    expect(pkg.xaihi?.node?.fields?.find((item) => item.id === 'types')?.default).toEqual({ text: 'image' })
    expect(pkg.xaihi?.node?.fields?.find((item) => item.id === 'minCount')?.default).toEqual({ number: 2 })
    expect(pkg.xaihi?.node?.fields?.find((item) => item.id === 'galleryMarker')?.default).toEqual({ text: '. 画集' })
    expect(normalizeRepackuInput({}).galleryMarker).toBe('. 画集')
    expect(normalizeRepackuInput({}).minCount).toBe(2)
  })
})

type MemoryItem = { type: 'dir' | 'file'; size: number }

/**
 * 上游 `core.test.ts:84-158` 那份假 runtime，逐字搬：`resolve` 是 `normalize`，`join` 自己拼
 * `/`，`compress*` 两条只往 `compressCalls` 里记一行然后回成功。它不是第二套实现、也不调
 * 内核的算法；本仓只留 `file()` 这一颗上游就有的便利口。
 */
function createMemoryRuntime () {
  const items: Record<string, MemoryItem> = { '/': { type: 'dir', size: 0 } }
  const runtime: RepackuRuntime & {
    writes: Record<string, string>
    compressCalls: string[][]
    file: (path: string, size?: number) => void
  } = {
    writes: {},
    compressCalls: [],
    file (path: string, size = 1) {
      ensureDir(dirname(path))
      items[normalize(path)] = { type: 'file', size }
    },
    async pathInfo (path): Promise<RepackuPathInfo> {
      const item = items[normalize(path)]
      return {
        path: normalize(path),
        exists: Boolean(item),
        isFile: item?.type === 'file',
        isDirectory: item?.type === 'dir',
        size: item?.size ?? 0,
      }
    },
    async listDir (path): Promise<RepackuDirEntry[]> {
      const root = normalize(path)
      return Object.entries(items)
        .filter(([itemPath]) => itemPath !== root && dirname(itemPath) === root)
        .map(([itemPath, item]) => ({
          name: basename(itemPath),
          path: itemPath,
          isFile: item.type === 'file',
          isDirectory: item.type === 'dir',
          size: item.size,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async readText (path) {
      const text = runtime.writes[normalize(path)]
      if (text === undefined) throw new Error(`missing text: ${path}`)
      return text
    },
    async writeText (path, content) {
      runtime.writes[normalize(path)] = content
      runtime.file(path, content.length)
    },
    async ensureDir (path) {
      ensureDir(path)
    },
    async compressWholeFolder (sourcePath, targetPath): Promise<RepackuCompressionResult> {
      runtime.compressCalls.push(['whole', normalize(sourcePath), normalize(targetPath)])
      runtime.file(targetPath, 50)
      return { success: true, originalSize: 100, compressedSize: 50 }
    },
    async compressFiles (sourcePath, targetPath, extensions): Promise<RepackuCompressionResult> {
      runtime.compressCalls.push(['files', normalize(sourcePath), normalize(targetPath), [...extensions].sort().join(',')])
      runtime.file(targetPath, 40)
      return { success: true, originalSize: 100, compressedSize: 40 }
    },
    join: (...parts) => normalize(parts.filter(Boolean).join('/')),
    dirname,
    basename,
    extname,
    resolve: normalize,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  }

  function ensureDir (path: string) {
    const normalized = normalize(path)
    if (items[normalized]) return
    ensureDir(dirname(normalized))
    items[normalized] = { type: 'dir', size: 0 }
  }

  return runtime
}

/** 测试夹具自己用的一棵空树（不是内核的产物，只为 `serializeRepackuConfig` 那条用例提供形状）。 */
function emptyNode (path: string): RepackuFolderNode {
  return {
    path,
    name: basename(path),
    parentPath: dirname(path),
    depth: 1,
    weight: 1,
    totalFiles: 0,
    totalSize: 0,
    recursiveSize: 0,
    sizeMb: 0,
    compressMode: 'skip',
    recommendation: 'Skip or handle manually; dominant types: none.',
    fileTypes: {},
    fileExtensions: {},
    dominantTypes: [],
    children: [],
  }
}

function normalize (path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized || '/'
}

function dirname (path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

function basename (path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return ''
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function extname (path: string): string {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index) : ''
}
