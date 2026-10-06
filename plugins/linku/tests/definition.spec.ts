/**
 * `package.json#xaihi.node` 的词表验收：断的是**上游那份定义说了什么**
 * （`<Xiranite>/node-definitions/linku.json`，definitionVersion 1），不是"清单能过校验"而已。
 *
 * 期望值全部手抄自那份文件（六个动作、四个字段、一条分组、四条绑定、
 * 逐条 label / options / default / visible / rules / danger）。改动只有四处，
 * 每处都配一条"去掉防御就变红"的对照：
 * 1. `select` 的 `options[].value`：上游是 `{text:"info"}` 这种标量盒，
 *    `xaihi.node/v1` 的 `NodeFieldOption.value` 是字符串（SDK 的 `fieldProperty` 直接把
 *    `option.value` 塞进工具参数面的 `enum`）。
 * 2. `groups[].title` → `label`：`NodeGroup` 认的是 `label`。
 * 3. `dashboard` 整块丢弃：`xaihi.node/v1` 没有这一块（`check-vocab` 早把它记成故意不接的
 *    上游形状——接了就等于在 Xaihi 里再造一条上游的表单渲染模型）。
 * 4. `help` 只留 `whenToUse` + `safety`：上游的 `workflows` / `commands` 是"每条一个标题 +
 *    按语言分组的数组"，`NodeHelp` 装不下；终端那一屏改由 `nodeHelpFromManifest` 从清单推导。
 *
 * **与 `classq` 相反的一条**：上游的 `danger` 是 `actionIn` + `actionField:"action"`，
 * 这里**原样保留**——`dangerFor` 的 `actionIn` 那条分支有
 * `args[actionField] ?? args[selector.id] ?? actionId` 三级兜底，所以 ask 真的会亮；
 * 而 `classq` 那份是 `all` + 谓词，`all/any` 那条路没有 actionId 兜底，留着 `actionField`
 * 就等于闸门永久不亮（那条对照写在 `plugins/classq/tests/definition.spec.ts`）。
 * 下面第 5 条用例把这个差别钉成断言，而不是留在注释里。
 *
 * @module xaihi-linku/tests/definition
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dangerFor, parametersFor, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'

interface RawNode {
  definitionVersion: number
  nodeId: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  actions: { id: string; label: { zh: string; en: string } }[]
  fields: { id: string; kind: string; label: { zh: string; en: string }; default?: unknown; options?: { value: unknown }[]; visible?: { type: string; predicate?: { test: { type: string; actionField?: string; allowed?: unknown[] }, negated: boolean } }; rules?: unknown[] }[]
  groups: { id: string; label?: { zh: string; en: string }; title?: unknown; fieldIds: string[] }[]
  inputBindings: { fieldId: string; slot: string; transform?: string }[]
  danger: { type: string; actionField?: string; dangerous?: string[]; predicates?: unknown[] }
  dashboard?: unknown
  previewExport?: string
  resultExport?: string
  reportsProgress?: boolean
  publishesOutputPath?: boolean
  dangerPrompt?: { title: { zh: string; en: string }; body: { zh: string; en: string }; confirmLabel: { zh: string; en: string } }
  help?: { whenToUse?: { zh: string; en: string }; safety?: { defaultMode?: string; notes?: { zh: string[]; en: string[] } } }
}

function ownNode (): RawNode {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: RawNode } }
  if (pkg.xaihi?.node === undefined) throw new Error('package.json#xaihi.node 不见了（清单是定义的唯一真源）')
  return pkg.xaihi.node
}

function validated () {
  const result = validateNodeDefinition(ownNode())
  expect(result.ok ? true : result.errors).toBe(true)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

describe('linku 清单合法性', () => {
  it('validateNodeDefinition 收下这份清单', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('阳性对照：把规则摊平成 {type} 必须被拒（上游 GuardedRule 是 {rule, when?}）', () => {
    const broken = JSON.parse(JSON.stringify(ownNode())) as RawNode
    broken.fields[1]!.rules = [{ type: 'required' }]
    const check = validateNodeDefinition(broken)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.errors.join(' ')).toContain('must be a guarded rule object')
  })

  it('阳性对照：重复动作 id、缺 zh 标签、分组指向不存在的字段三样都被拒', () => {
    const duplicated = JSON.parse(JSON.stringify(ownNode())) as RawNode
    duplicated.actions[1] = JSON.parse(JSON.stringify(duplicated.actions[0]))
    const dupCheck = validateNodeDefinition(duplicated)
    expect(dupCheck.ok).toBe(false)
    if (!dupCheck.ok) expect(dupCheck.errors.join(' ')).toContain('duplicates')

    const noChinese = JSON.parse(JSON.stringify(ownNode())) as RawNode
    noChinese.fields[2] = { ...noChinese.fields[2]!, label: { en: 'Target path' } as never }
    expect(validateNodeDefinition(noChinese).ok).toBe(false)

    const dangling = JSON.parse(JSON.stringify(ownNode())) as RawNode
    dangling.groups[0]!.fieldIds = ['nope']
    const danglingCheck = validateNodeDefinition(dangling)
    expect(danglingCheck.ok).toBe(false)
    if (!danglingCheck.ok) expect(danglingCheck.errors.join(' ')).toContain('unknown field')

    // 对照自己：原样那份必须是绿的，否则上面三条只是"尺在乱叫"。
    expect(validateNodeDefinition(ownNode()).ok).toBe(true)
  })
})

describe('linku 清单词表（逐条对上游 linku.json）', () => {
  it('节点身份、六个动作、四个字段、一条分组、四条绑定的顺序与数量', () => {
    const node = ownNode()
    expect(node.definitionVersion).toBe(1)
    expect(node.nodeId).toBe('linku')
    expect(node.title).toEqual({ zh: 'Linku', en: 'Linku' })
    expect(node.description).toEqual({
      zh: '创建、移动、导入、还原、列出并恢复符号链接记录。',
      en: 'Create, move, import, restore, list, and recover symlink records.',
    })
    expect(node.actions.map((action) => action.id)).toEqual(['info', 'create', 'move_link', 'list', 'recover', 'restore'])
    expect(node.actions.map((action) => action.label.zh)).toEqual(['◉ 信息', '⊕ 创建', '⇄ 移动回链', '▤ 列表', '↻ 恢复', '⟲ 还原'])
    expect(node.actions.map((action) => action.label.en)).toEqual(['◉ Info', '⊕ Create', '⇄ Move & link', '▤ List', '↻ Recover', '⟲ Restore'])
    expect(node.fields.map((field) => field.id)).toEqual(['action', 'path', 'target', 'configPath'])
    expect(node.fields.map((field) => field.kind)).toEqual(['select', 'text', 'text', 'text'])
    expect(node.groups[0]?.id).toBe('links')
    expect(node.groups[0]?.label).toEqual({ zh: '链接拓扑', en: 'Link topology' })
    expect(node.groups[0]?.fieldIds).toEqual(['action', 'path', 'target', 'configPath'])
    expect(node.inputBindings.map((binding) => `${binding.fieldId}->${binding.slot}:${binding.transform}`)).toEqual([
      'action->action:trim', 'path->path:identity', 'target->target:identity', 'configPath->configPath:identity',
    ])
    expect(node.previewExport).toBe('preview')
    expect(node.resultExport).toBe('result_view')
    expect(node.reportsProgress).toBe(true)
    expect(node.publishesOutputPath).toBe(false)

    // 阳性对照：上游的 `dashboard` 不许悄悄回来（改动 3），分组的 `title` 也一样。
    expect(node.dashboard).toBeUndefined()
    expect(node.groups[0]?.title).toBeUndefined()
  })

  it('描述与标签逐字对上游；`import` 在上游清单里就不是动作（内核与终端面才有）', () => {
    const node = ownNode()
    expect(node.fields.map((field) => field.label.zh)).toEqual(['命令', '源路径 / 原链接', '目标路径', '链接记录配置'])
    expect(node.fields.map((field) => field.label.en)).toEqual(['Command', 'Source path / original link', 'Target path', 'Link records config'])
    expect(node.fields.map((field) => field.default)).toEqual([{ text: 'info' }, { text: '' }, { text: '' }, { text: '' }])
    expect(node.fields[0]?.options?.map((option) => option.value)).toEqual(['info', 'create', 'move_link', 'list', 'recover', 'restore'])
    expect(node.dangerPrompt?.title).toEqual({ zh: '确认文件系统链接操作', en: 'Confirm filesystem link operation' })
    expect(node.dangerPrompt?.body).toEqual({ zh: '此操作会创建链接，移动回链还会移动原路径。', en: 'This creates symlinks; move-link also moves the source path.' })
    expect(node.dangerPrompt?.confirmLabel).toEqual({ zh: '确认执行', en: 'Execute' })

    // 这条钉子说的是"清单少一条"这件事：内核的七个动作与终端面的八条子命令里都有 import，
    // 上游清单没有 ⇒ 宿主面没有 linku_import 工具（见 src/index.ts 文件头第 2 条）。
    expect(node.actions.map((action) => action.id)).not.toContain('import')
  })

  it('按动作切换的可见性与参数表逐条对上游（path 只在四个动作里出现，target 只在两个里）', () => {
    const def = validated()
    // 期望值是照清单的 visible 手推的（`parametersFor` 会把动作选择器的值塞进入参再求值）。
    expect(Object.keys(parametersFor(def, 'info'))).toEqual(['path', 'configPath'])
    expect(Object.keys(parametersFor(def, 'create'))).toEqual(['path', 'target', 'configPath'])
    expect(Object.keys(parametersFor(def, 'move_link'))).toEqual(['path', 'target', 'configPath'])
    expect(Object.keys(parametersFor(def, 'list'))).toEqual(['configPath'])
    expect(Object.keys(parametersFor(def, 'recover'))).toEqual(['configPath'])
    expect(Object.keys(parametersFor(def, 'restore'))).toEqual(['path', 'configPath'])

    const node = ownNode()
    const path = node.fields.find((field) => field.id === 'path')!
    expect(path.visible).toEqual({ type: 'single', predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['list', 'recover'] }, negated: true } })
    const target = node.fields.find((field) => field.id === 'target')!
    expect(target.visible).toEqual({ type: 'single', predicate: { test: { type: 'actionIs', actionField: 'action', allowed: ['create', 'move_link'] }, negated: false } })
    // 两条带 when 的守卫规则（required + nonBlank）原样保留：`fieldProperty` 只把
    // **没有 when** 的规则抬成参数必填，所以 path/target 在工具面上都不是 required
    // （`ParameterPropertySpec.required` 的类型是 `true | undefined`，这里钉的就是 undefined）。
    expect(path.rules).toHaveLength(2)
    expect(target.rules).toHaveLength(2)
    expect(parametersFor(def, 'info')['path']?.required).toBeUndefined()

    // 阳性对照：把 negated 改成 false，`list` 的参数表就会多出一列 path。
    const flipped = JSON.parse(JSON.stringify(ownNode())) as RawNode
    flipped.fields.find((field) => field.id === 'path')!.visible!.predicate!.negated = false
    const flipCheck = validateNodeDefinition(flipped)
    expect(flipCheck.ok ? true : flipCheck.errors).toBe(true)
    if (flipCheck.ok) expect(Object.keys(parametersFor(flipCheck.value, 'list'))).toContain('path')
  })

  it('危险闸门：四条动作 ask、两条动作不 ask，且 actionField 留着也照样亮（与 classq 相反）', () => {
    const def = validated()
    const node = ownNode()
    expect(node.danger).toEqual({
      type: 'actionIn',
      actionField: 'action',
      dangerous: ['create', 'move_link', 'recover', 'restore'],
    })
    for (const actionId of ['create', 'move_link', 'recover', 'restore']) {
      expect(dangerFor(def, undefined, actionId, {})?.zh).toContain('linku')
    }
    expect(dangerFor(def, undefined, 'info', {})).toBeUndefined()
    expect(dangerFor(def, undefined, 'list', {})).toBeUndefined()

    // 阳性对照（改动清单第 5 条说的那颗钉子）：把 `actionIn` 换成 classq 那种
    // `all` + `actionIs(actionField)` 形状，ask 就永远不亮——
    // 这条就是"为什么 linku 原样保留、classq 必须去掉"的实测差别。
    const asAll = JSON.parse(JSON.stringify(ownNode())) as RawNode
    asAll.danger = { type: 'all', predicates: [{ test: { type: 'actionIs', actionField: 'action', allowed: ['create'] }, negated: false }] }
    const allCheck = validateNodeDefinition(asAll)
    expect(allCheck.ok ? true : allCheck.errors).toBe(true)
    if (allCheck.ok) expect(dangerFor(allCheck.value, undefined, 'create', {})).toBeUndefined()

    // 另一颗对照：dangerous 名单少一条，那条动作就不该 ask（名单是从上游逐条抄的）。
    const shorter = JSON.parse(JSON.stringify(ownNode())) as RawNode
    shorter.danger.dangerous = ['create', 'move_link', 'restore']
    const shortCheck = validateNodeDefinition(shorter)
    expect(shortCheck.ok ? true : shortCheck.errors).toBe(true)
    if (shortCheck.ok) expect(dangerFor(shortCheck.value, undefined, 'recover', {})).toBeUndefined()
  })

  it('模型多塞一个 action=create 去调 list 时仍然 ask（上游 actionIn 的保守方向，钉住不放宽）', () => {
    const def = validated()
    // `actionIn` 先读 `args[actionField]`，读不到才落回动作身份 ⇒ 多余的 action 参数
    // 只会把一次本来不危险的多要一次批准，方向是保守的，不是放行。
    expect(dangerFor(def, undefined, 'list', { action: 'create' })).toBeDefined()
    expect(dangerFor(def, undefined, 'list', {})).toBeUndefined()
  })

  it('help 只带 v1 词表能装的两块，终端那一屏从清单推导（改动 4）', async () => {
    const node = ownNode()
    expect(node.help?.whenToUse?.zh).toBe('当需要从工作区 UI 或 CLI 使用该节点的文件工作流时，使用 Linku。')
    expect(node.help?.whenToUse?.en).toBe('Use Linku when you need this node\'s file workflow from either the workspace UI or CLI.')
    expect(node.help?.safety?.defaultMode).toBe('preview')
    expect(node.help?.safety?.notes?.zh).toEqual(['修改文件前优先使用预览或 dry-run 模式。', '处理大文件夹时保留备份或撤销记录。'])

    const { help } = await import('../src/help.ts')
    expect(help.title).toBe('Linku')
    expect(help.commands[0]?.examples.map((example) => example.command)).toEqual([
      'xlinku --help', 'xlinku info', 'xlinku create', 'xlinku move_link', 'xlinku list', 'xlinku recover', 'xlinku restore',
    ])
  })
})
