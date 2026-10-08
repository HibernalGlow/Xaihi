/**
 * trename 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门、账本闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/trename.json`（definitionVersion 1）。
 *   上游那份**没有** `runtime` / `host_functions` / `executor` 这三个宿主执行字段，
 *   所以这一轮"剥掉宿主执行字段"是空集（下面第一条用例钉住它，剥无可剥也要说得出来）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作六条、字段十二条、分组两条、绑定十二条，参数表那几组键名是照定义里的
 *   `isActionSelector` 与各条 `visible` 手推出来的，不由被测函数算出来。
 *
 * 四条**有意**偏离上游清单，逐条与理由（与 crashu 先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"scan"}` 摊平成 `"scan"`：SDK 的 `fieldProperty`
 *    把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`。**文案照上游原样。**
 * 3. `help` 只留 `whenToUse`（每语言一条）与 `safety`：上游那两大块 `workflows` / `commands`
 *    说的是旧壳的 `xiranite trename …` 命令名，本仓 bin 是 `trename`（ADR-0010）。
 * 4. `danger` 的 `actionIs` 谓词**去掉** `actionField: "action"`：`defineNode` 的参数表里没有
 *    动作选择器（`parametersFor` 明令跳过 `isActionSelector`），`dangerFor` 的 `all` 分支只看
 *    `exec.arguments`，留着那条就会得到"危险闸门永远不亮"。字段 `visible` 里那条 `actionField`
 *    反而要留：`parametersFor` 会自己造 `{[selector.id]: actionId}` 喂给可见性求值。
 *
 * 另有一条**不偏离清单、偏离同批先例**的：`src/help.ts` 不传 `command`
 * （缺口台账 G7：本包 `inject` 只有 `tools`，宿主里没有 `/trename`）。最后一条用例钉住它。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-trename/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  dangerFor,
  defineNode,
  parametersFor,
  validateManifest,
  validateNodeDefinition,
  type NodeCondition,
  type NodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { apply, Config, inject, name } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  xaihi?: { node?: unknown }
  bin?: Record<string, string>
  exports?: Record<string, unknown>
}

function definition(): NodeDefinition {
  const result = validateNodeDefinition(pkg.xaihi?.node)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

/** 参数表的一个本地视图（`ParameterPropertySpec` 是几种形状的联合，`.enum` 只在其一上存在）。 */
type PropertyView = { type?: string; enum?: unknown[]; required?: boolean }

/** `ctx.tools.register` 收到的东西（`defineTool` 整理过参数表，所以读 `properties`）。 */
interface RegisteredTool {
  name: string
  description: string
  parameters: { properties: Record<string, PropertyView> }
}

/** 只够 `defineNode` 用的假上下文：捕获注册，别的一概不做。 */
function fakeContext(): { ctx: never; registered: RegisteredTool[] } {
  const registered: RegisteredTool[] = []
  const ctx = {
    tools: { register: (tool: RegisteredTool) => { registered.push(tool); return () => undefined } },
    // cordis 的 ctx.effect：回调立即执行，它返回的函数被收作注销器（正典形状见 packages/node-sdk/tests/define-node.spec.ts:67）。
    effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
    on: () => () => undefined,
    get: () => undefined,
  }
  return { ctx: ctx as never, registered }
}

const config = {
  undoPath: { get: () => '' },
  enableUndo: { get: () => true },
}

// 上游 `node-definitions/trename.json` 里 `paths` 那条规则的 `when`（照原样，含 `actionField`）。
const scanVisible: NodeCondition = {
  type: 'single',
  predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['scan'] }, negated: false },
}

describe('trename 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('trename')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'import', 'validate', 'rename', 'undo', 'history'])
    expect(node.fields).toHaveLength(12)
    expect(node.groups).toHaveLength(2)
    expect(node.groups.map((group) => group.id)).toEqual(['source', 'options'])
    expect(node.groups[0]?.fieldIds).toHaveLength(4)
    expect(node.groups[1]?.fieldIds).toHaveLength(8)
    expect(node.inputBindings).toHaveLength(12)
    expect(node.danger?.type).toBe('all')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 阳性对照：上游那三个宿主执行字段本来就没有；哪天有人搬进来，这里必须红。
    for (const hostKey of ['runtime', 'host_functions', 'executor']) {
      expect(node as unknown as Record<string, unknown>).not.toHaveProperty(hostKey)
    }
    // 阳性对照：清单 schema 写错一个字符，`validateManifest` 就必须拒绝而不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：动作与字段的 id、标签、默认值、区间、guard 规则一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'Trename', en: 'Trename' })
    expect(node.description.zh).toBe('将文件夹扫描为重命名 JSON，校验翻译目标，执行重命名并撤销。')
    expect(node.description.en).toBe('Scan folders into rename JSON, validate translated targets, rename, and undo.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['扫描', '导入', '校验', '重命名', '撤销', '历史'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Scan', 'Import', 'Validate', 'Rename', 'Undo', 'History'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'paths', 'jsonContent', 'basePath', 'includeHidden', 'includeRoot', 'mode',
      'maxLines', 'compact', 'dryRun', 'batchId', 'undoPath',
    ])
    // 上游 `node-definitions/trename.json` 里这几条字面值，逐条钉住。
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'path-list', 'multiline', 'text', 'boolean', 'boolean', 'select', 'number', 'boolean', 'boolean', 'text', 'text',
    ])
    const maxLines = node.fields.find((field) => field.id === 'maxLines')
    expect(maxLines?.range).toEqual({ min: 0, step: 100 })
    expect(maxLines?.default).toEqual({ number: 1000 })
    expect(maxLines?.rules).toEqual([{ rule: { type: 'integerAtLeast', minimum: 0 } }])
    expect(node.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'includeRoot')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'includeHidden')?.default).toEqual({ boolean: false })
    expect(node.fields.find((field) => field.id === 'compact')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'scan' })
    // 上游那两条 `lines`（多行控件的行数）不在本仓 `NodeField` 的词表里，但清单原样带着它，
    // 面板按它渲染 ⇒ 用本地视图读出来钉住。
    const pathsField = node.fields.find((field) => field.id === 'paths') as unknown as { lines?: number }
    expect(pathsField?.lines).toBe(4)
    const jsonField = node.fields.find((field) => field.id === 'jsonContent') as unknown as { lines?: number }
    expect(jsonField?.lines).toBe(8)
    // `paths` 与 `jsonContent` 的规则上游带 `when`（`GuardedRule` 的那一层），原样留着。
    expect(node.fields.find((field) => field.id === 'paths')?.rules).toEqual([
      { rule: { type: 'atLeastLines', minimum: 1 }, when: scanVisible },
    ])
    expect(node.fields.find((field) => field.id === 'jsonContent')?.rules).toEqual([
      {
        rule: { type: 'nonBlank' },
        when: { type: 'single', predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['import', 'validate', 'rename'] }, negated: false } },
      },
    ])
    // 偏离 1：select 的值是裸字符串（上游是 `{text: "…"}`），标签照上游双语。
    expect(node.fields.find((field) => field.id === 'action')?.options?.map((option) => option.value))
      .toEqual(['scan', 'import', 'validate', 'rename', 'undo', 'history'])
    expect(node.fields.find((field) => field.id === 'mode')?.options).toEqual([
      { value: 'normal', label: { zh: '常规', en: 'Normal' } },
      { value: 'leak', label: { zh: '泄漏前缀清理', en: 'Leak prefix' } },
    ])
    // 偏离 2：分组标签叫 label（上游叫 title），文案一字不改。
    expect(node.groups.map((group) => group.label)).toEqual([
      { zh: '来源', en: 'Source' },
      { zh: '选项与安全', en: 'Options & safety' },
    ])
    // 上游的 dangerPrompt 整块留着（标题 / 正文 / 确认按钮的原文）。
    expect((node as unknown as { dangerPrompt?: unknown }).dangerPrompt).toEqual({
      title: { zh: '确认真实重命名', en: 'Confirm live rename' },
      body: { zh: '文件将被移动。请先检查路径差异与冲突列表。', en: 'Files will be moved. Review all diffs and conflicts first.' },
      confirmLabel: { zh: '确认移动文件', en: 'Move files' },
    })
    // 偏离 3：help 只剩 whenToUse + safety；旧壳的 workflows / commands 两块整块不在。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])
    expect(node.help?.whenToUse?.zh).toBe('需要从工作区 UI 或 CLI 使用该节点的文件流程时，可使用 Trename。')

    // 阳性对照：`atLeastLines` 那条 `when` 一旦被摊平成 `{type,minimum}`，装载期就被拒（偏离之外的
    // 上游形状错误，本仓一度犯过）。
    const flat = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    flat.fields.find((field) => field.id === 'paths')!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    expect(validateNodeDefinition(flat).ok).toBe(false)
    // 阳性对照：select 的值换成上游那份标量，模型侧的 enum 就变成一堆对象。
    type EnumView = { enum?: unknown[] }
    const renameProps = parametersFor(node, 'rename') as unknown as Record<string, EnumView>
    expect(renameProps.jsonContent).toBeDefined()
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    const modeField = wrapped.fields.find((field) => field.id === 'mode')!
    modeField.options = modeField.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    const scanWrapped = parametersFor(wrapped, 'scan') as unknown as Record<string, EnumView>
    expect(scanWrapped.mode?.enum).toEqual([{ text: 'normal' }, { text: 'leak' }])
  })

  it('参数表按动作切可见性：每条动作只看到上游声明的那几个字段', () => {
    const node = definition()
    // 手推（照各条 `visible` 的 actionIs 列表）：动作选择器自己永远不进参数表。
    expect(Object.keys(parametersFor(node, 'scan') as Record<string, unknown>))
      .toEqual(['paths', 'includeHidden', 'includeRoot', 'mode', 'maxLines', 'compact'])
    expect(Object.keys(parametersFor(node, 'import') as Record<string, unknown>)).toEqual(['jsonContent'])
    expect(Object.keys(parametersFor(node, 'validate') as Record<string, unknown>)).toEqual(['jsonContent', 'basePath'])
    expect(Object.keys(parametersFor(node, 'rename') as Record<string, unknown>)).toEqual(['jsonContent', 'basePath', 'dryRun', 'undoPath'])
    expect(Object.keys(parametersFor(node, 'undo') as Record<string, unknown>)).toEqual(['batchId', 'undoPath'])
    expect(Object.keys(parametersFor(node, 'history') as Record<string, unknown>)).toEqual(['undoPath'])
    expect(parametersFor(node, 'scan').action).toBeUndefined()

    // 路径列表是数组、布尔是布尔、数字是数字（`fieldProperty` 的三档映射）。
    const scanProps = parametersFor(node, 'scan') as unknown as Record<string, PropertyView>
    expect(scanProps.paths?.type).toBe('array')
    expect(scanProps.maxLines?.type).toBe('number')
    expect(scanProps.compact?.type).toBe('boolean')

    // 阳性对照：`fieldProperty` 只把**没有 when 的** `required` / `nonBlank` 当必填
    // （`define-node.ts:85-86`）。上游 `paths` 那条是带 when 的 `atLeastLines` ⇒ 永远不必填；
    // 换成没有 when 的 `nonBlank` 才亮。这条尺防的是"参数表比界面更严"那一类分叉。
    expect(scanProps.paths?.required).toBeUndefined()
    const unconditional = JSON.parse(JSON.stringify(node)) as NodeDefinition
    unconditional.fields.find((field) => field.id === 'paths')!.rules = [{ rule: { type: 'nonBlank' } }]
    const strictProps = parametersFor(unconditional, 'scan') as unknown as Record<string, PropertyView>
    expect(strictProps.paths?.required).toBe(true)
    // 阳性对照：同一条 `nonBlank` 只要把 when 加回去，必填就又没了（条件规则不算必填）。
    const guarded = JSON.parse(JSON.stringify(node)) as NodeDefinition
    guarded.fields.find((field) => field.id === 'paths')!.rules = [{ rule: { type: 'nonBlank' }, when: scanVisible }]
    expect((parametersFor(guarded, 'scan') as unknown as Record<string, PropertyView>).paths?.required).toBeUndefined()
  })

  it('危险闸门与定义同源：rename + 非预演才要批准', () => {
    const node = definition()
    // 偏离 4：谓词里没有 actionField（`dangerFor` 的 all 分支只看参数表）。
    expect(node.danger?.predicates?.[0]?.test).toEqual({ type: 'actionIs', allowed: ['rename'] })
    expect(dangerFor(node, undefined, 'scan', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'undo', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'rename', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'rename', { dryRun: false })?.zh).toContain('trename')
    // 模型没写 dryRun 时**按危险算**（保守方向）：内核那份默认是预演（`core.ts:200`），
    // 多问一次批准不改变磁盘，反过来才会。
    expect(dangerFor(node, undefined, 'rename', {})).toBeDefined()

    // 阳性对照：把上游那句 `actionField: "action"` 放回去，闸门就永远不亮——
    // 这条就是"为什么必须偏离"的证据，不是装饰。
    const withActionField = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withActionField.danger!.predicates![0]!.test.actionField = 'action'
    expect(dangerFor(withActionField, undefined, 'rename', { dryRun: false })).toBeUndefined()
  })

  it('apply 给六个动作各注册一个工具，名字是 trename_<action>', () => {
    expect(name).toBe('@hibernalglow/xaihi-trename')
    expect(inject).toEqual(['tools'])
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name)).toEqual([
      'trename_scan', 'trename_import', 'trename_validate', 'trename_rename', 'trename_undo', 'trename_history',
    ])
    expect(registered[0]?.description).toContain('Trename')

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'translate', label: { zh: '翻译', en: 'Translate' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        handlers: {
          scan: async () => '', import: async () => '', validate: async () => '',
          rename: async () => '', undo: async () => '', history: async () => '',
        },
      })
    }).toThrow(/no handler for action "translate"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[2]!.rules = [{ type: 'nonBlank' }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken,
        handlers: {
          scan: async () => '', import: async () => '', validate: async () => '',
          rename: async () => '', undo: async () => '', history: async () => '',
        },
      })
    }).toThrow(/must be a guarded rule object/)
  })

  it('Config 两个键有默认值：undoPath 空串 = 没配，enableUndo 默认开', () => {
    // 读法照 schemastery 的 `dict`（每个键一份代理，`refs` 里那条就是声明本身）。
    const dict = (Config as unknown as {
      dict: Record<string, { meta?: Record<string, unknown>; type?: string }>
    }).dict
    const metaOf = (key: string): Record<string, unknown> | undefined => dict[key]?.meta
    // 期望值手写（照 `src/index.ts` 的声明）：上游 `enable_undo` 的默认是真（`cli.ts:74`）。
    expect(metaOf('undoPath')).toEqual({ default: '', volatile: true })
    expect(metaOf('enableUndo')).toEqual({ default: true, volatile: true })
    // 阳性对照：键名漂一个字符就查不到默认值。
    expect(metaOf('historyPath')).toBeUndefined()
  })

  it('bin / exports / cli-support / help 的接线形状：trename 指向 lib/cli.js，help 不声明斜杠命令', async () => {
    expect(pkg.bin).toEqual({ trename: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const helpSource = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    // 剥掉注释再扫：文件头那段就是在讲"为什么不传 command"，留着注释这把尺永远红。
    const helpCode = helpSource.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
    // 缺口台账 G7：本包 `inject` 没有 `commands` ⇒ help.ts 不许传 `command`。
    expect(helpCode).not.toContain('command:')
    expect(inject).not.toContain('commands')
    // 阳性对照：把这条尺拿一份"传了 command"的副本喂一遍，必须抓得到。
    const mutated = helpCode.replace("{ bin: 'trename' }", "{ bin: 'trename', command: '/trename' }")
    expect(mutated).toContain('command:')

    const { help } = await import('../src/help.ts')
    // 期望值手抄推导器的规则：bin 是 trename，示例行按清单里的动作列。
    expect(help.title).toBe('Trename')
    expect(help.commands[0]?.command).toBe('trename')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'trename --help', 'trename scan', 'trename import', 'trename validate',
      'trename rename', 'trename undo', 'trename history',
    ])
    // 现状钉住（不是认可）：推导器在 `command` 缺席时仍按 `/${nodeId}` 兜底
    // （`packages/node-sdk/src/help.ts:108`），所以这一屏还会印 `/trename`。
    // 要让本包的帮助页不再宣传一条没注册的命令，得改推导器（G7 的修法）。
    expect(help.commands[1]?.command).toBe('/trename')

    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const { nodeHelpFromManifest } = await import('@hibernalglow/xaihi-sdk')
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'trename' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual([
      'trename --help', 'trename scan', 'trename import', 'trename validate', 'trename rename', 'trename undo',
    ])
  })

  it('bin 面不许出现 @xiranite/ 或 @deepseek-ai/dsh 的本地路径', () => {
    const files = ['src/cli.ts', 'src/cli-support.ts', 'src/core.ts', 'src/platform.ts', 'src/contract.ts', 'src/help.ts']
    for (const file of files) {
      const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')
      // 注释里允许出现"上游那个包叫什么"（ADR-0010 的出处位），运行时的说明符不行。
      const code = source.split('\n').filter((line) => /^\s*(import|export)[^\n]*from\s+['"]/.test(line)).join('\n')
      expect(code).not.toContain('@xiranite/')
      expect(code).not.toContain('@deepseek-ai/dsh/')
    }
    // 终端面那一档（cli.ts）连 SDK 都不许 import：那是独立 bin，装了 cordis 就起不来。
    const cli = readFileSync(fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'utf8')
    expect(cli).not.toContain('@hibernalglow/xaihi-sdk')
    expect(cli).not.toContain('@deepseek-ai/cordis')
  })
})
