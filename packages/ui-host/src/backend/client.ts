import { createDshDesktopRuntime, detectDshDesktopRuntime } from "./adapters/dshDesktop"
import { createWebRuntime } from "./adapters/web"
import type { RuntimeAdapterRegistration, RuntimeInterface } from "./runtime/runtime"
import { createBackend, type Backend } from "./services"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { createLogger } from "@/lib/logger"

const logger = createLogger("backend.runtime")

/**
 * Detection order is the native desktop shell first (DSH Desktop / Electron, exposing
 * `window.dshDesktop.xaihiWindow` per ADR-0011), and the browser fallback last. The Tauri member was
 * retired with the shell that used to publish `window.__TAURI__`; anything only a native host could
 * answer now degrades through `web.ts`, which reports `supported: false` with a reason instead of
 * pretending (ADR-0011 decision 4).
 */
const RUNTIME_FACTORIES: RuntimeAdapterRegistration[] = [
  { kind: "electron", detect: detectDshDesktopRuntime, factory: createDshDesktopRuntime },
  { kind: "web", detect: () => true, factory: createWebRuntime },
]

let runtimePromise: Promise<RuntimeInterface> | null = null
let backendPromise: Promise<Backend> | null = null

function selectRuntime(): Promise<RuntimeInterface> {
  if (runtimePromise) return runtimePromise

  runtimePromise = (async () => {
    for (const registration of RUNTIME_FACTORIES) {
      try {
        startupDebug(`backend:runtime:${registration.kind}:detect:begin`)
        if (registration.detect()) {
          startupDebug(`backend:runtime:${registration.kind}:detected`)
          const runtime = await startupDebugAsync(`backend:runtime:${registration.kind}:factory`, registration.factory)
          if (runtime.kind !== "web") {
            await startupDebugAsync(`backend:runtime:${registration.kind}:capabilities`, () => runtime.windows.getCapabilities())
          }
          logger.info("Runtime selected", { runtime: runtime.kind })
          return runtime
        }
      } catch (error) {
        logger.warn("Runtime detection or initialization failed", { runtime: registration.kind }, error)
      }
    }

    throw new Error("No runtime available")
  })()

  return runtimePromise
}

export function getBackend(): Promise<Backend> {
  if (backendPromise) return backendPromise
  backendPromise = selectRuntime().then((runtime) => createBackend({ runtime }))
  return backendPromise
}

export async function getRuntime(): Promise<RuntimeInterface> {
  return selectRuntime()
}

export type { Backend } from "./services"
