import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { LogEnvelope, LogSeverityText } from "@xiranite/logging"
import type { LogxAction, LogxData, LogxInput } from "@xiranite/node-logx/core"
import { Activity, AlertTriangle, Bug, Code2, Cpu, FileJson2, Filter, Gauge, GitBranch, RefreshCw, ScrollText, Search, Server, ShieldCheck, TableProperties, TerminalSquare } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import type { LogxCardState, LogxCompactTab } from "./types"
import { RunStateIcon } from "@/nodes/shared/controls"

const SEVERITIES: LogSeverityText[] = ["trace", "debug", "info", "warn", "error", "fatal"]
const CONFIG_FIELDS = ["directory", "minimumSeverity", "limit", "order"] as const satisfies ReadonlyArray<keyof LogxCardState>

export function Component({ compId, host }: NodeComponentProps<LogxCardState, Partial<LogxCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const data = getData(host, compId)
  const dataRef = useRef(data)
  dataRef.current = data
  const autoRunRef = useRef(false)
  const [running, setRunning] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [compactTab, setCompactTab] = useState<LogxCompactTab>("query")
  const [defaults, setDefaults] = useState<Partial<LogxCardState>>()
  const result = data.result ?? null
  const selected = result?.events.find((event) => event.id === selectedId) ?? result?.events[0]
  const compact = surface.mode === "compact" || surface.mode === "portrait"
  const configDirty = Boolean(defaults && CONFIG_FIELDS.some((field) => JSON.stringify(data[field]) !== JSON.stringify(defaults[field])))

  useEffect(() => {
    const request = host.config?.get?.() ?? host.getNodeConfig?.()
    request?.then((response) => setDefaults(response.config)).catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (autoRunRef.current || dataRef.current.result || dataRef.current.phase) return
    autoRunRef.current = true
    void execute()
  }, [host, compId])

  function patch(next: Partial<LogxCardState>) {
    dataRef.current = { ...dataRef.current, ...next }
    if (host.state?.patchData) host.state.patchData(next)
    else host.patchData(compId, next)
  }

  async function execute(action: LogxAction = dataRef.current.action ?? "query") {
    if (running) return
    const run = host.runner?.run ?? host.actions?.run
    if (!run) { patch({ phase: "error", status: "当前环境没有本地日志运行能力。" }); return }
    setRunning(true)
    patch({ action, phase: "running", progress: 0, status: "正在读取轮转日志…", result: null })
    try {
      const response = await run<LogxInput, LogxData>("logx", toInput(action, dataRef.current), (event: NodeRunEvent) => {
        patch({ progress: event.progress ?? 0, status: event.message })
      }) as NodeRunResult<LogxData>
      patch({ phase: response.success ? "completed" : "error", progress: 100, status: response.message, result: response.data ?? null })
      setSelectedId(response.data?.events[0]?.id)
      if (compact && response.data) setCompactTab(action === "stats" || action === "errors" || action === "sessions" || action === "doctor" ? "summary" : "events")
    } catch (error) {
      patch({ phase: "error", status: error instanceof Error ? error.message : String(error) })
    } finally {
      setRunning(false)
    }
  }

  async function saveDefaults() {
    const next = Object.fromEntries(CONFIG_FIELDS.flatMap((field) => dataRef.current[field] === undefined ? [] : [[field, dataRef.current[field]]])) as Partial<LogxCardState>
    if (host.config?.save) await host.config.save(next)
    else await host.saveNodeConfig?.(next)
    setDefaults(next)
  }

  const props: ViewProps = { data, result, selected, selectedId, running, configDirty, defaults, compactTab, onCompactTab: setCompactTab, onExecute: execute, onPatch: patch, onSelect: setSelectedId, onSaveDefaults: saveDefaults, onRestoreDefaults: () => defaults && patch(defaults) }
  return <TooltipProvider><div ref={surface.ref} data-testid="logx-surface" className="@container/logx flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
    {surface.mode === "collapsed" ? <CollapsedView {...props} /> : compact ? <CompactView {...props} portrait={surface.mode === "portrait"} /> : <FullView {...props} roomy={surface.mode === "expanded" || surface.mode === "workspace"} />}
  </div></TooltipProvider>
}

type ViewProps = {
  data: LogxCardState; result: LogxData | null; selected?: LogEnvelope; selectedId?: string; running: boolean; configDirty: boolean; defaults?: Partial<LogxCardState>; compactTab: LogxCompactTab
  onCompactTab: (tab: LogxCompactTab) => void; onExecute: (action?: LogxAction) => Promise<void>; onPatch: (patch: Partial<LogxCardState>) => void; onSelect: (id: string) => void; onSaveDefaults: () => Promise<void>; onRestoreDefaults: () => void
}

function CollapsedView(props: ViewProps) {
  const errors = props.result?.aggregate.bySeverity.error ?? 0
  return <div data-testid="logx-collapsed-view" className="relative flex h-full min-h-0 flex-1 items-center gap-2 overflow-hidden border bg-background px-3 py-2 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
    <div className={cn("grid size-8 shrink-0 place-items-center rounded-sm border", errors ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-primary")}><ScrollText className="size-4" /></div>
    <div className="min-w-0 flex-1"><div className="truncate font-mono text-sm font-semibold uppercase">LogX</div><div className="truncate font-mono text-[10px] text-muted-foreground">{props.running ? "ANALYZING" : `${props.result?.matchedCount ?? 0} EVT / ${errors} ERR`}</div></div>
    <IconButton label="刷新日志" disabled={props.running} onClick={() => props.onExecute()}><RunStateIcon className="size-4" icon={RefreshCw} running={props.running} /></IconButton>
  </div>
}

function CompactView(props: ViewProps & { portrait: boolean }) {
  return <div data-testid={props.portrait ? "logx-portrait-view" : "logx-compact-view"} className="flex min-h-0 flex-1 flex-col gap-2 bg-muted/15 p-2">
    <Header {...props} compact />
    <Tabs value={props.compactTab} onValueChange={(value) => props.onCompactTab(value as LogxCompactTab)} className="flex min-h-0 flex-1 flex-col">
      <TabsList variant="line" className="grid grid-cols-3"><TabsTrigger value="query">查询</TabsTrigger><TabsTrigger value="events">事件</TabsTrigger><TabsTrigger value="summary">统计</TabsTrigger></TabsList>
      <div className="min-h-0 flex-1 overflow-auto pt-2">{props.compactTab === "query" ? <QueryPanel {...props} /> : props.compactTab === "events" ? <EventPanel {...props} showDetail={props.portrait} /> : <SummaryPanel {...props} />}</div>
    </Tabs>
  </div>
}

function FullView(props: ViewProps & { roomy: boolean }) {
  if (props.roomy) return <RoomyWorkbench {...props} />
  return <div data-testid="logx-regular-view" className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/15 p-3">
    <Header {...props} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(210px,.8fr)_minmax(360px,1.4fr)] gap-3">
      <QueryPanel {...props} />
      <EventPanel {...props} />
    </div>
    <div className="grid h-40 shrink-0 grid-cols-2 gap-3"><DetailPanel {...props} /><SummaryPanel {...props} /></div>
  </div>
}

function RoomyWorkbench(props: ViewProps) {
  return <div data-testid="logx-workspace-view" className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/15 p-3">
    <Header {...props} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,20%)_minmax(0,1fr)] gap-3">
      <QueryPanel {...props} />
      <div className="grid min-h-0 grid-rows-[150px_82px_minmax(0,1fr)] gap-3">
        <TelemetryDeck {...props} />
        <SequenceStrip {...props} />
        <div className="grid min-h-0 grid-cols-[minmax(300px,35%)_minmax(0,65%)] border bg-background">
          <EventPanel {...props} embedded />
          <IncidentWorkbench {...props} />
        </div>
      </div>
    </div>
  </div>
}

function Header(props: ViewProps & { compact?: boolean }) {
  return <div className="flex h-11 shrink-0 items-center gap-3 border-b-2 border-primary pb-2">
    <div className="grid size-8 shrink-0 place-items-center rounded-sm border border-primary/50 bg-primary/10 text-primary"><ScrollText className="size-4" /></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-mono text-sm font-semibold uppercase">LogX</h2><Badge variant="outline" className="rounded-sm font-mono text-[9px] uppercase">{props.data.minimumSeverity ?? "info"}+</Badge>{props.result?.issues.length ? <Badge variant="destructive" className="rounded-sm font-mono text-[9px]">{props.result.issues.length} ISSUES</Badge> : null}</div>{props.compact ? null : <p className="truncate font-mono text-[10px] text-muted-foreground">{props.result?.directory ?? "STRICT JSONL / SESSION + RESOURCE / ROTATION"}</p>}</div>
    <NodeConfigButton nodeKey="logx" configDirty={props.configDirty} defaults={props.defaults as Record<string, unknown> | undefined} disabled={props.running} onResetOverride={props.onRestoreDefaults} onRestoreDefault={props.onRestoreDefaults} onSaveDefault={props.onSaveDefaults} />
    <Button size="sm" className="h-8 gap-1.5 rounded-sm font-mono text-xs uppercase" disabled={props.running} onClick={() => props.onExecute()}><RunStateIcon className="size-3.5" icon={RefreshCw} running={props.running} />查询</Button>
  </div>
}

function SequenceStrip(props: ViewProps) {
  const events = props.result?.events.slice(0, 6) ?? []
  return <section aria-label="事件序列" className="shrink-0 border bg-background px-3 py-2">
    <div className="mb-2 flex items-center justify-between"><PanelTitle icon={Activity} title="执行序列" meta={events.length ? `LATEST ${events.length}` : "NO DATA"} /><span className="font-mono text-[9px] text-muted-foreground">TIME DESC</span></div>
    <div className="grid grid-cols-6 gap-0">{events.length ? events.map((event, index) => <button key={event.id} type="button" className="group relative min-w-0 pt-3 text-left" onClick={() => props.onSelect(event.id)}><span className={cn("absolute left-0 right-0 top-1 h-px bg-border", index === 0 && "left-1/2", index === events.length - 1 && "right-1/2")} /><span className={cn("absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-sm border bg-background", severityRail(event.severityText), props.selected?.id === event.id && "ring-2 ring-primary/25")} /><span className="block truncate px-1 text-center font-mono text-[9px] font-medium group-hover:text-primary">{event.eventName}</span></button>) : <span className="col-span-6 py-1 font-mono text-[10px] text-muted-foreground">运行查询后显示最近事件序列。</span>}</div>
  </section>
}

function TelemetryDeck(props: ViewProps) {
  return <div className="grid min-h-0 grid-cols-3 gap-3">
    <StormMeter result={props.result} />
    <AnomalyMap result={props.result} />
    <SessionLedger result={props.result} />
  </div>
}

function StormMeter({ result }: Pick<ViewProps, "result">) {
  const rate = result?.telemetry?.eventsPerSecond ?? 0
  const intensity = result?.telemetry?.stormIntensity ?? 0
  return <section aria-label="Storm Meter" className="flex min-h-0 flex-col border bg-background p-3">
    <div className="flex items-center justify-between border-b pb-2"><PanelTitle icon={Gauge} title="Storm Meter" meta="LIVE RATE" /><Gauge className="size-4 text-primary" /></div>
    <div className="grid min-h-0 flex-1 place-items-center"><div className="text-center"><div className="font-mono text-3xl font-semibold tabular-nums text-primary">{formatRate(rate)}</div><div className="font-mono text-[9px] uppercase text-muted-foreground">Events / second</div></div></div>
    <Progress value={intensity * 100} className="h-1.5 bg-muted" label="Storm 强度" />
  </section>
}

function AnomalyMap({ result }: Pick<ViewProps, "result">) {
  const cells = result?.telemetry?.anomalyCells ?? EMPTY_ANOMALY_CELLS
  return <section aria-label="Anomaly Map" className="flex min-h-0 flex-col border bg-background p-3">
    <div className="flex items-center justify-between border-b pb-2"><PanelTitle icon={AlertTriangle} title="Anomaly Map" meta="16 TIME BUCKETS" /><AlertTriangle className="size-4 text-destructive" /></div>
    <div className="mt-2 grid min-h-0 flex-1 grid-cols-4 grid-rows-4 gap-1 border bg-muted/20 p-1.5">{cells.map((cell) => <div key={cell.index} title={`${cell.eventCount} events / score ${cell.weightedScore.toFixed(2)}`} className={cn("rounded-sm border border-transparent", anomalyTone(cell.intensity))} />)}</div>
  </section>
}

function SessionLedger({ result }: Pick<ViewProps, "result">) {
  const sessions = result?.sessions.slice(0, 6) ?? []
  return <section aria-label="Session Ledger" className="flex min-h-0 flex-col overflow-hidden border bg-background">
    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2"><PanelTitle icon={TableProperties} title="Session Ledger" meta={`${result?.sessions.length ?? 0} SESSIONS`} /><TableProperties className="size-4 text-muted-foreground" /></div>
    <div className="grid grid-cols-[minmax(0,1fr)_44px_42px] border-b px-3 py-1 font-mono text-[9px] uppercase text-muted-foreground"><span>ID</span><span className="text-right">Dur</span><span className="text-right">Evt</span></div>
    <ScrollArea className="min-h-0 flex-1"><div className="divide-y">{sessions.length ? sessions.map((session) => <div key={session.id} className="grid grid-cols-[minmax(0,1fr)_44px_42px] px-3 py-1.5 font-mono text-[9px]"><span className={cn("truncate text-primary", session.errorCount && "text-destructive")}>{session.id.slice(0, 8)}</span><span className="text-right">{sessionDuration(session.startedAt, result?.events ?? [])}</span><span className="text-right text-muted-foreground">{session.eventCount}</span></div>) : <p className="p-3 text-xs text-muted-foreground">尚无会话。</p>}</div></ScrollArea>
  </section>
}

function QueryPanel(props: ViewProps) {
  return <section aria-label="日志查询" className="flex min-h-0 flex-col gap-3 overflow-auto border bg-background p-3">
    <PanelTitle icon={Filter} title="结构化查询" meta="SHARED TS CORE" />
    <Field label="日志目录"><Input value={props.data.directory ?? ""} placeholder="默认：%LOCALAPPDATA%/Xiranite/logs" onChange={(event) => props.onPatch({ directory: event.target.value })} /></Field>
    <div className="grid grid-cols-2 gap-2"><Field label="最低级别"><Select value={props.data.minimumSeverity ?? "info"} onValueChange={(value) => props.onPatch({ minimumSeverity: value as LogSeverityText })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((level) => <SelectItem key={level} value={level}>{level.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field><Field label="返回数"><Input type="number" min={1} max={5000} value={props.data.limit ?? 500} onChange={(event) => props.onPatch({ limit: Number(event.target.value) })} /></Field></div>
    <Field label="全文搜索"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={props.data.search ?? ""} placeholder="event、body、error、attributes" onChange={(event) => props.onPatch({ search: event.target.value })} /></div></Field>
    <Field label="Scope"><Input value={props.data.scope ?? ""} placeholder="neoview.reader" onChange={(event) => props.onPatch({ scope: event.target.value })} /></Field>
    <Field label="事件名"><Input value={props.data.eventName ?? ""} placeholder="reader.failed" onChange={(event) => props.onPatch({ eventName: event.target.value })} /></Field>
    <Field label="Session ID"><Input value={props.data.sessionId ?? ""} onChange={(event) => props.onPatch({ sessionId: event.target.value })} /></Field>
    <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" className="rounded-sm" onClick={() => props.onExecute("errors")}><Bug className="size-4" />错误聚类</Button><Button variant="outline" size="sm" className="rounded-sm" onClick={() => props.onExecute("doctor")}><ShieldCheck className="size-4" />完整性</Button></div>
    {props.data.phase === "running" ? <Progress value={props.data.progress ?? 0} /> : null}<p className="text-xs text-muted-foreground">{props.data.status ?? "选择条件后查询，不修改源日志。"}</p>
  </section>
}

function EventPanel(props: ViewProps & { showDetail?: boolean; embedded?: boolean }) {
  const events = props.result?.events ?? []
  return <section aria-label="日志事件" className={cn("flex min-h-0 flex-col overflow-hidden bg-background", props.embedded ? "border-r" : "border")}>
    <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/40 px-3"><PanelTitle icon={FileJson2} title={props.embedded ? "Raw Logs" : "实时事件流"} meta={`${events.length}/${props.result?.matchedCount ?? 0}`} /><Badge variant="outline" className="rounded-sm font-mono text-[9px] uppercase">TAIL ON</Badge></div>
    <ScrollArea className="min-h-0 flex-1"><div className="divide-y">{events.length ? events.map((event) => <button key={event.id} type="button" className={cn("relative grid w-full grid-cols-[64px_54px_minmax(0,1fr)] items-start gap-2 py-2 pl-4 pr-3 text-left before:absolute before:inset-y-0 before:left-0 before:w-1 hover:bg-muted/60", severityRail(event.severityText), props.selected?.id === event.id && "bg-primary/10 ring-1 ring-inset ring-primary/35")} onClick={() => props.onSelect(event.id)}><span className="font-mono text-[10px] text-muted-foreground">{event.timestamp.slice(11, 23)}</span><SeverityBadge severity={event.severityText} /><span className="min-w-0"><span className="block truncate font-mono text-xs font-semibold">{event.eventName}</span><span className="block truncate text-[11px] text-muted-foreground">[{event.scope.name}]{event.body ? ` ${event.body}` : ""}</span></span></button>) : <EmptyState />}</div></ScrollArea>
    {props.showDetail ? <div className="max-h-48 border-t p-2"><EventDetail event={props.selected} /></div> : null}
  </section>
}

function IncidentWorkbench(props: ViewProps) {
  const event = props.selected
  const cluster = props.result?.aggregate.errors.find((item) => item.sample.id === event?.id)
  const resources = uniqueResources(props.result?.events ?? [])
  return <section aria-label="Incident Anatomy" className="flex min-h-0 flex-col overflow-hidden bg-background">
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b bg-muted/60 px-4 py-2">
      <AlertTriangle className={cn("size-5 shrink-0", event?.error ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{event?.error ? `${event.error.name}: ${event.error.message}` : event ? event.eventName : "Incident Anatomy"}</h3><p className="truncate font-mono text-[9px] text-muted-foreground">TRACE {event?.id ?? "NONE"} / PROCESS {event?.resource.processType ?? "NONE"}</p></div>
      {event ? <SeverityBadge severity={event.severityText} /> : null}
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-12">
      <CauseChain event={event} />
      <div className="col-span-7 flex min-h-0 flex-col">
        <StackTrace event={event} />
        <div className="grid min-h-28 grid-cols-2 border-t">
          <div className="border-r p-3"><PanelTitle icon={Activity} title="Cluster Rate" meta="MATCHED SET" /><div className="mt-3 flex items-baseline gap-2"><span className="font-mono text-2xl font-semibold tabular-nums">{cluster?.count ?? (event?.error ? 1 : 0)}</span><span className="text-xs text-muted-foreground">instances</span></div><p className="mt-1 font-mono text-[9px] text-destructive">{props.result?.aggregate.errors.length ?? 0} ERROR CLUSTERS</p></div>
          <div className="p-3"><PanelTitle icon={Cpu} title="Affected Resources" meta={`${resources.length} NODES`} /><div className="mt-3 flex flex-wrap gap-1">{resources.length ? resources.slice(0, 5).map((resource) => <Badge key={resource} variant={resource === `${event?.resource.serviceName}/${event?.resource.processType}` ? "destructive" : "outline"} className="rounded-sm font-mono text-[8px]">{resource}</Badge>) : <span className="text-xs text-muted-foreground">无匹配资源。</span>}</div></div>
        </div>
      </div>
    </div>
  </section>
}

function CauseChain({ event }: { event?: LogEnvelope }) {
  const steps = event ? [
    { label: "Source Trigger", value: event.eventName, tone: "neutral" },
    { label: "Propagates To", value: `${event.scope.name} -> ${event.resource.serviceName}/${event.resource.processType}`, tone: "primary" },
    { label: "Failure Point", value: event.error ? `${event.error.name}: ${event.error.message}` : event.body || event.severityText, tone: event.error ? "error" : "primary" },
  ] : []
  return <div className="col-span-5 min-h-0 border-r p-3"><PanelTitle icon={GitBranch} title="Cause Chain" meta="EVENT ENVELOPE" /><div className="relative mt-4 space-y-4 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">{steps.length ? steps.map((step) => <div key={step.label} className="relative"><span className={cn("absolute -left-5 top-1 size-2 rounded-sm border bg-background", step.tone === "error" ? "border-destructive bg-destructive" : step.tone === "primary" ? "border-primary" : "border-muted-foreground")} /><div className={cn("mb-1 font-mono text-[9px] uppercase text-muted-foreground", step.tone === "error" && "text-destructive")}>{step.label}</div><div className={cn("border bg-muted/20 p-2 font-mono text-[10px]", step.tone === "primary" && "border-l-2 border-l-primary", step.tone === "error" && "border-destructive bg-destructive/5 text-destructive")}>{step.value}</div></div>) : <p className="text-xs text-muted-foreground">选择事件后生成因果链。</p>}</div></div>
}

function StackTrace({ event }: { event?: LogEnvelope }) {
  return <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 text-zinc-200"><div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-2"><Code2 className="size-4 text-emerald-300" /><span className="font-mono text-[10px] uppercase">Stack Trace</span></div><ScrollArea className="min-h-0 flex-1 p-3">{event?.error ? <div className="font-mono text-[10px]"><div className="mb-2 font-semibold text-red-400">{event.error.name}: {event.error.message}</div><pre className="whitespace-pre-wrap break-all leading-relaxed text-zinc-400">{event.error.stack || "(stack unavailable)"}</pre></div> : <p className="font-mono text-[10px] text-zinc-500">No exception stack selected.</p>}</ScrollArea></div>
}

function DetailPanel(props: ViewProps) {
  return <section aria-label="事件详情" className="flex min-h-0 flex-col overflow-hidden border bg-background"><div className="border-b bg-foreground px-3 py-2 text-background"><PanelTitle icon={TerminalSquare} title="Envelope" meta={props.selected?.id.slice(-8) ?? "NONE"} /></div><ScrollArea className="min-h-0 flex-1 p-3"><EventDetail event={props.selected} /></ScrollArea></section>
}

function SummaryPanel(props: ViewProps) {
  const aggregate = props.result?.aggregate
  return <section aria-label="日志统计" className="grid min-h-0 grid-cols-[1fr_1fr_1.1fr] overflow-hidden border bg-background"><div className="border-r p-2"><div className="font-mono text-[9px] uppercase text-muted-foreground">Storm Meter</div><div className="mt-2 font-mono text-xl font-semibold text-primary">{formatRate(props.result?.telemetry?.eventsPerSecond ?? 0)}</div><div className="text-[9px] text-muted-foreground">EVENTS/S</div></div><div className="border-r p-2"><div className="font-mono text-[9px] uppercase text-muted-foreground">Anomaly Map</div><div className="mt-2 grid grid-cols-4 gap-0.5">{(props.result?.telemetry?.anomalyCells ?? EMPTY_ANOMALY_CELLS).map((cell) => <div key={cell.index} className={cn("aspect-square rounded-[1px]", anomalyTone(cell.intensity))} />)}</div></div><div className="p-2"><PanelTitle icon={Server} title="Severity" meta={`${aggregate?.total ?? 0} EVT`} /><div className="mt-2 grid grid-cols-3 gap-1">{(["info", "warn", "error"] as const).map((level) => <Metric key={level} label={level} value={aggregate?.bySeverity[level] ?? 0} tone={level} />)}</div></div></section>
}

function EventDetail({ event }: { event?: LogEnvelope }) {
  if (!event) return <p className="text-xs text-muted-foreground">选择事件后查看 resource、session、attributes 和 error。</p>
  return <div className="space-y-3 text-xs"><div><div className="font-mono font-semibold">{event.eventName}</div><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{event.timestamp} / {event.scope.name}</div></div>{event.body ? <p className="whitespace-pre-wrap border-l-2 border-primary pl-2">{event.body}</p> : null}{event.error ? <div className="border border-destructive/40 bg-destructive/5 p-2 text-destructive"><div className="font-mono font-medium">{event.error.name}: {event.error.message}</div><pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px]">{event.error.stack}</pre></div> : null}<dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 font-mono text-[10px]"><dt className="text-muted-foreground">SESSION</dt><dd className="break-all">{event.session.id}</dd><dt className="text-muted-foreground">RESOURCE</dt><dd>{event.resource.serviceName} / {event.resource.processType}</dd></dl><pre className="overflow-auto whitespace-pre-wrap break-all border bg-muted/35 p-2 font-mono text-[10px]">{JSON.stringify(event.attributes, null, 2)}</pre></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1"><Label className="text-xs">{label}</Label>{children}</div> }
function PanelTitle({ icon: Icon, title, meta }: { icon: typeof Filter; title: string; meta: string }) { return <div className="flex min-w-0 items-center gap-2"><Icon className="size-4 shrink-0 text-primary" /><span className="font-mono text-xs font-semibold uppercase">{title}</span><span className="truncate font-mono text-[9px] text-muted-foreground">{meta}</span></div> }
function SeverityBadge({ severity }: { severity: LogSeverityText }) { return <Badge variant={severity === "error" || severity === "fatal" ? "destructive" : severity === "warn" ? "outline" : "secondary"} className="h-5 justify-center rounded-sm px-1 font-mono text-[8px] uppercase">{severity}</Badge> }
function Metric({ label, value, tone }: { label: string; value: number; tone: "info" | "warn" | "error" }) { return <div className={cn("border p-2", tone === "error" && "border-destructive/50", tone === "warn" && "border-amber-500/50")}><div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div><div className="font-mono text-lg font-semibold tabular-nums">{value}</div></div> }
function EmptyState() { return <div className="grid min-h-32 place-items-center p-4 text-center"><div><AlertTriangle className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">没有匹配事件。调整级别或过滤条件后重新查询。</p></div></div> }
function IconButton({ label, children, disabled, onClick }: { label: string; children: React.ReactNode; disabled?: boolean; onClick: () => void }) { return <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip> }

function severityRail(severity: LogSeverityText) {
  if (severity === "fatal" || severity === "error") return "before:bg-destructive border-destructive"
  if (severity === "warn") return "before:bg-amber-500 border-amber-500"
  if (severity === "debug" || severity === "trace") return "before:bg-muted-foreground border-muted-foreground"
  return "before:bg-primary border-primary"
}

const EMPTY_ANOMALY_CELLS = Array.from({ length: 16 }, (_, index) => ({ index, eventCount: 0, weightedScore: 0, intensity: 0 }))

function anomalyTone(intensity: number) {
  if (intensity >= 0.75) return "border-destructive/60 bg-destructive"
  if (intensity >= 0.45) return "border-destructive/30 bg-destructive/45"
  if (intensity >= 0.2) return "border-primary/30 bg-primary/40"
  if (intensity > 0) return "bg-primary/15"
  return "bg-muted"
}

function formatRate(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 }).format(value)
}

function sessionDuration(startedAt: string, events: readonly LogEnvelope[]) {
  const started = Date.parse(startedAt)
  const end = Math.max(started, ...events.filter((event) => event.session.startedAt === startedAt).map((event) => Date.parse(event.timestamp)).filter(Number.isFinite))
  return `${Math.max(0, Math.round((end - started) / 1_000))}s`
}

function uniqueResources(events: readonly LogEnvelope[]) {
  return [...new Set(events.map((event) => `${event.resource.serviceName}/${event.resource.processType}`))]
}

function toInput(action: LogxAction, data: LogxCardState): LogxInput {
  return { action, directory: data.directory, minimumSeverity: data.minimumSeverity ?? "info", scope: data.scope, eventName: data.eventName, sessionId: data.sessionId, search: data.search, since: data.since, until: data.until, limit: data.limit ?? 500, order: data.order ?? "desc" }
}

function getData(host: NodeComponentProps<LogxCardState, Partial<LogxCardState>>["host"], compId: string): LogxCardState {
  return host.state?.getData?.() ?? host.getData<LogxCardState>(compId) ?? {}
}
