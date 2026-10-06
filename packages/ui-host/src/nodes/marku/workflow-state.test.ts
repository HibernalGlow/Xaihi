import { describe, expect, test } from "vitest"
import type { MarkuWorkflow, MarkuWorkflowLibrary } from "@xiranite/node-marku/core"
import {
  activateWorkflow,
  addWorkflowStep,
  duplicateWorkflowInLibrary,
  duplicateWorkflowStep,
  enterWorkflowMode,
  ensureStepSelection,
  exitWorkflowMode,
  moveWorkflowStep,
  projectWorkflowGraph,
  removeWorkflowFromLibrary,
  removeWorkflowStep,
  stateAfterActiveWorkflowDeleted,
  stepIndexForDragPosition,
  updateWorkflowStepConfig,
  upsertWorkflowInLibrary,
  WORKFLOW_NODE_GAP_X,
  WORKFLOW_NODE_Y,
} from "./workflow-state"

const emptyLibrary: MarkuWorkflowLibrary = { schemaVersion: 1, workflows: [] }

function sampleWorkflow(): MarkuWorkflow {
  return {
    id: "wf-1",
    name: "清理",
    steps: [
      { id: "s1", module: "markt", config: { mode: "h2l" } },
      { id: "s2", module: "content_dedup", config: {} },
      { id: "s3", module: "content_replace", config: { patterns: [{ from: "a", to: "b" }] } },
    ],
  }
}

describe("mode transitions", () => {
  test("entering workflow mode without a draft creates a one-step draft from the normal module", () => {
    const patch = enterWorkflowMode({}, emptyLibrary, { module: "content_dedup", config: { level: 2 } })

    expect(patch.mode).toBe("workflow")
    expect(patch.workflowDraft?.steps).toHaveLength(1)
    expect(patch.workflowDraft?.steps[0]).toMatchObject({ module: "content_dedup", config: { level: 2 } })
    expect(patch.selectedWorkflowStepId).toBe(patch.workflowDraft?.steps[0]?.id)
    expect(patch.activeWorkflowId).toBe("")
  })

  test("entering workflow mode keeps an existing draft and repairs a stale selection", () => {
    const draft = sampleWorkflow()
    const patch = enterWorkflowMode({ workflowDraft: draft, selectedWorkflowStepId: "missing" }, emptyLibrary, { module: "markt", config: {} })

    expect(patch.workflowDraft).toBeUndefined()
    expect(patch.selectedWorkflowStepId).toBe("s1")
  })

  test("entering workflow mode loads the active library workflow as an isolated copy", () => {
    const library: MarkuWorkflowLibrary = { schemaVersion: 1, workflows: [sampleWorkflow()] }
    const patch = enterWorkflowMode({ activeWorkflowId: "wf-1" }, library, { module: "markt", config: {} })

    expect(patch.workflowDraft?.id).toBe("wf-1")
    patch.workflowDraft!.steps[0]!.config.mode = "mutated"
    expect(library.workflows[0]!.steps[0]!.config.mode).toBe("h2l")
  })

  test("exiting workflow mode only flips the mode", () => {
    expect(exitWorkflowMode()).toEqual({ mode: "normal" })
  })

  test("deleting the active workflow never leaves a dangling selection", () => {
    const patch = stateAfterActiveWorkflowDeleted({ module: "markt", config: {} })

    expect(patch.activeWorkflowId).toBe("")
    expect(patch.workflowDraft?.steps).toHaveLength(1)
    expect(patch.selectedWorkflowStepId).toBe(patch.workflowDraft?.steps[0]?.id)
    expect(patch.workflowRun).toBeNull()
  })
})

describe("step transitions", () => {
  test("add, duplicate, and remove keep declaration order and unique ids", () => {
    const added = addWorkflowStep(sampleWorkflow(), "t2list")
    expect(added.workflow.steps.map((step) => step.module)).toEqual(["markt", "content_dedup", "content_replace", "t2list"])

    const duplicated = duplicateWorkflowStep(added.workflow, "s2")!
    expect(duplicated.workflow.steps).toHaveLength(5)
    expect(duplicated.workflow.steps[2]).toMatchObject({ module: "content_dedup" })
    expect(duplicated.workflow.steps[2]?.id).not.toBe("s2")

    const removed = removeWorkflowStep(duplicated.workflow, "s1")
    expect(removed.steps.some((step) => step.id === "s1")).toBe(false)
  })

  test("move clamps the target index and reorders steps", () => {
    const moved = moveWorkflowStep(sampleWorkflow(), "s3", 0)
    expect(moved.steps.map((step) => step.id)).toEqual(["s3", "s1", "s2"])

    const clamped = moveWorkflowStep(sampleWorkflow(), "s1", 99)
    expect(clamped.steps.map((step) => step.id)).toEqual(["s2", "s3", "s1"])
  })

  test("config update snapshots the value instead of sharing the reference", () => {
    const config = { patterns: [{ from: "x", to: "y" }] }
    const updated = updateWorkflowStepConfig(sampleWorkflow(), "s1", config)
    config.patterns[0]!.to = "mutated"

    expect(updated.steps[0]?.config).toEqual({ patterns: [{ from: "x", to: "y" }] })
  })

  test("ensureStepSelection falls back to the first step", () => {
    expect(ensureStepSelection(sampleWorkflow(), "s2")).toBe("s2")
    expect(ensureStepSelection(sampleWorkflow(), "ghost")).toBe("s1")
    expect(ensureStepSelection({ id: "wf", name: "", steps: [] }, "s1")).toBeUndefined()
  })
})

describe("library transitions", () => {
  test("upsert inserts then replaces by id", () => {
    const inserted = upsertWorkflowInLibrary(emptyLibrary, sampleWorkflow())
    expect(inserted.workflows).toHaveLength(1)

    const renamed = upsertWorkflowInLibrary(inserted, { ...sampleWorkflow(), name: "改名" })
    expect(renamed.workflows).toHaveLength(1)
    expect(renamed.workflows[0]?.name).toBe("改名")
  })

  test("duplicate creates an independent copy with a new id", () => {
    const library = upsertWorkflowInLibrary(emptyLibrary, sampleWorkflow())
    const result = duplicateWorkflowInLibrary(library, "wf-1")!

    expect(result.library.workflows).toHaveLength(2)
    expect(result.workflow.id).not.toBe("wf-1")
    expect(result.workflow.name).toBe("清理 副本")
    result.workflow.steps[0]!.config.mode = "mutated"
    expect(result.library.workflows[0]!.steps[0]!.config.mode).toBe("h2l")
  })

  test("remove drops the workflow and activate rejects unknown ids", () => {
    const library = upsertWorkflowInLibrary(emptyLibrary, sampleWorkflow())
    expect(removeWorkflowFromLibrary(library, "wf-1").workflows).toHaveLength(0)
    expect(activateWorkflow(library, "ghost")).toBeNull()

    const activated = activateWorkflow(library, "wf-1")!
    expect(activated.activeWorkflowId).toBe("wf-1")
    expect(activated.selectedWorkflowStepId).toBe("s1")
  })
})

describe("graph projection", () => {
  test("projects a linear chain with derived positions and n-1 edges", () => {
    const { nodes, edges } = projectWorkflowGraph(sampleWorkflow(), "s2")

    expect(nodes.map((node) => node.id)).toEqual(["s1", "s2", "s3"])
    expect(nodes[1]).toMatchObject({ selected: true, position: { x: WORKFLOW_NODE_GAP_X, y: WORKFLOW_NODE_Y } })
    expect(edges).toEqual([
      { id: "s1->s2", source: "s1", target: "s2" },
      { id: "s2->s3", source: "s2", target: "s3" },
    ])
  })

  test("drag position maps back to a clamped step index", () => {
    expect(stepIndexForDragPosition(-500, 3)).toBe(0)
    expect(stepIndexForDragPosition(WORKFLOW_NODE_GAP_X * 1.4, 3)).toBe(1)
    expect(stepIndexForDragPosition(WORKFLOW_NODE_GAP_X * 9, 3)).toBe(2)
    expect(stepIndexForDragPosition(100, 0)).toBe(0)
  })
})
