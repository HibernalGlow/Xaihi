import { createTauriRuntime, detectTauriRuntime } from "./adapters/tauri"
import { createWebRuntime } from "./adapters/web"
import type { RuntimeAdapterRegistration, RuntimeInterface } from "./runtime/runtime"
import { createBackend, type Backend } from "./services"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { createLogger } from "@/lib/logger"

const logger = createLogger("backend.runtime")

/**
 * Detection order is native first, browser last: inside a Tauri host the window manager is real, and a
 * popup fallback would silently swallow the frameless caption's controls.
 *
 * The desktop loopback channel is *not* an adapter: the host publishes it through `xiranite_bootstrap`,
 * which `localBackendConfig.ts` hydrates into `window.__XIRANITE_BACKEND__` before any of this runs, so
 * the WebView and the browser share the HTTP transport. `tauri` therefore overlays only the native
 * surface it actually has — windows — and delegates storage/fs/subprocess/nodeRunner to `web`. The
 * retired Wails and Deno Desktop bridges used to sit in front of all of it.
 */
const RUNTIME_FACTORIES: RuntimeAdapterRegistration[] = [
  { kind: "tauri", detect: detectTauriRuntime, factory: createTauriRuntime },
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
