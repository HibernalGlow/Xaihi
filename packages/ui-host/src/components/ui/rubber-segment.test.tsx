// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { RubberSegment, type RubberSegmentProps } from "./rubber-segment"

// happy-dom does not ship ResizeObserver; the component only uses it to re-measure on layout change.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver

afterEach(cleanup)

const ITEMS = ["扫描", "预演", "执行"]

function setup(props: Partial<RubberSegmentProps> = {}) {
  const merged: RubberSegmentProps = {
    items: ITEMS,
    defaultValue: ITEMS[1],
    "aria-label": "运行模式",
    ...props,
  }
  return render(<RubberSegment {...merged} />)
}

describe("shared RubberSegment", () => {
  test("drives every colour through a design token so override-type skins restyle it for free", () => {
    setup()

    const style = screen.getByRole("radiogroup", { name: "运行模式" }).getAttribute("style") ?? ""

    expect(style).toContain("--rs-track: var(--muted)")
    expect(style).toContain("--rs-thumb: var(--background)")
    expect(style).toContain("--rs-ink: var(--muted-foreground)")
    expect(style).toContain("--rs-ink-active: var(--foreground)")
  })

  test("an explicit colour still wins over the token default", () => {
    setup({ trackColor: "#123456" })

    const style = screen.getByRole("radiogroup", { name: "运行模式" }).getAttribute("style") ?? ""
    expect(style).toContain("--rs-track: #123456")
    expect(style).not.toContain("--rs-track: var(--muted)")
  })

  test("keeps the radiogroup contract: selection follows value and arrow keys move it", () => {
    const calls: string[] = []
    setup({ value: ITEMS[1], onChange: value => calls.push(value) })

    const buttons = screen.getAllByRole("radio")
    expect(buttons).toHaveLength(ITEMS.length)
    expect(buttons[1].getAttribute("aria-checked")).toBe("true")
    expect(buttons[1].tabIndex).toBe(0)
    expect(buttons[0].tabIndex).toBe(-1)

    fireEvent.keyDown(buttons[1], { key: "ArrowRight" })
    expect(calls).toEqual([ITEMS[2]])
  })

  test("a tap on another slot commits it exactly once, even though the browser also fires click", () => {
    const calls: string[] = []
    setup({ value: ITEMS[0], onChange: value => calls.push(value) })

    const target = screen.getAllByRole("radio")[2]
    fireEvent.pointerDown(target, { clientX: 0, button: 0, pointerId: 1 })
    fireEvent.pointerUp(target, { clientX: 0, pointerId: 1 })
    fireEvent.click(target)

    expect(calls).toEqual([ITEMS[2]])
  })

  test("keyboard / assistive-tech activation reaches onChange through the click path", () => {
    const calls: string[] = []
    setup({ value: ITEMS[0], onChange: value => calls.push(value) })

    fireEvent.click(screen.getAllByRole("radio")[1])
    expect(calls).toEqual([ITEMS[1]])
  })

  test("disabled state is exposed and blocks interaction", () => {
    const calls: string[] = []
    setup({ disabled: true, value: ITEMS[0], onChange: value => calls.push(value) })

    expect(screen.getByRole("radiogroup", { name: "运行模式" }).getAttribute("aria-disabled")).toBe("true")
    expect(screen.getAllByRole("radio")[1].hasAttribute("disabled")).toBe(true)

    const target = screen.getAllByRole("radio")[2]
    fireEvent.pointerDown(target, { clientX: 0, button: 0, pointerId: 1 })
    fireEvent.pointerUp(target, { clientX: 0, pointerId: 1 })
    expect(calls).toEqual([])
  })
})
