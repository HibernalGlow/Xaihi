import { createLogger } from "@/lib/logger"
import type { LocalBackendConfig } from "./localBackendConfig"

const logger = createLogger("backend.tauri-channel")

/**
 * ADR-0065: the WebView talks to the Rust backend over a loopback HTTP channel, and the only thing the
 * desktop runtime contributes is where that channel is. One command returns the triple for *this* host
 * process, so the port is never hardcoded, the bearer token never ships in a bundle, and a second window
 * or a restarted host is detected by `instanceId` rather than silently reused.
 *
 * The Tauri surface is read structurally instead of importing `@tauri-apps/api`: the dependency is not in
 * the bundle yet, `window.__TAURI__` is injected by the runtime when `app.withGlobalTauri` is on, and the
 * browser path must keep working without a Tauri type in the graph.
 */
const BOOTSTRAP_COMMAND = "xiranite_bootstrap"

export interface TauriBootstrapPayload {
  baseUrl?: unknown
  token?: unknown
  instanceId?: unknown
}

/**
 * The WebView surface is read structurally and typed as unknown: the Tauri global is injected by the
 * runtime, there is no @tauri-apps/api dependency in the bundle yet, and declaring the shape on Window
 * would make this file own a global type it does not control.
 */
export function readTauriInvoke(webView: unknown): ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined {
  const invoke = (webView as { __TAURI__?: { core?: { invoke?: unknown } } } | undefined)?.__TAURI__?.core?.invoke
  if (typeof invoke !== "function") return undefined
  // `args` has to be forwarded: `xiranite_bootstrap` takes none, but every window command does.
  return (command: string, args?: Record<string, unknown>) => (invoke as (command: string, args?: Record<string, unknown>) => Promise<unknown>)(command, args)
}

/** Validates the payload rather than trusting it: a partial channel must not half-configure the app. */
export function parseTauriBootstrapPayload(payload: unknown): LocalBackendConfig | undefined {
  const record = payload as TauriBootstrapPayload | null
  const baseUrl = typeof record?.baseUrl === "string" ? record.baseUrl : ""
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl)) return undefined
  const token = typeof record?.token === "string" && record.token.length > 0 ? record.token : undefined
  const instanceId = typeof record?.instanceId === "string" && record.instanceId.length > 0 ? record.instanceId : undefined
  return { baseUrl, token, instanceId }
}

/**
 * Returns the channel for this Tauri host, or undefined when the caller is not running inside one — the browser
 * dev server stays on its own injected `VITE_XIRANITE_BACKEND_URL` endpoint and never asks for a bootstrap.
 */
export async function hydrateLocalBackendConfigFromTauri(webView: unknown = typeof window === "undefined" ? undefined : window): Promise<LocalBackendConfig | undefined> {
  const invoke = readTauriInvoke(webView)
  if (!invoke) return undefined

  try {
    const config = parseTauriBootstrapPayload(await invoke(BOOTSTRAP_COMMAND))
    if (!config) {
      logger.error(`xiranite_bootstrap returned no usable loopback channel`)
      return undefined
    }
    return config
  } catch (error) {
    logger.error("xiranite_bootstrap failed", error)
    return undefined
  }
}
