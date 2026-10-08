/**
 * classf 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/classf.json`（definitionVersion 1）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作 2 条、字段 17 条、绑定 17 条、参数表那几组键名是照定义里的
 *   `isActionSelector` 与 `visible` 手推出来的，不由被测函数算出来。
 *
 * 四条**有意**偏离上游清单的地方在这里点名并钉住（与 `crashu` / `rawfilter` 先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"plan"}` 摊平成 `"plan"`：SDK 的 `fieldProperty`
 *    把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：**classf 这一条是空集**（上游 `groups` 就是 `[]`），
 *    剥无可剥也要说得出来，所以正控拿"引用未知字段的分组"来做。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串，上游那两条数组各只有一条）与 `safety`：
 *    上游的 `workflows` / `commands` 两块说的是旧壳的 `xiranite classf plan D:/set …`
 *    那套命令与本包 bin（`classf`，且子命令后不接受位置参）对不上，照抄等于宣传一条
 *    使用者敲不通的命令。
 * 4. `danger` 的 `actionIs` 谓词**去掉** `actionField: "action"`：`parametersFor` 明令跳过
 *    `isActionSelector`，而 `dangerFor` 的 `all` 分支只看 `exec.arguments` ⇒ 留着那条
 *    就得到"危险闸门永远不亮"。字段的 `visible` / `rules[].when` 里没有 `actionIs`
 *    （classf 用的是 `always` 与 `fieldEquals`），所以那一侧没有对应的"要留"。
 *
 * 另有一格**不是偏离、而是上游与 SDK 的落差**（台账 **G8**）：`dryRun` 的内核默认是
 * `true`（`core.ts:75`）、清单默认也是 `true`，但 `bindInputs` 会把模型**省略**的布尔折成
 * `false`。两种形状各钉一条（下面那条 `dangerFor` 与 `core.spec.ts` 的第 16-18 条），
 * 不在这里统一它。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-classf/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  defineNode,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateManifest,
  validateNodeDefinition,
  type NodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { apply } from '../src/index.ts'

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

/** `ctx.tools.register` 收到的东西（`defineTool` 整理过参数表，所以读 `properties`）。 */
interface RegisteredTool {
  name: string
  description: string
  parameters: { properties: Record<string, { type?: string; enum?: unknown[] }> }
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
  crashuSimilarityThreshold: { get: () => 0.8 },
  sameaMinOccurrences: { get: () => 1 },
  sameaCentralize: { get: () => false },
  sameaIgnorePathBlacklist: { get: () => false },
  sameaGroupCentralize: { get: () => false },
  dryRun: { get: () => true },
}

describe('classf 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('classf')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['plan', 'classify'])
    expect(node.fields).toHaveLength(17)
    // 偏离 2：上游 `groups` 本来就是空数组 ⇒ 这里没有可改名的东西。
    expect(node.groups).toEqual([])
    expect(node.inputBindings).toHaveLength(17)
    expect(node.danger?.type).toBe('all')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 阳性对照：分组引用一个不存在的字段时，校验器必须点名它（"groups 空着"不等于"这块没在看"）。
    const dangling = JSON.parse(JSON.stringify(node)) as NodeDefinition
    dangling.groups = [{ id: 'queues', fieldIds: ['action', 'no-such-field'] }]
    const result = validateNodeDefinition(dangling)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.errors.join('; ')).toContain('references unknown field "no-such-field"')
    // 阳性对照：清单 schema 写错一个字符，`validateManifest` 就必须拒绝而不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：标题、描述、17 个字段的 id、标签、默认值与阈值区间一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'ClassF', en: 'ClassF' })
    expect(node.description.zh).toBe('递归检测所有文件，并在不丢失路径分类的前提下分流到 already、del 或 wait。')
    expect(node.description.en).toBe('Classify detected files into already, del, or wait without losing path context.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['预演', '执行'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Plan', 'Classify'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'pathsText', 'crashuSourcesText', 'placementMode', 'targetDir', 'transferMode',
      'alreadyEnabled', 'waitEnabled', 'delEnabled', 'existingPolicy', 'workItemMode',
      'blacklistKeywordsText', 'dryRun', 'sameaGroupAlreadyEnabled', 'sameaGroupWaitEnabled',
      'sameaGroupDelEnabled', 'sameaGroupMinOccurrences',
    ])
    // 上游逐字面值：三条队列默认全开、三条画师分组默认全关、预演默认 true。
    expect(node.fields.find((field) => field.id === 'alreadyEnabled')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'waitEnabled')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'delEnabled')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    expect(node.fields.find((field) => field.id === 'sameaGroupAlreadyEnabled')?.default).toEqual({ boolean: false })
    expect(node.fields.find((field) => field.id === 'sameaGroupDelEnabled')?.default).toEqual({ boolean: false })
    expect(node.fields.find((field) => field.id === 'sameaGroupMinOccurrences')?.range).toEqual({ min: 1, max: 100, step: 1 })
    // 黑名单默认那 5 条是上游 `help` 之外**唯一**带着同一份名单的字段默认值（`core.ts:67`
    // 的 `DEFAULT_CLASSF_BLACKLIST_KEYWORDS` 同源），换行分隔的原样留着。
    expect(node.fields.find((field) => field.id === 'blacklistKeywordsText')?.default).toEqual({
      text: '[OgoG]\n[ぶたコマ300g]\n[すいせいむし]\n[ダツマ69]\n[ヤキカルビー]',
    })
    expect(node.fields.find((field) => field.id === 'pathsText')?.kind).toBe('path-list')
    expect(node.fields.find((field) => field.id === 'blacklistKeywordsText')?.kind).toBe('multiline')
    // `targetDir` 那条 `required` 是**带 when 的守卫规则**（`GuardedRule`），
    // 只在 `placementMode == root` 时检查；摊平成 `{type:"required"}` 必须红。
    expect(node.fields.find((field) => field.id === 'targetDir')?.rules).toEqual([
      {
        rule: { type: 'required' },
        when: {
          type: 'single',
          predicate: { test: { type: 'fieldEquals', fieldId: 'placementMode', value: { text: 'root' } }, negated: false },
        },
      },
    ])

    // 偏离 1：select 的值是裸字符串（上游是 `{text: "…"}`）。
    expect(node.fields.find((field) => field.id === 'placementMode')?.options?.map((option) => option.value))
      .toEqual(['local', 'root'])
    expect(node.fields.find((field) => field.id === 'workItemMode')?.options?.map((option) => option.value))
      .toEqual(['files', 'folders', 'mixed'])
    // 偏离 3：help 只剩 whenToUse + safety。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])

    // 阳性对照：把**会进参数表**的那条 select（`transferMode`）改回上游的 `{text:"copy"}`
    // 形状，enum 就变成一堆对象——那正是偏离 1 要防的事。
    type PropertyView = { type?: string; enum?: unknown[] }
    const props = parametersFor(node, 'plan') as unknown as Record<string, PropertyView>
    expect(props.transferMode?.enum).toEqual(['move', 'copy'])
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    const transfer = wrapped.fields.find((field) => field.id === 'transferMode')!
    transfer.options = transfer.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    const wrappedProps = parametersFor(wrapped, 'plan') as unknown as Record<string, PropertyView>
    expect(wrappedProps.transferMode?.enum).toEqual([{ text: 'move' }, { text: 'copy' }])
    // 对照：动作选择器自己永远不进参数表（SDK 明令跳过 isActionSelector）。
    expect(parametersFor(node, 'plan').action).toBeUndefined()
  })

  it('参数表按定义推导：除动作选择器外 16 条字段两条动作都可见，形状各按 kind', () => {
    const node = definition()
    // 参数表在 SDK 那边是几种形状的联合（`ParameterPropertySpec`），`.type` 只在其中几种上
    // 存在，直接点会在类型层就报错 ⇒ 用一个本地视图读（crashu 的 `RegisteredTool` 同一处理由）。
    type PropertyView = { type?: string; enum?: unknown[]; required?: true }
    for (const action of ['plan', 'classify']) {
      const props = parametersFor(node, action) as unknown as Record<string, PropertyView>
      const keys = Object.keys(props)
      expect(keys).toHaveLength(16)
      expect(keys).not.toContain('action')
      expect(props.pathsText?.type).toBe('array')
      expect(props.targetDir?.type).toBe('string')
      expect(props.sameaGroupMinOccurrences?.type).toBe('number')
      expect(props.dryRun?.type).toBe('boolean')
      expect(props.blacklistKeywordsText?.type).toBe('string')
    }
    // 阳性对照：`targetDir` 的 required 带 when ⇒ 不能变成参数表里的永久必填
    // （否则模型在 `placementMode=local` 那格也被逼着编一个目录）。
    const props = parametersFor(node, 'plan') as unknown as Record<string, PropertyView>
    expect(props.targetDir?.required).toBeUndefined()
    // 阳性对照：把那条 when 摘掉，同一个字段就变成必填 ⇒ 这条尺真的在看守卫。
    const unguarded = JSON.parse(JSON.stringify(node)) as NodeDefinition
    unguarded.fields.find((field) => field.id === 'targetDir')!.rules = [{ rule: { type: 'required' } }]
    expect((parametersFor(unguarded, 'plan') as unknown as Record<string, PropertyView>).targetDir?.required).toBe(true)
  })

  it('危险闸门与定义同源：classify + 非预演才要批准，且不需要模型再传一次动作', () => {
    const node = definition()
    // 偏离 4：谓词里没有 actionField（`dangerFor` 的 all 分支只看参数表）。
    expect(node.danger?.predicates?.[0]?.test).toEqual({ type: 'actionIs', allowed: ['classify'] })
    expect(dangerFor(node, undefined, 'plan', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(node, undefined, 'classify', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'classify', { dryRun: false })?.zh).toContain('classf')
    // 台账 G8 的那一格：模型**省略** dryRun ⇒ args 里根本没有它 ⇒ `fieldTrue` 不成立 ⇒
    // 取非后为真 ⇒ classify 判成危险（并被 `ask` 拦下）。这一条与"内核默认预演"是
    // 两个方向，都不许被"统一"掉。
    expect(dangerFor(node, undefined, 'classify', {})).toBeDefined()

    // 阳性对照：把上游那句 `actionField: "action"` 放回去，闸门就永远不亮——
    // 这条就是"为什么必须偏离"的证据，不是装饰。
    const withActionField = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withActionField.danger!.predicates![0]!.test.actionField = 'action'
    expect(dangerFor(withActionField, undefined, 'classify', { dryRun: false })).toBeUndefined()
  })

  it('apply 给每个动作注册一个工具，名字是 classf_<action>，动作选择器不进参数表', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual(['classf_classify', 'classf_plan'])
    expect(registered[0]?.description).toContain('ClassF')

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'undo', label: { zh: '撤销', en: 'Undo' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        handlers: { plan: async () => '', classify: async () => '' },
      })
    }).toThrow(/no handler for action "undo"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    // 这里用本仓一度犯过的形状错误：把上游的 `GuardedRule` 摊平成扁平 `{type}`。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[4]!.rules = [{ type: 'required' }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken as unknown as NodeDefinition,
        handlers: { plan: async () => '', classify: async () => '' },
      })
    }).toThrow(/must be a guarded rule object/)
    expect(validateNodeDefinition(broken).ok).toBe(false)
  })

  it('bin / exports / help 的接线形状：`classf` 指向 lib/cli.js，help 从清单推导且**不传 command**', async () => {
    expect(pkg.bin).toEqual({ classf: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    // 期望值手抄推导器的规则：bin 是 classf、示例行按清单里的动作列。
    expect(help.title).toBe('ClassF')
    expect(help.commands[0]?.command).toBe('classf')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'classf --help', 'classf plan', 'classf classify',
    ])

    // 台账 G7：本包 `inject` 里**没有** `commands` ⇒ 源码里不许出现 `command:` 那一条实参。
    // 尺读的是 `src/help.ts` 那一行本身（推导器在 `command` 缺席时仍按 `/${nodeId}` 兜底，
    // 所以"少印一条"这件事只能由包自己这一侧声明）。
    const helpSource = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    const callLine = helpSource.split('\n').find((line) => line.includes('nodeHelpFromManifest(node')) ?? ''
    expect(callLine).not.toContain('command:')
    // 阳性对照：`command` 这个实参是活的——给了别的名字，推导结果就必须跟着变。
    const withCommand = nodeHelpFromManifest(pkg.xaihi?.node as never, { bin: 'classf', command: '/classf-legacy' })
    expect(withCommand.commands[1]?.command).toBe('/classf-legacy')
    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'classf' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual(['classf --help', 'classf plan'])
  })
})
