// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { SameaData, SameaInput } from "@xiranite/node-samea/core"
import { Component } from "./Component"
import type { SameaCardState } from "./types"

const surface = vi.hoisted(() => ({ width: 1000, height: 720, mode: "regular" }))
vi.mock("@/nodes/shared/useNodeSurface", () => ({ useNodeSurface: () => ({ ref: { current: null }, ...surface }) }))
afterEach(cleanup)

describe("SameA node", () => {
  test("renders the extractor workbench and sends native scan input", async () => {
    const host = createHost({ pathsText: "D:/archive", dryRun: true })
    render(<Component compId="samea" host={host} />)
    expect(screen.getByText("SameA：提取器协议")).toBeTruthy()
    expect(screen.getByText("分析舱")).toBeTruthy()
    await screen.getAllByRole("button", { name: "规划扫描" })[0]!.click()
    await waitFor(() => expect(host.calls[0]).toEqual(expect.objectContaining({ nodeId: "samea", input: expect.objectContaining({ action: "plan", paths: ["D:/archive"], dryRun: true }) })))
  })
})

type TestHost = NodeHostApi<SameaCardState, Partial<SameaCardState>> & { stateValue: SameaCardState; calls: Array<{ nodeId: string; input: SameaInput }> }
function createHost(initial: SameaCardState): TestHost {
  const host: TestHost = {
    stateValue: initial, calls: [],
    contract: { name: "xiranite.node-host", version: "1.0.0", supportedCapabilities: ["contract", "state", "runner", "clipboard"], hasCapability: () => true },
    env: { theme: "light", platform: "web" },
    state: { getData: () => host.stateValue, patchData: (patch) => { host.stateValue = { ...host.stateValue, ...patch } } },
    runner: { run: async <TInput, TData>(nodeId: string, input: TInput, onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult<TData>> => { host.calls.push({ nodeId, input: input as SameaInput }); onEvent?.({ type: "progress", progress: 50, message: "Scanning" }); return { success: true, message: "SameA planned 1 archive transfer(s).", data: sample as TData } } },
    clipboard: { readText: async () => "", writeText: async () => undefined },
    getData: <T,>() => host.stateValue as T, patchData: (_id, patch) => { host.stateValue = { ...host.stateValue, ...patch } }, listComponents: () => [], updateComponent: () => undefined,
  }
  return host
}
const sample: SameaData = { action: "plan", centralize: false, minOccurrences: 1, items: [], groups: [], scannedCount: 1, detectedCount: 0, readyCount: 0, movedCount: 0, ignoredCount: 0, skippedCount: 0, conflictCount: 0, errorCount: 0, errors: [] }
