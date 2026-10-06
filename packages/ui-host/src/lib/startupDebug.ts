import { createLogger, isLogLevelEnabled, onLogLevelChange } from "./logger"

const MAX_EVENTS = 500
const MAX_LONG_TASK_EVENTS = 50

const logger = createLogger("startup")

export interface StartupDebugEvent {
  sequence: number
  elapsedMs: number
  label: string
  detail?: unknown
}

interface StartupDebugController {
  enabled: boolean
  startedAt: number
  events: StartupDebugEvent[]
  mark: (label: string, detail?: unknown) => void
}

declare global {
  interface Window {
    __xiraniteDebug?: StartupDebugController
  }
}

let installed = false
let sequence = 0
let cleanupDebugObservers: (() => void) | undefined

export function isStartupDebugEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined" && isLogLevelEnabled("debug")
}

export function installStartupDebug(): void {
  if (installed || !isStartupDebugEnabled()) return
  installed = true

  const startedAt = performance.now()
  const events: StartupDebugEvent[] = []
  const controller: StartupDebugController = {
    enabled: true,
    startedAt,
    events,
    mark: startupDebug,
  }
  window.__xiraniteDebug = controller

  const handleWindowError = (event: ErrorEvent) => {
    startupDebug("window:error", {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    })
  }
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    startupDebug("window:unhandled-rejection", event.reason)
  }
  window.addEventListener("error", handleWindowError)
  window.addEventListener("unhandledrejection", handleUnhandledRejection)

  let expected = performance.now() + 250
  const eventLoopInterval = window.setInterval(() => {
    const now = performance.now()
    const lagMs = now - expected
    expected = now + 250
    if (lagMs >= 250) {
      startupDebug("event-loop:blocked", {
        lagMs: Math.round(lagMs),
        visibilityState: document.visibilityState,
        focused: document.hasFocus(),
      })
    }
  }, 250)

  const disconnectLongTaskObserver = observeLongTasks()
  cleanupDebugObservers = () => {
    window.removeEventListener("error", handleWindowError)
    window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    window.clearInterval(eventLoopInterval)
    disconnectLongTaskObserver()
    controller.enabled = false
    if (window.__xiraniteDebug === controller) delete window.__xiraniteDebug
    installed = false
  }

  startupDebug("debug:installed", { href: window.location.href })
}

export function uninstallStartupDebug(): void {
  cleanupDebugObservers?.()
  cleanupDebugObservers = undefined
}

function observeLongTasks(): () => void {
  if (typeof PerformanceObserver === "undefined") return () => undefined

  let observed = 0
  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (observed >= MAX_LONG_TASK_EVENTS) {
          observer.disconnect()
          return
        }
        observed += 1
        startupDebug("performance:long-task", {
          durationMs: Math.round(entry.duration * 10) / 10,
          startMs: Math.round(entry.startTime * 10) / 10,
          name: entry.name,
        })
      }
    })
    observer.observe({ type: "longtask", buffered: true })
    return () => observer.disconnect()
  } catch {
    // Chromium may not expose Long Task entries in every WebView build.
    return () => undefined
  }
}

export function startupDebug(label: string, detail?: unknown): void {
  if (!isStartupDebugEnabled()) return
  // React render markers can fire for every store subscription update. Keeping
  // them in DevTools or forwarding them to the local log server makes debug
  // mode itself capable of starving the page being diagnosed.
  if (isHotDebugLabel(label)) return

  const controller = typeof window !== "undefined" ? window.__xiraniteDebug : undefined
  if (!controller) return

  const event: StartupDebugEvent = {
    sequence: ++sequence,
    elapsedMs: Math.round((performance.now() - controller.startedAt) * 10) / 10,
    label,
    ...(detail === undefined ? {} : { detail }),
  }
  controller.events.push(event)
  if (controller.events.length > MAX_EVENTS) controller.events.shift()

  logger.debug(label, {
    sequence: event.sequence,
    elapsedMs: event.elapsedMs,
    ...(detail === undefined ? {} : { detail }),
  })
}

export function startupDebugAsync<T>(label: string, operation: () => T | PromiseLike<T>): Promise<T> {
  startupDebug(`${label}:begin`)
  const startedAt = performance.now()
  let result: T | PromiseLike<T>
  try {
    result = operation()
  } catch (error) {
    startupDebug(`${label}:error`, {
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      error,
    })
    return Promise.reject(error)
  }

  return Promise.resolve(result).then(
    (result) => {
      startupDebug(`${label}:end`, { durationMs: Math.round((performance.now() - startedAt) * 10) / 10 })
      return result
    },
    (error) => {
      startupDebug(`${label}:error`, {
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        error,
      })
      throw error
    },
  )
}

onLogLevelChange(() => {
  if (isStartupDebugEnabled()) installStartupDebug()
  else uninstallStartupDebug()
})

function isHotDebugLabel(label: string): boolean {
  return label.startsWith("react:") && label.includes("render")
    || label.includes("progressive-step")
    || label.includes("page-image:")
}
