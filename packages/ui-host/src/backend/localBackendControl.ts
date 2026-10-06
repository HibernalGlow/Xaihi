import { createXiraniteSystemClient, type LocalBackendRestartResult as ApiRestartResult } from "@xiranite/api/client"
import type { NodeMemoryProtectionSettingsDTO } from "@xiranite/shared"
import { resolveLocalBackendConfig, setLocalBackendConfig } from "./localBackendConfig"

/**
 * Restarting a backend process is a deleted capability (ADR-0063 puts the Axum host in-process with the Tauri
 * runtime, so there is no child to respawn). `restartLocalBackend` stays as the HTTP-only probe the settings
 * surface already uses: it reports whether the endpoint answers and whether the host supports the call at all.
 */
export type LocalBackendRestartSource = "http" | "none"

export interface LocalBackendControlRestartResult extends ApiRestartResult {
  source: LocalBackendRestartSource
}

export interface NodeSourceHotReloadState {
  supported: boolean
  enabled: boolean
}

export interface NodeMemoryProtectionState {
  supported: boolean
  settings: NodeMemoryProtectionSettingsDTO | null
}

export async function getNodeSourceHotReload(): Promise<NodeSourceHotReloadState> {
  const config = resolveLocalBackendConfig()
  return await createXiraniteSystemClient(config.baseUrl, { token: config.token }).getNodeSourceHotReload()
}

export async function setNodeSourceHotReload(enabled: boolean): Promise<NodeSourceHotReloadState> {
  const config = resolveLocalBackendConfig()
  return await createXiraniteSystemClient(config.baseUrl, { token: config.token }).setNodeSourceHotReload(enabled)
}

export async function getNodeMemoryProtection(): Promise<NodeMemoryProtectionState> {
  const config = resolveLocalBackendConfig()
  return await createXiraniteSystemClient(config.baseUrl, { token: config.token }).getNodeMemoryProtection()
}

export async function setNodeMemoryProtection(settings: NodeMemoryProtectionSettingsDTO): Promise<NodeMemoryProtectionState> {
  const config = resolveLocalBackendConfig()
  return await createXiraniteSystemClient(config.baseUrl, { token: config.token }).setNodeMemoryProtection(settings)
}

export async function restartLocalBackend(): Promise<LocalBackendControlRestartResult> {
  const httpResult = await restartLocalBackendViaHttp().catch((error) => ({
    restarted: false,
    supported: false,
    source: "http" as const,
    message: error instanceof Error ? error.message : String(error),
  }))

  if (httpResult.supported) return applyRestartResult(httpResult, "http")

  return httpResult
}

async function restartLocalBackendViaHttp(): Promise<LocalBackendControlRestartResult> {
  const config = resolveLocalBackendConfig()
  const result = await createXiraniteSystemClient(config.baseUrl, { token: config.token }).restartBackend()
  return { ...result, source: "http" }
}

function applyRestartResult(
  result: LocalBackendControlRestartResult,
  source: LocalBackendRestartSource,
): LocalBackendControlRestartResult {
  if (result.config?.baseUrl) setLocalBackendConfig(result.config)
  return { ...result, source }
}
