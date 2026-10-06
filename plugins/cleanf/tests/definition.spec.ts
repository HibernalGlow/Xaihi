/**
 * cleanf 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/cleanf.json`（definitionVersion 1），
 * 不调用被测函数得到。三处**有意**的词表落差在断言里点名：
 * 1. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`
 *    （`packages/node-sdk/src/node.ts:81-84`）；
 * 2. `danger.predicates[].test.actionField` 被剥掉：`dangerFor` 的 `all` / `any` 那条路把
 *    `actionId` 与 `args` 一起交给求值器，而 `args` 里**没有** `action` 这一格
 *    （`define-node.ts:283-284` 给的是模型参数，`define-node.ts:117` 又不把动作选择器放进参数表；
 *    `conditions.ts:57` 一见 `actionField` 就只读 `args[actionField]`、不再看 `actionId`）。
 *    后果与 `nameu` / `rawfilter` **同一条刀、两个方向**：那两家的谓词是肯定式
 *    （`actionIs ['execute'|'rename']`、`negated:false`），字段取不到 ⇒ 恒假 ⇒ ask 永远不亮；
 *    cleanf 这条是**否定式**（`actionIs ['undo']`、`negated:true`），字段取不到 ⇒ `''` ∉ `['undo']`
 *    ⇒ 恒真 ⇒ "非撤销"这一句对**所有**动作都成立 ⇒ 连 `cleanf_undo` 都要批准。
 *    `fields[].visible` 里那一份**保留**（`parametersFor` 会同时给 args 与 actionId）——
 *    cleanf 这份上游的 visible 里本来就没有 actionField，所以没有可保留的；
 * 3. `help.whenToUse` 上游是**三句**的数组，我们词表里 `NodeHelp.whenToUse` 是一个
 *    `LocalizedText`（`node.ts:156-159`）⇒ 按空格拼成一句，一条都不丢（拼法用 `join(' ')`，
 *    回读时逐句 `includes` 对上游数组；**不许**用 `split(' ')` 数句数——中文句子内部带空格）。
 *    27 份上游定义里有 5 份是多句（bitv/cleanf/findz/linedup/logx，实测），
 *    这条落差是新缺口，报告里记作 **G12**。
 *
 * 上游那两个"看着像 bug"的形状**照抄不改**，各钉一条断言：
 * - `action` 字段的 `visible` 是 `{type:"always", negated:true}` ⇒ 永不可见（`:60-68`）；
 * - `groups` 是空数组（`:192`）⇒ 本包一个分组都没有，不是"我们漏了"；
 * - `pathsText` 那条 `atLeastLines` 规则带着 `when`（`actionIs undo` 取反，`:101-121`）：
 *   只在**非撤销**那条路上要求至少一行路径。
 *
 * 每条尺都配阳性对照：坏清单必须被拒（`validateNodeDefinition` 不是装饰）。
 *
 * @module xaihi-cleanf/tests/definition
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { PreDecision } from '@hibernalglow/xaihi-sdk'
import {
  bindInputs,
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateNodeDefinition,
} from '@hibernalglow/xaihi-sdk'
import { apply, type Config } from '../src/index.ts'

interface NodeShape {
  nodeId: string
  definitionVersion: number
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: {
    id: string
    kind: string
    label: { zh: string; en: string }
    options?: { value: unknown; label: { zh: string; en: string } }[]
    rules?: unknown[]
    visible?: { type: string; predicate?: { test?: { type: string; actionField?: string }; negated?: boolean } }
  }[]
  groups: unknown[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; fieldId?: string; allowed?: unknown[] }; negated: boolean }[] }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: {
    whenToUse: { zh: string; en: string }
    safety: { defaultMode: string; destructive: { zh: string[]; en: string[] }; notes: { zh: string[]; en: string[] } }
  }
}

function ownNode (): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

function upstreamNode (): Record<string, unknown> {
  const path = '/Users/glow/Base/Code/Freya/Xiranite/node-definitions/cleanf.json'
  if (!existsSync(path)) throw new Error('读不到上游定义（真源不在位，这条尺失效，不是"没问题"）')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('cleanf 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    broken.fields.find((field) => field.id === 'pathsText')!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：分组引用不存在的字段 / 未知 transform', () => {
    const badGroup = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badGroup.groups = [{ id: 'main', fieldIds: ['nope'] }]
    const first = validateNodeDefinition(badGroup)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('references unknown field')

    const badBinding = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badBinding.inputBindings.find((binding) => binding.fieldId === 'preview')!.transform = 'asPercent'
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('transform is not in')
  })

  it('阳性对照：动作 id 重复（重复的是真存在的 id，否则"变异"造出的是合法定义）', () => {
    const duplicated = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    const first = duplicated.actions[0]
    if (first === undefined) throw new Error('清单里没有动作')
    duplicated.actions.push({ ...first })
    const check = validateNodeDefinition(duplicated)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('duplicates')
  })
})

describe('cleanf 清单的词表逐字对上游', () => {
  it('两个动作、五条字段、**零**个分组（上游 groups 就是空数组）', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('cleanf')
    expect(node.title).toEqual({ zh: 'Cleanf', en: 'Cleanf' })
    expect(node.description).toEqual({
      zh: '预览并清理空文件夹、备份文件、临时文件夹、垃圾文件和常用清理预设。',
      en: 'Preview and remove empty folders, backup files, temp folders, trash files, and cleanup presets.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['clean', 'undo'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['清理', '撤销上次清理'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Clean', 'Undo last cleanup'])
    expect(node.fields.map((field) => field.id)).toEqual(['action', 'pathsText', 'presetsText', 'exclude', 'preview'])
    expect(node.fields.map((field) => field.kind)).toEqual(['select', 'path-list', 'multiline', 'text', 'boolean'])
    expect(node.groups).toEqual([])
    expect((upstreamNode().groups as unknown[]).length).toBe(0)
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一）', () => {
    const action = ownNode().fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual(['clean', 'undo'])
    const upstreamAction = (upstreamNode().fields as { id: string; options?: { value: unknown }[] }[])
      .find((field) => field.id === 'action')
    if (upstreamAction?.options?.[0] === undefined) throw new Error('上游 cleanf.json 的 action 字段形状漂了')
    expect(typeof upstreamAction.options[0]!.value).toBe('object')
  })

  it('字段默认值逐条对上游；preview 那条是清单侧默认 true（内核侧 false 钉在 core.spec）', () => {
    const raw = JSON.parse(JSON.stringify(ownNode())) as { fields: { id: string; default?: unknown }[] }
    const defaults = new Map(raw.fields.map((field) => [field.id, field.default]))
    expect(defaults.get('action')).toEqual({ text: 'clean' })
    expect(defaults.get('pathsText')).toEqual({ text: '' })
    expect(defaults.get('presetsText')).toEqual({
      text: 'empty_folders\nbackup_files\ntemp_folders\ntrash_files\nhb_txt_files',
    })
    expect(defaults.get('exclude')).toEqual({ text: '' })
    expect(defaults.get('preview')).toEqual({ boolean: true })
  })

  it('上游那两个"看着像 bug"的形状照抄：action 永不可见 + pathsText 的条件规则', () => {
    const node = ownNode()
    expect(node.fields.find((field) => field.id === 'action')?.visible).toEqual({
      type: 'single',
      predicate: { test: { type: 'always' }, negated: true },
    })
    expect(node.fields.find((field) => field.id === 'pathsText')?.rules).toEqual([{
      rule: { type: 'atLeastLines', minimum: 1 },
      when: {
        type: 'single',
        predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['undo'] }, negated: true },
      },
    }])
  })

  it('绑定逐条对上游，一条不改（delimited 那两格由接线层再拆一次，见 src/index.ts）', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['pathsText', 'paths', 'delimited'],
      ['presetsText', 'presets', 'delimited'],
      ['exclude', 'exclude', 'trimOrOmit'],
      ['preview', 'preview', 'asBoolean'],
    ])
  })

  it('危险闸门：非撤销 + 非预览；谓词里不许留 actionField（留了连撤销都要批准）', () => {
    expect(ownNode().danger).toEqual({
      type: 'all',
      predicates: [
        { test: { type: 'actionIs', allowed: ['undo'] }, negated: true },
        { test: { type: 'fieldTrue', fieldId: 'preview' }, negated: true },
      ],
    })
    // 正控：上游那份带 actionField 的形状在 dangerFor 里**过拦**——`conditions.ts:57` 见 actionField
    // 就只读 `args['action']`，而工具参数表里没有这一格（`define-node.ts:117`），取到的是 `''`；
    // `''` ∉ `['undo']` ⇒ 那条 negated 谓词恒真 ⇒ `undo` 这个安全动作也被判危险。
    // 实测（不是推演）：`dangerFor(上游那份, 'undo', { preview: false })` 返回的是那句 reason。
    const upstream = upstreamNode()
    const upstreamDanger = (upstream.danger as NodeShape['danger'])
    expect(upstreamDanger.predicates?.[0]?.test.actionField).toBe('action')
    const def = validateNodeDefinition(upstream)
    if (!def.ok) throw new Error('上游那份连我们的校验器都过不了：尺该红在这里')
    expect(dangerFor(def.value, undefined, 'undo', { preview: false }), '留着 actionField 的那份不许把撤销放过去').toBeDefined()
    // 我们剥掉 actionField 的那份才是上游这句 `非撤销` 的意思：撤销不危险、真清理危险。
    const own = validateNodeDefinition(ownNode())
    if (!own.ok) throw new Error('清单不合法')
    expect(dangerFor(own.value, undefined, 'undo', { preview: false })).toBeUndefined()
    expect(dangerFor(own.value, undefined, 'clean', { preview: false })).toBeDefined()
    // 反向正控：把那一格塞回我们自己的清单，撤销那条立刻变成过拦（这条尺不是装饰）。
    const readded = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    readded.danger.predicates![0]!.test.actionField = 'action'
    const reDef = validateNodeDefinition(readded)
    if (!reDef.ok) throw new Error('塞回 actionField 后清单不合法：校验器与求值器的判据不一致')
    expect(dangerFor(reDef.value, undefined, 'undo', { preview: false })).toBeDefined()
  })

  it('help 只剩我们词表能装的那两块；whenToUse 三句拼成一句（G12）', () => {
    const node = ownNode()
    expect(node.help.whenToUse.zh).toBe(
      '图片、归档或视频批处理后，需要清理生成目录里的临时残留。'
      + ' 需要删除 .bak、.trash、temp_ 文件夹、[#hb] 文本、日志或 upscale 缓存等已知垃圾项。'
      + ' 同一套清理预设既要在工作区 UI 里用，也要能放进终端自动化。',
    )
    expect(node.help.whenToUse.en).toBe(
      'Clean generated folders after image, archive, or video processing batches.'
      + ' Remove known temporary files such as .bak, .trash, temp_ folders, [#hb] text files, or log/upscale leftovers.'
      + ' Run the same cleanup preset from the workspace UI and from terminal automation.',
    )
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      destructive: {
        zh: [
          'preview=false 的 run 会将文件和文件夹移入系统回收站，并记录可撤销批次。',
          'complete 和 upscale 预设组合包含更宽的清理规则。',
        ],
        en: [
          'run with preview=false moves files and folders to the system recycle bin and records an undo batch.',
          'Preset combinations complete and upscale include broader cleanup rules.',
        ],
      },
      notes: {
        zh: ['新目录树第一次使用时务必先预览。', '对归档根目录、源文件夹或项目目录使用排除关键词保护。'],
        en: [
          'Always run preview before live cleanup on a new folder tree.',
          'Use exclude keywords for archive roots, source folders, or project folders that should be preserved.',
        ],
      },
    })
    // 三句一条都没丢：判据直接取自上游那份**数组**（`<Xiranite>/node-definitions/cleanf.json`
    // `help.whenToUse.{zh,en}` 各三句），逐句 contains + 整串等于 `sentences.join(' ')`。
    // 原来这条写的是 `node.help.whenToUse.zh.split(' ').length === 3`，量的从来不是句数：
    // 上游句子**内部就带空格**（zh 第 2 句 `…temp_ 文件夹、[#hb] 文本、日志或 upscale 缓存…`、
    // 第 3 句 `…在工作区 UI 里用…`），实测 zh 切出 10 段、en 切出 39 段 ⇒ 判据换成上面那把尺，
    // 期望值仍来自上游，不由被测函数现算。
    const upstreamWhenToUse = (upstreamNode().help as { whenToUse: { zh: string[]; en: string[] } }).whenToUse
    expect(upstreamWhenToUse.zh).toHaveLength(3)
    const joinedIsUpstreamSentences = (joined: string, sentences: readonly string[]): boolean =>
      sentences.every((sentence) => joined.includes(sentence)) && joined === sentences.join(' ')
    expect(joinedIsUpstreamSentences(node.help.whenToUse.zh, upstreamWhenToUse.zh)).toBe(true)
    expect(joinedIsUpstreamSentences(node.help.whenToUse.en, upstreamWhenToUse.en)).toBe(true)
    // 阳性对照：抽掉首句或尾句，这把尺必须红（不是"字符串非空就算过"）。
    expect(joinedIsUpstreamSentences(upstreamWhenToUse.zh.slice(0, 2).join(' '), upstreamWhenToUse.zh)).toBe(false)
    expect(joinedIsUpstreamSentences(upstreamWhenToUse.zh.slice(1).join(' '), upstreamWhenToUse.zh)).toBe(false)
    // 上游那两块我们词表装不下（workflows 是对象数组、commands 是命令清单），因此整块不抄。
    expect((upstreamNode().help as Record<string, unknown>).workflows).toBeInstanceOf(Array)
    expect((node.help as Record<string, unknown>).workflows).toBeUndefined()
    expect((node.help as Record<string, unknown>).commands).toBeUndefined()
  })
})

describe('cleanf 清单的 SDK 侧形状', () => {
  it('参数表：两个动作都不带 action 选择器；pathsText 是数组且必填（那条规则没有 when 的必填效果）', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const def = validated.value
    const shared = ['pathsText', 'presetsText', 'exclude', 'preview']
    expect(Object.keys(parametersFor(def, 'clean') ?? {})).toEqual(shared)
    expect(Object.keys(parametersFor(def, 'undo') ?? {})).toEqual(shared)
    expect(parametersFor(def, 'clean')?.pathsText).toMatchObject({ type: 'array' })
    // 那条 atLeastLines 规则带 `when` ⇒ 不许把参数永久标成 required（define-node.ts:83-86）。
    // 判据用键集合（上面两条就是同一个写法），不靠把 `ParameterPropertySpec` 硬转成
    // `Record<string, unknown>`——那个 cast 在 strict 下本身就过不了（interface 没有索引签名）。
    expect(Object.keys(parametersFor(def, 'clean')?.pathsText ?? {})).not.toContain('required')
  })

  it('dangerFor：预览与撤销都不危险，真清理要批准', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const def = validated.value
    expect(dangerFor(def, undefined, 'clean', { preview: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'undo', { preview: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'clean', { preview: false })?.zh).toContain('cleanf')
    // 阳性对照：模型**省略** preview 时这条 ask 必须亮（否则危险动作默认放行）。
    expect(dangerFor(def, undefined, 'clean', {})).toBeDefined()
  })

  it('bindInputs 把省略的布尔折成 false（缺口 G8），delimited 把换行串粘成一条（接线层再拆）', () => {
    const validated = validateNodeDefinition(ownNode())
    if (!validated.ok) throw new Error('清单不合法')
    const bound = bindInputs(validated.value, {
      pathsText: 'root/a\nroot/b',
      presetsText: 'empty_folders,backup_files',
      exclude: '  .git  ',
    })
    expect(bound.preview).toBe(false)
    expect(bound.exclude).toBe('.git')
    expect(bound.presets).toEqual(['empty_folders', 'backup_files'])
    // 上游声明的 delimited 只切逗号：换行串会被粘成**一条**路径。
    // 这一格由接线层的 `listValue`（`src/index.ts`）用内核自己的 `parseCleanfPaths` 再拆一次，
    // 清单的绑定形状因此保持逐字不动。
    expect(bound.paths).toEqual(['root/a\nroot/b'])
  })

  it('帮助页只印 bin，不印宿主斜杠命令（缺口 G7 的这一侧）', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xcleanf' })
    expect(help.title).toBe('Cleanf')
    expect(help.commands[0]!.command).toBe('xcleanf')
    expect(help.commands[0]!.examples.map((example) => example.command))
      .toEqual(['xcleanf --help', 'xcleanf clean', 'xcleanf undo'])
    // 现实披露：本包没传 `command`，推导器仍然按 `/cleanf` 兜底（node-sdk/src/help.ts:108）。
    expect(help.commands[1]!.command).toBe('/cleanf')
  })
})

describe('cleanf 宿主接线（apply → defineNode → 真内核 + 真文件系统）', () => {
  it('两个动作注册成两个工具，非预览被拦成 ask；预览真的出计划，真清理被 ENOTSUP 拒', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: () => undefined,
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual(['cleanf_clean', 'cleanf_undo'])
    expect(listeners).toHaveLength(1)

    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'cleanf_clean', arguments: { preview: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'cleanf_clean', arguments: { preview: true } }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // 夹具落在真文件系统上：一个 .bak、一个空目录、一个要留下的文件。
    const root = await mkdtemp(join(tmpdir(), 'xaihi-cleanf-host-'))
    tempDirs.push(root)
    await mkdir(join(root, 'empty_dir'))
    await writeFile(join(root, 'a.bak'), 'x', 'utf8')
    await writeFile(join(root, 'keep.txt'), 'x', 'utf8')

    const execute = toolExecute(registered, 'cleanf_clean')
    const plan = await execute({ pathsText: [root], presetsText: 'empty_folders,backup_files', preview: true }, {})
    expect(plan).toContain('Preview completed, found 2 item(s).')
    expect(plan).toContain(join(root, 'a.bak'))
    expect(plan).toContain('• Backup files: 1 个')
    expect(existsSync(join(root, 'a.bak'))).toBe(true)

    // 真清理：落到基线 platform.ts 那一刀，抛出去的是上游原话。
    await expect(execute({ pathsText: [root], presetsText: 'backup_files', preview: false }, {}))
      .rejects.toThrow('Recycle-bin restore is unavailable')
    // 阳性对照：被拒之后文件仍然在位（没有"半删"，也没有静默成功）。
    expect(existsSync(join(root, 'a.bak'))).toBe(true)

    // 撤销：内核自己那句拒绝。
    const undo = toolExecute(registered, 'cleanf_undo')
    await expect(undo({ preview: true }, {})).rejects.toThrow('Cleanf undo is unavailable in this runtime.')
  })
})

/** 从注册下来的一堆工具里取某个动作的 `execute`（工具面跑的就是这条）。 */
function toolExecute (
  registered: Array<Record<string, unknown>>,
  name: string,
): (args: unknown, exec: unknown) => Promise<string> {
  const tool = registered.find((item) => item['name'] === name)
  if (tool === undefined) throw new Error(`没有注册工具 ${name}（apply 那一半没跑起来）`)
  return tool['execute'] as (args: unknown, exec: unknown) => Promise<string>
}

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig (overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values = { presets: '', exclude: '', preview: true, ...overrides }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
