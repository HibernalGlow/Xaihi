// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"

import { getNodeRunHistoryApiClient, resetApiClientCache } from "./xiraniteApiClient"

/**
 * The node run-history transport moved off `src/backend/nodeRunHistoryClient.ts` (a second endpoint resolver
 * and a second client cache) onto this shared factory, because ADR-0069 forbids a node's UI closure from
 * reaching `src/backend`. These tests pin the part that could silently break: which endpoint the client is
 * built against, the bearer header, and the fact that a replacement backend must not inherit a cached client.
 */
const ENDPOINT = { baseUrl: "http://127.0.0.1:5599", token: "tok-abc", instanceId: "inst-1" }

function injectEndpoint(endpoint: typeof ENDPOINT): void {
  ;(window as unknown as { __XIRANITE_BACKEND__: unknown }).__XIRANITE_BACKEND__ = endpoint
}

function stubJsonFetch(payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function firstCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0]
  return { url: new URL(String(url)), init: init as { headers?: Record<string, string> } }
}

describe("xiraniteApiClient node run-history client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetApiClientCache()
    delete (window as unknown as { __XIRANITE_BACKEND__?: unknown }).__XIRANITE_BACKEND__
  })

  test("lists through /node-run-history with the injected bearer token", async () => {
    injectEndpoint(ENDPOINT)
    const fetchMock = stubJsonFetch({ items: [], next: null, total: 0 })

    await getNodeRunHistoryApiClient().list({ nodeId: "repacku", limit: 5 })

    const { url, init } = firstCall(fetchMock)
    expect(url.pathname).toBe("/node-run-history")
    expect(url.searchParams.get("nodeId")).toBe("repacku")
    expect(url.searchParams.get("limit")).toBe("5")
    expect(init.headers?.["x-xiranite-token"]).toBe("tok-abc")
  })

  test("reuses one client per endpoint identity", () => {
    injectEndpoint(ENDPOINT)
    expect(getNodeRunHistoryApiClient()).toBe(getNodeRunHistoryApiClient())
  })

  test("rebuilds when the host restarts under a new instance (the reason reset exists)", () => {
    injectEndpoint(ENDPOINT)
    const before = getNodeRunHistoryApiClient()
    injectEndpoint({ ...ENDPOINT, instanceId: "inst-2", token: "tok-2" })
    const afterInjection = getNodeRunHistoryApiClient()
    expect(afterInjection).not.toBe(before)

    injectEndpoint(ENDPOINT)
    const afterReset = (resetApiClientCache(), getNodeRunHistoryApiClient())
    expect(afterReset).not.toBe(afterInjection)
  })

  test("a missing endpoint fails loudly instead of guessing a URL", () => {
    // Both resolution paths are switched off on purpose: leaving the Vite dev fallback in place would make
    // this assertion pass for the wrong reason on any machine that happens to set it.
    vi.stubEnv("VITE_XIRANITE_BACKEND_URL", "")
    delete (window as unknown as { __XIRANITE_BACKEND__?: unknown }).__XIRANITE_BACKEND__
    expect(() => getNodeRunHistoryApiClient()).toThrow(/not configured/)

    // Control: the same call answers as soon as the host injects an endpoint.
    injectEndpoint(ENDPOINT)
    expect(() => getNodeRunHistoryApiClient()).not.toThrow()
  })
})
