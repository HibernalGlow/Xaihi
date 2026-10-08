/**
 * enginev 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，不调用被测函数得到）：
 * - 前五条逐字抄自上游 `packages/nodes/enginev/src/core.test.ts`（tag `noxide`，194 行），
 *   连它那份内存 runtime（`items` 表、`ensureDir`、`moveTree`、`normalize` / `dirname` /
 *   `basename` 三个**假**路径函数）一起搬。`["222","111"]`、`"Ocean_Loop_abcd..._111"`、
 *   `["/work/111","/work/Ocean Loop_111"]` 这些字面量都是上游手写的。
 * - 其余用例钉的是上游 `core.ts` 里**写了但没被测到**的分支，注释里给出上游行号。
 * - 最后三组跑的是**真文件系统**（`src/platform.ts` + `mkdtemp`），因为台账给这个节点记的
 *   hostRequirements 是 `os-native` + `recursive-enumeration` + `file-io`，那三条只能在真盘上验。
 *
 * 上游自带的两处默认**不在这里统一**：`dryRun` 三处（内核 `core.ts:177`、清单、上游终端面
 * `cli.ts:234`）都是预演——这与 `rawfilter` / `crashu` 那份"内核默认执行"的分叉相反，
 * 所以这里钉的是"三处一致"，见 `normalizeEngineVInput` 那条与 `tests/definition.spec.ts`。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-enginev/tests/core
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { EngineVDirEntry, EngineVPathInfo, EngineVRuntime } from '../src/core.ts'
import {
  DEFAULT_TEMPLATE,
  DEFAULT_WORKSHOP_PATH,
  buildRenamePlan,
  calculateStats,
  filterWallpapers,
  generateNewName,
  normalizeEngineVInput,
  runEngineV,
  scanWorkshop,
  sortWallpapers,
  validateTemplate,
} from '../src/core.ts'
import { TRASH_GAP, createNodeEngineVRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

describe('enginev 内核：上游 core.test.ts 那五条保真用例', () => {
  it('扫描 Wallpaper Engine 工程目录（上游 core.test.ts:6-17）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))
    runtime.file('/work/111/scene.mp4', 100)
    runtime.json('/work/222/project.json', project('Dark Room', 'Scene', 'Mature'))
    runtime.file('/work/222/scene.pkg', 50)
    runtime.file('/work/readme.txt', 10)

    const wallpapers = await scanWorkshop('/work', runtime)
    expect(wallpapers.map((item) => item.workshopId)).toEqual(['222', '111'])
    expect(wallpapers.find((item) => item.workshopId === '111')?.size).toBeGreaterThan(100)
  })

  it('筛选与统计经 runEngineV（上游 :19-29）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))
    runtime.json('/work/222/project.json', project('Dark Room', 'Scene', 'Mature'))

    const result = await runEngineV({ action: 'filter', path: '/work', filters: { contentRating: 'Mature' } }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.filteredWallpapers.map((item) => item.workshopId)).toEqual(['222'])
    expect(result.data?.typeStats).toEqual({ Scene: 1, Video: 1 })
    expect(result.data?.ratingStats).toEqual({ Everyone: 1, Mature: 1 })
  })

  it('生成安全名并校验模板（上游 :31-39）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', { ...project('Ocean/Loop', 'Video', 'Everyone'), description: 'abcdefghi' })
    const [wallpaper] = await scanWorkshop('/work', runtime)

    expect(generateNewName(wallpaper!, '{title}_{desc}_{id}', { descMaxLength: 4 })).toBe('Ocean_Loop_abcd..._111')
    expect(validateTemplate('{title}_{id}')).toEqual([])
    expect(validateTemplate('{missing}')).toContain('Unknown placeholder: {missing}')
  })

  it('改名既出计划也真执行（上游 :41-55）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))

    const dry = await runEngineV({ action: 'rename', path: '/work', ids: '111', template: '{title}_{id}' }, runtime)
    expect(dry.data?.renameResults[0]?.status).toBe('planned')
    expect(dry.data?.totalCount).toBe(1)
    expect(dry.data?.typeStats).toEqual({ Video: 1 })
    expect(runtime.moves.length).toBe(0)

    const executed = await runEngineV({ action: 'rename', path: '/work', ids: '111', template: '{title}_{id}', dryRun: false }, runtime)
    expect(executed.success).toBe(true)
    expect(executed.data?.renameResults[0]?.status).toBe('renamed')
    expect(runtime.moves[0]).toEqual(['/work/111', '/work/Ocean Loop_111'])
  })

  it('删除预演与导出都吃给定的 wallpapers（上游 :57-70）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))
    const scan = await runEngineV({ action: 'scan', path: '/work' }, runtime)
    const wallpapers = scan.data?.wallpapers ?? []

    const deletion = await runEngineV({ action: 'delete', wallpapers, ids: '111' }, runtime)
    expect(deletion.data?.deleteResults[0]?.status).toBe('planned')
    expect(runtime.removes.length).toBe(0)

    const exported = await runEngineV({ action: 'export', wallpapers, exportPath: '/out/wallpapers.txt', exportFormat: 'paths' }, runtime)
    expect(exported.success).toBe(true)
    expect(runtime.writes['/out/wallpapers.txt']).toContain('/work/111')
  })
})

describe('enginev 内核：上游写了但没被测到的分支', () => {
  it('normalizeEngineVInput 的默认值逐条，三处预演口径一致（core.ts:166-186）', () => {
    const normalized = normalizeEngineVInput({})
    expect(normalized.action).toBe('scan')
    expect(normalized.workshopPath).toBe('')
    // 内核缺省就是预演（`?? true`），与清单默认、上游终端面那三处一致；不许"统一"成执行。
    expect(normalized.dryRun).toBe(true)
    expect(normalized.permanent).toBe(false)
    expect(normalized.copyMode).toBe(false)
    expect(normalized.maxWorkers).toBe(4)
    expect(normalized.descMaxLength).toBe(18)
    expect(normalized.nameMaxLength).toBe(120)
    expect(normalized.template).toBe(DEFAULT_TEMPLATE)
    expect(normalized.exportFormat).toBe('json')
    expect(normalized.sortField).toBe('none')
    expect(normalized.sortOrder).toBe('desc')
    // 阳性对照：`maxWorkers` 只夹下限、上限不管（core.ts:170），0 与负数都变 1。
    expect(normalizeEngineVInput({ maxWorkers: 0 }).maxWorkers).toBe(1)
    expect(normalizeEngineVInput({ maxWorkers: -5 }).maxWorkers).toBe(1)
    expect(normalizeEngineVInput({ maxWorkers: 9999 }).maxWorkers).toBe(9999)
    // `dryRun` 显式 false 才是 false。
    expect(normalizeEngineVInput({ dryRun: false }).dryRun).toBe(false)
  })

  it('camelCase 与 snake_case 两种写法都吃，优先级也照上游（core.ts:169、:173、:177）', () => {
    expect(normalizeEngineVInput({ workshop_path: '/w' }).workshopPath).toBe('/w')
    expect(normalizeEngineVInput({ path: '/p' }).workshopPath).toBe('/p')
    // `workshopPath` 赢 `workshop_path`，后者赢 `path`。
    expect(normalizeEngineVInput({ workshopPath: '/a', workshop_path: '/b', path: '/c' }).workshopPath).toBe('/a')
    expect(normalizeEngineVInput({ workshop_path: '/b', path: '/c' }).workshopPath).toBe('/b')
    expect(normalizeEngineVInput({ workshopIds: ['1', '2'] }).workshopIds).toEqual(['1', '2'])
    expect(normalizeEngineVInput({ ids: '1, 2;3' }).workshopIds).toEqual(['1', '2', '3'])
    expect(normalizeEngineVInput({ dry_run: false }).dryRun).toBe(false)
    // 引号被 `clean()` 剥掉（core.ts:585-587）。
    expect(normalizeEngineVInput({ workshopPath: '"C:/w"' }).workshopPath).toBe('C:/w')
  })

  it('清单/内核共用的那条写死默认是 Windows 路径，本包不改它（core.ts:144）', () => {
    expect(DEFAULT_WORKSHOP_PATH).toBe('E:\\SteamLibrary\\steamapps\\workshop\\content\\431960')
    // 内核本身**不**用它兜底：`workshopPath` 空就是空，报的是 required（core.ts:373）。
    // 阳性对照：这条就是"默认值来自清单/配置，不来自内核"的证据。
    return runEngineV({ action: 'scan' }, createMemoryRuntime()).then((result) => {
      expect(result.success).toBe(false)
      expect(result.message).toBe('Workshop path is required.')
    })
  })

  it('删除没给 id 就整次失败，绝不"全删"（core.ts:423）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))
    const result = await runEngineV({ action: 'delete', path: '/work' }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Delete requires at least one workshop id.')
    expect(runtime.removes).toEqual([])
  })

  it('删除真执行时 trash 与否 = !permanent（core.ts:436-437）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('A', 'Video', 'Everyone'))
    const scan = await runEngineV({ action: 'scan', path: '/work' }, runtime)
    const wallpapers = scan.data?.wallpapers ?? []

    const trashed = await runEngineV({ action: 'delete', wallpapers, ids: '111', dryRun: false }, runtime)
    expect(trashed.data?.deleteResults[0]?.message).toBe('trashed')
    expect(runtime.removes[0]).toEqual(['/work/111', 'trash'])

    runtime.json('/work/222/project.json', project('B', 'Scene', 'Mature'))
    const second = await runEngineV({ action: 'scan', path: '/work' }, runtime)
    const permanent = await runEngineV({ action: 'delete', wallpapers: second.data?.wallpapers ?? [], ids: '222', dryRun: false, permanent: true }, runtime)
    expect(permanent.data?.deleteResults[0]?.message).toBe('deleted')
    expect(runtime.removes[1]).toEqual(['/work/222', 'delete'])
  })

  it('导出没给路径就失败；给了路径就先建目录再写，两种格式都以换行收尾（core.ts:452-460）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Ocean Loop', 'Video', 'Everyone'))
    const scan = await runEngineV({ action: 'scan', path: '/work' }, runtime)
    const wallpapers = scan.data?.wallpapers ?? []

    const missing = await runEngineV({ action: 'export', wallpapers }, runtime)
    expect(missing.success).toBe(false)
    expect(missing.message).toBe('Export path is required.')

    const asJson = await runEngineV({ action: 'export', wallpapers, exportPath: '/out/w.json' }, runtime)
    expect(asJson.success).toBe(true)
    // 夹具自己写的键，`noUncheckedIndexedAccess` 不会替我们记住这一点，所以在这里点名。
    const text = runtime.writes['/out/w.json']!
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text) as Array<{ workshopId: string }>).toHaveLength(1)
    // 阳性对照：paths 格式只有一行路径 + 一个换行，不是 JSON。
    await runEngineV({ action: 'export', wallpapers, exportPath: '/out/p.txt', exportFormat: 'paths' }, runtime)
    expect(runtime.writes['/out/p.txt']).toBe('/work/111\n')
  })

  it('既没给目录也没给 wallpapers 时是抛异常被折成失败（core.ts:465、:200-202）', async () => {
    const result = await runEngineV({ action: 'filter' }, createMemoryRuntime())
    expect(result.success).toBe(false)
    expect(result.message).toBe('Workshop path or wallpapers are required.')
    // 失败载荷的 shape：emptyData + 那一条错误 + failedCount 1（core.ts:508-510）。
    expect(result.data?.errors).toEqual(['Workshop path or wallpapers are required.'])
    expect(result.data?.failedCount).toBe(1)
    expect(result.data?.totalCount).toBe(0)
  })

  it('模板非法时改名整次失败，一个都不动（core.ts:386-387）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('A', 'Video', 'Everyone'))
    const result = await runEngineV({ action: 'rename', path: '/work', ids: '111', template: 'plain', dryRun: false }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Template does not include a known placeholder.')
    expect(runtime.moves).toEqual([])

    // 阳性对照：占位符合法但外面有非法字符，同样拦下。
    const illegal = await runEngineV({ action: 'rename', path: '/work', ids: '111', template: '{title}<x>', dryRun: false }, runtime)
    expect(illegal.message).toContain('Template contains illegal path characters outside placeholders.')
    expect(runtime.moves).toEqual([])
  })

  it('copyMode 换目的地、不碰原目录；目标同名时加 `_1`（core.ts:346-348、:484-492）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Same', 'Video', 'Everyone'))
    runtime.json('/work/222/project.json', project('Same', 'Scene', 'Mature'))
    const copy = await runEngineV({
      action: 'rename', path: '/work', ids: '111,222', template: '{title}', dryRun: false, copyMode: true, targetPath: '/out',
    }, runtime)
    expect(copy.success).toBe(true)
    expect(copy.data?.renameResults.map((item) => item.newPath)).toEqual(['/out/Same', '/out/Same_1'])
    expect(copy.data?.renameResults.every((item) => item.status === 'copied')).toBe(true)
    // 阳性对照：copyMode 走 copyDir，不许出现在 moves 里。
    expect(runtime.moves).toEqual([])
    expect(runtime.copies.length).toBe(2)
  })

  it('撞盘上已有的目录也要让位（core.ts:487）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('Taken', 'Video', 'Everyone'))
    runtime.ensureDir('/work/Taken')
    const plan = await runEngineV({ action: 'rename', path: '/work', ids: '111', template: '{title}' }, runtime)
    expect(plan.data?.renameResults[0]?.newName).toBe('Taken_1')
  })

  it('筛选：标题是小写子串，评级是全等，标签任一命中（core.ts:263-279）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', { ...project('Ocean Loop', 'Video', 'Everyone'), tags: ['Demo', 'Water'] })
    runtime.json('/work/222/project.json', { ...project('Dark Room', 'Scene', 'Mature'), tags: ['Fire'] })
    const all = await scanWorkshop('/work', runtime)

    expect(filterWallpapers(all, { title: 'ocean' }).map((item) => item.workshopId)).toEqual(['111'])
    expect(filterWallpapers(all, { type: 'Scene' }).map((item) => item.workshopId)).toEqual(['222'])
    // snake_case 那条别名也读（EngineVFilterOptions.contentrating）
    expect(filterWallpapers(all, { contentrating: 'Everyone' }).map((item) => item.workshopId)).toEqual(['111'])
    // 标签是**大小写敏感的全等**：`normalizeTags` 只做 `clean()`（trim + 剥引号），不转小写，
    // `wallpaper.tags.includes(tag)` 也不是子串（core.ts:560-564、:276）。所以这里必须写原样大小写。
    expect(filterWallpapers(all, { tags: 'Fire,Demo' }).map((item) => item.workshopId)).toEqual(['222', '111'])
    // 阳性对照两条：小写不算命中；子串也不算命中。
    expect(filterWallpapers(all, { tags: 'fire' })).toEqual([])
    expect(filterWallpapers(all, { tags: 'e' })).toEqual([])
    expect(filterWallpapers(all, { tags: 'emo' })).toEqual([])
  })

  it('sortWallpapers：none 不排、size 是数值差、默认方向是 desc（core.ts:281-290）', () => {
    const items = [
      { workshopId: '1', title: 'B', size: 30 },
      { workshopId: '2', title: 'a', size: 10 },
      { workshopId: '3', title: 'C', size: 20 },
    ]
    const asWallpapers = items as unknown as Parameters<typeof sortWallpapers>[0]
    expect(sortWallpapers(asWallpapers, 'none').map((item) => item.workshopId)).toEqual(['1', '2', '3'])
    expect(sortWallpapers(asWallpapers, 'size', 'desc').map((item) => item.workshopId)).toEqual(['1', '3', '2'])
    expect(sortWallpapers(asWallpapers, 'size', 'asc').map((item) => item.workshopId)).toEqual(['2', '3', '1'])
    // 阳性对照：`title` 走 localeCompare(numeric, base)，'a' 排在 'B'/'C' 前。
    expect(sortWallpapers(asWallpapers, 'title', 'asc').map((item) => item.workshopId)).toEqual(['2', '1', '3'])
  })

  it('generateNewName：截断算式与"全被清光时落回目录名"（core.ts:292-323）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', { ...project('Ocean Loop', 'Video', 'Everyone'), description: 'one two\nthree' })
    const [wallpaper] = await scanWorkshop('/work', runtime)
    const item = wallpaper!
    // 换行折成空格（core.ts:299）。
    expect(generateNewName(item, '{desc}', { descMaxLength: 0 })).toBe('one two three')
    expect(generateNewName(item, '{title}')).toBe('Ocean Loop')
    // 超长时保住 `#<id>` 尾巴那份算式：这里用 `{id}` 占位符造出尾巴。
    const long = generateNewName({ ...item, title: 'x'.repeat(200) }, '{title}#{id}', { nameMaxLength: 40 })
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('#111')).toBe(true)
    // 空模板 ⇒ 名字整个被清光 ⇒ 落回目录名（core.ts:322）。
    expect(generateNewName(item, '')).toBe('111')
    // 而全是非法字符的模板**不是**空串：`sanitizePathSegment` 把每个字符换成 `_`，
    // 所以它保住的是那串下划线，不是目录名（core.ts:566-571）。别把这两条混成一条。
    expect(generateNewName(item, ':::')).toBe('___')
  })

  it('calculateStats 只数非空字段（core.ts:362-370）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', { title: 'A', type: '', contentrating: '', description: '', tags: [] })
    runtime.json('/work/222/project.json', project('B', 'Scene', 'Mature'))
    const all = await scanWorkshop('/work', runtime)
    expect(calculateStats(all)).toEqual({ typeStats: { Scene: 1 }, ratingStats: { Mature: 1 } })
  })

  it('扫描进度是百分数，收尾由调用方补 100（core.ts:222、:375）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('A', 'Video', 'Everyone'))
    runtime.json('/work/222/project.json', project('B', 'Scene', 'Mature'))
    const events: Array<{ type: string; progress?: number | undefined; message: string }> = []
    const result = await runEngineV({ action: 'scan', path: '/work' }, runtime, (event) => events.push(event))
    expect(result.success).toBe(true)
    expect(result.message).toBe('Scan complete: 2 wallpaper(s).')
    const progress = events.filter((event) => event.type === 'progress')
    expect(progress.map((event) => event.progress)).toEqual([10, 45, 100])
    // 阳性对照：这条与 `plugins/dissolvef` 那份 0..1 的内核不同，接线时不许 `* 100`。
    expect(Math.max(...progress.map((event) => event.progress ?? 0))).toBe(100)
  })

  it('单个目录读不动是 log 事件 + 跳过，不是整次失败（core.ts:226-228）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('A', 'Video', 'Everyone'))
    runtime.dirWithoutProject('/work/222')
    const events: Array<{ type: string; message: string }> = []
    const wallpapers = await scanWorkshop('/work', runtime, (event) => events.push(event))
    expect(wallpapers.map((item) => item.workshopId)).toEqual(['111'])
    // 没有 project.json 的目录走的是 `readWallpaperFolder` 返回 null 那条，不是异常 ⇒ 没有 log。
    expect(events.filter((event) => event.type === 'log')).toEqual([])
    // 阳性对照：真正抛异常的目录才会进 log。
    runtime.throwOnRead('/work/333/project.json')
    runtime.json('/work/333/project.json', project('C', 'Video', 'Everyone'))
    const second: Array<{ type: string; message: string }> = []
    const again = await scanWorkshop('/work', runtime, (event) => second.push(event))
    expect(again.map((item) => item.workshopId)).toEqual(['111'])
    expect(second.some((event) => event.type === 'log' && event.message.startsWith('Skipped 333'))).toBe(true)
  })

  it('buildRenamePlan 只吃给定的那几个 id（core.ts:336-360）', async () => {
    const runtime = createMemoryRuntime()
    runtime.json('/work/111/project.json', project('A', 'Video', 'Everyone'))
    runtime.json('/work/222/project.json', project('B', 'Scene', 'Mature'))
    const all = await scanWorkshop('/work', runtime)
    const planned = await buildRenamePlan(all, { workshopIds: ['222'], template: '{title}', descMaxLength: 18, nameMaxLength: 120, copyMode: false, targetPath: '' }, runtime)
    expect(planned.map((item) => [item.workshopId, item.newName])).toEqual([['222', 'B']])
    // 阳性对照：不给 id ⇒ 全量（requireIds=false 那一条腿）。
    const everything = await buildRenamePlan(all, { workshopIds: [], template: '{title}', descMaxLength: 18, nameMaxLength: 120, copyMode: false, targetPath: '' }, runtime)
    expect(everything).toHaveLength(2)
  })
})

describe('enginev 的 platform.ts（真盘：os-native / recursive-enumeration / file-io）', () => {
  it('pathInfo 返回解析后的绝对路径，并给出**真实**的 created/modified（core.ts:256-257 靠它）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-fs-'))
    tempRoots.push(root)
    const file = join(root, 'a.txt')
    await writeFile(file, 'hello', 'utf8')
    const runtime = createNodeEngineVRuntime()

    const info = await runtime.pathInfo(file)
    expect(info).toMatchObject({ path: file, exists: true, isFile: true, isDirectory: false, size: 5 })
    // 这条就是"为什么不能整份改写成 ctx.fs"的可执行证据：`FsInfo` 给不出这两个值。
    expect(info.createdMs).toBeGreaterThan(0)
    expect(info.modifiedMs).toBeGreaterThan(0)
    const real = await stat(file)
    expect(info.modifiedMs).toBe(real.mtimeMs)

    // 阳性对照：不存在的路径不抛，折成 exists:false，但 `path` 仍是解析后的绝对形。
    const absent = await runtime.pathInfo(join(root, 'nope'))
    expect(absent.exists).toBe(false)
    expect(absent.path).toBe(join(root, 'nope'))
    expect(absent.createdMs).toBe(0)
  })

  it('相对路径按 process.cwd() 解析（缝自己 resolve，内核不做二次解析）', async () => {
    const runtime = createNodeEngineVRuntime()
    const info = await runtime.pathInfo('.')
    expect(info.path).toBe(process.cwd())
    expect(info.isDirectory).toBe(true)
  })

  it('folderSize 递归求和（core.ts:469-476 ⇒ recursive-enumeration）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-fs-'))
    tempRoots.push(root)
    await mkdir(join(root, '111', 'nested'), { recursive: true })
    await writeFile(join(root, '111', 'a.bin'), 'x'.repeat(10), 'utf8')
    await writeFile(join(root, '111', 'nested', 'b.bin'), 'x'.repeat(7), 'utf8')
    await writeFile(join(root, '111', 'project.json'), JSON.stringify({ title: 'A', type: 'Video', contentrating: 'Everyone' }), 'utf8')

    const runtime = createNodeEngineVRuntime()
    const wallpapers = await scanWorkshop(root, runtime)
    expect(wallpapers).toHaveLength(1)
    // 10 + 7 + project.json 那 63 字节里的实际长度：只断"两层都被算进来"。
    expect(wallpapers[0]!.size).toBeGreaterThan(17)
    const entries = await runtime.listDir(join(root, '111'))
    expect(entries.map((entry) => entry.name).sort()).toEqual(['a.bin', 'nested', 'project.json'])
    // 阳性对照：目录项的 size 恒为 0（真尺寸只加在文件上）。
    expect(entries.find((entry) => entry.name === 'nested')?.size).toBe(0)
  })

  it('removePath 的 trash 那一半**响亮拒绝**，文件必须还在（缺口 G-no-os-trash）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-fs-'))
    tempRoots.push(root)
    const target = join(root, 'keep-me')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'x.txt'), 'x', 'utf8')
    const runtime = createNodeEngineVRuntime()

    await expect(runtime.removePath(target, { trash: true })).rejects.toThrow(/回收站/)
    // 阳性对照：拒绝不是空操作——目录树必须原封不动。
    expect(existsSync(target)).toBe(true)
    expect(await readdir(target)).toEqual(['x.txt'])

    await runtime.removePath(target, { trash: false })
    expect(existsSync(target)).toBe(false)

    // 不存在的路径是静默返回（上游 `:104` 那条 `if (!(await exists)) return`）。
    await expect(runtime.removePath(join(root, 'nope'), { trash: true })).resolves.toBeUndefined()
  })

  it('内核在真盘上跑完整循环：scan → rename(执行) → delete(永久)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-fs-'))
    tempRoots.push(root)
    const workshop = join(root, 'workshop')
    await mkdir(join(workshop, '111'), { recursive: true })
    await writeFile(join(workshop, '111', 'project.json'), JSON.stringify({ title: 'Ocean Loop', type: 'Video', contentrating: 'Everyone', description: 'demo', tags: ['Demo'] }), 'utf8')
    await writeFile(join(workshop, '111', 'scene.mp4'), 'x'.repeat(20), 'utf8')
    const runtime = createNodeEngineVRuntime()

    const scanned = await runEngineV({ action: 'scan', workshopPath: workshop }, runtime)
    expect(scanned.message).toBe('Scan complete: 1 wallpaper(s).')
    expect(scanned.data?.wallpapers[0]?.modifiedTime.startsWith('20')).toBe(true)

    const renamed = await runEngineV({ action: 'rename', workshopPath: workshop, ids: '111', template: '{title}_{id}', dryRun: false }, runtime)
    expect(renamed.data?.renameResults[0]?.status).toBe('renamed')
    // 阳性对照：真改了盘——旧目录不再存在，新目录里文件还在。
    expect(existsSync(join(workshop, '111'))).toBe(false)
    expect(await readdir(join(workshop, 'Ocean Loop_111'))).toEqual(['project.json', 'scene.mp4'])

    // id 里带空格，所以走数组那条绑定：`normalizeIds` 对字符串会按空格再切一次（core.ts:556）。
    const deleted = await runEngineV({ action: 'delete', workshopPath: workshop, workshopIds: ['Ocean Loop_111'], dryRun: false, permanent: true }, runtime)
    expect(deleted.data?.deleteResults[0]?.message).toBe('deleted')
    expect(existsSync(join(workshop, 'Ocean Loop_111'))).toBe(false)
  })

  it('copyDir 撞上已存在的目标是失败而不是覆盖（platform.ts 上游 :23 的 errorOnExist）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-fs-'))
    tempRoots.push(root)
    const source = join(root, 'src')
    const target = join(root, 'dst')
    await mkdir(source, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(join(source, 'a.txt'), 'a', 'utf8')
    const runtime = createNodeEngineVRuntime()

    await expect(runtime.copyDir(source, target)).rejects.toThrow()
    expect(await readdir(target)).toEqual([])
    // 阳性对照：目标不存在时才写得进去。
    await runtime.copyDir(source, join(root, 'fresh'))
    expect(await readdir(join(root, 'fresh'))).toEqual(['a.txt'])
  })

  it('TRASH_GAP 那句文案点名的东西，使用者照着做得动（不是一句"失败"）', () => {
    expect(TRASH_GAP).toContain('G-no-os-trash')
    expect(TRASH_GAP).toContain('permanent=true')
  })
})

type MemoryItem = { type: 'dir' | 'file'; size: number; text?: string; createdMs: number; modifiedMs: number }

/**
 * 上游 `core.test.ts:73-168` 那份内存 runtime 逐字搬来，连它**自己那三个假路径函数**
 * 一起搬（`normalize` / `dirname` / `basename` 都是字符串操作，不是 `node:path`）。
 * 三处补充：`removes` 记第二参数（上游记了但没断）、`copies` 记 `copyDir`、
 * `dirWithoutProject` / `throwOnRead` 用来钉上游没测的两条分支。
 */
function createMemoryRuntime() {
  const items: Record<string, MemoryItem> = { '/': dirItem() }
  const unreadable = new Set<string>()
  const runtime: EngineVRuntime & {
    writes: Record<string, string>
    moves: string[][]
    copies: string[][]
    removes: string[][]
    file: (path: string, size?: number) => void
    json: (path: string, data: unknown) => void
    dirWithoutProject: (path: string) => void
    throwOnRead: (path: string) => void
  } = {
    writes: {},
    moves: [],
    copies: [],
    removes: [],
    file(path: string, size = 1) {
      ensureDir(dirname(path))
      items[normalize(path)] = { type: 'file', size, createdMs: 1_700_000_000_000, modifiedMs: 1_700_000_000_000 }
    },
    json(path: string, data: unknown) {
      const text = JSON.stringify(data)
      ensureDir(dirname(path))
      items[normalize(path)] = { type: 'file', size: text.length, text, createdMs: 1_700_000_000_000, modifiedMs: 1_700_000_000_000 }
    },
    dirWithoutProject(path: string) {
      ensureDir(path)
    },
    throwOnRead(path: string) {
      unreadable.add(normalize(path))
    },
    async pathInfo(path): Promise<EngineVPathInfo> {
      const item = items[normalize(path)]
      return {
        path: normalize(path),
        exists: Boolean(item),
        isFile: item?.type === 'file',
        isDirectory: item?.type === 'dir',
        size: item?.size ?? 0,
        createdMs: item?.createdMs ?? 0,
        modifiedMs: item?.modifiedMs ?? 0,
      }
    },
    async listDir(path): Promise<EngineVDirEntry[]> {
      const root = normalize(path)
      return Object.entries(items)
        .filter(([itemPath]) => itemPath !== root && dirname(itemPath) === root)
        .map(([itemPath, item]) => ({ name: basename(itemPath), path: itemPath, isFile: item.type === 'file', isDirectory: item.type === 'dir', size: item.size }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async readJson(path) {
      if (unreadable.has(normalize(path))) throw new Error(`unreadable json: ${path}`)
      const item = items[normalize(path)]
      if (!item?.text) throw new Error(`missing json: ${path}`)
      return JSON.parse(item.text) as unknown
    },
    async writeText(path, content) {
      runtime.writes[normalize(path)] = content
      runtime.file(path, content.length)
    },
    async ensureDir(path) {
      ensureDir(path)
    },
    async movePath(source, target) {
      runtime.moves.push([normalize(source), normalize(target)])
      moveTree(source, target)
    },
    async copyDir(source, target) {
      runtime.copies.push([normalize(source), normalize(target)])
      for (const [path, item] of Object.entries(items)) {
        if (path === normalize(source) || path.startsWith(`${normalize(source)}/`)) {
          const next = normalize(target) + path.slice(normalize(source).length)
          items[next] = { ...item }
        }
      }
    },
    async removePath(path, options) {
      runtime.removes.push([normalize(path), options?.trash ? 'trash' : 'delete'])
      for (const key of Object.keys(items)) if (key === normalize(path) || key.startsWith(`${normalize(path)}/`)) delete items[key]
    },
    join: (...parts) => normalize(parts.filter(Boolean).join('/')),
    dirname,
    basename,
    resolve: normalize,
  }

  function ensureDir(path: string) {
    const normalized = normalize(path)
    if (items[normalized]) return
    ensureDir(dirname(normalized))
    items[normalized] = dirItem()
  }

  function moveTree(source: string, target: string) {
    const from = normalize(source)
    const to = normalize(target)
    const copies: Array<[string, MemoryItem]> = []
    for (const [path, item] of Object.entries(items)) {
      if (path === from || path.startsWith(`${from}/`)) copies.push([to + path.slice(from.length), { ...item }])
    }
    for (const key of Object.keys(items)) if (key === from || key.startsWith(`${from}/`)) delete items[key]
    for (const [path, item] of copies) items[path] = item
  }

  return runtime
}

function project(title: string, type: string, contentrating: string) {
  return { title, type, contentrating, description: 'demo', tags: ['Demo'], file: 'scene.mp4', preview: 'preview.jpg' }
}

function dirItem(): MemoryItem {
  return { type: 'dir', size: 0, createdMs: 1_700_000_000_000, modifiedMs: 1_700_000_000_000 }
}

function normalize(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized || '/'
}

function dirname(path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

function basename(path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return ''
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
