// @vitest-environment node
import { beforeEach, describe, expect, test } from "vitest"

import { MODULE_REGISTRY, getModule } from "@/components/modules/registry"
import {
  allModules,
  clearModuleContributions,
  contributedModules,
  getContributedModule,
  owningPluginOfModule,
  registerModuleContributions,
  resetModuleContributions,
  subscribeModuleContributions,
} from "./contributions"

beforeEach(() => {
  resetModuleContributions()
})

describe("registerModuleContributions", () => {
  test("a component contribution is listed with host defaults", () => {
    const outcome = registerModuleContributions("com.example.panel", [
      { kind: "component", id: "example.panel", name: "EXAMPLE PANEL" },
    ])
    expect(outcome.notes).toEqual([])
    expect(contributedModules()).toEqual([
      {
        id: "example.panel",
        name: "EXAMPLE PANEL",
        version: "0.0.0",
        category: "PLUGIN",
        description: "",
        icon: "Puzzle",
      },
    ])
  })

  test("the built-in lookup resolves a contributed id too", () => {
    registerModuleContributions("com.example.panel", [{ kind: "component", id: "example.panel", name: "P" }])
    expect(getModule("example.panel")?.name).toBe("P")
    expect(getModule("settings")).toBeDefined()
    expect(getModule("does.not.exist")).toBeUndefined()
  })

  test("colliding with a built-in id is refused as a listing, with the reason reported", () => {
    const builtIn = MODULE_REGISTRY[0]!
    const outcome = registerModuleContributions("com.example.clone", [
      { kind: "component", id: builtIn.id, name: "SHADOW" },
    ])
    expect(contributedModules()).toEqual([])
    expect(outcome.notes[0]).toContain(builtIn.id)
    // The built-in row is unchanged — refusing the listing must not rewrite the built-in.
    expect(getModule(builtIn.id)).toBe(builtIn)
  })

  test("a kind with no consumer is reported instead of being silently accepted", () => {
    const outcome = registerModuleContributions("com.example.other", [
      { kind: "route", id: "example.route" },
      { kind: "component", id: "example.panel", name: "P" },
    ])
    expect(outcome.notes).toHaveLength(1)
    expect(outcome.notes[0]).toContain("no consumer")
    expect(contributedModules()).toHaveLength(1)
  })

  test("clearing is per plugin, and reports how much it removed", () => {
    registerModuleContributions("com.example.a", [{ kind: "component", id: "a.panel", name: "A" }])
    registerModuleContributions("com.example.b", [{ kind: "component", id: "b.panel", name: "B" }])
    expect(clearModuleContributions("com.example.a")).toBe(1)
    expect(contributedModules().map((module) => module.id)).toEqual(["b.panel"])
    expect(owningPluginOfModule("b.panel")).toBe("com.example.b")
    expect(owningPluginOfModule("a.panel")).toBeUndefined()
  })
})

describe("store contract", () => {
  test("the snapshot keeps its identity until something actually changes", () => {
    // useSyncExternalStore requires this: a new array per call would re-render forever.
    const before = contributedModules()
    expect(contributedModules()).toBe(before)
    registerModuleContributions("com.example.panel", [{ kind: "component", id: "example.panel", name: "P" }])
    expect(contributedModules()).not.toBe(before)
  })

  test("subscribers are notified on register and on clear, and unsubscribe works", () => {
    let notifications = 0
    const unsubscribe = subscribeModuleContributions(() => {
      notifications += 1
    })
    registerModuleContributions("com.example.panel", [{ kind: "component", id: "example.panel", name: "P" }])
    expect(notifications).toBe(1)
    clearModuleContributions("com.example.panel")
    expect(notifications).toBe(2)

    unsubscribe()
    registerModuleContributions("com.example.panel", [{ kind: "component", id: "example.panel", name: "P" }])
    expect(notifications).toBe(2)
  })

  test("allModules is exactly the built-ins plus the contributions", () => {
    expect(allModules()).toBe(MODULE_REGISTRY)
    registerModuleContributions("com.example.panel", [{ kind: "component", id: "example.panel", name: "P" }])
    const merged = allModules()
    expect(merged).toHaveLength(MODULE_REGISTRY.length + 1)
    expect(merged.at(-1)?.id).toBe("example.panel")
    expect(getContributedModule("example.panel")).toBeDefined()
  })
})
