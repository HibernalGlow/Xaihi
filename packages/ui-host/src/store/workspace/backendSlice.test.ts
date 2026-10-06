import { afterEach, describe, expect, test } from "vitest"
import { useWorkspaceStore } from "../workspaceStore"

afterEach(() => {
  useWorkspaceStore.setState({ components: [], backendReady: false })
})

describe("workspace backend hydration", () => {
  test("keeps old snapshots in the workspace and restores window-owned components as floating", () => {
    useWorkspaceStore.getState().hydrate(
      [{ id: "ws-default", label: "Default", createdAt: 1, updatedAt: 1 }],
      [],
      [
        { id: "legacy", moduleId: "scratch", workspaceId: "ws-default", createdAt: 1, updatedAt: 1 },
        { id: "windowed", moduleId: "scratch", workspaceId: "ws-default", placement: "window", createdAt: 2, updatedAt: 2 },
      ],
    )

    expect(useWorkspaceStore.getState().components).toMatchObject([
      { id: "legacy", placement: "workspace", state: "docked" },
      { id: "windowed", placement: "window", state: "floating" },
    ])
  })

  test("keeps durable placement in sync when a component moves into or out of a window", () => {
    useWorkspaceStore.getState().hydrate(
      [{ id: "ws-default", label: "Default", createdAt: 1, updatedAt: 1 }],
      [],
      [{ id: "component", moduleId: "scratch", workspaceId: "ws-default", createdAt: 1, updatedAt: 1 }],
    )

    useWorkspaceStore.getState().setComponentState("component", "floating")
    expect(useWorkspaceStore.getState().components[0]).toMatchObject({ placement: "window", state: "floating" })

    useWorkspaceStore.getState().setComponentState("component", "docked")
    expect(useWorkspaceStore.getState().components[0]).toMatchObject({ placement: "workspace", state: "docked" })
  })
})
