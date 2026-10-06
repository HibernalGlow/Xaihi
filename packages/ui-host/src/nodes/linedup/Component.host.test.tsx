// @vitest-environment happy-dom
/**
 * linedup 的 GUI 面对着一个真 HTTP 宿主。
 *
 * `Component.test.tsx` 里那份 runner 是脚本化的假宿主；这个文件把它换成 `node:http` 上真正的
 * `/nodes/linedup/operations` 监听器，跑的就是 GUI 自己那条 transport（
 * `host.runner.run` → `src/lib/nodeOperationTransport.ts`），于是 URL、token 头、NDJSON 流和
 * 「result 帧不到就不返回」这几件只在真协议上才会错的事第一次被这条腿跑到。
 *
 * 第二条用例是反证：宿主拒绝时卡片必须停在 error，且预览里一行都不许出现 —— 那意味着浏览器在本地
 * 算了一份（ADR-0074 §5 删掉的就是那条回落）。
 */
import { createServer, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import type { LinedupFilterInput, LinedupFilterResult } from "@xiranite/node-linedup/core"
import { NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import { resetApiClientCache } from "@/lib/xiraniteApiClient"
import { runNodeOperation } from "@/lib/nodeOperationTransport"
import { Component } from "./Component"
import type { LinedupCardState } from "./types"

const TOKEN = "linedup-gui-host-token"
/** 只有宿主知道的答案：beta-* 两行被移除。面若自己算，这份文档就永远不必回来也照样「绿」。 */
const HOST_RESULT: LinedupFilterResult = {
  filteredLines: ["alpha", "gamma"],
  removedLines: ["beta-one", "beta-two"],
  keptCount: 2,
  removedCount: 2,
}
const HOST_FAILURE_MESSAGE = "host refused: linedup budget exceeded"

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
  injectBackend(null)
  surfaceState.width = NODE_SURFACE_TEST_SPECS.regular.width
  surfaceState.height = NODE_SURFACE_TEST_SPECS.regular.height
})

afterAll(async () => {
  await host?.close()
})

/**
 * 端点是宿主注入的：`resolveBackendEndpoint()` 先读 `window.__XIRANITE_BACKEND__`
 * （`src/lib/xiraniteApiClient.ts:34-53`，正式那份由 `src/backend/localBackendConfig.ts` 的 hydrator 写）。
 * 测试直接注入那一份、再丢掉客户端缓存，就不必 import `@/backend` —— 节点目录里的 `@/backend` 会被
 * `bun run audit:node-ui-independence` 记成 transport seam，而那条要求恒为 0。
 */
function injectBackend(endpoint: { baseUrl: string; token: string; instanceId: string } | null): void {
  const view = window as Window & { __XIRANITE_BACKEND__?: Record<string, string> }
  if (endpoint) view.__XIRANITE_BACKEND__ = { ...endpoint }
  else delete view.__XIRANITE_BACKEND__
  resetApiClientCache()
}

/** `mode` 在「答一份结果文档」与「500 拒绝」之间切换，两条用例共用同一个监听器实现。 */
async function startHost(mode: "result" | "refuse"): Promise<ScriptedHost> {
  const requests: HostRequest[] = []
  const operationRecord = {
    operationId: "op-linedup-gui-1",
    nodeId: "linedup",
    phase: "completed",
    createdAt: 1,
    updatedAt: 2,
    startedAt: 2,
    finishedAt: 3,
    eventCount: 0,
    result: { success: true, message: "Filtered lines.", data: HOST_RESULT },
  } as const
  const server: Server = createServer((request, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    request.on("end", () => {
      const path = request.url ?? ""
      const method = request.method ?? "GET"
      const body = Buffer.concat(chunks).toString("utf8")
      // happy-dom 守同源策略，所以这些头必须是 `crates/xiranite-api` 那套，否则测到的是 CORS 失败。
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
      if (request.headers["x-xiranite-token"] !== TOKEN) {
        json(401, { error: "Unauthorized" })
        return
      }
      if (method === "POST" && /^\/nodes\/linedup\/operations$/.test(path)) {
        if (mode === "refuse") {
          json(500, { error: HOST_FAILURE_MESSAGE })
          return
        }
        json(200, { operation: { ...operationRecord, phase: "queued", result: undefined } })
        return
      }
      if (method === "GET" && /\/stream$/.test(path)) {
        response.writeHead(200, { ...cors, "content-type": "application/x-ndjson" })
        response.end(`${JSON.stringify({ type: "result", operation: operationRecord, result: operationRecord.result })}\n`)
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

describe("linedup card on a real host channel", () => {
  test("sends the input document to /nodes/linedup/operations and renders what the host returned", async () => {
    const active = host!
    surfaceState.width = NODE_SURFACE_TEST_SPECS.regular.width
    surfaceState.height = NODE_SURFACE_TEST_SPECS.regular.height
    injectBackend({ baseUrl: active.baseUrl, token: TOKEN, instanceId: "linedup-gui-host-test" })
    const cardHost = createCardHost({ sourceText: "gamma\nbeta-one\nalpha\nbeta-two", filterText: "beta" })
    render(<Component compId="comp-linedup" host={cardHost} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行过滤" }))

    await waitFor(() => {
      if (!cardHost.cardState.result) {
        throw new Error(`card phase=${String(cardHost.cardState.phase)} logs=${JSON.stringify(cardHost.cardState.logs)}`)
      }
    })
    const start = active.requests.find((request) => request.method === "POST")
    expect(start?.path).toBe("/nodes/linedup/operations")
    expect(active.requests.filter((request) => request.method === "POST")).toHaveLength(1)
    // 发出去的是未裁剪的行数组：面不预先 trim/去重，归一化只有宿主那一份。
    expect(JSON.parse(start!.body) as { input?: LinedupFilterInput }).toEqual({
      input: {
        sourceLines: ["gamma", "beta-one", "alpha", "beta-two"],
        filterLines: ["beta"],
        caseSensitive: true,
        sort: true,
      },
    })
    // 这条 transport 走的是流，不是轮询兜底。
    expect(active.requests.some((request) => /\/stream$/.test(request.path))).toBe(true)

    expect(cardHost.cardState.phase).toBe("completed")
    expect(cardHost.cardState.result).toEqual(HOST_RESULT)
    expect(cardHost.cardState.logs).toEqual(["保留 2 行，移除 2 行。"])
    // 「移除」页与「预览」页的每一行都只能来自那份文档。
    expect(screen.getByText("beta-one")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: /预览/ }))
    expect(screen.getByText("gamma")).toBeTruthy()
    expect(screen.getByText("beta-two")).toBeTruthy()
  })

  test("a host that refuses leaves the card in error with nothing rendered locally", async () => {
    const refusing = await startHost("refuse")
    surfaceState.width = NODE_SURFACE_TEST_SPECS.regular.width
    surfaceState.height = NODE_SURFACE_TEST_SPECS.regular.height
    injectBackend({ baseUrl: refusing.baseUrl, token: TOKEN, instanceId: "linedup-gui-host-refuse" })
    const cardHost = createCardHost({ sourceText: "gamma\nbeta-one\nalpha\nbeta-two", filterText: "beta" })
    render(<Component compId="comp-linedup" host={cardHost} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "运行过滤" }))

    await waitFor(() => expect(cardHost.cardState.phase).toBe("error"))
    expect(cardHost.cardState.result).toBeNull()
    // 被拒之后预览里一行都不该有：出现任何一行就说明浏览器自己算了一份。
    expect(screen.queryByText("beta-one")).toBeNull()
    expect(screen.queryByText("gamma")).toBeNull()
    await refusing.close()
  })
})

/** 卡片数据袋叫 `cardState`，`NodeHostApi.state` 留给宿主的 `NodeStateCapability` 能力位（同 `Component.test.tsx`）。 */
type TestHost = NodeHostApi & { cardState: LinedupCardState }

function createCardHost(initial: LinedupCardState): TestHost {
  function applyPatch(patch: Partial<LinedupCardState>) {
    cardHost.cardState = { ...cardHost.cardState, ...patch }
  }
  const cardHost: TestHost = {
    cardState: { ...initial },
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "clipboard", "config", "env"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    state: {
      getData: () => cardHost.cardState as Record<string, unknown> | undefined,
      patchData: (patch: Record<string, unknown>) => applyPatch(patch as Partial<LinedupCardState>),
    },
    getData: <T,>() => cardHost.cardState as T,
    patchData: (_compId, patch) => applyPatch(patch),
    listComponents: () => [],
    updateComponent: () => undefined,
    runner: {
      // 生产 GUI 的那条腿：HTTP 打到脚本化宿主，面进程里没有节点逻辑。
      run: async <TInput, TData>(nodeId: string, input: TInput): Promise<NodeRunResult<TData>> =>
        await runNodeOperation<TInput, TData>(nodeId, input),
    },
    clipboard: { readText: async () => "", writeText: async () => undefined },
    getNodeConfig: async () => ({ config: undefined, path: "/host-only/xiranite.config.toml" }),
    saveNodeConfig: async () => undefined,
  }
  return cardHost
}
