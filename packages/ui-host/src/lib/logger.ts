import { createConsola, LogLevels, type ConsolaInstance, type ConsolaReporter, type LogObject } from "consola"
import {
  createLogEnvelope,
  createLogSession,
  type LogError,
  type LogJsonValue,
  type LogSeverityText,
} from "@xiranite/logging"

export const LOG_LEVEL_STORAGE_KEY = "xiranite.log.level"

const REMOTE_BATCH_SIZE = 20
const REMOTE_QUEUE_LIMIT = 1_000
const REMOTE_FLUSH_DELAY_MS = 100
const REMOTE_RETRY_DELAY_MS = 1_000
const REMOTE_MAX_ATTEMPTS = 3
const REMOTE_ERROR_BODY_LIMIT = 8_192

export const xiraniteLogLevels = ["silent", "error", "warn", "info", "debug", "trace"] as const

export type XiraniteLogLevel = typeof xiraniteLogLevels[number]
export type XiraniteLogger = ConsolaInstance

interface XiraniteLogController {
  getLevel: () => XiraniteLogLevel
  setLevel: (level: XiraniteLogLevel) => void
  reset: () => void
}

declare global {
  interface Window {
    __xiraniteLog?: XiraniteLogController
  }
}

const loggers = new Map<string, ConsolaInstance>()
const levelListeners = new Set<(level: XiraniteLogLevel) => void>()
const remoteReporter = createRemoteReporter()
const rootLogger = createConsola({
  level: LogLevels.warn,
})

if (remoteReporter) rootLogger.addReporter(remoteReporter)

let currentLevel = resolveInitialLogLevel()
applyLevel(currentLevel)

export function createLogger(scope: string): XiraniteLogger {
  const normalizedScope = scope.trim() || "app"
  const cached = loggers.get(normalizedScope)
  if (cached) return cached

  const logger = rootLogger.withTag(`xiranite:${normalizedScope}`)
  logger.level = LogLevels[currentLevel]
  loggers.set(normalizedScope, logger)
  return logger
}

export function getLogLevel(): XiraniteLogLevel {
  return currentLevel
}

export function isLogLevelEnabled(level: Exclude<XiraniteLogLevel, "silent">): boolean {
  return LogLevels[level] <= LogLevels[currentLevel]
}

export function setLogLevel(level: XiraniteLogLevel, options: { persist?: boolean } = {}): void {
  if (!isXiraniteLogLevel(level)) throw new TypeError(`Unsupported Xiranite log level: ${String(level)}`)
  currentLevel = level
  applyLevel(level)
  notifyLevelListeners(level)

  if (options.persist !== false && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOG_LEVEL_STORAGE_KEY, level)
    } catch {
      // Storage can be unavailable in private or restricted WebViews.
    }
  }
}

export function resetLogLevel(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LOG_LEVEL_STORAGE_KEY)
    } catch {
      // Storage can be unavailable in private or restricted WebViews.
    }
  }
  currentLevel = defaultLogLevel()
  applyLevel(currentLevel)
  notifyLevelListeners(currentLevel)
}

export function onLogLevelChange(listener: (level: XiraniteLogLevel) => void): () => void {
  levelListeners.add(listener)
  listener(currentLevel)
  return () => levelListeners.delete(listener)
}

function installLogController(): void {
  if (typeof window === "undefined") return
  window.__xiraniteLog = {
    getLevel: getLogLevel,
    setLevel: setLogLevel,
    reset: resetLogLevel,
  }
}

function applyLevel(level: XiraniteLogLevel): void {
  const numericLevel = LogLevels[level]
  rootLogger.level = numericLevel
  for (const logger of loggers.values()) logger.level = numericLevel
}

function notifyLevelListeners(level: XiraniteLogLevel): void {
  for (const listener of levelListeners) listener(level)
}

function resolveInitialLogLevel(): XiraniteLogLevel {
  if (typeof window === "undefined") return defaultLogLevel()

  const params = new URLSearchParams(window.location.search)
  const queryLevel = params.get("log")
  if (isXiraniteLogLevel(queryLevel)) return queryLevel

  try {
    const storedLevel = window.localStorage.getItem(LOG_LEVEL_STORAGE_KEY)
    if (isXiraniteLogLevel(storedLevel)) return storedLevel
  } catch {
    // Fall through to the environment default.
  }

  return defaultLogLevel()
}

function defaultLogLevel(): XiraniteLogLevel {
  return "info"
}

function isXiraniteLogLevel(value: unknown): value is XiraniteLogLevel {
  return typeof value === "string" && (xiraniteLogLevels as readonly string[]).includes(value)
}

function createRemoteReporter(): ConsolaReporter | undefined {
  if (typeof window === "undefined") return undefined

  let flushTimer: number | undefined
  let flushInFlight = false
  let transportDisabled = false
  let droppedEvents = 0
  const pendingEvents: ReturnType<typeof createLogEnvelope>[] = []
  const session = createLogSession()
  const resource = {
    serviceName: "xiranite",
    serviceVersion: import.meta.env.VITE_APP_VERSION || undefined,
    deploymentEnvironment: import.meta.env.DEV ? "development" : "production",
    processType: "frontend" as const,
    runtimeName: "browser",
  }

  const scheduleFlush = (delay: number) => {
    if (!transportDisabled && flushTimer === undefined) flushTimer = window.setTimeout(flush, delay)
  }

  const flush = async () => {
    flushTimer = undefined
    if (transportDisabled || flushInFlight) return
    const backend = resolveLogBackend()
    if (!backend) {
      if (pendingEvents.length || droppedEvents) scheduleFlush(REMOTE_RETRY_DELAY_MS)
      return
    }
    if (droppedEvents) {
      pendingEvents.unshift(createLogEnvelope({
        severityText: "warn",
        eventName: "logging.events_dropped",
        body: `${droppedEvents} frontend log events were dropped because the transport queue was full.`,
        attributes: { droppedCount: droppedEvents, queueLimit: REMOTE_QUEUE_LIMIT },
        resource,
        scope: { name: "logging.transport" },
        session,
      }))
      droppedEvents = 0
    }
    const events = pendingEvents.splice(0, REMOTE_BATCH_SIZE)
    if (!events.length) return
    flushInFlight = true
    try {
      await sendRemoteBatch(backend, events)
    } catch (error) {
      transportDisabled = true
      pendingEvents.length = 0
      // Do not report transport failures through Consola: that would enqueue the
      // failure into the same broken transport and recreate the request storm.
      console.error("[xiranite:logging.transport] Remote logging disabled for this page after repeated failures.", error)
    } finally {
      flushInFlight = false
      if (pendingEvents.length) scheduleFlush(0)
    }
  }

  const sendRemoteBatch = async (
    backend: { baseUrl: string; token?: string },
    events: ReturnType<typeof createLogEnvelope>[],
  ): Promise<void> => {
    const endpoint = `${backend.baseUrl}/logs`
    let lastError: unknown
    for (let attempt = 1; attempt <= REMOTE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(backend.token ? { "x-xiranite-token": backend.token } : {}),
          },
          body: JSON.stringify({ events }),
          keepalive: true,
        })
        if (response.ok) return
        throw await createLogTransportError(response, endpoint, attempt)
      } catch (error) {
        lastError = error instanceof LogTransportError
          ? error
          : new LogTransportError(
              `POST ${endpoint} failed (attempt ${attempt}/${REMOTE_MAX_ATTEMPTS}) before receiving a response: ${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            )
      }
      if (attempt < REMOTE_MAX_ATTEMPTS) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, REMOTE_RETRY_DELAY_MS * attempt))
      }
    }
    throw lastError
  }

  return {
    log(logObject: LogObject) {
      if (transportDisabled) return
      if (pendingEvents.length >= REMOTE_QUEUE_LIMIT) {
        droppedEvents += 1
        return
      }
      pendingEvents.push(toLogEnvelope(logObject, resource, session))
      scheduleFlush(REMOTE_FLUSH_DELAY_MS)
    },
  }
}

class LogTransportError extends Error {
  override name = "LogTransportError"
}

async function createLogTransportError(response: Response, endpoint: string, attempt: number): Promise<LogTransportError> {
  const contentType = response.headers.get("content-type") || "unknown"
  let body = "<empty response body>"
  try {
    const responseText = await response.text()
    if (responseText) body = responseText.slice(0, REMOTE_ERROR_BODY_LIMIT)
  } catch (error) {
    body = `<failed to read response body: ${error instanceof Error ? error.message : String(error)}>`
  }
  return new LogTransportError(
    `POST ${endpoint} failed (attempt ${attempt}/${REMOTE_MAX_ATTEMPTS}): HTTP ${response.status} ${response.statusText || "Unknown"}; content-type=${contentType}; body=${body}`,
  )
}

function toLogEnvelope(
  logObject: LogObject,
  resource: Parameters<typeof createLogEnvelope>[0]["resource"],
  session: Parameters<typeof createLogEnvelope>[0]["session"],
) {
  const severityText = toSeverity(logObject.type)
  const values = [logObject.message, ...logObject.args].filter((value) => value !== undefined)
  const error = values.find((value): value is Error => value instanceof Error)
  const firstText = values.find((value): value is string => typeof value === "string")
  const scope = (logObject.tag ?? "app").replace(/^xiranite:/, "")
  return createLogEnvelope({
    timestamp: logObject.date.toISOString(),
    severityText,
    eventName: inferEventName(scope, firstText, severityText),
    body: firstText ?? error?.message,
    attributes: { args: values.map(serializeLogValue) },
    resource,
    scope: { name: scope },
    session,
    ...(error ? { error: serializeLogError(error) } : {}),
  })
}

function serializeLogValue(value: unknown): LogJsonValue {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
      ...(value.cause === undefined ? {} : { cause: serializeLogValue(value.cause) }),
    }
  }
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : JSON.parse(json) as LogJsonValue
  } catch {
    return String(value)
  }
}

function serializeLogError(error: Error): LogError {
  return {
    name: error.name || "Error",
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause === undefined ? {} : { cause: serializeLogValue(error.cause) }),
  }
}

function toSeverity(type: string): LogSeverityText {
  if (type === "trace" || type === "debug" || type === "info" || type === "warn" || type === "error" || type === "fatal") return type
  return "info"
}

function inferEventName(scope: string, message: string | undefined, severity: LogSeverityText): string {
  const normalized = message?.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 80)
  return `${scope}.${normalized || severity}`
}

function resolveLogBackend(): { baseUrl: string; token?: string } | undefined {
  const injected = window.__XIRANITE_BACKEND__
  const baseUrl = injected?.baseUrl ?? import.meta.env.VITE_XIRANITE_BACKEND_URL
  const token = injected?.token ?? import.meta.env.VITE_XIRANITE_BACKEND_TOKEN
  if (!baseUrl) return undefined
  return { baseUrl: baseUrl.replace(/\/$/, ""), ...(token ? { token } : {}) }
}

installLogController()
