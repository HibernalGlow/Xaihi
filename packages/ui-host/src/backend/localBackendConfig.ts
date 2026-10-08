import { appendUrlPath } from "@xiranite/shared"
import { resolveBackendEndpoint, type BackendEndpoint } from "@/lib/xiraniteApiClient"

/**
 * The endpoint the host injected. Reading it is shared with the node UI seam (`@/lib/xiraniteApiClient`) so
 * both sides resolve one URL and token; hydrating it (injected global, env) stays shell-only. The retired Tauri
 * bootstrap channel used to be the last source; the desktop shell now publishes the endpoint through its own
 * surface, so there is nothing left for this module to ask for — guessing a port would be worse than saying so.
 */
export type LocalBackendConfig = BackendEndpoint

/**
 * Identifies a particular local backend process. Consumers that own
 * backend-derived state must reset when a replacement process takes over the
 * same endpoint.
 */
export function localBackendConnectionKey(config: LocalBackendConfig | undefined): string {
  if (!config) return ""
  return `${config.baseUrl}\0${config.token ?? ""}\0${config.instanceId ?? ""}`
}

declare global {
  interface Window {
    __XIRANITE_BACKEND__?: Partial<LocalBackendConfig>
  }
}

export function resolveLocalBackendConfig(): LocalBackendConfig {
  return resolveBackendEndpoint()
}

export function setLocalBackendConfig(config: Partial<LocalBackendConfig> | null | undefined): LocalBackendConfig | undefined {
  if (typeof window === "undefined") return undefined
  const normalizedConfig = normalizeLocalBackendConfig(config)
  if (!normalizedConfig) {
    delete window.__XIRANITE_BACKEND__
    return undefined
  }
  window.__XIRANITE_BACKEND__ = normalizedConfig
  return normalizedConfig
}

export async function hydrateLocalBackendConfig(options: { refresh?: boolean } = {}): Promise<LocalBackendConfig | undefined> {
  if (typeof window === "undefined") return undefined

  const existingConfig = normalizeLocalBackendConfig(window.__XIRANITE_BACKEND__)
  if (existingConfig && !options.refresh) return existingConfig

  if (existingConfig) return existingConfig

  const environmentConfig = normalizeLocalBackendConfig({
    baseUrl: import.meta.env.VITE_XIRANITE_BACKEND_URL,
    token: import.meta.env.VITE_XIRANITE_BACKEND_TOKEN,
  })
  if (environmentConfig) {
    window.__XIRANITE_BACKEND__ = environmentConfig
    return environmentConfig
  }

  return undefined
}

function normalizeLocalBackendConfig(config: Partial<LocalBackendConfig> | null | undefined): LocalBackendConfig | undefined {
  if (!config?.baseUrl) return undefined
  return {
    baseUrl: config.baseUrl,
    token: config.token,
    instanceId: config.instanceId,
  }
}

export function localBackendFileUrl(path: string): string {
  const config = resolveLocalBackendConfig()
  const url = localBackendUrl("/local-files", config)
  url.searchParams.set("path", path)
  if (config.token) url.searchParams.set("token", config.token)
  return url.href
}

export function localBackendUrl(path: string, config: LocalBackendConfig = resolveLocalBackendConfig()): URL {
  return appendUrlPath(config.baseUrl, path)
}
