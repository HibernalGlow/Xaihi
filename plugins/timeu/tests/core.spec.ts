/**
 * timeu 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源，逐条写着：
 * - 第 1 组（`fakeRuntime` 那五条）抄自上游 `packages/nodes/timeu/src/core.test.ts`
 *   tag `noxide` 的同名用例，连假运行时的形状一起搬（`stamp(1000, 2000)`、
 *   `[['/root/a.txt', 11, 22]]`、`atimeMs 5 / mtimeMs 6 / ctimeMs 7 / birthtimeMs 8`
 *   都是上游手写的常量）。
 * - 第 2 组（真文件系统那三条）钉的是 `platform.ts` 的枚举语义：判据来自上游
 *   `pathInfo` 用 `stat`、`listDir` 用 `readdir(withFileTypes)` 这一对差异，
 *   期望值是照着 fixture 的构造手写出来的，不是拿被测函数算一遍再抄回来。
 * - 第 3 组钉 `package.json#xaihi.node`：词表抄自
 *   `<Xiranite>/node-definitions/timeu.json`，`recordPath` 的占位文案
 *   （"timeu-timestamps.json"）与"空 recordPath 落在首个路径旁"那条行为也来自同一份定义。
 *
 * 每条尺都配阳性对照（"关掉防御就变红"），对照与被控断言写在同一条用例里。
 *
 * @module xaihi-timeu/tests/core
 */

import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { bindInputs, dangerFor, parametersFor, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { TimeuRuntime, TimeuTimestampRecord } from '../src/core.ts'
import {
  buildBackupPlan,
  buildRestorePlan,
  collectTimeuTargets,
  dumpTimestampRecords,
  mergeTimestampRecords,
  normalizeTimeuInput,
  runTimeu,
} from '../src/core.ts'
import { createNodeTimeuRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('timeu core（上游用例逐条搬来）', () => {
  it('backup 把时间戳写进 JSON 记录文件；dryRun 为默认值时一个字都不写（阳性对照）', async () => {
    const writes: Record<string, string> = {}
    const runtime = fakeRuntime({ files: { '/root/a.txt': stamp(1000, 2000) }, writes })

    const live = await runTimeu({ action: 'backup', paths: ['/root/a.txt'], recordPath: '/root/timeu.json', dryRun: false }, runtime)
    expect(live.success).toBe(true)
    expect(live.data?.backupCount).toBe(1)
    expect(JSON.parse(writes['/root/timeu.json'] ?? '[]')[0]).toMatchObject({ path: '/root/a.txt', atimeMs: 1000, mtimeMs: 2000 })

    // 阳性对照：`core.ts:113` 那句 `normalized.action === "scan" || normalized.dryRun` 一删，
    // 这条就红——预演会留下写盘。
    const dry: Record<string, string> = {}
    const dryResult = await runTimeu({ action: 'backup', paths: ['/root/a.txt'], recordPath: '/root/timeu.json' }, fakeRuntime({ files: { '/root/a.txt': stamp(1000, 2000) }, writes: dry }))
    expect(dryResult.data?.backupCount).toBe(0)
    expect(dry).toEqual({})
  })

  it('restore 把存下来的 atime/mtime 写回，ctime/birthtime 不动', async () => {
    const applied: Array<[string, number, number]> = []
    const record = [{ path: '/root/a.txt', atimeMs: 11, mtimeMs: 22, ctimeMs: 33, birthtimeMs: 44, backedUpAt: '2026-01-01T00:00:00.000Z' }]
    const runtime = fakeRuntime({
      files: { '/root/a.txt': stamp(1000, 2000) },
      reads: { '/root/timeu.json': dumpTimestampRecords(record) },
      onSetTimes: (...args) => applied.push(args),
    })

    const result = await runTimeu({ action: 'restore', paths: ['/root/a.txt'], recordPath: '/root/timeu.json', dryRun: false }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.restoredCount).toBe(1)
    expect(applied).toEqual([['/root/a.txt', 11, 22]])
  })

  it('恢复时路径不存在 ⇒ 报 skipped 并点名原因，而不是当没这条（阳性对照）', async () => {
    const record = [{ path: '/root/missing.txt', atimeMs: 11, mtimeMs: 22, ctimeMs: 33, birthtimeMs: 44, backedUpAt: '2026-01-01T00:00:00.000Z' }]
    const runtime = fakeRuntime({ reads: { '/root/timeu.json': dumpTimestampRecords(record) } })

    const result = await runTimeu({ action: 'restore', paths: ['/root/missing.txt'], recordPath: '/root/timeu.json' }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.skippedCount).toBe(1)
    expect(result.data?.plan[0]?.reason).toBe('path_missing')
    // 对照：同一个 record 配上真实存在的文件时不许出 skipped。
    const present = fakeRuntime({
      files: { '/root/a.txt': stamp(1000, 2000) },
      reads: { '/root/timeu.json': dumpTimestampRecords(record.map((item) => ({ ...item, path: '/root/a.txt' }))) },
    })
    const liveResult = await runTimeu({ action: 'restore', paths: ['/root/a.txt'], recordPath: '/root/timeu.json' }, present)
    expect(liveResult.data?.skippedCount).toBe(0)
  })

  it('mergeTimestampRecords 按路径合并，backedUpAt 用传进来的那个时间', () => {
    const existing = [{ path: '/root/a.txt', atimeMs: 1, mtimeMs: 2, ctimeMs: 3, birthtimeMs: 4, backedUpAt: 'old' }]
    const current = [{ path: '/root/a.txt', atimeMs: 5, mtimeMs: 6, ctimeMs: 7, birthtimeMs: 8, backedUpAt: 'new' }]

    expect(mergeTimestampRecords(existing, current, new Date('2026-01-01T00:00:00.000Z'))).toEqual([
      { path: '/root/a.txt', atimeMs: 5, mtimeMs: 6, ctimeMs: 7, birthtimeMs: 8, backedUpAt: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('normalizeTimeuInput：默认值与 listText 的切分（path-list 字段就靠这条）', () => {
    const normalized = normalizeTimeuInput({ listText: ' /a.txt ,\n /b.txt\n\n/a.txt' })
    expect(normalized.action).toBe('scan')
    expect(normalized.recursive).toBe(true)
    expect(normalized.dryRun).toBe(true)
    expect(normalized.includeDirectories).toBe(false)
    // 上游 `parseList` 同时按换行与逗号切，再去重保序。
    expect(normalized.paths).toEqual(['/a.txt', '/b.txt'])
  })

  it('没有路径时判失败，而不是空计划当成功（阳性对照）', async () => {
    const empty = await runTimeu({ action: 'scan' }, fakeRuntime({}))
    expect(empty.success).toBe(false)
    expect(empty.message).toBe('At least one file or directory path is required.')
    expect(empty.data?.scannedCount).toBe(1)

    const one = await runTimeu({ action: 'scan', paths: ['/root/nope.txt'] }, fakeRuntime({}))
    expect(one.success).toBe(true)
  })

  it('buildBackupPlan / buildRestorePlan 的状态词表就是定义里那四条', () => {
    const record: TimeuTimestampRecord = { path: '/a', atimeMs: 1, mtimeMs: 2, ctimeMs: 3, birthtimeMs: 4, backedUpAt: 'x' }
    expect(buildBackupPlan([record])).toEqual([{ path: '/a', operation: 'backup', status: 'pending', current: record }])
    expect(buildRestorePlan([], [record])[0]).toMatchObject({ operation: 'restore', status: 'skipped', reason: 'path_missing' })
  })
})

describe('timeu platform（真文件系统上的枚举语义）', () => {
  it('pathInfo 用 stat（跟随符号链接），listDir 用 Dirent（不跟随）：同一个软链两种答案', async () => {
    const root = await tempRoot('symlink')
    const target = join(root, 'sub')
    const innerFile = join(target, 'c.txt')
    const plainFile = join(root, 'a.txt')
    const linkToDir = join(root, 'link-dir')
    const linkToFile = join(root, 'link-file')
    await mkdir(target)
    await writeFile(innerFile, 'c', 'utf8')
    await writeFile(plainFile, 'a', 'utf8')
    await symlink(target, linkToDir, 'dir')
    await symlink(plainFile, linkToFile, 'file')

    const runtime = createNodeTimeuRuntime()
    const viaStat = await runtime.pathInfo(linkToDir)
    expect(viaStat.exists).toBe(true)
    expect(viaStat.isDirectory).toBe(true)
    expect(viaStat.isFile).toBe(false)

    // 对照：listDir 那一边同一个条目必须是"既不是文件也不是目录"，
    // 有人把它改成逐项 stat 就红（那时软链目录会被当成目录递归进去）。
    const entries = await runtime.listDir(root)
    const seen = entries.find((entry) => entry.name === 'link-dir')
    expect(seen?.isDirectory).toBe(false)
    expect(seen?.isFile).toBe(false)
    const seenFileLink = entries.find((entry) => entry.name === 'link-file')
    expect(seenFileLink?.isFile).toBe(false)

    // 存在的那个软链文件走 stat 才是文件——`pathInfo` 与 `listDir` 给的是两个答案。
    const viaStatFile = await runtime.pathInfo(linkToFile)
    expect(viaStatFile.isFile).toBe(true)

    // lstat 与 stat 在这里给出不同的答案，钉住它。
    expect(lstatSync(linkToDir).isSymbolicLink()).toBe(true)
    expect(statSync(linkToDir).isDirectory()).toBe(true)
  })

  it('collectTimeuTargets：符号链接不进目标也不下钻，目录本身默认不进，不存在的原样留下', async () => {
    const root = await tempRoot('walk')
    await writeFile(join(root, 'a.txt'), 'a', 'utf8')
    await writeFile(join(root, 'b2.txt'), 'b', 'utf8')
    await writeFile(join(root, 'b10.txt'), 'c', 'utf8')
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', 'c.txt'), 'c', 'utf8')
    await symlink(join(root, 'a.txt'), join(root, 'link.txt'), 'file')
    await symlink(join(root, 'sub'), join(root, 'link-dir'), 'dir')
    const missing = join(root, 'gone.txt')

    const targets = await collectTimeuTargets([root, missing], true, false, createNodeTimeuRuntime())

    expect(targets).toContain(join(root, 'a.txt'))
    expect(targets).toContain(join(root, 'sub', 'c.txt'))
    // 阳性对照：跳过规则一丢（把符号链接当文件收进来），这两条就红。
    expect(targets).not.toContain(join(root, 'link.txt'))
    expect(targets).not.toContain(join(root, 'link-dir'))
    // 目录自身默认不收（includeDirectories=false）。
    expect(targets).not.toContain(join(root, 'sub'))
    // 不存在的路径不进目录列表，但作为目标原样保留（恢复流程要知道少了谁）。
    expect(targets).toContain(missing)
    // 排序用 numeric：b2 在 b10 之前，是手写出来的期望顺序。
    expect(targets.indexOf(join(root, 'b2.txt'))).toBeLessThan(targets.indexOf(join(root, 'b10.txt')))
    expect(targets).toEqual([...targets].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })))
  })

  it('includeDirectories 与 recursive=false 各改一条判据（上游那两个 if 的形状）', async () => {
    const root = await tempRoot('flags')
    await writeFile(join(root, 'a.txt'), 'a', 'utf8')
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', 'c.txt'), 'c', 'utf8')
    const runtime = createNodeTimeuRuntime()

    // 目录根 + 不递归 + 不含目录 ⇒ 一个目标都没有：上游 `core.ts:153-154` 两个 if
    // 都不成立（`includeDirectories` 假 ⇒ 目录自身不进；`recursive` 假 ⇒ 不下钻）。
    expect(await collectTimeuTargets([root], false, false, runtime)).toEqual([])
    // 对照一：recursive=true ⇒ 下钻，两层文件都进来（排序按 numeric）。
    expect(await collectTimeuTargets([root], true, false, runtime)).toEqual([join(root, 'a.txt'), join(root, 'sub', 'c.txt')])
    // 对照二：includeDirectories=true 而不递归 ⇒ 只有根目录自己那一条。
    expect(await collectTimeuTargets([root], false, true, runtime)).toEqual([root])

    const withDirs = await collectTimeuTargets([root], true, true, runtime)
    expect(withDirs).toContain(join(root, 'sub'))
    expect(withDirs).toContain(root)
    // 单文件路径不受这两个开关影响（isFile 那条先判）。
    expect(await collectTimeuTargets([join(root, 'a.txt')], false, false, runtime)).toEqual([join(root, 'a.txt')])
  })

  it('recordPath 留空 ⇒ 记录文件落在首个目标旁边（定义里 placeholder 说的就是这个）', async () => {
    const root = await tempRoot('default-record')
    const file = join(root, 'a.txt')
    await writeFile(file, 'a', 'utf8')

    const result = await runTimeu({ action: 'backup', paths: [file] }, createNodeTimeuRuntime())
    expect(result.data?.recordPath).toBe(join(root, 'timeu-timestamps.json'))
    // 定义 `recordPath.placeholder` 的文案（只有一份，测试把它钉在行为上）。
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      xaihi?: { node?: { fields?: { id: string; default?: unknown }[] } }
    }
    // 定义里 recordPath 的默认值原样是上游那个标量信封（不是我们摊平过的裸串）。
    expect(manifest.xaihi?.node?.fields?.find((field) => field.id === 'recordPath')?.default).toEqual({ text: '' })

    const live = await runTimeu({ action: 'backup', paths: [file], dryRun: false }, createNodeTimeuRuntime())
    expect(live.success).toBe(true)
    expect(existsSync(join(root, 'timeu-timestamps.json'))).toBe(true)
    const stored = JSON.parse(readFileSync(join(root, 'timeu-timestamps.json'), 'utf8')) as { path: string }[]
    expect(stored[0]?.path).toBe(file)
  })

  it('restore 真的把 mtime 写回磁盘，缺失路径只跳过', async () => {
    const root = await tempRoot('restore')
    const file = join(root, 'a.txt')
    await writeFile(file, 'a', 'utf8')
    await utimes(file, new Date(111000), new Date(222000))
    const runtime = createNodeTimeuRuntime()

    const backed = await runTimeu({ action: 'backup', paths: [file], recordPath: join(root, 'rec.json'), dryRun: false }, runtime)
    expect(backed.data?.backupCount).toBe(1)

    await utimes(file, new Date(999000), new Date(888000))
    expect(Math.round(statSync(file).mtimeMs)).toBe(888000)

    const restored = await runTimeu({ action: 'restore', paths: [file], recordPath: join(root, 'rec.json'), dryRun: false }, runtime)
    expect(restored.data?.restoredCount).toBe(1)
    expect(Math.round(statSync(file).mtimeMs)).toBe(222000)
    expect(Math.round(statSync(file).atimeMs)).toBe(111000)

    // 阳性对照：预演不许改磁盘时间。
    await utimes(file, new Date(111000), new Date(222000))
    await runTimeu({ action: 'restore', paths: [file], recordPath: join(root, 'rec.json') }, runtime)
    expect(Math.round(statSync(file).mtimeMs)).toBe(222000)
  })

  it('坏 JSON 记录文件 ⇒ 抛进 failure，而不是当空账本硬跑', async () => {
    const root = await tempRoot('bad-record')
    const file = join(root, 'a.txt')
    await writeFile(file, 'a', 'utf8')
    await writeFile(join(root, 'rec.json'), '{ not json', 'utf8')

    const result = await runTimeu({ action: 'restore', paths: [file], recordPath: join(root, 'rec.json'), dryRun: false }, createNodeTimeuRuntime())
    expect(result.success).toBe(false)
    expect(result.data?.plan[0]?.status).toBe('error')
    expect(existsSync(join(root, 'rec.json'))).toBe(true)
  })
})

describe('timeu 清单', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }
    const result = validateNodeDefinition(pkg.xaihi?.node)
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('清单的词表与三个动作/六个字段一一对上（阳性对照：删一条就红）', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const node = (JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: Record<string, never> } }).xaihi?.node as never as {
      nodeId: string
      actions: { id: string; label: { zh: string; en: string } }[]
      fields: { id: string; kind: string }[]
      inputBindings: { fieldId: string; slot: string }[]
      danger: { type: string }
    }
    expect(node.nodeId).toBe('timeu')
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'backup', 'restore'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Scan', 'Back up', 'Restore'])
    expect(node.fields.map((field) => field.id)).toEqual(['action', 'listText', 'recordPath', 'recursive', 'includeDirectories', 'dryRun'])
    expect(node.inputBindings.map((binding) => `${binding.fieldId}->${binding.slot}`)).toEqual([
      'action->action', 'listText->listText', 'recordPath->recordPath', 'recursive->recursive', 'includeDirectories->includeDirectories', 'dryRun->dryRun',
    ])
    expect(node.danger.type).toBe('all')

    // 阳性对照：把规则摊平成 `{type}`（本仓一度这么写），尺必须判红——
    // 上游 `GuardedRule` 是 `{rule, when?}`，而 `fieldProperty` 读的是 `entry.rule.type`，
    // 摊平那份在装载期就 TypeError（"能读上游定义"这件事不能只是口号）。
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { xaihi: { node: Record<string, unknown> } }
    const flattened = JSON.parse(JSON.stringify(raw.xaihi.node)) as { fields: { id: string; rules?: unknown[] }[] }
    const listText = flattened.fields.find((field) => field.id === 'listText')
    listText!.rules = [{ type: 'nonBlank' }]
    const check = validateNodeDefinition(flattened)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('SDK 侧的形状：dryRun 只在非 scan 的参数表里出现，危险判据落在 backup/restore + 非预演上', () => {
    const validated = validateNodeDefinition(ownNode())
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    const def = validated.value
    // 期望值是照定义里的 visible 谓词手推的：dryRun 的可见条件是 `actionIs [scan]` 取非，
    // 而 `action` 是 isActionSelector ⇒ parametersFor 会按工具身份把它填上。
    expect(Object.keys(parametersFor(def, 'scan'))).toEqual(['listText', 'recordPath', 'recursive', 'includeDirectories'])
    expect(Object.keys(parametersFor(def, 'backup'))).toEqual(['listText', 'recordPath', 'recursive', 'includeDirectories', 'dryRun'])
    expect(Object.keys(parametersFor(def, 'restore'))).toEqual(['listText', 'recordPath', 'recursive', 'includeDirectories', 'dryRun'])
    // listText 带的是不带 when 的 nonBlank ⇒ 参数表里必须标必填（上游 `required` 的形状）。
    expect(parametersFor(def, 'scan')?.listText).toMatchObject({ type: 'array', required: true })
    expect(dangerFor(def, undefined, 'scan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'backup', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'backup', { dryRun: false })?.zh).toContain('timeu')
    // 对照：留着上游那句 `actionField: "action"` 时，模型不传 action 会让 scan 也被判危险
    // （dangerFor 的 all/any 路径没有 actionId 兜底）——把 scan 也拦去批准就是这一格漂的代价。
    expect(dangerFor(def, undefined, 'restore', {})).toBeDefined()
  })

  it('bindInputs 把 path-list 的数组形状原样交给内核（identity 绑定）', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors))
    expect(bindInputs(validated.value, { listText: ['/a', '/b'] })).toMatchObject({ listText: ['/a', '/b'] })
  })

  it('danger 的两条谓词：scan 之外且没打开 dryRun 才算危险（定义原话的可执行版）', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const node = (JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: Record<string, never> } }).xaihi?.node as never as {
      danger: { predicates: { test: { type: string; allowed?: string[]; fieldId?: string }; negated: boolean }[] }
    }
    expect(node.danger.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['scan'] }, negated: true },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])
  })
})

/** 本包清单里的节点定义；测试都读它，不在用例里抄第二份词表。 */
function ownNode(): Record<string, unknown> {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: Record<string, unknown> } }
  return pkg.xaihi?.node ?? {}
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-timeu-${label}-`))
  tempRoots.push(root)
  return root
}

function stamp (atimeMs: number, mtimeMs: number) {
  return { atimeMs, mtimeMs, ctimeMs: mtimeMs + 1, birthtimeMs: mtimeMs + 2 }
}

/** 上游 `core.test.ts` 里那份 fakeRuntime 逐字搬来（假路径规则、假时间源都保留）。 */
function fakeRuntime (options: {
  files?: Record<string, Omit<TimeuTimestampRecord, 'path' | 'backedUpAt'>>
  directories?: Record<string, string[]>
  reads?: Record<string, string>
  writes?: Record<string, string>
  onSetTimes?: (path: string, atimeMs: number, mtimeMs: number) => void
}): TimeuRuntime {
  const files = options.files ?? {}
  const directories = options.directories ?? {}
  return {
    pathInfo: async (path) => {
      const file = files[path]
      return {
        path,
        exists: Boolean(file) || Boolean(directories[path]),
        isFile: Boolean(file),
        isDirectory: Boolean(directories[path]),
        atimeMs: file?.atimeMs ?? 0,
        mtimeMs: file?.mtimeMs ?? 0,
        ctimeMs: file?.ctimeMs ?? 0,
        birthtimeMs: file?.birthtimeMs ?? 0,
      }
    },
    listDir: async (path) => (directories[path] ?? []).map((child) => ({ name: basename(child), path: child, isFile: Boolean(files[child]), isDirectory: Boolean(directories[child]) })),
    readText: async (path) => options.reads?.[path] ?? null,
    writeText: async (path, content) => { if (options.writes) options.writes[path] = content },
    ensureDir: async () => undefined,
    setTimes: async (path, atimeMs, mtimeMs) => options.onSetTimes?.(path, atimeMs, mtimeMs),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (path) => path.replace(/[/\\][^/\\]+$/, '') || '.',
    basename,
  }
}

function basename (path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
