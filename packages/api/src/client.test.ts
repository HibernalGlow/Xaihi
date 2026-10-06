import { afterEach, describe, expect, test, vi } from "vitest"
import { createXiraniteFileDeletionClient, createXiraniteSystemClient } from "./client.js"

describe("createXiraniteFileDeletionClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("encodes deletion filters, cursor pagination, and export authentication", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify({ items: [], nextCursor: null }))
    ))
    vi.stubGlobal("fetch", fetchMock)
    const client = createXiraniteFileDeletionClient("http://127.0.0.1:4319/_xiranite/backend", { token: "local token" })

    await client.list({
      nodeId: "neo/view",
      restoreAvailable: true,
      limit: 80,
      cursor: "1700:record/2",
    })

    const listUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(listUrl.pathname).toBe("/_xiranite/backend/file-deletions")
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      nodeId: "neo/view",
      restoreAvailable: "true",
      limit: "80",
      cursor: "1700:record/2",
    })
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "x-xiranite-token": "local token" },
    })

    const exportUrl = new URL(client.exportUrl("markdown", {
      nodeId: "neo/view",
      restoreAvailable: false,
    }))
    expect(exportUrl.pathname).toBe("/_xiranite/backend/file-deletions/export")
    expect(Object.fromEntries(exportUrl.searchParams)).toEqual({
      nodeId: "neo/view",
      restoreAvailable: "false",
      format: "markdown",
      token: "local token",
    })
  })
})

describe("createXiraniteSystemClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("preserves a gateway namespace for Eden Treaty routes", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({ ok: true, instanceId: "backend-1" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createXiraniteSystemClient(
      "http://wails.localhost/_xiranite/backend",
      { token: "gateway-token" },
    ).health()).resolves.toEqual({ ok: true, instanceId: "backend-1" })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://wails.localhost/_xiranite/backend/health")
  })
})
