/**
 * 条件求值器：一份实现同时服务字段可见性与危险闸门。
 *
 * 语义逐条对齐 Xiranite `packages/node-definitions/src/contract.ts`：
 * `single` 带一个 predicate，`all` / `any` 带非空 predicates，`anyAll` 带 clauses
 * （OR of ANDs，扁平列表而非嵌套条件）；`actionIs` 读 `actionField` 与 `allowed`，
 * `fieldEquals` 比对一个 `Scalar`（恰好 text/number/boolean 取一），
 * `fieldFilled` / `fieldTrue` / `numberAtLeast` 各读一个字段。
 *
 * 之所以由 SDK 而不是宿主实现：可见性决定参数表与表单，参数表又决定工具签名，
 * 两处必须同一个真源，否则模型看到的参数和界面看到的字段会分叉。
 *
 * @module xaihi-sdk/conditions
 */

import type { NodeCondition, NodePredicate, NodeScalar, NodeTest } from './node.ts'

/** 一次求值可读的调用参数。 */
export type EvalArgs = Record<string, unknown>

/** 解包 `{text|number|boolean}` 三取一的标量。 */
export function scalarOf(value: NodeScalar | undefined): string | number | boolean | undefined {
  if (value === undefined || typeof value !== 'object') return undefined
  if ('text' in value) return value.text
  if ('number' in value) return value.number
  if ('boolean' in value) return value.boolean
  return undefined
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  return String(value)
}

function filled(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * 求值一个测试。
 * @param test - 条件叶子。
 * @param args - 调用参数。
 * @param actionId - 当前动作（`actionIs` 未给 actionField 时用它）。
 */
export function matchTest(test: NodeTest | undefined, args: EvalArgs, actionId?: string): boolean {
  if (test === undefined) return false
  switch (test.type) {
    case 'always':
      return true
    case 'never':
      return false
    case 'actionIs': {
      const actual = test.actionField === undefined ? actionId : asText(args[test.actionField])
      return (test.allowed ?? []).map((entry) => asText(entry)).includes(actual ?? '')
    }
    case 'fieldEquals':
      return args[test.fieldId ?? ''] === scalarOf(test.value)
    case 'fieldFilled':
      return filled(args[test.fieldId ?? ''])
    case 'fieldTrue':
      return args[test.fieldId ?? ''] === true
    case 'numberAtLeast': {
      const value = args[test.fieldId ?? '']
      const numeric = typeof value === 'number' ? value : Number(asText(value))
      return Number.isFinite(numeric) && numeric >= (test.minimum ?? Number.NEGATIVE_INFINITY)
    }
  }
  return false
}

/** 求值一个 `{test, negated}` 谓词。 */
export function matchPredicate(predicate: NodePredicate | undefined, args: EvalArgs, actionId?: string): boolean {
  if (predicate === undefined) return false
  const result = matchTest(predicate.test, args, actionId)
  return predicate.negated === true ? !result : result
}

/**
 * 求值一个条件；未声明条件视为可见。
 * @param condition - 字段的 `visible` 或闸门的谓词组合。
 * @param args - 调用参数。
 * @param actionId - 当前动作。
 */
export function matchCondition(condition: NodeCondition | undefined, args: EvalArgs, actionId?: string): boolean {
  if (condition === undefined) return true
  switch (condition.type) {
    case 'single':
      return matchPredicate(condition.predicate, args, actionId)
    case 'all':
      return (condition.predicates ?? []).every((predicate) => matchPredicate(predicate, args, actionId))
    case 'any':
      return (condition.predicates ?? []).some((predicate) => matchPredicate(predicate, args, actionId))
    case 'anyAll':
      return (condition.clauses ?? []).some((clause) => clause.every((predicate) => matchPredicate(predicate, args, actionId)))
  }
  return false
}
