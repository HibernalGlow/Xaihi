import { describe, expect, test } from "vitest"
import type { MarkuWorkflow } from "@xiranite/node-marku/core"
import { projectWorkflowRunToNodes } from "./workflow-result-projection"
import type { MarkuWorkflowRunDataWithPatches } from "./workflow-result-projection"

const workflow: MarkuWorkflow = {
  id: "wf-projection",
  name: "projection",
  steps: [
    { id: "s1", module: "content_replace", config: {} },
    { id: "s2", module: "markt", config: {} },
  ],
}

// `diff` 是宿主应当返回的统一差异文本（core 的 `createUnifiedDiff(inputText, outputText, "step.md")`
// 形状）。GUI 侧不再自己算，所以夹具按那份文档给；缺字段的行为由下面第二条用例钉住。
const run: MarkuWorkflowRunDataWithPatches = {
  workflowId: workflow.id,
  workflowName: workflow.name,
  stepCount: 2,
  sources: [
    {
      sourceId: "a.md",
      sourceLabel: "a.md",
      originalText: "alpha\nkeep\n",
      outputText: "gamma\nkeep\n",
      steps: [
        {
          stepId: "s1",
          module: "content_replace",
          inputText: "alpha\nkeep\n",
          outputText: "beta\nkeep\n",
          changed: true,
          diff: "--- a/step.md\n+++ b/step.md\n@@ -1,2 +1,2 @@\n-alpha\n+beta\n keep\n",
        },
        {
          stepId: "s2",
          module: "markt",
          inputText: "beta\nkeep\n",
          outputText: "gamma\nkeep\n",
          changed: true,
          diff: "--- a/step.md\n+++ b/step.md\n@@ -1,2 +1,2 @@\n-beta\n+gamma\n keep\n",
        },
      ],
    },
    {
      sourceId: "b.md",
      sourceLabel: "b.md",
      originalText: "same\n",
      outputText: "same\n",
      steps: [
        { stepId: "s1", module: "content_replace", inputText: "same\n", outputText: "same\n", changed: false },
        { stepId: "s2", module: "markt", inputText: "same\n", outputText: "same\n", changed: false, error: "invalid mode" },
      ],
      error: "Step 2 failed",
    },
  ],
}

describe("workflow result graph projection", () => {
  test("renders the host-returned step patch and aggregates source counts onto each step", () => {
    const projection = projectWorkflowRunToNodes(workflow, run, "a.md")
    const first = projection.get("s1")!
    const second = projection.get("s2")!

    expect(first).toMatchObject({ sourceLabel: "a.md", sourceCount: 2, changedSourceCount: 1, errorSourceCount: 0 })
    expect(first.diffLines.map((line) => [line.type, line.content])).toEqual([
      ["delete", "alpha"],
      ["insert", "beta"],
      ["normal", "keep"],
    ])
    expect(second).toMatchObject({ changedSourceCount: 1, errorSourceCount: 1 })
  })

  test("leaves the diff preview empty for a changed step whose patch the host did not return", () => {
    // 宿主文档缺 `MarkuWorkflowStepResult.diff` 时的现读行为：不自己算第二份，只留空预览。
    const withoutPatch: MarkuWorkflowRunDataWithPatches = {
      ...run,
      sources: [{ ...run.sources[0]!, steps: [{ stepId: "s1", module: "content_replace", inputText: "alpha\nkeep\n", outputText: "beta\nkeep\n", changed: true }] }],
    }
    expect(projectWorkflowRunToNodes(workflow, withoutPatch, "a.md").get("s1")?.diffLines).toEqual([])
  })

  test("falls back to the first source and rejects results from another workflow", () => {
    expect(projectWorkflowRunToNodes(workflow, run, "missing").get("s1")?.sourceId).toBe("a.md")
    expect(projectWorkflowRunToNodes(workflow, { ...run, workflowId: "stale" }, "a.md").size).toBe(0)
  })
})
