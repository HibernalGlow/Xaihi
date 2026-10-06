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
/** help 面向的使用面。 */
export const HELP_SURFACES = ['ui', 'cli', 'tips'] as const

/** 标量：`{text}` / `{number}` / `{boolean}` 三者恰好取一。 */
export type NodeScalar = { text: string } | { number: number } | { boolean: boolean }

/** 条件树的一个叶子。 */
export interface NodePredicate {
  test: Record<string, unknown> & { type: (typeof TEST_KINDS)[number] }
  negated: boolean
}

/** 可见性等条件；`single` 带 predicate，`all`/`any` 带非空 predicates，`anyAll` 带 clauses。 */
export interface NodeCondition {
  type: (typeof CONDITION_KINDS)[number]
  predicate?: NodePredicate
  predicates?: NodePredicate[]
  clauses?: unknown[]
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

/** 一条参数校验规则。 */
export interface NodeFieldRule {
  type: (typeof RULE_KINDS)[number]
  value?: unknown
  minimum?: number
  maximum?: number
}

/** 一个输入字段。 */
export interface NodeField {
  id: string
  kind: (typeof NODE_FIELD_KINDS)[number]
  label: LocalizedText
  description?: LocalizedText
  /** 该字段即动作选择器（整个表单按它切换可见性）。 */
  isActionSelector?: boolean
  default?: string | number | boolean | string[]
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

/** 危险闸门：v1 只声明"由谁判定"，判定本身在节点代码或 DSH 审批里。 */
export interface NodeDanger {
  type: (typeof DANGER_KINDS)[number]
  actionField?: string
  actions?: string[]
  fieldId?: string
  exportName?: string
}

/** 使用说明，按使用面分组。 */
export interface NodeHelp {
  whenToUse?: LocalizedText
  workflows?: Partial<Record<(typeof HELP_SURFACES)[number], string[]>>
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
    for (const [ruleIndex, rule] of (Array.isArray(field.rules) ? field.rules : []).entries()) {
      if (!isPlainObject(rule) || !inList(rule.type, RULE_KINDS)) {
        errors.push(`${at}.rules[${ruleIndex}].type is not in ${RULE_KINDS.join(', ')}`)
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

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: raw as unknown as NodeDefinition }
}
