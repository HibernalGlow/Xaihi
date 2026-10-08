/**
 * migratef 这一包自己的判据：清单合法性、定义合法性、动作 ↔ 工具的覆盖、危险闸门。
 *
 * 真源分工写清楚，免得下次有人以为这里在测内核：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/migratef.json`（definitionVersion 1）。
 *   上游那份**只有一条**宿主执行字段：`dashboard`（`title` / `primary` / `secondary` /
 *   `metrics` 那一族），本仓整块不接（`scripts/check-vocab.mjs` 的文件头就是这条理由），
 *   所以"剥掉宿主执行字段"在这里剥掉的就是这一条——在下面的用例里钉住。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition` / `validateManifest`；
 *   工具注册与 pre-execute 闸门是 `defineNode`。
 * - 期望值全部手写：动作五条、字段九条、每个动作的参数表是照定义里的
 *   `isActionSelector` 与各字段 `visible` 手推出来的，不由被测函数算出来。
 *
 * 四条**有意**偏离上游清单（与 `crashu` 先例同源）：
 * 1. select 的 `options[].value` 从 `{text:"plan"}` 摊平成 `"plan"`。
 * 2. `groups[].title` 改叫 `label`。
 * 3. `help` 只留 `whenToUse` + `safety`（上游那两大块说的是旧壳的 `xiranite migratef …`）。
 * 4. 剥掉 `dashboard`（上面说过，唯一的一条宿主执行字段）。
 *
 * `danger` 原样留着上游的 `{type:"pluginExport", exportName:"is_dangerous"}`，
 * 判定函数在 `src/index.ts`。这里把**判定面的一格落差**也钉住：`defineNode` 的
 * `dangerCheck(args)` 拿不到动作身份（`define-node.ts:195-199`），所以上游那句
 * `((move ∨ copy) ∧ dryRun === false) ∨ undo` 只能按保守的一半实现
 * （`args.dryRun !== true` ⇒ 要批准）。后果是**只读的 `plan` / `history` 也会被问一次**——
 * 多问而不是少问，这条用例把两侧都写下来，等缝隙补上（新缺口 **G-pluginexport-action-blind**）
 * 时它会红，提醒人来把这里改成精确判据。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-migratef/tests/definition
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

const config = { historyPath: { get: () => '' } }

const HANDLERS = {
  plan: async () => '',
  move: async () => '',
  copy: async () => '',
  history: async () => '',
  undo: async () => '',
}

describe('migratef 的清单与定义', () => {
  it('package.json#xaihi 与 xaihi.node 都过自己的校验器', () => {
    const manifest = validateManifest(pkg.xaihi)
    expect(manifest.ok ? true : manifest.errors).toBe(true)
    const node = definition()
    expect(node.nodeId).toBe('migratef')
    expect(node.definitionVersion).toBe(1)
    expect(node.actions.map((action) => action.id)).toEqual(['plan', 'move', 'copy', 'history', 'undo'])
    expect(node.fields).toHaveLength(9)
    expect(node.groups).toHaveLength(1)
    expect(node.groups[0]?.id).toBe('migration')
    expect(node.groups[0]?.fieldIds).toHaveLength(9)
    expect(node.inputBindings).toHaveLength(9)
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')

    // 阳性对照：`dashboard` 是上游唯一那条宿主执行字段，剥掉了就得钉住"没搬进来"；
    // 其余几个宿主字段本来就不在这份定义里，一起钉。哪天有人搬进来，这里必须红。
    for (const hostKey of ['dashboard', 'runtime', 'host_functions', 'executor', 'entry', 'allowed_paths', 'memory_max_pages']) {
      expect(node as unknown as Record<string, unknown>).not.toHaveProperty(hostKey)
    }
    // 阳性对照：清单 schema 写错一个字符，`validateManifest` 就必须拒绝而不是放过。
    const brokenSchema = JSON.parse(JSON.stringify(pkg.xaihi)) as { schema: string }
    brokenSchema.schema = 'xaihi.manifest/2'
    expect(validateManifest(brokenSchema).ok).toBe(false)
  })

  it('词表照上游：五条动作、九个字段、三模式与预设值一个都不改', () => {
    const node = definition()
    expect(node.title).toEqual({ zh: 'MigrateF', en: 'MigrateF' })
    expect(node.description.zh).toBe('以 preserve、flat、direct 三种模式移动或复制文件，并提供撤销历史。')
    expect(node.description.en).toBe('Move or copy files with preserve, flat, and direct modes plus undo history.')
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌁ 迁移计划', '→ 移动', '⧉ 复制', '◷ 历史', '↶ 撤销'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['⌁ Plan', '→ Move', '⧉ Copy', '◷ History', '↶ Undo'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'mode', 'sourcePaths', 'targetPath', 'maxWorkers', 'batchId', 'historyLimit', 'historyPath', 'dryRun',
    ])

    // 上游 `node-definitions/migratef.json` 里这几条字面值，逐条钉住。
    expect(node.fields.find((field) => field.id === 'action')?.default).toEqual({ text: 'plan' })
    expect(node.fields.find((field) => field.id === 'mode')?.default).toEqual({ text: 'preserve' })
    expect(node.fields.find((field) => field.id === 'maxWorkers')?.default).toEqual({ number: 16 })
    expect(node.fields.find((field) => field.id === 'maxWorkers')?.range).toMatchObject({ min: 1, max: 64 })
    expect(node.fields.find((field) => field.id === 'historyLimit')?.default).toEqual({ number: 10 })
    expect(node.fields.find((field) => field.id === 'dryRun')?.default).toEqual({ boolean: true })
    // `GuardedRule {rule, when?}` 的形状原样留着：`mode` 那条带 when（历史/撤销时不检查），
    // `historyLimit` 那条不带。摊平就校验不过（下面另有正控）。
    expect(node.fields.find((field) => field.id === 'mode')?.rules).toEqual([
      {
        rule: { type: 'oneOfDeclaredOptions' },
        when: { type: 'single', predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['history', 'undo'] }, negated: true } },
      },
    ])
    expect(node.fields.find((field) => field.id === 'historyLimit')?.rules).toEqual([
      { rule: { type: 'integerInRange' } },
    ])

    // 偏离 1：select 的值是裸字符串（上游是 `{text: "…"}`）。
    expect(node.fields.find((field) => field.id === 'mode')?.options?.map((option) => option.value))
      .toEqual(['preserve', 'flat', 'direct'])
    expect(node.fields.find((field) => field.id === 'mode')?.options?.[0]?.label.zh).toBe('▦ 保留结构')
    // 偏离 2：分组标签叫 label（上游叫 title）。
    expect(node.groups[0]?.label).toEqual({ zh: '迁移配置', en: 'Migration' })
    // 偏离 3：help 只剩 whenToUse + safety。
    expect(Object.keys(node.help ?? {})).toEqual(['whenToUse', 'safety'])
    const help = node.help as unknown as { whenToUse?: { zh?: string }; safety?: { defaultMode?: string } }
    expect(help.whenToUse?.zh).toBe('当需要从工作区 UI 或 CLI 使用该节点的文件工作流时，使用 MigrateF。')
    expect(help.safety?.defaultMode).toBe('preview')

    // 参数表手推（每条都对应定义里那条 `visible`）：
    // plan/move/copy ⇒ mode+sourcePaths+targetPath+maxWorkers+dryRun；
    // history ⇒ 只有 historyLimit+historyPath；undo ⇒ batchId+historyPath+dryRun。
    for (const action of ['plan', 'move', 'copy'] as const) {
      expect(Object.keys(parametersFor(node, action))).toEqual(['mode', 'sourcePaths', 'targetPath', 'maxWorkers', 'dryRun'])
    }
    expect(Object.keys(parametersFor(node, 'history'))).toEqual(['historyLimit', 'historyPath'])
    expect(Object.keys(parametersFor(node, 'undo'))).toEqual(['batchId', 'historyPath', 'dryRun'])
    // 阳性对照：`targetPath` 那两条规则**都带 when**（历史/撤销时不检查），
    // 所以它不许被标成永久 required —— 那会让模型看到一份比界面更严的参数表。
    const planProps = parametersFor(node, 'plan') as unknown as Record<string, { required?: boolean }>
    expect(planProps.targetPath?.required).toBeUndefined()
    // 对照：动作选择器自己永远不进参数表（SDK 明令跳过 isActionSelector）。
    expect(parametersFor(node, 'move').action).toBeUndefined()
  })

  it('危险闸门是上游那份 pluginExport，判定保守到宁可多问', () => {
    const node = definition()
    expect(node.danger).toEqual({ type: 'pluginExport', exportName: 'is_dangerous' })
    const prompt = node as unknown as { dangerPrompt?: { title?: { zh?: string; en?: string } } }
    expect(prompt.dangerPrompt?.title).toEqual({ zh: '确认真实迁移', en: 'Confirm live migration' })

    const check = (args: Record<string, unknown>): boolean => args.dryRun !== true
    // 该拦的三条：非预演的 move / copy，和 undo。
    expect(dangerFor(node, check, 'move', { dryRun: false })?.zh).toContain('migratef')
    expect(dangerFor(node, check, 'copy', { dryRun: false })).toBeDefined()
    expect(dangerFor(node, check, 'undo', {})).toBeDefined()
    // 该放的：显式预演。
    expect(dangerFor(node, check, 'move', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, check, 'copy', { dryRun: true })).toBeUndefined()
    // 已知代价（G-pluginexport-action-blind）：只读腿也被问一次。**这条不是"对的"，是现状**，
    // 缝隙补上后应当改成 `expect(...).toBeUndefined()`，那时红的是尺而不是闸门。
    expect(dangerFor(node, check, 'history', {})).toBeDefined()

    // 阳性对照 1：判定函数换成恒假，move 就永远不亮 ⇒ 这条尺看得见"闸门被关掉"。
    expect(dangerFor(node, () => false, 'move', { dryRun: false })).toBeUndefined()
    // 阳性对照 2：`pluginExport` 少了判定函数，装载期就要炸（不是跑起来才空转）。
    expect(() => dangerFor(node, undefined, 'move', {})).toThrow(/dangerCheck/)
    const fresh = fakeContext()
    expect(() => {
      defineNode(fresh.ctx, { definition: pkg.xaihi?.node, handlers: HANDLERS })
    }).toThrow(/pluginExport/)
  })

  it('apply 给每个动作注册一个工具，名字是 migratef_<action>', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config)
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual([
      'migratef_copy', 'migratef_history', 'migratef_move', 'migratef_plan', 'migratef_undo',
    ])
    expect(registered[0]?.description).toContain('MigrateF')

    // 阳性对照：定义里多一条动作而没有对应 handler 时，装载期必须炸，
    // 不能留下一个"面板看得见、工具少了"的节点。
    const missing = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as NodeDefinition
    missing.actions.push({ id: 'rollback', label: { zh: '回滚', en: 'Rollback' } })
    const withoutHandler = fakeContext()
    expect(() => {
      defineNode(withoutHandler.ctx, { definition: missing, handlers: HANDLERS, dangerCheck: () => false })
    }).toThrow(/no handler for action "rollback"/)

    // 阳性对照：坏定义必须在装载期就被拒。这里用本仓一度犯过的形状错误：
    // 把上游的 `GuardedRule` 摊平成扁平 `{type}`。
    const broken = JSON.parse(JSON.stringify(node)) as { fields: { id: string; rules?: unknown[] }[] }
    broken.fields[2]!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const another = fakeContext()
    expect(() => {
      defineNode(another.ctx, { definition: broken, handlers: HANDLERS, dangerCheck: () => false })
    }).toThrow(/must be a guarded rule object/)
    expect(validateNodeDefinition(broken).ok).toBe(false)
  })

  it('bin / exports / help 的接线形状：`migratef` 指向 lib/cli.js，帮助页从清单推导', async () => {
    expect(pkg.bin).toEqual({ migratef: './lib/cli.js' })
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.', './cli', './help', './locale/*.json', './cordis.patch.yml', './package.json'])

    const { help } = await import('../src/help.ts')
    expect(help.title).toBe('MigrateF')
    expect(help.commands[0]?.command).toBe('migratef')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'migratef --help', 'migratef plan', 'migratef move', 'migratef copy', 'migratef history', 'migratef undo',
    ])

    // 台账 G7：本包不 inject `commands`，所以 `help.ts` **不传** `command`。
    // 现状是推导器仍按 `/${nodeId}` 兜底 ⇒ 这一行是"已知残留"的尺，不是对错的判据。
    expect(help.commands[1]?.command).toBe('/migratef')
    const { inject } = await import('../src/index.ts')
    expect(inject).toEqual(['tools'])

    // 阳性对照：把清单里的动作删两条，示例行就少两条 ⇒ 这条尺读的是清单，不是手写文案。
    const cloned = JSON.parse(JSON.stringify(pkg.xaihi?.node)) as { actions: unknown[] }
    cloned.actions.pop()
    cloned.actions.pop()
    const { nodeHelpFromManifest } = await import('@hibernalglow/xaihi-sdk')
    const shrunk = nodeHelpFromManifest(cloned, { bin: 'migratef' })
    expect(shrunk.commands[0]?.examples.map((example) => example.command))
      .toEqual(['migratef --help', 'migratef plan', 'migratef move', 'migratef copy'])
  })
})
