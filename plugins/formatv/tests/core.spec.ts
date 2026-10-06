/**
 * formatv 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组逐条抄自上游 `packages/nodes/formatv/src/core.test.ts`（tag `noxide`，96 行）
 *   的四个用例，连它的 `createMemoryRuntime`（`files` Map + `dirs` Set）与自带的
 *   `join` / `dirname` / `basename` 假实现一起搬（`"/v/a.mp4"`、`"/v/b.mkv.nov"`、
 *   `"/v/[#hb]c.mp4"`、`"/v/formatv-hb-duplicates.json"`、`prefixedSize` 20
 *   全是上游手写的常量）。
 * - 第 2、3 组钉上游 `core.test.ts` **没有**覆盖的分支，判据的真源是上游 core.ts 的行号，
 *   写在每条注释里：`normalizeFormatvInput`（`:115-128`）、`scanFormatv.visit` 的递归边界
 *   （`:167-179`）、`classifyFile` 的三段次序（`:188-202`）、`basenameCompat`（`:376-379`）、
 *   `buildRenamePlan` 的 target_exists（`:236-243`）、`executeRenamePlan` 的动词与消息模板
 *   （`:275-278`）、`checkDuplicates` 的前缀兜底与报告缺省（`:296-327`）。
 * - 第 4 组钉 `src/report-defaults.ts`（上游 `cli.ts:103-128` 的那三条配置语义）。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * @module xaihi-formatv/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dangerFor, parametersFor, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { FormatvDirEntry, FormatvPathInfo, FormatvRuntime, FormatvScan } from '../src/core.ts'
import {
  DEFAULT_PREFIXES,
  VIDEO_EXTENSIONS,
  buildAddNovPlan,
  buildRemoveNovPlan,
  classifyFile,
  isNovVideoFile,
  isVideoFile,
  normalizeFormatvInput,
  runFormatv,
  scanFormatv,
  stripPrefixName,
} from '../src/core.ts'
import { applyReportDefaults, resolveReportPath } from '../src/report-defaults.ts'

describe('formatv core（上游 core.test.ts 逐条搬来）', () => {
  // 上游 `core.test.ts:5-10`。
  it('detects video and .nov video files', () => {
    expect(isVideoFile('a.mp4')).toBe(true)
    expect(isVideoFile('a.txt')).toBe(false)
    expect(isNovVideoFile('a.mp4.nov')).toBe(true)
    expect(isNovVideoFile('a.txt.nov')).toBe(false)

    // 阳性对照：`.nov` 自己不算视频（表里没有 `.nov`），而带 `.ts` 的那种"看起来像 TypeScript"
    // 的在表里（`:103`）——两件事都由那张 16 项的表决定，所以这里两头都钉。
    expect(isVideoFile('a.nov')).toBe(false)
    expect(isVideoFile('recording.ts')).toBe(true)
    expect(VIDEO_EXTENSIONS).toHaveLength(16)
  })

  // 上游 `core.test.ts:12-23`。
  it('scans normal, .nov, and prefixed files', async () => {
    const runtime = createMemoryRuntime({
      '/v/a.mp4': { size: 10 },
      '/v/b.mkv.nov': { size: 11 },
      '/v/[#hb]c.mp4': { size: 12 },
      '/v/readme.txt': { size: 1 },
    })
    const scan = await scanFormatv(['/v'], false, DEFAULT_PREFIXES, runtime)
    expect(scan.normalFiles).toEqual(['/v/a.mp4'])
    expect(scan.novFiles).toEqual(['/v/b.mkv.nov'])
    expect(scan.prefixedFiles.hb).toEqual(['/v/[#hb]c.mp4'])

    // 阳性对照：非视频既不进 normal 也不进前缀桶（`classifyFile` 的第二段 `:194` 直接 return），
    // 三个桶的总数必须还是 3。
    expect(scan.normalFiles.length + scan.novFiles.length + scan.prefixedFiles.hb.length).toBe(3)
  })

  // 上游 `core.test.ts:25-33`。
  it('adds and removes .nov suffixes', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 } })
    const add = await runFormatv({ action: 'add_nov', path: '/v' }, runtime)
    expect(add.data?.successCount).toBe(1)
    expect(runtime.files.has('/v/a.mp4.nov')).toBe(true)
    const remove = await runFormatv({ action: 'remove_nov', path: '/v' }, runtime)
    expect(remove.data?.successCount).toBe(1)
    expect(runtime.files.has('/v/a.mp4')).toBe(true)

    // 阳性对照：消息里的动词来自 `plan[0].action`（`:275`），两条动作说的是两句话。
    expect(add.message).toBe('Add .nov completed: 1 success, 0 skipped, 0 error(s).')
    const second = await runFormatv({ action: 'remove_nov', path: '/v' }, createMemoryRuntime({ '/v/a.mp4.nov': { size: 10 } }))
    expect(second.message).toBe('Remove .nov completed: 1 success, 0 skipped, 0 error(s).')
  })

  // 上游 `core.test.ts:35-45`。
  it('checks duplicates for prefixed files', async () => {
    const runtime = createMemoryRuntime({
      '/v/a.mp4': { size: 10 },
      '/v/[#hb]a.mp4': { size: 20 },
    })
    const result = await runFormatv({ action: 'check_duplicates', path: '/v', prefixName: 'hb' }, runtime)
    expect(result.data?.duplicateCount).toBe(1)
    expect(result.data?.duplicates).toEqual(['/v/a.mp4'])
    expect(result.data?.prefixedLarger[0]?.prefixedSize).toBe(20)
    expect(runtime.files.has('/v/formatv-hb-duplicates.json')).toBe(true)

    // 阳性对照：报告缺省名就是 `formatv-<prefix.name>-duplicates.json`（`:317`），
    // 而写进盘的是那份 JSON（内容里有 prefix / duplicates / prefixedLarger 三个键）。
    expect(result.data?.reportPath).toBe('/v/formatv-hb-duplicates.json')
    const written = JSON.parse(String(runtime.files.get('/v/formatv-hb-duplicates.json')?.content)) as { prefix: { name: string }; duplicates: string[]; prefixedLarger: unknown[] }
    expect(written.prefix.name).toBe('hb')
    expect(written.duplicates).toEqual(['/v/a.mp4'])
    expect(written.prefixedLarger).toHaveLength(1)
  })
})

describe('normalizeFormatvInput 与扫描边界（上游 core.test.ts 未覆盖）', () => {
  it('path 是 unshift 到 paths 最前，空值去重，阈值外的默认照 core.ts:118-127', () => {
    const normalized = normalizeFormatvInput({ path: ' "/b" ', paths: ['/a', '/b', ''] })
    // 手推：paths = ['/b','/a','/b',''] 经 uniqueClean ⇒ ['/b','/a']（`:116-117` + `:381-383`）。
    expect(normalized.paths).toEqual(['/b', '/a'])
    expect(normalized.path).toBe('/b')
    expect({
      action: normalized.action,
      recursive: normalized.recursive,
      prefixName: normalized.prefixName,
      dryRun: normalized.dryRun,
      reportPath: normalized.reportPath,
    }).toEqual({ action: 'scan', recursive: false, prefixName: 'hb', dryRun: false, reportPath: '' })

    // 阳性对照：`prefixes: []` 必须落回 DEFAULT_PREFIXES（`:124` 的 `?.length ? … : …`），
    // 否则前缀桶一个都不存在，check_duplicates 会静默说"0 个重复"。
    expect(normalizeFormatvInput({ prefixes: [] }).prefixes).toEqual(DEFAULT_PREFIXES)
    expect(normalizeFormatvInput({ prefix_name: 'x' }).prefixName).toBe('x')
  })

  it('不递归时只分类直属文件，递归时才进子目录；不存在的路径静默跳过', async () => {
    const runtime = createMemoryRuntime({
      '/v/a.mp4': { size: 10 },
      '/v/sub/d.mp4': { size: 11 },
    })
    const flat = await scanFormatv(['/v'], false, DEFAULT_PREFIXES, runtime)
    expect(flat.normalFiles).toEqual(['/v/a.mp4'])

    // 阳性对照：同一份夹具开递归就必须两条都有（顺序由 sortUnique 决定，字典序）。
    const deep = await scanFormatv(['/v'], true, DEFAULT_PREFIXES, runtime)
    expect(deep.normalFiles).toEqual(['/v/a.mp4', '/v/sub/d.mp4'])

    // `visit` 的第一条判据（`:168-169`）：不存在就 return —— 不报错、不进 errors。
    const missing = await scanFormatv(['/nope'], true, DEFAULT_PREFIXES, runtime)
    expect(missing.normalFiles).toEqual([])
  })

  it('classifyFile 的三段次序：.nov 先判，非视频丢弃，命中前缀进桶', () => {
    const scan: FormatvScan = { normalFiles: [], novFiles: [], prefixedFiles: { hb: [] } }
    classifyFile('/v/a.mp4', DEFAULT_PREFIXES, scan)
    classifyFile('/v/[#hb]b.mp4.nov', DEFAULT_PREFIXES, scan)
    classifyFile('/v/c.txt', DEFAULT_PREFIXES, scan)
    classifyFile('/v/[#hb]d.mp4', DEFAULT_PREFIXES, scan)
    // 手推：第二个名字带前缀但**以 .nov 结尾** ⇒ 进 novFiles 而不是前缀桶（`:190-193` 先 return）；
    // `c.txt` 不是视频 ⇒ 三个桶都不进（`:194`）。
    expect(scan).toEqual({
      normalFiles: ['/v/a.mp4'],
      novFiles: ['/v/[#hb]b.mp4.nov'],
      prefixedFiles: { hb: ['/v/[#hb]d.mp4'] },
    })
  })

  it('basenameCompat 先把反斜杠换成正斜杠，所以 Windows 形状的路径也分类得出来', () => {
    const scan: FormatvScan = { normalFiles: [], novFiles: [], prefixedFiles: { hb: [] } }
    classifyFile('C:\\v\\[#hb]a.mp4', DEFAULT_PREFIXES, scan)
    classifyFile('C:\\v\\b.mkv.nov', DEFAULT_PREFIXES, scan)
    // 阳性对照：用 `runtime.basename`（POSIX 语义）的话这两个名字整串都会带反斜杠，
    // 前缀匹配与 `.nov` 判断双双落空 ⇒ 两个桶都空。
    expect(scan.prefixedFiles.hb).toEqual(['C:\\v\\[#hb]a.mp4'])
    expect(scan.novFiles).toEqual(['C:\\v\\b.mkv.nov'])
    expect(scan.normalFiles).toEqual([])
  })

  it('isNovVideoFile 只认一次后缀，stripPrefixName 去前缀并吃掉左侧空白', () => {
    // 手推：`isNovVideoFile` 判 `lower.endsWith(".nov")` 后再拿 `name.slice(0,-4)` 复核
    // 那张 16 项的表（`:217-221`）。所以 `.nov.nov` 剥一次剩下 `a.mp4.nov`，
    // 它**不在**表里 ⇒ false：这条判据只放行"一层 .nov"，双层 .nov 不会被再剥一次。
    expect(isNovVideoFile('a.mp4.nov.nov')).toBe(false)
    expect(isNovVideoFile('a.mp4.NOV')).toBe(true)
    expect(isNovVideoFile('a.nov')).toBe(false)
    expect(stripPrefixName('[#hb]a.mp4', '[#hb]')).toBe('a.mp4')
    expect(stripPrefixName('[#hb]  a.mp4', '[#hb]')).toBe('a.mp4')
    // 阳性对照：不匹配前缀时原样返回（`:223-225` 的三元 else）。
    expect(stripPrefixName('other.mp4', '[#hb]')).toBe('other.mp4')
  })

  it('计划层：目标已存在就 skipped + target_exists，remove 只剥一次 .nov', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/a.mp4.nov': { size: 12 } })
    const add = await buildAddNovPlan({ normalFiles: ['/v/a.mp4'], novFiles: [], prefixedFiles: {} }, runtime)
    // 手推：`/v/a.mp4.nov` 已经在 files 里 ⇒ pathInfo.exists 为真 ⇒ skipped（`:241`）。
    expect(add).toEqual([{ sourcePath: '/v/a.mp4', targetPath: '/v/a.mp4.nov', action: 'add_nov', status: 'skipped', reason: 'target_exists' }])

    // 反向同一条判据：`/v/a.mp4.nov` 剥一次是 `/v/a.mp4`（在表里）⇒ skipped，
    // 而 `/v/b.MKV.NOV` 剥成 `/v/b.MKV`（不在表里）⇒ pending；大小写原样保留。
    const remove = await buildRemoveNovPlan({ normalFiles: [], novFiles: ['/v/a.mp4.nov', '/v/b.MKV.NOV'], prefixedFiles: {} }, runtime)
    expect(remove.map((item) => item.targetPath)).toEqual(['/v/a.mp4', '/v/b.MKV'])
    expect(remove.map((item) => item.status)).toEqual(['skipped', 'pending'])
    expect(remove.map((item) => item.reason ?? '')).toEqual(['target_exists', ''])

    // 阳性对照：`reason` 只在 skipped 那条上出现（`:242` 的条件展开），pending 那条不许带字段。
    expect(Object.keys(remove[1]!)).toEqual(['sourcePath', 'targetPath', 'action', 'status'])
  })

  it('dryRun 一次 rename 都不发，条目留在 pending', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 } })
    const result = await runFormatv({ action: 'add_nov', path: '/v', dryRun: true }, runtime)
    // 手推：`:258` 的 `if (!dryRun)` 整块跳过 ⇒ successCount 0、文件没动、消息说 planned。
    expect(result.data?.successCount).toBe(0)
    expect(result.data?.operations?.map((item) => item.status)).toEqual(['pending'])
    expect(runtime.files.has('/v/a.mp4.nov')).toBe(false)
    expect(result.message).toBe('Add .nov completed: 1 planned, 0 skipped, 0 error(s).')

    // 阳性对照：同一份夹具不写 dryRun 就必须真改名（内核默认 `dryRun ?? false`）。
    const live = createMemoryRuntime({ '/v/a.mp4': { size: 10 } })
    const executed = await runFormatv({ action: 'add_nov', path: '/v' }, live)
    expect(executed.data?.successCount).toBe(1)
    expect(live.files.has('/v/a.mp4.nov')).toBe(true)
  })

  it('空计划时动词落回 Add .nov（plan[0] 不存在，:275 的三元）', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runFormatv({ action: 'remove_nov', path: '/v' }, runtime)
    // 手推两处：动词看 `plan[0]?.action === "remove_nov"`，空计划 ⇒ 落到 else 分支
    // `Add .nov`（`:275`）；而计数那一格看 `dryRun`，这里没写 ⇒ 内核默认 false ⇒
    // 说的是 `success` 而不是 `planned`（`:278`）。两句都是上游的原话，别"修通顺"。
    expect(result.message).toBe('Add .nov completed: 0 success, 0 skipped, 0 error(s).')
    expect(result.success).toBe(true)
    expect(result.data?.operations).toEqual([])
  })
})

describe('check_duplicates 的前缀兜底与报告闸门（core.ts:290-329）', () => {
  it('原件不存在时不算重复；前缀小于原件时不进 prefixedLarger', async () => {
    const runtime = createMemoryRuntime({ '/v/[#hb]solo.mp4': { size: 30 }, '/v/[#hb]small.mp4': { size: 5 }, '/v/small.mp4': { size: 50 } })
    const result = await runFormatv({ action: 'check_duplicates', path: '/v', dryRun: true }, runtime)
    // 手推：`solo` 的原件 `/v/solo.mp4` 不在 files ⇒ `:306` 的 `continue`；
    // `small` 是重复但 5 > 50 不成立 ⇒ 不进 larger（`:308`）。
    expect(result.data?.duplicateCount).toBe(1)
    expect(result.data?.duplicates).toEqual(['/v/small.mp4'])
    expect(result.data?.prefixedLarger).toEqual([])
  })

  it('prefixName 认不出时落 prefixes[0]，再落 DEFAULT_PREFIXES[0]', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/[#hb]a.mp4': { size: 20 } })
    const result = await runFormatv({ action: 'check_duplicates', path: '/v', prefixName: 'no-such-prefix', dryRun: true }, runtime)
    // 手推：`:296` 的三级兜底，最后落到 `DEFAULT_PREFIXES[0]`（name = `hb`），
    // 所以桶键仍是 hb、报告缺省名仍是 formatv-hb-...。
    expect(result.data?.duplicateCount).toBe(1)
    expect(result.data?.duplicates).toEqual(['/v/a.mp4'])
  })

  it('dryRun 时不写报告，返回值里的 reportPath 也被置空', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/[#hb]a.mp4': { size: 20 } })
    const result = await runFormatv({ action: 'check_duplicates', path: '/v', dryRun: true }, runtime)
    // 手推：`:318` 的 `reportPath && !input.dryRun` 与 `:327` 的 `input.dryRun ? "" : reportPath`。
    expect(result.data?.reportPath).toBe('')
    expect(runtime.files.has('/v/formatv-hb-duplicates.json')).toBe(false)

    // 阳性对照：不写 dryRun 就必须真的落盘。
    const live = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/[#hb]a.mp4': { size: 20 } })
    const executed = await runFormatv({ action: 'check_duplicates', path: '/v' }, live)
    expect(executed.data?.reportPath).toBe('/v/formatv-hb-duplicates.json')
    expect(live.files.has('/v/formatv-hb-duplicates.json')).toBe(true)
  })

  it('显式 reportPath 优先于缺省命名', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/[#hb]a.mp4': { size: 20 } })
    const result = await runFormatv({ action: 'check_duplicates', path: '/v', reportPath: '/out/report.json' }, runtime)
    expect(result.data?.reportPath).toBe('/out/report.json')
    expect(runtime.files.has('/out/report.json')).toBe(true)
    expect(runtime.files.has('/v/formatv-hb-duplicates.json')).toBe(false)
  })

  it('renamePath 抛错时条目记成 error，success 拉成假，其他条目照样改', async () => {
    const runtime = createMemoryRuntime({ '/v/a.mp4': { size: 10 }, '/v/b.mp4': { size: 11 } })
    const original = runtime.renamePath
    runtime.renamePath = async (source: string, target: string) => {
      if (source === '/v/a.mp4') throw new Error('locked')
      await original(source, target)
    }
    const result = await runFormatv({ action: 'add_nov', path: '/v' }, runtime)
    // 手推：`errorCount` 是 status==='error' 的条目数（`:274`），
    // `errors` 是 `${sourcePath}: ${reason}`（`:285`），消息模板在 `:278`。
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.successCount).toBe(1)
    expect(result.data?.errors).toEqual(['/v/a.mp4: locked'])
    expect(result.message).toBe('Add .nov completed: 1 success, 0 skipped, 1 error(s).')
  })
})

describe('applyReportDefaults / resolveReportPath（上游 cli.ts:103-128）', () => {
  const defaults = { reportNameTemplate: 'formatv-{prefix}-duplicates.json', overwrite: true }
  const existing = (paths: string[]): Pick<FormatvRuntime, 'pathInfo'> => ({
    pathInfo: async (path: string): Promise<FormatvPathInfo> => {
      const isFile = paths.includes(path)
      return { path, exists: isFile, isFile, isDirectory: false, size: isFile ? 1 : 0 }
    },
  })

  it('模板里的 {prefix} 换成 prefixName，目录缺省取 paths[0]', () => {
    expect(resolveReportPath(defaults, 'hb', ['/v'])).toBe('/v/formatv-hb-duplicates.json')
    expect(resolveReportPath({ ...defaults, reportNameTemplate: 'dup-{prefix}.json' }, 'x265', ['/a', '/b'])).toBe('/a/dup-x265.json')
    // 阳性对照：`directory` 配了就必须用它，而不是第一个输入路径。
    expect(resolveReportPath({ ...defaults, directory: '/out' }, 'hb', ['/v'])).toBe('/out/formatv-hb-duplicates.json')
    // 一条路径都没有 ⇒ 空串（`:106` 的 `if (!dir) return ""`）。
    expect(resolveReportPath(defaults, 'hb', [])).toBe('')
  })

  it('只接管 check_duplicates，已有 reportPath 就不动', async () => {
    const scan = await applyReportDefaults({ action: 'add_nov', paths: ['/v'] }, defaults, existing([]))
    expect(scan).toEqual({ action: 'add_nov', paths: ['/v'] })
    const given = await applyReportDefaults({ action: 'check_duplicates', paths: ['/v'], reportPath: '/mine.json' }, defaults, existing([]))
    expect(given.reportPath).toBe('/mine.json')

    // 阳性对照：不加这两条闸门的话 `add_nov` 也会被抓去写报告路径（`prefixName` 兜底成 hb）。
    const taken = await applyReportDefaults({ action: 'check_duplicates', paths: ['/v'] }, defaults, existing([]))
    expect(taken.reportPath).toBe('/v/formatv-hb-duplicates.json')
  })

  it('overwrite 为假且报告已存在时转预演，并且不下发 reportPath', async () => {
    const runtime = existing(['/out/formatv-hb-duplicates.json'])
    const result = await applyReportDefaults(
      { action: 'check_duplicates', paths: ['/v'], dryRun: false },
      { ...defaults, directory: '/out', overwrite: false },
      runtime,
    )
    // 手推：`:119-125` —— 存在 ⇒ `dryRun = true` 且 **不设** reportPath（否则内核照旧写盘）。
    expect(result.dryRun).toBe(true)
    expect(result.reportPath).toBeUndefined()

    // 阳性对照：同一份夹具把 overwrite 打开就必须照旧下发路径、且不改 dryRun。
    const live = await applyReportDefaults(
      { action: 'check_duplicates', paths: ['/v'], dryRun: false },
      { ...defaults, directory: '/out', overwrite: true },
      runtime,
    )
    expect(live.reportPath).toBe('/out/formatv-hb-duplicates.json')
    expect(live.dryRun).toBe(false)
  })
})

describe('formatv 的接线形状：参数表与危险闸门', () => {
  const validated = validateNodeDefinition(ownNode())
  if (!validated.ok) throw new Error(validated.errors.join('; '))
  const definition = validated.value

  it('动作选择器不进参数表，其余五个字段四个动作都可见', () => {
    const keys = Object.keys(parametersFor(definition, 'add_nov'))
    // 手推自 `package.json#xaihi.node`：6 个字段里 `action` 是 isActionSelector，
    // 上游那份定义**没有一条按动作切换的 visible**（全是 always）。
    expect(keys).toEqual(['pathsText', 'recursive', 'prefixName', 'reportPath', 'dryRun'])
    expect(Object.keys(parametersFor(definition, 'check_duplicates'))).toEqual(keys)
    // 阳性对照：选择器自己漏进参数表就说明 isActionSelector 没被 SDK 认。
    expect(keys).not.toContain('action')
  })

  it('danger.all 只在两条改名动作 + 非预演时亮', () => {
    expect(dangerFor(definition, undefined, 'scan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(definition, undefined, 'check_duplicates', { dryRun: false })).toBeUndefined()
    expect(dangerFor(definition, undefined, 'add_nov', { dryRun: true })).toBeUndefined()
    expect(dangerFor(definition, undefined, 'add_nov', { dryRun: false })?.zh).toContain('formatv')
    expect(dangerFor(definition, undefined, 'remove_nov', {})).toBeDefined()
    // 阳性对照：scan 就算把 dryRun 关掉也永远不许要批准（上游那条 allowed 只有两个动作）。
    expect(dangerFor(definition, undefined, 'scan', {})).toBeUndefined()
  })
})

function ownNode(): unknown {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  return (JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }).xaihi?.node
}

/**
 * 上游 `core.test.ts:47-95` 那份内存 runtime 逐字搬来（含它自己的 `join` / `dirname` /
 * `basename` 假实现）：`files` 是一张 `path → {size, content?}` 的表，目录由文件路径的
 * `dirname` 反推出来，`writeText` 会把内容一起存下以便读回。
 */
function createMemoryRuntime(seed: Record<string, { size: number }>): FormatvRuntime & { files: Map<string, { size: number; content?: string }> } {
  const files = new Map<string, { size: number; content?: string }>(Object.entries(seed))
  const dirs = new Set<string>(['/'])
  for (const path of files.keys()) dirs.add(dirname(path))

  return {
    files,
    async pathInfo(path: string): Promise<FormatvPathInfo> {
      const file = files.get(path)
      return { path, exists: Boolean(file) || dirs.has(path), isFile: Boolean(file), isDirectory: dirs.has(path), size: file?.size ?? 0 }
    },
    async listDir(path: string): Promise<FormatvDirEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`
      const names = new Set<string>()
      for (const file of files.keys()) if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split('/')[0])
      return [...names].map((name) => {
        const child = join(path, name)
        return { name, path: child, isFile: files.has(child), isDirectory: dirs.has(child) }
      })
    },
    async renamePath(source: string, target: string): Promise<void> {
      const file = files.get(source)
      if (!file) throw new Error('missing')
      files.delete(source)
      files.set(target, file)
      dirs.add(dirname(target))
    },
    async writeText(path: string, content: string): Promise<void> {
      files.set(path, { size: content.length, content })
      dirs.add(dirname(path))
    },
    join,
    dirname,
    basename,
  }
}

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
