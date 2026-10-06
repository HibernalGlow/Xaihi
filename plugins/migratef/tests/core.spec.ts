/**
 * migratef 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组逐条抄自上游 `packages/nodes/migratef/src/core.test.ts`（tag `noxide`，172 行）
 *   的七个用例，连它那份 `memoryRuntime` 假 runtime（`join` 用 `/` 拼、`dirname` 按 `/` 切、
 *   `randomId: () => "id1"`、`now: () => new Date("2026-01-01T00:00:00.000Z")`）一起搬；
 *   `"Users\\a\\file.txt"`、`"target/a.txt"`、`"root/a.txt->target/a.txt"`、
 *   `writes["history.json"]).toContain("\"undone\": true")` 全是上游手写的常量。
 * - 第 2 组钉上游 `core.test.ts` **没有**覆盖的分支，真源是上游 `core.ts` 的行号，
 *   逐条写在用例注释里：`normalizeMigratefInput`（`:94-111`）、两种 `throw`（`:137-138`）、
 *   `source_missing` / `no_files`（`:145`、`:180`）、计划与执行的消息模板（`:124`、`:273`）、
 *   `recordUndoIfNeeded` 的空记录（`:291-292`）、copy 批次的 undo 走 `deletePath`（`:333`）、
 *   `undone` 只在零失败时置真（`:352`）、历史条数上限（`:310`）、
 *   以及 `remove-empty-source` 的回读闸门（`:246-247`）。
 *   其中 `mergeExistingDirectories` / `relativeTargetBase` 两个槽上游两面（UI 与 CLI）
 *   都不下发、只有这份测试在用（`interaction.ts:146-155`、`cli.ts:242-251`），
 *   所以它们在这里钉住——清单里没有它们不是漏搬，是本包不发明字段。
 * - 第 3 组是本包的账本闸门（`src/platform.ts`）：没配 `historyPath` 时**动手之前**就拒绝。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * @module xaihi-migratef/tests/core
 */

import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'
import type { MigratefDirEntry, MigratefPathInfo, MigratefRuntime } from '../src/core.ts'
import {
  buildMigratefPlan,
  collectFiles,
  dumpMigratefHistory,
  normalizeMigratefInput,
  parseMigratefHistory,
  preserveRelativeTarget,
  runMigratef,
} from '../src/core.ts'
import { HISTORY_PATH_UNSET, createNodeMigratefRuntime, needsHistoryPath, requireHistoryPath } from '../src/platform.ts'

describe('migratef core（上游 core.test.ts 逐条搬来）', () => {
  // 上游 `core.test.ts:7-10`。
  it('normalizes preserve targets', () => {
    expect(preserveRelativeTarget('C:\\Users\\a\\file.txt')).toBe('Users\\a\\file.txt')
    expect(preserveRelativeTarget('/mnt/a/file.txt')).toBe('mnt/a/file.txt')

    // 阳性对照 + 上游 `core.ts:211`：非法字符换成 `_`，而**前缀先剥后换**这个顺序
    // 反了就多一层目录（先换的话 `/mnt/a` 会变成 `_mnt_a`）。
    expect(preserveRelativeTarget('/a/b:c*d?.txt')).toBe('a/b_c_d_.txt')
    expect(preserveRelativeTarget('C:\\a\\b')).toBe('a\\b')
  })

  // 上游 `core.test.ts:12-15`。
  it('round-trips undo history', () => {
    const records = [{ id: 'abc', timestamp: '2026-01-01T00:00:00.000Z', description: 'move', action: 'move' as const, operations: [{ sourcePath: 'a', targetPath: 'b', action: 'move' as const }] }]
    expect(parseMigratefHistory(dumpMigratefHistory(records))).toEqual(records)

    // 阳性对照 + 上游 `core.ts:214-223`：不是数组、解析失败、缺 id 的记录一律丢掉，
    // 而不是抛——账本文件是用户能改坏的。
    expect(parseMigratefHistory(null)).toEqual([])
    expect(parseMigratefHistory('   ')).toEqual([])
    expect(parseMigratefHistory('{"id":"abc"}')).toEqual([])
    expect(parseMigratefHistory('[{"timestamp":"t","operations":[]}]')).toEqual([])
    expect(dumpMigratefHistory([])).toBe('[]\n')
  })

  // 上游 `core.test.ts:17-34`。
  it('builds flat and direct plans', async () => {
    const runtime = memoryRuntime({
      root: dirInfo('root'),
      'root/a.txt': fileInfo('root/a.txt'),
      'root/nested': dirInfo('root/nested'),
      'root/nested/b.txt': fileInfo('root/nested/b.txt'),
      target: dirInfo('target'),
    }, {
      root: [fileEntry('a.txt', 'root/a.txt'), dirEntry('nested', 'root/nested')],
      'root/nested': [fileEntry('b.txt', 'root/nested/b.txt')],
      target: [],
    })
    const flat = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', maxWorkers: 1, historyLimit: 10, dryRun: true }), runtime)
    expect(flat.map((item) => item.targetPath)).toEqual(['target/a.txt'])
    const direct = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'direct', sourcePaths: ['root'], targetPath: 'target', maxWorkers: 1, historyLimit: 10, dryRun: true }), runtime)
    expect(direct[0]?.targetPath).toBe('target/root')
    expect(direct[0]?.kind).toBe('directory')

    // 阳性对照：flat **只收一层**（`core.ts:178` 传的是 `mode === "preserve"`），
    // 换成 preserve 就必须看见嵌套那条。
    const preserve = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'preserve', sourcePaths: ['root'], targetPath: 'target' }), runtime)
    expect(preserve.map((item) => item.targetPath)).toEqual(['target/root/a.txt', 'target/root/nested/b.txt'])
  })

  // 上游 `core.test.ts:36-67`。
  it('resolves parent-relative targets and recursively merges existing directories', async () => {
    const source = '/workspace/incoming/library/series'
    const target = '/workspace/archive/series'
    const runtime = memoryRuntime(mergedFixtureInfos(source, target), mergedFixtureDirs(source, target))

    const plan = await buildMigratefPlan(normalizeMigratefInput({
      action: 'move',
      mode: 'direct',
      sourcePaths: [source],
      targetPath: '../../archive',
      relativeTargetBase: 'source-parent',
      mergeExistingDirectories: true,
      dryRun: true,
    }), runtime)

    expect(plan).toEqual([
      expect.objectContaining({ sourcePath: `${source}/cover.jpg`, targetPath: `${target}/cover.jpg`, status: 'pending' }),
      expect.objectContaining({ sourcePath: `${source}/nested/page.jpg`, targetPath: `${target}/nested/page.jpg`, status: 'pending' }),
      expect.objectContaining({ sourcePath: `${source}/nested`, operation: 'remove-empty-source', status: 'pending' }),
      expect.objectContaining({ sourcePath: source, operation: 'remove-empty-source', status: 'pending' }),
    ])

    // 阳性对照：把 `mergeExistingDirectories` 关掉就退回上游 `core.ts:167-174` 那条
    // "目标已存在 ⇒ 整条 skipped"，一条 transfer 都不会有。
    const unmerged = await buildMigratefPlan(normalizeMigratefInput({
      action: 'move',
      mode: 'direct',
      sourcePaths: [source],
      targetPath: '../../archive',
      relativeTargetBase: 'source-parent',
    }), runtime)
    expect(unmerged).toEqual([
      expect.objectContaining({ targetPath: target, status: 'skipped', reason: 'target_exists' }),
    ])
  })

  // 上游 `core.test.ts:69-86`。
  it('keeps conflicting source entries when merging instead of overwriting target files', async () => {
    const source = '/workspace/source'
    const target = '/workspace/target/source'
    const runtime = memoryRuntime({
      [source]: dirInfo(source),
      [`${source}/same.txt`]: fileInfo(`${source}/same.txt`),
      [target]: dirInfo(target),
      [`${target}/same.txt`]: fileInfo(`${target}/same.txt`),
    }, {
      [source]: [fileEntry('same.txt', `${source}/same.txt`)],
    })

    const plan = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'direct', sourcePaths: [source], targetPath: '/workspace/target', mergeExistingDirectories: true }), runtime)

    expect(plan).toEqual([
      expect.objectContaining({ sourcePath: `${source}/same.txt`, targetPath: `${target}/same.txt`, status: 'skipped', reason: 'target_exists' }),
    ])
    // 阳性对照 + 上游 `core.ts:386`、`:415`：冲突 ⇒ `canRemoveSource = false` ⇒
    // **不追加** remove-empty-source 那条，所以清单只有这一项（上面已经钉住长度 1）。
    expect(plan).toHaveLength(1)
  })

  // 上游 `core.test.ts:88-106`。
  it('skips a relative target that resolves to the source itself', async () => {
    const source = '/workspace/source'
    const runtime = memoryRuntime({ [source]: dirInfo(source) })

    const plan = await buildMigratefPlan(normalizeMigratefInput({
      action: 'move',
      mode: 'direct',
      sourcePaths: [source],
      targetPath: '.',
      relativeTargetBase: 'source-parent',
      mergeExistingDirectories: true,
    }), runtime)

    expect(plan).toEqual([
      expect.objectContaining({ sourcePath: source, targetPath: source, status: 'skipped', reason: 'source_target_same' }),
    ])
    // 阳性对照：同一份夹具换成 `working-directory`（内核默认，`core.ts:108`）就
    // 不是同一路径，`targetPath` 变成字面 `.` 拼出来的 `./source`。
    const wd = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'direct', sourcePaths: [source], targetPath: '.' }), runtime)
    expect(wd[0]).toMatchObject({ targetPath: './source', status: 'pending' })
  })

  // 上游 `core.test.ts:108-127`。
  it('executes move and undo with history', async () => {
    const moves: string[] = []
    const writes: Record<string, string> = {}
    const runtime = memoryRuntime({
      root: dirInfo('root'),
      'root/a.txt': fileInfo('root/a.txt'),
      target: dirInfo('target'),
    }, {
      root: [fileEntry('a.txt', 'root/a.txt')],
      target: [],
    }, moves, writes)
    const result = await runMigratef({ action: 'move', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', historyPath: 'history.json' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.operationId).toBe('id1')
    expect(moves).toEqual(['root/a.txt->target/a.txt'])
    const undo = await runMigratef({ action: 'undo', historyPath: 'history.json' }, runtime)
    expect(undo.success).toBe(true)
    expect(moves.at(-1)).toBe('target/a.txt->root/a.txt')
    expect(writes['history.json']).toContain('"undone": true')

    // 阳性对照 + 上游 `core.ts:297`：描述行是 `${mode} ${action} to ${targetPath}`，
    // 时间戳来自 `now()`（假 runtime 写死 2026-01-01）。
    const record = parseMigratefHistory(writes['history.json'])[0]!
    expect(record.description).toBe('flat move to target')
    expect(record.timestamp).toBe('2026-01-01T00:00:00.000Z')
    expect(record.operations).toEqual([{ sourcePath: 'root/a.txt', targetPath: 'target/a.txt', action: 'move' }])
    // 阳性对照：`undone` 已经置真的批次**不许再撤第二次**。不带 batchId 时命中的是
    // 另一条判据（`core.ts:317` 的 `find((item) => !item.undone)` ⇒ 没得撤 =
    // `No undoable batch found.`），所以这里点名批次 id 才会走到 `:319` 那句。
    const again = await runMigratef({ action: 'undo', historyPath: 'history.json', batchId: 'id1' }, runtime)
    expect(again.success).toBe(false)
    expect(again.message).toBe('Undo batch already applied: id1')
    const noneLeft = await runMigratef({ action: 'undo', historyPath: 'history.json' }, runtime)
    expect(noneLeft.message).toBe('No undoable batch found.')
  })
})

describe('migratef core（上游没覆盖的分支，逐条钉住）', () => {
  // 上游 `core.ts:94-111`。
  it('normalizes to the kernel defaults and puts path first', () => {
    expect(normalizeMigratefInput({})).toEqual({
      action: 'move',
      mode: 'preserve',
      path: '',
      sourcePaths: [],
      targetPath: '',
      maxWorkers: 16,
      batchId: '',
      historyLimit: 10,
      historyPath: '',
      dryRun: false,
      relativeTargetBase: 'working-directory',
      mergeExistingDirectories: false,
    })
    // `path` 是 unshift 到最前 + 去重（`:95-96`、`:101`）。
    expect(normalizeMigratefInput({ path: 'a', sourcePaths: ['b', 'a', ' c '] }).sourcePaths).toEqual(['a', 'b', 'c'])
    // 阳性对照：定义里 `dryRun` 的界面默认是 true（`package.json#xaihi.node`），
    // 内核默认是 **false**（`:107`），两边不许合并。
    expect(normalizeMigratefInput({}).dryRun).toBe(false)
  })

  // 上游 `core.ts:137-138`：两条 throw 被 `runMigratef` 咽成 failure（`:131-133`）。
  it('turns missing sources and missing target into failures, not throws', async () => {
    const runtime = memoryRuntime({})
    const noSource = await runMigratef({ action: 'plan', targetPath: 't' }, runtime)
    expect(noSource.success).toBe(false)
    expect(noSource.message).toBe('At least one source path is required.')
    expect(noSource.data?.errors).toEqual(['At least one source path is required.'])
    expect(noSource.data?.failedCount).toBe(1)

    // 阳性对照：两条闸门的文案不许共用。
    const noTarget = await runMigratef({ action: 'plan', sourcePaths: ['s'] }, runtime)
    expect(noTarget.message).toBe('Target path is required.')
  })

  // 上游 `core.ts:145`、`:180`：两种 skip 的 reason。
  it('skips a missing source and a directory with no files', async () => {
    const runtime = memoryRuntime({
      empty: dirInfo('empty'),
    }, { empty: [] })
    const plan = await buildMigratefPlan(normalizeMigratefInput({ action: 'move', mode: 'flat', sourcePaths: ['gone', 'empty'], targetPath: 'target' }), runtime)
    expect(plan).toEqual([
      { sourcePath: 'gone', targetPath: '', action: 'move', kind: 'file', status: 'skipped', reason: 'source_missing' },
      { sourcePath: 'empty', targetPath: '', action: 'move', kind: 'directory', status: 'skipped', reason: 'no_files' },
    ])
    // 阳性对照 + 上游 `core.ts:193-195`：`collectFiles` 对"既不是文件也不是目录"的
    // 路径（软链）返回空数组。
    expect(await collectFiles({ path: 'link', exists: true, isFile: false, isDirectory: false }, true, runtime)).toEqual([])
  })

  // 上游 `core.ts:124` 与 `:273` 的两条消息模板。
  it('says Plan generated for the preview leg and Move completed for the live leg', async () => {
    const runtime = memoryRuntime({
      root: dirInfo('root'),
      'root/a.txt': fileInfo('root/a.txt'),
    }, { root: [fileEntry('a.txt', 'root/a.txt')] })
    const planned = await runMigratef({ action: 'plan', mode: 'flat', sourcePaths: ['root'], targetPath: 'target' }, runtime)
    expect(planned.message).toBe('Plan generated: 1 item(s).')
    // 阳性对照：`dryRun` 下的 move 走的也是计划分支，但 action 是 move ⇒ 消息仍是这句。
    const dry = await runMigratef({ action: 'move', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', dryRun: true }, runtime)
    expect(dry.message).toBe('Plan generated: 1 item(s).')

    const live = await runMigratef({ action: 'move', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', historyPath: 'h.json' }, runtime)
    expect(live.message).toBe('Move completed: 1 success, 0 skipped, 0 failed.')
    expect(live.data?.totalCount).toBe(1)
  })

  // 上游 `core.ts:291-292`：零成功 ⇒ 不写账本，`operationId` 是空串。
  it('records nothing when no entry succeeded', async () => {
    const writes: Record<string, string> = {}
    const runtime = memoryRuntime({ root: dirInfo('root') }, { root: [] }, [], writes)
    const result = await runMigratef({ action: 'copy', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', historyPath: 'h.json' }, runtime)
    expect(result.data?.operationId).toBe('')
    expect(result.message).toBe('Copy completed: 0 success, 1 skipped, 0 failed.')
    expect(writes['h.json']).toBeUndefined()

    // 阳性对照：真搬了一条就必须写，而且只记 `status === "success"` 的那几条（`:291`）。
    const moves2: string[] = []
    const runtime2 = memoryRuntime({
      root: dirInfo('root'),
      'root/a.txt': fileInfo('root/a.txt'),
    }, { root: [fileEntry('a.txt', 'root/a.txt')] }, moves2, writes)
    const copied = await runMigratef({ action: 'copy', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', historyPath: 'h.json' }, runtime2)
    expect(copied.data?.operationId).toBe('id1')
    // 账本记的是 `sourcePath` / `targetPath` 两列（`core.ts:299`），fake fs 把那次复制
    // 记成 `copy:<src>-><dst>`，两处各按各的形状钉住。
    expect(writes['h.json']).toContain('"targetPath": "target/a.txt"')
    expect(moves2).toEqual(['copy:root/a.txt->target/a.txt'])
    expect(parseMigratefHistory(writes['h.json'])[0]!.action).toBe('copy')
  })

  // 上游 `core.ts:333`：undo 一个 copy 批次走的是 `deletePath`，不是搬回去。
  it('undoes a copy batch by deleting the copies', async () => {
    const moves: string[] = []
    const writes: Record<string, string> = {}
    const runtime = memoryRuntime({
      root: dirInfo('root'),
      'root/a.txt': fileInfo('root/a.txt'),
    }, { root: [fileEntry('a.txt', 'root/a.txt')] }, moves, writes)
    await runMigratef({ action: 'copy', mode: 'flat', sourcePaths: ['root'], targetPath: 'target', historyPath: 'c.json' }, runtime)
    expect(moves).toEqual(['copy:root/a.txt->target/a.txt'])
    const undo = await runMigratef({ action: 'undo', historyPath: 'c.json' }, runtime)
    expect(undo.success).toBe(true)
    expect(moves.at(-1)).toBe('delete:target/a.txt')
    expect(undo.data?.successCount).toBe(1)
  })

  // 上游 `core.ts:246-247`：remove-empty-source 先回读，非空就 throw 成一条 error 条目。
  it('refuses to delete a source directory that is not empty', async () => {
    const source = '/workspace/incoming/library/series'
    const target = '/workspace/archive/series'
    const moves: string[] = []
    // 静态假 fs：`listDir` 永远回同一份清单 ⇒ 搬完之后源目录"还是有东西"，
    // 正好用来逼出那条回读闸门（真 fs 上它是靠 rename 之后目录空了才通过的）。
    const runtime = memoryRuntime(mergedFixtureInfos(source, target), mergedFixtureDirs(source, target), moves)
    const result = await runMigratef({
      action: 'move',
      mode: 'direct',
      sourcePaths: [source],
      targetPath: '../../archive',
      relativeTargetBase: 'source-parent',
      mergeExistingDirectories: true,
      historyPath: 'h.json',
    }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.migratedCount).toBe(2)
    expect(result.data?.errorCount).toBe(2)
    expect(result.data?.plan.filter((item) => item.status === 'error').map((item) => item.sourcePath))
      .toEqual([`${source}/nested`, source])
    expect(moves).toEqual([`${source}/cover.jpg->${target}/cover.jpg`, `${source}/nested/page.jpg->${target}/nested/page.jpg`])
    // 阳性对照：被删目录那条**没被当成一次成功**记进账本（`:291` 排除 remove-empty-source），
    // 所以账本里只有两条 transfer。
    expect(parseMigratefHistory(await runtime.readText('h.json'))[0]?.operations).toHaveLength(2)
  })

  // 上游 `core.ts:305`、`:310`：账本存 100 条，`history` 按 historyLimit 切。
  it('slices the returned history by historyLimit', async () => {
    const writes: Record<string, string> = {}
    const runtime = memoryRuntime({}, {}, [], writes)
    const many = Array.from({ length: 7 }, (_unused, index) => ({
      id: `id${String(index)}`,
      timestamp: '2026-01-01T00:00:00.000Z',
      description: 'x',
      action: 'move' as const,
      operations: [{ sourcePath: 'a', targetPath: 'b', action: 'move' as const }],
    }))
    writes['h.json'] = dumpMigratefHistory(many)
    const result = await runMigratef({ action: 'history', historyPath: 'h.json', historyLimit: 3 }, runtime)
    expect(result.message).toBe('Loaded 3 history record(s).')
    expect(result.data?.history.map((item) => item.id)).toEqual(['id0', 'id1', 'id2'])
    // 阳性对照：`historyLimit` 默认 10 ⇒ 同一份账本回 7 条。
    const all = await runMigratef({ action: 'history', historyPath: 'h.json' }, runtime)
    expect(all.data?.history).toHaveLength(7)
  })

  // 上游 `core.ts:318`：没给 batchId 时找**第一条未撤销**的。
  it('picks the first non-undone batch when no batch id is given', async () => {
    const writes: Record<string, string> = {}
    const runtime = memoryRuntime({}, {}, [], writes)
    writes['h.json'] = dumpMigratefHistory([
      { id: 'a', timestamp: 't', description: 'x', action: 'move', operations: [], undone: true },
      { id: 'b', timestamp: 't', description: 'x', action: 'move', operations: [{ sourcePath: 'p', targetPath: 'q', action: 'move' }] },
    ])
    const result = await runMigratef({ action: 'undo', historyPath: 'h.json' }, runtime)
    expect(result.message).toBe('Undo completed: 1 success, 0 failed.')
    // 阳性对照：点名一个不存在的批次说的是另一句话。
    const missing = await runMigratef({ action: 'undo', historyPath: 'h.json', batchId: 'zzz' }, runtime)
    expect(missing.message).toBe('Undo batch not found: zzz')
  })
})

describe('migratef 的账本闸门（src/platform.ts）', () => {
  it('knows which actions touch the undo journal', () => {
    expect(needsHistoryPath('history', true)).toBe(true)
    expect(needsHistoryPath('undo', true)).toBe(true)
    expect(needsHistoryPath('move', false)).toBe(true)
    expect(needsHistoryPath('copy', false)).toBe(true)
    expect(needsHistoryPath('plan', false)).toBe(false)
    // 阳性对照：预演下的 move/copy **不碰**账本（内核在计划分支就 return 了，`core.ts:123-129`），
    // 这条判据就是"没配 historyPath 时这个节点还剩 plan 与预演可用"的依据。
    expect(needsHistoryPath('move', true)).toBe(false)
    expect(needsHistoryPath('copy', true)).toBe(false)
  })

  it('refuses before touching a single file when the journal path is unset', () => {
    expect(() => requireHistoryPath('move', { action: 'move', dryRun: false })).toThrow(/Config\.historyPath/)
    expect(() => requireHistoryPath('history', { action: 'history', historyPath: '' })).toThrow(HISTORY_PATH_UNSET)
    expect(() => requireHistoryPath('plan', { action: 'plan', dryRun: false })).not.toThrow()
    expect(() => requireHistoryPath('move', { action: 'move', dryRun: false, historyPath: '/tmp/x.json' })).not.toThrow()
    // 阳性对照：那句拒绝必须点名**能被使用者改到的出口**，不是只说"没路径"。
    expect(HISTORY_PATH_UNSET).toContain('ADR-0003')
  })

  it('makes the runtime fallback a loud refusal instead of a guessed directory', () => {
    const runtime = createNodeMigratefRuntime()
    // 上游 `platform.ts:31` 从 `@xiranite/config` 的位置推；那一格在 ADR-0013 里整块不搬，
    // 所以这里必须是抛，而不是回落到某个"没人知道的地方"。
    expect(() => runtime.defaultHistoryPath()).toThrow(/Config\.historyPath/)
  })

  it('keeps the real fs runtime reachable for the read-only legs', async () => {
    const runtime = createNodeMigratefRuntime()
    // 阳性对照：`pathInfo` 对不存在的路径是 `exists:false` + **解析后的路径**，不抛。
    const info = await runtime.pathInfo('definitely-not-here-xyz')
    expect(info.exists).toBe(false)
    expect(posix.isAbsolute(info.path) || /^[A-Za-z]:[\\/]/.test(info.path)).toBe(true)
    // `readText` 把读取失败咽成 null（上游 `:106-112`），`history` 因此回 0 条而不是抛。
    expect(await runtime.readText('definitely-not-here-xyz')).toBeNull()
  })
})

// --- 上游 core.test.ts 的那三份假件，逐字搬（`:130-171`） --------------------

function fileInfo(path: string): MigratefPathInfo {
  return { path, exists: true, isFile: true, isDirectory: false }
}

function dirInfo(path: string): MigratefPathInfo {
  return { path, exists: true, isFile: false, isDirectory: true }
}

function fileEntry(name: string, path: string): MigratefDirEntry {
  return { name, path, isFile: true, isDirectory: false }
}

function dirEntry(name: string, path: string): MigratefDirEntry {
  return { name, path, isFile: false, isDirectory: true }
}

/** 上游 `core.test.ts:39-44` 与 `:46-49` 那两份合并夹具，抽出来给合并与执行两条腿共用。 */
function mergedFixtureInfos(source: string, target: string): Record<string, MigratefPathInfo> {
  return {
    [source]: dirInfo(source),
    [`${source}/cover.jpg`]: fileInfo(`${source}/cover.jpg`),
    [`${source}/nested`]: dirInfo(`${source}/nested`),
    [`${source}/nested/page.jpg`]: fileInfo(`${source}/nested/page.jpg`),
    [target]: dirInfo(target),
    [`${target}/nested`]: dirInfo(`${target}/nested`),
  }
}

function mergedFixtureDirs(source: string, target: string): Record<string, MigratefDirEntry[]> {
  return {
    [source]: [fileEntry('cover.jpg', `${source}/cover.jpg`), dirEntry('nested', `${source}/nested`)],
    [`${source}/nested`]: [fileEntry('page.jpg', `${source}/nested/page.jpg`)],
    [target]: [],
    [`${target}/nested`]: [],
  }
}

/**
 * 上游 `core.test.ts:146-171` 那份假 runtime，逐字：`join` 用 `/` 拼、`dirname` 按 `/` 切、
 * `randomId` 写死 `id1`、`now` 写死 2026-01-01，`movePath` / `copyFile` 只记账不碰盘。
 * `pathInfo` 查不到时回 `exists:false`（不是抛），这条判据也被上面的用例用着。
 */
function memoryRuntime(
  infos: Record<string, MigratefPathInfo>,
  dirs: Record<string, MigratefDirEntry[]> = {},
  moves: string[] = [],
  writes: Record<string, string> = {},
): MigratefRuntime {
  return {
    pathInfo: async (path) => infos[path] ?? { path, exists: false, isFile: false, isDirectory: false },
    listDir: async (path) => dirs[path] ?? [],
    ensureDir: async () => {},
    copyFile: async (source, target) => { moves.push(`copy:${source}->${target}`) },
    copyDir: async (source, target) => { moves.push(`copydir:${source}->${target}`) },
    movePath: async (source, target) => { moves.push(`${source}->${target}`) },
    deletePath: async (path) => { moves.push(`delete:${path}`) },
    readText: async (path) => writes[path] ?? null,
    writeText: async (path, content) => { writes[path] = content },
    join: (...parts) => parts.join('/'),
    dirname: (path) => path.split('/').slice(0, -1).join('/'),
    basename: (path) => path.split('/').at(-1) ?? path,
    isAbsolute: posix.isAbsolute,
    resolve: posix.resolve,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    randomId: () => 'id1',
    defaultHistoryPath: () => 'history.json',
  }
}
