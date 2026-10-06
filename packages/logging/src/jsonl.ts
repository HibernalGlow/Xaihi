import { LogEnvelopeSchema, type LogEnvelope } from "./schema.js"

export interface LogParseIssue {
  lineNumber: number
  code: "invalid-json" | "invalid-envelope"
  message: string
  raw: string
}

export interface LogParseResult {
  events: LogEnvelope[]
  issues: LogParseIssue[]
}

export function serializeLogEnvelope(event: LogEnvelope): string {
  return JSON.stringify(LogEnvelopeSchema.parse(event))
}

export function parseLogLine(raw: string, lineNumber = 1): { event?: LogEnvelope; issue?: LogParseIssue } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return { issue: { lineNumber, code: "invalid-json", message: error instanceof Error ? error.message : String(error), raw } }
  }

  const parsed = LogEnvelopeSchema.safeParse(value)
  if (!parsed.success) {
    return { issue: { lineNumber, code: "invalid-envelope", message: parsed.error.issues.map((item) => item.message).join("; "), raw } }
  }
  return { event: parsed.data }
}

export function parseLogJsonl(text: string): LogParseResult {
  const events: LogEnvelope[] = []
  const issues: LogParseIssue[] = []
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!
    if (!raw.trim()) continue
    const parsed = parseLogLine(raw, index + 1)
    if (parsed.event) events.push(parsed.event)
    if (parsed.issue) issues.push(parsed.issue)
  }
  return { events, issues }
}
