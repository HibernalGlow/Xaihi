import { afterEach, expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { KisakiData } from "@hibernalglow/xaihi-kisaki/core"

import i18n from "@/i18n"
import { Component } from "./Component"
import type { KisakiCardState } from "./types"

const surface = vi.hoisted(() => ({ width: 1440, height: 860, mode: "workspace" }))
vi.mock("@/nodes/shared/useNodeSurface", () => ({ useNodeSurface: () => ({ ref: { current: null }, ...surface }) }))

afterEach(async () => {
  cleanup()
  document.body.querySelectorAll('[data-slot="dialog-overlay"], [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]').forEach((element) => element.remove())
  document.body.removeAttribute("data-scroll-locked")
  document.body.style.pointerEvents = ""
  await i18n.changeLanguage("zh")
})

test("persists the Simiu directory-local set mode while using Kisaki image settings", async () => {
  const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/library", sourceSettingsTab: "algorithm", similarImagesMode: "simiu-sets" })
  await render(<Component compId="czkawka-simiu-sets-browser" host={host} />)

  await expect.element(page.getByRole("spinbutton", { name: "最大差异" })).toHaveValue(10)
  await page.getByRole("spinbutton", { name: "最大差异" }).fill("7")
  await page.getByRole("textbox", { name: "simiu set directory prefix" }).fill("artist_set")
  await page.getByRole("spinbutton", { name: "simiu set minimum group size" }).fill("3")
  await page.getByRole("combobox", { name: "simiu set scan order" }).click()
  await page.getByRole("option", { name: "最深目录优先" }).click()

  await expect.poll(() => host.stateValue).toMatchObject({
    similarImagesMode: "simiu-sets",
    similarity: "7",
    simiuSetsNamePrefix: "artist_set",
    simiuSetsMinimumGroupSize: "3",
    simiuSetsScanOrder: "deepest-first",
  })
})

type TestHost = NodeHostApi<KisakiCardState, Partial<KisakiCardState>> & { stateValue: KisakiCardState }

function createHost(initial: KisakiCardState): TestHost {
  const host: TestHost = {
    stateValue: initial,
    contract: { name: "xiranite.node-host", version: "1.0.0", supportedCapabilities: ["contract", "state", "runner"], hasCapability: () => true },
    env: { theme: "light", platform: "web" },
    state: { getData: () => host.stateValue, patchData: (patch) => { host.stateValue = { ...host.stateValue, ...patch } } },
    runner: {
      getInfo: async <TInfo,>() => ({ apiVersion: 5, sourceVersion: "12.0.0", capabilities: [] }) as TInfo,
      run: async <TInput, TData>(_nodeId: string, _input: TInput, onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult<TData>> => {
        onEvent?.({ type: "progress", progress: 100, message: "Completed" })
        return { success: true, message: "Completed", data: emptyResult as TData }
      },
      cancelCurrent: async () => true,
    },
    getData: <T,>() => host.stateValue as T,
    patchData: (_id, patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
  return host
}

const emptyResult: KisakiData = { action: "scan", tool: "similar-images", groups: [], entries: [], messages: "", stopped: false, groupCount: 0, fileCount: 0, totalBytes: 0, reclaimableBytes: 0, affectedCount: 0, errorCount: 0 }
