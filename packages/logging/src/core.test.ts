import { describe, expect, it } from "vitest"
import { createLogEnvelope, type LogEnvelope, type LogResource, type LogSession } from "./schema.js"
import { parseLogJsonl, serializeLogEnvelope } from "./jsonl.js"
import { aggregateLogs, queryLogs } from "./query.js"

const resource: LogResource = { serviceName: "xiranite", processType: "frontend", runtimeName: "browser" }
const session: LogSession = { id: "session-test", startedAt: "2026-07-23T00:00:00.000Z" }

function event(overrides: Partial<Parameters<typeof createLogEnvelope>[0]> = {}): LogEnvelope {
  return createLogEnvelope({
    id: `event-${String(overrides.eventName ?? "default")}`,
    timestamp: "2026-07-23T00:00:01.000Z",
    observedTimestamp: "2026-07-23T00:00:01.001Z",
    severityText: "info",
    eventName: "reader.opened",
    resource,
    scope: { name: "neoview.reader" },
    session,
    ...overrides,
  })
}

describe("logging core", () => {
  it("serializes one strict envelope per JSONL line", () => {
    const first = event({ eventName: "reader.opened" })
    const second = event({ eventName: "reader.failed", severityText: "error", error: { name: "Error", message: "failed" } })
    const result = parseLogJsonl(`${serializeLogEnvelope(first)}\n${serializeLogEnvelope(second)}\n`)

    expect(result.issues).toEqual([])
    expect(result.events.map((item) => item.eventName)).toEqual(["reader.opened", "reader.failed"])
    expect(result.events[1]?.severityNumber).toBe(17)
  })

  it("reports legacy text and malformed envelopes without losing valid events", () => {
    const valid = serializeLogEnvelope(event())
    const result = parseLogJsonl(`---- session legacy ----\n${valid}\n{"eventName":"missing-envelope"}\n`)

    expect(result.events).toHaveLength(1)
    expect(result.issues.map((item) => item.code)).toEqual(["invalid-json", "invalid-envelope"])
  })

  it("queries structured fields and aggregates error fingerprints", () => {
    const events = [
      event({ id: "a", eventName: "reader.opened", attributes: { bookId: "one" } }),
      event({ id: "b", eventName: "reader.failed", severityText: "error", error: { name: "Error", message: "book 123 failed" } }),
      event({ id: "c", eventName: "reader.failed", severityText: "error", error: { name: "Error", message: "book 456 failed" } }),
    ]

    expect(queryLogs(events, { minimumSeverity: "error", scopes: ["neoview"], search: "failed" })).toHaveLength(2)
    const aggregate = aggregateLogs(events)
    expect(aggregate.bySeverity).toEqual({ info: 1, error: 2 })
    expect(aggregate.errors).toHaveLength(1)
    expect(aggregate.errors[0]?.count).toBe(2)
  })
})
