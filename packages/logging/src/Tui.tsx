/* @jsxImportSource @opentui/react */
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { aggregateLogs, queryLogs } from "./query.js"
import type { LogEnvelope } from "./schema.js"

export interface LogTuiProps {
  events: readonly LogEnvelope[]
  directory: string
  onExit: () => void
}

export function LogTui({ events, directory, onExit }: LogTuiProps): ReactNode {
  const dimensions = useTerminalDimensions()
  const [sessionIndex, setSessionIndex] = useState(0)
  const [eventIndex, setEventIndex] = useState(0)
  const [minimumSeverity, setMinimumSeverity] = useState<"trace" | "info" | "warn" | "error">("trace")
  const sessions = useMemo(() => [...new Map(events.map((event) => [event.session.id, event.session])).values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [events])
  const session = sessions[Math.min(sessionIndex, Math.max(0, sessions.length - 1))]
  const visible = useMemo(() => queryLogs(events, { sessionIds: session ? [session.id] : [], minimumSeverity, order: "desc" }), [events, session, minimumSeverity])
  const selected = visible[Math.min(eventIndex, Math.max(0, visible.length - 1))]
  const stats = aggregateLogs(visible)
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") onExit()
    if (key.name === "up") setEventIndex((value) => Math.max(0, value - 1))
    if (key.name === "down") setEventIndex((value) => Math.min(Math.max(0, visible.length - 1), value + 1))
    if (key.name === "left") { setSessionIndex((value) => Math.max(0, value - 1)); setEventIndex(0) }
    if (key.name === "right") { setSessionIndex((value) => Math.min(Math.max(0, sessions.length - 1), value + 1)); setEventIndex(0) }
    if (key.name === "1") setMinimumSeverity("trace")
    if (key.name === "2") setMinimumSeverity("info")
    if (key.name === "3") setMinimumSeverity("warn")
    if (key.name === "4") setMinimumSeverity("error")
  })
  const eventWidth = Math.max(42, Math.floor(dimensions.width * 0.48))
  return <box width="100%" height="100%" flexDirection="column" backgroundColor="#101418">
    <box height={3} border borderColor="#5db0d7" paddingLeft={1} paddingRight={1} flexDirection="row">
      <box width={Math.min(52, Math.max(30, Math.floor(dimensions.width * 0.4)))}><text fg="#f2f5f7"><b>XIRANITE LOG EXPLORER</b>  {directory}</text></box>
      <box flexGrow={1} justifyContent="flex-end"><text fg="#9db0bc">1 trace  2 info  3 warn  4 error  |  arrows navigate  |  q exit</text></box>
    </box>
    <box flexGrow={1} flexDirection="row">
      <box width={30} border borderColor="#3f5968" flexDirection="column" paddingLeft={1}>
        <text fg="#5db0d7"><b>SESSIONS ({sessions.length})</b></text>
        {sessions.slice(0, Math.max(1, dimensions.height - 7)).map((item, index) => <text key={item.id} fg={index === sessionIndex ? "#ffffff" : "#82939d"}>{index === sessionIndex ? "> " : "  "}{item.startedAt.slice(0, 19)}{` ${item.id.slice(-6)}`}</text>)}
      </box>
      <box width={eventWidth} border borderColor="#3f5968" flexDirection="column" paddingLeft={1}>
        <text fg="#5db0d7"><b>EVENTS ({visible.length})</b>  {minimumSeverity}+  errors {stats.bySeverity.error ?? 0}</text>
        {visible.slice(0, Math.max(1, dimensions.height - 7)).map((event, index) => <text key={event.id} fg={index === eventIndex ? "#ffffff" : severityColor(event.severityText)}>{index === eventIndex ? "> " : "  "}{event.timestamp.slice(11, 23)} {event.severityText.toUpperCase().padEnd(5)} {event.eventName.slice(0, Math.max(8, eventWidth - 26))}</text>)}
      </box>
      <box flexGrow={1} border borderColor="#3f5968" flexDirection="column" paddingLeft={1} paddingRight={1}>
        <text fg="#5db0d7"><b>DETAIL</b></text>
        {selected ? <>
          <text fg="#f2f5f7">{selected.eventName}</text>
          <text fg="#9db0bc">{selected.timestamp}  {selected.scope.name}</text>
          <text fg="#d6dde1">{selected.body ?? "(no body)"}</text>
          {selected.error ? <text fg="#ff7b72">{selected.error.name}: {selected.error.message}{selected.error.stack ? `\n${selected.error.stack}` : ""}</text> : null}
          <text fg="#9db0bc">{JSON.stringify(selected.attributes, null, 2)}</text>
        </> : <text fg="#82939d">No matching events</text>}
      </box>
    </box>
  </box>
}

function severityColor(severity: LogEnvelope["severityText"]): string {
  if (severity === "error" || severity === "fatal") return "#ff7b72"
  if (severity === "warn") return "#e3b341"
  if (severity === "debug" || severity === "trace") return "#82939d"
  return "#a5d6ff"
}
