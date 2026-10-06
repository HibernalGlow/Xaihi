/**
 * The Xiranite shell's copy of the node operation journal.
 *
 * `src/backend/nodeRpcClient.ts` used to call `useNodeOperations.upsertOperation/appendEvent/finishOperation`
 * inline, which is how a node's UI ended up depending on Xiranite state through a transport import. That write
 * now lives here, in the shell module that owns the store, and it is driven by the transport's update feed.
 * These tests prove the app-wide monitor still fills up, and that the node layer's projection is independent.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { NodeOperationDTO } from "@xiranite/shared"
import { resetNodeOperationTransportState, runNodeOperation } from "@/lib/nodeOperationTransport"
import { useNodeOperationJournal } from "@/nodes/shared/nodeOperationStore"
import { resetApiClientCache, type BackendEndpoint } from "@/lib/xiraniteApiClient"
import { useNodeOperations } from "./nodeOperations"
import {
  attachNodeOperationStoreMirror,
  detachNodeOperationStoreMirror,
  isNodeOperationStoreMirrorAttached,
} from "./nodeOperationStoreBridge"

const originalFetch = globalThis.fetch
let createdWindow = false

beforeEach(() => {
  injectEndpoint("http://127.0.0.1:45999", "bridge-token")
  resetApiClientCache()
  resetNodeOperationTransportState()
  useNodeOperations.getState().reset()
  useNodeOperationJournal.getState().reset()
})

afterEach(() => {
  detachNodeOperationStoreMirror()
  globalThis.fetch = originalFetch
  delete endpointHost().__XIRANITE_BACKEND__
  if (createdWindow) {
    delete (globalThis as { window?: unknown }).window
    createdWindow = false
  }
})

/**
 * Vitest runs these in happy-dom, `bun test` has no DOM at all: inject the host endpoint into whichever
 * window exists (creating a stand-in when it does not) rather than replacing the environment's window.
 */
function endpointHost(): { __XIRANITE_BACKEND__?: Partial<BackendEndpoint> } {
  const host = globalThis as { window?: { __XIRANITE_BACKEND__?: Partial<BackendEndpoint> } }
  if (!host.window) {
    host.window = {}
    createdWindow = true
  }
  return host.window
}

function injectEndpoint(baseUrl: string, token?: string): void {
  endpointHost().__XIRANITE_BACKEND__ = { baseUrl, token }
}

describe("node operation store bridge", () => {
  it("fills the app-wide monitor store from the transport feed while attached", async () => {
    attachNodeOperationStoreMirror()
    expect(isNodeOperationStoreMirrorAttached()).toBe(true)
    stubStreamedRun("op-bridge")

    await runNodeOperation("classf", { action: "plan" })

    const monitored = useNodeOperations.getState().operations.find((entry) => entry.operationId === "op-bridge")
    expect(monitored?.phase).toBe("completed")
    expect(monitored?.events).toHaveLength(1)
    expect(monitored?.lastProgress).toBe(100)
    // The node layer's own projection sees the same run; neither store imports the other.
    expect(useNodeOperationJournal.getState().operations.map((entry) => entry.operationId)).toContain("op-bridge")
  })

  it("is idempotent, because a second subscription would duplicate entries the reducers cannot dedupe", async () => {
    attachNodeOperationStoreMirror()
    attachNodeOperationStoreMirror()
    globalThis.fetch = (async () => new Response("worker unavailable", { status: 503 })) as unknown as typeof fetch

    await runNodeOperation("classf", { action: "plan" })

    const synthesized = useNodeOperations.getState().operations.filter((entry) => entry.operationId.startsWith("local-failure-"))
    expect(synthesized).toHaveLength(1)
  })

  it("stops mirroring once detached, leaving the node projection to the node layer", async () => {
    attachNodeOperationStoreMirror()
    detachNodeOperationStoreMirror()
    expect(isNodeOperationStoreMirrorAttached()).toBe(false)
    stubStreamedRun("op-orphan")

    await runNodeOperation("classf", { action: "plan" })

    expect(useNodeOperations.getState().operations.some((entry) => entry.operationId === "op-orphan")).toBe(false)
    expect(useNodeOperationJournal.getState().operations.map((entry) => entry.operationId)).toContain("op-orphan")
  })
})

function stubStreamedRun(operationId: string): void {
  const queued = operation(operationId, "queued")
  const completed = { ...operation(operationId, "completed"), eventCount: 1 }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/nodes/classf/operations")) return jsonResponse({ operation: queued })
    if (url.includes(`/node-operations/${operationId}/stream`)) {
      const lines = [
        { type: "event", index: 0, event: { type: "progress", progress: 60, message: "working" } },
        { type: "result", operation: completed, result: { success: true, message: "Done." } },
      ].map((message) => JSON.stringify(message))
      return new Response(`${lines.join("\n")}\n`, { status: 200 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as unknown as typeof fetch
}

function operation(operationId: string, phase: NodeOperationDTO["phase"]): NodeOperationDTO {
  return {
    operationId,
    nodeId: "classf",
    phase,
    createdAt: 1_728_000_000_000,
    updatedAt: 1_728_000_000_000,
    eventCount: 0,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}
