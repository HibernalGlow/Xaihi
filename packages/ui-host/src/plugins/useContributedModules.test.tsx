// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

import { MODULE_REGISTRY } from "@/components/modules/registry"
import {
  clearModuleContributions,
  registerModuleContributions,
  resetModuleContributions,
} from "./contributions"
import { useContributedModules } from "./useContributedModules"

function Probe() {
  const modules = useContributedModules()
  return <div data-testid="contributed">{`${modules.length}:${modules.map((module) => module.id).join(",")}`}</div>
}

beforeEach(() => {
  resetModuleContributions()
})

afterEach(() => {
  cleanup()
  resetModuleContributions()
})

/**
 * The React half of the contribution path. Without a working subscription the module library would
 * only ever show what was installed before the app loaded, and the failure mode is silent — a row
 * that simply never appears — so it needs a render-level assertion, not just a store-level one.
 */
describe("useContributedModules", () => {
  test("re-renders when a plugin contributes components, and again when they are removed", () => {
    render(<Probe />)
    expect(screen.getByTestId("contributed").textContent).toBe("0:")

    act(() => {
      registerModuleContributions("com.example.panel", [
        { kind: "component", id: "example.a", name: "A" },
        { kind: "component", id: "example.b", name: "B" },
      ])
    })
    expect(screen.getByTestId("contributed").textContent).toBe("2:example.a,example.b")

    act(() => {
      clearModuleContributions("com.example.panel")
    })
    expect(screen.getByTestId("contributed").textContent).toBe("0:")
  })

  test("a contribution refused by the store produces no row", () => {
    render(<Probe />)
    act(() => {
      registerModuleContributions("com.example.panel", [
        { kind: "component", id: MODULE_REGISTRY[0]!.id, name: "SHADOW" },
        { kind: "route", id: "example.route", name: "R" },
      ])
    })
    expect(screen.getByTestId("contributed").textContent).toBe("0:")
  })
})
