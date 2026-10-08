/**
 * bitv 这一包自己的判据：清单合法性、词表对上游、动作 ↔ 工具的覆盖、危险闸门、宿主接线。
 *
 * 真源分工写清楚（这里不测内核，内核的保真度在 `tests/core.spec.ts`）：
 * - `xaihi.node/v1` 的词表照 `<Xiranite>/node-definitions/bitv.json`（definitionVersion 1）。
 *   期望值**全部手抄**，不在测试里读上游那份文件，更不由被测函数现算。
 * - 校验器是 `@hibernalglow/xaihi-sdk` 的 `validateNodeDefinition`；工具注册与 pre-execute
 *   闸门是 `defineNode`；参数表与闸门共用 `conditions.ts` 那一个求值器。
 *
 * 四处**有意**偏离上游清单，逐条点名（与 `crashu` / `rawfilter` 的先例同源）：
 * 1. `groups[].title` 改叫 `label`：本仓 `NodeGroup` 的词表用的是 `label`；
 *    上游那两条分组各自还带的 `description` 原样留着（`plugins/gifu` 同处理）。
 * 2. select 的 `options[].value` 从 `{text:"status"}` 摊平成 `"status"`：SDK 的 `fieldProperty`
 *    把它直接当 enum 成员交给模型，包一层标量模型就选不中。
 * 3. `danger` 的 `actionIs` 谓词**去掉** `actionField: "action"`：`dangerFor` 的 `all` 分支只看
 *    `exec.arguments`，而 `parametersFor` 明令跳过 `isActionSelector` ⇒ 留着那条就是
 *    "危险闸门永远不亮"。下面把这一点**证伪**给你看，不是审美选择。
 *    字段 `visible` / `rules[].when` 里那条 `actionField` 反而要留：可见性求值自己会造
 *    `{[selector.id]: actionId}` 喂给它。
 * 4. `help` 只留 `whenToUse`（每种语言一条字符串，上游是每种语言一个数组）与 `safety`：
 *    上游的 `workflows` / `commands` 那一整块在教使用者敲 `bitv ui` / `bitv gd` /
 *    `bitv analyze <路径>` —— 这三条腿在本包**一条都跑不了**（终端面整表拒绝，见
 *    `src/cli.ts`），照抄就是把缺口台账 G4 那一类"清单在宣传包自己会拒的腿"写进发布物。
 *
 * 一处上游自带的**默认值分叉**两头都钉住、不在这里统一（G8：模型省略布尔时 `bindInputs`
 * 折成 `false`，而清单声明的 default 只有表单那一侧会填）：`dryRun` 字段声明的默认是 **true**
 * （预演），模型没给那一条时宿主收到的是 **false**（真动文件）⇒ 这一步先被 `danger.all`
 * 变成 DSH 的 `ask`。见下面标着 G8 的那条用例。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-bitv/tests/definition
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bindInputs,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateNodeDefinition,
  type NodeDefinition,
  type PreDecision,
} from '@hibernalglow/xaihi-sdk'
import { apply, type Config as BitvConfig } from '../src/index.ts'
import type { BitvSubprocessHandle, BitvSubprocessSeam, BitvSubprocessSpawnSpec } from '../src/platform.ts'

/** `xaihi.node` 的原始 JSON：要读 `label` / `title` / `actionField` 这些被类型抹平的字面量。 */
interface Localized { zh: string; en: string }
interface RawTest { type: string; actionField?: string; allowed?: unknown[]; fieldId?: string }
interface RawPredicate { test: RawTest; negated: boolean }
interface RawRule { rule: { type: string; minimum?: number; exportName?: string }; when?: { type: string; predicate?: { test: RawTest } } }
interface RawField {
  id: string
  kind: string
  label: Localized
  description?: Localized
  isActionSelector?: boolean
  lines?: number
  range?: Record<string, number>
  default?: Record<string, unknown>
  options?: { value: unknown; label: Localized }[]
  rules?: RawRule[]
  visible?: { type: string; predicate?: { test: RawTest; negated: boolean } }
}
interface RawGroup {
  id: string
  label?: Localized
  title?: Localized
  description?: Localized
  fieldIds: string[]
}
interface RawNode {
  definitionVersion: number
  nodeId: string
  title: Localized
  description: Localized
  actions: { id: string; label: Localized }[]
  fields: RawField[]
  groups: RawGroup[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates: RawPredicate[] }
  dangerPrompt: { title: Localized; body: Localized; confirmLabel: Localized }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: Localized; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  xaihi?: { node?: RawNode; id?: string }
  bin?: Record<string, string>
  exports?: Record<string, unknown>
}

function raw(): RawNode {
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error('package.json#xaihi.node 没了，这条尺没有真源可比')
  return node
}

function field(id: string): RawField {
  const found = raw().fields.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`夹具里没有字段 "${id}"（清单被改过？尺要跟着改，不要在这里静默）`)
  return found
}

function definition(): NodeDefinition {
  const result = validateNodeDefinition(raw())
  if (!result.ok) throw new Error(`清单不合法：${result.errors.join('; ')}`)
  return result.value
}

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('bitv 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(raw())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = structuredClone(raw())
    // 上游 `GuardedRule` 是 `{rule, when?}`；条件规则还带着 `when`。这里刻意写成扁平那份。
    const target = broken.fields.find((entry) => entry.id === 'paths') as { rules?: unknown[] }
    target.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：range 挂在非 number 字段上、slot 引用了不存在的字段', () => {
    const badRange = structuredClone(raw())
    badRange.fields.find((entry) => entry.id === 'reportPath')!.range = { min: 0, max: 1 }
    const first = validateNodeDefinition(badRange)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('range belongs to number fields only')

    const badBinding = structuredClone(raw())
    badBinding.inputBindings.push({ fieldId: 'nope', slot: 'nope', transform: 'trim' })
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('unknown field')
  })

  it('清单的三条导出面齐（bin + ./cli + ./help），否则聚合 CLI 少一条腿', () => {
    expect(Object.keys(pkg.bin ?? {})).toEqual(['bitv'])
    expect(pkg.exports?.['./cli']).toBeDefined()
    expect(pkg.exports?.['./help']).toBeDefined()
  })
})

describe('bitv 清单的词表逐字对上游', () => {
  it('四条动作、十条字段、标题与描述照上游', () => {
    const node = definition()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('bitv')
    expect(node.title).toEqual({ zh: 'BitV', en: 'BitV' })
    expect(node.description).toEqual({
      zh: '使用 ffprobe 分析视频码率并安全分类文件。',
      en: 'Analyze video bitrate with ffprobe and classify files safely.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['status', 'analyze', 'classify', 'report'])
    expect(node.actions.map((action) => action.label.en)).toEqual([
      'Environment status', 'Analyze bitrate', 'Analyze and classify', 'Classify from report',
    ])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['环境状态', '分析码率', '分析并分类', '按报告分类'])
    expect(node.fields.map((entry) => entry.id)).toEqual([
      'action', 'paths', 'reportPath', 'recursive', 'bitrateStepMbps', 'maxLevels',
      'outputPath', 'targetPath', 'transferMode', 'dryRun',
    ])
    expect(node.fields.map((entry) => entry.kind)).toEqual([
      'select', 'path-list', 'text', 'boolean', 'number', 'number', 'text', 'text', 'select', 'boolean',
    ])
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('两条分组：title 已换成 label，fieldIds 与上游同序，description 原样留', () => {
    const groups = raw().groups
    expect(groups.map((group) => group.id)).toEqual(['source', 'output'])
    expect(groups.map((group) => group.label)).toEqual([
      { zh: '来源与分析', en: 'Source and analysis' },
      { zh: '分类与输出', en: 'Classification and output' },
    ])
    // 阳性对照：`title` 这个键在本仓词表里不许活下来（留着就是两份真源）。
    expect(groups.every((group) => group.title === undefined)).toBe(true)
    expect(groups[0]!.fieldIds).toEqual(['action', 'paths', 'reportPath', 'recursive', 'bitrateStepMbps', 'maxLevels'])
    expect(groups[1]!.fieldIds).toEqual(['outputPath', 'targetPath', 'transferMode', 'dryRun'])
    expect(groups[0]!.description).toEqual({
      zh: '选择工作流以及需要检查的视频或报告。',
      en: 'Choose the workflow and the videos or report to inspect.',
    })
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一）', () => {
    expect(field('action').options?.map((option) => option.value)).toEqual(['status', 'analyze', 'classify', 'report'])
    expect(field('action').default).toEqual({ text: 'analyze' })
    expect(field('action').isActionSelector).toBe(true)
    // 阳性对照：上游那种 `{text:"status"}` 形状在这里必须不是对象。
    expect(typeof field('action').options?.[0]?.value).toBe('string')
    expect(field('transferMode').options?.map((option) => option.value)).toEqual(['copy', 'move'])
    expect(field('transferMode').default).toEqual({ text: 'copy' })
  })

  it('默认值与 range 逐字对上游（5 / 10 / 1..1000 / 0.1 起 步长 0.5 / 预演开）', () => {
    expect(field('recursive').default).toEqual({ boolean: true })
    expect(field('dryRun').default).toEqual({ boolean: true })
    expect(field('bitrateStepMbps').default).toEqual({ number: 5 })
    expect(field('bitrateStepMbps').range).toEqual({ min: 0.1, step: 0.5 })
    expect(field('maxLevels').default).toEqual({ number: 10 })
    expect(field('maxLevels').range).toEqual({ min: 1, max: 1000, step: 1 })
    expect(field('paths').default).toEqual({ text: '' })
    expect(field('paths').lines).toBe(5)
  })

  it('绑定十条逐条对上游（paths 是 lines、三个路径位是 trimOrOmit、两个布尔是 asBoolean）', () => {
    expect(definition().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['paths', 'paths', 'lines'],
      ['reportPath', 'reportPath', 'trimOrOmit'],
      ['targetPath', 'targetPath', 'trimOrOmit'],
      ['outputPath', 'outputPath', 'trimOrOmit'],
      ['recursive', 'recursive', 'asBoolean'],
      ['bitrateStepMbps', 'bitrateStepMbps', 'identity'],
      ['maxLevels', 'maxLevels', 'asInteger'],
      ['transferMode', 'transferMode', 'trim'],
      ['dryRun', 'dryRun', 'asBoolean'],
    ])
  })

  it('危险闸门：classify / report 且预演关掉才危险；谓词里不许留 actionField', () => {
    const node = definition()
    expect(raw().danger).toEqual({
      type: 'all',
      predicates: [
        { test: { type: 'actionIs', allowed: ['classify', 'report'] }, negated: false },
        { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
      ],
    })
    // 阳性对照：把上游那条 `actionField: "action"` 塞回去 ⇒ 闸门**永远不亮**。
    const withActionField = structuredClone(raw())
    withActionField.danger.predicates[0]!.test.actionField = 'action'
    const revived = validateNodeDefinition(withActionField)
    if (!revived.ok) throw new Error('夹具不合法')
    expect(dangerFor(revived.value, undefined, 'classify', { dryRun: false })).toBeUndefined()
    // 剥掉之后同一次调用就是要批准——这一对断言是"为什么必须剥"的证据。
    expect(dangerFor(node, undefined, 'classify', { dryRun: false })).toBeDefined()
  })

  it('字段的 visible / rules[].when 里的 actionField 留着（可见性求值要它）', () => {
    expect(field('paths').visible?.predicate?.test).toEqual({
      type: 'actionIs', actionField: 'action', allowed: ['analyze', 'classify'],
    })
    expect(field('paths').rules?.[0]?.when?.predicate?.test.actionField).toBe('action')
    expect(field('paths').rules?.[0]?.rule).toEqual({ type: 'atLeastLines', minimum: 1 })
    expect(field('reportPath').rules?.[0]?.rule).toEqual({ type: 'required' })
    expect(field('bitrateStepMbps').rules?.[0]?.rule).toEqual({ type: 'custom', exportName: 'positive_number' })
  })

  it('help 只剩 whenToUse（数组已合成一句）与 safety；workflows / commands 不搬', () => {
    const help = raw().help
    expect(Object.keys(help)).toEqual(['whenToUse', 'safety'])
    expect(help.whenToUse.en).toBe(
      'Use BitV to inspect bitrate distributions before organizing a video library. '
      + 'Use report classification to preview or repeat a previously saved analysis.',
    )
    expect(help.whenToUse.zh).toBe('整理视频库前，用 BitV 检查码率分布。使用报告分类来预演或复用之前保存的分析结果。')
    expect(help.safety.defaultMode).toBe('preview')
    expect(help.safety.notes.zh).toEqual([
      'classify 与 report 默认使用 dry-run。',
      '复制、移动和报告写入都不会覆盖已有路径，而是自动选择带编号的新路径。',
    ])
    expect(help.safety.notes.en[1]).toBe(
      'Copy, move, and report writes never overwrite an existing path; a numbered destination is selected instead.',
    )
  })

  it('dangerPrompt 原样留（它是给审批 UI 看的文案，不是第二套闸门）', () => {
    expect(raw().dangerPrompt.title).toEqual({ zh: '应用视频分类？', en: 'Apply file classification?' })
    expect(raw().dangerPrompt.body.zh).toBe('BitV 将{{mode}}视频到对应码率目录；已有文件不会被覆盖。')
    expect(raw().dangerPrompt.confirmLabel).toEqual({ zh: '应用分类', en: 'Apply classification' })
  })
})

describe('bitv 清单的 SDK 侧形状', () => {
  it('四条动作各自的参数表 = 该动作可见的字段（status 一个参数都不要）', () => {
    const node = definition()
    expect(Object.keys(parametersFor(node, 'status'))).toEqual([])
    expect(Object.keys(parametersFor(node, 'analyze'))).toEqual(
      ['paths', 'recursive', 'bitrateStepMbps', 'maxLevels', 'outputPath'],
    )
    expect(Object.keys(parametersFor(node, 'classify'))).toEqual(
      ['paths', 'recursive', 'bitrateStepMbps', 'maxLevels', 'targetPath', 'transferMode', 'dryRun'],
    )
    expect(Object.keys(parametersFor(node, 'report'))).toEqual(
      ['reportPath', 'bitrateStepMbps', 'maxLevels', 'targetPath', 'transferMode', 'dryRun'],
    )
    expect(parametersFor(node, 'analyze').paths).toMatchObject({ type: 'array', items: { type: 'string' } })
    expect(parametersFor(node, 'classify').transferMode).toMatchObject({ type: 'string', enum: ['copy', 'move'] })
  })

  it('带 when 的条件规则**不**抬成必填：paths / reportPath / targetPath 都不是 required', () => {
    const node = definition()
    // `define-node.ts:85-90`：只有 `when === undefined` 的 required / nonBlank 才算必填。
    expect(parametersFor(node, 'classify').paths).not.toHaveProperty('required')
    expect(parametersFor(node, 'classify').targetPath).not.toHaveProperty('required')
    expect(parametersFor(node, 'report').reportPath).not.toHaveProperty('required')
    // 阳性对照：去掉那条 `when` 就必须变成必填，否则这条尺是瞎的。
    const flattened = structuredClone(raw())
    flattened.fields.find((entry) => entry.id === 'targetPath')!.rules = [{ rule: { type: 'required' } }]
    const revived = validateNodeDefinition(flattened)
    if (!revived.ok) throw new Error('夹具不合法')
    expect(parametersFor(revived.value, 'classify').targetPath).toMatchObject({ required: true })
  })

  it('G8 两头都钉住：清单声明预演，宿主收到"省略"时是 false，而闸门因此要亮', () => {
    const node = definition()
    // ① 清单声明的默认是预演（表单那一侧会填它）。
    expect(field('dryRun').default).toEqual({ boolean: true })
    // ② 同一条腿，`bindInputs` 对模型省略的布尔的折法：false（不是"没给"）。
    const bound = bindInputs(node, { action: 'classify', paths: ['D:/videos'], targetPath: 'D:/sorted' })
    expect(bound.dryRun).toBe(false)
    expect(bound.recursive).toBe(false)
    // ③ 于是这一步是危险的那一次：内核那句 `dryRun !== false` 在这里帮不上忙，
    //    值已经被人折过了，拦它的是 `danger.all`。
    expect(dangerFor(node, undefined, 'classify', bound)).toBeDefined()
    // ④ 显式给了预演就不危险。
    expect(dangerFor(node, undefined, 'classify', { dryRun: true })).toBeUndefined()
    expect(dangerFor(node, undefined, 'analyze', { dryRun: false })).toBeUndefined()
  })

  it('帮助页由清单推导：bin 是 bitv，`src/help.ts` 不声明 /bitv（本包 inject 里没有 commands）', () => {
    const help = nodeHelpFromManifest(raw(), { bin: 'bitv' })
    expect(help.title).toBe('BitV')
    expect(help.short).toBe('Analyze video bitrate with ffprobe and classify files safely.')
    expect(help.commands[0]!.command).toBe('bitv')
    expect(help.commands[0]!.examples.map((example) => example.command)).toEqual([
      'bitv --help', 'bitv status', 'bitv analyze', 'bitv classify', 'bitv report',
    ])
    // 正控走源码扫描：`src/help.ts` 若把 `command` 传回来，本包就多宣传一条不存在的入口
    //（缺口 G7）。推导器那一侧仍会按 nodeId 兜出 `/bitv` 那一格
    // （`packages/node-sdk/src/help.ts:108` 的 `?? \`/${nodeId}\``），所以
    // **不能**拿"commands 数组少一条"当判据——那一刀在 SDK 侧，不在本包顺手改。
    const helpSource = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    expect(helpSource).not.toContain(`command: '/bitv'`)
    expect(helpSource).toContain(`nodeHelpFromManifest(node, { bin: 'bitv' })`)
    // 阳性对照：本包没注册命令，`src/index.ts` 的 inject 里就不许出现 commands。
    const indexSource = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(indexSource).not.toContain(`inject = ['tools', 'subprocess', 'commands']`)
  })
})

describe('bitv 宿主接线（apply → defineNode → 真内核 + ctx.subprocess）', () => {
  it('四条动作注册成四个工具；非预演的 classify 被拦成 ask；analyze 真的经那条缝跑内核', async () => {
    const registered: RegisteredTool[] = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const root = await mkdtemp(join(tmpdir(), 'xaihi-bitv-host-'))
    tempDirs.push(root)
    await writeFile(join(root, 'clip.mp4'), Buffer.alloc(4_000_000, 7))
    const seam = fakeSeam()
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as RegisteredTool); return () => {} } },
      // cordis 的 ctx.effect：回调立即执行，它返回的函数被收作注销器（正典形状见 packages/node-sdk/tests/define-node.spec.ts:67）。
      effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: (name: string) => (name === 'subprocess' ? seam.seam : undefined),
    }

    apply(ctx as never, fakeConfig())
    expect(registered.map((tool) => tool.name)).toEqual(['bitv_status', 'bitv_analyze', 'bitv_classify', 'bitv_report'])
    expect(listeners).toHaveLength(1)

    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    // 危险闸门：classify + dryRun=false ⇒ ask（这一格尤其重要：内核自己会预演，是折叠把它翻掉的）。
    expect((await listener({ name: 'bitv_classify', arguments: { dryRun: false } }, next)).kind).toBe('ask')
    expect(passed).toBe(0)
    expect((await listener({ name: 'bitv_classify', arguments: { dryRun: true } }, next)).kind).toBe('allow')
    expect((await listener({ name: 'bitv_report', arguments: { dryRun: false } }, next)).kind).toBe('ask')
    expect((await listener({ name: 'bitv_analyze', arguments: { dryRun: false } }, next)).kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    expect((await listener({ name: 'other_node_action', arguments: {} }, next)).kind).toBe('allow')
    expect(passed).toBe(3)

    // status 真的经缝查探针：查找回合被叫到，名字是 ffprobe。
    const status = registered.find((tool) => tool.name === 'bitv_status')
    expect(await runTool(status, {})).toContain('/usr/bin/ffprobe')
    expect(seam.resolveCalls).toEqual(['ffprobe'])

    // analyze 真的跑内核 + 真文件：一句结论 + 上游终端面那四条计数里的 `Videos:`。
    const analyze = registered.find((tool) => tool.name === 'bitv_analyze')
    const output = await runTool(analyze, { paths: [root] })
    expect(output).toContain('Analyzed 1 video(s).')
    expect(output).toContain('Videos: 1')
    expect(seam.spawnCalls).toHaveLength(1)
    expect(seam.spawnCalls[0]!.argv.slice(1, 7)).toEqual(
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'],
    )

    // 阳性对照：宿主面这一趟没被批准就不许动盘——目标目录必须根本没被建出来
    //（面板回读不证明盘上没事，所以读的是目录表）。
    expect(existsSync(join(root, 'sorted'))).toBe(false)
    expect(readdirSync(root).sort()).toEqual(['clip.mp4'])
  })

  it('缝不在 ⇒ apply 当场拒绝装载，并点名 ctx.subprocess', () => {
    const ctx = { tools: { register: () => () => {} }, on: () => () => {}, get: () => undefined }
    expect(() => apply(ctx as never, fakeConfig())).toThrow(/ctx\.subprocess is not provided/)
  })

  it('Config 与模型都没给 transferMode ⇒ 走内核默认的 copy，而不是 move 那条 link+unlink', async () => {
    const registered: RegisteredTool[] = []
    const root = await mkdtemp(join(tmpdir(), 'xaihi-bitv-mode-'))
    tempDirs.push(root)
    const source = join(root, 'clip.mp4')
    const destination = join(root, 'sorted', '5Mbps', 'clip.mp4')
    await writeFile(source, Buffer.alloc(4_000_000, 7))
    const seam = fakeSeam()
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as RegisteredTool); return () => {} } },
      // cordis 的 ctx.effect：回调立即执行，它返回的函数被收作注销器（正典形状见 packages/node-sdk/tests/define-node.spec.ts:67）。
      effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
      on: () => () => {},
      get: (name: string) => (name === 'subprocess' ? seam.seam : undefined),
    }
    // 清单的绑定是 `trim`，"没给"到内核手里就是空串；`transferModeOf` 的白名单把它当"没给"。
    apply(ctx as never, fakeConfig({ transferMode: '' }))

    const classify = registered.find((tool) => tool.name === 'bitv_classify')
    // 非预演那一趟：真转移，断的是盘上还剩什么（视图与文案都不证明动没动源文件）。
    const output = await runTool(classify, { paths: [root], targetPath: join(root, 'sorted'), dryRun: false })
    expect(output).toContain('Classified 1 video(s).')
    expect(output).toContain('Operations: 1')
    expect(existsSync(destination)).toBe(true)
    // 阳性对照（实测跑过，把 `inputFrom` 里那一格换成直接透传 `inputs.transferMode` 时红：
    // `源文件不在了：这一趟走的是 move 那条腿`）：空串会被内核当成一个模式值，
    // `mode === "copy"` 判假 ⇒ 走 move，源文件被 unlink。这条尺读的是盘上，不是文案。
    expect(existsSync(source), '源文件不在了：这一趟走的是 move 那条腿').toBe(true)
  })
})

/** `defineTool` 整理过的工具：本包只读 `name` 与 `execute` 两格。 */
interface RegisteredTool {
  name: string
  execute: (args: unknown) => Promise<string>
}

async function runTool(tool: RegisteredTool | undefined, args: Record<string, unknown>): Promise<string> {
  if (tool === undefined) throw new Error('工具没注册')
  return tool.execute(args)
}

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig(overrides: Partial<Record<keyof BitvConfig, unknown>> = {}): BitvConfig {
  const values: Record<string, unknown> = {
    recursive: true, bitrateStepMbps: 5, maxLevels: 10, transferMode: 'copy', dryRun: true, ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as BitvConfig
}

interface FakeSeam {
  seam: BitvSubprocessSeam
  resolveCalls: string[]
  spawnCalls: BitvSubprocessSpawnSpec[]
}

/** 假缝：探针永远查得到，ffprobe 永远回一份 100 秒的 1080p 流。 */
function fakeSeam(): FakeSeam {
  const fake: FakeSeam = { seam: undefined as unknown as BitvSubprocessSeam, resolveCalls: [], spawnCalls: [] }
  const probe = {
    format: { duration: "100" },
    streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1" }],
  }
  fake.seam = {
    async resolveExecutable(command: string) {
      fake.resolveCalls.push(command)
      return `/usr/bin/${command}`
    },
    spawn(spec: BitvSubprocessSpawnSpec) {
      fake.spawnCalls.push(spec)
      return {
        collected: {
          stdout: { readFrom: () => ({ text: JSON.stringify(probe) }) },
          stderr: { readFrom: () => ({ text: '' }) },
        },
        done: Promise.resolve({ exitCode: 0 }),
      } as unknown as BitvSubprocessHandle
    },
  }
  return fake
}
