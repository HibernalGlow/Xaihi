import { describe, expect, test, vi } from "vitest"
import { createSurfaceCommonActions } from "./createSurfaceCommonActions"

const translate = (key: string) => key

function createActions(currentMode: "cards" | "dockview" | "bento" | "flow" | "lane") {
  const workspaceActions = {
    patchComponentData: vi.fn(),
    setComponentState: vi.fn(),
    setComponentVisibility: vi.fn(),
    setViewMode: vi.fn(),
  }
  const openComponent = vi.fn().mockResolvedValue({ success: true, supported: true, message: "Opened" })
  const actions = createSurfaceCommonActions({
    componentId: "component-1",
    currentMode,
    height: 480,
    moduleId: "settings",
    moduleName: "Settings",
    openComponent,
    t: translate as never,
    width: 640,
    workspaceActions: workspaceActions as never,
  })
  return { actions, openComponent, workspaceActions }
}

describe("createSurfaceCommonActions", () => {
  test.each(["cards", "dockview", "bento", "flow", "lane"] as const)("keeps the common toolbar actions in %s", (currentMode) => {
    const { actions } = createActions(currentMode)

    expect(actions.map((action) => action.key)).toEqual(["float", "moveToView", "hide"])
  })

  test("opens a floating window and marks the component as floating", async () => {
    const { actions, openComponent, workspaceActions } = createActions("flow")

    actions[0].onClick?.({} as never)
    await vi.waitFor(() => expect(workspaceActions.setComponentState).toHaveBeenCalledWith("component-1", "floating"))

    expect(openComponent).toHaveBeenCalledWith({
      componentId: "component-1",
      moduleId: "settings",
      title: "Settings",
      width: 640,
      height: 480,
    })
  })

  test("hides only the current view", () => {
    const { actions, workspaceActions } = createActions("lane")

    actions[2].onClick?.({} as never)

    expect(workspaceActions.setComponentVisibility).toHaveBeenCalledWith("component-1", "lane", false)
  })
})
