// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

import type { AppNodeEntry } from "@xiranite/contract"

/**
 * Covers `loadNodeMaximizeAction` — the part that has to go through the entry seam
 * (`dynamicEntries.resolveEntryLoader`). `nodeWindowPreferences.test.ts` already covers the pure
 * `resolveNodeMaximizeAction`, so nothing here repeats it.
 *
 * Only the MF runtime is stubbed: `dynamicEntries` stays real, which is the point — the bug this
 * guards against was the loader consulting the generated build table directly, so a module provided
 * by a runtime-registered remote resolved its content from the remote and its window behaviour from
 * the build.
 */
const remoteModules = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock("@/plugins/frontendRuntime", () => ({
  registeredFrontendPlugins: () => [],
  loadRemoteModule: async (remoteId: string, expose: string) =>
    remoteModules.current[`${remoteId}/${expose}`]
      ?? Promise.reject(new Error(`no fake remote module for ${remoteId}/${expose}`)),
}))

const { bindModuleToFrontendPlugin } = await import("@/plugins/dynamicEntries")
const { loadNodeMaximizeAction } = await import("./nodeWindowPreferences")

function fakeRemoteEntry(behavior?: "maximize" | "fullscreen"): AppNodeEntry {
  return {
    def: { id: "unused", name: "REMOTE PANEL" } as AppNodeEntry["def"],
    Component: () => null,
    ...(behavior ? { window: { maximizeBehavior: behavior } } : {}),
  } as AppNodeEntry
}

function bind(moduleId: string, pluginId: string): void {
  bindModuleToFrontendPlugin(moduleId, {
    id: pluginId,
    entry: "http://127.0.0.1:4176/mf-manifest.json",
    entryType: "module",
  })
}

beforeEach(() => {
  remoteModules.current = {}
})

describe("loadNodeMaximizeAction through the entry seam", () => {
  test("an unknown module id falls back to plain maximise", async () => {
    expect(await loadNodeMaximizeAction("no.such.module")).toBe("maximize")
  })

  test("a remote-provided module's own window declaration is honoured", async () => {
    bind("com.example.win.panel", "com.example.win")
    remoteModules.current["com.example.win/entry"] = { default: fakeRemoteEntry("fullscreen") }

    expect(await loadNodeMaximizeAction("com.example.win.panel")).toBe("toggle-fullscreen")
  })

  test("a remote that declares no window preference keeps the default", async () => {
    bind("com.example.plain.panel", "com.example.plain")
    remoteModules.current["com.example.plain/entry"] = { default: fakeRemoteEntry() }

    expect(await loadNodeMaximizeAction("com.example.plain.panel")).toBe("maximize")
  })
})
