// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest"

import {
  bindModuleToFrontendPlugin,
  frontendPluginForModule,
  resolveEntryLoader,
  unbindModuleFromFrontendPlugin,
} from "./dynamicEntries"
import { registerFrontendPlugin, unregisterFrontendPlugin } from "./frontendRuntime"
import { registerModuleContributions, resetModuleContributions } from "./contributions"

const requests = vi.hoisted(() => [] as { remoteId: string; expose: string }[])

vi.mock("./frontendRuntime", async () => {
  const actual = await vi.importActual<typeof import("./frontendRuntime")>("./frontendRuntime")
  return {
    ...actual,
    loadRemoteModule: async (remoteId: string, expose: string) => {
      requests.push({ remoteId, expose })
      return { def: { id: remoteId, name: remoteId, version: "0.0.0", category: "PLUGIN", description: "" }, core: {} }
    },
  }
})

const spec = {
  id: "com.example.multi",
  moduleId: "multi.host",
  entry: "http://127.0.0.1:4176/mf-manifest.json",
  entryType: "module" as const,
}

beforeEach(() => {
  requests.length = 0
  resetModuleContributions()
  unbindModuleFromFrontendPlugin("multi.host")
  unregisterFrontendPlugin(spec.id)
  registerFrontendPlugin(spec)
  bindModuleToFrontendPlugin("multi.host", spec)
})

describe("a contributed module's expose", () => {
  test("two contributed ids fetch two different exposes from the same remote", async () => {
    registerModuleContributions(spec.id, [
      { kind: "component", id: "multi.panel", module: "./FooPanel" },
      { kind: "component", id: "multi.other", module: "./BarPanel" },
    ])

    // The bug this pins: only `multi.host` resolved to the remote, so these two rows were listed in the
    // module library while the loader handed back nothing for them.
    const first = resolveEntryLoader("multi.panel")
    const second = resolveEntryLoader("multi.other")
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    await first?.()
    await second?.()

    expect(requests).toEqual([
      { remoteId: spec.id, expose: "FooPanel" },
      { remoteId: spec.id, expose: "BarPanel" },
    ])
  })

  test("the bound module id keeps the single-expose convention when nothing declares one", async () => {
    const loader = resolveEntryLoader("multi.host")
    expect(loader).toBeDefined()
    await loader?.()
    expect(requests).toEqual([{ remoteId: spec.id, expose: "entry" }])
  })

  test("a contributed id that repeats the bound id still honours its declared expose", async () => {
    // 阶段二 replaces a built-in node with a plugin build: the row exists and may name the expose.
    registerModuleContributions(spec.id, [{ kind: "component", id: "multi.host", module: "./Panel" }])

    await resolveEntryLoader("multi.host")?.()

    expect(requests).toEqual([{ remoteId: spec.id, expose: "Panel" }])
  })

  test("an id nobody serves resolves to nothing, and asks for nothing", async () => {
    expect(resolveEntryLoader("completely.unknown")).toBeUndefined()
    expect(requests).toEqual([])
  })

  test("a bare `./` declaration falls back instead of requesting an empty expose", async () => {
    registerModuleContributions(spec.id, [{ kind: "component", id: "multi.edge", module: "./" }])

    await resolveEntryLoader("multi.edge")?.()

    expect(requests).toEqual([{ remoteId: spec.id, expose: "entry" }])
  })

  test("clearing a plugin's contributions strands its ids again, deliberately", async () => {
    registerModuleContributions(spec.id, [{ kind: "component", id: "multi.panel", module: "./FooPanel" }])
    expect(resolveEntryLoader("multi.panel")).toBeDefined()

    resetModuleContributions()

    expect(resolveEntryLoader("multi.panel")).toBeUndefined()
  })

  test("a contributed id answers with its plugin, because that answer decides trust vs projection", async () => {
    // `ModuleRenderer` reads `frontendPluginForModule` to choose the full host API or the capability
    // projection. A contributed id answering "no plugin here" would hand a third-party component the
    // whole host — the live probe found exactly this, so it is pinned here as well as fixed there.
    registerModuleContributions(spec.id, [{ kind: "component", id: "multi.panel", module: "./FooPanel" }])

    expect(frontendPluginForModule("multi.panel")?.id).toBe(spec.id)
    expect(frontendPluginForModule("multi.nobody")).toBeUndefined()
  })

  test("the row shows the name the plugin declared, and its own version only if it states one", () => {
    // Measured in the real module library (2026-10-06): a manifest whose expose row said
    // `name = "Second Contributed Panel"` printed the raw id instead, because the `[frontend.exposes]`
    // sugar dropped the field before it reached the record.
    const outcome = registerModuleContributions(
      spec.id,
      [
        { kind: "component", id: "multi.named", name: "Named Panel", module: "./Named" },
        { kind: "component", id: "multi.unnamed", module: "./Unnamed" },
      ],
      "0.1.0",
    )

    expect(outcome.modules.map((module) => [module.id, module.name, module.version])).toEqual([
      ["multi.named", "Named Panel", "0.1.0"],
      ["multi.unnamed", "multi.unnamed", "0.1.0"],
    ])
  })

  test("a per-row version wins over the plugin's, and no plugin version still answers 0.0.0", () => {
    const stated = registerModuleContributions(
      spec.id,
      [{ kind: "component", id: "multi.own", version: "2.3.0" }],
      "0.1.0",
    )
    expect(stated.modules[0]?.version).toBe("2.3.0")

    resetModuleContributions()

    // The control: without the plugin version the row falls back to the placeholder, which is why the
    // install paths must hand it over rather than let every row claim `0.0.0`.
    const bare = registerModuleContributions(spec.id, [{ kind: "component", id: "multi.own" }])
    expect(bare.modules[0]?.version).toBe("0.0.0")
  })
})
