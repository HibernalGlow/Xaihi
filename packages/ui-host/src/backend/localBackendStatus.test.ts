// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { checkLocalBackendStatus } from "./localBackendStatus"
import {
  hydrateLocalBackendConfig,
  localBackendConnectionKey,
  localBackendUrl,
} from "./localBackendConfig"
import { createXiraniteSystemClient } from "@xiranite/api/client"

const healthMock = vi.hoisted(() => vi.fn())

vi.mock("@xiranite/api/client", () => ({
  createXiraniteSystemClient: vi.fn(() => ({
    health: healthMock,
  })),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete window.__XIRANITE_BACKEND__
  delete (window as { __TAURI__?: unknown }).__TAURI__
})

describe("localBackendUrl", () => {
  test("preserves a gateway namespace while resolving backend paths", () => {
    expect(localBackendUrl("/file-deletions?limit=20", {
      baseUrl: "http://127.0.0.1:41500/_xiranite/backend",
      token: "gateway-token",
    }).href).toBe("http://127.0.0.1:41500/_xiranite/backend/file-deletions?limit=20")
  })
})

describe("localBackendConnectionKey", () => {
  test("changes when a replacement backend reports a new instance id", () => {
    const initial = localBackendConnectionKey({
      baseUrl: "http://127.0.0.1:3000",
      token: "stable-token",
      instanceId: "backend-instance-1",
    })
    const replacement = localBackendConnectionKey({
      baseUrl: "http://127.0.0.1:3000",
      token: "stable-token",
      instanceId: "backend-instance-2",
    })

    expect(replacement).not.toBe(initial)
  })
})

describe("checkLocalBackendStatus", () => {
  test("reports missing config without probing the backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
    const status = await checkLocalBackendStatus()

    expect(status.status).toBe("missing-config")
    expect(createXiraniteSystemClient).not.toHaveBeenCalled()
  })

  test("names the endpoint that was never injected when no host answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))

    const status = await checkLocalBackendStatus()

    // Nothing else can supply the channel now that the desktop host answers only xiranite_bootstrap, so the
    // local message is the whole diagnosis instead of a bridge-provided host reason.
    expect(status.status).toBe("missing-config")
    expect(status.error).toContain("Xiranite local backend is not configured")
    expect(status.error).toContain("VITE_XIRANITE_BACKEND_URL")
  })

  test("ignores a leftover Tauri global: the retired channel is not a config source any more", async () => {
    vi.stubEnv("VITE_XIRANITE_BACKEND_URL", "")
    vi.stubEnv("VITE_XIRANITE_BACKEND_TOKEN", "")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:41500", token: "tauri-token", instanceId: "host-1" })) },
    }

    const status = await checkLocalBackendStatus()

    // Positive control for the retirement: if the Tauri bootstrap channel were still consulted, this would
    // report `ready` on a baseUrl it was handed over `__TAURI__`. It must instead fall back to the browser face
    // and say the endpoint was never injected.
    expect(status.status).toBe("missing-config")
    expect(status.runtime.hostRuntime).toBe("web")
    await expect(hydrateLocalBackendConfig()).resolves.toBeUndefined()
    expect(window.__XIRANITE_BACKEND__).toBeUndefined()
  })

  test("reports ready when /health succeeds", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:3000", token: "test-token" }
    healthMock.mockResolvedValueOnce({ ok: true })

    const status = await checkLocalBackendStatus()

    expect(status.status).toBe("ready")
    expect(status.config?.baseUrl).toBe("http://127.0.0.1:3000")
    expect(createXiraniteSystemClient).toHaveBeenCalledWith("http://127.0.0.1:3000", { token: "test-token" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("uses a backend instance id instead of changing the public endpoint", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:5173", token: "stable-token" }
    healthMock.mockResolvedValueOnce({ ok: true, instanceId: "backend-instance-2" })

    const status = await checkLocalBackendStatus()

    expect(status.status).toBe("ready")
    expect(status.config).toEqual({
      baseUrl: "http://127.0.0.1:5173",
      token: "stable-token",
      instanceId: "backend-instance-2",
    })
    expect(window.__XIRANITE_BACKEND__).toEqual(status.config)
    expect(createXiraniteSystemClient).toHaveBeenCalledTimes(1)
    expect(createXiraniteSystemClient).toHaveBeenCalledWith("http://127.0.0.1:5173", { token: "stable-token" })
  })

  test("reports unreachable when /health fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:3000" }
    healthMock.mockRejectedValueOnce(new Error("connection refused"))

    const status = await checkLocalBackendStatus()

    expect(status.status).toBe("unreachable")
    expect(status.error).toContain("connection refused")
  })

  test("reports unreachable when /health hangs past the timeout", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:3000" }
    healthMock.mockReturnValueOnce(new Promise(() => {}))

    const statusPromise = checkLocalBackendStatus(25)
    await vi.advanceTimersByTimeAsync(25)
    const status = await statusPromise

    expect(status.status).toBe("unreachable")
    expect(status.error).toContain("timed out")
  })
})

describe("hydrateLocalBackendConfig", () => {
  test("keeps the injected stable endpoint even when explicitly refreshed", async () => {
    window.__XIRANITE_BACKEND__ = {
      baseUrl: "http://127.0.0.1:5173",
      token: "gateway-token",
      instanceId: "instance-1",
    }

    const config = await hydrateLocalBackendConfig({ refresh: true })

    expect(config).toEqual({ baseUrl: "http://127.0.0.1:5173", token: "gateway-token", instanceId: "instance-1" })
    expect(window.__XIRANITE_BACKEND__).toEqual(config)
  })

  test("does not perform browser-side backend discovery", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(hydrateLocalBackendConfig()).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
