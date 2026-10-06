import { describe, expect, it } from "vitest"
import { RULE_TREE_FORMAT, createRuleTree, type RuleEffect, type RulePolicy, type RuleTree } from "./rules.js"
import { evaluateRulePolicies, evaluateRuleTree } from "./rules-engine.js"

const complexTree: RuleTree = {
  format: RULE_TREE_FORMAT,
  version: 1,
  root: {
    id: "root",
    kind: "group",
    combinator: "all",
    not: false,
    children: [
      { id: "prompt", kind: "condition", field: "batch.text", operator: "contains", value: "school uniform" },
      {
        id: "model-or-size",
        kind: "group",
        combinator: "any",
        not: false,
        children: [
          { id: "model", kind: "condition", field: "model.unet", operator: "endsWith", value: "anima.safetensors" },
          { id: "width", kind: "condition", field: "image.width", operator: "greaterThanInclusive", value: 1536 },
        ],
      },
    ],
  },
}

describe("RuleTree engine", () => {
  it("evaluates nested conditions with json-rules-engine", async () => {
    await expect(evaluateRuleTree(complexTree, {
      "batch.text": "1girl, school uniform, outdoors",
      "model.unet": "models/anima.safetensors",
      "image.width": 1024,
    })).resolves.toBe(true)
    await expect(evaluateRuleTree(complexTree, {
      "batch.text": "1girl, dress",
      "model.unet": "models/anima.safetensors",
      "image.width": 2048,
    })).resolves.toBe(false)
  })

  it("supports negation and empty-value operators", async () => {
    const tree: RuleTree = {
      format: RULE_TREE_FORMAT,
      version: 1,
      root: {
        id: "root",
        kind: "group",
        combinator: "all",
        not: true,
        children: [{ id: "tags", kind: "condition", field: "lora.tags", operator: "isEmpty" }],
      },
    }
    await expect(evaluateRuleTree(tree, { "lora.tags": ["style"] })).resolves.toBe(true)
  })

  it("returns enabled policy effects in deterministic priority order", async () => {
    type TestEffect = RuleEffect & { type: "test.enable" }
    const policies: RulePolicy<TestEffect>[] = [
      { id: "low", name: "Low", enabled: true, priority: 1, when: createRuleTree(), effects: [{ type: "test.enable", payload: { value: "low" } }] },
      { id: "off", name: "Disabled", enabled: false, priority: 100, when: createRuleTree(), effects: [{ type: "test.enable", payload: {} }] },
      { id: "high", name: "High", enabled: true, priority: 10, when: createRuleTree(), effects: [{ type: "test.enable", payload: { value: "high" } }] },
    ]
    await expect(evaluateRulePolicies(policies, {})).resolves.toEqual([
      { policyId: "high", effects: [{ type: "test.enable", payload: { value: "high" } }] },
      { policyId: "low", effects: [{ type: "test.enable", payload: { value: "low" } }] },
    ])
  })
})
