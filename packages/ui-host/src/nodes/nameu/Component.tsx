import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NameuAction, NameuData, NameuInput, NameuMode, NameuPlanItem } from "@xiranite/node-nameu/core"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, CheckCircle2, Clipboard, Copy, FileArchive, FilePenLine, FolderInput, GitCompare, ListChecks, RotateCcw, ShieldAlert, Terminal, Trash2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PathTextarea } from "@/components/ui/path-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, MODES, NODE_ICON } from "./constants"
import type { NameuCardState, NameuStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps<NameuCardState, Partial<NameuCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("nameu")
  const data = getHostData(host, compId)
  const dataRef = useRef<NameuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<NameuCardState> | undefined>()
  const [configDirty, setConfigDirty] = useState(false)
  const [configPath, setConfigPath] = useState<string | undefined>()
  const [configLoading, setConfigLoading] = useState(false)

  const action = data.action ?? "plan"
  const actionMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[1]!
  const paths = splitLines(data.pathsText)
  const result = data.result ?? null
  const logs = data.logs ?? []
  const progress = data.progress ?? 0
  const status = statusFromState(data, running, result)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    void loadDefaults()
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.pathsText, data.mode, data.recursive, data.addArtistName, data.normalizeFolders, data.keepTimestamp, data.dryRun, defaults])

  function patch(patchData: Partial<NameuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    if (host.state?.patchData) host.state.patchData(patchData)
    else host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    patch({ logs: [...(dataRef.current.logs ?? []), message].slice(-120) })
  }

  async function pastePaths() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathsText: text.trim() })
  }

  async function copyResults() {
    const lines = (dataRef.current.result?.items ?? []).map((item) => `${item.status}\t${item.sourcePath}\t${item.targetName}\t${item.reason ?? ""}`)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ logs: [], phase: "idle", progress: 0, progressText: "", result: null })
  }

  async function saveAsDefault() {
    const config: Partial<NameuCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    setConfigLoading(true)
    try {
      if (host.config?.save) await host.config.save(config)
      else await host.saveNodeConfig?.(config)
      setDefaults(config)
      setConfigDirty(false)
    } finally {
      setConfigLoading(false)
    }
  }

  async function loadDefaults() {
    const loadConfig = host.config?.get?.() ?? host.getNodeConfig?.()
    if (!loadConfig) return

    setConfigLoading(true)
    try {
      const response = await loadConfig
      setDefaults(response.config)
      setConfigPath(response.path)
    } finally {
      setConfigLoading(false)
    }
  }

  async function openConfigFile() {
    await (host.config?.openFile?.() ?? host.openConfigFile?.())
  }

  async function execute(nextAction: NameuAction = action) {
    if (running) return
    if (!splitLines(dataRef.current.pathsText).length) {
      const message = "请先输入至少一个库目录或艺术家目录。"
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return
    }
    const run = host.runner?.run ?? host.actions?.run
    if (!run) {
      const message = "当前环境没有本地运行能力，请使用桌面模式或 CLI。"
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: `${actionLabel(nextAction)}开始`, result: null })
    try {
      const response = await run<NameuInput, NameuData>("nameu", buildInput(nextAction, dataRef.current), (event: NodeRunEvent) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<NameuData>
      patch({ phase: response.success ? "completed" : "error", progress: response.success ? 100 : 0, progressText: response.message, result: response.data ?? null })
      pushLog(response.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
    } finally {
      setRunning(false)
    }
  }

  const props: ViewProps = {
    action,
    actionMeta,
    configDirty,
    configLoading,
    configPath,
    data,
    defaults,
    logs,
    paths,
    progress,
    result,
    running,
    status,
    t,
    onActionChange: (value) => patch({ action: value }),
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onPastePaths: pastePaths,
    onPatch: patch,
    onLoadDefaults: loadDefaults,
    onOpenConfigFile: openConfigFile,
    onReset: reset,
    onRestoreDefault: () => defaults && patch(defaults),
    onSaveDefault: saveAsDefault,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/nameu flex h-full min-h-0 w-full overflow-hidden">
        {surface.mode === "collapsed" || forceCollapsedSurface ? (
          <CollapsedView {...props} />
        ) : compactSurface ? (
          portraitCompact ? <PortraitView {...props} /> : <CompactView {...props} />
        ) : (
          <FullView {...props} />
        )}
      </div>
    </TooltipProvider>
  )
}

interface ViewProps {
  action: NameuAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  data: NameuCardState
  defaults?: Partial<NameuCardState>
  logs: string[]
  paths: string[]
  progress: number
  result: NameuData | null
  running: boolean
  status: NameuStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: NameuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: NameuAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<NameuCardState>) => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

function CollapsedView(props: ViewProps) {
  const Icon = NODE_ICON
  return (
    <div data-testid="nameu-collapsed-view" className="flex h-full min-h-0 w-full items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}><Icon /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none"><span>NameU</span><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><ConfigManagement {...props} /><RunButton compact props={props} /></div>
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="nameu-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <ActionTools {...props} compact />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <div className="grid gap-1.5"><ActionTabs value={props.action} disabled={props.running} onChange={props.onActionChange} /><RunButton compact props={props} /></div>
        <ModeTabs value={props.data.mode ?? "multi"} disabled={props.running} onChange={(mode) => props.onPatch({ mode })} />
        <PathInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
        <SwitchPanel compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <div className="min-h-0 flex-1"><ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
      </div>
    </div>
  )
}

function PortraitView(props: ViewProps) {
  return (
    <div data-testid="nameu-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2"><HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} /><ConfigManagement {...props} /></div>
      <div className="grid gap-1.5"><ActionTabs value={props.action} disabled={props.running} onChange={props.onActionChange} /><RunButton compact props={props} /></div>
      <ModeTabs value={props.data.mode ?? "multi"} disabled={props.running} onChange={(mode) => props.onPatch({ mode })} />
      <PathInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
      <SwitchPanel compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
      <div className="min-h-0 flex-1"><ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="nameu-full-view" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex shrink-0 flex-col gap-2 @3xl/nameu:flex-row @3xl/nameu:items-center @3xl/nameu:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @3xl/nameu:flex-row @3xl/nameu:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
          <div data-testid="nameu-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-1"><ActionTools {...props} /></div>
        </div>
        <StatsPanel result={props.result} paths={props.paths} progress={props.progress} />
      </div>
      {(props.status.tone === "running" || props.status.tone === "error") && <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />}
      <div className="grid min-h-0 flex-1 gap-2 @2xl/nameu:grid-cols-[minmax(250px,330px)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <section className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card p-2">
            <div className="grid gap-2">
              <ZoneTitle icon={FolderInput} label="路径和规则" />
              <PathInput data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
              <ModeTabs value={props.data.mode ?? "multi"} disabled={props.running} onChange={(mode) => props.onPatch({ mode })} />
              <SwitchPanel data={props.data} disabled={props.running} onPatch={props.onPatch} />
            </div>
          </section>
          <ExecutionGate {...props} />
        </div>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"><ZoneTitle icon={GitCompare} label="改名计划" /><Badge variant="outline">{props.result?.items.length ?? props.paths.length}</Badge></div>
          <Separator />
          <div className="min-h-0 flex-1 p-2"><ResultTabs logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
        </section>
      </div>
    </div>
  )
}

function ActionTools(props: ViewProps & { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ConfigManagement {...props} />
      <IconButton icon={RotateCcw} label="清空状态" onClick={props.onReset} />
    </div>
  )
}

function ConfigManagement(props: ViewProps) {
  return (
    <NodeConfigPopover
      configPath={props.configPath}
      defaults={props.defaults as Record<string, unknown> | undefined}
      dirty={props.configDirty}
      disabled={props.running}
      loading={props.configLoading}
      t={props.t}
      onOpenFile={props.onOpenConfigFile}
      onReload={props.onLoadDefaults}
      onRestore={props.onRestoreDefault}
      onSave={props.onSaveDefault}
    />
  )
}

function ActionTabs(props: { disabled?: boolean; value: NameuAction; onChange: (value: NameuAction) => void }) {
  return (
    <Tabs value={props.value} onValueChange={(value) => props.onChange(value as NameuAction)} className="w-full">
      <TabsList aria-label="改名动作" variant="line" className="grid w-full grid-cols-3">
        {ACTIONS.map((item) => <TabsTrigger key={item.value} disabled={props.disabled} value={item.value}><item.icon /><span className="truncate">{item.shortLabel}</span></TabsTrigger>)}
      </TabsList>
    </Tabs>
  )
}

function ModeTabs(props: { disabled?: boolean; value: NameuMode; onChange: (value: NameuMode) => void }) {
  return (
    <Tabs value={props.value} onValueChange={(value) => props.onChange(value as NameuMode)} className="w-full">
      <TabsList aria-label="路径模式" variant="line" className="grid w-full grid-cols-2">
        {MODES.map((item) => <TabsTrigger key={item.value} disabled={props.disabled} value={item.value}><item.icon /><span className="truncate">{item.label}</span></TabsTrigger>)}
      </TabsList>
    </Tabs>
  )
}

function PathInput(props: { compact?: boolean; data: NameuCardState; disabled?: boolean; onPaste: () => void; onPatch: (patch: Partial<NameuCardState>) => void }) {
  return (
    <div className="grid gap-1.5">
      {!props.compact && <Label htmlFor="nameu-paths" className="text-xs">库目录或艺术家目录</Label>}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <PathTextarea id="nameu-paths" aria-label="nameu paths" className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-28")} disabled={props.disabled} placeholder={"每行一个目录\nD:/archives"} value={props.data.pathsText ?? ""} onValueChange={(pathsText) => props.onPatch({ pathsText })} />
        <div className="grid content-start gap-1.5"><IconButton disabled={props.disabled} icon={Clipboard} label="粘贴路径" onClick={props.onPaste} /><IconButton disabled={props.disabled || !props.data.pathsText} icon={Trash2} label="清空路径" onClick={() => props.onPatch({ pathsText: "" })} /></div>
      </div>
    </div>
  )
}

function SwitchPanel(props: { compact?: boolean; data: NameuCardState; disabled?: boolean; onPatch: (patch: Partial<NameuCardState>) => void }) {
  return (
    <div className={cn("grid gap-2", props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]")}>
      <SwitchRow checked={props.data.dryRun ?? true} disabled={props.disabled} icon={ShieldAlert} label="预览" onCheckedChange={(dryRun) => props.onPatch({ dryRun })} />
      <SwitchRow checked={props.data.addArtistName ?? true} disabled={props.disabled} icon={FilePenLine} label="补作者名" onCheckedChange={(addArtistName) => props.onPatch({ addArtistName })} />
      <SwitchRow checked={props.data.recursive ?? true} disabled={props.disabled} icon={FolderInput} label="递归" onCheckedChange={(recursive) => props.onPatch({ recursive })} />
      <SwitchRow checked={props.data.normalizeFolders ?? true} disabled={props.disabled} icon={ListChecks} label="整理目录" onCheckedChange={(normalizeFolders) => props.onPatch({ normalizeFolders })} />
    </div>
  )
}

function ExecutionGate(props: ViewProps) {
  const live = props.action === "rename" && !(props.data.dryRun ?? true)
  return (
    <section className={cn("flex shrink-0 flex-col gap-2 rounded-lg border bg-card p-2", live && "border-destructive/50 bg-destructive/[0.03]")}>
      <div className="flex items-center justify-between gap-2"><ZoneTitle icon={live ? AlertTriangle : ShieldAlert} label="执行" tone={live ? "danger" : "default"} /><Badge variant={live ? "destructive" : "outline"}>{props.data.dryRun ?? true ? "预览" : "写入"}</Badge></div>
      <ActionTabs value={props.action} disabled={props.running} onChange={props.onActionChange} />
      <RunButton props={props} />
    </section>
  )
}

function RunButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const label = actionLabel(props.action)
  return <ExecuteButton compact={compact} running={props.running} dangerous={props.action === "rename" && !(props.data.dryRun ?? true)} label={label} onExecute={() => props.onExecute(props.action)} />
}

function PlanRows(props: { items: NameuPlanItem[]; paths: string[] }) {
  if (!props.items.length) {
    const text = props.paths.length ? "运行预览后显示改名计划。" : "输入目录后预览改名计划。"
    return <div className="flex min-h-32 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">{text}</div>
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid gap-1.5 p-3">
        {props.items.slice(0, 180).map((item, index) => {
          const meta = itemStatusMeta(item.status)
          const StatusIcon = meta.icon
          return (
            <div key={`${item.sourcePath}:${index}`} className={cn("grid gap-1 rounded-md border px-2 py-1.5", item.status === "conflict" && "border-destructive/40", item.status === "error" && "border-destructive/40", item.status === "unchanged" && "opacity-75")}>
              <div className="flex min-w-0 items-start gap-2"><FileArchive className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><FilenameDiff source={item.sourceName} target={item.targetName} /><div className="mt-1 truncate text-[11px] text-muted-foreground">{item.artistName}{item.reason ? ` / ${item.reason}` : ""}</div></div><Badge variant={meta.variant} className="shrink-0 gap-1"><StatusIcon className="size-3" />{meta.label}</Badge></div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function FilenameDiff(props: { source: string; target: string }) {
  if (props.source === props.target) {
    return <div className="flex min-w-0 items-center gap-2"><span className="truncate font-mono text-xs">{props.source}</span><span className="shrink-0 text-[10px] text-muted-foreground">无需改名</span></div>
  }

  const { prefix, removed, added, suffix } = splitFilenameDiff(props.source, props.target)
  return (
    <div className="grid min-w-0 gap-1 font-mono text-[11px] leading-5">
      <div className="min-w-0 truncate text-muted-foreground"><span className="mr-1 text-[10px]">原</span>{prefix}<span className="rounded-sm bg-destructive/12 px-0.5 text-destructive line-through decoration-destructive/70">{removed}</span>{suffix}</div>
      <div className="min-w-0 truncate text-foreground"><span className="mr-1 text-[10px] text-muted-foreground">新</span>{prefix}<span className="rounded-sm bg-primary/15 px-0.5 text-primary">{added}</span>{suffix}</div>
    </div>
  )
}

function splitFilenameDiff(source: string, target: string) {
  const limit = Math.min(source.length, target.length)
  let start = 0
  while (start < limit && source[start] === target[start]) start += 1

  let sourceEnd = source.length
  let targetEnd = target.length
  while (sourceEnd > start && targetEnd > start && source[sourceEnd - 1] === target[targetEnd - 1]) {
    sourceEnd -= 1
    targetEnd -= 1
  }

  return {
    prefix: source.slice(0, start),
    removed: source.slice(start, sourceEnd),
    added: target.slice(start, targetEnd),
    suffix: source.slice(sourceEnd),
  }
}

function ResultTabs(props: { compact?: boolean; includePlan?: boolean; logs: string[]; result: NameuData | null; onCopyLogs: () => void; onCopyResults: () => void }) {
  const includePlan = props.includePlan ?? true
  return (
    <Tabs defaultValue={includePlan ? "plan" : "issues"} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">{includePlan && <TabsTrigger value="plan">计划</TabsTrigger>}<TabsTrigger value="issues">问题</TabsTrigger><TabsTrigger value="logs">日志</TabsTrigger></TabsList>
      {includePlan && <TabsContent value="plan" className="min-h-0 flex-1"><PlanPanel compact={props.compact} result={props.result} onCopy={props.onCopyResults} /></TabsContent>}
      <TabsContent value="issues" className="min-h-0 flex-1"><TextPanel empty="暂无问题" lines={[...(props.result?.errors ?? []), ...(props.result?.items ?? []).filter((item) => item.reason && item.status !== "ready").map((item) => `${item.sourcePath}: ${item.reason}`)]} /></TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1"><TextPanel actionLabel="复制" empty="运行日志会显示在这里。" icon={Terminal} lines={props.logs} onAction={props.onCopyLogs} /></TabsContent>
    </Tabs>
  )
}

function PlanPanel(props: { compact?: boolean; result: NameuData | null; onCopy: () => void }) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}><div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground"><GitCompare className="size-3.5" /><span>{props.result?.items.length ? `${props.result.items.length} 项` : "等待运行"}</span></div><Button disabled={!props.result?.items.length} size="xs" variant="ghost" onClick={props.onCopy}><Copy data-icon="inline-start" />复制</Button></div>
      <Separator />
      <PlanRows items={props.result?.items ?? []} paths={[]} />
    </section>
  )
}

function TextPanel(props: { actionLabel?: string; empty: string; icon?: LucideIcon; lines: string[]; onAction?: () => void }) {
  const Icon = props.icon
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"><span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{Icon && <Icon className="size-3.5" />}{props.lines.length ? `${props.lines.length} 行` : props.empty}</span>{props.onAction && <Button disabled={!props.lines.length} size="xs" variant="ghost" onClick={props.onAction}>{props.actionLabel ?? "复制"}</Button>}</div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">{props.lines.length ? <pre className="p-3 text-xs leading-5 text-muted-foreground">{props.lines.join("\n")}</pre> : <div className="flex min-h-24 items-center justify-center p-4 text-sm text-muted-foreground">{props.empty}</div>}</ScrollArea>
    </section>
  )
}

function HeaderLine(props: { status: NameuStatusMeta; subtitle: string }) {
  const Icon = NODE_ICON
  return <FloatingWindowNodeHeader><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}><Icon /></div><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold leading-none">NameU</h3><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{props.subtitle}</p></div></div></div></FloatingWindowNodeHeader>
}

function StatsPanel(props: { paths: string[]; progress: number; result: NameuData | null }) {
  const stats = [
    { label: "路径", value: props.paths.length },
    { label: "扫描", value: props.result?.scannedCount ?? 0 },
    { label: "待改", value: props.result?.readyCount ?? 0 },
    { label: "已改", value: props.result?.renamedCount ?? 0 },
    { label: "冲突", value: props.result?.conflictCount ?? 0 },
    { label: "进度", value: props.progress, suffix: "%" },
  ]
  return <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/nameu:grid-cols-6">{stats.map((item) => <div key={item.label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center"><div className="truncate text-[11px] text-muted-foreground">{item.label}</div><div className="text-sm font-semibold tabular-nums">{item.value}{item.suffix ?? ""}</div></div>)}</div>
}

function StatusStrip(props: { progress: number; status: NameuStatusMeta; text?: string }) {
  return <div className="rounded-md border bg-card p-2"><div className="mb-1 flex min-w-0 items-center justify-between gap-2"><div className="truncate text-xs font-medium">{props.text || props.status.description}</div><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div><Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} /></div>
}

function SwitchRow(props: { checked: boolean; disabled?: boolean; icon: LucideIcon; label: string; onCheckedChange: (checked: boolean) => void }) {
  const Icon = props.icon
  return <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5"><span className="flex min-w-0 items-center gap-1.5"><Icon className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-xs font-medium">{props.label}</span></span><Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} /></label>
}

function IconButton(props: { active?: boolean; disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  const Icon = props.icon
  return <Tooltip><TooltipTrigger asChild><Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant={props.active ? "secondary" : "outline"} onClick={props.onClick}><Icon /></Button></TooltipTrigger><TooltipContent>{props.label}</TooltipContent></Tooltip>
}

function ZoneTitle(props: { icon: LucideIcon; label: string; tone?: "default" | "danger" }) {
  const Icon = props.icon
  return <div className="flex shrink-0 items-center gap-1.5"><Icon className={cn("size-3.5", props.tone === "danger" ? "text-destructive" : "text-muted-foreground")} /><span className="text-xs font-semibold">{props.label}</span></div>
}

function statusFromState(data: NameuCardState, running: boolean, result: NameuData | null): NameuStatusMeta {
  if (running || data.phase === "running") return { label: "运行中", description: data.progressText || "NameU 正在扫描或改名。", tone: "running", badgeVariant: "secondary", iconClass: "bg-primary text-primary-foreground" }
  if (data.phase === "error" || result?.errorCount) return { label: "失败", description: data.progressText || result?.errors[0] || "上次任务失败，请查看问题列表。", tone: "error", badgeVariant: "destructive", iconClass: "bg-destructive text-destructive-foreground" }
  if (data.phase === "completed") return { label: "完成", description: data.progressText || "上次 NameU 任务已完成。", tone: "success", badgeVariant: "default", iconClass: "bg-primary text-primary-foreground" }
  return { label: "就绪", description: "输入目录后预览改名计划。", tone: "idle", badgeVariant: "outline", iconClass: "bg-secondary text-secondary-foreground" }
}

function itemStatusMeta(status: NameuPlanItem["status"]) {
  if (status === "renamed") return { icon: CheckCircle2, label: "已改", variant: "default" as const }
  if (status === "ready") return { icon: GitCompare, label: "待改", variant: "secondary" as const }
  if (status === "conflict") return { icon: AlertTriangle, label: "冲突", variant: "destructive" as const }
  if (status === "error") return { icon: XCircle, label: "错误", variant: "destructive" as const }
  if (status === "skipped") return { icon: AlertTriangle, label: "跳过", variant: "outline" as const }
  return { icon: CheckCircle2, label: "不变", variant: "outline" as const }
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result) return `${props.result.items.length} 项 / 待改 ${props.result.readyCount} / 冲突 ${props.result.conflictCount}`
  if (props.paths.length) return `${props.paths.length} 条路径 / ${props.actionMeta.shortLabel}`
  return props.actionMeta.description
}

function actionLabel(action: NameuAction): string {
  return ACTIONS.find((item) => item.value === action)?.label ?? action
}

function buildInput(action: NameuAction, data: NameuCardState): NameuInput {
  return {
    action,
    paths: splitLines(data.pathsText),
    mode: data.mode ?? "multi",
    recursive: data.recursive ?? true,
    addArtistName: data.addArtistName ?? true,
    normalizeFolders: data.normalizeFolders ?? true,
    keepTimestamp: data.keepTimestamp ?? true,
    dryRun: data.dryRun ?? true,
  }
}

function splitLines(value: unknown): string[] {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function getHostData(host: NodeComponentProps<NameuCardState, Partial<NameuCardState>>["host"], compId: string): NameuCardState {
  return host.state?.getData?.() ?? host.getData<NameuCardState>(compId) ?? {}
}
