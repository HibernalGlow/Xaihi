/**
 * nameu 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/nameu.json`（definitionVersion 1），
 * 不调用被测函数得到。两处**有意**的词表落差在断言里点名：
 * 1. `groups[].title` → 我们词表里是 `groups[].label`（`NodeGroup.label`）；
 * 2. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`；
 * 3. `danger.predicates[].test.actionField` 被剥掉：`dangerFor` 的 `all`/`any` 那条路
 *    只把 `actionId` 给求值器、不给 `args.action`，留着它那条 ask 永远不亮
 *    （与 `plugins/samea/tests/core.spec.ts` 钉住的是同一个坑）。
 *    `fields[].visible` 里那一份**保留**，因为 `parametersFor` 会同时给 args 与 actionId。
 *
 * 每条尺都配阳性对照：坏清单必须被拒（`validateNodeDefinition` 不是装饰）。
 *
 * @module xaihi-nameu/tests/definition
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { PreDecision } from '@hibernalglow/xaihi-sdk'
import { bindInputs, dangerFor, nodeHelpFromManifest, parametersFor, transformValue, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import { apply, type Config } from '../src/index.ts'

interface NodeShape {
  nodeId: string
  definitionVersion: number
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: { id: string; kind: string; label: { zh: string; en: string }; options?: { value: unknown; label: { zh: string; en: string } }[]; rules?: unknown[]; visible?: { type: string; predicate?: { test?: { type: string; actionField?: string; allowed?: unknown[] }; negated?: boolean } } }[]
  groups: { id: string; label?: { zh: string; en: string }; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; allowed?: unknown[] }; negated: boolean }[] }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string; en: string }; safety: { defaultMode: string; destructive: { zh: string[]; en: string[] }; notes: { zh: string[]; en: string[] } } }
}

function ownNode(): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

describe('nameu 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const pathsText = broken.fields.find((field) => field.id === 'pathsText')
    // 上游 `GuardedRule` 是 `{rule, when?}`；SDK 的 `fieldProperty` 读 `entry.rule.type`。
    pathsText!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：另一种坏法——transform 不在词表内、title 少一种语言', () => {
    const badTransform = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badTransform.inputBindings[0]!.transform = 'splitOnSpace'
    const first = validateNodeDefinition(badTransform)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('transform is not in')

    const badTitle = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badTitle.title.zh = ''
    const second = validateNodeDefinition(badTitle)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('title must carry both zh and en')
  })
})

describe('nameu 清单的词表逐字对上游', () => {
  it('三个动作、十一条字段、一条分组', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('nameu')
    expect(node.title).toEqual({ zh: 'NameU', en: 'NameU' })
    expect(node.description).toEqual({
      zh: '为画师文件夹预览并执行归档文件名清理。',
      en: 'Preview and apply archive filename cleanup for artist folders.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'plan', 'rename'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 扫描', '⌁ 预览', '⇄ 改名'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['⌕ Scan', '⌁ Preview', '⇄ Rename'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'pathsText', 'mode', 'recursive', 'addArtistName', 'normalizeFolders',
      'keepTimestamp', 'excludeKeywords', 'forbiddenArtistKeywords', 'archiveExtensions', 'dryRun',
    ])
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'path-list', 'select', 'boolean', 'boolean', 'boolean', 'boolean', 'text', 'text', 'text', 'boolean',
    ])
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]).toMatchObject({ id: 'rules', label: { zh: '命名规则', en: 'Naming rules' } })
    expect(node.groups[0]!.fieldIds).toHaveLength(11)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一）', () => {
    for (const field of ownNode().fields.filter((item) => item.kind === 'select')) {
      expect((field.options ?? []).every((option) => typeof option.value === 'string')).toBe(true)
    }
    const action = ownNode().fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual(['scan', 'plan', 'rename'])
    // 阳性对照：留着上游那份 `{text: "scan"}` 的话，上面这条立刻红。
    const upstreamShape = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    upstreamShape.fields.find((field) => field.id === 'mode')!.options = [{ value: { text: 'multi' }, label: { zh: '▦ 多作者', en: '▦ Multi artist' } }]
    expect((upstreamShape.fields.find((field) => field.id === 'mode')!.options ?? []).every((option) => typeof option.value === 'string')).toBe(false)
  })

  it('archiveExtensions 的默认串与内核默认名单同源（core.ts:76）', () => {
    const field = ownNode().fields.find((item) => item.id === 'archiveExtensions')
    expect(field).toBeDefined()
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; default?: unknown }[] }
    expect(raw.fields.find((item) => item.id === 'archiveExtensions')?.default).toEqual({ text: '.zip,.rar,.7z,.cbz,.cbr' })
  })

  it('绑定逐条对上游，只有 pathsText 那一条改成了 identity', () => {
    const node = ownNode()
    expect(node.inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['pathsText', 'paths', 'identity'],
      ['mode', 'mode', 'trim'],
      ['recursive', 'recursive', 'asBoolean'],
      ['addArtistName', 'addArtistName', 'asBoolean'],
      ['normalizeFolders', 'normalizeFolders', 'asBoolean'],
      ['keepTimestamp', 'keepTimestamp', 'asBoolean'],
      ['excludeKeywords', 'excludeKeywords', 'delimited'],
      ['forbiddenArtistKeywords', 'forbiddenArtistKeywords', 'delimited'],
      ['archiveExtensions', 'archiveExtensions', 'delimited'],
      ['dryRun', 'dryRun', 'asBoolean'],
    ])
    // 上游这一条声明的是 `lines`；SDK 的 path-list 参数是数组，`lines` 会把两条根粘成一条
    // （下面这两行期望值手抄自 node-sdk/src/define-node.ts:136-137 的实现）。
    expect(transformValue(['/a', '/b'], 'lines')).toEqual(['/a,/b'])
    expect(bindInputs(node as never, { pathsText: ['/a', '/b'] })).toMatchObject({ paths: ['/a', '/b'] })
  })

  it('危险闸门：rename + 非预演；谓词里不许留 actionField（留了 ask 永远不亮）', () => {
    const node = ownNode()
    expect(node.danger.type).toBe('all')
    expect(node.danger.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['rename'] }, negated: false },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])
    // fields[].visible 里那份 actionField 保留（parametersFor 同时给 args 与 actionId）。
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; visible?: { predicate?: { test?: Record<string, unknown> } } }[] }
    expect(raw.fields.find((field) => field.id === 'dryRun')?.visible?.predicate?.test).toEqual({
      type: 'actionIs', actionField: 'action', allowed: ['rename'],
    })
  })

  it('help 只剩我们词表能装的那两块，whenToUse 是字符串', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '归档文件名在长期保存前需要统一括号、空格、活动标签和画师后缀时，使用 NameU。',
      en: 'Use NameU when archive filenames need consistent brackets, spacing, event tags, and artist suffixes before long-term storage.',
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'dry-run',
      destructive: { zh: ['rename'], en: ['rename'] },
      notes: {
        zh: ['UI 中的真实重命名需要二次确认。', '冲突的目标名会被上报，不执行重命名。', '该原生节点不会调用 Python 工具的归档 ID 数据库/评论支持。'],
        en: [
          'Live rename is gated by confirmation in the UI.',
          'Conflicting target names are reported and not renamed.',
          'Archive ID database/comment support from the Python tool is not invoked by this native node.',
        ],
      },
    })
  })
})

describe('nameu 清单的 SDK 侧形状', () => {
  it('dryRun 只在 rename 那一个动作的参数表里出现', () => {
    const validated = validateNodeDefinition(ownNode())
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    const def = validated.value
    const shared = ['pathsText', 'mode', 'recursive', 'addArtistName', 'normalizeFolders', 'keepTimestamp', 'excludeKeywords', 'forbiddenArtistKeywords', 'archiveExtensions']
    expect(Object.keys(parametersFor(def, 'scan') ?? {})).toEqual(shared)
    expect(Object.keys(parametersFor(def, 'plan') ?? {})).toEqual(shared)
    expect(Object.keys(parametersFor(def, 'rename') ?? {})).toEqual([...shared, 'dryRun'])
    expect(parametersFor(def, 'plan')?.pathsText).toMatchObject({ type: 'array' })
  })

  it('dangerFor：scan/plan 永不危险，rename 只在预演关掉时要批准', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const def = validated.value
    expect(dangerFor(def, undefined, 'scan', {})).toBeUndefined()
    expect(dangerFor(def, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'rename', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'rename', { dryRun: false })?.zh).toContain('nameu')
    // 阳性对照：模型没传 dryRun 时这条 ask **必须**亮（否则危险动作默认放行）。
    expect(dangerFor(def, undefined, 'rename', {})).toBeDefined()
  })

  it('工具名是 <nodeId>_<actionId>，帮助页由清单推导', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xnameu', command: '/nameu' })
    expect(help.title).toBe('NameU')
    expect(help.commands.map((command) => command.command)).toEqual(['xnameu', '/nameu'])
    // 三个动作都进 bin 的示例行（推导器读的是清单 actions，不是手抄的第二份）。
    const examples = help.commands[0]!.examples.map((example) => example.command)
    expect(examples).toEqual(['xnameu --help', 'xnameu scan', 'xnameu plan', 'xnameu rename'])
  })
})

describe('nameu 宿主接线（apply → defineNode → 真内核）', () => {
  it('三个动作注册成三个工具，rename 的非预演调用被拦成 ask，plan 的工具真的跑内核', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: () => undefined,
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual(['nameu_scan', 'nameu_plan', 'nameu_rename'])
    expect(listeners).toHaveLength(1)

    // 危险闸门：rename + dryRun=false ⇒ ask；plan 与"没传 dryRun 的 rename"各走各的。
    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'nameu_rename', arguments: { dryRun: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'nameu_plan', arguments: {} }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // 工具真的跑内核：夹具落在真文件系统上，输出是内核那句话 + 上游那四条计数。
    const root = await mkdtemp(join(tmpdir(), 'xaihi-nameu-host-'))
    tempDirs.push(root)
    const artist = join(root, 'Artist')
    await mkdir(artist)
    await writeFile(join(artist, 'Book [cbr].zip'), 'book', 'utf8')
    const plan = registered.find((tool) => tool['name'] === 'nameu_plan')
    const execute = plan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>
    // 表单侧会把声明式 default 一并交上来（`node-definitions/nameu.json` 里那四个 boolean
    // 全是 true），宿主面照这份形状调过去，得到的就是内核该有的那份计划。
    const output = await execute({
      pathsText: [artist], mode: 'single', recursive: true, addArtistName: true, normalizeFolders: true, keepTimestamp: true, dryRun: true,
    }, {})
    expect(output).toContain('NameU planned 1 item(s).')
    expect(output).toContain('Ready: 1')
    expect(output).toContain('BookArtist.zip')
    // 阳性对照：这条走的是宿主面，工具没跑起来就会在这里红（而不是在清单断言里假装过）。
    expect(existsSync(join(artist, 'BookArtist.zip'))).toBe(false)

    // SDK 改成了"缺参即不提供（undefined）"，config.addArtistName 默认值 true 生效：
    const omitted = await execute({ pathsText: [artist], mode: 'single' }, {})
    expect(omitted).toContain('->\tBookArtist.zip')
  })
})

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig(overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values = {
    mode: 'multi', recursive: true, addArtistName: true, normalizeFolders: true, keepTimestamp: true,
    dryRun: true, excludeKeywords: '', forbiddenArtistKeywords: '', archiveExtensions: '', ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
