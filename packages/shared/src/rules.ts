import { z } from "zod"

export const RULE_TREE_FORMAT = "xiranite-rule-tree/v1" as const

export const ruleValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
])

export const ruleOperatorSchema = z.enum([
  "equal",
  "notEqual",
  "contains",
  "doesNotContain",
  "startsWith",
  "endsWith",
  "in",
  "notIn",
  "lessThan",
  "lessThanInclusive",
  "greaterThan",
  "greaterThanInclusive",
  "isEmpty",
  "isNotEmpty",
])

export const ruleConditionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("condition"),
  field: z.string().min(1),
  operator: ruleOperatorSchema,
  value: ruleValueSchema.optional(),
})

export type RuleValue = z.infer<typeof ruleValueSchema>
export type RuleOperator = z.infer<typeof ruleOperatorSchema>
export type RuleCondition = z.infer<typeof ruleConditionSchema>

export interface RuleGroup {
  id: string
  kind: "group"
  combinator: "all" | "any"
  not: boolean
  children: RuleNode[]
}

export type RuleNode = RuleCondition | RuleGroup

export const ruleGroupSchema: z.ZodType<RuleGroup> = z.lazy(() => z.object({
  id: z.string().min(1),
  kind: z.literal("group"),
  combinator: z.enum(["all", "any"]),
  not: z.boolean(),
  children: z.array(z.union([ruleConditionSchema, ruleGroupSchema])),
}))

export const ruleTreeSchema = z.object({
  format: z.literal(RULE_TREE_FORMAT),
  version: z.literal(1),
  root: ruleGroupSchema,
})

export const ruleEffectSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), ruleValueSchema).default({}),
})

export const rulePolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  priority: z.number().int(),
  when: ruleTreeSchema,
  effects: z.array(ruleEffectSchema),
})

export type RuleTree = z.infer<typeof ruleTreeSchema>
export type RuleEffect = z.infer<typeof ruleEffectSchema>
export interface RulePolicy<Effect extends RuleEffect = RuleEffect> {
  id: string
  name: string
  enabled: boolean
  priority: number
  when: RuleTree
  effects: readonly Effect[]
}

export interface RulePolicyMatch<Effect extends RuleEffect = RuleEffect> {
  policyId: string
  effects: readonly Effect[]
}

export function createRuleTree(children: readonly RuleNode[] = []): RuleTree {
  return {
    format: RULE_TREE_FORMAT,
    version: 1,
    root: { id: createRuleId("group"), kind: "group", combinator: "all", not: false, children: [...children] },
  }
}

let ruleIdSequence = 0

export function createRuleId(prefix = "rule"): string {
  ruleIdSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${ruleIdSequence.toString(36)}`
}
