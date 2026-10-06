import { LOG_SEVERITY_NUMBERS, type LogEnvelope, type LogJsonValue, type LogSeverityText } from "./schema.js"

export interface LogQuery {
  minimumSeverity?: LogSeverityText
  maximumSeverity?: LogSeverityText
  scopes?: readonly string[]
  eventNames?: readonly string[]
  sessionIds?: readonly string[]
  processTypes?: readonly LogEnvelope["resource"]["processType"][]
  since?: string
  until?: string
  search?: string
  attributes?: Readonly<Record<string, LogJsonValue>>
  order?: "asc" | "desc"
  limit?: number
}

export interface LogAggregate {
  total: number
  bySeverity: Record<string, number>
  byScope: Record<string, number>
  byEvent: Record<string, number>
  bySession: Record<string, number>
  errors: Array<{ fingerprint: string; count: number; sample: LogEnvelope }>
}

export function queryLogs(events: readonly LogEnvelope[], query: LogQuery = {}): LogEnvelope[] {
  const search = query.search?.toLocaleLowerCase()
  const filtered = events.filter((event) => {
    if (query.minimumSeverity && event.severityNumber < LOG_SEVERITY_NUMBERS[query.minimumSeverity]) return false
    if (query.maximumSeverity && event.severityNumber > LOG_SEVERITY_NUMBERS[query.maximumSeverity]) return false
    if (query.scopes?.length && !query.scopes.some((scope) => event.scope.name === scope || event.scope.name.startsWith(`${scope}.`))) return false
    if (query.eventNames?.length && !query.eventNames.includes(event.eventName)) return false
    if (query.sessionIds?.length && !query.sessionIds.includes(event.session.id)) return false
    if (query.processTypes?.length && !query.processTypes.includes(event.resource.processType)) return false
    if (query.since && event.timestamp < query.since) return false
    if (query.until && event.timestamp > query.until) return false
    if (search && !searchableText(event).includes(search)) return false
    if (query.attributes && !Object.entries(query.attributes).every(([key, value]) => deepEqual(event.attributes[key], value))) return false
    return true
  })
  filtered.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id))
  if (query.order === "desc") filtered.reverse()
  return query.limit === undefined ? filtered : filtered.slice(0, Math.max(0, query.limit))
}

export function aggregateLogs(events: readonly LogEnvelope[]): LogAggregate {
  const bySeverity: Record<string, number> = {}
  const byScope: Record<string, number> = {}
  const byEvent: Record<string, number> = {}
  const bySession: Record<string, number> = {}
  const errors = new Map<string, { count: number; sample: LogEnvelope }>()
  for (const event of events) {
    increment(bySeverity, event.severityText)
    increment(byScope, event.scope.name)
    increment(byEvent, event.eventName)
    increment(bySession, event.session.id)
    if (event.error) {
      const fingerprint = errorFingerprint(event)
      const current = errors.get(fingerprint)
      if (current) current.count += 1
      else errors.set(fingerprint, { count: 1, sample: event })
    }
  }
  return {
    total: events.length,
    bySeverity,
    byScope,
    byEvent,
    bySession,
    errors: [...errors.entries()].map(([fingerprint, value]) => ({ fingerprint, ...value })).sort((a, b) => b.count - a.count),
  }
}

export function errorFingerprint(event: LogEnvelope): string {
  if (!event.error) return ""
  const topFrame = event.error.stack?.split("\n")[1]?.trim().replace(/:\d+:\d+/g, ":#: #") ?? ""
  return `${event.error.name}|${event.error.message.replace(/\d+/g, "#")}|${topFrame}`
}

function searchableText(event: LogEnvelope): string {
  return `${event.eventName}\n${event.body ?? ""}\n${event.scope.name}\n${event.error?.message ?? ""}\n${JSON.stringify(event.attributes)}`.toLocaleLowerCase()
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1
}

function deepEqual(left: LogJsonValue | undefined, right: LogJsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
