import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RULE_TREE_FORMAT, type RuleTree } from "@xiranite/shared/rules"
import { RuleTreeEditor, queryBuilderToRuleTree, ruleTreeToQueryBuilder, type RuleTreeField } from "./RuleTreeEditor"

const fields: RuleTreeField[] = [
  { name: "batch.text", label: "Batch text", type: "text" },
  { name: "image.width", label: "Width", type: "number" },
]

const tree: RuleTree = {
  format: RULE_TREE_FORMAT,
  version: 1,
  root: {
    id: "root",
    kind: "group",
    combinator: "all",
    not: false,
    children: [{ id: "prompt", kind: "condition", field: "batch.text", operator: "contains", value: "uniform" }],
  },
}

afterEach(cleanup)

describe("RuleTreeEditor", () => {
  it("round-trips the stable RuleTree instead of persisting query-builder state", () => {
    expect(queryBuilderToRuleTree(ruleTreeToQueryBuilder(tree), fields)).toEqual(tree)
  })

  it("keeps array-fact contains values scalar", () => {
    const arrayTree = queryBuilderToRuleTree({
      id: "root",
      combinator: "and",
      rules: [{ id: "tag", field: "lora.names", operator: "contains", value: ["style.safetensors"] }],
    }, [{ name: "lora.names", label: "LoRA names", type: "multiselect", options: [{ name: "style.safetensors", label: "Style" }] }])
    expect(arrayTree.root.children[0]).toMatchObject({ value: "style.safetensors" })
  })

  it("renders semantic theme classes and mature query-builder controls", () => {
    const { container } = render(<RuleTreeEditor value={tree} fields={fields} onValueChange={() => {}} />)
    expect(screen.getByTestId("rule-tree-editor").getAttribute("data-theme-surface")).toBe("semantic")
    expect(container.querySelector(".ruleGroup")?.classList.contains("bg-muted/20")).toBe(true)
    expect(container.querySelector("select")).toBeNull()
    expect(container.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(4)
    expect(container.querySelector(".rule-fields")?.getAttribute("data-slot")).toBe("select-trigger")
    expect(screen.getByTitle("Drag to reorder")).toBeTruthy()
  })

  it("emits the shared protocol when a condition is added", () => {
    const onValueChange = vi.fn()
    render(<RuleTreeEditor value={tree} fields={fields} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByTitle("Add condition"))
    expect(onValueChange).toHaveBeenCalledWith(expect.objectContaining({ format: RULE_TREE_FORMAT, version: 1 }))
    expect(onValueChange.mock.calls.at(-1)?.[0].root.children).toHaveLength(2)
  })
})
