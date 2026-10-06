// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import {
  assertSri,
  computeSri,
  declarePluginTrust,
  forgetPluginTrust,
  resolveTrustedResource,
} from "./frontendIntegrity"

const SHA384_ABC = "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn"
const SHA384_EMPTY = "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"

const bytesOf = (text: string) => new TextEncoder().encode(text)

let fetchCalls: string[]
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  forgetPluginTrust("pinned")
  forgetPluginTrust("unpinned")
})

afterEach(() => {
  globalThis.fetch = originalFetch
  forgetPluginTrust("pinned")
  forgetPluginTrust("unpinned")
})

/** Serves `body` for every request and records who asked, so "was it fetched twice?" is measurable. */
function stubFetch(body: string, opts: { status?: number } = {}): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    return new Response(body, {
      status: opts.status ?? 200,
      headers: { "content-type": "application/javascript" },
    })
  }) as typeof fetch
}

describe("computeSri / assertSri", () => {
  test("matches the value openssl computes for the same bytes", async () => {
    // Expected values come from `printf abc | openssl dgst -sha384 -binary | openssl base64 -A`,
    // not from this function — otherwise the check proves nothing about the algorithm.
    expect(await computeSri(bytesOf("abc"))).toBe(SHA384_ABC)
    expect(await computeSri(bytesOf(""))).toBe(SHA384_EMPTY)
  })

  test("accepts the right bytes and rejects tampered ones", async () => {
    await expect(assertSri(SHA384_ABC, bytesOf("abc"), "ok.js")).resolves.toBeUndefined()
    await expect(assertSri(SHA384_ABC, bytesOf("abd"), "bad.js")).rejects.toThrow(/integrity mismatch/)
  })

  test("an algorithm we do not implement is an error, not a pass", async () => {
    await expect(assertSri("sha512-AAAA", bytesOf("abc"), "x.js")).rejects.toThrow(/not implemented/)
    await expect(assertSri("md5-AAAA", bytesOf("abc"), "x.js")).rejects.toThrow(/not a usable SRI/)
  })
})

describe("resolveTrustedResource", () => {
  test("passes through when nothing was declared for that plugin", async () => {
    stubFetch("whatever")
    expect(await resolveTrustedResource("http://127.0.0.1:4176/remoteEntry.js", undefined)).toBeUndefined()
    declarePluginTrust("unpinned", {})
    expect(await resolveTrustedResource("http://127.0.0.1:4176/remoteEntry.js", "unpinned")).toBeUndefined()
    expect(fetchCalls).toEqual([])
  })

  test("returns the verified bytes for a pinned url", async () => {
    stubFetch("abc")
    declarePluginTrust("pinned", { integrity: { "http://127.0.0.1:4176/remoteEntry.js": SHA384_ABC } })
    const response = await resolveTrustedResource("http://127.0.0.1:4176/remoteEntry.js", "pinned")
    expect(response).toBeInstanceOf(Response)
    expect(await response!.text()).toBe("abc")
    expect(fetchCalls).toHaveLength(1)
  })

  test("refuses to hand back bytes that do not match the pin", async () => {
    stubFetch("evil")
    declarePluginTrust("pinned", { integrity: { "http://127.0.0.1:4176/remoteEntry.js": SHA384_ABC } })
    await expect(resolveTrustedResource("http://127.0.0.1:4176/remoteEntry.js", "pinned")).rejects.toThrow(
      /integrity mismatch/,
    )
  })

  test("the second load is served from the verified bytes, not re-fetched (the TOCTOU claim)", async () => {
    const url = "http://127.0.0.1:4176/remoteEntry.js"
    stubFetch("abc")
    declarePluginTrust("pinned", { integrity: { [url]: SHA384_ABC } })
    await resolveTrustedResource(url, "pinned")

    // The origin now serves different bytes. If the guard only checked-then-allowed, this second
    // call would fetch and hand back the swapped body.
    stubFetch("swapped-after-verification")
    const cached = await resolveTrustedResource(url, "pinned")
    expect(await cached!.text()).toBe("abc")
    expect(fetchCalls).toEqual([url])
  })

  test("a non-ok response is an error rather than an empty module", async () => {
    stubFetch("", { status: 503 })
    declarePluginTrust("pinned", { integrity: { "http://127.0.0.1:4176/remoteEntry.js": SHA384_ABC } })
    await expect(resolveTrustedResource("http://127.0.0.1:4176/remoteEntry.js", "pinned")).rejects.toThrow(
      /returned 503/,
    )
  })

  test("declared origins bound where bytes may come from, without fetching", async () => {
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    declarePluginTrust("pinned", {
      integrity: { "https://cdn.example.com/remoteEntry.js": SHA384_ABC },
      allowedOrigins: ["http://127.0.0.1:4176"],
    })
    await expect(resolveTrustedResource("https://cdn.example.com/remoteEntry.js", "pinned")).rejects.toThrow(
      /outside its allowed origins/,
    )
    expect(spy).not.toHaveBeenCalled()
  })
})
