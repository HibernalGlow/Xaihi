/**
 * Shared HTTP client factory for the Xiranite shell and the node UI layer.
 *
 * A node's React UI must stay extractable from Xiranite (ADR-0069), so it may only reach the backend through
 * `@xiranite/api/client` — never through `src/backend`, which owns host concerns (Tauri channel config
 * hydration, restart, native files). Endpoint resolution is therefore hoisted here: both sides read the same
 * injected endpoint, and only the shell knows *how* that endpoint got injected.
 *
 * The request/response shapes below are the protocol the Rust/Axum backend mirrors (ADR-0063); this module
 * only constructs clients, it does not reinterpret them.
 */
import {
  createSourceThumbnailClient,
  createXiraniteConfigClient,
  createXiraniteNodeClient,
  createXiraniteNodeRunHistoryClient,
  type SourceThumbnailClient,
  type XiraniteClientOptions,
  type XiraniteConfigClient,
  type XiraniteNodeClient,
  type XiraniteNodeRunHistoryClient,
} from "@xiranite/api/client"
import { appendUrlPath } from "@xiranite/shared"

/** The endpoint the host injected into this WebView/renderer process. */
export interface BackendEndpoint {
  baseUrl: string
  token?: string
  instanceId?: string
}

const TOKEN_HEADER = "x-xiranite-token"

export function readInjectedBackendEndpoint(): Partial<BackendEndpoint> | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { __XIRANITE_BACKEND__?: Partial<BackendEndpoint> }).__XIRANITE_BACKEND__
}

/**
 * Reads the endpoint without touching any Xiranite store: `window.__XIRANITE_BACKEND__` first (written by the
 * host hydrate paths in `src/backend/localBackendConfig.ts`), then the Vite-injected development fallback.
 */
export function resolveBackendEndpoint(): BackendEndpoint {
  const injected = readInjectedBackendEndpoint()
  const baseUrl = injected?.baseUrl ?? import.meta.env.VITE_XIRANITE_BACKEND_URL
  const token = injected?.token ?? import.meta.env.VITE_XIRANITE_BACKEND_TOKEN

  if (!baseUrl) {
    throw new Error("Xiranite local backend is not configured. Set window.__XIRANITE_BACKEND__ or VITE_XIRANITE_BACKEND_URL.")
  }

  return { baseUrl, token, instanceId: injected?.instanceId }
}

/** Identity of a backend process; clients must be rebuilt when it changes. */
export function backendEndpointKey(endpoint: BackendEndpoint): string {
  return `${endpoint.baseUrl}\n${endpoint.token ?? ""}\n${endpoint.instanceId ?? ""}`
}

export function getNodeApiClient(): XiraniteNodeClient {
  return cachedClient(nodeClientCache, createXiraniteNodeClient)
}

export function getConfigApiClient(): XiraniteConfigClient {
  return cachedClient(configClientCache, createXiraniteConfigClient)
}

export function getSourceThumbnailApiClient(): SourceThumbnailClient {
  return cachedClient(thumbnailClientCache, createSourceThumbnailClient)
}

/** The `/node-run-history` journal client, resolved per call like the other node-facing clients. */
export function getNodeRunHistoryApiClient(): XiraniteNodeRunHistoryClient {
  return cachedClient(runHistoryClientCache, createXiraniteNodeRunHistoryClient)
}

/** Drops every cached client; a replacement backend process must not inherit them. */
export function resetApiClientCache(): void {
  nodeClientCache.value = null
  nodeClientCache.key = null
  configClientCache.value = null
  configClientCache.key = null
  thumbnailClientCache.value = null
  thumbnailClientCache.key = null
  runHistoryClientCache.value = null
  runHistoryClientCache.key = null
}

/**
 * Builds an absolute backend URL. Query values are appended in insertion order and `undefined` entries are
 * skipped, which is what the `/operations` family and the nexus inbox endpoints expect.
 */
export function backendUrl(path: string, query?: Record<string, string | undefined>): URL {
  const url = appendUrlPath(resolveBackendEndpoint().baseUrl, path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
  }
  return url
}

export function backendRequestHeaders(extra?: HeadersInit): Record<string, string> {
  const { token } = resolveBackendEndpoint()
  const headers: Record<string, string> = { ...(extra as Record<string, string> | undefined) }
  if (token) headers[TOKEN_HEADER] = token
  return headers
}

/**
 * Fetch for backend endpoints the typed client does not cover yet. `no-store` matches the shell's existing
 * inbox behaviour: the WebView must not cache a poll target.
 */
export async function requestBackendApi(path: string, init?: RequestInit & { query?: Record<string, string | undefined> }): Promise<Response> {
  const { query, ...requestInit } = init ?? {}
  return await fetch(backendUrl(path, query), { cache: "no-store", ...requestInit, headers: backendRequestHeaders(requestInit.headers) })
}

interface ClientCache<TClient> {
  value: TClient | null
  key: string | null
}

const nodeClientCache: ClientCache<XiraniteNodeClient> = { value: null, key: null }
const configClientCache: ClientCache<XiraniteConfigClient> = { value: null, key: null }
const thumbnailClientCache: ClientCache<SourceThumbnailClient> = { value: null, key: null }
const runHistoryClientCache: ClientCache<XiraniteNodeRunHistoryClient> = { value: null, key: null }

function cachedClient<TClient>(
  cache: ClientCache<TClient>,
  create: (baseUrl: string, options: XiraniteClientOptions) => TClient,
): TClient {
  const endpoint = resolveBackendEndpoint()
  const key = backendEndpointKey(endpoint)
  if (cache.value && cache.key === key) return cache.value

  const client = create(endpoint.baseUrl, { token: endpoint.token })
  cache.value = client
  cache.key = key
  return client
}
