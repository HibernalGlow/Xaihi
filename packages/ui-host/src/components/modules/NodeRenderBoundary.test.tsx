// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NodeRenderBoundary } from "./NodeRenderBoundary"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("NodeRenderBoundary", () => {
  test("renders children when no error occurs", () => {
    render(
      <NodeRenderBoundary moduleId="healthy">
        <div data-testid="child">healthy content</div>
      </NodeRenderBoundary>,
    )
    expect(screen.getByTestId("child")).toBeTruthy()
  })

  test("catches render errors and surfaces module id + error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    function ThrowingChild() {
      throw new Error("boom from child")
    }
    render(
      <NodeRenderBoundary moduleId="crashy">
        <ThrowingChild />
      </NodeRenderBoundary>,
    )
    expect(screen.getByText(/Node "crashy" failed to render/)).toBeTruthy()
    expect(screen.getByText("boom from child")).toBeTruthy()
    spy.mockRestore()
  })

  test("remounts the child subtree when Retry is clicked", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    let shouldThrow = true
    function FlakyChild() {
      if (shouldThrow) throw new Error("first render failed")
      return <div data-testid="recovered">recovered</div>
    }
    const user = userEvent.setup()
    render(
      <NodeRenderBoundary moduleId="flaky">
        <FlakyChild />
      </NodeRenderBoundary>,
    )
    expect(screen.getByText("first render failed")).toBeTruthy()

    shouldThrow = false
    await user.click(screen.getByRole("button", { name: /Retry/i }))

    expect(screen.getByTestId("recovered")).toBeTruthy()
    spy.mockRestore()
  })
})
