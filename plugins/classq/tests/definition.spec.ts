/**
 * `package.json#xaihi.node` 的词表验收：断的是**上游那份定义说了什么**
 * （`<Xiranite>/node-definitions/classq.json`，definitionVersion 1），不是"清单能过校验"而已。
 *
 * 期望值全部手抄自那份文件（两个动作、七个字段、一条分组、七条绑定、
 * 逐条 label / options / default / visible / rules），改动只有下面五处，
 * 每处都配一条"去掉防御就变红"的对照：
 * 1. `select` 的 `options[].value`：上游是 `{text:"plan"}` 这种标量盒，
 *    `xaihi.node/v1` 的 `NodeFieldOption.value` 是字符串（SDK 的 `fieldProperty` 直接把
 *    `option.value` 塞进工具参数面的 `enum`，盒子会变成选不了的枚举）。
 * 2. `groups[].title` → `label`：`NodeGroup` 认的是 `label`。
 * 3. `danger.predicates[].test.actionField` 去掉：`defineNode` 的 pre-execute 拿到的是
 *    **模型给的参数**，而动作选择器字段不进参数表（`parametersFor` 会跳过
 *    `isActionSelector`），留着 `actionField:"action"` 时 `all` 那条路没有 actionId 兜底
 *    ⇒ `classify` 的 `ask` 永远不亮（同一颗钉子见 `plugins/samea/tests/core.spec.ts`）。
 *    字段的 `visible` 仍保留 `actionField`：那条走 `parametersFor`，它自己会把
 *    `{[selector.id]: actionId}` 塞进求值参数，所以读得到。
 * 4. `paths` 绑定的 `delimited` → `identity`：SDK 的 path-list 参数是**数组**，
 *    `delimited` 是 `String(value).split(',')`，换行分隔的多根会被当成一条路径。
 *    切分交给内核自己的 `parseList`（换行与逗号都算），形状分流在 `src/index.ts` 的 `pathSlots`。
 * 5. `help` 只留 `whenToUse` + `safety`：上游的 `workflows` / `commands` 是
 *    "每条一个标题 + 按语言分组的数组"，`xaihi.node/v1` 的 `NodeHelp`
 *    （`whenToUse: LocalizedText` + `workflows?: Partial<Record<'ui'|'cli'|'tips', string[]>>`）
 *    装不下它，硬摊平就是丢内容；终端那一屏改由 `nodeHelpFromManifest` 从清单推导（`src/help.ts`）。
 *
 * @module xaihi-classq/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bindInputs, dangerFor, parametersFor, transformValue, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'

interface RawNode {
  definitionVersion: number
  nodeId: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: { id: string; kind: string; label: { zh: string; en: string }; default?: unknown; visible?: { type: string; predicate?: { test: { type: string; actionField?: string; allowed?: unknown[] } } }; rules?: unknown[]; options?: { value: unknown }[] }[]
  groups: { id: string; label?: { zh: string; en: string }; title?: unknown; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; predicates?: { test: { type: string; actionField?: string; allowed?: unknown[] }; negated: boolean }[] }
  help: { whenToUse?: { zh: string; en: string }; safety?: { defaultMode?: string; destructive?: { zh: string[]; en: string[] } } }
}

function ownNode (): RawNode {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: RawNode } }
  if (pkg.xaihi?.node === undefined) throw new Error('package.json#xaihi.node 不见了（清单是定义的唯一真源）')
  return pkg.xaihi.node
}

describe('classq 清单合法性', () => {
  it('validateNodeDefinition 收下这份清单', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：把规则摊平成 {type} 必须被拒（上游 GuardedRule 是 {rule, when?}）', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as RawNode
    const paths = broken.fields.find((field) => field.id === 'paths')
    // 期望值手写：这条正是本仓一度写错的那一版。
    paths!.rules = [{ type: 'atLeastLines', minimum: 1 }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：缺 en 文案、重复字段 id、越界 kind 三样都被拒', () => {
    const noEnglish = JSON.parse(JSON.stringify(ownNode())) as RawNode
    noEnglish.title = { zh: '分类队列' } as never
    expect(validateNodeDefinition(noEnglish).ok).toBe(false)

    const duplicated = JSON.parse(JSON.stringify(ownNode())) as RawNode
    duplicated.fields[1] = JSON.parse(JSON.stringify(duplicated.fields[0]))
    const dupCheck = validateNodeDefinition(duplicated)
    expect(dupCheck.ok).toBe(false)
    if (!dupCheck.ok) expect(dupCheck.errors.join(' ')).toContain('duplicates')

    const badKind = JSON.parse(JSON.stringify(ownNode())) as RawNode
    badKind.fields[1] = { ...badKind.fields[1]!, kind: 'url' }
    expect(validateNodeDefinition(badKind).ok).toBe(false)

    // 对照自己：原样那份必须是绿的，否则上面三条只是"尺在乱叫"。
    expect(validateNodeDefinition(ownNode()).ok).toBe(true)
  })
})

describe('classq 清单词表（逐条对上游 classq.json）', () => {
  it('节点身份、两个动作、七个字段、一条分组、七条绑定的顺序与数量', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('classq')
    expect(node.title).toEqual({ zh: 'ClassQ', en: 'ClassQ' })
    expect(node.description).toEqual({
      zh: '查找关键词文件夹并将同级项移入 wait 文件夹。',
      en: 'Find keyword folders and move sibling items into wait folders.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['plan', 'classify'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['⌕ 扫描计划', '↳ 分类执行'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['Plan', 'Classify'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'paths', 'keyword', 'waitKeyword', 'transferMode', 'existingPolicy', 'dryRun',
    ])
    expect(node.fields.map((field) => field.kind)).toEqual([
      'select', 'path-list', 'text', 'text', 'select', 'select', 'boolean',
    ])
    expect(node.groups[0]?.id).toBe('routing')
    expect(node.groups[0]?.label).toEqual({ zh: '路由规则', en: 'Routing' })
    expect(node.groups[0]?.fieldIds).toEqual([
      'action', 'paths', 'keyword', 'waitKeyword', 'transferMode', 'existingPolicy', 'dryRun',
    ])
    expect(node.inputBindings.map((binding) => `${binding.fieldId}->${binding.slot}`)).toEqual([
      'action->action', 'paths->paths', 'keyword->keyword', 'waitKeyword->waitKeyword',
      'transferMode->transferMode', 'existingPolicy->existingPolicy', 'dryRun->dryRun',
    ])

    // 阳性对照：分组的 `title` 不许悄悄留着——SDK 读的是 `label`，留着就等于界面上没有标题。
    expect(node.groups[0]?.title).toBeUndefined()
  })

  it('每个字段的中文标签与默认值照上游，动作选择器只标一次', () => {
    const node = ownNode()
    expect(node.fields.map((field) => field.label.zh)).toEqual([
      '工作流', '输入根目录', '关键词目录', '等待目录', '传输方式', '目标冲突', '仅预演',
    ])
    expect(node.fields.map((field) => field.label.en)).toEqual([
      'Workflow', 'Root directories', 'Keyword folder', 'Wait folder', 'Transfer', 'Existing target', 'Dry run',
    ])
    expect(node.fields.map((field) => field.default)).toEqual([
      { text: 'plan' }, { text: '' }, { text: 'already' }, { text: 'wait' },
      { text: 'move' }, { text: 'merge' }, { boolean: true },
    ])
    const selector = node.fields.filter((field) => field.id === 'action')
    expect(selector).toHaveLength(1)

    // 阳性对照：select 的 value 必须是字符串（改动 1）。上游那种 {text} 盒子在这里判红。
    const action = node.fields.find((field) => field.id === 'action')!
    expect(action?.options?.map((option) => option.value)).toEqual(['plan', 'classify'])
    const boxed = JSON.parse(JSON.stringify(ownNode())) as RawNode
    const boxedAction = boxed.fields.find((field) => field.id === 'action')!
    boxedAction.options = [{ value: { text: 'plan' } }, { value: { text: 'classify' } }]
    expect(boxedAction.options.every((option) => typeof option.value === 'string')).toBe(false)
  })

  it('按动作切换可见性留在清单里：transferMode / existingPolicy / dryRun 只在 classify 可见', () => {
    const node = ownNode()
    const validated = validateNodeDefinition(node)
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    // 期望值是照清单的 visible 手推的（`parametersFor` 会把动作选择器的值塞进入参再求值）。
    expect(Object.keys(parametersFor(validated.value, 'plan'))).toEqual(['paths', 'keyword', 'waitKeyword'])
    expect(Object.keys(parametersFor(validated.value, 'classify'))).toEqual([
      'paths', 'keyword', 'waitKeyword', 'transferMode', 'existingPolicy', 'dryRun',
    ])

    // 阳性对照：这三条的 visible 若被"顺手改成 always"，plan 的参数表就会多出三行。
    for (const fieldId of ['transferMode', 'existingPolicy', 'dryRun']) {
      const field = node.fields.find((item) => item.id === fieldId)!
      expect(field.visible?.predicate?.test.type).toBe('actionIs')
      // 可见性这一侧**保留** `actionField`（改动 3 只针对 danger，见文件头）。
      expect(field.visible?.predicate?.test.actionField).toBe('action')
      expect(field.visible?.predicate?.test.allowed).toEqual(['classify'])
    }
  })

  it('paths 的绑定是 identity：换行分隔的多根不许被 delimited 粘成一条（改动 4）', () => {
    const node = ownNode()
    const binding = node.inputBindings.find((item) => item.fieldId === 'paths')
    expect(binding?.slot).toBe('paths')
    expect(binding?.transform).toBe('identity')

    // 期望值手写：这两条就是上游 `parseList`（core.ts:238）能吃、`delimited` 不能吃的形状。
    expect(transformValue('/a\n/b', 'delimited')).toEqual(['/a\n/b'])
    expect(transformValue('/a\n/b', 'lines')).toEqual(['/a', '/b'])
    expect(bindInputs(node as never, { paths: ['/a', '/b'] })).toMatchObject({ paths: ['/a', '/b'] })
    // 对照：identity 把原样交给接线层，两条槽的分流在 `src/index.ts` 的 `pathSlots`。
    expect(bindInputs(node as never, { paths: '/a\n/b' })).toMatchObject({ paths: '/a\n/b' })
  })

  it('危险闸门：plan 永不危险，classify 只在预演关掉时 ask；漏给 dryRun 也必须 ask', () => {
    const validated = validateNodeDefinition(ownNode())
    expect(validated.ok ? true : validated.errors).toBe(true)
    if (!validated.ok) return
    const def = validated.value
    expect(dangerFor(def, undefined, 'plan', {})).toBeUndefined()
    expect(dangerFor(def, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(def, undefined, 'classify', { dryRun: true })).toBeUndefined()
    expect(dangerFor(def, undefined, 'classify', { dryRun: false })?.zh).toContain('classq')
    // 对照（真事故那一颗）：谓词里若留着上游那句 `actionField:"action"`，模型不传 action
    // 时这条 ask 就永远不亮——那才是必须钉住的方向。
    const withActionField = JSON.parse(JSON.stringify(ownNode())) as RawNode
    withActionField.danger.predicates![0]!.test.actionField = 'action'
    const broken = validateNodeDefinition(withActionField)
    expect(broken.ok ? true : broken.errors).toBe(true)
    if (broken.ok) expect(dangerFor(broken.value, undefined, 'classify', { dryRun: false })).toBeUndefined()
    // 而当前这份（无 actionField）在同样输入下必须 ask：两条一比一对照。
    expect(dangerFor(def, undefined, 'classify', { dryRun: false })).toBeDefined()
    // 漏给 dryRun（模型省略可选布尔）也算"没在预演"，必须 ask。
    expect(dangerFor(def, undefined, 'classify', {})).toBeDefined()
  })

  it('help 只带 v1 词表能装的两块，终端文案不从清单外第二处抄（改动 5）', async () => {
    const node = ownNode()
    expect(node.help?.whenToUse?.zh).toBe('当已审阅的文件夹通过名称标记，且其旁的其余项需要排入 wait 文件夹时使用 ClassQ。')
    expect(node.help?.whenToUse?.en).toBe('Use ClassQ when reviewed folders are marked by name and everything beside them should be queued into a wait folder.')
    expect(node.help?.safety?.defaultMode).toBe('dry-run')
    expect(node.help?.safety?.destructive?.zh).toEqual(['classify'])

    // 阳性对照：终端那一屏（bin 的 --help）确实是从这份清单推的，节点 id 与动作名只能来自它。
    const { help } = await import('../src/help.ts')
    expect(help.title).toBe('ClassQ')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual(['classq --help', 'classq plan', 'classq classify'])
  })
})
