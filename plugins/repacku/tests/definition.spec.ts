/**
 * Repacku 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/repacku.json`（definitionVersion 1）。
 *   上游那份**没有** `runtime` / `host_functions` / `executor` 这三个宿主执行字段，
 *   所以这一轮"剥掉宿主执行字段"是空集（下面的用例钉住，剥无可剥也要说得出来）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作五条、字段九条、参数表那八键是照定义里的 `isActionSelector`
 *   与 `visible`（九条字段全是 `always` 可见）手推出来的，不由被测函数算出来。
 *
 * 四条**有意**偏离上游清单的地方在这里点名并钉住（理由与 crashu / rawfilter / migratef 同源）：
 * 1. select 的 `options[].value` 从 `{text:"analyze"}` 摊平成 `"analyze"`：SDK 的
 *    `fieldProperty` 把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`。
 *    本节点上游的 `groups` 是**空数组**，所以这条换算在这里是空集——仍钉一条"没有 title"。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串，上游是只有一条目的数组）与 `safety`：
 *    上游那两大块 `workflows` / `commands` 说的是旧壳的 `xiranite repacku …` 命令名，
 *    本仓的 bin 是 `xrepacku`（ADR-0010），照抄等于把"按帮助页敲一条不存在的命令"写进发布物
 *    （台账 G4 同一件事）。终端那一屏由 `src/help.ts` 从清单推导。
 * 4. `danger` 保持上游原样 `{type:"pluginExport", exportName:"is_dangerous"}`：本节点没有
 *    `predicates`，所以那条"`danger.predicates[].test.actionField` 剥掉"的换算在这里也是空集。
 *    字段的 `visible` / 规则的 `when` 里那条 `actionField: "action"` **要留**——
 *    `parametersFor` 会自己造 `{action: actionId}` 喂给可见性求值
 *    （`packages/node-sdk/src/conditions.ts:57` 读 `test.actionField`）。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-repacku/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  defineNode,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  transformValue,
  validateManifest,
  validateNodeDefinition,
  type NodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { apply, dangerCheck } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  xaihi?: { node?: unknown }
  bin?: Record<string, string>
  exports?: Record<string, unknown>
}

function definition (): NodeDefinition {
  const result = validateNodeDefinition(pkg.xaihi?.node)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

/** `ctx.tools.register` 收到的东西（`defineTool` 整理过参数表，所以读 `properties`）。 */
interface RegisteredTool {
  name: string
  description: string
  parameters: { properties: Record<string, { type?: string; enum?: unknown[] }> }
}

/** 只够 `defineNode` 用的假上下文：捕获注册，别的一概不做（`subprocess` 只在处理器里被读）。 */
function fakeContext (): { ctx: never; registered: RegisteredTool[] } {
  const registered: RegisteredTool[] = []
  const ctx = {
    tools: { register: (tool: RegisteredTool) => { registered.push(tool); return () => undefined } },
    on: () => () => undefined,
    get: () => undefined,
    subprocess: {},
  }
  return { ctx: ctx as never, registered }
}

const config = {
  defaultRoot: { get: () => '' },
  defaultOutputDir: { get: () => '' },
  types: { get: () => 'image' },
  minCount: { get: () => 2 },
  galleryMarker: { get: () => '. 画集' },
  sevenZipPath: { get: () => '' },
  compressionLevel: { get: () => 7 },
}

/** 参数表的一个本地视图：`.enum` 只在 select 那种形状上存在（与 crashu 同一处理由）。 */
type PropertyView = { type?: string; enum?: unknown[]; items?: unknown; required?: boolean }

/** 会进参数表的那八个字段（`action` 是动作选择器，永不进表）。 */
const BOUND_FIELDS = ['pathsText', 'types', 'minCount', 'outputPath', 'configPath', 'galleryMarker', 'deleteAfter', 'dryRun']

describe('repacku 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('repacku')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['analyze', 'compress', 'full', 'single-pack', 'gallery-pack'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'pathsText', 'types', 'minCount', 'outputPath', 'configPath', 'galleryMarker', 'deleteAfter', 'dryRun',
    ])
    expect(node.groups).toEqual([])
    expect(node.inputBindings).toHaveLength(9)
    expect(node.danger).toEqual({ type: 'pluginExport', exportName: 'is_dangerous' })
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

  it('词表照上游：标题、描述、动作标签、字段默认值与区间一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'Repacku', en: 'Repacku' })
    expect(node.description.zh).toBe('分析文件夹结构，并将匹配的文件夹重新打包为 zip 归档。')
    expect(node.description.en).toBe('Analyze folder structures and repack matching folders into zip archives.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['分析', '压缩', '完整流程', '单层打包', '画集打包'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Analyze', 'Compress', 'Full flow', 'Single pack', 'Gallery pack'])
    // 上游 `node-definitions/repacku.json` 里这几条字面值，逐条钉住。
    expect(node.fields.find((field) => field.id === 'action')?.isActionSelector).toBe(true)
    expect(node.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'full' })
    expect(node.fields.find((field) => field.id === 'pathsText')?.kind).toBe('path-list')
    expect(node.fields.find((field) => field.id === 'minCount')?.range).toEqual({ min: 1, max: 9999, step: 1 })
    expect(node.fields.find((field) => field.id === 'galleryMarker')?.default).toEqual({ text: '. 画集' })
    // `pathsText` 那条规则上游写的是"带 when 的 atLeastLines"（compress 之外才检查）：
    // GuardedRule 的 `{rule, when?}` 两层形状必须原样，摊平就红。
    expect(node.fields.find((field) => field.id === 'pathsText')?.rules).toEqual([
      {
        rule: { type: 'atLeastLines', minimum: 1 },
        when: {
          type: 'single',
          predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['compress'] }, negated: true },
        },
      },
    ])
    // `configPath` 那条带双语 message，且 `when` 是**不**取反的 actionIs compress。
    expect(node.fields.find((field) => field.id === 'configPath')?.rules).toEqual([
      {
        rule: { type: 'anyFilled', fieldIds: ['configPath', 'pathsText'] },
        when: {
          type: 'single',
          predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['compress'] }, negated: false },
        },
        message: { zh: '压缩需要配置路径或文件夹路径。', en: 'Compress needs a config or folder path.' },
      },
    ])
    // 绑定表逐条照上游（slot 名与 transform 名都是内核那 13 个输入口的名字）。
    expect(node.inputBindings.map((binding) => `${binding.fieldId}:${binding.slot}:${binding.transform}`)).toEqual([
      'action:action:trim',
      'pathsText:paths:delimited',
      'types:types:trimOrOmit',
      'minCount:minCount:asInteger',
      'outputPath:outputPath:trimOrOmit',
      'configPath:configPath:trimOrOmit',
      'galleryMarker:galleryMarker:trimOrOmit',
      'deleteAfter:deleteAfter:asBoolean',
      'dryRun:dryRun:asBoolean',
    ])

    // 偏离 1：select 的值是裸字符串（上游是 `{text:"…"}`）。
    const selector = node.fields.find((field) => field.id === 'action')
    expect(selector?.options?.map((option) => option.value)).toEqual(['analyze', 'compress', 'full', 'single-pack', 'gallery-pack'])
    // 偏离 2：本节点没有分组，所以 title→label 这条换算在此刻是空集；空集也要说得出。
    expect(node.groups[0]).toBeUndefined()
    // 偏离 3：help 只剩 whenToUse + safety。旧壳的 `workflows` / `commands` 两块整块不在，
    // 所以那一屏不可能再打印出 `xiranite repacku`。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])
    expect(node.help?.whenToUse?.zh).toBe('需要从工作区 UI 或 CLI 使用此节点的文件工作流时，可使用 Repacku。')
    // 上游那两条"表单控件用的键"（`placeholder` / `lines`）不在 `NodeField` 的词表里，
    // 但它们是上游清单的原话，所以照抄进定义、从原始 JSON 这一侧读回来钉住。
    const rawFields = (pkg.xaihi?.node as { fields: Array<{ id: string; placeholder?: { zh: string; en: string }; lines?: number }> }).fields
    expect(rawFields.find((field) => field.id === 'pathsText')?.lines).toBe(5)
    expect(rawFields.find((field) => field.id === 'types')?.placeholder).toEqual({ zh: 'image,document', en: 'image,document' })

    // 阳性对照：偏离 1 防的是"enum 里塞进对象"这件事——本节点唯一的 select 恰好是动作
    // 选择器，它不进参数表（下面那条循环钉的就是这个），所以这里量的是那条映射本身：
    // 值摊平时 enum 成员是字符串，换回上游的 `{text:"…"}` 形状就全变成对象。
    const flat = (selector?.options ?? []).map((option) => option.value)
    expect(flat.every((value) => typeof value === 'string')).toBe(true)
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    wrapped.fields.find((field) => field.id === 'action')!.options = flat.map((value) => ({
      value: { text: value } as unknown as string,
      label: { zh: '分析', en: 'Analyze' },
    }))
    expect(wrapped.fields.find((field) => field.id === 'action')!.options!.every((option) => typeof option.value === 'object')).toBe(true)

    // 九条字段的 `visible` 上游全是 `always`，所以每条动作的参数表都是同一组八键。
    for (const action of node.actions.map((item) => item.id)) {
      expect(Object.keys(parametersFor(node, action)).sort()).toEqual([...BOUND_FIELDS].sort())
      // 阳性对照：动作选择器自己永远不进参数表（SDK 明令跳过 isActionSelector）。
      expect(parametersFor(node, action).action).toBeUndefined()
    }
    const props = parametersFor(node, 'full') as unknown as Record<string, PropertyView>
    expect(props.pathsText?.type).toBe('array')
    expect(props.dryRun?.type).toBe('boolean')
    // `pathsText` 在这里**不是**必填：它只有一条 `atLeastLines` 规则，而 `fieldProperty`
    // 只把 `required` / `nonBlank` 算必填，带 `when` 的条件规则更是直接豁免
    // （define-node.ts:83-86）。模型看到的参数表因此不比界面更严。
    expect(props.pathsText?.required).toBeUndefined()
    // 对照 1：换成无条件的 `nonBlank`，同一条字段立刻变必填。
    const withRule = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withRule.fields.find((field) => field.id === 'pathsText')!.rules = [{ rule: { type: 'nonBlank' } }]
    expect((parametersFor(withRule, 'full') as unknown as Record<string, PropertyView>).pathsText?.required).toBe(true)
    // 对照 2：给那条 `nonBlank` 加一个 `when`，必填立刻又被豁免——这才是 `when` 在做的事。
    const guardedRule = JSON.parse(JSON.stringify(node)) as NodeDefinition
    guardedRule.fields.find((field) => field.id === 'pathsText')!.rules = [{
      rule: { type: 'nonBlank' },
      when: { type: 'single', predicate: { test: { type: 'always' }, negated: false } },
    }]
    expect((parametersFor(guardedRule, 'full') as unknown as Record<string, PropertyView>).pathsText?.required).toBeUndefined()
  })

  it('危险闸门：pluginExport 走 dangerCheck，非显式预演一律要批准', () => {
    const node = definition()
    // 偏离 4：本节点没有 predicates，所以"danger.predicates[].test.actionField 剥掉"
    // 这条换算在此刻是空集；被剥掉的那条判据搬到了回调里（见 src/index.ts 的 dangerCheck）。
    expect(node.danger?.predicates).toBeUndefined()

    const check = (args: Record<string, unknown>) => dangerFor(node, dangerCheck, 'full', args)
    expect(check({ dryRun: true })).toBeUndefined()
    expect(check({ dryRun: false })).toBeDefined()
    expect(check({ deleteAfter: true })).toBeDefined()
    expect(check({})).toBeDefined()
    expect(check({ dryRun: true, deleteAfter: true })).toBeDefined()

    // 阳性对照 A：`defineNode` 在装载期就拒绝"声明 pluginExport 却没给 dangerCheck"。
    const bare = fakeContext()
    expect(() => {
      defineNode(bare.ctx, {
        definition: node,
        handlers: { analyze: async () => '', compress: async () => '', full: async () => '', 'single-pack': async () => '', 'gallery-pack': async () => '' },
      })
    }).toThrow(/declares danger\.type "pluginExport" but defineNode got no dangerCheck/)

    // 阳性对照 B：**按上游字面**判（`dryRun === false`）会放过"模型省略 dryRun"那一次——
    // 而 `bindInputs` 把省略折成 false（G8），于是"没批准却写了盘"。这条就是为什么要放宽。
    const upstreamLiteral = (args: Record<string, unknown>) => dangerFor(node, literalCheck, 'full', args)
    expect(upstreamLiteral({})).toBeUndefined()
    expect(upstreamLiteral({ dryRun: false })).toBeDefined()

    // 阳性对照 C：定义换成 `none`，闸门整体熄灭（这条尺读的是定义，不是回调）。
    const disarmed = JSON.parse(JSON.stringify(node)) as NodeDefinition
    disarmed.danger = { type: 'none' }
    expect(dangerFor(disarmed, literalCheck, 'full', { dryRun: false })).toBeUndefined()
  })

  it('apply 给每个动作注册一个工具，名字是 repacku_<action>', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name)).toEqual([
      'repacku_analyze', 'repacku_compress', 'repacku_full', 'repacku_single-pack', 'repacku_gallery-pack',
    ])
    expect(registered[0]?.description).toContain('Repacku')
    expect(registered[0]?.description).toContain('Analyze')

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'undo', label: { zh: '撤销', en: 'Undo' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        dangerCheck: () => false,
        handlers: { analyze: async () => '', compress: async () => '', full: async () => '', 'single-pack': async () => '', 'gallery-pack': async () => '' },
      })
    }).toThrow(/no handler for action "undo"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    // 这里用本仓一度犯过的形状错误：把上游的 `GuardedRule` 摊平成扁平 `{type}`。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: Array<{ id: string; rules?: unknown[] }> }
    broken.fields[1]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken,
        dangerCheck: () => false,
        handlers: { analyze: async () => '', compress: async () => '', full: async () => '', 'single-pack': async () => '', 'gallery-pack': async () => '' },
      })
    }).toThrow(/must be a guarded rule object/)
    expect(validateNodeDefinition(broken).ok).toBe(false)
  })

  it('bin / exports / help 的接线形状：`xrepacku` 指向 lib/cli.js，help 从清单推导', async () => {
    expect(pkg.bin).toEqual({ xrepacku: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    // 期望值手抄推导器的规则：bin 是 xrepacku、示例行按动作列。
    expect(help.title).toBe('Repacku')
    expect(help.commands[0]?.command).toBe('xrepacku')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xrepacku --help', 'xrepacku analyze', 'xrepacku compress', 'xrepacku full',
      'xrepacku single-pack', 'xrepacku gallery-pack',
    ])
    // 台账 G7 的**已知残留**：本包不 inject `commands`，`src/help.ts` 因此**不传** `command`，
    // 但推导器在 `options.command` 缺席时仍按 `/${nodeId}` 兜底（packages/node-sdk/src/help.ts:108），
    // 所以这一行现在还会印出来。按现状钉住：哪天 SDK 收掉兜底，这里立刻红，
    // 那时才是"帮助页与真注册的命令两头对上"的那一天。
    expect(help.commands[1]?.command).toBe('/repacku')

    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'xrepacku' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xrepacku --help', 'xrepacku analyze', 'xrepacku compress', 'xrepacku full', 'xrepacku single-pack',
    ])
    // 阳性对照：一条动作都没有时推导器直接抛，而不是印一屏空命令。
    const empty = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    empty.actions = []
    expect(() => nodeHelpFromManifest(empty, { bin: 'xrepacku' })).toThrow(/一个动作都没有/)
  })

  it('G8 的另一半：省略的布尔保持 undefined，交给内核与默认值兜底', () => {
    // 这一条测的是 SDK 的折叠规则（现在 undefined 不折叠为 false，而是保持 undefined 兜底）。
    expect(transformValue(undefined, 'asBoolean')).toBeUndefined()
    expect(transformValue(true, 'asBoolean')).toBe(true)
    expect(transformValue(undefined, 'trimOrOmit')).toBeUndefined()
    expect(transformValue(undefined, 'asInteger')).toBeUndefined()
    // 阳性对照：`delimited` 只按逗号切——这就是 `src/index.ts` 为什么还要把原始整块文本
    // 一起递进内核（内核的 `normalizePaths` 会按 `[\r\n;]` 再切一次，core.ts:768-774）。
    expect(transformValue('/a\n/b', 'delimited')).toEqual(['/a\n/b'])
    expect(transformValue('/a,/b', 'delimited')).toEqual(['/a', '/b'])
  })
})

/** 上游 `interaction.ts:88` 的字面版（只在本文件用来做阳性对照；生产闸门是 `src/index.ts` 的 `dangerCheck`）。 */
function literalCheck (args: Record<string, unknown>): boolean {
  return args.dryRun === false || args.deleteAfter === true
}
