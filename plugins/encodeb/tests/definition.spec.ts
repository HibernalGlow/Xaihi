/**
 * encodb 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/encodeb.json`（definitionVersion 1）。
 *   上游那份**没有** `runtime` / `host_functions` / `executor` / `entry` / `allowed_paths` /
 *   `memory_max_pages` / `dashboard` 这些宿主执行字段，所以"剥掉宿主执行字段"对 encodb
 *   是空集 —— 剥无可剥也要把它说得出来（下面的用例钉住）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作三条、字段七条、每个动作的参数表是照定义里的
 *   `isActionSelector` 与各字段 `visible` 手推出来的，不由被测函数算出来。
 *   参数表那两组键名的推导写在用例里。
 *
 * 四条**有意**偏离上游清单的地方在这里点名并钉住（理由与 `crashu` 先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"find"}` 摊平成 `"find"`：SDK 的 `fieldProperty`
 *    把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串）与 `safety`：上游那两大块
 *    `workflows` / `commands` 说的是旧壳的 `xiranite encodeb …` 命令名，本仓的 bin 是
 *    `xencodeb`（ADR-0010），照抄等于把"按帮助页敲一条不存在的命令"写进发布物。
 *    终端那一屏由 `src/help.ts` 从清单推导。
 * 4. `inputBindings` 里三条 `defaultExport`（`effective_src_encoding` /
 *    `effective_dst_encoding` / `preset_transform`）剥掉：那是上游 runner 往运行结果里
 *    加出口的通道，`xaihi.node/v1` 的 `NodeInputBinding` 只有 `fieldId` / `slot` /
 *    `transform` / `when`。留着就是让清单宣传一个本包不产的出口。同一件事改由
 *    `src/index.ts` 的 `result_view` 字段承担（`effectiveSrcEncoding` 等），
 *    所以下面钉的是"绑定项键集恰好是这四个"。
 *
 * `danger` 那格**没有**偏离：上游是 `{type:"actionIn", actionField:"action",
 * dangerous:["recover"]}`，原样留着。`dangerFor` 的 `actionIn` 分支在参数表里没有动作
 * 选择器时会落回 `actionId`（`define-node.ts:186`），所以闸门照样亮 —— 与 crashu 那份
 * `all` + `actionIs` 不一样，那条是真的必须去掉 `actionField`。对照写在用例里。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-encodeb/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  defineNode,
  dangerFor,
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
  parameters: { properties: Record<string, { type?: string; enum?: string[]; required?: boolean }> }
  /** 工具面真正跑起来的那条腿（`defineNode` 把它接到 handler 与运行记账上）。 */
  execute: (args: Record<string, unknown>) => Promise<string>
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

const config = {
  preset: { get: () => '' },
  srcEncoding: { get: () => '' },
  dstEncoding: { get: () => '' },
  transform: { get: () => '' },
  strategy: { get: () => '' },
  limit: { get: () => 0 },
}

/** 本包 `Config` 的六个键；声明面与使用面必须同源。 */
const CONFIG_KEYS = ['dstEncoding', 'limit', 'preset', 'srcEncoding', 'strategy', 'transform']

describe('encodb 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('encodeb')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['find', 'preview', 'recover'])
    expect(node.fields).toHaveLength(7)
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]?.id).toBe('repair')
    expect(node.groups[0]?.fieldIds).toHaveLength(7)
    expect(node.inputBindings).toHaveLength(8)
    expect(node.danger?.type).toBe('actionIn')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 阳性对照：上游那三个宿主执行字段本来就没有；哪天有人搬进来，这里必须红。
    for (const hostKey of ['runtime', 'host_functions', 'executor', 'entry', 'allowed_paths', 'memory_max_pages', 'dashboard']) {
      expect(node as unknown as Record<string, unknown>).not.toHaveProperty(hostKey)
    }
    // 阳性对照：定义顶层键集就这些。多一个键（例如有人把 `dashboard` 搬回来）立刻红。
    expect(Object.keys(node).sort()).toEqual([
      'actions', 'danger', 'dangerPrompt', 'definitionVersion', 'description', 'fields',
      'groups', 'help', 'inputBindings', 'nodeId', 'previewExport', 'publishesOutputPath',
      'reportsProgress', 'resultExport', 'title',
    ])
    // 阳性对照：清单 schema 写错一个字符，`validateManifest` 就必须拒绝而不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：动作与字段的 id、标签、默认值、预设十条一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'Encodeb', en: 'Encodeb' })
    expect(node.description.zh).toBe('通过重新解码路径组件，预览并修复乱码文件名。')
    expect(node.description.en).toBe('Preview and recover garbled filenames by re-decoding path components.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 查找乱码', '◉ 预览修复', '↻ 执行修复'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Find', 'Preview', 'Recover'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'paths', 'preset', 'srcEncoding', 'dstEncoding', 'strategy', 'limit',
    ])

    // 上游 `node-definitions/encodeb.json` 里这几条字面值，逐条钉住。
    expect(node.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'preview' })
    expect(node.fields.find((field) => field.id === 'preset')?.default).toEqual({ text: 'auto' })
    expect(node.fields.find((field) => field.id === 'srcEncoding')?.default).toEqual({ text: 'auto' })
    expect(node.fields.find((field) => field.id === 'strategy')?.default).toEqual({ text: 'replace' })
    expect(node.fields.find((field) => field.id === 'limit')?.default).toEqual({ number: 200 })
    expect(node.fields.find((field) => field.id === 'limit')?.range).toMatchObject({ min: 1, max: 2000 })
    // `GuardedRule {rule, when?}` 的形状原样留着：上游这里没有一条带 `when`，
    // 所以每条规则都恰好是 `{rule}`，摊平成 `{type}` 就校验不过（下面另有正控）。
    expect(node.fields.find((field) => field.id === 'paths')?.rules).toEqual([
      { rule: { type: 'atLeastLines', minimum: 1 } },
    ])
    expect(node.fields.find((field) => field.id === 'action')?.rules).toEqual([
      { rule: { type: 'oneOfDeclaredOptions' } },
    ])

    // 偏离 1：select 的值是裸字符串（上游是 `{text: "…"}`）。预设十条的顺序照上游。
    const preset = node.fields.find((field) => field.id === 'preset')!
    expect(preset.options?.map((option) => option.value)).toEqual([
      'auto', 'cn', 'jp', 'kr', 'jp_from_cn', 'jp_iso2022_from_cn', 'latin1_utf8', 'hash_u', 'middle_dot', 'custom',
    ])
    expect(preset.options?.[0]?.label.zh).toBe('Auto · 自动判断（推荐）')
    expect(preset.options?.[1]?.label.zh).toBe('CN · ╓╨╬─ → 中文')
    expect(node.fields.find((field) => field.id === 'strategy')?.options?.map((option) => option.value))
      .toEqual(['replace', 'copy'])
    // 偏离 2：分组标签叫 label（上游叫 title）。
    expect(node.groups[0]?.label).toEqual({ zh: '编码修复', en: 'Encoding repair' })
    // 偏离 3：help 只剩 whenToUse + safety（旧壳那两块整块不在，所以那一屏
    // 不可能再印出旧命令名；品牌尺是 `scripts/check-brand.mjs`，这里不重复它的判据）。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])
    // 偏离 4：绑定项的键集恰好是词表里那四个。
    for (const binding of node.inputBindings) {
      expect(Object.keys(binding).sort()).toEqual(['fieldId', 'slot', 'transform'])
    }
    // `preset` 在绑定表里出现两次（slot `preset` 与 slot `transform`）—— 那是上游的原样，
    // 不在这里"顺手去重"（去重了就等于删掉上游声明的那条 transform 出口）。
    expect(node.inputBindings.filter((binding) => binding.fieldId === 'preset').map((binding) => binding.slot))
      .toEqual(['preset', 'transform'])

    // 参数表手推：`strategy` 只在 recover 可见（定义里那条 `actionIs` + `negated:false`），
    // 其余四条对所有动作可见；动作选择器自己永远不进表。
    // 读 enum 用本地视图：SDK 的 `ParameterPropertySpec` 是几种形状的联合，
    // 直接点 `.enum` 在类型层就报错（crashu / findz 那份是同一处理由）。
    type PropertyView = { type?: string; enum?: unknown[]; required?: boolean }
    expect(Object.keys(parametersFor(node, 'preview'))).toEqual(['paths', 'preset', 'srcEncoding', 'dstEncoding', 'limit'])
    const recoverProps = parametersFor(node, 'recover') as unknown as Record<string, PropertyView>
    expect(Object.keys(recoverProps)).toEqual(['paths', 'preset', 'srcEncoding', 'dstEncoding', 'strategy', 'limit'])
    expect(recoverProps.strategy?.enum).toEqual(['replace', 'copy'])
    expect(recoverProps.paths?.type).toBe('array')
    // `atLeastLines` 不在"必填"的词表里（只有 `required` / `nonBlank` 算），
    // 所以 `paths` 是可选数组 —— 缺路径时由内核那句 `No valid paths provided.` 说话。
    expect(recoverProps.paths?.required).toBeUndefined()
    expect(parametersFor(node, 'find').action).toBeUndefined()

    // 阳性对照：把**会进参数表**的那条 select（`strategy`）改回上游的 `{text:"replace"}`
    // 形状，enum 就变成一堆对象 —— 那正是偏离 1 要防的事
    // （`action` 是 isActionSelector，不进参数表，所以对照必须拿会进表的那条来做）。
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    const strategyField = wrapped.fields.find((field) => field.id === 'strategy')!
    strategyField.options = strategyField.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    const wrappedProps = parametersFor(wrapped, 'recover') as unknown as Record<string, PropertyView>
    expect(wrappedProps.strategy?.enum).toEqual([{ text: 'replace' }, { text: 'copy' }])
  })

  it('危险闸门与定义同源：只有 recover 要批准，且不需要模型再传一次动作', () => {
    const node = definition()
    // 上游那一格原样：`actionField` 留着也不碍事（`dangerFor` 会落回 actionId）。
    expect(node.danger).toEqual({ type: 'actionIn', actionField: 'action', dangerous: ['recover'] })
    const prompt = node as unknown as { dangerPrompt?: { title?: { zh?: string; en?: string }; confirmLabel?: { zh?: string } } }
    expect(prompt.dangerPrompt?.title).toEqual({ zh: '确认文件名修复', en: 'Confirm filename recovery' })
    expect(prompt.dangerPrompt?.confirmLabel?.zh).toBe('确认修复')

    expect(dangerFor(node, undefined, 'find', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'preview', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'recover', {})?.zh).toContain('encodeb')
    // 双语两条都要有：`dangerFor` 的 reason 是 `{en, zh}`，缺一种语言界面上就是裸 key。
    expect(dangerFor(node, undefined, 'recover', {})?.en).toContain('Node "encodeb"')

    // 阳性对照：表单那条腿会把动作选择器的值一起送来，这时**参数说了算**
    // （`define-node.ts:186` 的 `args[actionField] ?? … ?? actionId`）。
    // 把这条读反了就会出现"面板上选 preview、却按 recover 拦"的假警报。
    expect(dangerFor(node, undefined, 'recover', { action: 'preview' })).toBeUndefined()
    expect(dangerFor(node, undefined, 'preview', { action: 'recover' })).toBeDefined()
    // 阳性对照：`dangerous` 换成别的一条，recover 就永远不亮 —— 闸门靠的是这一格，不是代码。
    const moved = JSON.parse(JSON.stringify(node)) as NodeDefinition
    moved.danger!.dangerous = ['preview']
    expect(dangerFor(moved, undefined, 'recover', {})).toBeUndefined()
    expect(dangerFor(moved, undefined, 'preview', {})).toBeDefined()
  })

  it('apply 给每个动作注册一个工具，名字是 encodb_<action>，Config 六条与清单同源', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual(['encodeb_find', 'encodeb_preview', 'encodeb_recover'])
    expect(registered[0]?.description).toContain('Encodeb')
    // 声明面与使用面同源：`Config` 的六个键就是上游 `[nodes.encodeb]` 那六条。
    expect(Object.keys(config).sort()).toEqual(CONFIG_KEYS)

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'decode', label: { zh: '解码', en: 'Decode' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        handlers: { find: async () => '', preview: async () => '', recover: async () => '' },
      })
    }).toThrow(/no handler for action "decode"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    // 这里用本仓一度犯过的形状错误：把上游的 `GuardedRule` 摊平成扁平 `{type}`。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[1]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken,
        handlers: { find: async () => '', preview: async () => '', recover: async () => '' },
      })
    }).toThrow(/must be a guarded rule object/)
    expect(validateNodeDefinition(broken).ok).toBe(false)
  })

  it('bin / exports / help 的接线形状：`xencodeb` 指向 lib/cli.js，帮助页从清单推导', async () => {
    expect(pkg.bin).toEqual({ xencodeb: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    // 期望值手抄推导器的规则：bin 是 xencodeb、示例行按动作列。
    expect(help.title).toBe('Encodeb')
    expect(help.commands[0]?.command).toBe('xencodeb')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xencodeb --help', 'xencodeb find', 'xencodeb preview', 'xencodeb recover',
    ])

    // 台账 G7：本包不 inject `commands`，所以 `help.ts` **不传** `command`。
    // 现状是推导器仍会按 `/${nodeId}` 兜底（`packages/node-sdk/src/help.ts:108`）
    // ⇒ 这一行是"已知残留"的尺，而不是对错的判据：SDK 去掉兜底的那天这条会红，
    // 那时才该改成 `not.toHaveProperty('command')`。
    expect(help.commands[1]?.command).toBe('/encodeb')
    // 真正的判据在这一头：本包确实没有注册无模型入口。
    const { inject } = await import('../src/index.ts')
    expect(inject).toEqual(['tools'])

    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const { nodeHelpFromManifest } = await import('@hibernalglow/xaihi-sdk')
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'xencodeb' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command))
      .toEqual(['xencodeb --help', 'xencodeb find', 'xencodeb preview'])
  })
})
