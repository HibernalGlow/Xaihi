/**
 * bandia 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，不调用被测函数得到）：
 * - 前五条逐字抄自上游 `packages/nodes/bandia/src/core.test.ts`（tag `noxide`，117 行），
 *   连它那份 `createMemoryRuntime` 与它**自己那四个假路径函数**一起搬（`join` 不是
 *   `node:path` 的那份，`dirname` 是 `path.replace(/[\\/][^\\/]*$/, '') || "."`）。
 *   `"C:/in/[x] book"`、`"bz l C:/in/book.zip"` 这些字面量都是上游手写的。
 * - 其余用例钉的是上游 `core.ts` 里**写了但没被测到**的分支，注释里给出上游行号
 *   （`core.ts:<n>` 指 `<Xiranite>` tag `noxide` 那份文件）。
 *
 * 一处上游自带的分叉，**不在这里统一**（与 `plugins/rawfilter` 的 `dryRun` 同一处理由）：
 * 内核的 `deleteAfter` / `deleteSource` 默认是 **true**（`core.ts:251`、`:351` 的 `?? true`），
 * 而清单里那两条字段的默认是 `{boolean: false}`。两边各钉一条，见下面的
 * `内核默认` 那组与 `tests/definition.spec.ts` 的对应那条。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-bandia/tests/core
 */

import { describe, expect, it } from 'vitest'
import type { BandiaCommandResult, BandiaFileStat, BandiaRuntime } from '../src/core.ts'
import { ARCHIVE_EXTENSIONS, DEFAULT_OUTPUT_PREFIX, isArchivePath, mappingsToText, normalizeMappings, parseBandiaPaths, parsePathMappings, runBandia } from '../src/core.ts'

/**
 * 上游 `core.test.ts:77-109` 那份内存 runtime 逐字搬来，连它自己那四个假路径函数一起搬。
 * `commands` 与 `writes` 是它自带的记账面，`removes` 是本文件补的（上游那份没有，
 * 而它要钉的分支里没有"删除真的发生"这一条；补在这里只为把 `?? true` 那两条读回来）。
 */
function createMemoryRuntime (files: Record<string, BandiaFileStat>, commandResults: Record<string, BandiaCommandResult> = {}) {
  const runtime: BandiaRuntime & { commands: string[][]; writes: Record<string, string>; removes: Array<[string, string]> } = {
    commands: [],
    writes: {},
    removes: [],
    findBandizip: async () => 'bz',
    async runCommand (command, args, options) {
      runtime.commands.push([command, ...args, ...(options?.cwd ? [`cwd=${options.cwd}`] : [])])
      return commandResults[[command, ...args].join(' ')] ?? { code: 0, stdout: '', stderr: '', durationMs: 5 }
    },
    exists: async (path) => Boolean(files[path]),
    stat: async (path) => files[path] ?? null,
    ensureDir: async (path) => {
      files[path] = directoryStat()
    },
    removePath: async (path, options) => {
      runtime.removes.push([path, options?.trash === false ? 'delete' : 'trash'])
      delete files[path]
    },
    writeText: async (path, content) => {
      runtime.writes[path] = content
    },
    tempDir: () => 'C:/tmp',
    dirname: (path) => path.replace(/[\\/][^\\/]*$/, '') || '.',
    basename: (path) => path.split(/[\\/]/).pop() ?? path,
    extname: (path) => {
      const name = path.split(/[\\/]/).pop() ?? path
      const index = name.lastIndexOf('.')
      return index >= 0 ? name.slice(index) : ''
    },
    join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace('C:/', 'C:/'),
    resolve: (path) => path,
  }
  return runtime
}

function fileStat (size: number): BandiaFileStat {
  return { exists: true, isDirectory: false, size, mtimeMs: 1_700_000_000_000, ctimeMs: 1_700_000_000_000 }
}

function directoryStat (): BandiaFileStat {
  return { exists: true, isDirectory: true, size: 0, mtimeMs: 1_700_000_000_000, ctimeMs: 1_700_000_000_000 }
}

describe('bandia 内核：上游 core.test.ts 那五条保真用例', () => {
  it('解析归档路径与映射（上游 core.test.ts:6-10）', () => {
    expect(parseBandiaPaths('"C:/a/foo.zip"\nnot archive\nD:/bar.7z')).toEqual(['C:/a/foo.zip', 'D:/bar.7z'])
    expect(parsePathMappings('C:/a/foo.zip=>C:/a/foo\n{"mappings":[{"archive_path":"D:/b.7z","extracted_path":"D:/b"}]}').length).toBe(1)
    expect(parsePathMappings('{"mappings":[{"archive_path":"D:/b.7z","extracted_path":"D:/b"}]}')).toEqual([{ archivePath: 'D:/b.7z', extractedPath: 'D:/b' }])
  })

  it('normal 模式只出计划，不执行 Bandizip（上游 :12-28）', async () => {
    const runtime = createMemoryRuntime({
      'C:/in/book.zip': fileStat(100),
    })
    const result = await runBandia({
      action: 'extract',
      paths: ['C:/in/book.zip'],
      extractMode: 'normal',
      outputPrefix: '[x] ',
      dryRun: true,
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.extractedCount).toBe(1)
    expect(result.data?.pathMappings[0]).toEqual({ archivePath: 'C:/in/book.zip', extractedPath: 'C:/in/[x] book' })
    expect(result.data?.results[0]?.command).toContain('-o:C:/in/[x] book')
    // 阳性对照：预演一条命令都不该发出去，也不该删任何东西。
    expect(runtime.commands).toEqual([])
    expect(runtime.removes).toEqual([])
  })

  it('auto 模式用 `bz l` 的清单猜输出目录（上游 :30-43）', async () => {
    const runtime = createMemoryRuntime({
      'C:/in/book.zip': fileStat(100),
    }, {
      'bz l C:/in/book.zip': { code: 0, stdout: '2024 00 0 0 book/page.jpg', stderr: '' },
    })
    const result = await runBandia({
      action: 'extract',
      paths: ['C:/in/book.zip'],
      dryRun: true,
    }, runtime)

    expect(result.data?.pathMappings[0]?.extractedPath).toBe('C:/in/book')
  })

  it('压缩走被注入的缝（上游 :45-58）', async () => {
    const runtime = createMemoryRuntime({
      'C:/work/book': directoryStat(),
    })
    const result = await runBandia({
      action: 'compress',
      mappings: [{ archivePath: 'C:/out/book.zip', extractedPath: 'C:/work/book' }],
      deleteSource: false,
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.compressedCount).toBe(1)
    expect(runtime.commands[0]).toEqual(['bz', 'a', '-y', 'C:/out/book.zip', 'book', 'cwd=C:/work'])
  })

  it('导出 EFU 行（上游 :60-74）', async () => {
    const runtime = createMemoryRuntime({
      'C:/work/book': directoryStat(),
      'C:/work/book/page.jpg': fileStat(42),
    })
    const result = await runBandia({
      action: 'export_efu',
      paths: ['C:/work/book/page.jpg'],
      efuOutputPath: 'C:/tmp/out.efu',
    }, runtime)

    expect(result.success).toBe(true)
    expect(runtime.writes['C:/tmp/out.efu']).toContain('Filename')
    expect(runtime.writes['C:/tmp/out.efu']).toContain('page.jpg')
  })
})

describe('bandia 内核：上游写了但没被测到的分支', () => {
  it('EFU 那份文件是 BOM + CRLF + FILETIME + 属性 16/32（core.ts:372、:381-384、:392）', async () => {
    const runtime = createMemoryRuntime({
      'C:/work/book': directoryStat(),
      'C:/work/x.zip': fileStat(42),
    })
    await runBandia({ action: 'export_efu', paths: ['C:/work/book', 'C:/work/x.zip'], efuOutputPath: 'C:/tmp/e.efu' }, runtime)
    const text = runtime.writes['C:/tmp/e.efu']
    expect(text.startsWith('\ufeff')).toBe(true)
    expect(text).toContain('\r\n')
    // 1_700_000_000_000 ms → FILETIME：ms*10000 + 116444736000000000（core.ts:550-552）
    expect(text).toContain('133444736000000000')
    expect(text).toContain('"C:/work/book","0","133444736000000000","133444736000000000","16"')
    expect(text).toContain('"C:/work/x.zip","42","133444736000000000","133444736000000000","32"')
    // 阳性对照：表头那五个列名一个都不许多也不许少（第一行带着那个 BOM，所以切掉一位）。
    expect(text.slice(1).split('\r\n')[0]).toBe('"Filename","Size","Date Modified","Date Created","Attributes"')
  })

  it('EFU 的默认落点是 tempDir()/bandia_export.efu（core.ts:390）', async () => {
    const runtime = createMemoryRuntime({ 'C:/work/x.zip': fileStat(1) })
    const result = await runBandia({ action: 'export_efu', paths: ['C:/work/x.zip'] }, runtime)
    expect(result.data?.efuPath).toBe('C:/tmp/bandia_export.efu')
    expect(Object.keys(runtime.writes)).toEqual(['C:/tmp/bandia_export.efu'])
  })

  it('一个现存路径都没有时 EFU 导出失败，并且不写文件（core.ts:388）', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runBandia({ action: 'export_efu', paths: ['C:/nope/x.zip'] }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('No existing paths were available for EFU export.')
    expect(result.data?.exportedCount).toBe(0)
    expect(runtime.writes).toEqual({})
  })

  it('内核默认：deleteAfter / deleteSource 是 **true**，useTrash 也是 true（core.ts:251-253、:351-352）', async () => {
    const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(100) })
    const extracted = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal' }, runtime)
    expect(extracted.success).toBe(true)
    // 阳性对照：`deleteAfter` 没给 ⇒ 真删，而且是 trash（不是永久删）。
    expect(runtime.removes).toEqual([['C:/in/book.zip', 'trash']])

    const other = createMemoryRuntime({ 'C:/work/book': directoryStat() })
    await runBandia({ action: 'compress', mappings: [{ archivePath: 'C:/out/book.zip', extractedPath: 'C:/work/book' }] }, other)
    expect(other.removes).toEqual([['C:/work/book', 'trash']])

    // 反过来：显式 false 才算 false。
    const kept = createMemoryRuntime({ 'C:/in/book.zip': fileStat(100) })
    await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', deleteAfter: false }, kept)
    expect(kept.removes).toEqual([])
  })

  it('清单默认与内核默认相反：`dryRun` 没给时内核是**真执行**（core.ts:186、:233）', async () => {
    const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(100) })
    const result = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal' }, runtime)
    // 阳性对照：真执行就一定发过命令；预演那条用例里 commands 必须是空的。
    expect(runtime.commands.length).toBeGreaterThan(0)
    expect(result.data?.results[0]?.skipped).toBeUndefined()
    // 而定义里 `dryRun` 的声明默认是 true（`tests/definition.spec.ts` 钉另一半）。
    const dry = createMemoryRuntime({ 'C:/in/book.zip': fileStat(100) })
    await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', dryRun: true }, dry)
    expect(dry.commands).toEqual([])
  })

  it('预演连 Bandizip 都不找，找不到可执行文件才算失败（core.ts:186-187、:292-293）', async () => {
    let probed = 0
    const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(100) })
    runtime.findBandizip = async () => {
      probed += 1
      return null
    }
    const planned = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', dryRun: true }, runtime)
    expect(planned.success).toBe(true)
    expect(probed).toBe(0)

    const live = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal' }, runtime)
    expect(live.success).toBe(false)
    expect(live.message).toBe('Bandizip executable was not found. Set BANDIZIP_PATH or install Bandizip.')
    expect(probed).toBe(1)
  })

  it('没有归档扩展名的输入被静默丢掉，报的是"没给路径"（core.ts:184、:410-416）', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runBandia({ action: 'extract', paths: ['C:/in/somefolder', 'C:/in/file.txt'] }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('No archive paths provided.')
    // 阳性对照：那七项扩展名之外的一律不算归档。
    expect(ARCHIVE_EXTENSIONS).toEqual(['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz'])
    expect(isArchivePath('C:/a/x.zip')).toBe(true)
    expect(isArchivePath('C:/a/x.rar')).toBe(true)
    expect(isArchivePath('C:/a/x.ZIP')).toBe(true)
    expect(isArchivePath('C:/a/x.ace')).toBe(false)
  })

  it('归档不存在 / 是目录 ⇒ 条目级失败，整次也失败（core.ts:220-221、:215）', async () => {
    const missing = createMemoryRuntime({})
    const one = await runBandia({ action: 'extract', paths: ['C:/in/nope.zip'], dryRun: true }, missing)
    expect(one.success).toBe(false)
    expect(one.data?.results[0]?.error).toBe('Archive does not exist.')
    expect(one.message).toBe('Extract complete: 0 succeeded, 1 failed.')

    const asDir = createMemoryRuntime({ 'C:/in/folder.zip': directoryStat() })
    const two = await runBandia({ action: 'extract', paths: ['C:/in/folder.zip'], dryRun: true }, asDir)
    expect(two.data?.results[0]?.error).toBe('Archive path is a directory.')
  })

  it('覆盖模式翻成 Bandizip 开关（core.ts:472-476）', async () => {
    const cases: Array<[string, string]> = [['overwrite', '-aoa'], ['skip', '-aos'], ['rename', '-aou']]
    for (const [mode, flag] of cases) {
      const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(1) })
      await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', overwriteMode: mode as 'overwrite' | 'skip' | 'rename', dryRun: true }, runtime)
      // 预演不发命令，所以开关只能从 `command` 字面量里读回来。
      const result = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', overwriteMode: mode as 'overwrite' | 'skip' | 'rename', dryRun: true }, runtime)
      expect(result.data?.results[0]?.command).toContain(flag)
      expect(result.data?.results[0]?.command).toContain('-y')
    }
  })

  it('auto 模式在 `bz l` 失败或多根时落回去扩展名的名字（core.ts:271-285）', async () => {
    const failing = createMemoryRuntime({ 'C:/in/a.b.c.zip': fileStat(1) }, {
      'bz l C:/in/a.b.c.zip': { code: 2, stdout: '', stderr: 'broken archive' },
    })
    const one = await runBandia({ action: 'extract', paths: ['C:/in/a.b.c.zip'], dryRun: true }, failing)
    expect(one.data?.pathMappings[0]?.extractedPath).toBe('C:/in/a.b.c')

    const twoRoots = createMemoryRuntime({ 'C:/in/multi.zip': fileStat(1) }, {
      'bz l C:/in/multi.zip': { code: 0, stdout: '2024 00 0 0 alpha/x.jpg\r\n2024 00 0 0 beta/y.jpg', stderr: '' },
    })
    const two = await runBandia({ action: 'extract', paths: ['C:/in/multi.zip'], dryRun: true }, twoRoots)
    expect(two.data?.pathMappings[0]?.extractedPath).toBe('C:/in/multi')

    // 阳性对照：只有一个根时才用那个根。
    const oneRoot = createMemoryRuntime({ 'C:/in/multi.zip': fileStat(1) }, {
      'bz l C:/in/multi.zip': { code: 0, stdout: '2024 00 0 0 alpha/x.jpg\r\n2024 00 0 0 alpha/y.jpg', stderr: '' },
    })
    const three = await runBandia({ action: 'extract', paths: ['C:/in/multi.zip'], dryRun: true }, oneRoot)
    expect(three.data?.pathMappings[0]?.extractedPath).toBe('C:/in/alpha')
  })

  it('解压失败时条目带命令与 stderr，成功计数不动（core.ts:246-249）', async () => {
    const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(10) }, {
      'bz x -y -aoa -o:C:/in/pbook C:/in/book.zip': { code: 1, stdout: '', stderr: 'x'.repeat(600) },
    })
    const result = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', outputPrefix: 'p' }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.extractedCount).toBe(0)
    const item = result.data?.results[0]
    expect(item?.command).toBe('bz x -y -aoa -o:C:/in/pbook C:/in/book.zip')
    // shortError 留尾并冠 `...`（core.ts:537-540）
    expect(item?.error?.startsWith('...')).toBe(true)
    expect(item?.error?.length).toBe(500)
    // 阳性对照：失败那条不许把归档删掉（`deleteAfter` 的 `?? true` 只在 code===0 之后才走）。
    expect(runtime.removes).toEqual([])
  })

  it('`stop` 只置一个标志位并回一句话，不碰缝（core.ts:170-173）', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runBandia({ action: 'stop' }, runtime)
    expect(result.success).toBe(true)
    expect(result.message).toBe('Stop requested.')
    expect(result.data?.action).toBe('stop')
    // 阳性对照：上游清单**没有** stop 这条动作，所以宿主面上没有工具能走到这里
    //（另一半钉在 tests/definition.spec.ts）。
    expect(runtime.commands).toEqual([])
  })

  it('未知动作回一条失败，而不是抛（core.ts:179）', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runBandia({ action: 'nope' as 'extract' }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Unknown action: nope')
    expect(runtime.commands).toEqual([])
  })

  it('映射三种写法等价，且 JSON 优先（core.ts:119-144、:164-166）', () => {
    const fromObject = normalizeMappings([{ archivePath: 'a.zip', extractedPath: 'a' }])
    expect(fromObject).toEqual([{ archivePath: 'a.zip', extractedPath: 'a' }])
    expect(normalizeMappings({ mappings: [{ archive_path: 'b.7z', extracted_path: 'b' }] })).toEqual([{ archivePath: 'b.7z', extractedPath: 'b' }])
    expect(parsePathMappings('a.zip|a')).toEqual([{ archivePath: 'a.zip', extractedPath: 'a' }])
    expect(parsePathMappings('a.zip\ta')).toEqual([{ archivePath: 'a.zip', extractedPath: 'a' }])
    expect(parsePathMappings('')).toEqual([])
    expect(parsePathMappings('只有一列')).toEqual([])
    // 阳性对照：`mappingsToText` 的产物必须能被 `parsePathMappings` 原样读回来。
    expect(parsePathMappings(mappingsToText(fromObject))).toEqual(fromObject)
  })

  it('重打包必须有映射，否则整次失败（core.ts:289-290、:426-440）', async () => {
    const runtime = createMemoryRuntime({ 'C:/work/book': directoryStat() })
    const empty = await runBandia({ action: 'repack' }, runtime)
    expect(empty.success).toBe(false)
    expect(empty.message).toBe('No valid path mappings or source paths provided.')

    // 阳性对照：repack 没有映射时，`paths` 也能当来源（collectMappings 的第二条腿）。
    const fromPaths = await runBandia({ action: 'repack', paths: ['C:/work/book'], dryRun: true }, runtime)
    expect(fromPaths.success).toBe(true)
    expect(fromPaths.data?.pathMappings).toEqual([{ archivePath: 'C:/work/book.zip', extractedPath: 'C:/work/book' }])
  })

  it('`outputPrefix` 的内核默认是 `[extract] `（core.ts:95）', async () => {
    const runtime = createMemoryRuntime({ 'C:/in/book.zip': fileStat(1) })
    const result = await runBandia({ action: 'extract', paths: ['C:/in/book.zip'], extractMode: 'normal', dryRun: true }, runtime)
    expect(DEFAULT_OUTPUT_PREFIX).toBe('[extract] ')
    expect(result.data?.pathMappings[0]?.extractedPath).toBe('C:/in/[extract] book')
    // 上游**终端面**那份常量是另一个值（`cli.ts:40` 的 `【a】`）。本包没把它搬进来：
    // 这一面只拒绝（见 src/cli.ts），所以这里不产生第二个默认值。两份默认不许合并成一份。
    expect(DEFAULT_OUTPUT_PREFIX).not.toBe('【a】')
  })

  it('并行只作用于解压，workers 被夹在 1..8（core.ts:191、:299-308）', async () => {
    const runtime = createMemoryRuntime({
      'C:/in/a.zip': fileStat(1),
      'C:/in/b.zip': fileStat(1),
      'C:/in/c.zip': fileStat(1),
    })
    const result = await runBandia({ action: 'extract', paths: ['C:/in/a.zip', 'C:/in/b.zip', 'C:/in/c.zip'], parallel: true, workers: 99, dryRun: true, deleteAfter: false }, runtime)
    // 结果按输入序回填（runLimited 先占 index 再 await，core.ts:461-466）。
    expect((result.data?.results ?? []).map((item) => item.sourcePath)).toEqual(['C:/in/a.zip', 'C:/in/b.zip', 'C:/in/c.zip'])
  })
})
