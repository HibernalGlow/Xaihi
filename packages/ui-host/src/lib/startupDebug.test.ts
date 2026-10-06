import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  window.localStorage.setItem("xiranite.log.level", "debug")
  window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:41000" }
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(window, "setInterval").mockReturnValue(0 as unknown as ReturnType<typeof window.setInterval>)
  fetchMock.mockClear()
})

afterEach(() => {
  window.localStorage.removeItem("xiranite.log.level")
  delete window.__XIRANITE_BACKEND__
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("startupDebug", () => {
  it("uninstalls diagnostics when the shared level is lowered", async () => {
    await import("./startupDebug")
    expect(window.__xiraniteDebug?.enabled).toBe(true)

    window.__xiraniteLog?.setLevel("warn")

    expect(window.__xiraniteDebug).toBeUndefined()
  })

  it("batches diagnostic events into one bounded transport request", async () => {
    const { startupDebug } = await import("./startupDebug")
    await vi.advanceTimersByTimeAsync(100)
    fetchMock.mockClear()

    startupDebug("qa:first", { ordinal: 1 })
    startupDebug("qa:second", { ordinal: 2 })
    await vi.advanceTimersByTimeAsync(100)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("http://127.0.0.1:41000/logs")
    expect(request?.method).toBe("POST")
    expect(JSON.parse(String(request?.body))).toMatchObject({
      events: [
        {
          severityText: "debug",
          eventName: "startup.qa.first",
          body: "qa:first",
          scope: { name: "startup" },
          attributes: { args: ["qa:first", { sequence: 2, detail: { ordinal: 1 } }] },
        },
        {
          severityText: "debug",
          eventName: "startup.qa.second",
          body: "qa:second",
          scope: { name: "startup" },
          attributes: { args: ["qa:second", { sequence: 3, detail: { ordinal: 2 } }] },
        },
      ],
    })
  })
})
