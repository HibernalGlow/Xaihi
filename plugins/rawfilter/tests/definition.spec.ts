/**
 * rawfilter 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/rawfilter.json`（definitionVersion 1），
 * 不调用被测函数得到。三处**有意**的词表落差在断言里点名：
 * 1. `groups[].title` → 我们词表里是 `groups[].label`（`NodeGroup.label`）；
 * 2. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`；
 * 3. `danger.predicates[].test.actionField` 被剥掉：`dangerFor` 的 `all`/`any` 那条路
 *    只把 `actionId` 给求值器、不给 `args.action`，留着它那条 ask 永远不亮
 *    （与 `plugins/samea/tests/core.spec.ts` 钉住的是同一个坑）。
 *    rawfilter 的 `fields[].visible` 全是 `always`，所以这一条在字段侧没有可见后果。
 *
 * 另外钉住一处上游自带的分歧，不在这里统一：`dryRun` 字段的声明默认是 **true**，
 * 而内核 `core.ts:164` 的默认是 **false**（见 `tests/core.spec.ts` 同一条）。
 *
 * @module xaihi-rawfilter/tests/definition
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { dangerFor, nodeHelpFromManifest, parametersFor, validateNodeDefinition, type PreDecision } from '@hibernalglow/xaihi-sdk'
import { apply, type Config } from '../src/index.ts'

interface NodeShape {
  definitionVersion: number
  nodeId: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: { id: string; kind: string; label: { zh: string; en: string }; options?: { value: unknown; label: { zh: string; en: string } }[]; rules?: unknown[]; range?: { min?: number; max?: number; step?: number } }[]
  groups: { id: string; label?: { zh: string; en: string }; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; allowed?: unknown[] }; negated: boolean }[] }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string; en: string }; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

function ownNode(): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

describe('rawfilter 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const path = broken.fields.find((field) => field.id === 'path')
    // 上游 `GuardedRule` 是 `{rule, when?}`；SDK 的 `fieldProperty` 读 `entry.rule.type`。
    path!.rules = [{ type: 'nonBlank' }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：另一种坏法——range 挂在非 number 字段上、slot 引用了不存在的字段', () => {
    const badRange = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const pathField = badRange.fields.find((field) => field.id === 'path')
    if (pathField === undefined) throw new Error('夹具里找不到 path 字段')
    pathField.range = { min: 0, max: 1 }
    const first = validateNodeDefinition(badRange)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('range belongs to number fields only')

    const badBinding = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badBinding.inputBindings.push({ fieldId: 'nope', slot: 'nope', transform: 'trim' })
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('unknown field')
  })
})

describe('rawfilter 清单的词表逐字对上游', () => {
  it('三个动作、七条字段、一条分组', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('rawfilter')
    expect(node.title).toEqual({ zh: 'Rawfilter', en: 'Rawfilter' })
    expect(node.description).toEqual({
      zh: '将相似归档分组，并将重复/原始版本移至 trash 或 multi 目录。',
      en: 'Group similar archives and move duplicate/raw versions to trash or multi.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'plan', 'execute'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 扫描分组', '◌ 生成计划', '↳ 执行整理'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Scan groups', 'Generate plan', 'Execute'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'path', 'minSimilarity', 'nameOnlyMode', 'createShortcuts', 'trashOnly', 'dryRun',
    ])
    expect(node.fields.map((field) => field.kind)).toEqual(['select', 'text', 'number', 'boolean', 'boolean', 'boolean', 'boolean'])
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]).toMatchObject({ id: 'filter', label: { zh: '归档计划', en: 'Archive plan' } })
    expect(node.groups[0]!.fieldIds).toEqual([
      'action', 'path', 'minSimilarity', 'nameOnlyMode', 'createShortcuts', 'trashOnly', 'dryRun',
    ])
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('minSimilarity 的 range 与默认值逐字（0..1，步长 0.01，默认 0.82）', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; range?: Record<string, number>; default?: unknown }[] }
    const field = raw.fields.find((item) => item.id === 'minSimilarity')
    expect(field?.range).toEqual({ min: 0, max: 1, step: 0.01 })
    expect(field?.default).toEqual({ number: 0.82 })
    // 0.82 与内核 clampSimilarity 的兜底值同源（core.ts:163 + 501），两份都只是默认值。
    const dryRun = raw.fields.find((item) => item.id === 'dryRun')
    expect(dryRun?.default).toEqual({ boolean: true })
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一）', () => {
    const action = ownNode().fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual(['scan', 'plan', 'execute'])
    // 阳性对照：留着上游那份 `{text: "scan"}` 的话，上面这条立刻红。
    const upstreamShape = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    upstreamShape.fields.find((field) => field.id === 'action')!.options = [{ value: { text: 'scan' }, label: { zh: '⌕ 扫描分组', en: 'Scan groups' } }]
    expect(typeof upstreamShape.fields.find((field) => field.id === 'action')!.options![0]!.value).toBe('object')
  })

  it('绑定逐条对上游（path 与 minSimilarity 是 identity）', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['path', 'path', 'identity'],
      ['nameOnlyMode', 'nameOnlyMode', 'asBoolean'],
      ['createShortcuts', 'createShortcuts', 'asBoolean'],
      ['trashOnly', 'trashOnly', 'asBoolean'],
      ['minSimilarity', 'minSimilarity', 'identity'],
      ['dryRun', 'dryRun', 'asBoolean'],
    ])
  })

  it('危险闸门：execute + 非预演；谓词里不许留 actionField（留了 ask 永远不亮）', () => {
    const node = ownNode()
    expect(node.danger.type).toBe('all')
    expect(node.danger.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['execute'] }, negated: false },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])
  })

  it('help 只剩我们词表能装的那两块，whenToUse 是字符串', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '需要从工作区 UI 或 CLI 使用此节点的文件工作流时，可使用 Rawfilter。',
      en: "Use Rawfilter when you need this node's file workflow from either the workspace UI or CLI.",
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['修改文件前，优先使用预览或试运行模式。', '处理大型文件夹时，请保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
  })
})

describe('rawfilter 清单的 SDK 侧形状', () => {
  it('三个动作的参数表相同（上游这七条字段的 visible 全是 always），path 必填', () => {
    const validated = validateNodeDefinition(ownNode())
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    const def = validated.value
    const shared = ['path', 'minSimilarity', 'nameOnlyMode', 'createShortcuts', 'trashOnly', 'dryRun']
    for (const action of ['scan', 'plan', 'execute']) {
      expect(Object.keys(parametersFor(def, action) ?? {})).toEqual(shared)
    }
    // `nonBlank` 且没有 `when` ⇒ 抬成参数必填（node-sdk/src/define-node.ts:85-90）。
    expect(parametersFor(def, 'plan')?.path).toMatchObject({ type: 'string', required: true })
    expect(parametersFor(def, 'plan')?.minSimilarity).toMatchObject({ type: 'number' })
  })

  it('dangerFor：scan/plan 永不危险，execute 只在预演关掉时要批准', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const def = validated.value
    expect(dangerFor(def, undefined, 'scan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'execute', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'execute', { dryRun: false })?.zh).toContain('rawfilter')
    // 阳性对照：模型没传 dryRun 时这条 ask **必须**亮——内核的默认恰恰是"执行"。
    expect(dangerFor(def, undefined, 'execute', {})).toBeDefined()
  })

  it('工具名是 <nodeId>_<actionId>，帮助页由清单推导', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xrawfilter', command: '/rawfilter' })
    expect(help.title).toBe('Rawfilter')
    expect(help.commands.map((command) => command.command)).toEqual(['xrawfilter', '/rawfilter'])
    const examples = help.commands[0]!.examples.map((example) => example.command)
    expect(examples).toEqual(['xrawfilter --help', 'xrawfilter scan', 'xrawfilter plan', 'xrawfilter execute'])
  })
})

describe('rawfilter 宿主接线（apply → defineNode → 真内核）', () => {
  it('三个动作注册成三个工具，execute 的非预演调用被拦成 ask，plan 的工具真的跑内核', async () => {
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
    expect(registered.map((tool) => tool['name'])).toEqual(['rawfilter_scan', 'rawfilter_plan', 'rawfilter_execute'])
    expect(listeners).toHaveLength(1)

    // 危险闸门：execute + dryRun=false ⇒ ask。这一条尤其重要——内核的默认就是"执行"。
    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'rawfilter_execute', arguments: { dryRun: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'rawfilter_plan', arguments: { dryRun: false } }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // 工具真的跑内核，并且**没被批准就不许动文件**：Config 的 dryRun 默认 true 兜住这一格。
    const root = await mkdtemp(join(tmpdir(), 'xaihi-rawfilter-host-'))
    tempDirs.push(root)
    await writeFile(join(root, 'Game [Chinese].zip'), 'chinese', 'utf8')
    await writeFile(join(root, 'Game [English].zip'), 'english', 'utf8')
    await writeFile(join(root, 'Game RAW.rar'), 'raw', 'utf8')
    const plan = registered.find((tool) => tool['name'] === 'rawfilter_plan')
    const output = await (plan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ path: root }, {})
    expect(output).toContain('Plan generated: 2 operation(s).')
    expect(output).toContain('archives: 3  groups: 1  duplicate: 1')
    expect(output).toContain('kept: 1  trash: 0  multi: 0  shortcut: 0')
    // 阳性对照：宿主面走的是 plan 工具，三个文件必须都还在原地。
    expect(await readdir(root)).toHaveLength(3)
    expect(existsSync(join(root, 'Game RAW.rar'))).toBe(true)
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
    nameOnlyMode: false, createShortcuts: false, trashOnly: false, minSimilarity: 0.82, dryRun: true, ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
