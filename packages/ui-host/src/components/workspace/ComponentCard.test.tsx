// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ComponentCard } from "./ComponentCard"

const workspaceActions = vi.hoisted(() => ({
  focusComponent: vi.fn(),
  raiseComponent: vi.fn(),
  setCardLayout: vi.fn(),
  setFullscreen: vi.fn(),
  setComponentState: vi.fn(),
  toggleCollapse: vi.fn(),
  toggleComponentVisibility: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => false } }),
}))

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceActions: () => workspaceActions,
  useWorkspaceShallowSelector: (selector: (state: unknown) => unknown) => selector({
    cardClickAction: "none",
    cardDoubleClickAction: "fullscreen",
  }),
}))

vi.mock("@/components/modules/ModuleRenderer", () => ({
  ModuleRenderer: () => (
    <div>
      <button type="button">Configure</button>
      <button type="button">Close</button>
    </div>
  ),
}))

vi.mock("@/components/modules/registry", () => ({ getModule: () => ({ name: "Settings" }) }))
vi.mock("@/hooks/useWindowControls", () => ({ useWindowControls: () => ({ openComponent: vi.fn() }) }))
vi.mock("@/lib/componentSurfaceStatus", () => ({ useComponentSurfaceStatus: () => ({ phase: "idle" }) }))
vi.mock("./ComponentProgressStrip", () => ({ ComponentProgressStrip: () => null }))
vi.mock("./NodeSurfaceChrome", () => ({ NodeSurfaceChrome: () => null }))
vi.mock("./createMoveToViewAction", () => ({ createMoveToViewAction: () => ({ key: "move", label: "Move", icon: null }) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ComponentCard interactions", () => {
  test("does not treat controls within a card as a fullscreen double click", () => {
    render(
      <ComponentCard
        comp={{ id: "settings-card", moduleId: "settings", state: "docked", collapsed: false } as never}
        layout={{ state: "docked", w: 400, h: 300, x: 0, y: 0, z: 1, opacity: 1, scale: 1, interactive: true } as never}
        canvasRef={{ current: null }}
        isFocused={false}
        hasFocused={false}
        cardLayout="grid"
        isLayoutResizing={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Configure" }))
    fireEvent.doubleClick(screen.getByRole("button", { name: "Close" }))

    expect(workspaceActions.setFullscreen).not.toHaveBeenCalled()
  })
})
