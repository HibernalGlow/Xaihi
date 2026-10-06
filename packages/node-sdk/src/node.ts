/**
 * `xaihi.node/v1` —— 节点契约的词表与文档形状。
 *
 * 词表照抄 Xiranite 的 `packages/node-definitions/src/contract.ts`（master，
 * `DEFINITION_VERSION_V1 = 1`），包括 `NODE_FIELD_KINDS` / `CONDITION_KINDS` /
 * `TEST_KINDS` / `RULE_KINDS` / `DANGER_KINDS` / `TRANSFORMS` / `HELP_SURFACES`。
 * 这里剥掉宿主执行类字段（`runtime`、`host_functions`、`entry`、`allowed_paths`、
 * `memory_max_pages`）——那些归 DSH 的 subprocess / sandbox / permission 子系统。
 *
 * 本文件只做顶层结构校验（键存在、kind 在词表内、id 唯一、引用可解析）。
 * 谓词/条件/规则载荷的深度校验由 Step 3 从 contract.ts 完整移植，避免一次改两套真源。
 *
 * @module xaihi-sdk/node
 */

import type { LocalizedText } from './manifest.ts'

/** 契约版本，写进 definition 的 `definitionVersion`。 */
export const NODE_DEFINITION_VERSION = 1
/** 字段输入控件类型。 */
export const NODE_FIELD_KINDS = ['text', 'multiline', 'path-list', 'number', 'select', 'boolean'] as const
/** 条件组合方式，对应 Rust `Condition` 枚举。 */
export const CONDITION_KINDS = ['single', 'all', 'any', 'anyAll'] as const
/** 谓词测试类型，对应 Rust `Test` 枚举。 */
export const TEST_KINDS = ['always', 'never', 'actionIs', 'fieldEquals', 'fieldFilled', 'fieldTrue', 'numberAtLeast'] as const
/** 值来源类型。 */
export const VALUE_SOURCE_KINDS = ['field', 'literal', 'actionLabel', 'firstNonEmpty'] as const
/** 校验规则类型。 */
export const RULE_KINDS = ['required', 'nonBlank', 'integerAtLeast', 'integerInRange', 'numberAtLeast', 'numberInRange', 'oneOfDeclaredOptions', 'atLeastLines', 'anyFilled', 'custom'] as const
/** 危险闸门类型。 */
export const DANGER_KINDS = ['none', 'actionIn', 'fieldFlag', 'all', 'any', 'pluginExport'] as const
/** 输入绑定变换。 */
export const TRANSFORMS = ['identity', 'trim', 'lines', 'delimited', 'trimOrOmit', 'asInteger', 'asBoolean'] as const

/** 字段控件类型。 */
export type NodeFieldKind = (typeof NODE_FIELD_KINDS)[number]
/** 绑定变换。 */
export type NodeTransform = (typeof TRANSFORMS)[number]
/** 危险闸门类型。 */
export type NodeDangerKind = (typeof DANGER_KINDS)[number]
/** 条件组合方式。 */
export type NodeConditionKind = (typeof CONDITION_KINDS)[number]
/** help 面向的使用面。 */
export const HELP_SURFACES = ['ui', 'cli', 'tips'] as const

/** 标量：`{text}` / `{number}` / `{boolean}` 三者恰好取一。 */
export type NodeScalar = { text: string } | { number: number } | { boolean: boolean }

/** 谓词测试；字段名照 Xiranite contract.ts 的 Rust `Test` 枚举。 */
export interface NodeTest {
  type: (typeof TEST_KINDS)[number]
  actionField?: string
  allowed?: unknown[]
  fieldId?: string
  value?: NodeScalar
  minimum?: number
}

/** 条件树的一个叶子。 */
export interface NodePredicate {
  test: NodeTest
  negated: boolean
}

/** 可见性等条件；`single` 带 predicate，`all`/`any` 带非空 predicates，`anyAll` 带 clauses（OR of ANDs）。 */
export interface NodeCondition {
  type: (typeof CONDITION_KINDS)[number]
  predicate?: NodePredicate | undefined
  predicates?: NodePredicate[] | undefined
  clauses?: NodePredicate[][] | undefined
}

/** 一个可执行动作。 */
export interface NodeAction {
  id: string
  label: LocalizedText
  description?: LocalizedText
}

/** 字段声明的选项。 */
export interface NodeFieldOption {
  value: string
  label: LocalizedText
}

/** 规则本体（上游 Rust 那边就叫 `Rule`）。 */
export interface NodeRuleBody {
  type: (typeof RULE_KINDS)[number]
  value?: unknown
  minimum?: number
  maximum?: number
  fieldId?: string
}

/**
 * 上游 Rust 的 `GuardedRule`：检查本身与"什么条件下才检查"是两件事，
 * 所以 `rules[]` 的每一项都是 `{rule, when?}`，**不是**扁平的 `{type,…}`。
 * 本仓一度把它摊平（少一层、写起来省事），代价是 27 份上游定义里每一条规则都报错——
 * 实测 `validateNodeDefinition` 对上游定义放过 0/27。词表的真源是那 27 份数据与
 * `<Xiranite>/packages/node-definitions/src/contract.ts`，省事的一侧让路。
 */
export interface NodeFieldRule {
  rule: NodeRuleBody
  when?: NodeCondition
}

/** 一个输入字段。 */
export interface NodeField {
  id: string
  kind: (typeof NODE_FIELD_KINDS)[number]
  label: LocalizedText
  description?: LocalizedText
  /** 该字段即动作选择器（整个表单按它切换可见性）。 */
  isActionSelector?: boolean
  /** 上游形状是"恰好 text/number/boolean 取一"的对象；裸标量也收（我们早期的写法）。 */
  default?: NodeScalar | string | number | boolean | string[]
  /** 只属于 number 字段（上游 `range belongs to number fields only`）。 */
  range?: { min?: number, max?: number }
  options?: NodeFieldOption[]
  rules?: NodeFieldRule[]
  visible?: NodeCondition
}

/** 表单分组。 */
export interface NodeGroup {
  id: string
  label?: LocalizedText
  fieldIds: string[]
}

/** 字段到执行输入的绑定。 */
export interface NodeInputBinding {
  fieldId: string
  slot: string
  transform?: (typeof TRANSFORMS)[number]
  when?: NodeCondition
}

/**
 * 危险闸门。字段语义对齐 Xiranite contract.ts 的 Rust `DangerGate`：
 * `actionIn` 看 `actionField` 是否落在 `dangerous` 里；`fieldFlag` 看某个布尔字段；
 * `all` / `any` 求 `predicates`；`anyAll` 型条件在闸门上同样以 `clauses`（OR of ANDs）出现；
 * `pluginExport` 由节点模块导出的函数判定；`none` 表示不危险。
 */
export interface NodeDanger {
  type: (typeof DANGER_KINDS)[number]
  actionField?: string
  dangerous?: string[]
  fieldId?: string
  predicates?: NodePredicate[]
  clauses?: NodePredicate[][]
  exportName?: string
}

/** 使用面里的一行：纯串（单语）或 `{zh,en}` 两份都收。 */
export type LocalizedLine = string | LocalizedText

/**
 * 一个使用面块：上游那份的形状（带 `title` / `summary`，每条还能双语）。
 *
 * 为什么契约要收这一形而不是只有下面那份扁平表：聚合 CLI 的渲染器
 * （`packages/cli-runtime/src/help.ts:7-10`）与 `packages/contract/src/index.ts:179`
 * 读的**本来就是块数组**（`workflow.title` / `summary` / `ui` / `cli` / `tips`），
 * 而 node-sdk 这边原先只收"按面分组的 `string[]`"⇒ 同一份上游数据搬进来时，
 * 46 个 title/summary 与 125 条中文要么丢、要么渲染器读不到。两种都收才是并集。
 */
export interface NodeHelpWorkflow {
  title?: LocalizedText
  summary?: LocalizedText
  /** 逐行的数组，或上游那种 `{zh:[],en:[]}` 双语并列——两种都是既有真实数据。 */
  ui?: LocalizedSurface
  cli?: LocalizedSurface
  tips?: LocalizedSurface
}

/** 一个使用面的两种真实形状：行数组，或按语言并列的两份行数组。 */
export type LocalizedSurface =
  | readonly LocalizedLine[]
  | { zh?: readonly LocalizedLine[], en?: readonly LocalizedLine[] }

/** 使用说明，按使用面分组。 */
export interface NodeHelp {
  whenToUse?: LocalizedText
  /** 块数组（上游 / contract / 聚合 CLI 那一形）或扁平表（本仓早先那一形）都合法。 */
  workflows?: readonly NodeHelpWorkflow[] | Partial<Record<(typeof HELP_SURFACES)[number], string[]>>
}

/** 一份节点定义。 */
export interface NodeDefinition {
  definitionVersion: number
  nodeId: string
  title: LocalizedText
  description: LocalizedText
  actions: NodeAction[]
  fields: NodeField[]
  groups: NodeGroup[]
  inputBindings: NodeInputBinding[]
  danger?: NodeDanger
  /** 预览渲染函数导出名（节点模块的具名导出）。 */
  previewExport?: string
  /** 结果视图渲染函数导出名。 */
  resultExport?: string
  reportsProgress?: boolean
  publishesOutputPath?: boolean
  help?: NodeHelp
}

/** 校验结果。 */
export type NodeValidation =
  | { ok: true; value: NodeDefinition }
  | { ok: false; errors: string[] }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLocalized = (value: unknown): value is LocalizedText =>
  isPlainObject(value)
  && Object.keys(value).sort().join(',') === 'en,zh'
  && typeof value.zh === 'string' && (value.zh as string).trim() !== ''
  && typeof value.en === 'string' && (value.en as string).trim() !== ''

const inList = (value: unknown, list: readonly string[]): boolean =>
  typeof value === 'string' && list.includes(value)

/**
 * 顶层结构校验一份节点定义。
 * @param raw - 通常来自节点包的 `xaihi.node`。
 * @returns 归一化定义，或全部结构问题。
 */
export function validateNodeDefinition(raw: unknown): NodeValidation {
  const errors: string[] = []
  if (!isPlainObject(raw)) return { ok: false, errors: ['node definition must be an object'] }
  if (raw.definitionVersion !== NODE_DEFINITION_VERSION) {
    return {
      ok: false,
      errors: [`unsupported definitionVersion: ${String(raw.definitionVersion)} (expected ${NODE_DEFINITION_VERSION})`],
    }
  }
  if (typeof raw.nodeId !== 'string' || raw.nodeId === '') errors.push('nodeId is required')
  if (!isLocalized(raw.title)) errors.push('title must carry both zh and en, neither blank')
  if (!isLocalized(raw.description)) errors.push('description must carry both zh and en, neither blank')

  const fieldIds = new Set<string>()
  const actionIds = new Set<string>()
  for (const [index, action] of (Array.isArray(raw.actions) ? raw.actions : []).entries()) {
    const at = `actions[${index}]`
    if (!isPlainObject(action) || typeof action.id !== 'string' || action.id === '') {
      errors.push(`${at}.id is required`)
      continue
    }
    if (actionIds.has(action.id)) errors.push(`${at}.id duplicates "${action.id}"`)
    actionIds.add(action.id)
    if (!isLocalized(action.label)) errors.push(`${at}.label must carry both zh and en`)
  }

  const fieldArray = Array.isArray(raw.fields) ? raw.fields : []
  if (!Array.isArray(raw.fields)) errors.push('fields must be an array')
  for (const [index, field] of fieldArray.entries()) {
    const at = `fields[${index}]`
    if (!isPlainObject(field) || typeof field.id !== 'string' || field.id === '') {
      errors.push(`${at}.id is required`)
      continue
    }
    if (fieldIds.has(field.id)) errors.push(`${at}.id duplicates "${field.id}"`)
    fieldIds.add(field.id)
    if (!inList(field.kind, NODE_FIELD_KINDS)) {
      errors.push(`${at}.kind ${JSON.stringify(field.kind)} is not in ${NODE_FIELD_KINDS.join(', ')}`)
    }
    if (!isLocalized(field.label)) errors.push(`${at}.label must carry both zh and en`)
    if (field.kind === 'select' && !(Array.isArray(field.options) && field.options.length > 0)) {
      // 上游那条逐字：a select field must offer options。空选项的 select 会渲染出一个选不了的控件。
      errors.push(`${at}: a select field must offer options`)
    }
    if (field.range !== undefined && field.kind !== 'number') {
      errors.push(`${at}: range belongs to number fields only`)
    }
    if (isPlainObject(field.range) && typeof field.range.min === 'number' && typeof field.range.max === 'number' && field.range.min > field.range.max) {
      errors.push(`${at}: range.min ${String(field.range.min)} exceeds range.max ${String(field.range.max)}`)
    }
    if (field.default !== undefined && field.default !== null && typeof field.default === 'object' && !Array.isArray(field.default)) {
      const onlyKey = Object.keys(field.default)[0]
      const expected = field.kind === 'number' ? 'number' : field.kind === 'boolean' ? 'boolean' : 'text'
      if (onlyKey !== undefined && onlyKey !== expected) {
        errors.push(`${at}: default ${onlyKey} does not match kind ${String(field.kind)}`)
      }
    }
    for (const [ruleIndex, rule] of (Array.isArray(field.rules) ? field.rules : []).entries()) {
      const where = `${at}.rules[${ruleIndex}]`
      // 上游 `GuardedRule`：`{rule, when?}`。扁平 `{type}` 在这里必须红，
      // 否则"能读上游定义"这件事只是口号。
      if (!isPlainObject(rule) || !('rule' in rule)) {
        errors.push(`${where} must be a guarded rule object: {rule, when?}`)
        continue
      }
      const body = (rule as { rule?: unknown }).rule
      if (!isPlainObject(body) || !inList(body.type, RULE_KINDS)) {
        errors.push(`${where}.rule.type is not in ${RULE_KINDS.join(', ')}`)
      }
      const guard = (rule as { when?: unknown }).when
      if (guard !== undefined && (!isPlainObject(guard) || !inList(guard.type, CONDITION_KINDS))) {
        errors.push(`${where}.when.type is not in ${CONDITION_KINDS.join(', ')}`)
      }
    }
    if (field.visible !== undefined && !isPlainObject(field.visible)) errors.push(`${at}.visible must be an object`)
    else if (field.visible !== undefined && !inList(field.visible.type, CONDITION_KINDS)) {
      errors.push(`${at}.visible.type is not in ${CONDITION_KINDS.join(', ')}`)
    }
  }

  for (const [index, group] of (Array.isArray(raw.groups) ? raw.groups : []).entries()) {
    const at = `groups[${index}]`
    if (!isPlainObject(group) || !Array.isArray(group.fieldIds)) {
      errors.push(`${at}.fieldIds must be an array`)
      continue
    }
    for (const id of group.fieldIds) {
      if (!fieldIds.has(String(id))) errors.push(`${at}.fieldIds references unknown field "${String(id)}"`)
    }
  }

  for (const [index, binding] of (Array.isArray(raw.inputBindings) ? raw.inputBindings : []).entries()) {
    const at = `inputBindings[${index}]`
    if (!isPlainObject(binding)) {
      errors.push(`${at} must be an object`)
      continue
    }
    if (!fieldIds.has(String(binding.fieldId))) errors.push(`${at}.fieldId references unknown field "${String(binding.fieldId)}"`)
    if (typeof binding.slot !== 'string' || binding.slot === '') errors.push(`${at}.slot is required`)
    if (binding.transform !== undefined && !inList(binding.transform, TRANSFORMS)) {
      errors.push(`${at}.transform is not in ${TRANSFORMS.join(', ')}`)
    }
  }

  if (raw.danger !== undefined) {
    if (!isPlainObject(raw.danger) || !inList(raw.danger.type, DANGER_KINDS)) {
      errors.push(`danger.type must be one of ${DANGER_KINDS.join(', ')} (use {type: "none"} when nothing is dangerous)`)
    }
  }

  if (raw.help !== undefined && !isPlainObject(raw.help)) errors.push('help must be an object')
  if (raw.help !== undefined && isPlainObject(raw.help)) {
    const workflows = (raw.help as { workflows?: unknown }).workflows
    if (workflows !== undefined) {
      const line = (value: unknown, where: string): void => {
        if (typeof value === 'string') return
        if (isPlainObject(value)) {
          const zh = (value as { zh?: unknown }).zh
          const en = (value as { en?: unknown }).en
          if (typeof zh !== 'string' || typeof en !== 'string') {
            errors.push(`help.workflows ${where}: 每个语言都得是非空字符串（{zh,en}），不是串也别是半边`)
          }
          return
        }
        errors.push(`help.workflows ${where}: 只收 string 或 {zh,en}`)
      }
      if (Array.isArray(workflows)) {
        for (const [at, block] of workflows.entries()) {
          if (!isPlainObject(block)) {
            errors.push(`help.workflows[${at}]: 块必须是对象`)
            continue
          }
          const entry = block as Record<string, unknown>
          for (const field of ['title', 'summary'] as const) {
            if (entry[field] !== undefined) line(entry[field], `[${at}].${field}`)
          }
          for (const surface of HELP_SURFACES) {
            const steps = entry[surface]
            if (steps === undefined) continue
            // 面里的值有**两种合法形状**：逐行的数组，或上游那种 `{zh:[],en:[]}` 双语并列。
            // 只收前者会把上游自己的定义判成非法——实测 `check:vocab` 从 27/27 掉到 0/27 就是这么来的
            // （它拿上游定义喂我们的校验器，证的就是"我们的词表装不装得下他们的形状"）。
            const asObject = isPlainObject(steps)
              ? [(steps as { zh?: unknown }).zh, (steps as { en?: unknown }).en]
              : []
            const lists = Array.isArray(steps) ? [steps] : asObject
            if (!Array.isArray(steps) && !isPlainObject(steps)) {
              errors.push(`help.workflows[${at}].${surface} 必须是数组，或 {zh:[],en:[]} 两份`)
              continue
            }
            for (const list of lists) {
              if (!Array.isArray(list)) {
                errors.push(`help.workflows[${at}].${surface} 的 zh/en 两份都必须是数组`)
                continue
              }
              for (const [index, step] of list.entries()) line(step, `[${at}].${surface}[${index}]`)
            }
          }
        }
      } else if (isPlainObject(workflows)) {
        for (const [surface, steps] of Object.entries(workflows as Record<string, unknown>)) {
          if (!HELP_SURFACES.includes(surface as (typeof HELP_SURFACES)[number])) {
            errors.push(`help.workflows 用了不认识的面 "${surface}"（可写的是 ${HELP_SURFACES.join(', ')}）`)
          }
          if (!Array.isArray(steps) || steps.some((step) => typeof step !== 'string')) {
            errors.push(`help.workflows.${surface} 扁平那一形必须是 string[]`)
          }
        }
      } else {
        errors.push('help.workflows 只能是块数组或按面分组的对象')
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: raw as unknown as NodeDefinition }
}
