import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  window.history.replaceState({}, "", "/")
  window.localStorage.clear()
  window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:41000", token: "test-token" }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("logger", () => {
  it("uses one persisted level for every scoped logger", async () => {
    const loggerModule = await import("./logger")
    const first = loggerModule.createLogger("reader")
    const second = loggerModule.createLogger("workspace")

    expect(loggerModule.getLogLevel()).toBe("info")
    expect(loggerModule.isLogLevelEnabled("debug")).toBe(false)

    loggerModule.setLogLevel("debug")

    expect(first.level).toBe(4)
    expect(second.level).toBe(4)
    expect(window.localStorage.getItem(loggerModule.LOG_LEVEL_STORAGE_KEY)).toBe("debug")
    expect(loggerModule.isLogLevelEnabled("debug")).toBe(true)
  })

  it("supports the query switch", async () => {
    window.history.replaceState({}, "", "/?log=trace")
    const loggerModule = await import("./logger")
    expect(loggerModule.getLogLevel()).toBe("trace")
  })

  it("batches enabled scoped logs into the authenticated structured transport", async () => {
    window.localStorage.setItem("xiranite.log.level", "debug")
    const { createLogger } = await import("./logger")

    createLogger("qa").debug("mounted", { componentId: "reader" })
    await vi.advanceTimersByTimeAsync(100)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe("http://127.0.0.1:41000/logs")
    expect(request?.headers).toMatchObject({ "x-xiranite-token": "test-token" })
    expect(JSON.parse(String(request?.body))).toMatchObject({
      events: [{
        schemaVersion: 1,
        severityText: "debug",
        severityNumber: 5,
        eventName: "qa.mounted",
        scope: { name: "qa" },
        resource: { serviceName: "xiranite", processType: "frontend" },
        attributes: { args: ["mounted", { componentId: "reader" }] },
      }],
    })
  })

  it("reports the backend response and stops retrying a broken remote transport", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: "log append failed",
      detail: { code: "EACCES", message: "permission denied" },
    }, { status: 500 })))
    const { createLogger } = await import("./logger")

    createLogger("qa").error("first failure")
    await vi.runAllTimersAsync()

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(consoleError).toHaveBeenCalledTimes(1)
    const transportError = consoleError.mock.calls[0]?.[1]
    expect(transportError).toBeInstanceOf(Error)
    expect((transportError as Error).message).toContain("POST http://127.0.0.1:41000/logs")
    expect((transportError as Error).message).toContain("HTTP 500")
    expect((transportError as Error).message).toContain("content-type=application/json")
    expect((transportError as Error).message).toContain('"code":"EACCES"')
    expect((transportError as Error).message).toContain('"message":"permission denied"')

    createLogger("qa").error("must stay local")
    await vi.runAllTimersAsync()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("exposes a runtime controller for temporary diagnostics", async () => {
    await import("./logger")

    window.__xiraniteLog?.setLevel("trace")

    expect(window.__xiraniteLog?.getLevel()).toBe("trace")
    expect(window.localStorage.getItem("xiranite.log.level")).toBe("trace")
  })
})
