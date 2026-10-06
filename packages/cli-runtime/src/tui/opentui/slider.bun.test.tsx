/* @jsxImportSource @opentui/react */
import { testRender } from "@opentui/react/test-utils"
import { describe, expect, test } from "bun:test"
import { act, useState } from "react"

import { TerminalSlider } from "./slider.js"

describe("TerminalSlider", () => {
  test("uses the native OpenTUI slider for click and drag changes", async () => {
    const changes: number[] = []
    const setup = await testRender(
      <TerminalSlider id="slider" value={20} min={0} max={100} step={5} width={20} onChange={(value) => changes.push(value)} />,
      { width: 30, height: 3, useMouse: true },
    )
    try {
      await act(async () => setup.renderOnce())
      const slider = setup.renderer.root.findDescendantById("slider")!
      await act(async () => setup.mockMouse.drag(slider.x + 2, slider.y, slider.x + 16, slider.y))
      await act(async () => setup.flush())
      expect(changes.length).toBeGreaterThan(1)
      expect(changes.at(-1)).toBeGreaterThanOrEqual(75)
      expect(changes.every((value) => value % 5 === 0)).toBe(true)
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("supports keyboard steps after receiving focus", async () => {
    const changes: number[] = []
    const setup = await testRender(
      <TerminalSlider id="slider" value={40} min={0} max={100} step={5} width={20} onChange={(value) => changes.push(value)} />,
      { width: 30, height: 3, useMouse: true },
    )
    try {
      await act(async () => setup.renderOnce())
      const slider = setup.renderer.root.findDescendantById("slider")!
      await act(async () => setup.mockMouse.click(slider.x + 8, slider.y))
      changes.length = 0
      await act(async () => setup.mockInput.pressArrow("right"))
      await act(async () => setup.flush())
      expect(changes).toEqual([45])
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("does not report controlled value synchronization as user input", async () => {
    const changes: number[] = []
    let setValue!: (value: number) => void
    function Harness() {
      const [value, updateValue] = useState(20)
      setValue = updateValue
      return <TerminalSlider id="slider" value={value} width={20} onChange={(next) => changes.push(next)} />
    }
    const setup = await testRender(<Harness />, { width: 30, height: 3, useMouse: true })
    try {
      await act(async () => setup.renderOnce())
      await act(async () => setValue(70))
      await act(async () => setup.flush())
      expect(changes).toEqual([])
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })
})
