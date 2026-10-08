// @vitest-environment happy-dom
import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { createDefaultKisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout"
import { createDefaultKisakiFloatingPanel } from "@hibernalglow/xaihi-kisaki/floating-panel"
import { KisakiFloatingAnalysisPanel } from "./floating-analysis-panel"

afterEach(cleanup)

describe("KisakiFloatingAnalysisPanel", () => {
  test("moves, resizes, closes, and remains inside the node viewport", () => {
    render(<Harness />)
    const panel = screen.getByTestId("czkawka-floating-analysis")
    const handle = screen.getByLabelText("移动浮动分析面板")
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -5000, clientY: -5000 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(panel.style.left).toBe("8px")
    expect(panel.style.top).toBe("8px")

    const resize = screen.getByRole("separator", { name: "从se方向调整浮动分析面板" })
    fireEvent.pointerDown(resize, { pointerId: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(resize, { pointerId: 2, clientX: 5000, clientY: 5000 })
    fireEvent.pointerUp(resize, { pointerId: 2 })
    expect(Number.parseFloat(panel.style.left) + Number.parseFloat(panel.style.width)).toBeLessThanOrEqual(992)
    expect(Number.parseFloat(panel.style.top) + Number.parseFloat(panel.style.height)).toBeLessThanOrEqual(692)

    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true })
    expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8)
    fireEvent.click(screen.getByRole("button", { name: "关闭浮动分析面板" }))
    expect(screen.queryByTestId("czkawka-floating-analysis")).toBeNull()
  })
})

function Harness() {
  const viewport = { width: 1000, height: 700 }
  const [state, setState] = useState(() => ({ ...createDefaultKisakiFloatingPanel(viewport), open: true }))
  const [layout, setLayout] = useState(createDefaultKisakiCardLayout)
  return <div className="relative"><KisakiFloatingAnalysisPanel state={state} viewport={viewport} layout={layout} onStateChange={setState} onLayoutChange={setLayout} renderCard={(id) => <span>{id}</span>} /></div>
}
