/**
 * cleanf 内核与落地层的保真度用例：**期望值逐条手抄**自基线的两份测试——
 * `packages/nodes/cleanf/src/core.test.ts`（89 行、5 条用例，那份 `items` 夹具照抄）与
 * `packages/nodes/cleanf/src/platform.test.ts`（79 行、3 条用例，含"回收站恢复不可用就拒"那条）。
 * 改名只有一处：上游的 `test()` 换成 `it()`，与同批 `plugins/nameu/tests/core.spec.ts` 一致。
 *
 * 上游那 5 条 core 用例钉的（行号指上游那份 test 文件）：
 * - `:15` 排除关键词只认逗号，并逐条 trim；
 * - `:19` 模式命中与"嵌套空目录一起被收"（`root/nested/child` 先空、`root/nested` 因此也空）；
 * - `:29` 预演不动手，`previewFiles` 就是那一条路径；
 * - `:42` 真清理之后把 `undoAvailable / undoBatchCount / undoPersistent` 原样报出来；
 * - `:68` 撤销走 runtime 的 `undoLatest`。
 * 上游那 3 条 platform 用例钉的：深度倒序的批次形状（`:6-37`）、`undoLatest` 的委派（`:39-50`）、
 * **回收站恢复不可用时 `ENOTSUP` 且 `execute` 一次都不调**（`:52-63`）。
 *
 * 在这个基础上补的本仓判据：
 * 1. **`preview` 默认值分歧的"内核那一侧"**（清单那一侧钉在 `tests/definition.spec.ts`）：
 *    `core.ts:289` 是 `if (input.preview)` ⇒ **省略即执行**。上游那 5 条各给了显式的
 *    `preview: true` / `false`，没有一条钉住"省略"这一格，这里补。
 * 2. **默认预设就是 `enabled` 那五条**（`log_files` / `upscale` 默认关），名单不在别处抄第二份。
 * 3. **G10 的实际形状**：本仓的缺省 runtime 一不注 `fileOperations`，于是
 *    非预演的 `clean` 落进基线自己那一刀（`platform.ts:131-134` 的原话 + `ENOTSUP`），
 *    并且**夹具里的文件一条都没少**；`undo` 落进内核自己那句
 *    `Cleanf undo is unavailable in this runtime.`（`core.ts:322`）。
 * 4. **递归枚举的语义**用真机夹具钉（临时目录 + 真符号链接），不靠手写样例：
 *    深度从 1 起、根不进 items、软链既不是 file 也不是 directory 就被跳过、非目录路径抛
 *    `Path is not a directory: …`（基线 `platform.ts:90-94`）。
 *
 * @module xaihi-cleanf/tests/core
 */

import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CleanfItem, CleanfTarget } from '../src/core.ts'
import {
  CLEANING_PRESETS,
  getDefaultPresets,
  isExcluded,
  matchesPattern,
  parseCleanfPaths,
  parseExcludeKeywords,
  planCleanf,
  runCleanf,
  sortTargetsForRemoval,
} from '../src/core.ts'
import { createNodeCleanfRuntime, makeCleanfItem, refusingFileOperations } from '../src/platform.ts'
import type {
  CleanfFileOperationBatchResult,
  CleanfFileOperationRequest,
  CleanfFileOperations,
} from '../src/platform.ts'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
  process.exitCode = 0
})

/** 基线 `core.test.ts:5-12` 那份 items，逐字照抄（六条，depth 1/2 各一半）。 */
const items: CleanfItem[] = [
  { path: 'root/keep.txt', name: 'keep.txt', type: 'file', parentPath: 'root', depth: 1 },
  { path: 'root/a.bak', name: 'a.bak', type: 'file', parentPath: 'root', depth: 1 },
  { path: 'root/temp_cache', name: 'temp_cache', type: 'dir', parentPath: 'root', depth: 1 },
  { path: 'root/empty', name: 'empty', type: 'dir', parentPath: 'root', depth: 1 },
  { path: 'root/nested', name: 'nested', type: 'dir', parentPath: 'root', depth: 1 },
  { path: 'root/nested/child', name: 'child', type: 'dir', parentPath: 'root/nested', depth: 2 },
]

describe('cleanf core', () => {
  it('parses exclude keywords', () => {
    expect(parseExcludeKeywords('node_modules, .git,,temp')).toEqual(['node_modules', '.git', 'temp'])
  })

  it('plans pattern and empty-folder cleanup', () => {
    const plan = planCleanf(items, { presets: ['empty_folders', 'backup_files', 'temp_folders'] })

    expect(plan.targets.map((target) => target.path)).toContain('root/a.bak')
    expect(plan.targets.map((target) => target.path)).toContain('root/temp_cache')
    expect(plan.targets.map((target) => target.path)).toContain('root/empty')
    expect(plan.targets.map((target) => target.path)).toContain('root/nested/child')
    expect(plan.targets.map((target) => target.path)).toContain('root/nested')
  })

  it('runs preview without removing', async () => {
    const result = await runCleanf(
      { paths: ['root'], presets: ['backup_files'], preview: true },
      {
        scanPath: async () => items,
        removeTargets: async () => ({ removed: 0, skipped: 0 }),
      },
    )

    expect(result.success).toBe(true)
    expect(result.data?.previewFiles).toEqual(['root/a.bak'])
  })

  it('reports shared undo metadata after live cleanup', async () => {
    const result = await runCleanf(
      { paths: ['root'], presets: ['backup_files'], preview: false },
      {
        scanPath: async () => items,
        removeTargets: async () => ({
          removed: 1,
          skipped: 0,
          undoable: 1,
          undoBatchCount: 1,
          undoPersistent: true,
        }),
      },
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        totalRemoved: 1,
        undoAvailable: true,
        undoBatchCount: 1,
        undoPersistent: true,
      },
    })
  })

  it('undoes the latest Cleanf cleanup through the runtime', async () => {
    const result = await runCleanf(
      { action: 'undo' },
      {
        scanPath: async () => items,
        removeTargets: async () => ({ removed: 0, skipped: 0 }),
        undoLatest: async () => ({ succeeded: 2, failed: 0 }),
        undoState: () => ({ available: false, count: 0, persistent: true }),
      },
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        restored: 2,
        undoAvailable: false,
        undoBatchCount: 0,
        undoPersistent: true,
      },
    })
  })
})

describe('cleanf core 的缺省与枚举语义（本仓补的判据）', () => {
  it('省略 preview ⇒ 内核执行：removeTargets 真的被叫到（清单默认 true 钉在 definition.spec）', async () => {
    let called = 0
    const result = await runCleanf(
      { paths: ['root'], presets: ['backup_files'] },
      {
        scanPath: async () => items,
        removeTargets: async (targets) => {
          called += 1
          return { removed: targets.length, skipped: 0 }
        },
      },
    )

    expect(called).toBe(1)
    expect(result.message).toContain('moved 1 item(s) to the recycle bin')
  })

  it('阳性对照：同一份输入显式 preview: true 时一次都不叫 removeTargets', async () => {
    let called = 0
    await runCleanf(
      { paths: ['root'], presets: ['backup_files'], preview: true },
      {
        scanPath: async () => items,
        removeTargets: async () => {
          called += 1
          return { removed: 0, skipped: 0 }
        },
      },
    )
    expect(called).toBe(0)
  })

  it('路径一条都没有时是内核那句话（core.ts:272），不是接线层编的', async () => {
    const result = await runCleanf({ presets: ['backup_files'] }, {
      scanPath: async () => items,
      removeTargets: async () => ({ removed: 0, skipped: 0 }),
    })
    expect(result.success).toBe(false)
    expect(result.message).toBe('No valid paths provided.')
  })

  it('默认预设 = enabled 那五条，log_files 与 upscale 默认关（名单只有一份）', () => {
    expect(getDefaultPresets()).toEqual(['empty_folders', 'backup_files', 'temp_folders', 'trash_files', 'hb_txt_files'])
    expect(Object.keys(CLEANING_PRESETS)).toHaveLength(7)
    expect(CLEANING_PRESETS.log_files?.enabled).toBe(false)
    expect(CLEANING_PRESETS.upscale?.enabled).toBe(false)
    // 阳性对照：不传 presets 时计划里不会出现 .log。
    const withLog = planCleanf(
      [{ path: 'root/a.log', name: 'a.log', type: 'file', parentPath: 'root', depth: 1 }],
      { presets: [] },
    )
    expect(withLog.targets).toEqual([])
    const explicit = planCleanf(
      [{ path: 'root/a.log', name: 'a.log', type: 'file', parentPath: 'root', depth: 1 }],
      { presets: ['log_files'] },
    )
    expect(explicit.targets.map((target) => target.path)).toEqual(['root/a.log'])
  })

  it('trash_files 是 both：目录也算；预设名匹配带 i 标志', () => {
    const rule = CLEANING_PRESETS.trash_files?.patterns?.[0]
    if (rule === undefined) throw new Error('预设表漂了：trash_files 没有 pattern')
    expect(rule.type).toBe('both')
    expect(matchesPattern({ path: 'root/x.trash', name: 'x.trash', type: 'dir', parentPath: 'root', depth: 1 }, rule)).toBe(true)
    expect(matchesPattern({ path: 'root/X.TRASH', name: 'X.TRASH', type: 'file', parentPath: 'root', depth: 1 }, rule)).toBe(true)
    expect(matchesPattern({ path: 'root/other', name: 'other', type: 'dir', parentPath: 'root', depth: 1 }, rule)).toBe(false)
  })

  it('parseCleanfPaths 认换行与分号、只剥首尾引号；parseExcludeKeywords 只认逗号', () => {
    expect(parseCleanfPaths('a/one;b/two\nc/three')).toEqual(['a/one', 'b/two', 'c/three'])
    expect(parseCleanfPaths('"a/one";  "b/two"  ')).toEqual(['a/one', 'b/two'])
    // 逗号**不是**路径分隔符（排除关键词那格才是），别统一两套分隔符。
    expect(parseCleanfPaths('a/one,b/two')).toEqual(['a/one,b/two'])
    expect(parseExcludeKeywords('a,b')).toEqual(['a', 'b'])
  })

  it('isExcluded 是子串判据，不是路径段相等', () => {
    expect(isExcluded('root/.git/objects', ['.git'])).toBe(true)
    expect(isExcluded('root/git', ['.git'])).toBe(false)
  })

  it('sortTargetsForRemoval：深度倒序，同深度按路径长度倒序（先删里再删外）', () => {
    const ordered = sortTargetsForRemoval([
      target('root/nested/child', 2),
      target('root/a/b', 2),
      target('root/empty', 1),
    ])
    expect(ordered.map((item) => item.path)).toEqual(['root/nested/child', 'root/a/b', 'root/empty'])
  })

  it('undo 没有 undoLatest 时是内核那句拒绝（core.ts:322），本仓今天走的就是这条路', async () => {
    const result = await runCleanf({ action: 'undo' }, createNodeCleanfRuntime())
    expect(result.success).toBe(false)
    expect(result.message).toBe('Cleanf undo is unavailable in this runtime.')
  })
})

describe('cleanf platform（落地层：逐调用决定）', () => {
  it('基线 :52-63 那条：回收站恢复不可用 ⇒ ENOTSUP，且 execute 一次都不调', async () => {
    let executed = 0
    const runtime = createNodeCleanfRuntime({
      fileOperations: {
        execute: async () => {
          executed += 1
          return batch([])
        },
        undoState: () => ({ available: false, count: 0, persistent: true, trashRestore: false }),
      },
    })

    await expect(runtime.removeTargets([target('root/empty', 1)])).rejects.toMatchObject({ code: 'ENOTSUP' })
    expect(executed).toBe(0)
  })

  it('缺省 runtime（没有提供方）也是同一刀：这是 G10 今天的实际形状', async () => {
    const runtime = createNodeCleanfRuntime()
    await expect(runtime.removeTargets([target('root/empty', 1)])).rejects.toMatchObject({
      code: 'ENOTSUP',
      message: 'Recycle-bin restore is unavailable; Cleanf refused to run without undo support.',
    })
    expect(runtime.undoLatest).toBeUndefined()
    expect(refusingFileOperations().undoState?.().trashRestore).toBe(false)
  })

  it('基线 :6-37 那条：有提供方时按深度倒序成批交给 execute', async () => {
    const requests: CleanfFileOperationRequest[] = []
    const provider: CleanfFileOperations = {
      execute: async (request) => {
        requests.push(request)
        return batch(request.operations.map(() => 'succeeded'))
      },
      undoState: () => ({ available: true, count: 1, persistent: true, trashRestore: true }),
    }
    const runtime = createNodeCleanfRuntime({ fileOperations: provider })

    const result = await runtime.removeTargets([target('root/parent', 1), target('root/parent/child', 2)])

    expect(requests[0]).toEqual({
      operations: [
        { kind: 'trash', sourcePath: 'root/parent/child' },
        { kind: 'trash', sourcePath: 'root/parent' },
      ],
      concurrency: 1,
    })
    expect(result).toEqual({ removed: 2, skipped: 0, undoable: 2, undoBatchCount: 1, undoPersistent: true })
  })

  it('基线 :39-50 那条：undoLatest 委派给同一个提供方，形状折成 succeeded/failed', async () => {
    let called = 0
    const runtime = createNodeCleanfRuntime({
      fileOperations: {
        execute: async () => batch([]),
        undoLatest: async () => {
          called += 1
          return { succeeded: 3, failed: 0 }
        },
        undoState: () => ({ available: false, count: 0, persistent: true, trashRestore: true }),
      },
    })

    await expect(runtime.undoLatest?.()).resolves.toEqual({ succeeded: 3, failed: 0 })
    expect(called).toBe(1)
  })

  it('递归枚举用真机夹具：深度从 1 起、根不进 items、软链被跳过', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-cleanf-scan-'))
    tempDirs.push(root)
    await mkdir(join(root, 'nested'))
    await mkdir(join(root, 'temp_cache'))
    await writeFile(join(root, 'a.bak'), 'x', 'utf8')
    await writeFile(join(root, 'nested', 'b.log'), 'x', 'utf8')
    await symlink(join(root, 'a.bak'), join(root, 'link.bak'))

    const scanned = await createNodeCleanfRuntime().scanPath(root)
    const names = scanned.map((item) => item.name)

    expect(names).toContain('a.bak')
    expect(names).toContain('nested')
    expect(names).toContain('b.log')
    // Dirent 不跟随符号链接 ⇒ 既不是 file 也不是 directory ⇒ 上游那条 `continue`（platform.ts:111）跳过它。
    expect(names).not.toContain('link.bak')
    expect(scanned.every((item) => item.path !== root)).toBe(true)
    const nested = scanned.find((item) => item.name === 'nested')
    const child = scanned.find((item) => item.name === 'b.log')
    expect(nested?.depth).toBe(1)
    expect(child?.depth).toBe(2)
    expect(child?.parentPath).toBe(join(root, 'nested'))

    // 计划层接着这份真机枚举：.bak 与空目录 temp_cache 进 targets，keep 的东西不进。
    const plan = planCleanf(scanned, { presets: ['empty_folders', 'backup_files', 'temp_folders'] })
    const planned = plan.targets.map((target) => target.path)
    expect(planned).toContain(join(root, 'a.bak'))
    expect(planned).toContain(join(root, 'temp_cache'))
    expect(planned).not.toContain(join(root, 'nested'))

    // 阳性对照：这一刀之后**文件都还在**——本仓没有可恢复删除的缝，非预演必然落在 ENOTSUP 上。
    await expect(runCleanf({ paths: [root], presets: ['backup_files'] }, createNodeCleanfRuntime()))
      .rejects.toMatchObject({ code: 'ENOTSUP' })
    expect(existsSync(join(root, 'a.bak'))).toBe(true)
    expect(existsSync(join(root, 'temp_cache'))).toBe(true)
  })

  it('非目录路径抛基线那句话（platform.ts:90-94），不是静默空枚举', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-cleanf-scan-'))
    tempDirs.push(root)
    const file = join(root, 'plain.txt')
    await writeFile(file, 'x', 'utf8')

    await expect(createNodeCleanfRuntime().scanPath(file)).rejects.toThrow(`Path is not a directory: ${file}`)
  })

  it('makeCleanfItem 与基线 :180-189 同形（resolve + basename + dirname，depth 缺省 1）', () => {
    const made = makeCleanfItem('some/dir/a.bak', 'file', 3)
    expect(made.name).toBe('a.bak')
    expect(made.type).toBe('file')
    expect(made.depth).toBe(3)
    expect(made.path.endsWith(join('some', 'dir', 'a.bak'))).toBe(true)
    expect(made.parentPath).toBe(made.path.slice(0, made.path.lastIndexOf('/')))
  })
})

function target (path: string, depth: number): CleanfTarget {
  const name = path.split(/[\\/]/).at(-1) ?? path
  return { path, name, type: 'dir', preset: 'empty_folders', reason: 'Empty folder', depth }
}

/** 基线测试里那份 `FileOperationBatchResult` 的等价物：全部成功、可撤销、一条 undoId。 */
function batch (statuses: string[]): CleanfFileOperationBatchResult {
  const succeeded = statuses.filter((status) => status === 'succeeded').length
  // EOPT（`exactOptionalPropertyTypes`）下 `undoId?: string` 不许显式收 `undefined`，
  // 所以"没有批次 id"这一格写成"没有这个键"，读侧（`removed.undoId`）拿到的同样是 undefined。
  return { succeeded, failed: 0, cancelled: 0, undoable: succeeded, ...(succeeded ? { undoId: 'undo-cleanf-1' } : {}) }
}

// 让 TS 知道这份假件满足注入点（没写注解就会被 noUnusedLocals 挑出来）。
void (0 as unknown as CleanfFileOperations | undefined)
