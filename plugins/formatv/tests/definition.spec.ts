/**
 * formatv 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/formatv.json`（definitionVersion 1），
 *   上游那份**没有** `runtime` / `host_functions` / `executor` 这三个宿主执行字段，
 *   所以这一轮"剥掉宿主执行字段"是空集（在下面的用例里钉住，剥无可剥也要说得出来）。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：四条动作、六个字段、六条绑定与参数表那组键名是照定义里的
 *   `isActionSelector` / `visible` 手推的，不由被测函数算出来。
 *
 * 五条**有意**偏离上游清单的地方在这里点名并钉住（1-4 与 `crashu` / `samea` 同源）：
 * 1. select 的 `options[].value` 从 `{text:"scan"}` 摊平成 `"scan"`。
 * 2. `groups[].title` 改叫 `label` —— 本条对 formatv 是空操作：上游那份 `groups` 就是
 *    **空数组**，这里不替它造一个分组（造了就是往清单里加上游没有的东西）。
 * 3. `help` 只留 `whenToUse`（每种语言一条字符串）与 `safety`；上游那两大块
 *    `workflows` / `commands` 说的是旧壳的 `xiranite formatv …` 命令名（bin 是
 *    `xformatv`、无模型入口是 `/formatv`，ADR-0010）。
 * 4. `danger` 的 `actionIs` 谓词去掉 `actionField: "action"`（理由见 crashu 同名说明，
 *    本包用例里带"放回去就永不亮"的对照）。
 * 5. 上游那份多出来的 `resultTable`（来源/目标/状态三列）与 `pathsText.placeholder`
 *    是**语义词表**而不是宿主执行字段，所以原样留着，不剥。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-formatv/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  bindInputs,
  dangerFor,
  defineNode,
  nodeHelpFromManifest,
  parametersFor,
  transformValue,
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

interface RegisteredTool {
  name: string
  description: string
  parameters: { properties: Record<string, { type?: string; enum?: string[] }> }
}

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
  recursive: { get: () => false },
  prefixName: { get: () => '' },
  dryRun: { get: () => true },
  reportNameTemplate: { get: () => 'formatv-{prefix}-duplicates.json' },
  reportDirectory: { get: () => '' },
  overwrite: { get: () => true },
}

describe('formatv 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('formatv')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['scan', 'add_nov', 'remove_nov', 'check_duplicates'])
    expect(node.fields).toHaveLength(6)
    expect(node.inputBindings).toHaveLength(6)
    expect(node.danger?.type).toBe('all')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 上游那份 groups 就是空数组（这里不替它造分组，偏离 2 说明写在文件头）。
    expect(node.groups).toEqual([])

    // 阳性对照：上游那三个宿主执行字段本来就没有；哪天有人搬进来，这里必须红。
    for (const hostKey of ['runtime', 'host_functions', 'executor']) {
      expect(node as unknown as Record<string, unknown>).not.toHaveProperty(hostKey)
    }
    // 阳性对照：清单 schema 写错一个字符就必须被拒，不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：动作与字段的 id、标签、默认值、绑定变换一个都不改', () => {
    const node = definition()
    expect(node.description.zh).toBe('扫描视频文件夹，添加/移除 .nov 后缀，并检查带前缀的重复项。')
    expect(node.description.en).toBe('Scan video folders, add/remove .nov suffixes, and check prefixed duplicates.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['扫描', '添加 .nov', '移除 .nov', '检查重复'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Scan', 'Add .nov', 'Remove .nov', 'Duplicates'])
    expect(node.fields.map((field) => field.id)).toEqual(['action', 'pathsText', 'recursive', 'prefixName', 'reportPath', 'dryRun'])
    expect(node.fields.find((field) => field.id === 'pathsText')?.kind).toBe('path-list')
    expect(node.fields.find((field) => field.id === 'prefixName')?.default).toEqual({ text: 'hb' })
    expect(node.fields.find((field) => field.id === 'recursive')?.default).toEqual({ boolean: false })
    expect(node.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    // `pathsText` 那条上游多出来的 placeholder 与 `lines` 都属语义词表（偏离 5）。
    // 读法走本地视图：SDK 的 `NodeField` 只声明了它自己要用的那些键，`placeholder` / `lines`
    // 是上游清单里的额外语义键，过校验器时原样透传（校验器只查它认得的形状）。
    type ExtraField = { placeholder?: { zh: string; en: string }; lines?: number }
    const pathsField = node.fields.find((field) => field.id === 'pathsText') as unknown as ExtraField
    expect(pathsField.placeholder).toEqual({
      zh: '每行一个文件夹或文件',
      en: 'One folder or file per line',
    })
    expect(pathsField.lines).toBe(5)
    expect(node.fields.find((field) => field.id === 'pathsText')?.rules).toEqual([
      { rule: { type: 'atLeastLines', minimum: 1 } },
    ])
    expect(node.inputBindings.map((binding) => `${binding.fieldId}:${binding.transform ?? 'identity'}`)).toEqual([
      'action:trim', 'pathsText:delimited', 'recursive:asBoolean', 'prefixName:trim', 'reportPath:trimOrOmit', 'dryRun:asBoolean',
    ])

    // 偏离 1：select 的值是裸字符串。对照：拿会进参数表的那条改回 `{text}` 形状，
    // enum 立刻变成一堆对象（`action` 是 isActionSelector，不进表，不能拿来当对照）。
    expect(parametersFor(node, 'scan').action).toBeUndefined()
    const wrapped = JSON.parse(JSON.stringify(node)) as NodeDefinition
    const actionField = wrapped.fields.find((field) => field.id === 'action')!
    actionField.options = actionField.options!.map((option) => ({ ...option, value: { text: option.value } as unknown as string }))
    expect(validateNodeDefinition(wrapped).ok).toBe(true)
    // 本包那份在参数表里是裸字符串的字段一个都没有（六个字段里只有 `action` 是 select），
    // 所以偏离 1 在这里的对照读作："摊平与不摊平过校验器都一样，差别只在模型看到的 enum"。
    expect(Object.keys(parametersFor(node, 'scan'))).toEqual(['pathsText', 'recursive', 'prefixName', 'reportPath', 'dryRun'])

    // 偏离 3：help 只剩 whenToUse + safety。旧壳的 `workflows` / `commands` 两块整块不在，
    // 所以那一屏不可能再打印出旧命令名；品牌尺本身是 `scripts/check-brand.mjs`（未接线），
    // 这里不重复它的判据。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])
    expect(node.help?.whenToUse?.en).toBe("Use FormatV when you need this node's video workflow from either the workspace UI or CLI.")

    // 偏离 5：resultTable 那三列原样留着（宽度是上游写的 40/40/12）。
    const extra = pkg.xaihi?.node as { resultTable?: { columns?: { id: string; width: number }[] } }
    expect(extra.resultTable?.columns?.map((column) => `${column.id}:${String(column.width)}`)).toEqual(['sourcePath:40', 'targetPath:40', 'status:12'])
  })

  it('危险闸门与定义同源：两条改名动作 + 非预演才要批准', () => {
    const node = definition()
    expect(node.danger?.predicates?.[0]?.test).toEqual({ type: 'actionIs', allowed: ['add_nov', 'remove_nov'] })
    expect(dangerFor(node, undefined, 'scan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(node, undefined, 'check_duplicates', {})).toBeUndefined()
    expect(dangerFor(node, undefined, 'add_nov', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'add_nov', { dryRun: false })?.zh).toContain('formatv')
    expect(dangerFor(node, undefined, 'remove_nov', {})).toBeDefined()

    // 阳性对照：把上游那句 `actionField: "action"` 放回去，闸门就永远不亮。
    const withActionField = JSON.parse(JSON.stringify(node)) as NodeDefinition
    withActionField.danger!.predicates![0]!.test.actionField = 'action'
    expect(dangerFor(withActionField, undefined, 'add_nov', { dryRun: false })).toBeUndefined()
  })

  it('pathsText 的声明绑定是 delimited：换行分隔的多行文本会被整个当成一条路径', () => {
    const node = definition()
    // 期望值手抄 SDK `transformValue` 的规则（只按逗号切），这就是 `src/index.ts`
    // 里那条"按原始形状自己切"的接线判据存在的理由。
    expect(transformValue('/a\n/b', 'delimited')).toEqual(['/a\n/b'])
    expect(transformValue('/a,/b', 'delimited')).toEqual(['/a', '/b'])
    expect(bindInputs(node, { pathsText: '/a\n/b' })).toMatchObject({ paths: ['/a\n/b'] })

    // 阳性对照：`reportPath` 的 trimOrOmit 在空串时必须给出 undefined，
    // 否则内核会把空字符串当"没给"以外的值处理（`core.ts:126` 的 clean 之后仍是空串）。
    expect(bindInputs(node, { reportPath: '  ' })).toMatchObject({ reportPath: undefined })
    expect(bindInputs(node, { reportPath: ' /out/r.json ' })).toMatchObject({ reportPath: '/out/r.json' })
  })

  it('apply 给四个动作各注册一个工具，名字是 formatv_<action>', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name)).toEqual([
      'formatv_scan', 'formatv_add_nov', 'formatv_remove_nov', 'formatv_check_duplicates',
    ])

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸。
    const missing = JSON.parse(JSON.stringify(node)) as NodeDefinition
    missing.actions.push({ id: 'undo', label: { zh: '撤销', en: 'Undo' } })
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, {
        definition: missing,
        handlers: { scan: async () => '', add_nov: async () => '', remove_nov: async () => '', check_duplicates: async () => '' },
      })
    }).toThrow(/no handler for action "undo"/)

    // 阳性对照：坏定义必须在装载期就被拒，而不是跑起来才空转。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[1]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, {
        definition: broken,
        handlers: { scan: async () => '', add_nov: async () => '', remove_nov: async () => '', check_duplicates: async () => '' },
      })
    }).toThrow(/must be a guarded rule object/)
  })

  it('bin / exports 的接线形状：`xformatv` 指向 lib/cli.js，help 从清单推导', async () => {
    expect(pkg.bin).toEqual({ xformatv: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    expect(help.title).toBe('FormatV')
    expect(help.commands[0]?.command).toBe('xformatv')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xformatv --help', 'xformatv scan', 'xformatv add_nov', 'xformatv remove_nov', 'xformatv check_duplicates',
    ])
    expect(help.commands[1]?.command).toBe('/formatv')

    // 阳性对照：清单少一条动作，示例行就少一条 ⇒ 这把尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'xformatv', command: '/formatv' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xformatv --help', 'xformatv scan', 'xformatv add_nov', 'xformatv remove_nov',
    ])
  })
})
