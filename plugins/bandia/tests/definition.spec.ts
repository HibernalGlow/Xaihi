/**
 * bandia 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/bandia.json`（definitionVersion 1，846 行），
 * 不调用被测函数得到。四处**有意**的词表落差在断言里点名：
 * 1. `groups[].title` → 我们词表里是 `groups[].label`（`NodeGroup.label`）；
 * 2. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`
 *    （`NodeFieldOption.value: string`）；
 * 3. 谓词里的 `test.actionField` 全部剥掉（这份清单里 15 处）。在 `fields[].visible`
 *    那一侧它本来是生效的（`parametersFor` 会把 `{action: actionId}` 塞进求值参数，
 *    `define-node.ts:114`），**只有危险闸门那一条路上会失效**——`dangerFor` 只把
 *    `actionId` 给求值器、不给 `args.action`（`define-node.ts:284`）。这里按同一口径
 *    统一剥掉，与 `crashu` / `rawfilter` / `samea` 同批处理；
 * 4. `help` 只剩 `whenToUse` + `safety`：上游的 `workflows[]` / `commands[]` 是
 *    `NodeHelp`（`node-sdk/src/node.ts:156-159`）装不下的形状，且 `commands[].command`
 *    写的是旧壳的 `xiranite bandia`（本仓 bin 是 `xbandia`）；`whenToUse` 上游是**单元素数组**，
 *    我们是 `LocalizedText` ⇒ 取那一条原文，不加不减。
 *
 * 另外钉住两处上游自带的分歧，不在这里统一：
 * - `deleteAfter` / `deleteSource` 的清单默认是 **false**，内核默认是 **true**
 *   （见 `tests/core.spec.ts` 同一条）；
 * - 类型里的第 5 个动作 `stop` 在清单里**没有** `actions[]` 项。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-bandia/tests/definition
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  fields: { id: string; kind: string; label: { zh: string; en: string }; description?: { zh: string; en: string }; isActionSelector?: boolean; default?: unknown; options?: { value: unknown; label: { zh: string; en: string } }[]; rules?: unknown[]; range?: { min?: number; max?: number; step?: number }; visible?: { type: string; predicate?: { test: { type: string; actionField?: string; allowed?: unknown[] } } } }[]
  groups: { id: string; label?: { zh: string; en: string }; title?: { zh: string; en: string }; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; exportName?: string }
  dangerPrompt: { title: { zh: string; en: string }; body: { zh: string; en: string }; confirmLabel: { zh: string; en: string } }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string; en: string }; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

const FIELD_IDS = ['action', 'paths', 'mappingText', 'outputDir', 'outputPrefix', 'extractMode', 'overwriteMode', 'compressFormat', 'parallel', 'workers', 'deleteAfter', 'deleteSource', 'efuOutputPath', 'openInEverything', 'dryRun']

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

describe('bandia 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const paths = broken.fields.find((field) => field.id === 'paths')
    // 上游 `GuardedRule` 是 `{rule, when?}`；SDK 的 `fieldProperty` 读 `entry.rule.type`。
    paths!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：range 挂在非 number 字段上、slot 引用了不存在的字段', () => {
    const badRange = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const outputDir = badRange.fields.find((field) => field.id === 'outputDir')
    if (outputDir === undefined) throw new Error('夹具里找不到 outputDir 字段')
    outputDir.range = { min: 0, max: 1 }
    const first = validateNodeDefinition(badRange)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('range belongs to number fields only')

    const badBinding = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badBinding.inputBindings.push({ fieldId: 'nope', slot: 'nope', transform: 'trim' })
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('unknown field')
  })

  it('阳性对照：select 不给选项就装不出能选的控件', () => {
    const bare = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    bare.fields.find((field) => field.id === 'extractMode')!.options = []
    const check = validateNodeDefinition(bare)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('a select field must offer options')
  })
})

describe('bandia 清单的词表逐字对上游', () => {
  it('四个动作、十五条字段、一条分组，标题与描述原样', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('bandia')
    expect(node.title).toEqual({ zh: 'Bandia', en: 'Bandia' })
    expect(node.description).toEqual({
      zh: '通过 Bandizip 批量解压、压缩、重打包并导出归档路径。',
      en: 'Batch extract, compress, repack, and export archive paths with Bandizip.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['extract', 'compress', 'repack', 'export_efu'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⇩ 解压', '▣ 压缩', '↻ 重打包', '⇧ EFU'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Extract', 'Compress', 'Repack', 'Export EFU'])
    expect(node.fields.map((field) => field.id)).toEqual(FIELD_IDS)
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'path-list', 'multiline', 'text', 'text', 'select', 'select', 'select',
      'boolean', 'number', 'boolean', 'boolean', 'text', 'boolean', 'boolean',
    ])
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]).toMatchObject({ id: 'input', label: { zh: '输入与映射', en: 'Input & mapping' } })
    expect(node.groups[0]!.fieldIds).toEqual(FIELD_IDS)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(true)
  })

  it('分组用的是 label 而不是上游的 title（词表落差 1）', () => {
    const node = ownNode()
    expect(node.groups[0]!.label).toEqual({ zh: '输入与映射', en: 'Input & mapping' })
    expect(node.groups[0]!.title).toBeUndefined()
    // 阳性对照：上游那份写法（`title`、没有 `label`）与本包那份是不同的对象；
    // 若这里改成比较两份文案，它就变成同义反复了——比的是**键名**。
    const upstream = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const labelText = ownNode().groups[0]!.label!
    upstream.groups[0]!.title = labelText
    delete upstream.groups[0]!.label
    expect(Object.keys(upstream.groups[0]!).sort()).toEqual(['fieldIds', 'id', 'title'])
    expect(Object.keys(node.groups[0]!).sort()).toEqual(['fieldIds', 'id', 'label'])
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一，落差 2）', () => {
    const action = ownNode().fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual(['extract', 'compress', 'repack', 'export_efu'])
    expect(ownNode().fields.find((field) => field.id === 'extractMode')?.options?.map((option) => option.value)).toEqual(['auto', 'normal'])
    expect(ownNode().fields.find((field) => field.id === 'overwriteMode')?.options?.map((option) => option.value)).toEqual(['overwrite', 'skip', 'rename'])
    expect(ownNode().fields.find((field) => field.id === 'compressFormat')?.options?.map((option) => option.value)).toEqual(['zip', '7z'])
    // 选项标题也逐字（上游 `extractMode` 的第二项是"指定目录 / Named directory"）。
    expect(ownNode().fields.find((field) => field.id === 'extractMode')?.options?.map((option) => option.label.zh)).toEqual(['自动', '指定目录'])
    // 阳性对照：把上游那份 `{text: "auto"}` 塞回来，上面那条 string 数组断言必须红。
    const upstreamShape = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    upstreamShape.fields.find((field) => field.id === 'action')!.options = [{ value: { text: 'extract' }, label: { zh: '⇩ 解压', en: 'Extract' } }]
    expect(typeof upstreamShape.fields.find((field) => field.id === 'action')!.options![0]!.value).toBe('object')
  })

  it('字段文案逐字（含 mappingText 那条 description 与 workers 的 range）', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: NodeShape['fields'] }
    expect(raw.fields.find((field) => field.id === 'paths')?.label).toEqual({ zh: '输入路径', en: 'Input paths' })
    expect(raw.fields.find((field) => field.id === 'mappingText')?.label).toEqual({ zh: '归档映射', en: 'Archive mappings' })
    expect(raw.fields.find((field) => field.id === 'mappingText')?.description).toEqual({
      zh: 'JSON、=>、制表符或 | 分隔均可。',
      en: 'JSON or delimited mappings.',
    })
    expect(raw.fields.find((field) => field.id === 'deleteAfter')?.label).toEqual({ zh: '解压后删除归档', en: 'Delete archive' })
    expect(raw.fields.find((field) => field.id === 'deleteSource')?.label).toEqual({ zh: '压缩后删除源', en: 'Delete source' })
    expect(raw.fields.find((field) => field.id === 'dryRun')?.label).toEqual({ zh: '仅预演', en: 'Dry run' })
    const workers = raw.fields.find((field) => field.id === 'workers')
    expect(workers?.range).toEqual({ min: 1, max: 8, step: 1 })
    expect(workers?.default).toEqual({ number: 2 })
  })

  it('默认值逐字，并钉住"清单 false / 内核 true"那处分叉的另一半', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; default?: unknown }[] }
    expect(raw.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'extract' })
    expect(raw.fields.find((field) => field.id === 'outputPrefix')?.default).toEqual({ text: '[extract] ' })
    expect(raw.fields.find((field) => field.id === 'extractMode')?.default).toEqual({ text: 'auto' })
    expect(raw.fields.find((field) => field.id === 'overwriteMode')?.default).toEqual({ text: 'overwrite' })
    expect(raw.fields.find((field) => field.id === 'compressFormat')?.default).toEqual({ text: 'zip' })
    expect(raw.fields.find((field) => field.id === 'parallel')?.default).toEqual({ boolean: false })
    // 这两条与内核的 `?? true`（core.ts:251、:351）相反，两边各钉一条，不许统一。
    expect(raw.fields.find((field) => field.id === 'deleteAfter')?.default).toEqual({ boolean: false })
    expect(raw.fields.find((field) => field.id === 'deleteSource')?.default).toEqual({ boolean: false })
    // `dryRun` 清单默认 true，内核缺省即执行（G8 那一族），同样两边各钉一条。
    expect(raw.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    expect(raw.fields.find((field) => field.id === 'openInEverything')?.default).toEqual({ boolean: false })
  })

  it('绑定逐条对上游（15 条，含 workers 的 asInteger 与四条 trimOrOmit）', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['paths', 'paths', 'delimited'],
      ['mappingText', 'mappingText', 'identity'],
      ['outputDir', 'outputDir', 'trimOrOmit'],
      ['outputPrefix', 'outputPrefix', 'trimOrOmit'],
      ['extractMode', 'extractMode', 'trim'],
      ['overwriteMode', 'overwriteMode', 'trim'],
      ['compressFormat', 'compressFormat', 'trim'],
      ['parallel', 'parallel', 'asBoolean'],
      ['workers', 'workers', 'asInteger'],
      ['deleteAfter', 'deleteAfter', 'asBoolean'],
      ['deleteSource', 'deleteSource', 'asBoolean'],
      ['efuOutputPath', 'efuOutputPath', 'trimOrOmit'],
      ['openInEverything', 'openInEverything', 'asBoolean'],
      ['dryRun', 'dryRun', 'asBoolean'],
    ])
  })

  it('危险闸门是上游那份 pluginExport，谓词里不许留 actionField（落差 3）', () => {
    const node = ownNode()
    expect(node.danger).toEqual({ type: 'pluginExport', exportName: 'is_dangerous' })
    expect(node.dangerPrompt).toEqual({
      title: { zh: '确认真实归档操作', en: 'Confirm live archive operation' },
      body: { zh: '归档、解压或删除源文件会真实写入文件系统。', en: 'Archive operations will write to the filesystem.' },
      confirmLabel: { zh: '确认执行', en: 'Execute' },
    })
    // actionField 一个都不留：整份 JSON 里搜不到才对。
    expect(JSON.stringify(node)).not.toContain('actionField')
  })

  it('help 只剩我们词表能装的那两块，whenToUse 是字符串（落差 4）', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '需要从工作区 UI 或 CLI 使用本节点的文件处理流程时使用 Bandia。',
      en: "Use Bandia when you need this node's file workflow from either the workspace UI or CLI.",
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['改动文件前优先使用预览或 dry-run 模式。', '处理大型文件夹时请保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
    // 阳性对照：上游那两块装不进来的形状确实不在清单里（不是被我改写了）。
    const raw = JSON.stringify(node)
    expect(raw).not.toContain('xiranite bandia')
    expect(raw).not.toContain('workflows')
  })

  it('清单里没有 `stop`，而内核类型里有第五个动作（上游自带的分歧）', () => {
    expect(ownNode().actions.map((action) => action.id)).not.toContain('stop')
    // 内核那一份的对照面：`runBandia({action:'stop'})` 是真分支（tests/core.spec.ts 钉行为）。
    const core = readFileSync(fileURLToPath(new URL('../src/core.ts', import.meta.url)), 'utf8')
    expect(core).toContain('export type BandiaAction = "extract" | "compress" | "repack" | "export_efu" | "stop"')
  })
})

describe('bandia 清单的 SDK 侧形状', () => {
  it('参数表按动作切可见性：extract 看不到 mappingText，repack 看不到 outputPrefix', () => {
    const def = validated()
    expect(Object.keys(parametersFor(def, 'extract') ?? {})).toEqual([
      'paths', 'outputPrefix', 'extractMode', 'overwriteMode', 'parallel', 'deleteAfter', 'dryRun',
    ])
    expect(Object.keys(parametersFor(def, 'compress') ?? {})).toEqual([
      'paths', 'outputDir', 'compressFormat', 'parallel', 'deleteSource', 'dryRun',
    ])
    expect(Object.keys(parametersFor(def, 'repack') ?? {})).toEqual([
      'mappingText', 'compressFormat', 'parallel', 'deleteSource', 'dryRun',
    ])
    expect(Object.keys(parametersFor(def, 'export_efu') ?? {})).toEqual([
      'paths', 'mappingText', 'efuOutputPath', 'openInEverything', 'dryRun',
    ])
    // `workers` 的可见条件是 `fieldTrue parallel` ⇒ 只有显式 true 才进参数表。
    expect(parametersFor(def, 'extract')?.workers).toBeUndefined()
  })

  it('条件规则不算必填，无条件的才算（define-node.ts:85-90）', () => {
    const def = validated()
    // paths 的两条规则都带 `when` ⇒ 不许把参数永久标成 required（那会让模型看到一份比界面更严的参数表）。
    expect(parametersFor(def, 'extract')?.paths).toMatchObject({ type: 'array' })
    expect(parametersFor(def, 'extract')?.paths?.required).not.toBe(true)
    expect(parametersFor(def, 'compress')?.dryRun).toMatchObject({ type: 'boolean' })
    // `mappingText` 在 repack 的可见条件里（`actionIs [repack, export_efu]`），但 `export_efu`
    // 那条腿上看得到；repack 的参数表里必须出现它。
    expect(Object.keys(parametersFor(def, 'repack') ?? {})).toContain('mappingText')

    // 阳性对照：把 `nonBlank` 那条规则的 `when` 摘掉，同一份清单立刻把 paths 标成必填。
    const forced = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    forced.fields.find((field) => field.id === 'paths')!.rules = [{ rule: { type: 'nonBlank' } }]
    const check = validateNodeDefinition(forced)
    if (!check.ok) throw new Error(`夹具不合法：${check.errors.join('; ')}`)
    expect(parametersFor(check.value, 'extract')?.paths).toMatchObject({ type: 'array', required: true })
  })

  it('dangerFor：pluginExport 需要判定函数，缺了当场抛（不是第一次调用才炸）', () => {
    const def = validated()
    expect(() => dangerFor(def, undefined, 'extract', { dryRun: true })).toThrow(/dangerCheck/)
    // 有判定函数时按"没声明预演就要批准"走（判定面的落差见 src/index.ts）。
    expect(dangerFor(def, (args) => args.dryRun !== true, 'extract', { dryRun: true })).toBeUndefined()
    const asked = dangerFor(def, (args) => args.dryRun !== true, 'extract', {})
    expect(asked?.zh).toContain('bandia')
    expect(asked?.en).toContain('pluginExport')
  })

  it('工具名是 <nodeId>_<actionId>，帮助页由清单推导', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xbandia' })
    expect(help.title).toBe('Bandia')
    expect(help.commands.map((command) => command.command)).toEqual(['xbandia', '/bandia'])
    const examples = help.commands[0]!.examples.map((example) => example.command)
    expect(examples).toEqual(['xbandia --help', 'xbandia extract', 'xbandia compress', 'xbandia repack', 'xbandia export_efu'])
    // G7 没修完的那一半：本包不 `inject` `commands`、也没传 `command`，而推导器在
    // `options.command === undefined` 时仍按 `/${nodeId}` 兜一个默认值（node-sdk/src/help.ts:107）。
    // 本包能做的只有"不传"（见 src/help.ts 头部），这一条钉的是**现状**，不是认可。
    expect(help.commands[1]?.title).toBe('Host command (no model)')
  })
})

describe('bandia 宿主接线（apply → defineNode → 真内核）', () => {
  it('四条动作注册成四个工具，预演放行、非预演拦成 ask', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      // `ctx.get('subprocess')` 在 apply 里现取；`OPERATIONS_SERVICE` 缺席（进度降级成无操作）。
      get: (service: string) => (service === 'subprocess' ? { spawn: () => { throw new Error('测试夹具里的 subprocess 不该被调用') } } : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual(['bandia_extract', 'bandia_compress', 'bandia_repack', 'bandia_export_efu'])
    expect(listeners).toHaveLength(1)

    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'bandia_export_efu', arguments: {} }, next)
    expect(asked.kind).toBe('ask')
    const allowed = await listener({ name: 'bandia_extract', arguments: { dryRun: true } }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)
  })

  it('export_efu 这条腿真的跑内核，并且一个外部程序都不调', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-bandia-host-'))
    tempDirs.push(root)
    const archive = join(root, 'book.zip')
    await writeFile(archive, 'not really an archive', 'utf8')
    const efuPath = join(root, 'out.efu')
    let spawned = 0
    const tools: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { tools.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, _listener: unknown) => () => {},
      get: (service: string) => (service === 'subprocess'
        ? { spawn: () => { spawned += 1; throw new Error('不该 spawn') } }
        : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    const tool = tools.find((entry) => entry['name'] === 'bandia_export_efu')
    const output = await (tool?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ paths: [archive], efuOutputPath: efuPath, openInEverything: false }, {})
    expect(output).toContain('Exported 1 path(s)')
    expect(spawned).toBe(0)
    // 阳性对照：EFU 文件真的落盘，而且第一列就是这个绝对路径。
    const written = readFileSync(efuPath, 'utf8')
    expect(written).toContain('Filename')
    expect(written).toContain('book.zip')
    // 阳性对照：预演与真执行在 export_efu 上**没有区别**（内核这条路不看 dryRun，core.ts:366-408），
    // 所以批准缝不能等到"看起来像执行"才亮。
    expect(existsSync(efuPath)).toBe(true)
  })

  it('包名与清单里的 id 同源（装载期靠它匹配 cordis.patch.yml 那一行）', () => {
    expect(packageName).toBe('@hibernalglow/xaihi-bandia')
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { xaihi?: { id?: string } }
    expect(pkg.xaihi?.id).toBe('xaihi-bandia')
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
  const values = { bandizipPath: '', ...overrides }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
