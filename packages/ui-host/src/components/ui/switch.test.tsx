// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Switch } from "./switch"

afterEach(cleanup)

describe("shared Switch", () => {
  test("keeps the unchecked Radix switch visually distinct through semantic tokens", () => {
    render(<Switch aria-label="Preview mode" checked={false} onCheckedChange={() => undefined} />)

    const control = screen.getByRole("switch", { name: "Preview mode" })
    expect(control.getAttribute("data-state")).toBe("unchecked")
    expect(control.className).toContain("data-[state=unchecked]:!border-input")
    expect(control.className).toContain("data-[state=unchecked]:!bg-muted")
    expect(control.className).toContain("data-[size=default]:!h-[1.15rem]")
    expect(control.className).toContain("!p-0")
  })
})
