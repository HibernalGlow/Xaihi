// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { useMd3eActive } from "@/nodes/shared/controls"

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ uiFace: "legacy" })
  delete document.documentElement.dataset.uiFace
})

function TestConsumer() {
  const md3e = useMd3eActive()
  return (
    <div>
      <span data-testid="face-status">{md3e ? "md3e" : "legacy"}</span>
      <button
        data-testid="toggle-face"
        onClick={() => {
          useWorkspaceStore.getState().setUiFace(md3e ? "legacy" : "md3e")
        }}
      >
        Toggle
      </button>
    </div>
  )
}

describe("Kisaki & Findz MD3E Dual-Mode Switch Regression Suite", () => {
  it("defaults to legacy mode when uiFace is unset or set to legacy", () => {
    useWorkspaceStore.setState({ uiFace: "legacy" })
    render(<TestConsumer />)
    expect(screen.getByTestId("face-status").textContent).toBe("legacy")
  })

  it("activates MD3E mode when store uiFace is set to md3e", () => {
    useWorkspaceStore.setState({ uiFace: "md3e" })
    render(<TestConsumer />)
    expect(screen.getByTestId("face-status").textContent).toBe("md3e")
  })

  it("falls back to document.documentElement.dataset.uiFace if store uiFace is undefined", () => {
    useWorkspaceStore.setState({ uiFace: undefined as unknown as "legacy" })
    document.documentElement.dataset.uiFace = "md3e"
    render(<TestConsumer />)
    expect(screen.getByTestId("face-status").textContent).toBe("md3e")
  })

  it("toggles seamlessly between legacy and md3e faces", () => {
    useWorkspaceStore.setState({ uiFace: "legacy" })
    render(<TestConsumer />)
    expect(screen.getByTestId("face-status").textContent).toBe("legacy")

    fireEvent.click(screen.getByTestId("toggle-face"))
    expect(screen.getByTestId("face-status").textContent).toBe("md3e")

    fireEvent.click(screen.getByTestId("toggle-face"))
    expect(screen.getByTestId("face-status").textContent).toBe("legacy")
  })
})
