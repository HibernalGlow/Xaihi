// @vitest-environment happy-dom
/**
 * The GUI face against a host that answers over real HTTP.
 *
 * Every other app-side test of this card stubs `host.actions.run` (`Component.test.tsx`), and the monitor view
 * mocks the whole backend module (`src/components/views/NodeOperationMonitor.test.tsx`), so nothing on the
 * TypeScript side exercised the GUI's own `/operations` transport (`src/lib/nodeOperationTransport.ts`,
 * which *requires* the NDJSON stream to deliver a `result` frame before it returns). This file mounts the real
 * component with `runNodeOperation` as its runner and a `node:http` listener that answers like
 * `crates/xiranite-api`, so the plan the card shows can only have come from the host.
 *
 * The second case is the falsification half: a host that refuses must leave the card in `error`, because a
 * swallowed transport failure would otherwise look like a completed run.
 */
import { createServer, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { cleanup, screen, render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { setLocalBackendConfig } from "@/backend/localBackendConfig"
import { resetApiClientCache } from "@/lib/xiraniteApiClient"
import { runNodeOperation } from "@/lib/nodeOperationTransport"
import type { DissolvefData, DissolvefInput } from "@xiranite/node-dissolvef/core"
import { Component } from "./Component"
import type { DissolvefCardState } from "./types"

const TOKEN = "dissolvef-gui-host-token"
const HOST_SOURCE_PATH = "/host-only/album/2026/inner/leaf/hostmade.txt"
const HOST_PROGRESS_MESSAGE = "host planned the nested chain"
const HOST_FAILURE_MESSAGE = "host refused: grant missing for /host-only"

const surfaceState = vi.hoisted(() => ({ height: 420, width: 720 }))

vi.mock("@/nodes/shared/useNodeSurface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/useNodeSurface")>()
  return {
    ...actual,
    useNodeSurface: () => {
      const mode = actual.resolveNodeSurfaceMode(surfaceState)
      return {
        ref: { current: null },
        width: surfaceState.width,
        height: surfaceState.height,
        mode,
        density: actual.resolveNodeSurfaceDensity(mode),
      }
    },
  }
})

interface HostRequest {
  readonly method: string
  readonly path: string
  readonly body: string
}

interface ScriptedHost {
  readonly baseUrl: string
  readonly requests: HostRequest[]
  close(): Promise<void>
}

let host: ScriptedHost | undefined

beforeAll(async () => {
  host = await startHost("result")
})

afterEach(() => {
  cleanup()
  setLocalBackendConfig(null)
  resetApiClientCache()
  surfaceState.width = NODE_SURFACE_TEST_SPECS.regular.width
  surfaceState.height = NODE_SURFACE_TEST_SPECS.regular.height
})

afterAll(async () => {
  await host?.close()
})

/** `mode` chooses between a completed plan and a `500`, so both paths share this one server. */
async function startHost(mode: "result" | "refuse"): Promise<ScriptedHost> {
  const requests: HostRequest[] = []
  const server: Server = createServer((request, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    request.on("end", () => {
      const path = request.url ?? ""
      const method = request.method ?? "GET"
      const body = Buffer.concat(chunks).toString("utf8")
      // Same headers `crates/xiranite-api` answers with: happy-dom enforces the same-origin policy, so a
      // scripted host that omits them fails with "Cross-Origin Request Blocked" instead of the protocol.
      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-xiranite-token,x-xiranite-filename",
      }
      requests.push({ method, path, body })
      if (method === "OPTIONS") {
        response.writeHead(204, cors)
        response.end()
        return
      }
      const json = (status: number, payload: unknown) => {
        response.writeHead(status, { ...cors, "content-type": "application/json" })
        response.end(JSON.stringify(payload))
      }
      const token = request.headers["x-xiranite-token"]
      if (token !== TOKEN) {
        json(401, { error: "Unauthorized" })
        return
      }
      if (method === "POST" && /^\/nodes\/dissolvef\/operations$/.test(path)) {
        if (mode === "refuse") {
          json(500, { error: HOST_FAILURE_MESSAGE })
          return
        }
        json(200, { operation: { ...operationRecord, phase: "queued", result: undefined } })
        return
      }
      if (method === "GET" && /\/stream$/.test(path)) {
        response.writeHead(200, { ...cors, "content-type": "application/x-ndjson" })
        response.end([
          JSON.stringify({ type: "operation", operation: { ...operationRecord, phase: "running" } }),
          JSON.stringify({ type: "event", index: 0, event: { type: "progress", progress: 0.5, message: HOST_PROGRESS_MESSAGE } }),
          JSON.stringify({ type: "result", operation: operationRecord, result: { success: true, message: "Plan generated: 1 operation(s).", data: hostPlanData } }),
        ].map((line) => `${line}\n`).join(""))
        return
      }
      if (method === "GET" && /\/events/.test(path)) {
        json(200, { operation: operationRecord, events: [], from: 0, limit: 100, total: 1 })
        return
      }
      if (method === "GET" && /^\/node-operations\/[^/]+$/.test(path)) {
        json(200, { operation: { ...operationRecord, result: { success: true, message: "Plan generated: 1 operation(s).", data: hostPlanData } } })
        return
      }
      json(404, { error: "Node operation not found." })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

const operationRecord = {
  operationId: "op-dissolvef-gui-1",
  nodeId: "dissolvef",
  phase: "completed",
  createdAt: 1,
  updatedAt: 2,
  startedAt: 2,
  finishedAt: 3,
  eventCount: 1,
} as const

const hostPlanData: DissolvefData = {
  plan: [
    {
      mode: "nested",
      operation: "move",
      sourcePath: HOST_SOURCE_PATH,
      targetPath: "/host-only/album/2026/hostmade.txt",
      itemKind: "file",
      status: "pending",
      similarity: 1,
    },
  ],
  history: [],
  archivePaths: [],
  nestedCount: 1,
  mediaCount: 0,
  archiveCount: 0,
  directFiles: 0,
  directDirs: 0,
  skippedCount: 0,
  totalCount: 1,
  successCount: 0,
  failedCount: 0,
  errorCount: 0,
  operationId: "",
  errors: [],
}

describe("dissolvef card on a real host channel", () => {
  test("renders the plan the host returned through the /operations transport", async () => {
    const active = host!
    setSurface("regular")
    setLocalBackendConfig({ baseUrl: active.baseUrl, token: TOKEN, instanceId: "host-gui-test" })
    const cardHost = createHost({ pathText: "/host-only/album" })
    render(<Component compId="comp-dissolvef" host={cardHost} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "预演溶解" }))

    await waitFor(() => {
      if (!cardHost.state.result) {
        throw new Error(`card phase=${String(cardHost.state.phase)} progress=${String(cardHost.state.progressText)} logs=${JSON.stringify(cardHost.state.logs)}`)
      }
    })
    // The plan row shows the basename in the board and the full path in the detail line, so more than one
    // element carries it; what matters is that the content came from the host's document.
    expect(screen.getAllByText("hostmade.txt").length).toBeGreaterThan(0)
    expect(screen.getAllByText((content) => content.includes(HOST_SOURCE_PATH)).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Plan generated: 1 operation(s).").length).toBeGreaterThan(0)

    const start = active.requests.find((request) => request.method === "POST")
    expect(start).toBeDefined()
    expect(active.requests.filter((request) => request.method === "POST")).toHaveLength(1)
    const sent = JSON.parse(start!.body) as { input?: DissolvefInput }
    // "预演溶解" is a dissolve run with preview on — the card's own vocabulary, not a separate action.
    expect(sent.input?.action).toBe("dissolve")
    expect(sent.input?.path).toBe("/host-only/album")
    expect(sent.input?.preview).toBe(true)
    expect(start!.path).toBe("/nodes/dissolvef/operations")
    // The stream is the primary path this transport is supposed to use, not the polling fallback.
    expect(active.requests.some((request) => /\/stream$/.test(request.path))).toBe(true)
    expect(cardHost.state.phase).toBe("completed")
    expect(cardHost.state.result?.plan[0]?.sourcePath).toBe(HOST_SOURCE_PATH)
    expect(cardHost.state.logs?.join("\n")).toContain(HOST_PROGRESS_MESSAGE)
  })

  test("a host that refuses leaves the card in error instead of a silent success", async () => {
    const refusing = await startHost("refuse")
    setSurface("regular")
    setLocalBackendConfig({ baseUrl: refusing.baseUrl, token: TOKEN, instanceId: "host-gui-refuse" })
    const cardHost = createHost({ pathText: "/host-only/album" })
    render(<Component compId="comp-dissolvef" host={cardHost} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "预演溶解" }))

    await waitFor(() => expect(cardHost.state.phase).toBe("error"))
    // The shared client reports a rejected start as its own sentence and does not surface the `{ error }`
    // body; what matters here is that the failure reaches the card instead of looking like a completed run.
    expect(cardHost.state.progressText ?? "").toContain("500")
    expect(screen.getAllByText((content) => content.includes("Node operation start failed")).length).toBeGreaterThan(0)
    expect(screen.queryByText("hostmade.txt")).toBeNull()
    await refusing.close()
  })
})

function setSurface(mode: NodeSurfaceMode): void {
  surfaceState.width = NODE_SURFACE_TEST_SPECS[mode].width
  surfaceState.height = NODE_SURFACE_TEST_SPECS[mode].height
}

type TestHost = NodeHostApi & { state: DissolvefCardState }

function createHost(initial: DissolvefCardState): TestHost {
  const host: TestHost = {
    state: { ...initial },
    getData: <T,>() => host.state as T,
    patchData: (_compId, patch) => {
      host.state = { ...host.state, ...patch }
    },
    listComponents: () => [],
    updateComponent: () => undefined,
    actions: {
      // The production GUI runner: HTTP to the scripted host, no in-process node logic.
      run: async <TInput, TData>(nodeId: string, input: TInput, onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void): Promise<NodeRunResult<TData>> =>
        await runNodeOperation<TInput, TData>(nodeId, input, onEvent),
    },
    clipboard: { readText: async () => "", writeText: async () => undefined },
    env: { theme: "light", platform: "web" },
    getNodeConfig: async <T,>() => ({ config: undefined as T | undefined, path: "/host-only/xiranite.config.toml" }),
    saveNodeConfig: async () => undefined,
  }
  return host
}
