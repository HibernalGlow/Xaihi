/**
 * mvz 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/mvz.json`（definitionVersion 1），
 * 不调用被测函数得到。三处**有意**的词表落差在断言里点名：
 * 1. `groups[].title` → 我们词表里是 `groups[].label`（`NodeGroup.label`）；
 * 2. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`；
 * 3. `danger`：上游是 `{type:"fieldFlag", fieldId:"dryRun", inverted:true}`，
 *    我们的词表里 `NodeDanger` **没有 `inverted` 这一格**（`packages/node-sdk/src/node.ts:145-153`），
 *    而 `dangerFor` 的 `fieldFlag` 那条只看 `=== true`（`define-node.ts:189-190`）。
 *    原样搬会得到一个**反着的闸门**：真执行不拦、预演反而拦（下面那条正控量的就是这个）。
 *    所以换成等价写法 `{type:"all", predicates:[{test:{type:"fieldTrue",fieldId:"dryRun"},negated:true}]}`。
 *    这条落差是新缺口，报告里记作 **G11**。
 *
 * 另外 `danger.predicates[].test.actionField` 在 nameu 那批被剥掉是因为 `dangerFor` 的 `all`
 * 只给 `actionId` 不给 `args`；mvz 这份上游 danger 里本来就没有 `actionIs`，所以没有这一刀。
 * `fields[].visible` 里那一份 `actionField` **保留**，因为 `parametersFor` 会同时给 args 与 actionId。
 *
 * 每条尺都配阳性对照：坏清单必须被拒（`validateNodeDefinition` 不是装饰）。
 *
 * @module xaihi-mvz/tests/definition
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { PreDecision } from '@hibernalglow/xaihi-sdk'
import {
  bindInputs,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateNodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { apply, type Config } from '../src/index.ts'
import type { MvzSubprocessSeam, MvzSubprocessSpawnSpec } from '../src/platform.ts'

interface NodeShape {
  nodeId: string
  definitionVersion: number
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: {
    id: string
    kind: string
    label: { zh: string; en: string }
    options?: { value: unknown; label: { zh: string; en: string } }[]
    rules?: unknown[]
    visible?: { type: string; predicate?: { test?: { type: string; actionField?: string; allowed?: unknown[] }; negated?: boolean } }
  }[]
  groups: { id: string; label?: { zh: string; en: string }; title?: unknown; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; fieldId?: string; inverted?: boolean; predicates?: { test: { type: string; actionField?: string; fieldId?: string; allowed?: unknown[] }; negated: boolean }[] }
  dangerPrompt: { title: { zh: string; en: string }; body: { zh: string; en: string }; confirmLabel: { zh: string; en: string } }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string; en: string }; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

function ownNode (): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

function upstreamNode (): Record<string, unknown> {
  const path = '/Users/glow/Base/Code/Freya/Xiranite/node-definitions/mvz.json'
  if (!existsSync(path)) throw new Error('读不到上游定义（真源不在位，这条尺失效，不是"没问题"）')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('mvz 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const fileText = broken.fields.find((field) => field.id === 'fileText')
    fileText!.rules = [{ type: 'nonBlank' }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：transform 不在词表内、title 少一种语言', () => {
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

  it('阳性对照：select 少选项 / 未知 danger 类型', () => {
    const emptySelect = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    emptySelect.fields.find((field) => field.id === 'action')!.options = []
    expect(validateNodeDefinition(emptySelect).ok).toBe(false)

    const badDanger = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badDanger.danger = { type: 'vibes' }
    const check = validateNodeDefinition(badDanger)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('danger.type must be one of')
  })
})

describe('mvz 清单的词表逐字对上游', () => {
  it('四个动作、十条字段、一条分组，标题与上游 title 同名', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('mvz')
    expect(node.title).toEqual({ zh: 'MVZ', en: 'MVZ' })
    expect(node.description).toEqual({
      zh: '根据 findz 输出，对归档内的文件执行删除、解压、移动或重命名。',
      en: 'Delete, extract, move, or rename files inside archives from findz output.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['extract', 'move', 'delete', 'rename'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⇩ 解压', '⇄ 移动', '⌫ 删除', '✎ 重命名'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['⇩ Extract', '⇄ Move', '⌫ Delete', '✎ Rename'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'fileText', 'output', 'near', 'autoDir', 'flatten', 'pattern', 'replacement', 'separator', 'dryRun',
    ])
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'multiline', 'text', 'boolean', 'boolean', 'boolean', 'text', 'text', 'text', 'boolean',
    ])
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]).toMatchObject({ id: 'archive', label: { zh: '归档操作', en: 'Archive operation' } })
    expect(node.groups[0]!.fieldIds).toHaveLength(10)
    // 上游那份的键名是 `title`，本仓词表是 `label`（正控：留 title 的那一份现在查得到）。
    expect(node.groups[0]!.title).toBeUndefined()
    expect((upstreamNode().groups as Array<Record<string, unknown>>)[0]).toHaveProperty('title')
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一）', () => {
    const action = ownNode().fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual(['extract', 'move', 'delete', 'rename'])
    // 阳性对照：上游原样那份 `{text:"extract"}` 在这条尺上必须红。
    const upstreamAction = (upstreamNode().fields as { id: string; options?: { value: unknown }[] }[])
      .find((field) => field.id === 'action')
    if (upstreamAction?.options?.[0] === undefined) throw new Error('上游 mvz.json 的 action 字段形状漂了：这条正控无从做起')
    expect(typeof upstreamAction.options[0]!.value).toBe('object')
  })

  it('字段默认值逐条对上游（dryRun 是 true：内核那一侧的 false 钉在 core.spec）', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; default?: unknown }[] }
    const defaults = new Map(raw.fields.map((field) => [field.id, field.default]))
    expect(defaults.get('action')).toEqual({ text: 'extract' })
    expect(defaults.get('fileText')).toEqual({ text: '' })
    expect(defaults.get('output')).toEqual({ text: '' })
    expect(defaults.get('near')).toEqual({ boolean: false })
    expect(defaults.get('autoDir')).toEqual({ boolean: true })
    expect(defaults.get('flatten')).toEqual({ boolean: false })
    expect(defaults.get('pattern')).toEqual({ text: '' })
    expect(defaults.get('replacement')).toEqual({ text: '' })
    expect(defaults.get('separator')).toEqual({ text: '//' })
    // 这一条钉的是"清单这一侧的默认"：界面默认预演；内核 `core.ts:112` 的默认是执行。
    // 两份都是真源，谁也不许被统一掉（`plugins/rawfilter` 的 `dryRun` 是同一个先例）。
    expect(defaults.get('dryRun')).toEqual({ boolean: true })
  })

  it('pattern 那条 guarded rule 的 when 与上游同形（只在 rename 那条动作上检查）', () => {
    const pattern = ownNode().fields.find((field) => field.id === 'pattern')
    expect(pattern?.rules).toEqual([{
      rule: { type: 'nonBlank' },
      when: {
        type: 'single',
        predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['rename'] }, negated: false },
      },
    }])
  })

  it('绑定逐条对上游，一条不改', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['fileText', 'fileText', 'identity'],
      ['output', 'output', 'identity'],
      ['near', 'near', 'asBoolean'],
      ['autoDir', 'autoDir', 'asBoolean'],
      ['flatten', 'flatten', 'asBoolean'],
      ['pattern', 'pattern', 'identity'],
      ['replacement', 'replacement', 'identity'],
      ['separator', 'separator', 'identity'],
      ['dryRun', 'dryRun', 'asBoolean'],
    ])
  })

  it('危险闸门：非预演即危险；上游那个 inverted 换成了等价的 negated 谓词（G11）', () => {
    const node = ownNode()
    expect(node.danger).toEqual({
      type: 'all',
      predicates: [{ test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true }],
    })
    // 正控（新缺口 G11 的实测）：上游那份原样交给 dangerFor 是**反的**。
    const upstream = validateNodeDefinition(upstreamNode())
    expect(upstream.ok, '上游那份连我们的校验器都过 ⇒ "过了"不等于"对"').toBe(true)
    if (!upstream.ok) return
    expect(upstream.value.danger).toMatchObject({ type: 'fieldFlag', fieldId: 'dryRun', inverted: true })
    expect(dangerFor(upstream.value, undefined, 'delete', { dryRun: false }),
      '上游形状在 dangerFor 里对"真执行"毫不作为 ⇒ 这就是不能原样搬的理由').toBeUndefined()
    expect(dangerFor(upstream.value, undefined, 'delete', { dryRun: true }),
      '上游形状把"预演"拦成危险 ⇒ 方向是反的').toBeDefined()
    // 我们那份：两条都摆正。
    const def = validateNodeDefinition(node)
    if (!def.ok) throw new Error('清单不合法')
    expect(dangerFor(def.value, undefined, 'delete', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def.value, undefined, 'delete', { dryRun: false })).toBeDefined()
    expect(dangerFor(def.value, undefined, 'rename', { dryRun: false })?.zh).toContain('mvz')
  })

  it('dangerPrompt 原样留着（词表没这一格，校验器也不拦未知键）', () => {
    expect(ownNode().dangerPrompt).toEqual({
      title: { zh: '确认修改压缩包', en: 'Confirm archive modification' },
      body: { zh: '此操作会修改压缩包内容。', en: 'This modifies archive contents.' },
      confirmLabel: { zh: '确认执行', en: 'Execute' },
    })
  })

  it('help 只剩我们词表能装的那两块，whenToUse 是字符串', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '当需要从工作区 UI 或 CLI 使用该节点的文件工作流时，使用 MVZ。',
      en: 'Use MVZ when you need this node\'s file workflow from either the workspace UI or CLI.',
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['修改文件前优先使用预览或 dry-run 模式。', '处理大文件夹时保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
    // 上游那两块我们词表装不下（workflows 是对象数组、commands 是命令清单），因此整块不抄。
    expect((upstreamNode().help as Record<string, unknown>).workflows).toBeInstanceOf(Array)
    expect((node.help as Record<string, unknown>).workflows).toBeUndefined()
    expect((node.help as Record<string, unknown>).commands).toBeUndefined()
  })
})

describe('mvz 清单的 SDK 侧形状', () => {
  it('参数表按动作切：output/near/autoDir/flatten 只在 extract/move，pattern/replacement 只在 rename', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const def = validated.value
    expect(Object.keys(parametersFor(def, 'extract') ?? {})).toEqual(['fileText', 'output', 'near', 'autoDir', 'flatten', 'separator', 'dryRun'])
    expect(Object.keys(parametersFor(def, 'move') ?? {})).toEqual(['fileText', 'output', 'near', 'autoDir', 'flatten', 'separator', 'dryRun'])
    expect(Object.keys(parametersFor(def, 'delete') ?? {})).toEqual(['fileText', 'separator', 'dryRun'])
    expect(Object.keys(parametersFor(def, 'rename') ?? {})).toEqual(['fileText', 'pattern', 'replacement', 'separator', 'dryRun'])
    // fileText 带 nonBlank ⇒ 必填；pattern 的那条规则有 `when` ⇒ 不许进 required（define-node.ts:83-86）。
    expect(parametersFor(def, 'rename')?.fileText).toMatchObject({ type: 'string', required: true })
    expect(parametersFor(def, 'rename')?.pattern).toMatchObject({ type: 'string' })
    expect((parametersFor(def, 'rename')?.pattern as Record<string, unknown> | undefined)?.required).toBeUndefined()
  })

  it('bindInputs 把省略的布尔折成 false（缺口 G8 那一格，钉现状不修语义）', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const bound = bindInputs(validated.value, { fileText: 'a.zip//x.txt' })
    expect(bound).toMatchObject({ dryRun: false, near: false, autoDir: false, flatten: false })
    // 也就是说：模型少传 dryRun ⇒ 表单那份 default:true 不会生效 ⇒ 走的是执行那条腿。
    expect(dangerFor(validated.value, undefined, 'delete', bound as Record<string, unknown>)).toBeDefined()
  })

  it('帮助页只印 bin，不印宿主斜杠命令（缺口 G7 的这一侧）', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xmvz' })
    expect(help.title).toBe('MVZ')
    expect(help.commands[0]!.command).toBe('xmvz')
    const examples = help.commands[0]!.examples.map((example) => example.command)
    expect(examples).toEqual(['xmvz --help', 'xmvz extract', 'xmvz move', 'xmvz delete', 'xmvz rename'])
    // 现实披露：本包没传 `command`，推导器仍然按 `/mvz` 兜底（node-sdk/src/help.ts:108）。
    // 这一格不在本包权限内，已写进 `src/help.ts` 与报告的 G7 段。
    expect(help.commands[1]!.command).toBe('/mvz')
  })
})

describe('mvz 宿主接线（apply → defineNode → ctx.subprocess）', () => {
  it('四个动作注册成四个工具，非预演被拦成 ask，delete 真的经 ctx.subprocess 起进程', async () => {
    const seam = new FakeSubprocess()
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: (name: string) => (name === 'subprocess' ? seam : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual(['mvz_extract', 'mvz_move', 'mvz_delete', 'mvz_rename'])
    expect(listeners).toHaveLength(1)

    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'mvz_delete', arguments: { dryRun: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const dry = await listener({ name: 'mvz_delete', arguments: { dryRun: true } }, next)
    expect(dry.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // 工具真的跑内核、真的经缝：夹具是一份**存在**的假归档文件。
    const dir = await mkdtemp(join(tmpdir(), 'xaihi-mvz-host-'))
    tempDirs.push(dir)
    const archive = join(dir, 'book.zip')
    await writeFile(archive, 'not really a zip', 'utf8')

    const tool = registered.find((item) => item['name'] === 'mvz_delete')
    const execute = tool?.['execute'] as (args: unknown, exec: unknown) => Promise<string>
    const dryRunOutput = await execute({ fileText: `${archive}//page/001.jpg`, dryRun: true }, {})
    expect(dryRunOutput).toContain('delete · delete complete: 1 succeeded, 0 failed.')
    expect(dryRunOutput).toContain('success: 1  failed: 0')
    expect(dryRunOutput).toContain('7z d')
    // 预演一次进程都不起（`core.ts:112` 那一格的宿主面版本）。
    expect(seam.spawned).toEqual([])

    const live = await execute({ fileText: `${archive}//page/001.jpg`, dryRun: false, separator: '//' }, {})
    expect(live).toContain('delete 1 file(s)')
    expect(seam.spawned).toHaveLength(1)
    expect(seam.spawned[0]!.argv.slice(0, 3)).toEqual([seam.resolved, 'd', archive])
    expect(seam.spawned[0]!.argv[3]).toBe('page/001.jpg')
    // 内核没被绕过：归档文件本身还在（进程是假件，真删是 7-Zip 干的事）。
    expect(existsSync(archive)).toBe(true)
  })

  it('ctx.subprocess 不在位时 apply 当场炸，不注册半套工具（阳性对照）', () => {
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: () => () => {},
      get: () => undefined,
    }
    expect(() => apply(ctx as never, fakeConfig({}))).toThrow(/ctx\.subprocess/)
    expect(registered).toEqual([])
  })
})

/** `ctx.subprocess` 的假件：记下每一次 spawn，输出恒 0 且空。 */
class FakeSubprocess implements MvzSubprocessSeam {
  readonly spawned: MvzSubprocessSpawnSpec[] = []
  readonly resolved = '/usr/bin/7z'

  async resolveExecutable (): Promise<string> {
    return this.resolved
  }

  spawn (spec: MvzSubprocessSpawnSpec) {
    this.spawned.push(spec)
    return {
      collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } },
      done: Promise.resolve({ exitCode: 0 }),
    }
  }
}

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig (overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values = {
    output: '',
    near: false,
    autoDir: true,
    flatten: false,
    separator: '//',
    dryRun: true,
    ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}

// `Config` 这一格真的被读到（ADR-0013：值由 DSH 的 patch 层给，插件侧只声明）。
// 判据用 `separator`：它不在 `bindInputs` 的布尔折叠里，所以配置值能穿过接线层走到内核。
describe('mvz 的 Config 读回', () => {
  it('Config.separator 覆盖了清单默认：换成 "::" 之后 "//" 那种行就不再是条目', async () => {
    const seam = new FakeSubprocess()
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: () => () => {},
      get: (name: string) => (name === 'subprocess' ? seam : undefined),
    }
    apply(ctx as never, fakeConfig({ separator: '::' }))
    const execute = toolExecute(registered, 'mvz_delete')

    await expect(execute({ fileText: 'a.zip//page/001.jpg', dryRun: true }, {})).rejects.toThrow(
      'No archive entries found.',
    )
    // 阳性对照：同一份输入配回默认的分隔符就能解析出条目，说明上面那句失败确实来自配置。
    registered.length = 0
    apply(ctx as never, fakeConfig({}))
    const again = toolExecute(registered, 'mvz_delete')
    expect(await again({ fileText: 'a.zip//page/001.jpg', dryRun: true }, {})).toContain('7z d a.zip')
  })
})

/** 从注册下来的一堆工具里取某个动作的 `execute`（工具面跑的就是这条）。 */
function toolExecute (
  registered: Array<Record<string, unknown>>,
  name: string,
): (args: unknown, exec: unknown) => Promise<string> {
  const tool = registered.find((item) => item['name'] === name)
  if (tool === undefined) throw new Error(`没有注册工具 ${name}（apply 那一半没跑起来）`)
  return tool['execute'] as (args: unknown, exec: unknown) => Promise<string>
}
