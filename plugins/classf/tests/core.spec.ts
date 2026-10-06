/**
 * classf 内核的保真度判据：**期望值逐条手抄自上游** `<Xiranite>` tag `noxide` 的
 * `packages/nodes/classf/src/core.test.ts`（245 行，13 条用例全在），以及
 * `packages/nodes/classf/src/blacklist.test.ts`（4 条，其中繁简那一半见下面第 14 条的说明）。
 * 假 runtime 也是上游那份 `fakeRuntime()`（目录树 `/archives` + `/archives/nested`、
 * 一个 `[Artist] A.zip`、一个 `notes.txt`、MigrateF 的 `plan`→`pending` / 其余→`success` 折法），
 * 连它 `join` 用 `parts.join("/")` 而不是 `node:path` 这件事都原样——那三条 targetPath 断言
 * 依赖的正就是它。
 *
 * 这里测的是**内核**（纯逻辑 + 注入缝），不是接线：`src/platform.ts` 的真实缝今天会抛
 * （兄弟内核没有缝，缺口 G10），所以下面第 15、16 两条钉的是"抛的是哪句话"，
 * 而 1-13 条钉的是"缝给了实现之后内核必须算出什么"。两类都是判据，不许互相顶替。
 *
 * @module xaihi-classf/tests/core
 */

import { describe, expect, test } from 'vitest'
import type { ClassfDirEntry, ClassfRuntime } from '../src/core.ts'
import type { CrashuInput } from '../src/crashu-core.ts'
import type { MigratefInput } from '../src/migratef-core.ts'
import type { SameaInput } from '../src/samea-core.ts'
import { runClassf } from '../src/core.ts'
import {
  CLASSF_BLACKLIST_FOLDING,
  extractSameaArtistKeywords,
  isClassfBlacklistedArtist,
  mergeClassfBlacklistKeywords,
  normalizeClassfBlacklistText,
  parseSameaArtistLabel,
  splitSameaArtistAndCircleKeywords,
  stripOuterKeywordBrackets,
} from '../src/blacklist.ts'
import { CLIPBOARD_UNWIRED, SIBLING_KERNEL_UNWIRED, createNodeClassfRuntime } from '../src/platform.ts'

describe('classf pipeline', () => {
  // ↓ 1-13 条：上游 core.test.ts `:9-228`，逐条同断言。
  test('keeps a matching existing artist in already before considering the blacklist', async () => {
    const result = await runClassf({
      action: 'plan',
      paths: ['/archives'],
      crashuSourcePaths: ['/library'],
      blacklistKeywords: ['[Artist]'],
    }, fakeRuntime([]))

    expect(result.success).toBe(true)
    expect(result.data?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: '[Artist] A.zip', stage: 'already' }),
    ]))
    expect(result.data?.delCount).toBe(0)
  })

  test('Del-only mode transfers only blacklisted artists, while already and wait stay untouched', async () => {
    const calls: Call[] = []
    const runtime = fakeRuntime(calls)
    const originalRunSamea = runtime.runSamea
    runtime.listDir = async (path) => path === '/archives'
      ? [{ name: '[Artist] A.zip', path: '/archives/[Artist] A.zip', isFile: true, isDirectory: false }, { name: 'nested', path: '/archives/nested', isFile: false, isDirectory: true }]
      : path === '/archives/nested'
        ? [{ name: 'blacklisted.zip', path: '/archives/nested/blacklisted.zip', isFile: true, isDirectory: false }, { name: 'wait.zip', path: '/archives/nested/wait.zip', isFile: true, isDirectory: false }]
        : []
    runtime.runSamea = async (input, onEvent) => {
      const result = await originalRunSamea(input, onEvent)
      if (!result.data) return result
      const artist = result.data.items[0]!
      const group = result.data.groups[0]!
      return {
        ...result,
        data: {
          ...result.data,
          items: [...result.data.items, { ...artist, sourcePath: '/archives/nested/blacklisted.zip', sourceName: 'blacklisted.zip', targetPath: '/archives/nested/[Blacklisted Artist]/blacklisted.zip', artistKey: 'blacklisted-artist', artistName: '[Blacklisted Artist]' }],
          groups: [...result.data.groups, { ...group, key: 'blacklisted-artist', name: '[Blacklisted Artist]', targetDir: '/archives/nested/[Blacklisted Artist]' }],
        },
      }
    }

    const result = await runClassf({ action: 'classify', classifyMode: 'del', placementMode: 'local', blacklistKeywords: ['[Artist]', '[Blacklisted Artist]'], dryRun: false, sameaGroupEnabled: true }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.items).toEqual([
      expect.objectContaining({ sourcePath: '/archives/nested/blacklisted.zip', stage: 'del', status: 'moved', targetPath: '/archives/nested/del/blacklisted.zip' }),
    ])
    expect(calls.filter((call) => call.stage === 'migratef').map((call) => call.input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'plan', sourcePaths: ['/archives/nested/blacklisted.zip'], targetPath: '/archives/nested/del' }),
      expect.objectContaining({ action: 'move', sourcePaths: ['/archives/nested/blacklisted.zip'], targetPath: '/archives/nested/del' }),
    ]))
    // `classifyMode: "del"` 的 legacy 折法是 `{already:false, wait:false, del:true}`
    // （`core.ts:343-347`），所以 `sameaGroupEnabled: true` 只让 del 那一格分组跑起来：
    // 上游这条断言读的是"总共只跑了 1 次 SameA"，也就是说**分组那一趟没跑**——
    // `isSameaGroupEnabled("del")` 需要 `sameaGroupDelEnabled`，而它默认 false（`:80`）。
    expect(calls.filter((call) => call.stage === 'samea')).toHaveLength(1)
  })

  test('places every file in already or wait beside its current directory', async () => {
    const calls: Call[] = []
    const result = await runClassf({ action: 'plan', classifyMode: 'auto', placementMode: 'local' }, fakeRuntime(calls))

    expect(result.success).toBe(true)
    expect(result.data?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePath: '/archives/[Artist] A.zip', targetPath: '/archives/already/[Artist] A.zip', stage: 'already' }),
      expect.objectContaining({ sourcePath: '/archives/nested/notes.txt', targetPath: '/archives/nested/wait/notes.txt', stage: 'wait' }),
    ]))
    expect(calls.filter((call) => call.stage === 'migratef').map((call) => call.input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePaths: ['/archives/[Artist] A.zip'], targetPath: '/archives/already', mode: 'direct' }),
      expect.objectContaining({ sourcePaths: ['/archives/nested/notes.txt'], targetPath: '/archives/nested/wait', mode: 'direct' }),
    ]))
  })

  test('preserves the complete relative path under a selected target root', async () => {
    const result = await runClassf({ action: 'plan', classifyMode: 'auto', placementMode: 'root', targetDir: '/classified' }, fakeRuntime([]))

    expect(result.success).toBe(true)
    expect(result.data?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetPath: '/classified/already/[Artist] A.zip', targetRelative: 'already/[Artist] A.zip' }),
      expect.objectContaining({ targetPath: '/classified/wait/nested/notes.txt', targetRelative: 'wait/nested/notes.txt' }),
    ]))
  })

  test('keeps each source root name when several roots are sent to one target', async () => {
    const runtime = fakeRuntime([])
    runtime.runSamea = async () => ({ success: true, message: 'samea', data: { action: 'plan', centralize: false, minOccurrences: 1, items: [], groups: [], scannedCount: 0, detectedCount: 0, readyCount: 0, movedCount: 0, ignoredCount: 0, skippedCount: 0, conflictCount: 0, errorCount: 0, errors: [] } })
    runtime.pathInfo = async (path) => ({ path, exists: true, isFile: path.endsWith('.txt'), isDirectory: !path.endsWith('.txt') })
    runtime.listDir = async (path) => path === '/one' ? [{ name: 'sub', path: '/one/sub', isFile: false, isDirectory: true }] : path === '/one/sub' ? [{ name: 'same.txt', path: '/one/sub/same.txt', isFile: true, isDirectory: false }] : path === '/two' ? [{ name: 'sub', path: '/two/sub', isFile: false, isDirectory: true }] : path === '/two/sub' ? [{ name: 'same.txt', path: '/two/sub/same.txt', isFile: true, isDirectory: false }] : []

    const result = await runClassf({ action: 'plan', paths: ['/one', '/two'], placementMode: 'root', targetDir: '/classified' }, runtime)
    expect(result.data?.items.map((item) => item.targetPath)).toEqual([
      '/classified/wait/one/sub/same.txt',
      '/classified/wait/two/sub/same.txt',
    ])
  })

  test('requires a target directory in root placement mode', async () => {
    const result = await runClassf({ action: 'plan', placementMode: 'root' }, fakeRuntime([]))
    expect(result.success).toBe(false)
    expect(result.message).toContain('target directory')
  })

  test('does not scan files already inside already or wait', async () => {
    const runtime = fakeRuntime([])
    runtime.listDir = async (path) => path === '/archives' ? [
      { name: 'already', path: '/archives/already', isFile: false, isDirectory: true },
      { name: 'wait', path: '/archives/wait', isFile: false, isDirectory: true },
      { name: 'fresh.txt', path: '/archives/fresh.txt', isFile: true, isDirectory: false },
    ] : []
    runtime.pathInfo = async (path) => ({ path, exists: true, isFile: path.endsWith('.txt'), isDirectory: !path.endsWith('.txt') })
    const result = await runClassf({ action: 'plan', placementMode: 'local' }, runtime)
    expect(result.data?.items.map((item) => item.sourcePath)).toEqual(['/archives/fresh.txt'])
  })

  test('publishes the complete plan before the first live transfer', async () => {
    const calls: Call[] = []
    const timeline: string[] = []
    const runtime = fakeRuntime(calls, (stage, input) => timeline.push(`${stage}:${'action' in input ? input.action : 'scan'}`))
    const result = await runClassf({ action: 'classify', classifyMode: 'auto', placementMode: 'local', dryRun: false }, runtime, (event) => {
      if ((event.data as { kind?: string } | undefined)?.kind === 'classf-plan') timeline.push('event:plan')
    })

    expect(result.success).toBe(true)
    expect(timeline.indexOf('event:plan')).toBeLessThan(timeline.indexOf('migratef:move'))
    expect(calls.filter((call) => call.stage === 'samea')).toHaveLength(1)
    expect(result.data?.items.every((item) => item.status === 'moved')).toBe(true)
  })

  test('runs optional SameA artist grouping after already/wait transfers', async () => {
    const calls: Call[] = []
    const runtime = fakeRuntime(calls)
    const originalPathInfo = runtime.pathInfo
    runtime.pathInfo = async (path) => path.endsWith('/already') || path.endsWith('/wait')
      ? { path, exists: true, isFile: false, isDirectory: true }
      : originalPathInfo(path)
    const result = await runClassf({ action: 'classify', classifyMode: 'auto', placementMode: 'local', dryRun: false, sameaGroupEnabled: true, sameaGroupMinOccurrences: 2 }, runtime)

    expect(result.success).toBe(true)
    const sameaCalls = calls.filter((call) => call.stage === 'samea').map((call) => call.input as SameaInput)
    expect(sameaCalls).toHaveLength(3)
    expect(sameaCalls.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'classify', paths: ['/archives/already'], minOccurrences: 2, dryRun: false }),
      expect.objectContaining({ action: 'classify', paths: ['/archives/nested/wait'], minOccurrences: 2, dryRun: false }),
    ]))
  })

  test('honors independent queue gates without downgrading an existing artist to del', async () => {
    const calls: Call[] = []
    const runtime = fakeRuntime(calls)
    const originalRunSamea = runtime.runSamea
    runtime.listDir = async (path) => path === '/archives' ? [
      { name: '[Artist] A.zip', path: '/archives/[Artist] A.zip', isFile: true, isDirectory: false },
      { name: '[Blocked] B.zip', path: '/archives/[Blocked] B.zip', isFile: true, isDirectory: false },
      { name: 'notes.txt', path: '/archives/notes.txt', isFile: true, isDirectory: false },
    ] : []
    runtime.runSamea = async (input, onEvent) => {
      const result = await originalRunSamea(input, onEvent)
      if (input.action !== 'plan' || !result.data) return result
      const artist = result.data.items[0]!
      const group = result.data.groups[0]!
      return {
        ...result,
        data: {
          ...result.data,
          items: [...result.data.items, { ...artist, sourcePath: '/archives/[Blocked] B.zip', sourceName: '[Blocked] B.zip', targetPath: '/archives/[Blocked]/[Blocked] B.zip', artistKey: 'blocked', artistName: '[Blocked]' }],
          groups: [...result.data.groups, { ...group, key: 'blocked', name: '[Blocked]', targetDir: '/archives/[Blocked]' }],
        },
      }
    }

    const result = await runClassf({ action: 'plan', alreadyEnabled: false, waitEnabled: true, delEnabled: true, blacklistKeywords: ['[Blocked]'] }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePath: '/archives/[Blocked] B.zip', stage: 'del' }),
      expect.objectContaining({ sourcePath: '/archives/notes.txt', stage: 'wait' }),
    ]))
    expect(result.data?.items.find((item) => item.sourcePath === '/archives/[Artist] A.zip')).toBeUndefined()
  })

  test('runs SameA grouping only for enabled output queues', async () => {
    const calls: Call[] = []
    const runtime = fakeRuntime(calls)
    const originalPathInfo = runtime.pathInfo
    runtime.pathInfo = async (path) => path.endsWith('/already') || path.endsWith('/wait')
      ? { path, exists: true, isFile: false, isDirectory: true }
      : originalPathInfo(path)

    const result = await runClassf({ action: 'classify', placementMode: 'local', dryRun: false, sameaGroupAlreadyEnabled: false, sameaGroupWaitEnabled: true, sameaGroupDelEnabled: false }, runtime)

    expect(result.success).toBe(true)
    const postTransfer = calls.filter((call) => call.stage === 'samea').slice(1).map((call) => call.input as SameaInput)
    expect(postTransfer).toEqual([
      expect.objectContaining({ action: 'classify', paths: ['/archives/nested/wait'], dryRun: false }),
    ])
  })

  test('groups pre-existing already/wait directories without reclassifying their contents', async () => {
    const calls: Call[] = []
    const runtime = fakeRuntime(calls)
    runtime.pathInfo = async (path) => ({ path, exists: ['/archives', '/archives/already', '/archives/wait', '/archives/already/[Artist]'].includes(path), isFile: false, isDirectory: ['/archives', '/archives/already', '/archives/wait', '/archives/already/[Artist]'].includes(path) })
    runtime.listDir = async (path) => path === '/archives' ? [
      { name: 'already', path: '/archives/already', isFile: false, isDirectory: true },
      { name: 'wait', path: '/archives/wait', isFile: false, isDirectory: true },
    ] : path === '/archives/already' ? [
      { name: '[Artist]', path: '/archives/already/[Artist]', isFile: false, isDirectory: true },
    ] : []

    const result = await runClassf({ action: 'classify', paths: ['/archives'], placementMode: 'local', dryRun: false, sameaGroupEnabled: true }, runtime)

    expect(result.success).toBe(true)
    expect(calls.filter((call) => call.stage === 'migratef')).toHaveLength(0)
    const postCalls = calls.filter((call) => call.stage === 'samea').slice(1).map((call) => call.input as SameaInput)
    expect(postCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ paths: ['/archives/already'], action: 'classify', skipGroupedDirectories: true }),
      expect.objectContaining({ paths: ['/archives/wait'], action: 'classify', skipGroupedDirectories: true }),
    ]))
  })

  test('fails when the default clipboard has no archive roots', async () => {
    const runtime = fakeRuntime([])
    runtime.readClipboardPaths = async () => []
    const result = await runClassf({ action: 'plan' }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toContain('clipboard')
  })

  // ↓ 14 条：上游 blacklist.test.ts `:5-28` 的三条不依赖词典的用例，逐条同断言。
  test('blacklist label helpers: SameA parsing, bracket stripping, keyword merging', async () => {
    expect(parseSameaArtistLabel('[きゅうりのふかづめ (しぐれに)]')).toEqual({
      label: '[きゅうりのふかづめ (しぐれに)]',
      circle: 'きゅうりのふかづめ',
      artist: 'しぐれに',
    })
    expect(splitSameaArtistAndCircleKeywords(['[きゅうりのふかづめ (しぐれに)]', '[OgoG]'])).toEqual([
      '[きゅうりのふかづめ]',
      '[しぐれに]',
      '[OgoG]',
    ])
    expect(isClassfBlacklistedArtist('[きゅうりのふかづめ (しぐれに)]', ['[しぐれに]'])).toBe(true)
    expect(isClassfBlacklistedArtist('[きゅうりのふかづめ (しぐれに)]', ['[きゅうりのふかづめ]'])).toBe(true)

    expect(stripOuterKeywordBrackets('[きゅうりのふかづめ (しぐれに)]')).toBe('きゅうりのふかづめ (しぐれに)')
    expect(stripOuterKeywordBrackets('((OgoG))')).toBe('OgoG')

    expect(extractSameaArtistKeywords(['[Circle (Artist)] book.cbz', 'plain name'])).toEqual(['[Circle (Artist)]', '[plain name]'])
    expect(mergeClassfBlacklistKeywords(['[OgoG]'], ['[Artist]', '[OgoG]'])).toEqual(['[OgoG]', '[Artist]'])
  })

  // ↓ 15 条：上游 blacklist.test.ts `:30-35` 那一条**被拆成两半**。
  //   不依赖繁简词典的那半（大小写、括号形态、`includes` 包含匹配）原样成立；
  //   依赖 `opencc-js` 的那半（简体黑名单命中繁体标签，反之亦然）**今天不成立**，
  //   这里钉的是"现在到底匹配什么"，不是"上游曾经匹配什么"。理由与恢复条件在
  //   `src/blacklist.ts` 文件头第 2 条与 `CLASSF_BLACKLIST_FOLDING`。
  test('blacklist matching is case-insensitive but no longer folds traditional into simplified', async () => {
    expect(CLASSF_BLACKLIST_FOLDING.converter).toBe('none')
    // 原样成立的两半（上游 `:34`）。
    expect(normalizeClassfBlacklistText('[OgoG]')).toBe('[ogog]')
    expect(isClassfBlacklistedArtist('[黑名單]', ['[黑名单]'])).toBe(false)
    // 上游 `normalizeClassfBlacklistText("繁體中文與黑名單")` 回的是 "繁体中文与黑名单"
    // （opencc 的折字），现在只有小写化：字面原样留着。
    expect(normalizeClassfBlacklistText('繁體中文與黑名單')).toBe('繁體中文與黑名單')
    // 阳性对照：同形状的字面（繁对繁）必须命中——这把尺查的是"没有整体失灵"，
    // 缺的只有跨繁简那一格。
    expect(isClassfBlacklistedArtist('[繁體黑名單畫師]', ['[繁體黑名單畫師]'])).toBe(true)
    expect(isClassfBlacklistedArtist('[繁體黑名單畫師]', ['黑名單畫師'])).toBe(true)
    expect(isClassfBlacklistedArtist('[繁體黑名單畫師]', ['黑名单画师'])).toBe(false)
  })

  // ↓ 16-18 条：本包真实缝的判据（`src/platform.ts`）。
  test('the real platform refuses the three sibling kernels with one named message', async () => {
    const runtime = createNodeClassfRuntime()
    await expect(runtime.runSamea({ action: 'plan' }, () => undefined)).rejects.toThrow(SIBLING_KERNEL_UNWIRED)
    await expect(runtime.runCrashu({ action: 'scan' }, () => undefined)).rejects.toThrow(SIBLING_KERNEL_UNWIRED)
    await expect(runtime.runMigratef({ action: 'plan' }, () => undefined)).rejects.toThrow(SIBLING_KERNEL_UNWIRED)
  })

  test('the real platform refuses the clipboard, and naming paths does not reach that branch', async () => {
    const runtime = createNodeClassfRuntime()
    await expect(runtime.readClipboardPaths()).rejects.toThrow(CLIPBOARD_UNWIRED)
    // 内核只在 `paths` 为空时读剪贴板（`core.ts:87`）：给了路径就该走兄弟内核那句。
    const withPaths = await runClassf({ action: 'plan', paths: ['/archives'] }, runtime)
    expect(withPaths.success).toBe(false)
    expect(withPaths.message).toBe(SIBLING_KERNEL_UNWIRED)
    // 阳性对照：没给路径时说的是**另一句**（缺的是剪贴板缝，不是兄弟内核缝）。
    const withoutPaths = await runClassf({ action: 'plan', paths: [] }, runtime)
    expect(withoutPaths.success).toBe(false)
    expect(withoutPaths.message).toBe(CLIPBOARD_UNWIRED)
    expect(withoutPaths.message).not.toBe(SIBLING_KERNEL_UNWIRED)
  })

  test('the refusal is reported as counts too, so the view never reads as "0 items, all good"', async () => {
    const result = await runClassf({ action: 'classify', paths: ['/archives'], dryRun: false }, createNodeClassfRuntime())
    expect(result.success).toBe(false)
    // `failure()` 那条兜底（`core.ts:357`）会把这一条记成 stage `samea` 的一条 error 条目。
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]?.stage).toBe('samea')
    expect(result.data?.items[0]?.status).toBe('error')
    expect(result.data?.readyCount).toBe(0)
  })
})

type Call = { stage: string; input: SameaInput | CrashuInput | MigratefInput }

/** 上游 `core.test.ts:233-245` 那份 `fakeRuntime`，逐字（只把 `.js` 说明符换成 `.ts`）。 */
function fakeRuntime(calls: Call[], onCall?: (stage: string, input: SameaInput | CrashuInput | MigratefInput) => void): ClassfRuntime {
  const directories = new Set(['/archives', '/archives/nested'])
  const files = new Set(['/archives/[Artist] A.zip', '/archives/nested/notes.txt'])
  return {
    runSamea: async (input) => { calls.push({ stage: 'samea', input }); onCall?.('samea', input); return { success: true, message: 'samea', data: { action: input.action ?? 'plan', centralize: false, minOccurrences: 1, items: [{ rootPath: '/archives', sourcePath: '/archives/[Artist] A.zip', targetPath: '/archives/[Artist]/[Artist] A.zip', sourceName: '[Artist] A.zip', artistKey: 'artist', artistName: '[Artist]', status: 'ready' }], groups: [{ key: 'artist', name: '[Artist]', targetDir: '/archives/[Artist]', count: 1, status: 'ready' }], scannedCount: 1, detectedCount: 1, readyCount: 1, movedCount: 0, ignoredCount: 0, skippedCount: 0, conflictCount: 0, errorCount: 0, errors: [] } } },
    runCrashu: async (input) => { calls.push({ stage: 'crashu', input }); onCall?.('crashu', input); return { success: true, message: 'crashu', data: { sourceCount: 1, targetCount: 1, totalScanned: 1, similarFound: 1, movedCount: 0, skippedCount: 0, errorCount: 0, pairsFile: '', similarFolders: [{ name: 'Artist', path: '/library/Artist', target: '[Artist]', similarity: 1, matchDim: 'exact', matchSrc: 'artist', matchTgt: 'artist' }], plan: [], errors: [] } } },
    runMigratef: async (input) => { calls.push({ stage: 'migratef', input }); onCall?.('migratef', input); const action = input.action === 'copy' ? 'copy' as const : 'move' as const; const status = input.action === 'plan' || input.dryRun ? 'pending' as const : 'success' as const; const plan = (input.sourcePaths ?? []).map((sourcePath) => ({ sourcePath, targetPath: `${input.targetPath}/${sourcePath.split('/').at(-1)}`, action, kind: 'file' as const, status })); return { success: true, message: 'migratef', data: { plan, history: [], migratedCount: status === 'success' ? plan.length : 0, skippedCount: 0, errorCount: 0, totalCount: plan.length, operationId: '', successCount: status === 'success' ? plan.length : 0, failedCount: 0, errors: [] } } },
    readClipboardPaths: async () => ['/archives'],
    pathInfo: async (path) => ({ path, exists: directories.has(path) || files.has(path), isFile: files.has(path), isDirectory: directories.has(path) }),
    listDir: async (path) => path === '/archives' ? [{ name: '[Artist] A.zip', path: '/archives/[Artist] A.zip', isFile: true, isDirectory: false }, { name: 'nested', path: '/archives/nested', isFile: false, isDirectory: true }] satisfies ClassfDirEntry[] : path === '/archives/nested' ? [{ name: 'notes.txt', path: '/archives/nested/notes.txt', isFile: true, isDirectory: false }] : [],
    join: (...parts) => parts.join('/').replace(/\/{2,}/g, '/'), dirname: (path) => path.replace(/\/[^/]+$/, '') || '/', basename: (path) => path.split('/').at(-1) ?? path, relative: (from, to) => to.startsWith(`${from}/`) ? to.slice(from.length + 1) : to,
  }
}
