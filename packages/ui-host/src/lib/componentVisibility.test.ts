import { describe, expect, test } from "vitest"
import type { ComponentInstance, ViewMode } from "@/types/workspace"
import { isComponentVisibleInView } from "./componentVisibility"

const COMPONENT_VIEW_MODES: ViewMode[] = ["cards", "dockview", "flow", "lane", "bento"]

function createComponent(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
  return {
    id: "component-1",
    moduleId: "scratch",
    state: "docked",
    position: { x: 0, y: 0 },
    size: { w: 320, h: 240 },
    z: 1,
    collapsed: false,
    workspaceId: "workspace-1",
    flowPosition: { x: 0, y: 0 },
    flowSize: { width: 320, height: 240 },
    dockPanel: "default",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("isComponentVisibleInView", () => {
  test.each(COMPONENT_VIEW_MODES)("keeps floating components out of the %s view", (viewMode) => {
    const component = createComponent({
      state: "floating",
      hiddenIn: { [viewMode]: false },
    })

    expect(isComponentVisibleInView(component, viewMode)).toBe(false)
  })

  test("preserves opt-out visibility for embedded views", () => {
    const component = createComponent()

    expect(isComponentVisibleInView(component, "cards")).toBe(true)
    expect(isComponentVisibleInView(component, "dockview")).toBe(true)
    expect(isComponentVisibleInView(createComponent({ hiddenIn: { cards: true } }), "cards")).toBe(false)
  })

  test("preserves opt-in visibility for the flow view", () => {
    expect(isComponentVisibleInView(createComponent(), "flow")).toBe(false)
    expect(isComponentVisibleInView(createComponent({ hiddenIn: { flow: false } }), "flow")).toBe(true)
  })
})
