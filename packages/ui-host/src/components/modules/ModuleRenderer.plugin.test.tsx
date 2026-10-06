// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { AppNodeEntry } from "@xiranite/contract"

/**
 * Proves §4's second unload step — 「React 树卸载」 — from the renderer's point of view: unbinding a
 * plugin (what `disable`/`uninstall` do) must replace the mounted remote component, not leave it on
 * screen until something else re-renders.
 *
 * Only the MF runtime and the host-API hook are stubbed; `dynamicEntries`, `frontendHost` and
 * `ModuleRenderer`'s own effect/cache run for real.
 */
const remoteModules = vi.hoisted(() => ({ current: {} as Record<string, { default: unknown }> }))

vi.mock("@/plugins/frontendRuntime", () => ({
  registeredFrontendPlugins: () => [],
  loadRemoteModule: async (remoteId: string, expose: string) => {
    const key = `${remoteId}/${expose}`
    const found = remoteModules.current[key]
    if (!found) throw new Error(`no fake remote module for ${key}`)
    return found.default
  },
}))

vi.mock("./hostApi", () => ({
  useNodeHostApi: () => ({
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "env"],
      hasCapability: (capability: string) => capability === "contract" || capability === "state" || capability === "env",
    },
    state: { getData: () => undefined, patchData: () => {} },
    localFiles: {},
    env: { theme: "light", platform: "web" },
  }),
}))

vi.mock("@/desktop/tray/trayCoordinator", () => ({ registerNodeTrays: vi.fn() }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}))

const { bindModuleToFrontendPlugin, unbindModuleFromFrontendPlugin } = await import("@/plugins/dynamicEntries")
const { ModuleRenderer } = await import("./ModuleRenderer")

const MODULE_ID = "com.example.mounted-panel"

function remoteEntry(label: string): AppNodeEntry {
  return {
    def: { id: MODULE_ID, name: label } as AppNodeEntry["def"],
    Component: () => <div data-testid="remote-body">{label}</div>,
  } as unknown as AppNodeEntry
}

beforeEach(() => {
  remoteModules.current = { "com.example.mounted/entry": { default: remoteEntry("REMOTE V1") } }
})

afterEach(() => {
  cleanup()
  unbindModuleFromFrontendPlugin(MODULE_ID)
  remoteModules.current = {}
})

describe("unmounting a plugin's React tree", () => {
  test("a bound module renders the remote body", async () => {
    bindModuleToFrontendPlugin(MODULE_ID, {
      id: "com.example.mounted",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
    })
    render(<ModuleRenderer moduleId={MODULE_ID} compId="c1" />)

    expect(await screen.findByTestId("remote-body")).toBeTruthy()
    expect(screen.getByTestId("remote-body").textContent).toBe("REMOTE V1")
  })

  test("unbinding replaces the mounted remote without waiting for another render", async () => {
    bindModuleToFrontendPlugin(MODULE_ID, {
      id: "com.example.mounted",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
    })
    render(<ModuleRenderer moduleId={MODULE_ID} compId="c1" />)
    await screen.findByTestId("remote-body")

    act(() => {
      unbindModuleFromFrontendPlugin(MODULE_ID)
    })

    // The id is no longer resolvable from anywhere, so the renderer must fall through to its
    // "failed to load" state rather than keep showing the plugin's component.
    await waitFor(() => expect(screen.queryByTestId("remote-body")).toBeNull())
    expect(await screen.findByText(/failed to load/i)).toBeTruthy()
  })

  test("a range the host does not implement is reported as unsupported, not as a version mismatch", async () => {
    // `>=1.0.0` is legal semver but outside the implemented subset (§5 of the plugin doc). Telling the
    // user "mismatch" here would send them to upgrade the host for nothing.
    remoteModules.current["com.example.mounted/entry"] = {
      default: {
        def: { id: MODULE_ID, name: "REMOTE" },
        Component: () => <div data-testid="remote-body">should not mount</div>,
        host: { contractVersion: ">=1.0.0" },
      } as unknown as AppNodeEntry,
    }
    bindModuleToFrontendPlugin(MODULE_ID, {
      id: "com.example.mounted",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
    })
    render(<ModuleRenderer moduleId={MODULE_ID} compId="c1" />)

    expect(await screen.findByText(/Contract range unsupported/)).toBeTruthy()
    expect(screen.queryByTestId("remote-body")).toBeNull()
  })

  test("re-binding after a disable loads the remote again (the cache does not pin the old source)", async () => {
    bindModuleToFrontendPlugin(MODULE_ID, {
      id: "com.example.mounted",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
    })
    render(<ModuleRenderer moduleId={MODULE_ID} compId="c1" />)
    await screen.findByTestId("remote-body")

    act(() => {
      unbindModuleFromFrontendPlugin(MODULE_ID)
      remoteModules.current["com.example.mounted/entry"] = { default: remoteEntry("REMOTE V2") }
      bindModuleToFrontendPlugin(MODULE_ID, {
        id: "com.example.mounted",
        entry: "http://127.0.0.1:4176/mf-manifest.json",
        entryType: "module",
      })
    })

    await waitFor(() => expect(screen.getByTestId("remote-body").textContent).toBe("REMOTE V2"), { timeout: 2000 })
  })
})
