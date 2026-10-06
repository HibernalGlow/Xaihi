/**
 * linku 内核与落地缝的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组七条**逐条抄自上游** `packages/nodes/linku/src/core.test.ts`（tag `noxide`，
 *   125 行）的同名用例，连每个动作自己那份内联 `LinkuRuntime` 字面量一起搬
 *   （`C:/link` / `D:/target` / `legacy.toml` / `c:/LINK` 这些常量都是上游手写的）。
 * - 第 2 组钉**上游没有用例覆盖**的行为，出处逐条点名：
 *   `info` 缺路径那句（`core.ts:146`）、`create` 的两条拒绝（`core.ts:169`、`:171`）与放行后的
 *   调用次序（`core.ts:172-173`）、`move_link` 的进度两次与次序（`core.ts:183-187`）、
 *   同路径判据只管目录（`core.ts:72-74`）、`recordLink` 把 `dir` 翻成 `directory`
 *   （`core.ts:351`）、`recover` 里"已经是那条软链 ⇒ 静默跳过且不计数"（`core.ts:201`）与
 *   "建链抛错不中断整轮"（`core.ts:205-207`）、`restore` 的两层回滚与三句回滚文案
 *   （`core.ts:222-237`、`:248-258`、`:260-275`）、`list` / `import` 的结论句
 *   （`core.ts:153`、`:284`、`:304-305`）、`parseLinkRecords` 的注释行 / 未知键 /
 *   缺 link 或 target 的记录被丢 / `created_at` 与 `createdAt` 两种键名 / 值里带 `=`
 *   （`core.ts:83-107`）、`dumpLinkRecords` 的头三行与转义（`core.ts:111-121`、`:373-381`）、
 *   `removeLinkRecord` 的大小写与斜杠归一（`core.ts:134-137` 配 `:338-344`）、
 *   `normalizeLinkuInput` 的剥引号与默认动作（`core.ts:55-67`）。
 * - 第 3 组钉 `platform.ts`：上游 `platform.test.ts:14-26` 那条"删目录软链不许删掉目标"
 *   逐字搬来（只把临时目录前缀从上游的 `xiranite-linku-` 换成 `xaihi-linku-`——ADR-0010
 *   不许新写的文件里留旧品牌的落盘名），再加记录文件那两条闸门
 *   （`RECORDS_PATH_GAP` / `CONFIG_SECTION_GAP`）与 `pathInfo` 的 `resolve()` +
 *   `directoryStats` 语义。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-linku/tests/core
 */

import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { LinkPathInfo, LinkRecord, LinkuRuntime } from '../src/core.ts'
import {
  dumpLinkRecords,
  normalizeLinkuInput,
  parseLinkRecords,
  removeLinkRecord,
  resolveMoveTarget,
  runLinku,
  upsertLinkRecord,
} from '../src/core.ts'
import { CONFIG_SECTION_GAP, RECORDS_PATH_GAP, createNodeLinkuRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('linku core（上游 core.test.ts 逐条搬来）', () => {
  it('记录能来回序列化', () => {
    const records = [{ link: 'C:/link', target: 'D:/target', type: 'directory', createdAt: 'now' }]
    expect(parseLinkRecords(dumpLinkRecords(records))).toEqual(records)
  })

  it('按 link 路径覆盖', () => {
    const records = upsertLinkRecord(
      [{ link: 'C:/link', target: 'old', type: 'file', createdAt: '1' }],
      { link: 'c:/LINK', target: 'new', type: 'file', createdAt: '2' },
    )
    expect(records).toHaveLength(1)
    expect(records[0]?.target).toBe('new')
  })

  it('创建链接并记下来', async () => {
    let config = ''
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => ({ path, exists: path === 'source', kind: path === 'source' ? 'dir' : 'missing', isSymlink: false }),
      removeSymlink: async () => {},
      createSymlink: async () => {},
      movePath: async () => {},
      readConfig: async () => config,
      writeConfig: async (content) => { config = content },
    }

    const result = await runLinku({ action: 'create', path: 'source', target: 'link' }, runtime)

    expect(result.success).toBe(true)
    expect(parseLinkRecords(config)[0]?.link).toBe('link')
  })

  it('默认只导入仍然活着的旧链接', async () => {
    const live = { link: 'C:/linked', target: 'D:/target', type: 'directory', createdAt: 'live' }
    const missing = { link: 'C:/missing', target: 'D:/missing', type: 'directory', createdAt: 'missing' }
    let currentConfig = ''
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => {
        if (path === live.link) {
          return { path, exists: true, kind: 'other', isSymlink: true, linkTarget: 'd:/TARGET', targetExists: true }
        }
        if (path === live.target) return { path, exists: true, kind: 'dir', isSymlink: false }
        return { path, exists: false, kind: 'missing', isSymlink: false }
      },
      removeSymlink: async () => {},
      createSymlink: async () => {},
      movePath: async () => {},
      readConfig: async (path) => path === 'legacy.toml' ? dumpLinkRecords([live, missing]) : currentConfig,
      writeConfig: async (content) => { currentConfig = content },
    }

    const result = await runLinku({ action: 'import', path: 'legacy.toml' }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.importedCount).toBe(1)
    expect(result.data?.skippedCount).toBe(1)
    expect(parseLinkRecords(currentConfig)).toEqual([live])
  })

  it('显式要求时可以保留失效记录', async () => {
    const missing = { link: 'C:/missing', target: 'D:/missing', type: 'directory', createdAt: 'missing' }
    let currentConfig = ''
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => ({ path, exists: false, kind: 'missing', isSymlink: false }),
      removeSymlink: async () => {},
      createSymlink: async () => {},
      movePath: async () => {},
      readConfig: async (path) => path === 'legacy.toml' ? dumpLinkRecords([missing]) : currentConfig,
      writeConfig: async (content) => { currentConfig = content },
    }

    const result = await runLinku({ action: 'import', path: 'legacy.toml', includeInvalid: true }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.importedCount).toBe(1)
    expect(result.data?.skippedCount).toBe(0)
    expect(parseLinkRecords(currentConfig)).toEqual([missing])
  })

  it('还原一条活记录并把它从配置里删掉', async () => {
    const record = { link: 'C:/original', target: 'D:/relocated', type: 'directory', createdAt: 'now' }
    let config = dumpLinkRecords([record])
    const calls: string[] = []
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => ({ path, exists: true, kind: 'dir', isSymlink: path === record.link }),
      isLiveLinkRecord: async () => true,
      removeSymlink: async (path) => { calls.push(`remove:${path}`) },
      createSymlink: async () => {},
      movePath: async (source, target) => { calls.push(`move:${source}:${target}`) },
      readConfig: async () => config,
      writeConfig: async (content) => { config = content },
    }

    const result = await runLinku({ action: 'restore', path: record.link }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.restoredCount).toBe(1)
    expect(result.data?.links).toEqual([])
    expect(calls).toEqual([`remove:${record.link}`, `move:${record.target}:${record.link}`])
    expect(parseLinkRecords(config)).toEqual([])
  })

  it('记录里的链接已失效时，restore 不动文件系统', async () => {
    const record = { link: 'C:/original', target: 'D:/relocated', type: 'directory', createdAt: 'now' }
    const config = dumpLinkRecords([record])
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => ({ path, exists: false, kind: 'missing', isSymlink: false }),
      isLiveLinkRecord: async () => false,
      removeSymlink: async () => { throw new Error('must not remove') },
      createSymlink: async () => {},
      movePath: async () => {},
      readConfig: async () => config,
      writeConfig: async () => { throw new Error('must not write') },
    }

    const result = await runLinku({ action: 'restore', path: record.link }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toContain('not valid')
  })
})

describe('linku core（上游没写用例的行为，出处逐条点名）', () => {
  it('info 缺路径时报的是内核那句话（core.ts:146），一次缝调用都不发', async () => {
    const runtime = recordingRuntime()
    const result = await runLinku({ action: 'info' }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Path is required.')
    expect(runtime.calls).toEqual([])

    // 阳性对照：给了路径就走 pathInfo，一次。
    const withPath = recordingRuntime()
    const loaded = await runLinku({ action: 'info', path: '/tmp/x' }, withPath)
    expect(loaded.message).toBe('Path info loaded.')
    expect(withPath.calls).toEqual(['pathInfo:/tmp/x'])
  })

  it('create 的两条拒绝与放行后的次序（core.ts:169、:171、:172-173）', async () => {
    const noSource = recordingRuntime({ info: (path) => kind(path, 'missing') })
    const missing = await runLinku({ action: 'create', path: '/src', target: '/link' }, noSource)
    expect(missing.message).toBe('Source path does not exist: /src')
    expect(noSource.calls).toEqual(['pathInfo:/src'])

    const taken = recordingRuntime({ info: (path) => path === '/src' ? kind(path, 'dir') : kind(path, 'other', { isSymlink: true }) })
    const exists = await runLinku({ action: 'create', path: '/src', target: '/link' }, taken)
    expect(exists.message).toBe('Link path already exists: /link')
    expect(taken.calls).toEqual(['pathInfo:/src', 'pathInfo:/link'])

    // 阳性对照：两条都放行时才会建链 + 记账（`readConfig:` 那条空参是内核递的 configPath 默认空串）。
    const open = recordingRuntime({ info: (path) => path === '/src' ? kind(path, 'file') : kind(path, 'missing') })
    const created = await runLinku({ action: 'create', path: '/src', target: '/link' }, open)
    expect(created.message).toBe('Symlink created: /link -> /src')
    expect(created.data?.created).toBe(true)
    expect(open.calls).toEqual(['pathInfo:/src', 'pathInfo:/link', 'createSymlink:/src:/link', 'readConfig:', 'writeConfig:'])
    const written = parseLinkRecords(open.written)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ link: '/link', target: '/src', type: 'file' })
    // `createdAt` 是内核自己 `new Date().toISOString()` 给的（core.ts:352），只钉形状不钉值。
    expect(written[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('move_link 的次序与两次进度：先移动、再回链、最后记账（core.ts:183-187、:351）', async () => {
    const runtime = recordingRuntime({ info: (path) => path === '/src' ? kind(path, 'dir') : kind(path, 'missing') })
    const events: Array<{ type: string; progress?: number; message: string }> = []

    const result = await runLinku({ action: 'move_link', path: '/src', target: '/moved' }, runtime, (event) => { events.push(event) })

    expect(result.message).toBe('Moved and linked: /src -> /moved')
    expect(runtime.calls).toEqual(['pathInfo:/src', 'movePath:/src:/moved', 'createSymlink:/moved:/src', 'readConfig:', 'writeConfig:'])
    // 期望值是 `core.ts:183` / `:185` 那两条原话与那两个数（百分数，不是 0..1）。
    expect(events).toEqual([
      { type: 'progress', progress: 40, message: 'Moving /src' },
      { type: 'progress', progress: 75, message: 'Creating symlink' },
    ])
    // `recordLink` 把内核的 dir 翻成落盘用的 directory（core.ts:351）。
    const written = parseLinkRecords(runtime.written)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ link: '/src', target: '/moved', type: 'directory' })

    // 阳性对照：目标是空串时被**动作级**那道校验先挡住（core.ts:178），
    // 一次 movePath 都不发；`resolveMoveTarget` 那句"Target path is required."只有直接调用才可达。
    const refused = recordingRuntime({ info: (path) => kind(path, 'dir') })
    const empty = await runLinku({ action: 'move_link', path: '/src', target: '' }, refused)
    expect(empty.message).toBe('Source and target paths are required.')
    expect(refused.calls).toEqual([])
  })

  it('resolveMoveTarget：只有"源是已存在的目录且与目标同路径"才拒（core.ts:72-74）', () => {
    expect(resolveMoveTarget(kind('/a', 'dir'), '/b')).toEqual({ target: '/b' })
    expect(resolveMoveTarget(kind('/a', 'dir'), '/a').error).toBe('Target must be different from source.')
    // 阳性对照：文件源同路径不拒（上游的判据只看目录，别"顺手改成所有 kind"）。
    expect(resolveMoveTarget(kind('/a', 'file'), '/a').error).toBeUndefined()
    // 阳性对照：目标先归一（剥首尾引号 + trim）再比（core.ts:69-70）。
    expect(resolveMoveTarget(kind('/a', 'dir'), ' "/a" ').error).toBe('Target must be different from source.')
  })

  it('recover：活着的软链静默跳过不计数，目标缺失记 failed，建链抛错也不中断整轮（core.ts:194-209）', async () => {
    const live: LinkRecord = { link: '/live', target: '/live-target', type: 'directory', createdAt: '1' }
    const broken: LinkRecord = { link: '/broken', target: '/gone', type: 'file', createdAt: '2' }
    const thrower: LinkRecord = { link: '/throw', target: '/there', type: 'file', createdAt: '3' }
    let attempts = 0
    const info = (path: string): LinkPathInfo => {
      if (path === live.link) return { path, exists: true, kind: 'other', isSymlink: true, linkTarget: live.target, targetExists: true }
      if (path === live.target || path === thrower.target) return { path, exists: true, kind: 'file', isSymlink: false }
      return { path, exists: false, kind: 'missing', isSymlink: false }
    }
    const runtime: LinkuRuntime = {
      pathInfo: async (path) => info(path),
      removeSymlink: async () => {},
      createSymlink: async () => { attempts += 1; throw new Error('EPERM') },
      movePath: async () => {},
      readConfig: async () => dumpLinkRecords([broken, thrower]),
      writeConfig: async () => {},
    }

    const result = await runLinku({ action: 'recover' }, runtime)
    expect(result.success).toBe(true)
    // 两条记录：`broken` 目标不存在 ⇒ failed 且不发建链；`thrower` 建链抛错 ⇒ 也 failed，
    // 但整轮没中断（attempts 只在 thrower 上 +1）。
    expect(result.message).toBe('Recovery completed: 0 recovered, 2 failed.')
    expect(result.data?.links).toHaveLength(2)
    expect(attempts).toBe(1)

    // 阳性对照：已经是那条软链的记录走 `continue`（core.ts:201），既不建链也不计数。
    const skipRuntime: LinkuRuntime = { ...runtime, readConfig: async () => dumpLinkRecords([live]) }
    expect((await runLinku({ action: 'recover' }, skipRuntime)).message).toBe('Recovery completed: 0 recovered, 0 failed.')

    // 另一侧对照：目标在、建链成功 ⇒ recovered 计数。
    const okRuntime: LinkuRuntime = {
      ...skipRuntime,
      createSymlink: async () => {},
      readConfig: async () => dumpLinkRecords([thrower]),
    }
    expect((await runLinku({ action: 'recover' }, okRuntime)).message).toBe('Recovery completed: 1 recovered, 0 failed.')
  })

  it('restore 写记录失败时的两句回滚文案与回滚动作（core.ts:232-237、:260-275）', async () => {
    const record: LinkRecord = { link: '/orig', target: '/moved', type: 'directory', createdAt: '1' }

    // link 位置上已是"移回来的目录本体"、target 空着 ⇒ 回滚条件成立（core.ts:266）。
    const rolledBack = recordingRuntime({
      read: dumpLinkRecords([record]),
      live: true,
      writeError: 'EROFS',
      info: (path) => path === record.link ? kind(path, 'dir') : kind(path, 'missing'),
    })
    const movedBack = await runLinku({ action: 'restore', path: record.link }, rolledBack)
    expect(movedBack.message).toBe('Restored /orig, but could not remove its record: EROFS The filesystem restore was rolled back.')
    expect(rolledBack.calls).toEqual([
      'readConfig:',
      'removeSymlink:/orig',
      'movePath:/moved:/orig',
      'writeConfig:',
      'pathInfo:/orig',
      'pathInfo:/moved',
      'movePath:/orig:/moved',
      'createSymlink:/moved:/orig',
    ])

    // 阳性对照：link 位置什么都不在 ⇒ 回滚做不了事，句子换成"记录仍是旧的"（core.ts:274），
    // 而且不许偷偷再发一次 move/create。
    const stale = recordingRuntime({
      read: dumpLinkRecords([record]),
      live: true,
      writeError: 'EROFS',
      info: (path) => kind(path, 'missing'),
    })
    const staleResult = await runLinku({ action: 'restore', path: record.link }, stale)
    expect(staleResult.message).toBe('Restored /orig, but could not remove its record: EROFS The filesystem was restored, but the link record remains stale.')
    expect(stale.calls).toEqual(['readConfig:', 'removeSymlink:/orig', 'movePath:/moved:/orig', 'writeConfig:', 'pathInfo:/orig', 'pathInfo:/moved'])
  })

  it('restore 找不到记录 / 中途移动失败时先把链放回去（core.ts:215、:222-227、:248-258）', async () => {
    const noneRuntime = recordingRuntime({ read: 'not-a-record' })
    const none = await runLinku({ action: 'restore', path: '/never' }, noneRuntime)
    expect(none.message).toBe('No recorded link found for: /never')

    const record: LinkRecord = { link: '/orig', target: '/moved', type: 'directory', createdAt: '1' }
    // 移回失败这一刻：link 位置空着、target 还在 ⇒ restoreSymlinkIfPossible 重建链（core.ts:254）。
    const runtime = recordingRuntime({
      read: dumpLinkRecords([record]),
      live: true,
      moveError: 'EXDEV',
      info: (path) => path === record.target ? kind(path, 'dir', { exists: true }) : kind(path, 'missing'),
    })

    const result = await runLinku({ action: 'restore', path: record.link }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Restore failed while moving /moved back to /orig: EXDEV')
    expect(runtime.calls).toEqual([
      'readConfig:',
      'removeSymlink:/orig',
      'movePath:/moved:/orig',
      'pathInfo:/orig',
      'pathInfo:/moved',
      'createSymlink:/moved:/orig',
    ])
    // 阳性对照：没还原成功就不许再写记录（那会把失败写成"已删记录"）。
    expect(runtime.calls).not.toContain('writeConfig:')
  })

  it('list 与 import 的结论句由内核给（core.ts:153、:284、:304-305）', async () => {
    expect((await runLinku({ action: 'list' }, recordingRuntime({ read: '' }))).message).toBe('Found 0 link record(s).')

    const missing = await runLinku({ action: 'import', path: '/gone.toml' }, recordingRuntime({ read: null }))
    expect(missing.success).toBe(false)
    expect(missing.message).toBe('Legacy Linku TOML was not found: /gone.toml')

    // 阳性对照：全活的旧文件一条不漏，且没有"跳过"尾巴（core.ts:304 那个三元）。
    const record: LinkRecord = { link: '/a', target: '/b', type: 'file', createdAt: '1' }
    const allLive: LinkuRuntime = {
      pathInfo: async (path) => (path === record.link
        ? { path, exists: true, kind: 'other', isSymlink: true, targetExists: true, linkTarget: record.target }
        : kind(path, 'dir', { exists: true })),
      removeSymlink: async () => {},
      createSymlink: async () => {},
      movePath: async () => {},
      readConfig: async (path) => path === '/old.toml' ? dumpLinkRecords([record]) : '',
      writeConfig: async () => {},
    }
    expect((await runLinku({ action: 'import', path: '/old.toml' }, allLive)).message)
      .toBe('Imported 1 link record(s) from /old.toml.')
  })

  it('parseLinkRecords 的容错口径：注释、未知键、缺 link/target、两种时间键名、值里带 =（core.ts:83-107）', () => {
    const content = [
      '# linku config generated by xiranite',
      'config_version = 1',
      '',
      '[[links]]',
      'link = "/a=b"',
      'target = "/b"',
      'note = "ignored"',
      'createdAt = "2026-01-01T00:00:00.000Z"',
      '',
      '[[links]]',
      'link = "/only-link"',
      '',
      '[[links]]',
      'target = "/only-target"',
      '',
      '[[links]]',
      'link = "/c"',
      'target = "/d"',
      'type = "directory"',
      'created_at = "2026-01-02T00:00:00.000Z"',
      '',
    ].join('\n')

    expect(parseLinkRecords(content)).toEqual([
      { link: '/a=b', target: '/b', type: '', createdAt: '2026-01-01T00:00:00.000Z' },
      { link: '/c', target: '/d', type: 'directory', createdAt: '2026-01-02T00:00:00.000Z' },
    ])
    // 阳性对照：null / 空串都是"没有记录"，不是抛。
    expect(parseLinkRecords(null)).toEqual([])
    expect(parseLinkRecords('')).toEqual([])
  })

  it('dumpLinkRecords 的头三行、空表与转义（core.ts:111-121、:373-381）', () => {
    expect(dumpLinkRecords([])).toBe('# linku config generated by xiranite\nconfig_version = 1\n')
    const escaped = dumpLinkRecords([{ link: 'C:\\a"b', target: 'D:/t', type: 'file', createdAt: '' }])
    expect(escaped).toBe('# linku config generated by xiranite\nconfig_version = 1\n\n[[links]]\nlink = "C:\\\\a\\"b"\ntarget = "D:/t"\ntype = "file"\ncreated_at = ""\n')
    // 阳性对照：写出去的那份必须原样读回来（round-trip 是上游第一条用例钉的事）。
    expect(parseLinkRecords(escaped)).toEqual([{ link: 'C:\\a"b', target: 'D:/t', type: 'file', createdAt: '' }])
  })

  it('removeLinkRecord 按归一后的形状删（大小写、斜杠方向、尾斜杠、\\\\?\\ 前缀）（core.ts:134-137 配 :338-344）', () => {
    const records: LinkRecord[] = [
      { link: 'C:\\Link', target: 'D:/one', type: 'file', createdAt: '1' },
      { link: 'E:/Other', target: 'D:/two', type: 'file', createdAt: '2' },
      { link: '\\\\?\\C:\\prefix', target: 'D:/three', type: 'file', createdAt: '3' },
    ]
    expect(removeLinkRecord(records, 'c:/link')).toEqual([records[1], records[2]])
    expect(removeLinkRecord(records, 'C:/Link/')).toEqual([records[1], records[2]])
    expect(removeLinkRecord(records, '\\\\?\\c:\\prefix\\')).toEqual([records[0], records[1]])
    // 阳性对照：一条都不沾边时原样返回（不许误删）。
    expect(removeLinkRecord(records, 'Z:/nope')).toHaveLength(3)
  })

  it('resolveMoveTarget 自己那句"目标必填"只在直接调用时可达（core.ts:70）', () => {
    // 内核的 `move_link` 分支先把空目标挡在前面（`core.ts:178`），
    // 所以这条只有直接调这个导出函数才走得到——钉住"两句话各归各处"这件事。
    expect(resolveMoveTarget(kind('/a', 'dir'), '')).toEqual({ target: '', error: 'Target path is required.' })
    // 阳性对照：只有空白的目标也触发（normalizePath 会把空格吃掉）。
    expect(resolveMoveTarget(kind('/a', 'dir'), '   ').error).toBe('Target path is required.')
    // 另一侧对照：真给了路径就没有 error。
    expect(resolveMoveTarget(kind('/a', 'dir'), '/b').error).toBeUndefined()
  })

  it('normalizeLinkuInput：动作默认 info，路径剥首尾引号，includeInvalid 默认 false（core.ts:55-67）', () => {
    expect(normalizeLinkuInput({})).toEqual({ action: 'info', path: '', target: '', configPath: '', includeInvalid: false })
    expect(normalizeLinkuInput({ path: ' "/a/b" ', target: "'/c'", configPath: ' /d ', includeInvalid: true }))
      .toEqual({ action: 'info', path: '/a/b', target: '/c', configPath: '/d', includeInvalid: true })
    // 阳性对照：只剥**首尾**引号，中间的引号是路径的一部分。
    expect(normalizeLinkuInput({ path: '"/a"b"' }).path).toBe('/a"b')
  })
})

describe('linku platform（真文件系统上的链接与记录闸门）', () => {
  it('删目录软链不许删掉目标（上游 platform.test.ts:14-26 逐字搬来）', async () => {
    const root = await tempRoot('remove-symlink')
    const target = join(root, 'target')
    const link = join(root, 'link')
    await mkdir(target)
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')

    await createNodeLinkuRuntime().removeSymlink(link)

    await expect(lstat(link)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(target)).resolves.toBeDefined()

    // 阳性对照：普通目录不是软链 ⇒ removeSymlink 抛，而不是 rm 掉整棵树。
    await expect(createNodeLinkuRuntime().removeSymlink(target)).rejects.toThrow('Link path is not a symbolic link')
    expect(existsSync(target)).toBe(true)
  })

  it('记录文件两处都没给 ⇒ 碰任何文件之前就拒（RECORDS_PATH_GAP）', async () => {
    const runtime = createNodeLinkuRuntime()
    await expect(runtime.readConfig()).rejects.toThrow(RECORDS_PATH_GAP)
    await expect(runtime.writeConfig('x')).rejects.toThrow(RECORDS_PATH_GAP)
    // 内核自己不吞异常（`runLinku` 里没有 try/catch），所以这条拒绝原样冒到调用方。
    await expect(runLinku({ action: 'list' }, runtime)).rejects.toThrow('Config.recordsPath')

    // 阳性对照：给了路径就不该拒（文件不存在时读回 null = 还没有记录）。
    const root = await tempRoot('records-given')
    const records = join(root, 'nested', 'linku.toml')
    expect(await createNodeLinkuRuntime(records).readConfig()).toBeNull()
    // 单条调用的 configPath 优先（上游 `path || resolvedConfigPath` 那条次序）。
    expect(await createNodeLinkuRuntime(records).readConfig(join(root, 'override.toml'))).toBeNull()
    // 而写的时候父目录是被建出来的，不是要求人手摆好。
    await createNodeLinkuRuntime(records).writeConfig(dumpLinkRecords([]))
    expect(existsSync(records)).toBe(true)
  })

  it('记录文件判据：[nodes.*] 那份只读不写也不盖，内核自己的空表读得回来（CONFIG_SECTION_GAP）', async () => {
    const root = await tempRoot('config-section')
    const configDoc = join(root, 'app.toml')
    const body = '[nodes.linku]\nlinks = []\n'
    await writeFile(configDoc, body, 'utf8')

    await expect(createNodeLinkuRuntime(configDoc).readConfig()).rejects.toThrow(CONFIG_SECTION_GAP)
    await expect(createNodeLinkuRuntime(configDoc).writeConfig(dumpLinkRecords([]))).rejects.toThrow(CONFIG_SECTION_GAP)
    // 阳性对照（关键的那半边）：那份文档的内容一个字节都没被改。
    expect(await readFile(configDoc, 'utf8')).toBe(body)

    // 另一侧对照：独立记录格式原样读；空文件按"还没有记录"处理。
    const standalone = join(root, 'linku.toml')
    const record: LinkRecord = { link: '/a', target: '/b', type: 'file', createdAt: '1' }
    await writeFile(standalone, dumpLinkRecords([record]), 'utf8')
    expect(parseLinkRecords(await createNodeLinkuRuntime(standalone).readConfig())).toEqual([record])
    const blank = join(root, 'blank.toml')
    await writeFile(blank, '   \n', 'utf8')
    expect(await createNodeLinkuRuntime(blank).readConfig()).toBe('   \n')

    // 与"不存在"区分开：文件在但带 [nodes.*] ⇒ 读也拒；文件不在 ⇒ null。
    expect(await createNodeLinkuRuntime(join(root, 'missing.toml')).readConfig()).toBeNull()

    // 另一颗对照：内容既不是 [nodes.*] 也不是内核写手的产物（这里是一份无关的 TOML）时
    // **读**交回原文（内核的 parseLinkRecords 会把它读成零条），**写**仍然拒——
    // 只有"别拿独立格式的文档盖掉别人的东西"这一半才是写侧的职责。
    const unrelated = join(root, 'unrelated.toml')
    const unrelatedBody = '[package]\nname = "someone-else"\n'
    await writeFile(unrelated, unrelatedBody, 'utf8')
    expect(parseLinkRecords(await createNodeLinkuRuntime(unrelated).readConfig())).toEqual([])
    await expect(createNodeLinkuRuntime(unrelated).writeConfig(dumpLinkRecords([]))).rejects.toThrow(CONFIG_SECTION_GAP)
    expect(await readFile(unrelated, 'utf8')).toBe(unrelatedBody)

    // 阳性对照（形状尺）：内核写手产出的**空记录文件**（只有两行头、没有 [[links]]）
    // 必须读得回来、也允许被再次写——`restore` 掉最后一条记录之后就是这份形状。
    const emptied = join(root, 'emptied.toml')
    await writeFile(emptied, dumpLinkRecords([]), 'utf8')
    expect(await createNodeLinkuRuntime(emptied).readConfig()).toBe(dumpLinkRecords([]))
    await createNodeLinkuRuntime(emptied).writeConfig(dumpLinkRecords([{ link: '/x', target: '/y', type: 'file', createdAt: '1' }]))
    expect(parseLinkRecords(await readFile(emptied, 'utf8'))).toEqual([{ link: '/x', target: '/y', type: 'file', createdAt: '1' }])
  })

  it('create → list → restore 全链：软链真的建出来，记录真的落在文件里', async () => {
    const root = await tempRoot('full-cycle')
    const source = join(root, 'source')
    const link = join(root, 'link')
    const records = join(root, 'linku.toml')
    await mkdir(source)
    await writeFile(join(source, 'a.txt'), 'ab', 'utf8')
    const runtime = createNodeLinkuRuntime(records)

    const created = await runLinku({ action: 'create', path: source, target: link }, runtime)
    expect(created.message).toBe(`Symlink created: ${link} -> ${source}`)
    expect(await readFile(records, 'utf8')).toContain(`link = "${link}"`)

    const listed = await runLinku({ action: 'list' }, runtime)
    expect(listed.message).toBe('Found 1 link record(s).')
    expect(listed.data?.links).toHaveLength(1)
    expect(listed.data?.links[0]).toMatchObject({ link, target: source, type: 'directory' })

    // 记录是活的 ⇒ 第二次 create 撞上游那句拒绝。
    const again = await runLinku({ action: 'create', path: source, target: link }, runtime)
    expect(again.message).toBe(`Link path already exists: ${link}`)

    const restored = await runLinku({ action: 'restore', path: link }, runtime)
    expect(restored.message).toBe(`Restored ${source} to ${link} and removed its link record.`)
    // 阳性对照：还原后 link 位置上真的是**目录本体**而不是软链，源路径已空。
    const info = await runtime.pathInfo(link)
    expect(info.kind).toBe('dir')
    expect(info.isSymlink).toBe(false)
    expect(existsSync(join(source, 'a.txt'))).toBe(false)
    expect((await readdir(link)).sort()).toEqual(['a.txt'])
    expect((await runLinku({ action: 'list' }, runtime)).message).toBe('Found 0 link record(s).')
  })

  it('pathInfo 会 resolve()、目录算 fileCount、软链给 linkTarget 与 targetExists', async () => {
    const root = await tempRoot('path-info')
    const dir = join(root, 'dir')
    await mkdir(dir)
    await writeFile(join(dir, 'a.txt'), 'ab', 'utf8')
    await writeFile(join(dir, 'b.txt'), 'c', 'utf8')

    const info = await createNodeLinkuRuntime().pathInfo(`${dir}/`)
    expect(info.path).toBe(dir)
    expect(info.kind).toBe('dir')
    expect(info.fileCount).toBe(2)
    expect(info.sizeMb).toBe(3 / 1024 / 1024)

    const link = join(root, 'link')
    await symlink('dir', link, 'dir')
    const linked = await createNodeLinkuRuntime().pathInfo(link)
    // 阳性对照：lstat 语义 ⇒ 软链本身是 other，不是 dir；相对目标按 dirname 解。
    expect(linked.kind).toBe('other')
    expect(linked.isSymlink).toBe(true)
    expect(linked.linkTarget).toBe('dir')
    expect(linked.targetExists).toBe(true)

    const dangling = join(root, 'dangling')
    await symlink('nowhere', dangling, 'file')
    expect((await createNodeLinkuRuntime().pathInfo(dangling)).targetExists).toBe(false)
    expect((await createNodeLinkuRuntime().pathInfo(join(root, 'gone'))).kind).toBe('missing')
  })

  it('movePath 先 rename，失败时退到 cp + rm；cp 撞已存在目标时不许覆盖也不许删源', async () => {
    const root = await tempRoot('move-path')
    const source = join(root, 'source')
    const moved = join(root, 'nested', 'moved')
    await mkdir(source)
    await writeFile(join(source, 'a.txt'), 'ab', 'utf8')

    await createNodeLinkuRuntime().movePath(source, moved)
    expect(existsSync(source)).toBe(false)
    expect(await readFile(join(moved, 'a.txt'), 'utf8')).toBe('ab')

    // 阳性对照：目标是**已存在的普通文件** ⇒ rename 抛，cp(force:false, errorOnExist:true) 也抛；
    // 目标内容与源都不许被动过。
    const occupied = join(root, 'occupied.txt')
    await writeFile(occupied, 'kept', 'utf8')
    const second = join(root, 'second')
    await mkdir(second)
    await writeFile(join(second, 'x.txt'), 'x', 'utf8')
    await expect(createNodeLinkuRuntime().movePath(second, occupied)).rejects.toBeDefined()
    expect(await readFile(occupied, 'utf8')).toBe('kept')
    expect(await readFile(join(second, 'x.txt'), 'utf8')).toBe('x')
  })
})

function kind (path: string, value: LinkPathInfo['kind'], extra: Partial<LinkPathInfo> = {}): LinkPathInfo {
  return { path, exists: value !== 'missing', kind: value, isSymlink: false, ...extra }
}

/**
 * 记调用顺序的假缝：`calls` 里是 `方法:参数` 序列，期望值全部手写。
 * `moveError` / `writeError` 让那两条腿抛（钉 `restore` 的回滚用），
 * `live` 决定注入不注入 `isLiveLinkRecord`（内核两条判据路都要覆盖）。
 */
function recordingRuntime (options: {
  info?: (path: string) => LinkPathInfo
  read?: string | null
  moveError?: string
  writeError?: string
  live?: boolean
} = {}): LinkuRuntime & { calls: string[]; written: string } {
  const runtime: LinkuRuntime & { calls: string[]; written: string } = {
    calls: [] as string[],
    written: '',
    pathInfo: async (path: string) => {
      runtime.calls.push(`pathInfo:${path}`)
      return options.info === undefined ? kind(path, 'missing') : options.info(path)
    },
    removeSymlink: async (path: string) => { runtime.calls.push(`removeSymlink:${path}`) },
    createSymlink: async (source: string, link: string) => { runtime.calls.push(`createSymlink:${source}:${link}`) },
    movePath: async (source: string, target: string) => {
      runtime.calls.push(`movePath:${source}:${target}`)
      if (options.moveError !== undefined) throw new Error(options.moveError)
    },
    readConfig: async (path?: string) => {
      runtime.calls.push(`readConfig:${path ?? ''}`)
      return options.read ?? null
    },
    writeConfig: async (content: string) => {
      runtime.calls.push('writeConfig:')
      runtime.written = content
      if (options.writeError !== undefined) throw new Error(options.writeError)
    },
  }
  if (options.live === true) runtime.isLiveLinkRecord = async () => true
  return runtime
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-linku-${label}-`))
  tempRoots.push(root)
  return root
}
