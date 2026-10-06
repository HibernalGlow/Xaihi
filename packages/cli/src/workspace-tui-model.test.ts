import { describe, expect, test } from "vitest"
import type { WorkspaceSnapshotDTO } from "@xiranite/shared"
import { deployNode, patchNodeLayout, projectTerminalLayout, removeNode } from "./workspace-tui-model.js"

const empty: WorkspaceSnapshotDTO = {
  workspaces: [{ id: "ws", label: "Workspace", createdAt: 1, updatedAt: 1 }],
  lanes: [],
  components: [],
}

describe("Xiranite TUI shared workspace model", () => {
  test("deploys, moves, resizes, projects, and removes using the Web bento layout schema", () => {
    const deployed = deployNode(empty, "ws", "sleept", 100)
    const changed = patchNodeLayout(deployed.snapshot, deployed.componentId, { x: 11, y: 3, w: 6, h: 7 }, 110)
    const component = changed.components[0]!
    expect(component.bentoLayout).toEqual({ x: 6, y: 3, w: 6, h: 7 })
    expect(projectTerminalLayout(changed.components, 72)[0]).toMatchObject({ moduleId: "sleept", terminalWidth: 36, terminalHeight: 7 })
    expect(removeNode(changed, deployed.componentId).components).toEqual([])
  })
})
