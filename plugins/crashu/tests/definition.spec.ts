/**
 * crashu 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/crashu.json`（definitionVersion 1），
 *   上游那份**没有** `runtime` / `host_functions` / `executor` 这三个宿主执行字段，
 *   所以这一轮"剥掉宿主执行字段"是空集（在下面的用例里钉住，剥无可剥也要说得出来）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作三条、字段十条、参数表那两组键名是照定义里的 `isActionSelector`
 *   与 `visible` 手推出来的，不由被测函数算出来。
 *
 * 四条**有意**偏离上游清单的地方在这里点名并钉住（理由与 samea 先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"scan"}` 摊平成 `"scan"`：SDK 的
 *    `fieldProperty` 把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 2. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串）与 `safety`：上游那两大块
 *    `workflows` / `commands` 说的是旧壳的 `xiranite crashu …` 命令名，本仓的 bin 是
 *    `crashu`、无模型入口是 `/crashu`（ADR-0010），照抄等于把"按帮助页敲一条不存在的命令"
 *    写进发布物。终端那一屏由 `src/help.ts` 从清单推导。
 * 4. `danger` 的 `actionIs` 谓词**去掉** `actionField: "action"`：`defineNode` 的参数表里
 *    没有动作选择器（`parametersFor` 明令跳过 `isActionSelector`），而 `dangerFor` 的
 *    `all` 分支只看 `exec.arguments`，留着那条就会得到"危险闸门永远不亮"。
 *    字段的 `visible` 里那条 `actionField` 反而要留：`parametersFor` 会自己造
 *    `{[selector.id]: actionId}` 喂给可见性求值。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-crashu/tests/definition
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
  parameters: { properties: Record<string, { type?: string; enum?: string[] }> }
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
  destinationPath: { get: () => '' },
  pairsFileName: { get: () => '' },
  overwrite: { get: () => false },
}

describe('crashu 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('crashu')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'plan', 'move'])
    expect(node.fields).toHaveLength(10)
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]?.id).toBe('collision')
    expect(node.groups[0]?.fieldIds).toHaveLength(10)
    expect(node.inputBindings).toHaveLength(10)
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

  it('词表照上游：动作与字段的 id、标签、默认值、阈值区间一个都不改', () => {
    const node = definition()
    expect(node.description.zh).toBe('匹配相似文件夹名称，并可选地移动匹配到的文件夹。')
    expect(node.description.en).toBe('Match similar folder names and optionally move matched folders.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 扫描', '⌁ 规划', '⇄ 移动'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'sourcePaths', 'targetPath', 'targetNames', 'destinationPath',
      'similarityThreshold', 'moveDirection', 'conflictPolicy', 'pairsFileName', 'dryRun',
    ])
    // 上游 `node-definitions/crashu.json` 里这几条字面值，逐条钉住。
    const threshold = node.fields.find((field) => field.id === 'similarityThreshold')
    expect(threshold?.range).toEqual({ min: 0, max: 1, step: 0.05 })
    expect(threshold?.default).toEqual({ number: 0.65 })
    expect(node.fields.find((field) => field.id === 'pairsFileName')?.default).toEqual({ text: 'folder_pairs.json' })
    expect(node.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    // `sourcePaths` 的规则上游写的是 `{rule:{type:"atLeastLines",minimum:1}}`，
    // `targetPath` 的那条带 `message`（`anyFilled` + 双语提示），两者都要原样留着。
    expect(node.fields.find((field) => field.id === 'sourcePaths')?.rules).toEqual([
      { rule: { type: 'atLeastLines', minimum: 1 } },
    ])
    expect(node.fields.find((field) => field.id === 'targetPath')?.rules).toEqual([
      {
        rule: { type: 'anyFilled', fieldIds: ['targetPath', 'targetNames'] },
        message: { zh: '请输入目标目录或目标名称。', en: 'Enter a target directory or names.' },
      },
    ])

    // 偏离 1：select 的值是裸字符串（上游是 `{text: "…"}`）。
    const direction = node.fields.find((field) => field.id === 'moveDirection')
    expect(direction?.options?.map((option) => option.value)).toEqual(['to_target', 'to_source'])
    // 偏离 2：分组标签叫 label（上游叫 title）。
    expect(node.groups[0]?.label).toEqual({ zh: '碰撞解析', en: 'Collision resolver' })
    // 偏离 3：help 只剩 whenToUse + safety。旧壳的 `workflows` / `commands` 两块整块不在，
    // 所以那一屏不可能再打印出旧命令名；品牌尺本身是 `scripts/check-brand.mjs`（未接线），
    // 这里不重复它的判据。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])

    // 阳性对照：select 的值是裸字符串才进得了模型的 enum。把**非选择器**那条
    // （`conflictPolicy`，它会进参数表）改回上游的 `{text:"skip"}` 形状，enum 就变成
    // 一堆对象——那正是偏离 1 要防的事（`action` 是 isActionSelector，不进参数表，
    // 所以对照必须拿会进表的那条来做）。
    // 阳性对照：select 的值是裸字符串才进得了模型的 enum。把**非选择器**那条
    // （`conflictPolicy`，它会进参数表）改回上游的 `{text:"skip"}` 形状，enum 就变成
    // 一堆对象——那正是偏离 1 要防的事（`action` 是 isActionSelector，不进参数表，
    // 所以对照必须拿会进表的那条来做）。
    //
    // 这里读 enum 用一个本地视图：SDK 的 `ParameterPropertySpec` 是"字符串 / 数组 / 数字 /
    // 布尔"几种形状的联合，`.enum` 只在其中一种上存在，直接点会在类型层就报错
    // （findz 那份 `tests/definition.spec.ts` 的 `RegisteredTool` 是同一处理由）。
    type PropertyView = { type?: string; enum?: unknown[] }
    const moveProps = parametersFor(node, 'move') as unknown as Record<string, PropertyView>
    expect(moveProps.moveDirection?.enum).toEqual(['to_target', 'to_source'])
    // 顺序照上游那份清单的声明次序（`skip` → `rename` → `overwrite`），
    // 与内核类型联合的写法（`"skip" | "overwrite" | "rename"`）不同，两处各按各的来。
    expect(moveProps.conflictPolicy?.enum).toEqual(['skip', 'rename', 'overwrite'])
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    const policyField = wrapped.fields.find((field) => field.id === 'conflictPolicy')!
    policyField.options = policyField.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    const wrappedProps = parametersFor(wrapped, 'move') as unknown as Record<string, PropertyView>
    expect(wrappedProps.conflictPolicy?.enum).toEqual([{ text: 'skip' }, { text: 'rename' }, { text: 'overwrite' }])
    // 对照：动作选择器自己永远不进参数表（SDK 明令跳过 isActionSelector）。
    expect(parametersFor(node, 'scan').action).toBeUndefined()
  })

  it('危险闸门与定义同源：move + 非预演才要批准，且不需要模型再传一次动作', () => {
    const node = definition()
    // 偏离 4：谓词里没有 actionField（`dangerFor` 的 all 分支只看参数表）。
    expect(node.danger?.predicates?.[0]?.test).toEqual({ type: 'actionIs', allowed: ['move'] })
    expect(dangerFor(node, undefined, 'scan', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'move', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'move', { dryRun: false })?.zh).toContain('crashu')
    expect(dangerFor(node, undefined, 'move', {})).toBeDefined()

    // 阳性对照：把上游那句 `actionField: "action"` 放回去，闸门就永远不亮——
    // 这条就是"为什么必须偏离"的证据，不是装饰。
    const withActionField = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withActionField.danger!.predicates![0]!.test.actionField = 'action'
    expect(dangerFor(withActionField, undefined, 'move', { dryRun: false })).toBeUndefined()
  })

  it('apply 给每个动作注册一个工具，名字是 crashu_<action>，动作选择器不进参数表', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual(['crashu_move', 'crashu_plan', 'crashu_scan'])
    expect(registered[0]?.description).toContain('Crashu')

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'undo', label: { zh: '撤销', en: 'Undo' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        handlers: { scan: async () => '', plan: async () => '', move: async () => '' },
      })
    }).toThrow(/no handler for action "undo"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    // 这里用本仓一度犯过的形状错误：把上游的 `GuardedRule` 摊平成扁平 `{type}`。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[1]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken,
        handlers: { scan: async () => '', plan: async () => '', move: async () => '' },
      })
    }).toThrow(/must be a guarded rule object/)
    expect(validateNodeDefinition(broken).ok).toBe(false)
  })

  it('bin / exports / cli-support 的接线形状：`crashu` 指向 lib/cli.js，help 从清单推导', async () => {
    expect(pkg.bin).toEqual({ crashu: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    // 期望值手抄推导器的规则：bin 是 crashu、无模型入口是 /crashu、示例行按动作列。
    expect(help.title).toBe('Crashu')
    expect(help.commands[0]?.command).toBe('crashu')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'crashu --help', 'crashu scan', 'crashu plan', 'crashu move',
    ])
    expect(help.commands[1]?.command).toBe('/crashu')

    // 阳性对照：把清单里的动作删一条，示例行就少一条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const { nodeHelpFromManifest } = await import('@hibernalglow/xaihi-sdk')
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'crashu', command: '/crashu' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual(['crashu --help', 'crashu scan', 'crashu plan'])
  })
})
