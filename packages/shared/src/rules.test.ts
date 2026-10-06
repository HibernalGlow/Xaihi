import { describe, expect, it } from "vitest"
import {
  RULE_TREE_FORMAT,
  createRuleTree,
  ruleTreeSchema,
  type RuleTree,
} from "./rules.js"

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

describe("RuleTree", () => {
  it("validates the framework-neutral persisted shape", () => {
    expect(ruleTreeSchema.parse(complexTree)).toEqual(complexTree)
    expect(createRuleTree()).toMatchObject({ format: RULE_TREE_FORMAT, version: 1, root: { combinator: "all", children: [] } })
  })

})
