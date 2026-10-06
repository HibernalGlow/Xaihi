import { Engine, type TopLevelCondition } from "json-rules-engine"
import {
  ruleTreeSchema,
  type RuleEffect,
  type RuleGroup,
  type RulePolicy,
  type RulePolicyMatch,
  type RuleTree,
} from "./rules.js"

export async function evaluateRuleTree(tree: RuleTree, facts: Readonly<Record<string, unknown>>): Promise<boolean> {
  const parsed = ruleTreeSchema.parse(tree)
  const engine = createRuleEngine()
  engine.addRule({
    name: "xiranite-rule-tree",
    conditions: ruleGroupToEngineCondition(parsed.root),
    event: { type: "xiranite-rule-tree:matched" },
  })
  const result = await engine.run({ ...facts })
  return result.events.some((event) => event.type === "xiranite-rule-tree:matched")
}

export async function evaluateRulePolicies<Effect extends RuleEffect>(
  policies: readonly RulePolicy<Effect>[],
  facts: Readonly<Record<string, unknown>>,
): Promise<readonly RulePolicyMatch<Effect>[]> {
  const enabled = policies
    .filter((policy) => policy.enabled)
    .slice()
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
  const matches: RulePolicyMatch<Effect>[] = []
  for (const policy of enabled) {
    if (await evaluateRuleTree(policy.when, facts)) matches.push({ policyId: policy.id, effects: policy.effects })
  }
  return matches
}

export function ruleTreeToEngineCondition(tree: RuleTree): TopLevelCondition {
  return ruleGroupToEngineCondition(ruleTreeSchema.parse(tree).root)
}

function ruleGroupToEngineCondition(group: RuleGroup): TopLevelCondition {
  const nested = group.children.map((child) => child.kind === "group"
    ? ruleGroupToEngineCondition(child)
    : ({ fact: child.field, operator: child.operator, value: child.value ?? null }))
  const condition = group.combinator === "all" ? { all: nested } : { any: nested }
  return group.not ? { not: condition } : condition
}

function createRuleEngine(): Engine {
  const engine = new Engine([], { allowUndefinedFacts: true })
  engine.addOperator("contains", (fact, expected) => (typeof fact === "string" || Array.isArray(fact)) && fact.includes(expected as never))
  engine.addOperator("doesNotContain", (fact, expected) => (typeof fact === "string" || Array.isArray(fact)) && !fact.includes(expected as never))
  engine.addOperator("in", (fact, expected) => Array.isArray(expected) && expected.includes(fact as never))
  engine.addOperator("notIn", (fact, expected) => Array.isArray(expected) && !expected.includes(fact as never))
  engine.addOperator("startsWith", (fact, expected) => typeof fact === "string" && typeof expected === "string" && fact.startsWith(expected))
  engine.addOperator("endsWith", (fact, expected) => typeof fact === "string" && typeof expected === "string" && fact.endsWith(expected))
  engine.addOperator("isEmpty", (fact) => fact === undefined || fact === null || fact === "" || (Array.isArray(fact) && fact.length === 0))
  engine.addOperator("isNotEmpty", (fact) => !(fact === undefined || fact === null || fact === "" || (Array.isArray(fact) && fact.length === 0)))
  return engine
}
