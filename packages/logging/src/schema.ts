import { z } from "zod"

export const LOG_SCHEMA_VERSION = 1 as const

export const LOG_SEVERITY_NUMBERS = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
} as const

export const LogSeverityTextSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal"])
export type LogSeverityText = z.infer<typeof LogSeverityTextSchema>

export type LogJsonValue = null | boolean | number | string | LogJsonValue[] | { [key: string]: LogJsonValue }

export const LogJsonValueSchema: z.ZodType<LogJsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(LogJsonValueSchema),
  z.record(z.string(), LogJsonValueSchema),
]))

export const LogResourceSchema = z.object({
  serviceName: z.string().min(1),
  serviceVersion: z.string().min(1).optional(),
  deploymentEnvironment: z.string().min(1).optional(),
  processType: z.enum(["frontend", "backend", "desktop", "cli", "test", "unknown"]),
  processId: z.number().int().nonnegative().optional(),
  runtimeName: z.string().min(1).optional(),
  runtimeVersion: z.string().min(1).optional(),
  hostRuntime: z.string().min(1).optional(),
  hostName: z.string().min(1).optional(),
}).strict()

export const LogScopeSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
}).strict()

export const LogSessionSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string().min(1),
}).strict()

export const LogErrorSchema = z.object({
  name: z.string().min(1),
  message: z.string(),
  stack: z.string().optional(),
  cause: LogJsonValueSchema.optional(),
}).strict()

export const LogTraceSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1).optional(),
  parentSpanId: z.string().min(1).optional(),
}).strict()

export const LogEnvelopeSchema = z.object({
  schemaVersion: z.literal(LOG_SCHEMA_VERSION),
  id: z.string().min(1),
  timestamp: z.string().min(1),
  observedTimestamp: z.string().min(1),
  severityText: LogSeverityTextSchema,
  severityNumber: z.number().int().min(1).max(24),
  eventName: z.string().min(1),
  body: z.string().optional(),
  attributes: z.record(z.string(), LogJsonValueSchema),
  resource: LogResourceSchema,
  scope: LogScopeSchema,
  session: LogSessionSchema,
  trace: LogTraceSchema.optional(),
  error: LogErrorSchema.optional(),
}).strict()

export type LogResource = z.infer<typeof LogResourceSchema>
export type LogScope = z.infer<typeof LogScopeSchema>
export type LogSession = z.infer<typeof LogSessionSchema>
export type LogError = z.infer<typeof LogErrorSchema>
export type LogTrace = z.infer<typeof LogTraceSchema>
export type LogEnvelope = z.infer<typeof LogEnvelopeSchema>

export interface CreateLogEnvelopeInput {
  severityText: LogSeverityText
  eventName: string
  resource: LogResource
  scope: LogScope
  session: LogSession
  timestamp?: string
  observedTimestamp?: string
  id?: string
  body?: string
  attributes?: Record<string, LogJsonValue>
  trace?: LogTrace
  error?: LogError
}

export function createLogEnvelope(input: CreateLogEnvelopeInput): LogEnvelope {
  const now = new Date().toISOString()
  return LogEnvelopeSchema.parse({
    schemaVersion: LOG_SCHEMA_VERSION,
    id: input.id ?? createLogId("event"),
    timestamp: input.timestamp ?? now,
    observedTimestamp: input.observedTimestamp ?? now,
    severityText: input.severityText,
    severityNumber: LOG_SEVERITY_NUMBERS[input.severityText],
    eventName: input.eventName,
    ...(input.body === undefined ? {} : { body: input.body }),
    attributes: input.attributes ?? {},
    resource: input.resource,
    scope: input.scope,
    session: input.session,
    ...(input.trace === undefined ? {} : { trace: input.trace }),
    ...(input.error === undefined ? {} : { error: input.error }),
  })
}

export function createLogSession(startedAt = new Date().toISOString()): LogSession {
  return { id: createLogId("session"), startedAt }
}

export function createLogId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}-${uuid}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
