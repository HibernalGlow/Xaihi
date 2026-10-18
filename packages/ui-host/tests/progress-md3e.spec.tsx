// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Progress } from "../src/components/ui/progress"

afterEach(cleanup)

describe("Progress Material 3 Expressive Specification", () => {
  test("renders standard normal progress indicator with custom percentage", () => {
    render(<Progress value={45} label="Task Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Task Progress" })
    expect(progress.getAttribute("aria-valuenow")).toBe("45")
    expect(progress.getAttribute("data-variant")).toBe("normal")
    const indicator = progress.querySelector('[data-slot="progress-indicator"]')
    expect(indicator).not.toBeNull()
  })

  test("renders MD3E Wavy progress style with SVG sine wave and flow animation", () => {
    render(<Progress variant="wavy" value={60} label="Wavy Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Wavy Progress" })
    expect(progress.getAttribute("data-variant")).toBe("wavy")
    const svg = progress.querySelector("svg")
    expect(svg).not.toBeNull()
    const path = svg?.querySelector("path")
    expect(path).not.toBeNull()
    expect(path?.getAttribute("d")).toContain("Q 8 2, 16 8")
  })

  test("renders Gradient progress style with flowing gradient class", () => {
    render(<Progress variant="gradient" value={75} label="Gradient Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Gradient Progress" })
    expect(progress.getAttribute("data-variant")).toBe("gradient")
    const indicator = progress.querySelector('[data-slot="progress-indicator"]')
    expect(indicator?.className).toContain("bg-gradient-to-r")
  })

  test("renders Segmented progress style with discrete blocks", () => {
    render(<Progress variant="segmented" segments={10} value={50} label="Segmented Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Segmented Progress" })
    expect(progress.getAttribute("data-variant")).toBe("segmented")
    const segments = progress.querySelectorAll('[data-slot="progress-segment"]')
    expect(segments.length).toBe(10)
    // 50% 下大约前 5 个段为激活状态
    const activeSegments = progress.querySelectorAll('[data-slot="progress-segment"][data-active="true"]')
    expect(activeSegments.length).toBeGreaterThanOrEqual(4)
  })

  test("renders Dots progress style with discrete pulse dots", () => {
    render(<Progress variant="dots" segments={8} value={60} label="Dots Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Dots Progress" })
    expect(progress.getAttribute("data-variant")).toBe("dots")
    const dots = progress.querySelectorAll('[data-slot="progress-dot"]')
    expect(dots.length).toBe(8)
  })

  test("renders expressive Thumb indicator with custom shape clipPath", () => {
    render(<Progress value={70} showThumb thumbStyle="cookie" label="Thumb Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Thumb Progress" })
    const thumb = progress.querySelector('[data-slot="progress-thumb"]')
    expect(thumb).not.toBeNull()
    expect(thumb?.getAttribute("data-thumb-style")).toBe("cookie")
    expect(thumb?.getAttribute("style")).toContain("clip-path")
    expect(thumb?.getAttribute("style")).toContain("left: 70%")
  })

  test("supports semantic tones", () => {
    render(<Progress tone="destructive" value={30} label="Error Progress" />)
    const progress = screen.getByRole("progressbar", { name: "Error Progress" })
    expect(progress.getAttribute("data-tone")).toBe("destructive")
  })
})
