// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NodeSurfaceChrome } from "./NodeSurfaceChrome"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      key === "registry:help.open" ? `Open ${options?.name ?? "node"} help` : key,
  }),
}))

const chromeAppearance = vi.hoisted(() => ({
  visible: true,
  position: "right" as "right" | "island",
  style: "pill",
  islandScale: 100,
  islandMotion: 100,
  islandDelay: 0,
  islandIdleOffset: 0,
  actionOrder: ["node-help", "collapse", "focus", "fullscreen", "float", "moveToView", "keepAliveOnViewSwitch", "hide"],
  hiddenActions: [] as string[],
}))

vi.mock("@/components/workspace/useChromeAppearance", () => ({
  useChromeAppearance: () => chromeAppearance,
}))

vi.mock("@/components/help/nodeHelpRegistry", () => ({
  hasNodeHelp: (moduleId?: string) => Boolean(moduleId),
}))

vi.mock("@/components/help/NodeHelpSheet", () => ({
  NodeHelpSheet: ({ open, moduleId }: { open: boolean; moduleId: string | null }) =>
    open ? <div role="dialog">Help for {moduleId}</div> : null,
}))

afterEach(() => {
  cleanup()
  chromeAppearance.position = "right"
  chromeAppearance.actionOrder = ["node-help", "collapse", "focus", "fullscreen", "float", "moveToView", "keepAliveOnViewSwitch", "hide"]
  chromeAppearance.hiddenActions = []
})

describe("NodeSurfaceChrome help action", () => {
  test("opens the shared help sheet from the node operation chrome", async () => {
    render(
      <div className="group">
        <NodeSurfaceChrome actions={[]} moduleId="classq" moduleName="ClassQ" version="0.1.0" />
      </div>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Open ClassQ help" }))

    expect((await screen.findByRole("dialog")).textContent).toContain("classq")
  })

  test("does not add an unavailable help action", () => {
    render(
      <div className="group">
        <NodeSurfaceChrome actions={[]} moduleName="Unknown" />
      </div>,
    )

    expect(screen.queryByRole("button", { name: "Open Unknown help" })).toBeNull()
  })

  test("removes the container border while the dynamic island is collapsed", () => {
    chromeAppearance.position = "island"
    render(<NodeSurfaceChrome actions={[]} moduleName="Unknown" />)

    const toolbar = screen.getByRole("toolbar", { name: "Node operation island" })
    expect(toolbar.classList.contains("border")).toBe(false)
    expect(toolbar.classList.contains("border-0")).toBe(true)

    fireEvent.pointerEnter(toolbar.parentElement!)

    expect(toolbar.classList.contains("border")).toBe(true)
  })

  test("applies shared action order and visibility preferences", () => {
    chromeAppearance.actionOrder = ["hide", "collapse"]
    chromeAppearance.hiddenActions = ["collapse"]
    render(
      <div className="group">
        <NodeSurfaceChrome
          actions={[
            { key: "collapse", label: "Collapse", icon: <span /> },
            { key: "hide", label: "Hide", icon: <span /> },
            { key: "custom", label: "Custom", icon: <span /> },
          ]}
          moduleName="Unknown"
        />
      </div>,
    )

    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull()
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("data-action-key"))).toEqual(["hide", "custom"])
  })
})
