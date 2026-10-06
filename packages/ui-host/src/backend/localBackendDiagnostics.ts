import type { LocalBackendStatus } from "./localBackendStatus"

/**
 * Reads the two globals the app already declares — `window.__XIRANITE_BACKEND__` from
 * `src/lib/xiraniteApiClient` and `window.__xiraniteDebug` from `src/lib/startupDebug`. Re-declaring them here
 * with weaker shapes is what made TypeScript reject the file: a global has one type, not one per reader.
 */
interface DiagnosticBackendConfig {
  baseUrl?: string
  instanceId?: string
}

export function formatLocalBackendDiagnostics(status: LocalBackendStatus | undefined): string {
  const injectedConfig = typeof window === "undefined" ? undefined : window.__XIRANITE_BACKEND__
  const startupEvents = typeof window === "undefined" ? undefined : window.__xiraniteDebug?.events
  const lines = [
    "Xiranite local backend diagnostic",
    `capturedAt=${new Date().toISOString()}`,
    `status=${status?.status ?? "unknown"}`,
    `error=${status?.error ?? "<none>"}`,
    `runtime=${formatJson(status?.runtime ?? null)}`,
    `statusConfig=${formatJson(sanitizeConfig(status?.config))}`,
    `injectedConfig=${formatJson(sanitizeConfig(injectedConfig))}`,
    `location=${typeof window === "undefined" ? "<non-browser>" : window.location.href}`,
    `userAgent=${typeof navigator === "undefined" ? "<unknown>" : navigator.userAgent}`,
  ]

  if (startupEvents?.length) {
    lines.push(`startupDebugEvents=${formatJson(startupEvents.slice(-50))}`)
  } else {
    lines.push("startupDebugEvents=<none>")
  }

  return lines.join("\n")
}

function sanitizeConfig(config: DiagnosticBackendConfig | undefined): DiagnosticBackendConfig | null {
  if (!config) return null
  return {
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.instanceId ? { instanceId: config.instanceId } : {}),
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (nestedValue instanceof Error) {
        return { name: nestedValue.name, message: nestedValue.message, stack: nestedValue.stack }
      }
      if (typeof nestedValue === "bigint") return `${nestedValue}n`
      return nestedValue
    }) ?? "null"
  } catch {
    return "<unserializable>"
  }
}
