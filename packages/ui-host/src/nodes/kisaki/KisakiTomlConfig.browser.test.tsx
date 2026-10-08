import { afterEach, expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"

import i18n from "@/i18n"
import { Component } from "./Component"
import type { KisakiCardState } from "./types"

const surface = vi.hoisted(() => ({ width: 1440, height: 860, mode: "workspace" }))

vi.mock("@/nodes/shared/useNodeSurface", () => ({
  useNodeSurface: () => ({ ref: { current: null }, ...surface }),
}))

afterEach(async () => {
  cleanup()
  Object.assign(surface, { width: 1440, height: 860, mode: "workspace" })
  await i18n.changeLanguage("zh")
})

test("loads and saves Kisaki algorithm defaults through the node TOML configuration", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "similar-images", sourceSettingsTab: "algorithm" },
    { similarImagesHashAlgorithm: "median", similarImagesResizeAlgorithm: "nearest" },
  )

  await render(<Component compId="czkawka-toml-algorithm-browser" host={host} />)
  await expect.poll(() => host.stateValue.similarImagesHashAlgorithm).toBe("median")
  await expect.poll(() => host.stateValue.similarImagesResizeAlgorithm).toBe("nearest")

  const algorithm = page.getByRole("combobox", { name: "Hash algorithm" })
  await algorithm.click()
  await page.getByRole("option", { name: "double-gradient" }).click()
  await expect.poll(() => host.nodeConfig).toMatchObject({
    similarImagesHashAlgorithm: "double-gradient",
    similarImagesResizeAlgorithm: "nearest",
  })

  cleanup()
  const restarted = createHost({ tool: "similar-images", sourceSettingsTab: "algorithm" }, host.nodeConfig)
  await render(<Component compId="czkawka-toml-algorithm-restarted-browser" host={restarted} />)
  await expect.poll(() => restarted.stateValue.similarImagesHashAlgorithm).toBe("double-gradient")
  await expect.poll(() => restarted.stateValue.similarImagesResizeAlgorithm).toBe("nearest")
})

test("rehydrates TOML-backed Kisaki view preferences after the async config read", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "similar-images" },
    { similarImagesViewMode: "folders", previewPanelEnabledByTool: { "similar-images": true } },
  )

  await render(<Component compId="czkawka-toml-view-preferences-browser" host={host} />)

  await expect.poll(() => host.stateValue.similarImagesViewMode).toBe("folders")
  await expect.element(page.getByRole("tab", { name: "Folders" })).toHaveAttribute("data-state", "active")
})

type TestHost = NodeHostApi<KisakiCardState, Partial<KisakiCardState>> & {
  stateValue: KisakiCardState
  nodeConfig?: Partial<KisakiCardState>
}

function createHost(initial: KisakiCardState, nodeConfig?: Partial<KisakiCardState>): TestHost {
  const host: TestHost = {
    stateValue: initial,
    nodeConfig,
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "config"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    state: {
      getData: () => host.stateValue,
      patchData: (patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    },
    runner: {
      getInfo: async <TInfo,>() => ({ apiVersion: 5, sourceVersion: "12.0.0", capabilities: [] }) as TInfo,
      run: async <TInput, TData>(_nodeId: string, _input: TInput, _onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult<TData>> => ({ success: true, message: "Completed" }),
      cancelCurrent: async () => true,
    },
    config: {
      get: async <T,>() => ({ config: host.nodeConfig as T | undefined, path: "C:/config/xiranite.config.toml" }),
      save: async <T,>(patch: T) => {
        host.nodeConfig = { ...host.nodeConfig, ...(patch as Partial<KisakiCardState>) }
      },
    },
    getData: <T,>() => host.stateValue as T,
    patchData: (_id, patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
  return host
}
