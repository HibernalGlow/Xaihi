// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SwimlaneInteractionSettings } from "./SwimlaneInteractionSettings"

describe("SwimlaneInteractionSettings", () => {
  it("emits storage-agnostic interaction patches", () => {
    const onChange = vi.fn()
    render(<SwimlaneInteractionSettings value={{ soloOnFocus: false, showNavigatorInSolo: true, edgeRevealDelayMs: 250, focusOnHover: true, focusDelayMs: 650 }} onChange={onChange} />)
    expect(screen.getByText("泳道焦点与独占")).toBeTruthy()
    fireEvent.click(screen.getByRole("switch", { name: "主泳道聚焦时自动独占" }))
    fireEvent.change(screen.getByRole("spinbutton", { name: "左右泳道展开延迟" }), { target: { value: "420" } })
    fireEvent.blur(screen.getByRole("spinbutton", { name: "左右泳道展开延迟" }))
    expect(onChange).toHaveBeenCalledWith({ soloOnFocus: true })
    expect(onChange).toHaveBeenCalledWith({ edgeRevealDelayMs: 420 })
    expect(screen.getByRole("switch", { name: "启用主泳道悬停重新聚焦" })).toBeTruthy()
    expect(screen.getByRole("spinbutton", { name: "主泳道悬停重新聚焦延迟" })).toBeTruthy()
  })
})
