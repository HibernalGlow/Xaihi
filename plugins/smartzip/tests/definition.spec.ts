/**
 * smartzip 清单（`package.json#xaihi.node`）的验收：词表对上游、形状对 SDK、接线对宿主。
 *
 * 期望值**逐条手抄**自 `<Xiranite>/node-definitions/smartzip.json`（definitionVersion 1），
 * 不由被测函数现算。三处**有意**的词表落差各配一条阳性对照，证明它们是"不得不这么改"，
 * 不是抄漏了：
 * 1. `fields[action].isActionSelector = true`：上游这份没有这个标记（27 份里只有
 *    linedup / sleept / timeu / smartzip 没有）。不补的话 `codePage` 那条
 *    `visible: actionIs ["extract_codepage"]` 在**任何**工具参数表里都求值成"没给动作"，
 *    于是 `smartzip_extract_codepage` 选不了码页。阳性对照：把标记删掉，`codePage`
 *    立刻从参数表里消失。
 * 2. `danger.predicates[].test.actionField` 被剥掉：`dangerFor` 的 `all` 那条路把
 *    `actionId` 交给求值器，但 `actionField` 一旦存在就改读 `args[actionField]`，
 *    而选择器字段不进参数表 ⇒ 三条谓词永远读成"动作未给"，连只读的 `status` 都会被拦。
 *    与 `plugins/rawfilter/tests/definition.spec.ts`、`plugins/samea` 钉住的是同一个坑。
 *    阳性对照：把 `actionField` 放回去，`status` 立刻变成危险。
 * 3. select 的 `options[].value`：上游是 `{text: "…"}` 三取一，我们是 `string`
 *    （`NodeFieldOption.value: string`；`parametersFor` 直接把它当 enum 用）；
 *    `fields[].default` 仍保留上游那个 `{text}` / `{boolean}` 包装（`NodeScalar` 收它）。
 * 4. `help` 只剩 `whenToUse` + `safety`：上游那两条 `workflows` / `commands` 的值是
 *    `{zh,en}` 两份，而 `NodeHelp.workflows` 声明的是 `string[]`（缺口 **G11**，同批 26 份
 *    都是这一格）。
 *
 * 另外钉住上游自带的 `dryRun` 分歧，不在这里统一：清单里字段的声明默认是 **true**，
 * 内核 `core.ts:224` 的默认是 **false**（`tests/core.spec.ts` 钉另一侧）。
 *
 * @module xaihi-smartzip/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  dangerFor,
  nodeHelpFromManifest,
  parametersFor,
  validateNodeDefinition,
  type NodeDefinition,
  type PreDecision,
} from '@hibernalglow/xaihi-sdk'
import { NO_SUBPROCESS_MESSAGE, NO_TRASH_MESSAGE } from '../src/platform.ts'
import { apply, inject, name as packageName, type Config } from '../src/index.ts'

interface NodeShape {
  definitionVersion: number
  nodeId: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: Array<{ id: string; label: { zh: string; en: string } }>
  fields: Array<{ id: string; kind: string; label: { zh: string; en: string }; isActionSelector?: boolean; default?: unknown; options?: Array<{ value: unknown; label: { zh: string; en: string } }>; rules?: unknown[]; visible?: unknown }>
  groups: unknown[]
  inputBindings: Array<{ fieldId: string; slot: string; transform?: string }>
  danger: { type: string; predicates: Array<{ test: { type: string; actionField?: string; allowed?: unknown[]; fieldId?: string }; negated: boolean }> }
  previewExport: string
  resultExport: string
  reportsProgress: boolean
  publishesOutputPath: boolean
  help: { whenToUse: { zh: string[]; en: string[] }; safety: { defaultMode: string; notes: { zh: string[]; en: string[] } } }
}

function ownNode (): NodeShape {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: NodeShape } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error('package.json#xaihi.node 不见了，这条尺没有真源')
  return node
}

function validated (): NodeDefinition {
  const result = validateNodeDefinition(ownNode())
  if (!result.ok) throw new Error(`清单不合法：${result.errors.join('; ')}`)
  return result.value
}

describe('smartzip 清单对上游词表', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('nodeId / 标题 / 描述逐字对上游', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('smartzip')
    expect(node.title).toEqual({ zh: 'SmartZip', en: 'SmartZip' })
    expect(node.description).toEqual({
      zh: '使用自动检测 7-Zip 的 TypeScript 归档工作流。',
      en: 'TypeScript archive workflows with automatic 7-Zip discovery.',
    })
  })

  it('六条动作的 id 与双语标签逐字对上游（内核的 SmartZipAction 也就这六个）', () => {
    expect(ownNode().actions).toEqual([
      { id: 'status', label: { zh: '状态', en: 'Status' } },
      { id: 'inspect_codepage', label: { zh: '预检文件名编码', en: 'Inspect filename encoding' } },
      { id: 'extract', label: { zh: '智能提取', en: 'Smart extract' } },
      { id: 'extract_codepage', label: { zh: '编码提取', en: 'Codepage extract' } },
      { id: 'open', label: { zh: '打开', en: 'Open' } },
      { id: 'archive', label: { zh: '压缩', en: 'Archive' } },
    ])
  })

  it('七条字段的 id 与控件类型逐字对上游', () => {
    expect(ownNode().fields.map((field) => [field.id, field.kind])).toEqual([
      ['action', 'select'],
      ['pathsText', 'path-list'],
      ['codePage', 'select'],
      ['iniPath', 'text'],
      ['recordRun', 'boolean'],
      ['databasePath', 'text'],
      ['dryRun', 'boolean'],
    ])
  })

  it('绑定逐条对上游（6 条，变换一个不改）', () => {
    expect(ownNode().inputBindings).toEqual([
      { fieldId: 'action', slot: 'action', transform: 'trim' },
      { fieldId: 'pathsText', slot: 'paths', transform: 'lines' },
      { fieldId: 'codePage', slot: 'codePage', transform: 'asInteger' },
      { fieldId: 'iniPath', slot: 'iniPath', transform: 'trimOrOmit' },
      { fieldId: 'recordRun', slot: 'recordRun', transform: 'asBoolean' },
      { fieldId: 'databasePath', slot: 'databasePath', transform: 'trimOrOmit' },
      { fieldId: 'dryRun', slot: 'dryRun', transform: 'asBoolean' },
    ])
  })

  it('清单里 dryRun 的声明默认是 true（内核是 false，两份都不许统一）', () => {
    const dryRun = ownNode().fields.find((field) => field.id === 'dryRun')
    expect(dryRun?.default).toEqual({ boolean: true })
    // 阳性对照：同一份清单里 recordRun 的声明默认是 false，
    // 说明这条断言不是"所有布尔都写 true"的巧合。
    expect(ownNode().fields.find((field) => field.id === 'recordRun')?.default).toEqual({ boolean: false })
  })

  it('previewExport / resultExport / reportsProgress / publishesOutputPath 逐字对上游', () => {
    const node = ownNode()
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)
  })

  it('help 只剩我们词表装得下的两块（G11），whenToUse 与 safety 逐字对上游', () => {
    const node = ownNode()
    expect(Object.keys(node.help).sort()).toEqual(['safety', 'whenToUse'])
    expect(node.help.whenToUse).toEqual({
      zh: ['需要从工作区 UI 或 CLI 使用该节点的文件流程时，可使用 SmartZip。'],
      en: ["Use SmartZip when you need this node's file workflow from either the workspace UI or CLI."],
    })
    expect(node.help.safety).toEqual({
      defaultMode: 'preview',
      notes: {
        zh: ['更改文件前优先使用预览或试运行模式。', '处理大文件夹时保留备份或撤销记录。'],
        en: [
          'Prefer preview or dry-run modes before changing files.',
          'Keep backups or undo records when processing large folders.',
        ],
      },
    })
  })
})

describe('smartzip 清单的三处有意落差', () => {
  it('落差 1：action 是选择器，于是 codePage 只在 extract_codepage 的参数表里出现', () => {
    const def = validated()
    expect(def.fields.find((field) => field.id === 'action')?.isActionSelector).toBe(true)
    expect(Object.keys(parametersFor(def, 'extract_codepage') ?? {})).toEqual(['pathsText', 'codePage', 'iniPath', 'recordRun', 'dryRun'])
    expect(Object.keys(parametersFor(def, 'extract') ?? {})).toEqual(['pathsText', 'iniPath', 'recordRun', 'dryRun'])
    // 只读那一格：status 的 pathsText 被上游那条 `visible: NOT actionIs [status]` 关掉。
    expect(Object.keys(parametersFor(def, 'status') ?? {})).toEqual(['iniPath', 'recordRun'])
    // 阳性对照：把选择器标记删掉，codePage 就从参数表里消失——那正是"补标记"的理由。
    const stripped = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    stripped.fields.find((field) => field.id === 'action')!.isActionSelector = false
    const check = validateNodeDefinition(stripped)
    expect(check.ok).toBe(true)
    if (check.ok) expect(Object.keys(parametersFor(check.value, 'extract_codepage') ?? {})).not.toContain('codePage')
  })

  it('落差 2：danger 谓词里没有 actionField，否则连 status 都会被拦', () => {
    const def = validated()
    expect(ownNode().danger).toEqual({
      type: 'all',
      predicates: [
        { test: { type: 'actionIs', allowed: ['status'] }, negated: true },
        { test: { type: 'actionIs', allowed: ['inspect_codepage'] }, negated: true },
        { test: { type: 'fieldTrue', fieldId: 'dryRun' }, negated: true },
      ],
    })
    expect(def.fields.find((field) => field.id === 'action')?.visible).toEqual({
      type: 'single',
      predicate: { test: { type: 'always' }, negated: false },
    })
  })

  it('dangerFor：两条只读动作永不危险，四条执行动作只在预演关掉时要批准', () => {
    const def = validated()
    expect(dangerFor(def, undefined, 'status', {})).toBeUndefined()
    expect(dangerFor(def, undefined, 'inspect_codepage', { pathsText: 'D:/a.zip' })).toBeUndefined()
    for (const action of ['extract', 'extract_codepage', 'open', 'archive']) {
      expect(dangerFor(def, undefined, action, {}), `${action} 省略 dryRun 时必须批准（G8：省略折成 false）`).toBeDefined()
      expect(dangerFor(def, undefined, action, { dryRun: false })).toBeDefined()
      expect(dangerFor(def, undefined, action, { dryRun: true }), `${action} 预演时不许要批准`).toBeUndefined()
    }
    const reason = dangerFor(def, undefined, 'extract', {})
    expect(reason?.en).toContain('smartzip')
    expect(reason?.zh).toContain('危险')
    // 阳性对照：把 actionField 放回谓词里，`status` 立刻被读成"动作未给 ⇒ 危险"。
    const withField = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    for (const predicate of withField.danger.predicates) {
      if (predicate.test.type === 'actionIs') predicate.test.actionField = 'action'
    }
    const check = validateNodeDefinition(withField)
    expect(check.ok).toBe(true)
    if (check.ok) expect(dangerFor(check.value, undefined, 'status', {})).toBeDefined()
  })

  it('落差 3：select 的 value 是 string（上游是 {text} 三取一），default 仍保留包装', () => {
    const node = ownNode()
    const action = node.fields.find((field) => field.id === 'action')
    expect(action?.options?.map((option) => option.value)).toEqual([
      'status', 'inspect_codepage', 'extract', 'extract_codepage', 'open', 'archive',
    ])
    expect(node.fields.find((field) => field.id === 'codePage')?.options?.map((option) => option.value))
      .toEqual(['0', '936', '950', '932', '949', '65001'])
    expect(action?.default).toEqual({ text: 'status' })
    // 阳性对照：留着上游那份 `{text: "status"}` 的话，enum 里就是对象而不是字符串。
    const upstreamShape = JSON.parse(JSON.stringify(ownNode())) as NodeShape
    upstreamShape.fields.find((field) => field.id === 'action')!.options = [{ value: { text: 'status' }, label: { zh: '状态', en: 'Status' } }]
    expect(typeof upstreamShape.fields.find((field) => field.id === 'action')!.options![0]!.value).toBe('object')
  })
})

describe('smartzip 的 G7 与终端面一致性', () => {
  it('本包不注册 ctx.commands，于是 help.ts 不许把 command 传给推导器', () => {
    expect(inject).toEqual(['tools', 'subprocess'])
    expect(inject).not.toContain('commands')
    const source = readFileSync(fileURLToPath(new URL('../src/help.ts', import.meta.url)), 'utf8')
    const passesCommand = /nodeHelpFromManifest\([^)]*\bcommand\s*:/.test(source)
    expect(passesCommand).toBe(false)
    // 阳性对照：同一把尺必须看得见"传了 command"的那一份写法。
    expect(/nodeHelpFromManifest\([^)]*\bcommand\s*:/.test("nodeHelpFromManifest(node, { bin: 'xsmartzip', command: '/smartzip' })")).toBe(true)
  })

  it('两句可见拒绝不许把使用者指向本包没注册的 /smartzip', () => {
    // `nodeHelpFromManifest` 的兜底会印 `/smartzip`（SDK 那一侧的默认，G7 的另一半），
    // 但**我们自己写的文案**不许把它当成一条可走的出路：本包没注册那条命令。
    const mentionsHostCommand = (text: string): boolean => text.includes('/smartzip')
    expect(mentionsHostCommand(NO_SUBPROCESS_MESSAGE)).toBe(false)
    expect(mentionsHostCommand(NO_TRASH_MESSAGE)).toBe(false)
    // 阳性对照：把那句改回旧写法（"run it from /smartzip"）时这条必须红。
    expect(mentionsHostCommand('run the action from /smartzip')).toBe(true)
  })

  it('帮助页由清单推导：bin 名与六个动作都在里面', () => {
    const help = nodeHelpFromManifest(ownNode() as never, { bin: 'xsmartzip' })
    expect(help.title).toBe('SmartZip')
    expect(help.short).toBe('TypeScript archive workflows with automatic 7-Zip discovery.')
    const examples = help.commands.find((command) => command.command === 'xsmartzip')!.examples.map((example) => example.command)
    expect(examples).toEqual([
      'xsmartzip --help',
      'xsmartzip status',
      'xsmartzip inspect_codepage',
      'xsmartzip extract',
      'xsmartzip extract_codepage',
      'xsmartzip open',
      'xsmartzip archive',
    ])
  })
})

describe('smartzip 宿主接线（apply → defineNode → 真内核）', () => {
  it('六条动作注册成六个工具，名字是 <nodeId>_<actionId>', () => {
    expect(packageName).toBe('@hibernalglow/xaihi-smartzip')
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: (key: string) => (key === 'subprocess' ? fakeSubprocess(1) : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    expect(registered.map((tool) => tool['name'])).toEqual([
      'smartzip_status',
      'smartzip_inspect_codepage',
      'smartzip_extract',
      'smartzip_extract_codepage',
      'smartzip_open',
      'smartzip_archive',
    ])
    expect(listeners).toHaveLength(1)
  })

  it('危险闸门只拦本节点的工具：status 放行、extract 要批准、别家节点不受影响', async () => {
    const registered: Array<Record<string, unknown>> = []
    const listeners: Array<(exec: { name: string; arguments: unknown }, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: (_event: string, listener: unknown) => {
        listeners.push(listener as (typeof listeners)[number])
        return () => {}
      },
      get: (key: string) => (key === 'subprocess' ? fakeSubprocess(1) : undefined),
    }
    apply(ctx as never, fakeConfig({}))
    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }

    expect((await listener({ name: 'smartzip_status', arguments: {} }, next)).kind).toBe('allow')
    expect((await listener({ name: 'smartzip_extract', arguments: { dryRun: false } }, next)).kind).toBe('ask')
    expect((await listener({ name: 'smartzip_extract', arguments: { dryRun: true } }, next)).kind).toBe('allow')
    // 阳性对照：不相干工具不许被本节点拦截（否则会拦掉别的节点）。
    expect((await listener({ name: 'other_node_action', arguments: {} }, next)).kind).toBe('allow')
    expect(passed).toBe(3)
  })

  it('status 工具真的跑内核，输出里是内核那句话与脱敏后的密码', async () => {
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: () => () => {},
      get: (key: string) => (key === 'subprocess' ? fakeSubprocess(1) : undefined),
    }
    apply(ctx as never, fakeConfig({ passwords: 'hunter-two' }))
    const tool = registered.find((entry) => entry['name'] === 'smartzip_status')!
    const output = await (tool['execute'] as (args: unknown, exec: unknown) => Promise<string>)({ iniText: '' }, {})
    expect(output).toContain('status · SmartZip status loaded: 9 archive extension(s).')
    // 清单里没有 iniText 这个字段，所以走的是内核默认表：9 项就是 `parseSmartZipIni('')` 的
    // `[ext]` 缺省（`core.ts:311`）。阳性对照：`Config.passwords` 那句不进输出。
    expect(output).not.toContain('hunter-two')
  })

  it('extract 工具走的是 ctx.subprocess 那条缝：缝里说没有 7z，内核就说没有 7z，而不是缝缺失那句', async () => {
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      tools: { register: (tool: unknown) => { registered.push(tool as Record<string, unknown>); return () => {} } },
      on: () => () => {},
      get: (key: string) => (key === 'subprocess' ? fakeSubprocess(1) : undefined),
    }
    apply(ctx as never, fakeConfig({ dryRun: false }))
    const tool = registered.find((entry) => entry['name'] === 'smartzip_extract')!
    const call = tool['execute'] as (args: unknown, exec: unknown) => Promise<string>
    await expect(call({ pathsText: ['/tmp/does-not-matter.zip'], dryRun: false }, {})).rejects.toThrow(/7-Zip was not found/)
    // 阳性对照：同一个工具在没有缝的那一份运行时（独立 bin 的形状）说的必须是另一句。
    const binStyle = await import('../src/platform.ts').then((mod) => mod.createNodeSmartZipRuntime())
    const { runSmartZip } = await import('../src/core.ts')
    const binResult = await runSmartZip({ action: 'extract', paths: ['/tmp/does-not-matter.zip'], dryRun: false }, binStyle)
    expect(binResult.message).toBe(NO_SUBPROCESS_MESSAGE)
  })
})

/**
 * cordis 的 `Volatile` 在测试里只需要 `get()`；这六个默认值与 `src/index.ts` 里
 * `Config` 的 schema 默认一致（`dryRun` 是 **true**，与内核那一侧不同，见文件头）。
 * 期望值手抄自上游 `cli.ts:105-114` 那组 `[nodes.smartzip]` 兜底。
 */
function fakeConfig (overrides: Partial<Record<keyof Config, unknown>>): Config {
  const values: Record<string, unknown> = {
    iniPath: '', passwords: '', codePage: 0, databasePath: '', recordRun: false, dryRun: true, ...overrides,
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) as unknown as Config
}

/**
 * `ctx.subprocess` 的假件：`spawn` 交回一个立刻以 `exitCode` 收口的句柄，
 * 于是 `find7z` 的 `which 7z` 一定查不到东西。
 * @param exitCode - 想要的退出码；1 = "这个程序不在 PATH 上"。
 */
function fakeSubprocess (exitCode: number) {
  return {
    spawn: () => ({
      done: Promise.resolve({ exitCode }),
      collected: {
        stdout: { readFrom: () => ({ text: '' }) },
        stderr: { readFrom: () => ({ text: '' }) },
      },
    }),
  }
}
