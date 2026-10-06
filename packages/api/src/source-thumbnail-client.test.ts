import { afterEach, describe, expect, it, vi } from "vitest"

import { createSourceThumbnailClient } from "./source-thumbnail-client.js"

describe("createSourceThumbnailClient", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("registers and releases source thumbnail contexts through the shared contract", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/source-thumbnails")) {
        return Response.json({ contextId: "clipm:recent", generation: 2, items: [] }, { status: 201 })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createSourceThumbnailClient("http://127.0.0.1:41000/gateway", { token: "secret" })

    await expect(client.register("clipm:recent", 2, [{ id: "event-1", path: "D:/books/one.cbz", kind: "file" }]))
      .resolves.toMatchObject({ contextId: "clipm:recent", generation: 2 })
    await client.releaseContext("clipm:recent")

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:41000/gateway/source-thumbnails")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json", "x-xiranite-token": "secret" },
    })
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://127.0.0.1:41000/gateway/source-thumbnail-contexts/clipm%3Arecent")
  })
})
