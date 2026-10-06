import { createXiraniteSystemClient } from "@xiranite/api/client"
import { getRuntimeConnectionInfo, type RuntimeConnectionInfo } from "./runtimeConnectionInfo"
import { hydrateLocalBackendConfig, resolveLocalBackendConfig, setLocalBackendConfig, type LocalBackendConfig } from "./localBackendConfig"

export type LocalBackendStatusKind = "ready" | "missing-config" | "unreachable"

export interface LocalBackendStatus {
  status: LocalBackendStatusKind
  runtime: RuntimeConnectionInfo
  config?: LocalBackendConfig
  error?: string
}

const DEFAULT_HEALTH_TIMEOUT_MS = 2_000

export async function checkLocalBackendStatus(timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS): Promise<LocalBackendStatus> {
  await hydrateLocalBackendConfig()
  const runtime = getRuntimeConnectionInfo()
  let config: LocalBackendConfig

  try {
    config = resolveLocalBackendConfig()
  } catch (error) {
    // Nothing hydrated the endpoint. A Tauri host that fails to answer `xiranite_bootstrap` already logged its
    // own reason during hydration, and the retired Wails bridge was the only thing that could hand that reason
    // to this window, so the local message naming the missing global/env is what the banner can show.
    return {
      status: "missing-config",
      runtime,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  try {
    const health = await checkHealth(config, timeoutMs)
    if (health.instanceId) {
      config = { ...config, instanceId: health.instanceId }
      setLocalBackendConfig(config)
    }
    return { status: "ready", runtime, config }
  } catch (error) {
    return unreachable(runtime, config, error)
  }
}

async function checkHealth(config: LocalBackendConfig, timeoutMs: number): Promise<{ ok: boolean; instanceId?: string }> {
  return await withTimeout(
    createXiraniteSystemClient(config.baseUrl, { token: config.token }).health(),
    timeoutMs,
    `Local backend health check timed out after ${timeoutMs}ms`,
  )
}

function unreachable(runtime: RuntimeConnectionInfo, config: LocalBackendConfig, error: unknown): LocalBackendStatus {
  return {
    status: "unreachable",
    runtime,
    config,
    error: error instanceof Error ? error.message : String(error),
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
