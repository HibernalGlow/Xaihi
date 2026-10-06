// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createLogEnvelope, createLogSession } from "@xiranite/logging"
import type { NodeHostApi } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { Component } from "./Component"
import type { LogxCardState } from "./types"

const surfaceState = vi.hoisted(() => ({ width: 720, height: 420 }))
vi.mock("@/nodes/shared/useNodeSurface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/useNodeSurface")>()
  return { ...actual, useNodeSurface: () => { const mode = actual.resolveNodeSurfaceMode(surfaceState); return { ref: { current: null }, width: surfaceState.width, height: surfaceState.height, mode, density: actual.resolveNodeSurfaceDensity(mode) } } }
})

afterEach(() => { cleanup(); vi.clearAllMocks(); setSurface("regular") })

describe("LogX GUI node", () => {
  test.each(NODE_SURFACE_TEST_MODES)("renders the %s surface", (mode) => {
    setSurface(mode)
    render(<Component compId="logx-1" host={createHost()} />)
    expect(screen.getByText("LogX")).toBeTruthy()
    if (mode === "collapsed") expect(screen.getByTestId("logx-collapsed-view")).toBeTruthy()
    else if (mode === "compact") expect(screen.getByTestId("logx-compact-view")).toBeTruthy()
    else if (mode === "portrait") expect(screen.getByTestId("logx-portrait-view")).toBeTruthy()
    else if (mode === "regular") expect(screen.getByTestId("logx-regular-view")).toBeTruthy()
    else {
      expect(screen.getByTestId("logx-workspace-view")).toBeTruthy()
      expect(screen.getByLabelText("Storm Meter")).toBeTruthy()
      expect(screen.getByLabelText("Anomaly Map")).toBeTruthy()
      expect(screen.getByLabelText("Session Ledger")).toBeTruthy()
      expect(screen.getByLabelText("Incident Anatomy")).toBeTruthy()
    }
  })

  test("runs the shared node core and renders event details", async () => {
    const host = createHost()
    render(<Component compId="logx-1" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "查询" }))
    await waitFor(() => expect(host.runner?.run).toHaveBeenCalledWith("logx", expect.objectContaining({ action: "query", minimumSeverity: "info" }), expect.any(Function)))
    await waitFor(() => expect(screen.getAllByText("reader.failed")).toHaveLength(2))
    expect(screen.getByText("DecodeError: decode failed")).toBeTruthy()
  })
})

function createHost(): NodeHostApi<LogxCardState, Partial<LogxCardState>> {
  const state: LogxCardState = {}
  const session = createLogSession()
  const event = createLogEnvelope({ severityText: "error", eventName: "reader.failed", body: "decode failed", resource: { serviceName: "xiranite", processType: "frontend" }, scope: { name: "neoview.reader" }, session, error: { name: "DecodeError", message: "decode failed" } })
  const run = vi.fn(async () => ({ success: true, message: "Matched 1 log event(s).", data: { action: "query", directory: "D:/logs", files: ["current.jsonl"], issues: [], matchedCount: 1, returnedCount: 1, events: [event], aggregate: { total: 1, bySeverity: { error: 1 }, byScope: { "neoview.reader": 1 }, byEvent: { "reader.failed": 1 }, bySession: { [session.id]: 1 }, errors: [] }, sessions: [], telemetry: { durationMs: 0, eventsPerSecond: 1, stormIntensity: 0.1, anomalyCells: Array.from({ length: 16 }, (_, index) => ({ index, eventCount: index === 0 ? 1 : 0, weightedScore: index === 0 ? 5 : 0, intensity: index === 0 ? 1 : 0 })) } } }))
  return {
    getData: () => state,
    patchData: (_id, patch) => Object.assign(state, patch),
    listComponents: () => [], updateComponent: () => undefined,
    runner: { run },
    env: { theme: "light", platform: "web" },
  } as unknown as NodeHostApi<LogxCardState, Partial<LogxCardState>>
}

function setSurface(mode: NodeSurfaceMode) { Object.assign(surfaceState, NODE_SURFACE_TEST_SPECS[mode]) }
