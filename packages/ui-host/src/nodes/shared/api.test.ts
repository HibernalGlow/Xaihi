/**
 * Contract tests for the node UI transport seam (`src/nodes/shared/api.ts`).
 *
 * These pin the three properties the Rust/Tauri swap depends on: the seam resolves the injected endpoint
 * itself (no `@/backend`, no Xiranite store), it speaks the exact `/operations`, `/config/nodes/...` and
 * `/nexus/captures` shapes the Axum backend mirrors (ADR-0063), and every operation mutation is published on
 * one feed that the node's own journal projects. `fetch` is stubbed, so no backend process runs here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { NodeOperationDTO, NodeRunEventDTO } from "@xiranite/shared"
import type { NodeOperationUpdate } from "@/lib/nodeOperationJournal"
import { resetApiClientCache, type BackendEndpoint } from "@/lib/xiraniteApiClient"
import {
  listNexusCaptures,
  refreshNodeOperationEvents,
  removeNexusCapture,
  runNodeOperation,
  sourceThumbnailApi,
  subscribeNodeOperationUpdates,
} from "./api"
import { useNodeOperationJournal } from "./nodeOperationStore"

interface RecordedCall {
  url: string
  init?: RequestInit
}

const BASE_URL = "http://127.0.0.1:45999"
const CONFIG_PATH = "/tmp/xiranite.config.toml"
const calls: RecordedCall[] = []
const updates: NodeOperationUpdate[] = []
const originalFetch = globalThis.fetch
let unsubscribe: (() => void) | null = null
let createdWindow = false

beforeEach(() => {
  injectEndpoint(BASE_URL, "seam-token")
  resetApiClientCache()
  useNodeOperationJournal.getState().reset()
  calls.length = 0
  updates.length = 0
  unsubscribe?.()
  unsubscribe = subscribeNodeOperationUpdates((update) => updates.push(update))
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = null
  globalThis.fetch = originalFetch
  clearInjectedEndpoint()
  if (createdWindow) {
    delete (globalThis as { window?: unknown }).window
    createdWindow = false
  }
})

describe("node transport seam", () => {
  it("resolves the injected endpoint and rebuilds clients when the backend process changes", async () => {
    stubFetch(() => new Response(null, { status: 204 }))

    await sourceThumbnailApi.releaseContext("clipm:recent")
    expect(calls[0]?.url).toContain(`${BASE_URL}/source-thumbnail-contexts/`)
    expect(headerOf(calls[0]!, "x-xiranite-token")).toBe("seam-token")

    injectEndpoint("http://127.0.0.1:46000", "replacement-token")
    await sourceThumbnailApi.releaseContext("clipm:recent")
    expect(calls[1]?.url).toContain("http://127.0.0.1:46000")
    expect(headerOf(calls[1]!, "x-xiranite-token")).toBe("replacement-token")
  })

  it("throws instead of silently targeting a backend that was never injected", async () => {
    clearInjectedEndpoint()
    await expect(sourceThumbnailApi.releaseContext("clipm:recent")).rejects.toThrow(/Xiranite local backend is not configured/)
  })

  it("keeps the /operations start-stream-result protocol and projects it into the node journal", async () => {
    const queued = operation("op-run", "queued")
    const running = { ...queued, phase: "running" as const, updatedAt: queued.updatedAt + 1 }
    const completed = { ...running, phase: "completed" as const, updatedAt: queued.updatedAt + 2, eventCount: 1 }
    stubFetch((url, init) => {
      if (url.endsWith("/nodes/classf/operations") && (init?.method ?? "GET") === "POST") {
        return json({ operation: queued })
      }
      if (url.includes("/node-operations/op-run/stream")) {
        return ndjson([
          { type: "operation", operation: running },
          { type: "event", index: 0, event: { type: "progress", progress: 40, message: "GPU batch 4/10" } },
          { type: "result", operation: completed, result: { success: true, message: "Done." } },
        ])
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`)
    })

    const streamedEvents: NodeRunEventDTO[] = []
    const result = await runNodeOperation("classf", { action: "plan" }, (event) => streamedEvents.push(event))

    expect(result).toEqual({ success: true, message: "Done." })
    expect(streamedEvents).toEqual([{ type: "progress", progress: 40, message: "GPU batch 4/10" }])
    expect(updates.map((update) => update.type)).toEqual(["operation", "operation", "event", "result"])

    const tracked = useNodeOperationJournal.getState().operations.find((entry) => entry.operationId === "op-run")
    expect(tracked?.phase).toBe("completed")
    expect(tracked?.lastProgress).toBe(100)
    expect(tracked?.lastMessage).toBe("Done.")
    expect(tracked?.events).toHaveLength(1)
  })

  it("polls the operation journal from the event index it already consumed", async () => {
    let nextEventIndex = 0
    stubFetch((url) => {
      if (!url.includes("/node-operations/op-cursor/events")) throw new Error(`Unexpected request: ${url}`)
      const events = nextEventIndex === 0 ? [{ index: 0, event: { type: "log", message: "first" } }] : []
      return json({ operation: operation("op-cursor", "running"), events, from: 0, limit: 100, total: events.length })
    })

    await refreshNodeOperationEvents("op-cursor")
    expect(calls[0]?.url).toContain("/node-operations/op-cursor/events?from=0")
    expect(updates.filter((update) => update.type === "event")).toHaveLength(1)

    // The event above was consumed, so the next poll must ask for what follows it instead of replaying it.
    nextEventIndex = 1
    await refreshNodeOperationEvents("op-cursor")
    expect(calls[1]?.url).toContain("/node-operations/op-cursor/events?from=1")
  })

  it("publishes a start failure so both journals keep a visible error entry", async () => {
    stubFetch(() => new Response("worker unavailable", { status: 503 }))

    const result = await runNodeOperation("classf", { action: "plan" })

    expect(result.success).toBe(false)
    expect(updates.at(-1)?.type).toBe("start-failure")
    const tracked = useNodeOperationJournal.getState().operations[0]
    expect(tracked?.nodeId).toBe("classf")
    expect(tracked?.phase).toBe("error")
  })

  it("reads and prunes the nexus inbox with the token header and a 404 that is not an error", async () => {
    stubFetch((url, init) => {
      if (init?.method === "DELETE" && url.includes("/nexus/captures/")) return new Response("not found", { status: 404 })
      return json({ captures: [{ id: "cap-1", targetNodeId: "lorat" }] })
    })

    const captures = await listNexusCaptures("lorat")
    expect(captures.map((capture) => capture.id)).toEqual(["cap-1"])
    expect(calls[0]?.url).toContain(`${BASE_URL}/nexus/captures?targetNodeId=lorat`)
    expect(calls[0]?.init?.cache).toBe("no-store")
    expect(headerOf(calls[0]!, "x-xiranite-token")).toBe("seam-token")

    await expect(removeNexusCapture("cap-gone")).resolves.toBe(false)
  })
})

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

/**
 * The seam reads the endpoint the host injected, so tests set `window.__XIRANITE_BACKEND__` exactly like
 * `src/backend/localBackendStatus.test.ts`. Vitest gives a real happy-dom window; under `bun test` there is no
 * DOM, so a minimal stand-in is created and removed again instead of clobbering the environment's window.
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

function clearInjectedEndpoint(): void {
  delete endpointHost().__XIRANITE_BACKEND__
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  }) as unknown as typeof fetch
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}

function ndjson(messages: readonly unknown[]): Response {
  return new Response(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`, { status: 200 })
}

function headerOf(call: RecordedCall, name: string): string | undefined {
  const headers = call.init?.headers
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name)?.[1]
  return (headers as Record<string, string>)[name]
}
