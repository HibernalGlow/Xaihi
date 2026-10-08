/**
 * enginev 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/enginev.json`（definitionVersion 1，889 行），
 * 不调用被测函数得到。三处**有意**的词表落差在断言里点名（第四处 `help` 只对本包成立）：
 * 1. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`
 *    （`NodeFieldOption.value: string`）——这份清单里有 18 处；
 * 2. `danger.predicates[].test.actionField` 剥掉：`dangerFor` 走 `all` 那条路时只把
 *    `actionId` 给求值器、不给 `args.action`（`define-node.ts:284`、`conditions.ts:56-59`），
 *    留着它这条 ask 永远不亮。本包只有 1 处（`fields[].visible` 全是 `always`，
 *    所以字段侧没有可见后果），与 `crashu` / `rawfilter` 钉的是同一个坑；
 * 3. `groups` 上游就是**空数组**，所以本包没有 `groups[].title` → `label` 那一处落差
 *    （同批的 bandia 有，钉在那边）；
 * 4. `help` 只剩 `whenToUse` + `safety`：上游的 `workflows[]` / `commands[]` 是
 *    `NodeHelp`（`node-sdk/src/node.ts:156-159`）装不下的形状，且 `commands[].command`
 *    写的是旧壳的 `xiranite enginev`（本仓 bin 是 `enginev`）；`whenToUse` 上游是
 *    **单元素数组**，我们是 `LocalizedText` ⇒ 取那一条原文。
 *
 * 一处上游自带的**一致**也要钉住，免得被"顺手统一"错方向：`dryRun` 在内核
 * （`core.ts:177` 的 `?? true`）、清单（`{boolean: true}`）与上游终端面（`cli.ts:234`）
 * 三处都是预演。这与 `rawfilter` / `crashu` 那两份分叉相反，见 `tests/core.spec.ts`。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-enginev/tests/definition
 */

import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { dangerFor, nodeHelpFromManifest, parametersFor, validateNodeDefinition, type PreDecision } from '@hibernalglow/xaihi-sdk'
import { apply, type Config, name as packageName } from '../src/index.ts'

interface NodeShape {
  definitionVersion: number
  nodeId: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: { id: string; kind: string; label: { zh: string; en: string }; default?: unknown; options?: { value: unknown; label: { zh: string; en: string } }[]; rules?: unknown[]; range?: { min?: number; max?: number; step?: number }; visible?: { type: string; predicate?: { test: { type: string; actionField?: string } } } }[]
  groups: unknown[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; allowed?: unknown[]; fieldId?: string }; negated: boolean }[] }
  dangerPrompt: { title: { zh: string; en: string }; body: { zh: string; en: string }; confirmLabel: { zh: string; en: string } }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string; en: string }; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

const FIELD_IDS = [
  'action', 'workshopPath', 'titleFilter', 'ratingFilter', 'typeFilter', 'tagsText', 'idsText',
  'template', 'maxWorkers', 'dryRun', 'permanent', 'copyMode', 'targetPath', 'exportFormat',
  'exportPath', 'sortField', 'sortOrder', 'imageBackend', 'galleryColumns',
]

function ownNode(): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

/** 把清单喂进校验器；不合法就直接抛，下面的断言全是拿合法定义做的。 */
function validated() {
  const result = validateNodeDefinition(ownNode())
  if (!result.ok) throw new Error(`清单不合法：${result.errors.join('; ')}`)
  return result.value
}

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('enginev 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const workshop = broken.fields.find((field) => field.id === 'workshopPath')
    // 上游 `GuardedRule` 是 `{rule, when?}`；SDK 的 `fieldProperty` 读 `entry.rule.type`。
    workshop!.rules = [{ type: 'nonBlank' }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：range 挂在非 number 字段上、slot 引用了不存在的字段', () => {
    const badRange = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const targetPath = badRange.fields.find((field) => field.id === 'targetPath')
    if (targetPath === undefined) throw new Error('夹具里找不到 targetPath 字段')
    targetPath.range = { min: 0, max: 1 }
    const first = validateNodeDefinition(badRange)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('range belongs to number fields only')

    const badBinding = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badBinding.inputBindings.push({ fieldId: 'nope', slot: 'nope', transform: 'trim' })
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('unknown field')
  })

  it('阳性对照：把 `all` 闸门的谓词清空，装载期就该被拒（不是 ask 永不亮）', () => {
    const emptied = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    emptied.danger.predicates = []
    const check = validateNodeDefinition(emptied)
    // 顶层校验只认 `danger.type` 在词表里，所以这一步**过**——正因如此，下一条才是真尺：
    // 清空谓词的 `all` 在 `dangerFor` 里恒为"危险"，问的是不是该问的由下面的行为断言管。
    expect(check.ok).toBe(true)
    const def = validated()
    expect(dangerFor(def, undefined, 'rename', { dryRun: true })).toBeUndefined()
  })
})

describe('enginev 清单的词表逐字对上游', () => {
  it('五个动作、十九条字段、零条分组，标题与描述原样', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('enginev')
    expect(node.title).toEqual({ zh: 'EngineV', en: 'EngineV' })
    expect(node.description).toEqual({
      zh: '扫描、筛选、重命名、删除并导出 Wallpaper Engine 创意工坊文件夹。',
      en: 'Scan, filter, rename, delete, and export Wallpaper Engine workshop folders.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'filter', 'rename', 'delete', 'export'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['扫描', '筛选', '重命名', '删除', '导出'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Scan', 'Filter', 'Rename', 'Delete', 'Export'])
    expect(node.fields.map((field) => field.id)).toEqual(FIELD_IDS)
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'number',
      'boolean', 'boolean', 'boolean', 'text', 'select', 'text', 'select', 'select', 'select', 'number',
    ])
    // 上游这份清单的 `groups` 是空数组（落差 3）：不是漏搬，是上游就没分组。
    expect(node.groups).toEqual([])
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一，落差 1）', () => {
    const node = ownNode()
    expect(node.fields.find((field) => field.id === 'action')?.options?.map((option) => option.value))
      .toEqual(['scan', 'filter', 'rename', 'delete', 'export'])
    expect(node.fields.find((field) => field.id === 'exportFormat')?.options?.map((option) => option.value))
      .toEqual(['json', 'paths'])
    expect(node.fields.find((field) => field.id === 'sortField')?.options?.map((option) => option.value))
      .toEqual(['none', 'size', 'title', 'createdTime', 'modifiedTime'])
    expect(node.fields.find((field) => field.id === 'sortOrder')?.options?.map((option) => option.value))
      .toEqual(['desc', 'asc'])
    // `imageBackend` 那四项的**标题**逐字（上游把 SIXEL 优先写成"自动（SIXEL 优先）"）。
    const imageBackend = node.fields.find((field) => field.id === 'imageBackend')
    expect(imageBackend?.options?.map((option) => option.value)).toEqual(['auto', 'sixel', 'kitty', 'half-block'])
    expect(imageBackend?.options?.[0]?.label).toEqual({ zh: '自动（SIXEL 优先）', en: 'Auto (SIXEL first)' })
    // 阳性对照：18 处 `{text}` 一处都没剩下——序列化之后不许再出现 `"value":{"text"`。
    expect(JSON.stringify(node)).not.toContain('"value":{"text"')
    const upstreamShape = JSON.parse(JSON.stringify(node)) as NodeShape
    upstreamShape.fields.find((field) => field.id === 'action')!.options = [{ value: { text: 'scan' }, label: { zh: '扫描', en: 'Scan' } }]
    expect(typeof upstreamShape.fields.find((field) => field.id === 'action')!.options![0]!.value).toBe('object')
  })

  it('默认值逐字，含那条写死的 Windows 工坊路径', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; default?: unknown; range?: Record<string, number> }[] }
    expect(raw.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'scan' })
    expect(raw.fields.find((field) => field.id === 'workshopPath')?.default)
      .toEqual({ text: 'E:\\SteamLibrary\\steamapps\\workshop\\content\\431960' })
    expect(raw.fields.find((field) => field.id === 'template')?.default).toEqual({ text: '[#{id}]{original_name}+{title}' })
    const maxWorkers = raw.fields.find((field) => field.id === 'maxWorkers')
    expect(maxWorkers?.range).toEqual({ min: 1, max: 32, step: 1 })
    expect(maxWorkers?.default).toEqual({ number: 4 })
    // `dryRun` 三处一致：清单这里 true，内核 `core.ts:177` 也是 true。
    expect(raw.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    expect(raw.fields.find((field) => field.id === 'permanent')?.default).toEqual({ boolean: false })
    expect(raw.fields.find((field) => field.id === 'copyMode')?.default).toEqual({ boolean: false })
    expect(raw.fields.find((field) => field.id === 'exportFormat')?.default).toEqual({ text: 'json' })
    expect(raw.fields.find((field) => field.id === 'sortField')?.default).toEqual({ text: 'none' })
    expect(raw.fields.find((field) => field.id === 'sortOrder')?.default).toEqual({ text: 'desc' })
    expect(raw.fields.find((field) => field.id === 'imageBackend')?.default).toEqual({ text: 'auto' })
    const gallery = raw.fields.find((field) => field.id === 'galleryColumns')
    expect(gallery?.range).toEqual({ min: 0, max: 6, step: 1 })
    expect(gallery?.default).toEqual({ number: 0 })
  })

  it('字段标题逐字（含两个"看起来像装饰"的 TUI 字段）', () => {
    const node = ownNode()
    expect(node.fields.find((field) => field.id === 'workshopPath')?.label).toEqual({ zh: '工坊目录', en: 'Workshop path' })
    expect(node.fields.find((field) => field.id === 'idsText')?.label).toEqual({ zh: '已选工坊 ID', en: 'Selected workshop IDs' })
    expect(node.fields.find((field) => field.id === 'dryRun')?.label).toEqual({ zh: '预演', en: 'Dry-run' })
    expect(node.fields.find((field) => field.id === 'permanent')?.label).toEqual({ zh: '永久删除', en: 'Permanent delete' })
    expect(node.fields.find((field) => field.id === 'galleryColumns')?.label).toEqual({ zh: '列数（0 自动）', en: 'Columns (0 auto)' })
    expect(node.fields.find((field) => field.id === 'action')?.label).toEqual({ zh: '工作流', en: 'Workflow' })
  })

  it('绑定逐条对上游（17 条，其中四条是 `filters.` 点号槽位，两个 TUI 字段没有绑定）', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['workshopPath', 'workshopPath', 'trim'],
      ['titleFilter', 'filters.title', 'trimOrOmit'],
      ['ratingFilter', 'filters.contentRating', 'trimOrOmit'],
      ['typeFilter', 'filters.type', 'trimOrOmit'],
      ['tagsText', 'filters.tags', 'delimited'],
      ['idsText', 'ids', 'delimited'],
      ['template', 'template', 'identity'],
      ['maxWorkers', 'maxWorkers', 'asInteger'],
      ['dryRun', 'dryRun', 'asBoolean'],
      ['permanent', 'permanent', 'asBoolean'],
      ['copyMode', 'copyMode', 'asBoolean'],
      ['targetPath', 'targetPath', 'trimOrOmit'],
      ['exportFormat', 'exportFormat', 'trim'],
      ['exportPath', 'exportPath', 'trimOrOmit'],
      ['sortField', 'sortField', 'trim'],
      ['sortOrder', 'sortOrder', 'trim'],
    ])
    // 阳性对照：`imageBackend` / `galleryColumns` 没有绑定项 ⇒ 本包的 `Config` 也不声明它们
    //（声明了就是一个没有任何回读路径的旋钮，见 src/index.ts 文件头最后一段）。
    expect(ownNode().inputBindings.some((binding) => binding.fieldId === 'imageBackend')).toBe(false)
    expect(ownNode().inputBindings.some((binding) => binding.fieldId === 'galleryColumns')).toBe(false)
    const wiring = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(wiring).not.toContain('imageBackend: Schema')
    expect(wiring).not.toContain('galleryColumns: Schema')
  })

  it('危险闸门：rename/delete + 非预演；谓词里不许留 actionField（落差 2）', () => {
    const node = ownNode()
    expect(node.danger.type).toBe('all')
    expect(node.danger.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['rename', 'delete'] }, negated: false },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])
    expect(node.dangerPrompt).toEqual({
      title: { zh: '确认工坊操作', en: 'Confirm workshop operation' },
      body: { zh: '选中的工坊目录将被修改。', en: 'Selected workshop folders will be modified.' },
      confirmLabel: { zh: '确认执行', en: 'Run now' },
    })
    expect(JSON.stringify(node)).not.toContain('actionField')
  })

  it('help 只剩我们词表能装的那两块，whenToUse 是字符串（落差 4）', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '需要在工作区 UI 或 CLI 中使用该节点的文件工作流时，使用 EngineV。',
      en: "Use EngineV when you need this node's file workflow from either the workspace UI or CLI.",
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['在修改文件前，优先使用预览或 dry-run 模式。', '处理大文件夹时请保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
    const raw = JSON.stringify(node)
    expect(raw).not.toContain('xiranite enginev')
    expect(raw).not.toContain('workflows')
  })
})

describe('enginev 清单的 SDK 侧形状', () => {
  it('十九个字段全 visible ⇒ 五个动作的参数表都一样（上游这份没有一条动作相关可见性）', () => {
    const def = validated()
    const shared = FIELD_IDS.filter((id) => id !== 'action')
    for (const action of ['scan', 'filter', 'rename', 'delete', 'export']) {
      expect(Object.keys(parametersFor(def, action) ?? {})).toEqual(shared)
    }
    // `workshopPath` 的 `nonBlank` 没有 `when` ⇒ 抬成参数必填（define-node.ts:85-90）。
    expect(parametersFor(def, 'rename')?.workshopPath).toMatchObject({ type: 'string', required: true })
    expect(parametersFor(def, 'scan')?.dryRun).toMatchObject({ type: 'boolean' })
    expect(parametersFor(def, 'scan')?.maxWorkers).toMatchObject({ type: 'number' })
  })

  it('dangerFor：scan/filter/export 永不危险，rename/delete 只在预演关掉时要批准', () => {
    const def = validated()
    expect(dangerFor(def, undefined, 'scan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'filter', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'export', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'rename', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'delete', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'rename', { dryRun: false })?.zh).toContain('enginev')
    expect(dangerFor(def, undefined, 'delete', { dryRun: false })?.en).toContain('all')
    // 阳性对照（G8 那一族）：模型**没传** dryRun 时这条 ask 必须亮——
    // 省略在 `dangerFor` 这一侧读成"没在预演"，而内核缺省是预演，两者相反，
    // 所以批准缝只能往"多问"那一侧偏。
    expect(dangerFor(def, undefined, 'rename', {})).toBeDefined()
  })

  it('工具名是 <nodeId>_<actionId>，帮助页由清单推导', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'enginev' })
    expect(help.title).toBe('EngineV')
    expect(help.commands.map((command) => command.command)).toEqual(['enginev', '/enginev'])
    const examples = help.commands[0]!.examples.map((example) => example.command)
    expect(examples).toEqual(['enginev --help', 'enginev scan', 'enginev filter', 'enginev rename', 'enginev delete', 'enginev export'])
    // G7 没修完的那一半：本包不 `inject` `commands`、也没传 `command`，而推导器在
    // `options.command === undefined` 时仍按 `/${nodeId}` 兜一个默认值（node-sdk/src/help.ts:107）。
    // 本包能做的只有"不传"（见 src/help.ts 头部），这一条钉的是**现状**，不是认可。
    expect(help.commands[1]?.title).toBe('Host command (no model)')
  })
})

describe('enginev 宿主接线（apply → defineNode → 真内核 + 真盘）', () => {
  it('五条动作注册成五个工具，非预演的 rename 被拦成 ask，scan 真的跑内核', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      // cordis 的 ctx.effect：回调立即执行，它返回的函数被收作注销器（正典形状见 packages/node-sdk/tests/define-node.spec.ts:67）。
      effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: () => undefined,
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual([
      'enginev_scan', 'enginev_filter', 'enginev_rename', 'enginev_delete', 'enginev_export',
    ])
    expect(listeners).toHaveLength(1)

    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'enginev_rename', arguments: { dryRun: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'enginev_scan', arguments: { dryRun: false } }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // 工具真的跑内核，并且**没被批准就不许动盘**：scan 是只读的，盘上目录数不许变。
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-host-'))
    tempDirs.push(root)
    const workshop = join(root, 'workshop')
    await mkWallpaper(workshop, '111', 'Ocean Loop')
    const scan = registered.find((tool) => tool['name'] === 'enginev_scan')
    const output = await (scan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ workshopPath: workshop }, {})
    expect(output).toContain('Scan complete: 1 wallpaper(s).')
    expect((await readdir(workshop)).sort()).toEqual(['111'])
  })

  it('Config.workshopPath 只在表单没给的时候顶上去（ADR-0013 的使用点 .get()）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-enginev-host-'))
    tempDirs.push(root)
    const workshop = join(root, 'configured')
    await mkWallpaper(workshop, '222', 'Dark Room')
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      // cordis 的 ctx.effect：回调立即执行，它返回的函数被收作注销器（正典形状见 packages/node-sdk/tests/define-node.spec.ts:67）。
      effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
      on: (_event: string, _listener: unknown) => () => {},
      get: () => undefined,
    }
    apply(ctx as never, fakeConfig({ workshopPath: workshop }))
    const scan = registered.find((tool) => tool['name'] === 'enginev_scan')
    // 参数表把 `workshopPath` 标成必填（上游那条无条件的 `nonBlank`），所以工具层不许空着调；
    // 这里给一格空白，让"表单没给 ⇒ 落配置"这一条真被走到。
    const output = await (scan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ workshopPath: '   ' }, {})
    expect(output).toContain('Scan complete: 1 wallpaper(s).')
    // 阳性对照：表单给了就以表单为准（这里给一个不存在的目录，报的是**它**，不是配置那份）。
    // 内核把它折成 `success:false`，`src/index.ts` 的 `call()` 原样抛出（不咽成成功输出）。
    const missing = join(root, 'nope')
    await expect((scan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ workshopPath: missing }, {}))
      .rejects.toThrow(/nope/)
  })

  it('包名与清单里的 id 同源（装载期靠它匹配 cordis.patch.yml 那一行）', () => {
    expect(packageName).toBe('@hibernalglow/xaihi-enginev')
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { xaihi?: { id?: string } }
    expect(pkg.xaihi?.id).toBe('xaihi-enginev')
  })
})

/** 造一个能被内核认下来的工坊目录：只有带 `project.json` 的目录才算壁纸。 */
async function mkWallpaper (workshop: string, id: string, title: string): Promise<void> {
  const dir = join(workshop, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'project.json'), JSON.stringify({ title, type: 'Video', contentrating: 'Everyone', description: 'demo', tags: ['Demo'] }), 'utf8')
  await writeFile(join(dir, 'scene.mp4'), 'x'.repeat(11), 'utf8')
}

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig(overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values = {
    workshopPath: '', template: '', exportPath: '', exportFormat: '', maxWorkers: 0, ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
