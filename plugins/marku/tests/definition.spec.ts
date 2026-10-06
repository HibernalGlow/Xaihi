/**
 * marku 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门、
 * 账本闸门与终端面接线。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/marku.json`（definitionVersion 1），
 *   下面钉住的每一条字面值（标题、描述、四个动作标签、九个模块标签、默认值、
 *   `GuardedRule` 的 `when` 谓词）都是从那份 JSON 手抄的。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`；谓词求值是 `conditions.ts` 那一个求值器。
 * - 期望值全部手写：动作四条、字段十条、绑定十条、四个动作各自的参数表键名，
 *   是照定义里的 `isActionSelector` 与 `visible` 手推出来的，不由被测函数算出来
 *   （推的过程写在用例注释里）。
 *
 * 六条**有意**偏离上游清单的地方在这里点名并钉住（逐条理由写在 `package.json` 旁边
 * 与移植报告里，与 `crashu` 的先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"markt"}` 摊平成 `"markt"`：SDK 的 `fieldProperty`
 *    把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串）：上游那两大块 `workflows` / `commands`
 *    说的是旧壳的 `xiranite marku …` 命令名，本仓的 bin 是 `xmarku`（ADR-0010），
 *    照抄等于把"按帮助页敲一条不存在的命令"写进发布物。终端那一屏由 `src/help.ts` 从清单推导。
 * 4. `danger` 从上游的 `pluginExport(is_dangerous)` 翻成 `all` 两条谓词，逐字对应
 *    `src/interaction.ts` 那句 `action === "undo" || (action === "run" && dryRun === false)`；
 *    `actionIs` **去掉** `actionField: "action"`（`parametersFor` 明令跳过动作选择器，
 *    留着就得到"危险闸门永远不亮"，与 `crashu` 偏离 4 同一条），`allowed` 因此读的是
 *    `dangerFor` 传进来的 `actionId`。
 * 5. `dashboard` 整块不搬：`xaihi.node/v1` 没有这一族（`scripts/check-vocab.mjs` 的头注释
 *    写明"接了就等于在 Xaihi 里再造一条上游执行模型"）。
 * 6. `inputBindings[].defaultExport` 删掉：词表里 `NodeInputBinding` 没这个键，本仓没有消费者。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-marku/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  bindInputs,
  defineNode,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateManifest,
  validateNodeDefinition,
  type NodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { Config, apply, inject, name } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  name?: string
  xaihi?: { node?: unknown }
  bin?: Record<string, string>
  exports?: Record<string, unknown>
}

function definition(): NodeDefinition {
  const result = validateNodeDefinition(pkg.xaihi?.node)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

/** 拒绝路径的读法：不合法时返回全部错误；合法就抛（正控不许拿"没报错"当"报错对了"）。 */
function rejectErrors(raw: unknown): string[] {
  const result = validateNodeDefinition(raw)
  if (result.ok) throw new Error('expected rejection, got acceptance')
  return result.errors
}

/** `ctx.tools.register` 收到的东西（`defineTool` 整理过参数表，所以读 `properties`）。 */
interface RegisteredTool {
  name: string
  description: string
  parameters: { properties: Record<string, { type?: string; enum?: unknown[] }> }
  execute?: (args: Record<string, unknown>) => Promise<string>
}

/** 只够 `defineNode` 用的假上下文：捕获注册，别的一概不做。 */
function fakeContext(): { ctx: never; registered: RegisteredTool[] } {
  const registered: RegisteredTool[] = []
  const ctx = {
    tools: { register: (tool: RegisteredTool) => { registered.push(tool); return () => undefined } },
    on: () => () => undefined,
    get: () => undefined,
  }
  return { ctx: ctx as never, registered }
}

/** `Config` 的三个值都按"没配"给：`historyPath` 空串正是 ADR-0003 那条拒绝的前提。 */
const config = {
  historyPath: { get: () => '' },
  enableUndo: { get: () => true },
  defaultModule: { get: () => '' },
}

/** 参数表读起来要用本地视图：SDK 的属性联合里只有 `select` 那一支带 `enum`。 */
type PropertyView = { type?: string; enum?: unknown[]; required?: boolean }
function propsOf(actionId: string): Record<string, PropertyView> {
  return parametersFor(definition(), actionId) as unknown as Record<string, PropertyView>
}

function field(id: string) {
  return definition().fields.find((item) => item.id === id)
}

describe('marku 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('marku')
    expect(node.definitionVersion).toBe(1)
    expect(name).toBe('@hibernalglow/xaihi-marku')
    // 手推：`inject` 只有 `tools` —— 本节点不调外部程序（subprocess），
    // 也不注册斜杠命令（commands，见 G7 那条），fs 走 node:fs（ADR-0003）。
    expect(inject).toEqual(['tools'])
    expect(node.actions.map((action) => action.id)).toEqual(['text', 'run', 'history', 'undo'])
    expect(node.fields.map((item) => item.id)).toEqual([
      'action', 'module', 'paths', 'inputText', 'stepConfig',
      'recursive', 'dryRun', 'enableUndo', 'historyPath', 'undoId',
    ])
    expect(node.inputBindings).toHaveLength(10)
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]?.id).toBe('module')
    expect(node.groups[0]?.fieldIds).toHaveLength(10)
    expect(node.danger?.type).toBe('all')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 阳性对照：上游那三个宿主执行字段本来就没有；哪天有人搬进来，这里必须红。
    for (const hostKey of ['runtime', 'host_functions', 'executor']) {
      expect(node as unknown as Record<string, unknown>).not.toHaveProperty(hostKey)
    }
    // 偏离 5 的尺：`dashboard` 整块不在（上游 marku.json 有），词表里没有这一族。
    expect(node as unknown as Record<string, unknown>).not.toHaveProperty('dashboard')
    // 阳性对照：清单 schema 写错一个字符，`validateManifest` 就必须拒绝而不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：标题、描述、动作标签、九个模块标签与默认值一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'Marku', en: 'Marku' })
    expect(node.description.zh).toBe('运行 Markdown 清理与转换模块，并提供预览差异。')
    expect(node.description.en).toBe('Run Markdown cleanup and conversion modules with preview diff.')
    // 手抄上游 `actions[].label`：图标在前，四条次序与内核 `MarkuAction` 的可选值同源。
    expect(node.actions.map((action) => action.label.zh)).toEqual(['≡ 文本处理', '▤ 文件批处理', '◷ 历史', '↶ 撤销'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['≡ Text', '▤ Files', '◷ History', '↶ Undo'])

    // 九个模块标签（上游 `fields[module].options`）：图标数组 `≡ # ◇ ▦ Aa ↔ 1. ▣ ☷`
    // 与 `MARKU_MODULES` 的下标配对，次序与文案都是逐字的。
    expect(field('module')?.options?.map((option) => option.label.zh)).toEqual([
      '≡ markt', '# consecutive_header', '◇ content_dedup', '▦ html2sy_table', 'Aa title_convert',
      '↔ content_replace', '1. single_orderlist_remover', '▣ image_path_replacer', '☷ t2list',
    ])
    expect(field('module')?.default).toEqual({ text: 'markt' })
    expect(field('action')?.default).toEqual({ text: 'text' })
    expect(field('stepConfig')?.default).toEqual({ text: '{}' })
    expect(field('recursive')?.default).toEqual({ boolean: false })
    expect(field('dryRun')?.default).toEqual({ boolean: true })
    expect(field('enableUndo')?.default).toEqual({ boolean: true })
    expect(field('paths')?.default).toEqual({ text: '' })
    expect(field('paths')?.kind).toBe('text')
    expect(field('undoId')?.label).toEqual({ zh: '撤销 ID', en: 'Undo ID' })
    // 可见性条件逐字：`module` 在 text|run、`paths` 只在 run、`inputText` 只在 text、
    // `historyPath` 在 history|undo、`undoId` 只在 undo。
    expect(field('module')?.visible).toEqual({
      type: 'single',
      predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['text', 'run'] }, negated: false },
    })
    expect(field('historyPath')?.visible?.predicate?.test.allowed).toEqual(['history', 'undo'])

    // 偏离 3 的尺：help 只剩 whenToUse（而且每种语言一条字符串），文本仍是上游那一句。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse'])
    expect(node.help?.whenToUse?.en).toBe('Use Marku when you need this node\'s text workflow from either the workspace UI or CLI.')
    expect(node.help?.whenToUse?.zh).toBe('当需要从工作区 UI 或 CLI 使用该节点的文本工作流时，使用 Marku。')
  })

  it('GuardedRule 的 {rule, when?} 两层结构原样保留（摊平就被装载期拒绝）', () => {
    // 手抄上游 `fields[paths].rules`：规则本体在 `rule` 里，条件在 `when` 里。
    expect(field('paths')?.rules).toEqual([
      {
        rule: { type: 'atLeastLines', minimum: 1 },
        when: {
          type: 'single',
          predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['run'] }, negated: false },
        },
      },
    ])
    expect(field('inputText')?.rules).toEqual([
      {
        rule: { type: 'required' },
        when: {
          type: 'single',
          predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['text'] }, negated: false },
        },
      },
    ])
    expect(field('action')?.rules).toEqual([{ rule: { type: 'oneOfDeclaredOptions' } }])

    // 阳性对照：把上游的 `GuardedRule` 摊平成扁平 `{type}`（本仓一度犯过的形状错误），
    // 校验器必须红，`defineNode` 必须在装载期抛。
    const broken = JSON.parse(JSON.stringify(definition())) as unknown as { fields: Array<{ id: string; rules?: unknown[] }> }
    broken.fields[2]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    expect(validateNodeDefinition(broken).ok).toBe(false)
    expect(rejectErrors(broken).join('; ')).toContain('must be a guarded rule object')
  })

  it('select 的值摊平成裸字符串，才进得了模型看到的 enum（偏离 1 的证据）', () => {
    // 手抄上游：九条 id 的次序就是 options 的次序。
    expect(field('module')?.options?.map((option) => option.value)).toEqual([
      'markt', 'consecutive_header', 'content_dedup', 'html2sy_table', 'title_convert',
      'content_replace', 'single_orderlist_remover', 'image_path_replacer', 't2list',
    ])
    expect(propsOf('run').module?.enum).toEqual(field('module')?.options?.map((option) => option.value))

    // 阳性对照：把**会进参数表**的那条（`module`）改回上游的 `{text:"markt"}` 形状，
    // enum 就变成一堆对象——模型选不中，这正是偏离 1 要防的事。
    const wrapped = JSON.parse(JSON.stringify(definition())) as NodeDefinition
    const moduleField = wrapped.fields.find((item) => item.id === 'module')!
    moduleField.options = moduleField.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    const wrappedProps = parametersFor(wrapped, 'run') as unknown as Record<string, PropertyView>
    // 九条 enum 成员全变成对象 ⇒ 模型既选不中 `"markt"`，也没有任何一条能对上字符串。
    expect(wrappedProps.module?.enum?.[0]).toEqual({ text: 'markt' })
    expect(wrappedProps.module?.enum).toHaveLength(9)
    expect(wrappedProps.module?.enum).not.toContain('markt')
    // 对照：动作选择器自己永远不进参数表（`parametersFor` 明令跳过 isActionSelector）。
    expect(propsOf('text').action).toBeUndefined()
  })

  it('分组标签叫 label（偏离 2），字段引用全部可解析', () => {
    expect(definition().groups[0]?.label).toEqual({ zh: '模块工具箱', en: 'Module toolbox' })
    expect(definition().groups[0]).not.toHaveProperty('title')
    const ids = definition().fields.map((item) => item.id)
    expect(definition().groups[0]?.fieldIds.every((id) => ids.includes(id))).toBe(true)
    // 阳性对照：分组里引用一个不存在的字段，校验器必须点名。
    const dangling = JSON.parse(JSON.stringify(definition())) as NodeDefinition
    dangling.groups[0]!.fieldIds = ['nope']
    expect(rejectErrors(dangling).join('; ')).toContain('references unknown field "nope"')
  })
})

describe('marku 的参数表：四个动作各自看见的字段（照 visible 手推）', () => {
  it('每个动作只看见自己可见的字段，动作选择器不进表', () => {
    // 手推：`action` 是 isActionSelector ⇒ 一律不进表；其余按 `visible` 的 actionIs 分流。
    //   text   → module, inputText, stepConfig
    //   run    → module, paths, stepConfig, recursive, dryRun, enableUndo
    //   history→ historyPath
    //   undo   → historyPath, undoId
    expect(Object.keys(propsOf('text'))).toEqual(['module', 'inputText', 'stepConfig'])
    expect(Object.keys(propsOf('run'))).toEqual(['module', 'paths', 'stepConfig', 'recursive', 'dryRun', 'enableUndo'])
    expect(Object.keys(propsOf('history'))).toEqual(['historyPath'])
    expect(Object.keys(propsOf('undo'))).toEqual(['historyPath', 'undoId'])

    // 类型与 required：只有 inputText 的 `required` 规则不带条件（`when` 才算条件），
    // 但它的 when 存在 ⇒ 不许被标成必填；paths 那条 `atLeastLines` 也不算必填。
    expect(propsOf('text').inputText).toEqual({ type: 'string', description: 'Input text / 输入文本' })
    expect(propsOf('run').paths?.type).toBe('string')
    expect(propsOf('run').dryRun?.type).toBe('boolean')
    expect(propsOf('run').recursive?.type).toBe('boolean')
    expect(propsOf('undo').historyPath?.type).toBe('string')

    // 阳性对照：`dryRun` 不许出现在 text 的参数表里（上游的 visible 只管 run）。
    expect(propsOf('text').dryRun).toBeUndefined()
    expect(propsOf('history').undoId).toBeUndefined()
  })

  it('inputBindings 十条：槽位名与内核 MarkuInput 的键同名，变换照上游声明', () => {
    const node = definition()
    // 手抄上游 `inputBindings`：paths 是 `delimited`，四个布尔是 `asBoolean`，
    // action/module 是 `trim`，其余 `identity`。
    expect(node.inputBindings.map((item) => `${item.fieldId}:${item.slot}:${item.transform ?? 'identity'}`)).toEqual([
      'action:action:trim',
      'module:module:trim',
      'paths:paths:delimited',
      'inputText:inputText:identity',
      'stepConfig:stepConfig:identity',
      'recursive:recursive:asBoolean',
      'dryRun:dryRun:asBoolean',
      'enableUndo:enableUndo:asBoolean',
      'historyPath:historyPath:identity',
      'undoId:undoId:identity',
    ])
    // 偏离 6 的尺：`defaultExport` 那个键在本仓词表里不存在。
    expect(node.inputBindings.every((item) => !('defaultExport' in item))).toBe(true)

    // 期望值手抄 SDK 自己的实现语义（`transformValue`）：`delimited` 只切逗号，
    // 而上游 `interaction.ts` 的 `split()` 切 `[;\r\n]+`、上游 `cli.ts` 的 `splitArg` 切 `[,;\r\n]`
    // ⇒ 这条落差就是 `src/index.ts` 的 `pathsOf()` 存在的原因（接线层按上游三种分隔符收）。
    expect(bindInputs(node, { paths: '/a.md;/b.md' })).toMatchObject({ paths: ['/a.md;/b.md'] })
    expect(bindInputs(node, { paths: '/a.md,/b.md' })).toMatchObject({ paths: ['/a.md', '/b.md'] })
    // 阳性对照：`asBoolean` 对**缺失值**给 false，而内核的 `dryRun` 默认是 true
    // （`core.ts:132`）⇒ 接线层必须靠 `booleanSlot` 区分"没给"和"给了假"。
    expect(bindInputs(node, {}).dryRun).toBe(false)
  })
})

describe('marku 的危险闸门：与 interaction.ts 那句 isDangerous 同真值表', () => {
  it('undo 永远危险；run 只在非预演时危险；text / history 永远不危险', () => {
    const node = definition()
    // 偏离 4 的形状：`all` + 两条谓词，且 `actionIs` 没有 actionField。
    expect(node.danger?.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['run', 'undo'] }, negated: false },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])

    // 逐条对照上游 `src/interaction.ts` 的 `isDangerous`：
    //   action==="undo" → true；action==="run" && dryRun===false → true；其余 false。
    expect(dangerFor(node, undefined, 'undo', { historyPath: '/h.json' })?.zh).toContain('marku')
    expect(dangerFor(node, undefined, 'run', { dryRun: false })?.zh).toContain('marku')
    expect(dangerFor(node, undefined, 'run', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'text', { inputText: '# Hi' })).toBeUndefined()
    expect(dangerFor(node, undefined, 'history', { historyPath: '/h.json' })).toBeUndefined()

    // 阳性对照 1：把上游那句 `actionField: "action"` 放回去，闸门就永远不亮——
    // 参数表里没有动作选择器，`args.action` 恒为 undefined（`crashu` 偏离 4 是同一条）。
    const withActionField = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withActionField.danger!.predicates![0]!.test.actionField = 'action'
    expect(dangerFor(withActionField, undefined, 'undo', {})).toBeUndefined()

    // 阳性对照 2：模型没给 `dryRun` 时仍然判危险（`fieldTrue` 拿不到 true ⇒ 取反成立）。
    // 这一条是 fail-safe 的方向：`run` 的预演是缺省，但缺省值不该成为免审批的理由。
    expect(dangerFor(node, undefined, 'run', {})).toBeDefined()

    // 阳性对照 3：`none` 闸门一律放行；上游那份 `pluginExport` 若原样搬来，
    // `defineNode` 会在装载期就要 `dangerCheck`（这正是本包不搬它的原因）。
    const none = JSON.parse(JSON.stringify(node)) as NodeDefinition
    none.danger = { type: 'none' }
    expect(dangerFor(none, undefined, 'undo', {})).toBeUndefined()
    const upstreamGate = JSON.parse(JSON.stringify(node)) as NodeDefinition
    upstreamGate.danger = { type: 'pluginExport', exportName: 'is_dangerous' }
    expect(() => defineNode(fakeContext().ctx, {
      definition: upstreamGate,
      handlers: { text: async () => '', run: async () => '', history: async () => '', undo: async () => '' },
    })).toThrow(/pluginExport/)
  })
})

describe('apply 的工具注册与账本闸门（宿主半边）', () => {
  it('四个动作各注册一个工具，名字是 marku_<action>', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual(['marku_history', 'marku_run', 'marku_text', 'marku_undo'])
    expect(registered[0]?.description).toContain('Marku')
    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'workflow', label: { zh: '工作流', en: 'Workflow' } })
    expect(() => defineNode(fakeContext().ctx, {
      definition: missing,
      handlers: { text: async () => '', run: async () => '', history: async () => '', undo: async () => '' },
    })).toThrow(/no handler for action "workflow"/)
  })

  it('没配 historyPath 时，会碰账本的三条腿在动手之前拒绝且点名配置', async () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const byName = new Map(registered.map((tool) => [tool.name, tool]))

    // `undo`：没有账本就读不到、也回滚不了 ⇒ 拒绝的话点名 `config.historyPath`。
    await expect(byName.get('marku_undo')!.execute!({})).rejects.toThrow(/config\.historyPath is unset/)
    await expect(byName.get('marku_history')!.execute!({})).rejects.toThrow(/config\.historyPath is unset/)
    // `run` + 真写（`dryRun: false`，且 `enableUndo` 仍为真）⇒ 动手之前就拦。
    await expect(byName.get('marku_run')!.execute!({ module: 'content_replace', paths: '/tmp/xaihi-marku-absent/a.md', dryRun: false })).rejects.toThrow(/refusing to write Markdown without an undo journal/)

    // 阳性对照：`run` 的预演（默认 dryRun=true）不受这条闸门约束，说的是内核自己的话
    // ——没有路径/路径不存在时由内核说话（`core.ts:163` / `:166`），接线层不编第二句。
    await expect(byName.get('marku_run')!.execute!({ module: 'content_replace', paths: '/tmp/xaihi-marku-absent' })).rejects.toThrow(/No Markdown files found|No input paths or text provided/)
    // 对照：`text` 腿压根不需要账本（不碰磁盘）。
    expect(byName.get('marku_text')!.execute).toBeTypeOf('function')
  })

  it('Config 三条声明对应上游 [nodes.marku] 的三个键，且都是 volatile', () => {
    // 上游 `cli.ts:62-69` 的 `MarkuNodeConfig`：`enable_undo` / `history_path` / `default_module`
    // （外加 `workflowLibrary` 与交互偏好，那两条在 bin 侧被拒、在宿主侧没有内核消费者）。
    // 读法走 schemastery 自己的 `dict`：每条字段是一个 schema **函数对象**，`type` / `meta`
    // 挂在它身上（`toMatchObject` 的接收者必须是普通对象，对函数会直接报 [Function schema]），
    // 所以逐条点出来读，不是再抄一份常量表。
    type FieldView = { type: string; meta?: { default?: unknown; volatile?: boolean } }
    const declared = Config as unknown as { dict: Record<string, FieldView> }
    expect(Object.keys(declared.dict)).toEqual(['historyPath', 'enableUndo', 'defaultModule'])

    // 阳性对照：`historyPath` 的默认必须是"没配"（空串），不是猜一个目录 —— ADR-0003 决定 2。
    // 哪天有人给它填了默认路径，账本就会写进一个没人知道的地方，这条立刻红。
    const viewOf = (key: 'historyPath' | 'enableUndo' | 'defaultModule') => {
      const field = declared.dict[key]!
      return [field.type, field.meta?.default, field.meta?.volatile]
    }
    expect(viewOf('historyPath')).toEqual(['string', '', true])
    expect(viewOf('enableUndo')).toEqual(['boolean', true, true])
    expect(viewOf('defaultModule')).toEqual(['string', '', true])
    // 三条都要 volatile：改配置不必重启（ADR-0013 的读写面）。
    expect(Object.values(declared.dict).every((field) => field.meta?.volatile === true)).toBe(true)
    // 对照：内核默认 `dryRun: true` 与 `enableUndo: true` 方向相反的那条，
    // 由 `src/index.ts` 的 `booleanSlot` 兜住（见上面 `bindInputs` 那条正控）。
    expect(config.historyPath.get()).toBe('')
  })
})

describe('bin / exports / help 的接线形状（G7：没注册 commands 就不传 command）', () => {
  it('xmarku 指向 lib/cli.js，exports 带 ./cli 与 ./help', () => {
    expect(pkg.bin).toEqual({ xmarku: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])
  })

  it('help 由清单推导：示例行读的是 actions，不是手写文案', async () => {
    const { help } = await import('../src/help.ts')
    expect(help.title).toBe('Marku')
    expect(help.commands[0]?.command).toBe('xmarku')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xmarku --help', 'xmarku text', 'xmarku run', 'xmarku history', 'xmarku undo',
    ])

    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是硬编码。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'xmarku' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xmarku --help', 'xmarku text', 'xmarku run', 'xmarku history',
    ])
  })

  it('G7 的源码尺：src/help.ts 不传 command（本包 inject 里没有 commands）', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    const withoutComments = source.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line)).join('\n')
    expect(withoutComments).not.toMatch(/command:\s*['"]/)
    expect(withoutComments).toMatch(/bin:\s*'xmarku'/)
    // 阳性对照：这条尺必须看得见违规——同一条正则喂一份"传了 command"的文本就要命中，
    // 否则它等于恒真（对照文本是手写的，不由被测文件推导）。
    expect(/command:\s*['"]/.test(`nodeHelpFromManifest(node, { bin: 'xmarku', command: '/marku' })`)).toBe(true)
    expect(inject).not.toContain('commands')
  })
})
