/**
 * samea 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组抄自上游 `packages/nodes/samea/src/core.test.ts`（tag `noxide`）同名用例，
 *   连它那份 `fakeRuntime` / `baseInput` / `file()` 形状一起搬
 *   （`{ key: 'circle\u0000artist a', label: '[Circle (Artist A)]' }`、
 *   `/archive/[Circle (Artist A)]/[Circle (Artist A)] one.zip`、两条 moves 的顺序，
 *   全是上游手写的常量）。
 * - 第 2 组钉 `platform.ts` 的枚举语义（符号链接、非目录根、路径黑名单、dryRun 不动文件），
 *   期望值照 fixture 的构造手写。
 * - 第 3 组钉 `package.json#xaihi.node`：词表逐字抄自
 *   `<Xiranite>/node-definitions/samea.json`。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-samea/tests/core
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bindInputs, dangerFor, parametersFor, transformValue, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { SameaDirEntry, SameaRuntime } from '../src/core.ts'
import { buildSameaPlan, extractArtist, normalizeSameaInput, runSamea } from '../src/core.ts'
import { createNodeSameaRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('samea core（上游用例逐条搬来）', () => {
  it('从方括号里抽出社团与画师，键是小写的 "社团\\u0000画师"', () => {
    expect(extractArtist('[Circle (Artist A)] book.zip', { artistBlacklist: [], regexBlacklist: [] }))
      .toEqual({ key: 'circle\u0000artist a', label: '[Circle (Artist A)]' })
    // 阳性对照：黑名单命中时不许返回那个键。
    expect(extractArtist('[Circle (Artist A)] book.zip', { artistBlacklist: ['artist a'], regexBlacklist: [] })).toBeUndefined()
  })

  it('规划进画师目录，不碰认不出画师的归档', async () => {
    const runtime = fakeRuntime({
      '/archive': [
        file('[Circle (Artist A)] one.zip'),
        file('[Circle (Artist A)] two.rar'),
        file('[Various] collection.7z'),
      ],
    })
    const result = await buildSameaPlan({ ...baseInput, paths: ['/archive'] }, runtime)
    expect(result.readyCount).toBe(2)
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: '[Circle (Artist A)] one.zip', targetPath: '/archive/[Circle (Artist A)]/[Circle (Artist A)] one.zip', status: 'ready' }),
      expect.objectContaining({ sourceName: '[Various] collection.7z', status: 'ignored', reason: 'artist_not_detected' }),
    ]))
  })

  it('关掉预演之后才真搬，而且只搬 ready 的那两条', async () => {
    const moves: Array<[string, string]> = []
    const runtime = fakeRuntime({ '/archive': [file('[Artist] one.zip'), file('[Artist] two.zip')] }, moves)
    const result = await runSamea({ action: 'classify', paths: ['/archive'], dryRun: false }, runtime)
    expect(result.success).toBe(true)
    expect(moves).toEqual([
      ['/archive/[Artist] one.zip', '/archive/[Artist]/[Artist] one.zip'],
      ['/archive/[Artist] two.zip', '/archive/[Artist]/[Artist] two.zip'],
    ])

    // 阳性对照：dryRun 是默认值时一条都不许动。
    const untouched: Array<[string, string]> = []
    const dryRuntime = fakeRuntime({ '/archive': [file('[Artist] one.zip'), file('[Artist] two.zip')] }, untouched)
    await runSamea({ action: 'classify', paths: ['/archive'] }, dryRuntime)
    expect(untouched).toEqual([])
  })

  it('已存在的 [画师] 分组目录不再重扫（skipGroupedDirectories）', async () => {
    const groupedArchive: SameaDirEntry = { name: '[Artist] old.zip', path: '/archive/[Artist]/[Artist] old.zip', isFile: true, isDirectory: false }
    const runtime = fakeRuntime({
      '/archive': [
        { name: '[Artist]', path: '/archive/[Artist]', isFile: false, isDirectory: true },
        file('[New Artist] new.zip'),
      ],
      '/archive/[Artist]': [groupedArchive],
    })
    const result = await buildSameaPlan({ ...baseInput, paths: ['/archive'], skipGroupedDirectories: true }, runtime)

    expect(result.scannedCount).toBe(1)
    expect(result.items.map((item) => item.sourcePath)).toEqual(['/archive/[New Artist] new.zip'])

    // 阳性对照：判据关掉时那个旧归档会被重新算进计划。
    const rescan = await buildSameaPlan({ ...baseInput, paths: ['/archive'] }, runtime)
    expect(rescan.items.map((item) => item.sourcePath)).toEqual(['/archive/[Artist]/[Artist] old.zip', '/archive/[New Artist] new.zip'])
  })

  it('includeDirectories：解出来的工作目录本身也算一件作品', async () => {
    const moves: Array<[string, string]> = []
    const runtime = fakeRuntime({
      '/archive': [
        { name: '[Artist] first work', path: '/archive/[Artist] first work', isFile: false, isDirectory: true },
        { name: '[Artist] second work', path: '/archive/[Artist] second work', isFile: false, isDirectory: true },
      ],
    }, moves)
    const result = await runSamea({ action: 'classify', paths: ['/archive'], includeDirectories: true, minOccurrences: 2, dryRun: false }, runtime)

    expect(result.success).toBe(true)
    expect(moves).toEqual([
      ['/archive/[Artist] first work', '/archive/[Artist]/[Artist] first work'],
      ['/archive/[Artist] second work', '/archive/[Artist]/[Artist] second work'],
    ])
  })

  it('normalizeSameaInput：minOccurrences 夹在 1..100，空名单落回内核默认（只有一份）', () => {
    expect(normalizeSameaInput({ minOccurrences: 500 }).minOccurrences).toBe(100)
    expect(normalizeSameaInput({ minOccurrences: 0 }).minOccurrences).toBe(1)
    // 内核的 `clampInt` 收的是 unknown（值来自 JSON 配置），类型上声明成 number，
    // 而这条要钉的正是字符串也能夹回默认，所以显式走非类型路径。
    expect(normalizeSameaInput({ minOccurrences: 'abc' as unknown as number }).minOccurrences).toBe(1)
    const normalized = normalizeSameaInput({})
    expect(normalized.action).toBe('plan')
    expect(normalized.dryRun).toBe(true)
    expect(normalized.centralize).toBe(false)
    expect(normalized.archiveExtensions).toEqual(['.zip', '.rar', '.7z'])
    expect(normalized.pathBlacklist).toEqual(['[00画师分类]', 'trash', 'temp'])
    expect(normalized.artistBlacklist.slice(0, 3)).toEqual(['pixiv', 'twitter', 'various'])
    // 阳性对照：显式给了名单就整体替换，不与默认名单合并。
    expect(normalizeSameaInput({ artistBlacklist: ['only'] }).artistBlacklist).toEqual(['only'])
  })

  it('根目录不是目录 ⇒ root_not_directory 判错误，而不是静默空计划', async () => {
    const runtime = fakeRuntime({}, [])
    const result = await runSamea({ action: 'plan', paths: ['/archive/missing'] }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]?.reason).toBe('root_not_directory')
  })
})

describe('samea platform（真文件系统上的枚举语义）', () => {
  it('符号链接既不算归档也不算目录，于是既不搬也不下钻', async () => {
    const root = await tempRoot('symlink')
    const real = join(root, 'sub')
    await mkdir(real)
    await writeFile(join(real, '[Artist] inner.zip'), 'x', 'utf8')
    await writeFile(join(root, '[Artist] one.zip'), 'x', 'utf8')
    await symlink(join(root, '[Artist] one.zip'), join(root, '[Artist] link.zip'), 'file')
    await symlink(real, join(root, '[Artist] link-dir'), 'dir')

    const data = await buildSameaPlan({ ...normalizeSameaInput({ minOccurrences: 1 }), paths: [root] }, createNodeSameaRuntime())
    const sources = data.items.map((item) => item.sourcePath)
    expect(sources).toContain(join(root, '[Artist] one.zip'))
    expect(sources).toContain(join(real, '[Artist] inner.zip'))
    // 阳性对照：把 listDir 改成逐项 stat，这两条就红（软链会被当成归档搬走）。
    expect(sources).not.toContain(join(root, '[Artist] link.zip'))
    expect(sources).not.toContain(join(root, '[Artist] link-dir'))
  })

  it('路径黑名单在进目录之前就判，集中输出目录因此天然不被重扫', async () => {
    const root = await tempRoot('blacklist')
    const grouped = join(root, '[00画师分类]')
    await mkdir(grouped)
    await writeFile(join(grouped, '[Artist] inside.zip'), 'x', 'utf8')
    await writeFile(join(root, '[Artist] outside.zip'), 'x', 'utf8')
    const runtime = createNodeSameaRuntime()

    const blocked = await buildSameaPlan({ ...normalizeSameaInput({ centralize: true }), paths: [root] }, runtime)
    expect(blocked.items.map((item) => item.sourcePath)).toEqual([join(root, '[Artist] outside.zip')])

    // 阳性对照：ignorePathBlacklist 打开后，那个已经在集中目录里的条目会被重新算进来。
    const ignored = await buildSameaPlan({ ...normalizeSameaInput({ centralize: true, ignorePathBlacklist: true }), paths: [root] }, runtime)
    expect(ignored.items.map((item) => item.sourcePath)).toContain(join(grouped, '[Artist] inside.zip'))
  })

  it('真搬一次：文件落在画师目录里，源路径消失；预演那遍一个字节都没动', async () => {
    const root = await tempRoot('live-move')
    const one = join(root, '[Artist] one.zip')
    const two = join(root, '[Artist] two.zip')
    await writeFile(one, 'one', 'utf8')
    await writeFile(two, 'two', 'utf8')
    const runtime = createNodeSameaRuntime()
    const input = normalizeSameaInput({ minOccurrences: 2 })

    const dry = await runSamea({ ...input, action: 'classify', paths: [root] }, runtime)
    expect(dry.data?.movedCount).toBe(0)
    expect(existsSync(one)).toBe(true)

    const live = await runSamea({ ...input, action: 'classify', paths: [root], dryRun: false }, runtime)
    expect(live.success).toBe(true)
    expect(live.data?.movedCount).toBe(2)
    expect(existsSync(one)).toBe(false)
    expect(existsSync(join(root, '[Artist]', '[Artist] one.zip'))).toBe(true)
    expect(existsSync(join(root, '[Artist]', '[Artist] two.zip'))).toBe(true)
    // 目标目录是 ensureDir 建的，不是靠人手摆。
    expect(existsSync(join(root, '[Artist]'))).toBe(true)
  })

  it('目标已存在 ⇒ conflict：不覆盖、不搬那一条，但 success 仍为真（上游就把 conflict 记在 errors 里而不判失败）', async () => {
    const root = await tempRoot('conflict')
    const one = join(root, '[Artist] one.zip')
    const two = join(root, '[Artist] two.zip')
    await writeFile(one, 'new', 'utf8')
    await writeFile(two, 'x', 'utf8')
    await mkdir(join(root, '[Artist]'))
    await writeFile(join(root, '[Artist]', '[Artist] one.zip'), 'old', 'utf8')

    const result = await runSamea({ action: 'classify', paths: [root], minOccurrences: 1, dryRun: false }, createNodeSameaRuntime())
    // `summarize()` 的 errorCount 只数 status==='error'，conflict 进的是 errors 列表与
    // conflictCount ⇒ 内核报"这次跑完了"，同时把冲突列出来。这条形状是上游的，不许"顺手改成失败"。
    expect(result.success).toBe(true)
    expect(result.data?.conflictCount).toBe(1)
    expect(result.data?.errorCount).toBe(0)
    expect(result.data?.movedCount).toBe(1)
    expect(result.data?.errors).toEqual([`${one}: target_exists`])
    // 阳性对照：冲突那一条不许被搬掉，也不许被覆盖——目标里仍是 old，源文件还在。
    expect(readFileSync(join(root, '[Artist]', '[Artist] one.zip'), 'utf8')).toBe('old')
    expect(existsSync(one)).toBe(true)
    expect(existsSync(join(root, '[Artist]', '[Artist] two.zip'))).toBe(true)
  })
})

describe('samea 清单', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const node = ownNode()
    const result = validateNodeDefinition(node)
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('清单的词表逐字对上游：两个动作、十个字段、一条分组', () => {
    const node = ownNode() as never as {
      nodeId: string
      actions: { id: string; label: { zh: string; en: string } }[]
      fields: { id: string; kind: string }[]
      groups: { id: string; fieldIds: string[] }[]
      inputBindings: { fieldId: string; slot: string; transform?: string }[]
      danger: { type: string }
      reportsProgress: boolean
    }
    expect(node.nodeId).toBe('samea')
    expect(node.actions.map((action) => action.id)).toEqual(['plan', 'classify'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 规划', '▶ 分类'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'pathsText', 'ignorePathBlacklist', 'minOccurrences', 'centralize', 'dryRun',
      'artistBlacklist', 'pathBlacklist', 'regexBlacklist', 'archiveExtensions',
    ])
    expect(node.groups[0]?.id).toBe('source')
    expect(node.groups[0]?.fieldIds).toHaveLength(10)
    expect(node.danger.type).toBe('all')
    expect(node.reportsProgress).toBe(true)

    // 阳性对照：把规则摊平成 `{type}`（本仓一度这么写），尺必须判红。
    // 上游 `GuardedRule` 是 `{rule, when?}`，而 SDK 的 `fieldProperty` 读 `entry.rule.type`，
    // 摊平那份会在装载期就 TypeError。
    const flattened = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    const pathsText = flattened.fields.find((field) => field.id === 'pathsText')
    pathsText!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(flattened)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('SDK 侧的形状：选择器不进参数表，危险判据落在 classify + 非预演上', () => {
    const validated = validateNodeDefinition(ownNode())
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    const def = validated.value
    // 期望值是照定义里的 visible/danger 谓词手推的：`action` 是 isActionSelector ⇒ 不进参数表；
    // 其余九个字段两条动作都可见（上游 samea.json 没有一条按动作切换的 visible）。
    const both = ['pathsText', 'ignorePathBlacklist', 'minOccurrences', 'centralize', 'dryRun', 'artistBlacklist', 'pathBlacklist', 'regexBlacklist', 'archiveExtensions']
    expect(Object.keys(parametersFor(def, 'plan'))).toEqual(both)
    expect(Object.keys(parametersFor(def, 'classify'))).toEqual(both)
    // `atLeastLines` 不算 required（SDK 只把 required/nonBlank 抬成参数必填），数组参数照上游形状给。
    expect(parametersFor(def, 'plan')?.pathsText).toMatchObject({ type: 'array' })
    // 危险闸门：plan 永不危险；classify 只有把 dryRun 关掉才要批准。
    expect(dangerFor(def, undefined, 'plan', {})).toBeUndefined()
    expect(dangerFor(def, undefined, 'classify', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'classify', { dryRun: false })?.zh).toContain('samea')
    // 对照：谓词里如果留着上游那句 `actionField: "action"`，模型不传 action 时这条 ask 就永远不亮
    // （dangerFor 的 all/any 路径没有 actionId 兜底）——那才是真事故，所以这里钉住。
    expect(dangerFor(def, undefined, 'classify', {})).toBeDefined()
  })

  it('pathsText 的绑定用 identity：SDK 的 path-list 参数是数组，lines 会把两条根粘成一条（本仓对上游声明的一处改动）', () => {
    const node = ownNode() as never as { inputBindings: { fieldId: string; slot: string; transform?: string }[] }
    const binding = node.inputBindings.find((item) => item.fieldId === 'pathsText')
    expect(binding?.slot).toBe('paths')
    expect(binding?.transform).toBe('identity')

    // 期望值手写：上游声明的那个 `lines` 变换在这里会把数组打回字符串再按换行切。
    expect(transformValue(['/a', '/b'], 'lines')).toEqual(['/a,/b'])
    expect(bindInputs(node as never, { pathsText: ['/a', '/b'] })).toMatchObject({ paths: ['/a', '/b'] })
    // 对照：字符串形状（文本域那一边）仍按换行切开。
    expect(transformValue('/a\n/b', 'lines')).toEqual(['/a', '/b'])
  })
})

interface RawNode { inputBindings?: unknown; fields?: unknown }

function ownNode(): RawNode {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: RawNode } }
  return pkg.xaihi?.node ?? {}
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-samea-${label}-`))
  tempRoots.push(root)
  return root
}

function file (name: string): SameaDirEntry {
  return { name, path: `/archive/${name}`, isFile: true, isDirectory: false }
}

const baseInput = {
  action: 'plan' as const, path: '', listText: '', ignorePathBlacklist: false, minOccurrences: 1, centralize: false, includeDirectories: false, skipGroupedDirectories: false, dryRun: true,
  artistBlacklist: ['various'], pathBlacklist: ['[00画师分类]'], regexBlacklist: [], archiveExtensions: ['.zip', '.rar', '.7z'],
}

/** 上游 `core.test.ts` 里那份 fakeRuntime 逐字搬来（假路径规则与假 join/dirname 都保留）。 */
function fakeRuntime (dirs: Record<string, SameaDirEntry[]>, moves: Array<[string, string]> = []): SameaRuntime {
  return {
    pathInfo: async (path) => {
      if (dirs[path]) return { path, exists: true, isFile: false, isDirectory: true }
      for (const entries of Object.values(dirs)) { const entry = entries.find((item) => item.path === path); if (entry) return { path, exists: true, isFile: entry.isFile, isDirectory: entry.isDirectory } }
      return { path, exists: false, isFile: false, isDirectory: false }
    },
    listDir: async (path) => dirs[path] ?? [], ensureDir: async () => undefined,
    movePath: async (source, target) => { moves.push([source, target]) },
    join: (...parts) => parts.join('/').replace(/\/{2,}/g, '/'),
    dirname: (path) => path.replace(/\/[^/]+$/, '') || '/', basename: (path) => path.split('/').at(-1) ?? path,
  }
}
