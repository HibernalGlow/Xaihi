#!/usr/bin/env node
import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { createCliHost, writeError, writeJson, writeLine, type CliHost } from "@xiranite/cli-runtime"

import { serializeLogEnvelope } from "./jsonl.js"
import { readLogDirectory, resolveLogDirectory } from "./node.js"
import { aggregateLogs, queryLogs, type LogQuery } from "./query.js"
import { LogSeverityTextSchema, type LogEnvelope, type LogSeverityText } from "./schema.js"

const HELP = `xlogs <command> [options]

Commands:
  sessions                 List sessions
  query                    Query events
  tail                     Follow new events
  stats                    Aggregate counts
  errors                   Group errors by fingerprint
  show <event-id>          Show one event
  export --output <path>   Export matching strict JSONL
  doctor                   Validate files and envelopes
  tui                      Open the OpenTUI log explorer

Common options:
  --dir <path>             Log directory (default: XIRANITE_LOG_DIR or platform path)
  --level <severity>       Minimum severity
  --scope <prefix>         Scope prefix
  --event <name>           Event name
  --session <id>           Session id
  --search <text>          Full-text search
  --since <ISO timestamp>  Inclusive lower timestamp
  --until <ISO timestamp>  Inclusive upper timestamp
  --limit <number>         Result limit
  --json                    Emit JSON`

export async function runProgram(args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  const [command, ...rest] = args
  if (!command || command === "help" || command === "--help" || command === "-h") {
    writeLine(host, HELP)
    return
  }
  const parsed = parseCommonArgs(rest)
  const directory = resolveLogDirectory(parsed.values.dir, host.env as NodeJS.ProcessEnv)

  if (command === "tui") {
    if (!host.stdin.isTTY || !host.stdout.isTTY) throw new Error("`xlogs tui` requires an interactive terminal.")
    const { runLogTui } = await import("./tui-runner.js")
    await runLogTui({ directory, host })
    return
  }

  if (command === "tail") {
    await tailLogs(directory, parsed.query, host)
    return
  }

  const result = await readLogDirectory(directory)
  const events = queryLogs(result.events, parsed.query)
  switch (command) {
    case "sessions": {
      const sessions = sessionRows(events)
      if (parsed.values.json) writeJson(host, sessions)
      else sessions.forEach((row) => writeLine(host, `${row.startedAt}  ${String(row.events).padStart(6)}  ${row.id}  ${row.processTypes.join(",")}`))
      return
    }
    case "query":
      if (parsed.values.json) writeJson(host, events)
      else events.forEach((event) => writeLine(host, formatEvent(event)))
      return
    case "stats":
      writeJson(host, aggregateLogs(events))
      return
    case "errors": {
      const errors = aggregateLogs(events).errors.map(({ fingerprint, count, sample }) => ({ fingerprint, count, sampleEventId: sample.id, message: sample.error?.message }))
      if (parsed.values.json) writeJson(host, errors)
      else errors.forEach((error) => writeLine(host, `${String(error.count).padStart(6)}  ${error.sampleEventId}  ${error.message ?? error.fingerprint}`))
      return
    }
    case "show": {
      const id = parsed.positionals[0]
      if (!id) throw new Error("show requires an event id")
      const event = result.events.find((item) => item.id === id)
      if (!event) throw new Error(`event not found: ${id}`)
      writeJson(host, event)
      return
    }
    case "export": {
      const output = parsed.values.output
      if (!output) throw new Error("export requires --output <path>")
      await writeFile(output, events.map(serializeLogEnvelope).join("\n") + (events.length ? "\n" : ""), "utf8")
      writeLine(host, `Exported ${events.length} events to ${output}`)
      return
    }
    case "doctor": {
      const report = { directory, files: result.files.length, events: result.events.length, issues: result.issues }
      if (parsed.values.json) writeJson(host, report)
      else writeLine(host, `${directory}\nfiles: ${report.files}\nevents: ${report.events}\nissues: ${report.issues.length}`)
      if (report.issues.length) process.exitCode = 1
      return
    }
    default:
      throw new Error(`Unknown log command: ${command}`)
  }
}

function parseCommonArgs(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      dir: { type: "string" }, level: { type: "string" }, scope: { type: "string" }, event: { type: "string" },
      session: { type: "string" }, search: { type: "string" }, since: { type: "string" }, until: { type: "string" },
      limit: { type: "string" }, output: { type: "string" }, json: { type: "boolean", default: false },
    },
  })
  const severity = parsed.values.level ? LogSeverityTextSchema.parse(parsed.values.level) : undefined
  const limit = parsed.values.limit === undefined ? undefined : Number.parseInt(parsed.values.limit, 10)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new Error("--limit must be a non-negative integer")
  const query: LogQuery = {
    ...(severity ? { minimumSeverity: severity as LogSeverityText } : {}),
    ...(parsed.values.scope ? { scopes: [parsed.values.scope] } : {}),
    ...(parsed.values.event ? { eventNames: [parsed.values.event] } : {}),
    ...(parsed.values.session ? { sessionIds: [parsed.values.session] } : {}),
    ...(parsed.values.search ? { search: parsed.values.search } : {}),
    ...(parsed.values.since ? { since: parsed.values.since } : {}),
    ...(parsed.values.until ? { until: parsed.values.until } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
  return { ...parsed, query }
}

function sessionRows(events: readonly LogEnvelope[]) {
  const sessions = new Map<string, { id: string; startedAt: string; events: number; processTypes: Set<string> }>()
  for (const event of events) {
    const row = sessions.get(event.session.id) ?? { id: event.session.id, startedAt: event.session.startedAt, events: 0, processTypes: new Set<string>() }
    row.events += 1
    row.processTypes.add(event.resource.processType)
    sessions.set(row.id, row)
  }
  return [...sessions.values()].map((row) => ({ ...row, processTypes: [...row.processTypes].sort() })).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function formatEvent(event: LogEnvelope): string {
  return `${event.timestamp}  ${event.severityText.toUpperCase().padEnd(5)}  ${event.scope.name}  ${event.eventName}${event.body ? `  ${event.body}` : ""}`
}

async function tailLogs(directory: string, query: LogQuery, host: CliHost): Promise<void> {
  const seen = new Set<string>()
  let stopped = false
  const stop = () => { stopped = true }
  process.once("SIGINT", stop)
  try {
    while (!stopped) {
      const result = await readLogDirectory(directory)
      for (const event of queryLogs(result.events, { ...query, order: "asc" })) {
        if (!seen.has(event.id)) {
          seen.add(event.id)
          writeLine(host, formatEvent(event))
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  } finally {
    process.removeListener("SIGINT", stop)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProgram().catch((error) => {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
