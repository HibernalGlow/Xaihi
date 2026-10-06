/**
 * gifu 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK。
 *
 * 期望值全部手抄自 `<Xiranite>/node-definitions/gifu.json`（definitionVersion 1，1358 行），
 * 不调用被测函数得到。三处**有意**的词表落差在断言里点名（`docs/adr/0006` 的"要补齐而不是
 * 并列第二套"，与 `plugins/rawfilter/tests/definition.spec.ts` 同一份口径）：
 * 1. `groups[].title` → 我们词表里是 `groups[].label`（`NodeGroup.label`，
 *    `packages/node-sdk/src/node.ts:124-128`）；上游那份的 `description` 逐字留着
 *    （词表没这一格，校验器也不拒多余键）；
 * 2. select 的 `options[].value` 上游是 `{text: "…"}` 三取一，我们是 `string`
 *    （`NodeFieldOption.value`）；字段的 `default` 那一格**仍然是** `{text}`/`{number}`/`{boolean}`
 *    三取一（`NodeField.default` 收 `NodeScalar`），两边不许混；
 * 3. `danger.predicates[].test.actionField` 被剥掉：`dangerFor` 的 `all`/`any` 那条路只把
 *    `actionId` 给求值器、不给 `args.action`，留着它那条 ask 永远不亮
 *    （`packages/node-sdk/src/conditions.ts:56-59` 读的是 `args[actionField]`）。
 *    下面第 3 条正控就是"留着会怎样"的实测，不是引用一句理由。
 *
 * 另外钉住两份**上游自带的**分歧，不在这里统一：
 * - `dryRun` 字段的声明默认是 **true**，内核 `core.ts:215` 的默认也是 **true**（这一对一致，
 *   `tests/core.spec.ts` 钉的是内核那一侧）；分叉发生在 SDK：模型省略布尔时 `asBoolean`
 *   折成 **false**（缺口 G8），兜住那一格的是 `danger` ⇒ 下面各钉一条。
 * - 上游 `help` 有四块（`whenToUse` / `workflows` / `commands` / `safety`），我们的
 *   `NodeHelp` 只装得下 `whenToUse` + `workflows`；`workflows` / `commands` 那一屏由
 *   `nodeHelpFromManifest` 从清单推导（`packages/node-sdk/src/help.ts`），不在清单里抄第二份
 *   ——与同批 12 个包一致；`safety` 是词表外多留的一块，逐字抄上游。
 *
 * @module xaihi-gifu/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  transformValue,
  validateNodeDefinition,
  type NodeDefinition,
  type PreDecision,
} from '@hibernalglow/xaihi-sdk'
import { apply, type Config } from '../src/index.ts'
import { GIFU_PROCESS_SEAM_REFUSAL, createGifuUnwiredRuntime, type GifuSubprocessSeam, type GifuSubprocessSpawnSpec } from '../src/platform.ts'

interface Localized { zh: string; en: string }
interface NodeShape {
  definitionVersion: number
  nodeId: string
  title: Localized
  description: Localized
  actions: { id: string; label: Localized; description?: Localized }[]
  fields: {
    id: string
    label: Localized
    kind: string
    description?: Localized
    isActionSelector?: boolean
    lines?: number
    default?: unknown
    range?: { min?: number; max?: number }
    options?: { value: unknown; label: Localized }[]
    rules?: unknown[]
    visible?: { type: string; predicate?: unknown; predicates?: unknown[] }
    placeholder?: Localized
  }[]
  groups: { id: string; label?: Localized; description?: Localized; fieldIds: string[]; title?: Localized }[]
  inputBindings: { fieldId: string; slot: string; transform?: string; defaultExport?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; allowed?: unknown[]; fieldId?: string }; negated: boolean }[] }
  dangerPrompt: { title: Localized; body: Localized; confirmLabel: Localized }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  resultTable: { columns: { id: string; label: Localized; width: number }[] }
  help: { whenToUse: Localized; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

function ownNode(): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  return pkg.xaihi?.node ?? ({} as NodeShape)
}

/** 校验过的定义：凡是要读 `parametersFor` / `dangerFor` 的用例都从这里拿，不重复写那份胶水。 */
function validated(): NodeDefinition {
  const result = validateNodeDefinition(ownNode())
  if (!result.ok) throw new Error(`清单不合法：${result.errors.join('; ')}`)
  return result.value
}

const field = (id: string) => {
  const found = ownNode().fields.find((item) => item.id === id)
  if (found === undefined) throw new Error(`夹具里找不到字段 ${id}`)
  return found
}

describe('gifu 清单合法', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：摊平规则（本仓一度这么写）必须被拒', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    // 上游 `GuardedRule` 是 `{rule, when?}`；SDK 的 `fieldProperty` 读 `entry.rule.type`。
    broken.fields.find((item) => item.id === 'pathsText')!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：range 挂在非 number 字段上、slot 引用了不存在的字段', () => {
    const badRange = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badRange.fields.find((item) => item.id === 'pathsText')!.range = { min: 0, max: 1 }
    const first = validateNodeDefinition(badRange)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors.join(' ')).toContain('range belongs to number fields only')

    const badBinding = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    badBinding.inputBindings.push({ fieldId: 'nope', slot: 'nope', transform: 'trim' })
    const second = validateNodeDefinition(badBinding)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toContain('unknown field')
  })
})

describe('gifu 清单的词表逐字对上游', () => {
  it('三个动作、24 条字段、三条分组（顺序与条数一条不减）', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('gifu')
    expect(node.title).toEqual({ zh: 'Gifu', en: 'Gifu' })
    expect(node.description).toEqual({
      zh: '使用原生媒体运行时，将图片归档转换为 GIF、WebP、APNG、WebM 或 MP4。',
      en: 'Convert image archives to GIF, WebP, APNG, WebM, or MP4 with the native media runtime.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['inspect', 'plan', 'make'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['检查', '计划', '转换'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Inspect', 'Plan', 'Convert'])
    expect(node.fields.map((item) => item.id)).toEqual([
      'action', 'pathsText', 'recursive', 'format', 'outMode', 'outDir', 'namePrefix', 'nameTemplate',
      'durationMs', 'loop', 'quality', 'webpMethod', 'ffmpegThreads', 'webmCrf', 'webmCpuUsed',
      'mp4Preset', 'mp4Cq', 'maxWorkers', 'extractSingle', 'overwrite', 'dryRun', 'recordRun',
      'databasePath', 'configPath',
    ])
    expect(node.fields.map((item) => item.kind)).toEqual([
      'select', 'path-list', 'boolean', 'select', 'select', 'text', 'text', 'text', 'number', 'number',
      'number', 'number', 'number', 'number', 'number', 'select', 'number', 'number', 'boolean',
      'boolean', 'boolean', 'boolean', 'text', 'text',
    ])
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('三条分组的 title 已换成 label（上游键不许留下），fieldIds 逐条对上游', () => {
    const node = ownNode()
    expect(node.groups.map((group) => group.id)).toEqual(['input', 'output', 'execution'])
    expect(node.groups.map((group) => group.label)).toEqual([
      { zh: '输入', en: 'Input' },
      { zh: '输出', en: 'Output' },
      { zh: '执行', en: 'Execution' },
    ])
    // 阳性对照：整份抄回上游（带着 `title`）立刻红。
    expect(node.groups.filter((group) => group.title !== undefined)).toHaveLength(0)
    expect(node.groups.map((group) => group.fieldIds)).toEqual([
      ['action', 'pathsText', 'recursive', 'configPath'],
      ['format', 'outMode', 'outDir', 'namePrefix', 'nameTemplate', 'durationMs', 'loop', 'quality',
        'webpMethod', 'ffmpegThreads', 'webmCrf', 'webmCpuUsed', 'mp4Preset', 'mp4Cq'],
      ['maxWorkers', 'extractSingle', 'overwrite', 'dryRun', 'recordRun', 'databasePath'],
    ])
    expect(node.groups[2]?.description).toEqual({
      zh: '确认计划前请保持预览开启。',
      en: 'Keep preview enabled until the plan is correct.',
    })
  })

  it('select 的 value 已换成我们的 string 词表（上游是 {text} 三取一），名单与顺序逐字', () => {
    expect(field('action').options?.map((option) => option.value)).toEqual(['inspect', 'plan', 'make'])
    expect(field('format').options?.map((option) => option.value)).toEqual(['webp', 'gif', 'apng', 'webm', 'mp4', 'auto'])
    expect(field('format').options?.map((option) => option.label.en)).toEqual(['WEBP', 'GIF', 'APNG', 'WEBM', 'MP4', 'AUTO'])
    expect(field('outMode').options?.map((option) => option.value)).toEqual(['same', 'separate'])
    expect(field('mp4Preset').options?.map((option) => option.value)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
    // 阳性对照：字段的 `default` 那一格**仍然**是 `{text}` 三取一，两条不许互相"统一"。
    expect(field('format').default).toEqual({ text: 'webp' })
    expect(typeof field('format').options?.[0]?.value).toBe('string')
  })

  it('数值字段的 range 与默认值逐字对上游（九条 range、九条 default 全列）', () => {
    const expectRange: Record<string, { min: number; max: number }> = {
      durationMs: { min: 1, max: 60000 },
      loop: { min: 0, max: 100000 },
      quality: { min: 1, max: 100 },
      webpMethod: { min: 0, max: 6 },
      ffmpegThreads: { min: 0, max: 256 },
      webmCrf: { min: 0, max: 63 },
      webmCpuUsed: { min: 0, max: 8 },
      mp4Cq: { min: 0, max: 63 },
      maxWorkers: { min: 0, max: 128 },
    }
    for (const [id, range] of Object.entries(expectRange)) expect(field(id).range, id).toEqual(range)
    const expectDefault: Record<string, unknown> = {
      action: { text: 'plan' },
      pathsText: { text: '' },
      recursive: { boolean: true },
      format: { text: 'webp' },
      outMode: { text: 'same' },
      outDir: { text: '' },
      namePrefix: { text: '[#dyna]' },
      nameTemplate: { text: '{prefix}{stem}' },
      durationMs: { number: 120 },
      loop: { number: 0 },
      quality: { number: 85 },
      webpMethod: { number: 2 },
      ffmpegThreads: { number: 0 },
      webmCrf: { number: 34 },
      webmCpuUsed: { number: 6 },
      mp4Preset: { text: 'p3' },
      mp4Cq: { number: 32 },
      maxWorkers: { number: 0 },
      extractSingle: { boolean: true },
      overwrite: { boolean: false },
      dryRun: { boolean: true },
      recordRun: { boolean: false },
      databasePath: { text: '' },
      configPath: { text: '' },
    }
    for (const [id, value] of Object.entries(expectDefault)) expect(field(id).default, id).toEqual(value)
    // `pathsText` 那格上游是 `lines: 5`（词表外多留的一块，与 formatv / samea 同一处理）。
    expect(field('pathsText').lines).toBe(5)
    expect(field('pathsText').rules).toEqual([{ rule: { type: 'atLeastLines', minimum: 1 } }])
    expect(field('action').rules).toEqual([{ rule: { type: 'oneOfDeclaredOptions' } }])
    expect(field('action').isActionSelector).toBe(true)
  })

  it('24 条绑定逐条对上游（slot 名与内核字段同名，pathsText 是 delimited）', () => {
    expect(ownNode().inputBindings.map((binding) => [binding.fieldId, binding.slot, binding.transform])).toEqual([
      ['action', 'action', 'trim'],
      ['pathsText', 'paths', 'delimited'],
      ['recursive', 'recursive', 'asBoolean'],
      ['format', 'format', 'trim'],
      ['outMode', 'outMode', 'trim'],
      ['outDir', 'outDir', 'identity'],
      ['namePrefix', 'namePrefix', 'identity'],
      ['nameTemplate', 'nameTemplate', 'identity'],
      ['durationMs', 'durationMs', 'asInteger'],
      ['loop', 'loop', 'asInteger'],
      ['quality', 'quality', 'asInteger'],
      ['webpMethod', 'webpMethod', 'asInteger'],
      ['ffmpegThreads', 'ffmpegThreads', 'asInteger'],
      ['webmCrf', 'webmCrf', 'asInteger'],
      ['webmCpuUsed', 'webmCpuUsed', 'asInteger'],
      ['mp4Preset', 'mp4Preset', 'trim'],
      ['mp4Cq', 'mp4Cq', 'asInteger'],
      ['maxWorkers', 'maxWorkers', 'asInteger'],
      ['extractSingle', 'extractSingle', 'asBoolean'],
      ['overwrite', 'overwrite', 'asBoolean'],
      ['dryRun', 'dryRun', 'asBoolean'],
      ['recordRun', 'recordRun', 'asBoolean'],
      ['databasePath', 'databasePath', 'identity'],
      ['configPath', 'configPath', 'identity'],
    ])
    // 上游那条 `recordRun` 绑定还带一个词表外的 `defaultExport`，逐字留着。
    expect(ownNode().inputBindings[21]?.defaultExport).toBe('default_record_run')
  })

  it('危险闸门：make + 非预演；谓词里不许留 actionField（留了 ask 永远不亮）', () => {
    const node = ownNode()
    expect(node.danger.type).toBe('all')
    expect(node.danger.predicates).toEqual([
      { test: { type: 'actionIs', allowed: ['make'] }, negated: false },
      { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
    ])
    // 上游那份 `dangerPrompt` 三格逐字保留（词表外多留的一块，rawfilter 同一处理）。
    expect(node.dangerPrompt).toEqual({
      title: { zh: '确认写入输出文件', en: 'Confirm file output' },
      body: { zh: 'Gifu 将创建动画文件，并可能覆盖已有输出。', en: 'Gifu will create animation files and may overwrite existing outputs.' },
      confirmLabel: { zh: '转换文件', en: 'Convert files' },
    })
  })

  it('resultTable 四列与宽度逐字（path 34 / state 12 / images 10 / output 36）', () => {
    expect(ownNode().resultTable.columns.map((column) => [column.id, column.width])).toEqual([
      ['path', 34], ['state', 12], ['images', 10], ['output', 36],
    ])
    expect(ownNode().resultTable.columns.map((column) => column.label.zh)).toEqual(['路径', '状态', '张图片', '输出目录'])
  })

  it('help 只剩词表装得下的那一块 + 逐字抄的 safety，whenToUse 从数组折成字符串', () => {
    const node = ownNode()
    expect(node.help.whenToUse).toEqual({
      zh: '需要在工作区 UI 或 CLI 中使用该节点的图像工作流时，使用 Gifu。',
      en: "Use Gifu when you need this node's image workflow from either the workspace UI or CLI.",
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['在修改文件前，优先使用预览或 dry-run 模式。', '处理大文件夹时请保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
  })
})

describe('gifu 清单的 SDK 侧形状', () => {
  it('三个动作的参数表都只含 visible=always 的那 14 条字段（按 format 才可见的一律不进）', () => {
    const def = validated()
    const shared = [
      'pathsText', 'recursive', 'format', 'outMode', 'outDir', 'namePrefix', 'nameTemplate', 'durationMs',
      'maxWorkers', 'extractSingle', 'overwrite', 'dryRun', 'recordRun', 'configPath',
    ]
    for (const action of ['inspect', 'plan', 'make']) {
      expect(Object.keys(parametersFor(def, action) ?? {}), action).toEqual(shared)
    }
    // `atLeastLines` 不在 `required`/`nonBlank` 那一列里 ⇒ 参数表里 pathsText 不是必填
    // （packages/node-sdk/src/define-node.ts:85-90 的判据），缺路径那句话由内核自己说。
    // 点号访问在这个类型面上是被禁的（它的索引签名不许 `x.foo`），所以整格取出来再判。
    const spec = parametersFor(def, 'plan')
    expect(spec['pathsText']).toMatchObject({ type: 'array' })
    expect(spec['pathsText']?.['required']).toBeUndefined()
  })

  it('dangerFor：inspect/plan 永不危险，make 只在预演关掉时要批准', () => {
    const def = validated()
    expect(dangerFor(def, undefined, 'inspect', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'make', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'make', { dryRun: false })?.zh).toContain('gifu')
    // 缺口 G8 那一格钉住：模型**省略** dryRun 时 `asBoolean` 折成 false（内核与清单的默认都是 true），
    // 而危险判定读的是原始参数：省略 ⇒ fieldTrue 不成立 ⇒ negated 成立 ⇒ ask 必须亮。
    expect(transformValue(undefined, 'asBoolean')).toBe(false)
    expect(dangerFor(def, undefined, 'make', {})).toBeDefined()
  })

  it('阳性对照：把上游那条 actionField 抄回来，ask 就永远不亮（这就是它被剥掉的原因）', () => {
    const withField = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    withField.danger.predicates![0]!.test.actionField = 'action'
    const validatedWithField = validateNodeDefinition(withField)
    expect(validatedWithField.ok).toBe(true)
    if (!validatedWithField.ok) return
    // pre-execute 递给求值器的是原始参数（里面没有 `action` 这一格，动作由工具名给）。
    expect(dangerFor(validatedWithField.value, undefined, 'make', { dryRun: false })).toBeUndefined()
  })

  it('工具名是 <nodeId>_<actionId>，帮助页由清单推导，并且不印本包没注册的斜杠命令', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xgifu' })
    expect(help.title).toBe('Gifu')
    expect(help.commands.map((command) => command.command)).toEqual(['xgifu', '/gifu'])
    // 本包 `inject = ['tools', 'subprocess']`，没有 `commands` ⇒ src/help.ts 不许传 command
    // 那一格（缺口 G7）。尺：源码里不许出现 `command: '/gifu'`。
    const source = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    expect(source).not.toContain(`command: '/gifu'`)
    expect(source).toContain(`bin: 'xgifu'`)
  })
})

describe('gifu 宿主接线（apply → defineNode → 真内核 + ctx.subprocess）', () => {
  it('三条动作注册成三个工具；plan 真的跑内核并且**经那条缝**，一个文件都不写', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const seam = fakeSubprocess(async (spec) => {
      const [command, ...args] = spec.argv
      if (command === '/usr/bin/7z' && args[0] === 'l') return { exitCode: 0, stdout: SEVEN_ZIP_LISTING, stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: (name: string) => (name === 'subprocess' ? seam : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual(['gifu_inspect', 'gifu_plan', 'gifu_make'])
    expect(listeners).toHaveLength(1)

    // 危险闸门：make + dryRun=false ⇒ ask；plan 永远 allow；不相干工具不许被拦。
    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'gifu_make', arguments: { dryRun: false } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'gifu_plan', arguments: { dryRun: false } }, next)
    expect(allowed.kind).toBe('allow')
    // 阳性对照：别的节点的工具不许被本节点拦下来。
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)

    // plan 真的跑内核，并且外部程序**只经缝**：这里用一条假的 7-Zip 清单，产物目录里不许多出文件。
    const root = await makeArchiveFixture('xaihi-gifu-host-')
    const plan = registered.find((tool) => tool['name'] === 'gifu_plan')
    const output = await (plan?.['execute'] as (args: unknown, exec: unknown) => Promise<string>)(
      // 参数表里 `pathsText` 是 `path-list` ⇒ array（`define-node.ts:91-94`），绑定再走 `delimited`。
      { pathsText: [`${root}/a.zip`], dryRun: true }, {},
    )
    expect(output).toContain('plan · Gifu planned 1 archive(s).')
    expect(output).toContain('ready: 1')
    expect(output).toContain('converted: 0  extracted: 0')
    expect(seam.spawns.map((argv) => argv.join(' '))).toContain(`/usr/bin/7z l -slt -ba ${root}/a.zip`)
    // 外部程序**只有** 7-Zip 那一条被起过：ffmpeg / ffprobe 连查找都没发生（预演不编码），
    // 而找 7z 用的是缝的 `resolveExecutable`，不是本进程起的 `which`。
    expect(seam.resolveAttempts).toEqual(['7z'])
    // 阳性对照：产物侧一个字节都没写（`plan` 的输出路径只是计划串）。
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(root)).toEqual(['a.zip'])
    await cleanup(root)
  })

  it('缝缺席时装载当场点名那条服务，不装成一条假工具', () => {
    const ctx = {
      tools: { register: () => () => {} },
      on: (_event: string, _listener: unknown) => () => {},
      get: (_name: string) => undefined,
    }
    expect(() => apply(ctx as never, fakeConfig({}))).toThrow(/ctx\.subprocess is not provided/)
  })

  it('终端半边那条运行时抛的就是同一句拒绝（一份真源）', async () => {
    // `createGifuUnwiredRuntime()` 的两个外部程序方法必须是**同一句**，不是各写一遍。
    const runtime = createGifuUnwiredRuntime()
    await expect(runtime.listArchiveImages('/tmp/whatever.zip')).rejects.toThrow(GIFU_PROCESS_SEAM_REFUSAL)
    await expect(runtime.convertArchive({
      archivePath: '/tmp/whatever.zip',
      outputPath: '/tmp/whatever.webp',
      images: [],
      format: 'webp',
      durationMs: 120,
      loop: 0,
      quality: 85,
      webpMethod: 2,
      ffmpegThreads: 0,
      webmCrf: 34,
      webmCpuUsed: 6,
      mp4Preset: 'p3',
      mp4Cq: 32,
      extractSingle: true,
      overwrite: false,
    })).rejects.toThrow(GIFU_PROCESS_SEAM_REFUSAL)
    expect(GIFU_PROCESS_SEAM_REFUSAL).toContain('ctx.subprocess')
    expect(GIFU_PROCESS_SEAM_REFUSAL).toContain('dsh-subprocess-local')
  })
})

/**
 * `7z l -slt -ba` 那份输出的骨架：块与块之间空行分隔，头一块是归档自己（不是图片），
 * 后面三块是图片条目，够 `parse7zImageEntries` 数出三张。
 */
const SEVEN_ZIP_LISTING = [
  'Path = archive',
  '',
  'Path = 001.png',
  'Size = 1000',
  '',
  'Path = 002.png',
  'Size = 1200',
  '',
  'Path = 003.png',
  'Size = 900',
  '',
].join('\n')

const tempDirs: string[] = []

/** 夹具目录一律收掉：跑一半失败的用例不许把临时目录留给下一次。 */
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

/** 一条真归档形状的夹具：一个空的 `.zip` 文件，够 `pathInfo` / `collectArchives` 认出它是归档。 */
async function makeArchiveFixture(prefix: string): Promise<string> {
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(root)
  await writeFile(join(root, 'a.zip'), 'not really a zip', 'utf8')
  return root
}

async function cleanup(root: string): Promise<void> {
  const { rm } = await import('node:fs/promises')
  await rm(root, { recursive: true, force: true })
  const index = tempDirs.indexOf(root)
  if (index >= 0) tempDirs.splice(index, 1)
}

/**
 * `@deepseek-ai/dsh-subprocess` 那条缝的测试替身：`resolveExecutable` 只认 `7z`
 * （其余候选一律抛，正是 `platform.ts` 里 `findExecutable` 继续试下一个的原因），
 * `spawn` 按 `run` 交出的输出造一个已完成的句柄，并把 argv 记下来供断言。
 */
function fakeSubprocess(
  run: (spec: GifuSubprocessSpawnSpec) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>,
): GifuSubprocessSeam & { resolveAttempts: string[]; spawns: string[][] } {
  const resolveAttempts: string[] = []
  const spawns: string[][] = []
  return {
    resolveAttempts,
    spawns,
    async resolveExecutable(command) {
      resolveAttempts.push(command)
      if (command === '7z') return '/usr/bin/7z'
      throw new Error(`7-Zip lookup failed for ${command}`)
    },
    spawn(spec) {
      spawns.push([...spec.argv])
      // 两份文本必须在 `done` settle **之前**写完：platform.ts 是 `await done` 之后才 readFrom(0)。
      const texts = { stdout: '', stderr: '' }
      return {
        collected: {
          stdout: { readFrom: () => ({ text: texts.stdout }) },
          stderr: { readFrom: () => ({ text: texts.stderr }) },
        },
        done: run(spec).then((outcome) => {
          texts.stdout = outcome.stdout
          texts.stderr = outcome.stderr
          return { exitCode: outcome.exitCode }
        }),
        terminate() {},
      }
    },
  }
}

/** cordis 的 `Volatile` 在测试里只需要 `get()`；默认值与 `Config` 的 schema 默认一致。 */
function fakeConfig(overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values = {
    recursive: true,
    extractSingle: true,
    overwrite: false,
    dryRun: true,
    recordRun: false,
    databasePath: '',
    ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}
