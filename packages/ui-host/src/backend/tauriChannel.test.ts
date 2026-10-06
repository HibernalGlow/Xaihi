import { beforeEach, describe, expect, test, vi } from "vitest"

import { hydrateLocalBackendConfigFromTauri, parseTauriBootstrapPayload, readTauriInvoke } from "./tauriChannel"

describe("Tauri loopback channel (ADR-0065)", () => {
  beforeEach(() => {
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  test("only a WebView with an injected core.invoke counts as a Tauri host", () => {
    expect(readTauriInvoke(window)).toBeUndefined()

    const webView = { __TAURI__: { core: { invoke: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:41001" })) } } }
    expect(typeof readTauriInvoke(webView)).toBe("function")

    expect(readTauriInvoke({ __TAURI__: { core: {} } })).toBeUndefined()
  })

  test("accepts only a loopback base URL and drops an empty token", () => {
    expect(parseTauriBootstrapPayload({ baseUrl: "http://127.0.0.1:41001", token: "t", instanceId: "i" }))
      .toEqual({ baseUrl: "http://127.0.0.1:41001", token: "t", instanceId: "i" })
    expect(parseTauriBootstrapPayload({ baseUrl: "http://localhost", token: "t" })).toEqual({ baseUrl: "http://localhost", token: "t", instanceId: undefined })
    expect(parseTauriBootstrapPayload({ baseUrl: "https://example.com", token: "t" })).toBeUndefined()
    expect(parseTauriBootstrapPayload({ baseUrl: "http://10.0.0.5:8080", token: "t" })).toBeUndefined()
    expect(parseTauriBootstrapPayload({ token: "t" })).toBeUndefined()
    // A token-less channel would be an unauthenticated loopback; it is not accepted silently.
    expect(parseTauriBootstrapPayload({ baseUrl: "http://127.0.0.1:41001", token: "" })).toEqual({ baseUrl: "http://127.0.0.1:41001", token: undefined, instanceId: undefined })
  })

  test("hydrates the channel through the bootstrap command", async () => {
    const invoke = vi.fn(async () => ({ baseUrl: "http://127.0.0.1:41234", token: "bearer-xyz", instanceId: "host-7" }))
    const webView = { __TAURI__: { core: { invoke } } }

    await expect(hydrateLocalBackendConfigFromTauri(webView)).resolves.toEqual({
      baseUrl: "http://127.0.0.1:41234",
      token: "bearer-xyz",
      instanceId: "host-7",
    })
    /// The wrapper forwards its argument slot so one function serves the arg-less bootstrap and the window commands alike.
    expect(invoke).toHaveBeenCalledWith("xiranite_bootstrap", undefined)
  })

  test("returns undefined instead of throwing when the host cannot answer", async () => {
    const webView = { __TAURI__: { core: { invoke: vi.fn(async () => { throw new Error("no host") }) } } }
    await expect(hydrateLocalBackendConfigFromTauri(webView)).resolves.toBeUndefined()

    // A malformed payload is rejected the same way, so a broken host never leaves the app half-configured.
    const bad = { __TAURI__: { core: { invoke: vi.fn(async () => ({ baseUrl: "http://0.0.0.0:80" })) } } }
    await expect(hydrateLocalBackendConfigFromTauri(bad)).resolves.toBeUndefined()
  })

  test("the Tauri bootstrap channel is the desktop transport for the whole config chain", async () => {
    const { hydrateLocalBackendConfig } = await import("./localBackendConfig")
    vi.stubEnv("VITE_XIRANITE_BACKEND_URL", "")
    vi.stubEnv("VITE_XIRANITE_BACKEND_TOKEN", "")

    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:41500", token: "tauri-token", instanceId: "host-1" })) },
    }

    await expect(hydrateLocalBackendConfig()).resolves.toEqual({
      baseUrl: "http://127.0.0.1:41500",
      token: "tauri-token",
      instanceId: "host-1",
    })
  })
})
