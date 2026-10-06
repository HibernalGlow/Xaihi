/**
 * Integrity and origin enforcement for runtime-registered frontend plugins.
 *
 * Module Federation 2.9.2 ships neither: `mf-manifest.json` has no SRI field, the loader never
 * computes a hash, and `integrity`/`crossorigin` appear nowhere in its load path
 * (`docs/plugin-architecture.md` §6 第 5 条 — 「要做就只能自己做」). This file is that "自己".
 *
 * Why serving the bytes matters, not just checking them: registering a remote is lazy, so a
 * check-then-register flow would leave a window where the CDN returns verified bytes to the check and
 * different bytes to the runtime. The runtime's own loader is what makes that closable —
 * `loaderHook.lifecycle.fetch.emit(...)` is consulted first and its result is used verbatim
 * (`if (!res || !(res instanceof Response)) res = await fetch(...)` in
 * `@module-federation/runtime-core/dist/index.js`), so the response handed back here **is** the
 * response the remote is evaluated from.
 *
 * Scope, stated plainly: only URLs the installer pinned are verified, and only origins the
 * installer listed are fetched. A plugin's async chunks are fetched from the same origin but are not
 * covered unless they are pinned too — pinning a whole build is a per-file list today because MF
 * gives no manifest-of-hashes. That is a real limitation, not a solved problem.
 */

import type { ModuleFederationRuntimePlugin } from "@module-federation/runtime"

/** Absolute resource URL → expected SRI (`sha384-<base64>`). */
export type IntegrityPins = Readonly<Record<string, string>>

export interface PluginTrustRecord {
  readonly integrity: IntegrityPins
  readonly allowedOrigins: readonly string[]
}

const SRI_PATTERN = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/

const trustByPlugin = new Map<string, PluginTrustRecord>()
const verifiedResources = new Map<string, { bytes: Uint8Array; contentType: string }>()

/**
 * Records what a plugin is allowed to load and which bytes it must be.
 *
 * Called by whoever installs the plugin (today the dev page, later the PluginManager reading
 * `manifest.toml`). Empty/absent values are stored as "nothing pinned", which means pass-through —
 * the guard bites only where a human or a manifest declared an expectation.
 */
export function declarePluginTrust(pluginId: string, trust: Partial<PluginTrustRecord> = {}): void {
  trustByPlugin.set(pluginId, {
    integrity: trust.integrity ?? {},
    allowedOrigins: trust.allowedOrigins ?? [],
  })
  for (const url of Object.keys(trust.integrity ?? {})) verifiedResources.delete(url)
}

export function forgetPluginTrust(pluginId: string): void {
  trustByPlugin.delete(pluginId)
}

export function pluginTrust(pluginId: string): PluginTrustRecord | undefined {
  return trustByPlugin.get(pluginId)
}

/** `sha384-…` for these bytes, in the same spelling SRI uses. */
export async function computeSri(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-384", bytes as unknown as ArrayBuffer)
  const view = new Uint8Array(digest)
  let binary = ""
  for (const byte of view) binary += String.fromCharCode(byte)
  return `sha384-${btoa(binary)}`
}

/**
 * Throws unless `expected` (SRI) matches `bytes`.
 *
 * A missing algorithm we do not implement is an error rather than a pass: silently ignoring
 * `sha512-…` would make a pinned plugin look verified when nothing was checked.
 */
export async function assertSri(expected: string, bytes: Uint8Array, label: string): Promise<void> {
  const match = SRI_PATTERN.exec(expected.trim())
  if (!match) throw new Error(`integrity value for ${label} is not a usable SRI: "${expected}"`)
  if (match[1] !== "sha384") {
    throw new Error(`integrity algorithm ${match[1]} for ${label} is not implemented (only sha384)`)
  }
  const actual = await computeSri(bytes)
  if (actual !== `sha384-${match[2]}`) {
    throw new Error(`integrity mismatch for ${label}: expected sha384-${match[2]}, computed ${actual.slice(7)}`)
  }
}

// The pin-coverage rule now lives in `@xiranite/contract` (`src/pinCoverage.ts`), so the pre-install
// report, the hook below, and any build-time tooling answer from one implementation instead of three.
// Re-exported here because callers in the app reach for these names through this module.
export {
  classifyPluginArtifacts,
  enumeratePluginArtifacts,
  isResourceOriginAllowed,
  type PluginArtifact,
} from "@xiranite/contract"

import { isResourceOriginAllowed } from "@xiranite/contract"


/**
 * The one decision point every remote resource passes through.
 *
 * Returns `undefined` to let the runtime fetch normally, or a `Response` built from bytes that were
 * already checked against a pin.
 */
export async function resolveTrustedResource(
  url: string,
  pluginId: string | undefined,
): Promise<Response | undefined> {
  const trust = pluginId ? trustByPlugin.get(pluginId) : undefined
  if (!trust) return undefined

  const parsed = new URL(url, globalThis.location?.href)
  if (!isResourceOriginAllowed(trust.allowedOrigins, parsed.href)) {
    throw new Error(`plugin "${pluginId}" tried to load ${parsed.href} outside its allowed origins`)
  }

  const expected = trust.integrity[parsed.href]
  if (!expected) return undefined

  const key = parsed.href
  const cached = verifiedResources.get(key)
  if (cached) return new Response(cached.bytes.slice().buffer, { status: 200, headers: { "content-type": cached.contentType } })

  const response = await globalThis.fetch(key)
  if (!response.ok) throw new Error(`plugin "${pluginId}" resource ${key} returned ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await assertSri(expected, bytes, key)
  verifiedResources.set(key, { bytes, contentType: response.headers.get("content-type") ?? "application/javascript" })
  return new Response(bytes.slice().buffer, { status: 200, headers: { "content-type": response.headers.get("content-type") ?? "" } })
}

/**
 * The MF runtime plugin that wires the check into the loader.
 *
 * The cast is on `fetch` only: the hook's declared result union is `false | void | Promise<Response>`,
 * which does not name `undefined`, while the runtime's own consumption treats any non-`Response`
 * result as "fall through to the default fetch" — the behaviour this function relies on.
 */
export function integrityRuntimePlugin(): ModuleFederationRuntimePlugin {
  return {
    name: "xiranite-plugin-trust",
    fetch: (async (url: string, _init: RequestInit, remoteInfo?: { name?: string }) =>
      resolveTrustedResource(url, remoteInfo?.name)) as ModuleFederationRuntimePlugin["fetch"],
  }
}

/** Pre-flight so a plugin whose pinned bytes are already wrong never gets registered. */
export async function assertPluginResources(
  pluginId: string,
  urls: readonly string[],
): Promise<void> {
  for (const url of urls) {
    const trust = trustByPlugin.get(pluginId)
    const expected = trust?.integrity[url]
    if (!expected) continue
    const response = await globalThis.fetch(url)
    if (!response.ok) throw new Error(`${url} returned ${response.status}`)
    await assertSri(expected, new Uint8Array(await response.arrayBuffer()), url)
  }
}
