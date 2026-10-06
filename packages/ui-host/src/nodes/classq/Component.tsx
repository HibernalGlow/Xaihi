import { useEffect, useMemo, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { ClassqAction, ClassqData, ClassqInput, ClassqPlanItem, ClassqTransferMode } from "@xiranite/node-classq/core"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, CheckCircle2, Clipboard, Copy, File, Folder, FolderOpen, GitBranch, ListTree, Play, RotateCcw, Search, Settings2, ShieldAlert, Terminal, Trash2, XCircle } from "lucide-react"
import { AnimatedBeam } from "@/components/ui/animated-beam"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PathTextarea } from "@/components/ui/path-input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tree, type TreeViewElement } from "@/components/ui/file-tree"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, NODE_ICON, PLAN_ICON, TRANSFER_MODES } from "./constants"
import type { ClassqCardState, ClassqStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps<ClassqCardState, Partial<ClassqCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("classq")
  const data = getHostData(host, compId)
  const dataRef = useRef<ClassqCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<ClassqCardState> | undefined>()
  const [configDirty, setConfigDirty] = useState(false)
  const [configPath, setConfigPath] = useState<string | undefined>()
  const [configLoading, setConfigLoading] = useState(false)

  const persistedAction = data.action ?? "plan"
  const [action, setAction] = useState<ClassqAction>(persistedAction)
  const actionMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[0]!
  const roots = splitLines(data.pathsText)
  const logs = data.logs ?? []
  const result = data.result ?? null
  const progress = data.progress ?? 0
  const status = statusFromState(data, running, result, t)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    void loadDefaults()
  }, [host])

  useEffect(() => {
    setAction(persistedAction)
  }, [persistedAction])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.pathsText, data.keyword, data.waitKeyword, data.transferMode, data.existingPolicy, data.dryRun, defaults])

  function patch(patchData: Partial<ClassqCardState>) {
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
    const lines = (dataRef.current.result?.items ?? []).map((item) => `${item.status}\t${item.stage}\t${item.sourcePath}\t${item.targetRelative}\t${item.reason ?? ""}`)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ logs: [], phase: "idle", progress: 0, progressText: "", result: null })
  }

  async function saveAsDefault() {
    const config: Partial<ClassqCardState> = {}
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

  async function execute(nextAction: ClassqAction = action) {
    if (running) return
    if (!splitLines(dataRef.current.pathsText).length) {
      const message = "Add at least one root directory before running ClassQ."
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return
    }
    const run = host.runner?.run ?? host.actions?.run
    if (!run) {
      const message = "Native execution is unavailable in this host. Use the desktop backend or CLI."
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return
    }

    setRunning(true)
    setAction(nextAction)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: t("status.started", "{{action}}已开始", { action: actionLabel(nextAction, t) }), result: null })
    try {
      const response = await run<ClassqInput, ClassqData>("classq", buildInput(nextAction, dataRef.current), (event: NodeRunEvent) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<ClassqData>
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
    progress,
    result,
    roots,
    running,
    status,
    t,
    onActionChange: (value) => {
      setAction(value)
      patch({ action: value })
    },
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
      <div ref={surface.ref} data-testid="classq-surface" className="@container/classq relative flex h-full min-h-0 w-full overflow-hidden">
        <div className="flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...props} />
          ) : compactSurface ? (
            portraitCompact ? <PortraitView {...props} /> : <CompactView {...props} />
          ) : (
            <FullView {...props} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

interface ViewProps {
  action: ClassqAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  data: ClassqCardState
  defaults?: Partial<ClassqCardState>
  logs: string[]
  progress: number
  result: ClassqData | null
  roots: string[]
  running: boolean
  status: ClassqStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: ClassqAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: ClassqAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<ClassqCardState>) => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
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

function CollapsedView(props: ViewProps) {
  const Icon = NODE_ICON
  return (
    <div data-testid="classq-collapsed-view" className="flex h-full min-h-0 w-full items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}><Icon /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none"><span>ClassQ</span><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><ConfigManagement {...props} /><RunButton compact props={props} /></div>
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="classq-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 px-3 pb-2 pt-3">
        <HeaderLine status={props.status} subtitle={viewSubtitle(props)} />
        <ActionTools {...props} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-3">
        <div className="grid shrink-0 gap-1.5 @lg/classq:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
          <RootInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
          <KeywordFields compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
        <ModeExecutionTabs compact props={props} />
        <div className="min-h-0 flex-1"><ResultTabs compact logs={props.logs} result={props.result} t={props.t} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
      </div>
    </div>
  )
}

function PortraitView(props: ViewProps) {
  return (
    <div data-testid="classq-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2"><HeaderLine status={props.status} subtitle={viewSubtitle(props)} /><ActionTools {...props} /></div>
      <RootInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
      <KeywordFields compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
      <ModeExecutionTabs compact props={props} />
      <div className="min-h-0 flex-1"><ResultTabs compact logs={props.logs} result={props.result} t={props.t} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="classq-full-view" className="flex min-h-0 flex-1 p-3">
      <SpatialWorkbench {...props} />
    </div>
  )
}

function IdentityCard(props: ViewProps) {
  return (
    <Card className="shrink-0 gap-0 py-0" data-testid="classq-identity-card">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
            <NODE_ICON />
          </div>
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xl">ClassQ</span>
              <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
            </CardTitle>
            <CardDescription className="mt-1 truncate text-xs">{props.t("identity.subtitle", "关键词递归分类工具")}</CardDescription>
          </div>
        </div>
        <CardAction>
          <ActionTools {...props} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 px-3 py-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {props.t("identity.description", "通过关键词递归识别目录，并把等待项路由到对应分类目标。")}
        </p>
        <MetricsStrip progress={props.progress} result={props.result} roots={props.roots} t={props.t} />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
      </CardContent>
    </Card>
  )
}

function CommandPanel(props: ViewProps) {
  return (
    <Card className="h-full min-h-0 gap-0 py-0" data-testid="classq-command-deck">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 />
          {props.t("command.title", "分类配置")}
        </CardTitle>
        <CardDescription className="text-xs">
          {props.t("command.description", "定义扫描根目录、关键词目录和等待目录规则。")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <div className="shrink-0 border-b p-3">
          <ModeExecutionTabs compact props={props} />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <FieldGroup className="gap-4 p-3">
            <Field>
              <FieldTitle className="text-xs">{props.t("command.input", "输入目录")}</FieldTitle>
              <FieldDescription className="text-xs">{props.t("command.inputDescription", "每行一个需要递归扫描的根目录。")}</FieldDescription>
              <CommandRootInput expanded data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} t={props.t} />
            </Field>
            <Field>
              <FieldTitle className="text-xs">{props.t("command.folders", "分类目录规则")}</FieldTitle>
              <FieldDescription className="text-xs">{props.t("command.foldersDescription", "关键词目录负责命中，等待目录接收同级待分类项。")}</FieldDescription>
              <div className="grid min-w-0 grid-cols-2 gap-1.5">
                <Input aria-label="classq keyword" className="h-8 min-w-0 font-mono text-xs" disabled={props.running} placeholder={props.t("fields.keyword", "关键词目录")} value={props.data.keyword ?? ""} onChange={(event) => props.onPatch({ keyword: event.currentTarget.value })} />
                <Input aria-label="classq wait" className="h-8 min-w-0 font-mono text-xs" disabled={props.running} placeholder={props.t("fields.wait", "等待目录")} value={props.data.waitKeyword ?? ""} onChange={(event) => props.onPatch({ waitKeyword: event.currentTarget.value })} />
              </div>
            </Field>
          </FieldGroup>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function CommandRootInput(props: { data: ClassqCardState; disabled?: boolean; expanded?: boolean; onPaste: () => void; onPatch: (patch: Partial<ClassqCardState>) => void; t: ViewProps["t"] }) {
  return (
    <InputGroup className="min-w-0 flex-1">
      <InputGroupTextarea aria-label="classq roots" className={cn(props.expanded ? "h-24 min-h-24" : "h-9 min-h-9", "py-2 font-mono text-xs leading-4")} disabled={props.disabled} placeholder={props.t("fields.roots", "根目录，每行一个")} value={props.data.pathsText ?? ""} onChange={(event) => props.onPatch({ pathsText: event.currentTarget.value })} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Paste roots" disabled={props.disabled} size="icon-xs" onClick={props.onPaste}><Clipboard /></InputGroupButton>
        <InputGroupButton aria-label="Clear roots" disabled={props.disabled || !props.data.pathsText} size="icon-xs" onClick={() => props.onPatch({ pathsText: "" })}><Trash2 /></InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

function ActionTools(props: ViewProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ConfigManagement {...props} />
      <IconButton icon={RotateCcw} label="Clear state" onClick={props.onReset} />
    </div>
  )
}

function ModeExecutionTabs({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const classifyDescription = props.data.dryRun ?? true
    ? props.t("mode.classify.previewDescription", "按当前移动或复制规则生成分类结果，不改动文件")
    : props.t("mode.classify.liveDescription", "按当前规则实际处理就绪项，执行前需要确认")
  return (
    <Tabs
      value={props.action}
      onValueChange={(value) => props.onActionChange(value as ClassqAction)}
      className="min-w-0 gap-2"
      data-testid="classq-mode-tabs"
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="plan" disabled={props.running}><Search />{props.t("action.scanShort", "扫描")}</TabsTrigger>
        <TabsTrigger value="classify" disabled={props.running}><Play />{props.t("action.classifyShort", "分类")}</TabsTrigger>
      </TabsList>
      <TabsContent value="plan" className="min-w-0">
        <Item variant="muted" size="sm" className="min-w-0 flex-nowrap">
          <ItemMedia variant="icon"><Search /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>{props.t("mode.scan.title", "扫描根目录")}</ItemTitle>
            {!compact && <ItemDescription className="truncate">{props.t("mode.scan.description", "递归扫描关键词目录并生成等待项计划")}</ItemDescription>}
          </ItemContent>
          <RunButton action="plan" props={props} />
        </Item>
      </TabsContent>
      <TabsContent value="classify" className="min-w-0">
        <Item variant="muted" size="sm" className="min-w-0">
          <ItemContent className="min-w-0 basis-full gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TransferToggle value={props.data.transferMode ?? "move"} disabled={props.running} onChange={(transferMode) => props.onPatch({ transferMode })} t={props.t} />
              <RiskToggle compact={compact} checked={props.data.dryRun ?? true} disabled={props.running} onCheckedChange={(dryRun) => props.onPatch({ dryRun })} t={props.t} />
              <RunButton action="classify" props={props} />
            </div>
            {!compact && <ItemDescription className="truncate">{classifyDescription}</ItemDescription>}
          </ItemContent>
        </Item>
      </TabsContent>
    </Tabs>
  )
}

function TransferToggle(props: { disabled?: boolean; value: ClassqTransferMode; onChange: (value: ClassqTransferMode) => void; t: ViewProps["t"] }) {
  return (
    <ToggleGroup type="single" value={props.value} disabled={props.disabled} onValueChange={(value) => value && props.onChange(value as ClassqTransferMode)} className="grid grid-cols-2" size="sm">
      {TRANSFER_MODES.map((item) => <ToggleGroupItem key={item.value} value={item.value} className="min-w-0"><item.icon /><span className="truncate">{item.value === "move" ? props.t("transfer.move", "移动") : props.t("transfer.copy", "复制")}</span></ToggleGroupItem>)}
    </ToggleGroup>
  )
}

function RootInput(props: { compact?: boolean; data: ClassqCardState; disabled?: boolean; onPaste: () => void; onPatch: (patch: Partial<ClassqCardState>) => void }) {
  return (
    <div className="grid gap-1.5">
      {!props.compact && <Label htmlFor="classq-roots" className="text-xs">Root directories</Label>}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <PathTextarea id="classq-roots" aria-label="classq roots" className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-28")} disabled={props.disabled} placeholder={"One root directory per line\nD:/set"} value={props.data.pathsText ?? ""} onValueChange={(pathsText) => props.onPatch({ pathsText })} />
        <div className="grid content-start gap-1.5"><IconButton disabled={props.disabled} icon={Clipboard} label="Paste roots" onClick={props.onPaste} /><IconButton disabled={props.disabled || !props.data.pathsText} icon={Trash2} label="Clear roots" onClick={() => props.onPatch({ pathsText: "" })} /></div>
      </div>
    </div>
  )
}

function KeywordFields(props: { compact?: boolean; data: ClassqCardState; disabled?: boolean; onPatch: (patch: Partial<ClassqCardState>) => void }) {
  return (
    <div className={cn("grid gap-2", props.compact ? "grid-cols-2" : "grid-cols-2")}>
      <div className="grid gap-1.5">
        {!props.compact && <Label htmlFor="classq-keyword" className="text-xs">Keyword folder</Label>}
        <Input id="classq-keyword" aria-label="classq keyword" disabled={props.disabled} placeholder="already" value={props.data.keyword ?? ""} onChange={(event) => props.onPatch({ keyword: event.currentTarget.value })} />
      </div>
      <div className="grid gap-1.5">
        {!props.compact && <Label htmlFor="classq-wait" className="text-xs">Wait folder</Label>}
        <Input id="classq-wait" aria-label="classq wait" disabled={props.disabled} placeholder="wait" value={props.data.waitKeyword ?? ""} onChange={(event) => props.onPatch({ waitKeyword: event.currentTarget.value })} />
      </div>
    </div>
  )
}

function RunButton({ action, compact, props }: { action?: ClassqAction; compact?: boolean; props: ViewProps }) {
  const resolvedAction = action ?? props.action
  const label = executionLabel(resolvedAction, props.data.dryRun ?? true, props.t)
  // plan 是扫描而不是分类，配色沿用 secondary；分类预览回到 default，实时分类交给危险闸门。
  return <ExecuteButton compact={compact} running={props.running} dangerous={resolvedAction === "classify" && !(props.data.dryRun ?? true)} idleIcon={<Play data-icon="inline-start" />} label={label} variant={resolvedAction === "plan" ? "secondary" : undefined} onExecute={() => props.onExecute(resolvedAction)} />
}

function PlanRows(props: { items: ClassqPlanItem[]; roots: string[] }) {
  if (!props.items.length) {
    const text = props.roots.length ? "Run a scan to show keyword folders and wait transfers." : "Add root directories to preview wait classification."
    return <div className="flex min-h-32 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">{text}</div>
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid gap-1.5 p-3">
        {props.items.slice(0, 180).map((item, index) => {
          const meta = itemStatusMeta(item.status)
          const StatusIcon = meta.icon
          const KindIcon = item.kind === "folder" ? Folder : File
          return (
            <div key={`${item.sourcePath}:${index}`} className={cn("grid gap-1 rounded-md border px-2 py-1.5", (item.status === "conflict" || item.status === "error") && "border-destructive/40", item.stage === "keyword" && "bg-muted/25")}>
              <div className="flex min-w-0 items-center gap-2"><KindIcon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.sourceName}</div><div className="truncate font-mono text-[11px] text-muted-foreground">{"->"} {item.targetRelative}</div></div><Badge variant={meta.variant} className="gap-1"><StatusIcon className="size-3" />{meta.label}</Badge></div>
              <div className="truncate text-[11px] text-muted-foreground">{item.stage === "keyword" ? "keyword folder" : "wait candidate"}{item.reason ? ` / ${item.reason}` : ""}</div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function SpatialWorkbench(props: ViewProps) {
  const issueLines = [
    ...(props.result?.errors ?? []),
    ...(props.result?.items ?? [])
      .filter((item) => item.reason && item.status !== "ready")
      .map((item) => `${item.sourcePath}: ${item.reason}`),
  ]
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="classq-spatial-workbench">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1" data-testid="classq-three-zone-workbench">
        <ResizablePanel id="classq-command" defaultSize="26%" minSize="22%" maxSize="36%">
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 pr-2">
            <IdentityCard {...props} />
            <CommandPanel {...props} />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="classq-results" defaultSize="74%" minSize="58%">
          <ClassqResultsWorkspace
            items={props.result?.items ?? []}
            issueLines={issueLines}
            logs={props.logs}
            roots={props.roots}
            transferMode={props.data.transferMode ?? "move"}
            t={props.t}
            onCopyLogs={props.onCopyLogs}
            onCopyResults={props.onCopyResults}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function ResultTabList(props: { issueCount: number; logCount: number; planCount: number; t: ViewProps["t"] }) {
  const items = [
    { count: props.planCount, icon: PLAN_ICON, label: props.t("tabs.plan", "计划"), value: "plan" },
    { count: props.issueCount, icon: AlertTriangle, label: props.t("tabs.issues", "问题"), value: "issues" },
    { count: props.logCount, icon: Terminal, label: props.t("tabs.log", "日志"), value: "logs" },
  ]
  return (
    <TabsList className="shrink-0" data-testid="classq-result-list">
      {items.map((item) => (
        <TabsTrigger key={item.value} value={item.value}>
          <item.icon />
          <span>{item.label}</span>
          <span className="tabular-nums text-muted-foreground">{item.count}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

function MetricsStrip(props: { progress: number; result: ClassqData | null; roots: string[]; t: ViewProps["t"] }) {
  const stats = [
    { label: props.t("metrics.roots", "根目录"), value: props.roots.length },
    { label: props.t("metrics.keyword", "关键词"), value: props.result?.keywordCount ?? 0 },
    { label: props.t("metrics.wait", "等待"), value: props.result?.waitCount ?? 0 },
    { label: props.t("metrics.ready", "就绪"), value: props.result?.readyCount ?? 0 },
    { label: props.t("metrics.moved", "已移动"), value: props.result?.movedCount ?? 0 },
    { label: props.t("metrics.progress", "进度"), value: `${props.progress}%` },
  ]
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="classq-metrics">
      {stats.map((item) => (
        <div key={item.label} className="grid gap-0.5 rounded-md border px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
          <span className="text-sm font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function WorkbenchTextView(props: { empty: string; lines: string[] }) {
  return (
    <ScrollArea className="h-full min-h-0">
      {props.lines.length
        ? <pre className="p-3 font-mono text-xs leading-5 text-muted-foreground">{props.lines.join("\n")}</pre>
        : <div className="flex min-h-40 items-center justify-center p-4 text-sm text-muted-foreground">{props.empty}</div>}
    </ScrollArea>
  )
}

function ClassqResultsWorkspace(props: {
  items: ClassqPlanItem[]
  issueLines: string[]
  logs: string[]
  roots: string[]
  transferMode: ClassqTransferMode
  t: ViewProps["t"]
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const groups = useMemo(() => groupByParent(props.items), [props.items])
  const [selectedParent, setSelectedParent] = useState("")
  const { elements, expandedIds, selectionMap } = useMemo(() => buildExplorerTree(groups), [groups])

  useEffect(() => {
    if (!groups.length) {
      setSelectedParent("")
      return
    }
    if (!groups.some((group) => group.parentPath === selectedParent)) {
      setSelectedParent(groups[0]!.parentPath)
    }
  }, [groups, selectedParent])

  const selectedGroup = groups.find((group) => group.parentPath === selectedParent) ?? groups[0]
  const emptyText = props.roots.length
    ? props.t("empty.runScan", "运行扫描后，这里会显示递归文件树和分类计划表")
    : props.t("empty.addRoots", "添加根目录以预览分类计划")
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full" data-testid="classq-results-workspace">
      <ResizablePanel id="classq-tree" defaultSize="32%" minSize="24%" maxSize="44%">
        <div className="h-full min-h-0 px-2">
          <Card className="h-full min-h-0 gap-0 py-0" data-testid="classq-explorer">
            <CardHeader className="border-b px-3 py-3 !pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><ListTree />{props.t("explorer.tree", "递归文件树")}</CardTitle>
              <CardDescription className="text-xs">{props.t("explorer.description", "按根目录和父目录展开真实扫描结果。")}</CardDescription>
              <CardAction><Badge variant="outline">{groups.length}</Badge></CardAction>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 px-0 py-2">
              {selectedGroup ? (
                <Tree
                  key={`${props.items.length}:${groups.length}`}
                  className="min-h-0 flex-1"
                  elements={elements}
                  initialExpandedItems={expandedIds}
                  initialSelectedId={`parent:${selectedGroup.parentPath}`}
                  onSelectedIdChange={(id) => {
                    const parentPath = selectionMap.get(id)
                    if (parentPath) setSelectedParent(parentPath)
                  }}
                  sort="none"
                />
              ) : (
                <Empty className="h-full border-0 p-4">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><ListTree /></EmptyMedia>
                    <EmptyTitle className="text-sm">{props.t("empty.treeTitle", "等待递归文件树")}</EmptyTitle>
                    <EmptyDescription className="text-xs">{emptyText}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="classq-plan" defaultSize="68%" minSize="52%">
        <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
          <ResizablePanel id="classq-topology" defaultSize="56%" minSize="36%">
            <div className="h-full min-h-0 pb-2 pl-2">
              <RoutingTopology group={selectedGroup} transferMode={props.transferMode} t={props.t} emptyText={emptyText} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="classq-detail" defaultSize="44%" minSize="32%">
            <div className="h-full min-h-0 pl-2 pt-2">
              <ResultDetailPanel
                group={selectedGroup}
                issueLines={props.issueLines}
                logs={props.logs}
                itemCount={props.items.length}
                emptyText={emptyText}
                t={props.t}
                onCopyLogs={props.onCopyLogs}
                onCopyResults={props.onCopyResults}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function RoutingTopology(props: {
  group?: { parentPath: string; items: ClassqPlanItem[] }
  transferMode: ClassqTransferMode
  emptyText: string
  t: ViewProps["t"]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hubRef = useRef<HTMLDivElement>(null)
  const sourceRefA = useRef<HTMLDivElement>(null)
  const sourceRefB = useRef<HTMLDivElement>(null)
  const sourceRefC = useRef<HTMLDivElement>(null)
  const targetRefA = useRef<HTMLDivElement>(null)
  const targetRefB = useRef<HTMLDivElement>(null)
  const targetRefC = useRef<HTMLDivElement>(null)
  const sourceRefs = [sourceRefA, sourceRefB, sourceRefC]
  const targetRefs = [targetRefA, targetRefB, targetRefC]
  const waitItems = props.group?.items.filter((item) => item.stage === "wait") ?? []
  const sources = (waitItems.length ? waitItems : (props.group?.items ?? [])).slice(0, 3)
  const grouped = new Map<string, { label: string; path: string; count: number }>()
  for (const item of props.group?.items ?? []) {
    const key = item.targetPath || item.targetRelative
    const current = grouped.get(key)
    if (current) current.count += 1
    else grouped.set(key, { label: item.targetRelative || baseName(item.targetPath), path: item.targetPath, count: 1 })
  }
  const targets = [...grouped.values()].slice(0, 3)

  return (
    <Card className="h-full min-h-0 gap-0 py-0" data-testid="classq-routing-topology">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><GitBranch />{props.t("topology.title", "路由拓扑")}</CardTitle>
        <CardDescription className="truncate text-xs">
          {props.group?.parentPath ?? props.t("topology.description", "显示来源、分类路由和目标目录。")}
        </CardDescription>
        <CardAction><Badge variant="outline">{sources.length} → {targets.length}</Badge></CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-3 py-2">
        {props.group && sources.length ? (
          <div ref={containerRef} className="relative grid h-full min-h-40 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 overflow-hidden">
            <ItemGroup className="relative gap-2">
              {sources.map((item, index) => {
                const meta = itemStatusMeta(item.status)
                return (
                  <div ref={sourceRefs[index]} key={item.sourcePath} className="relative">
                    <Item variant="outline" size="sm" className="flex-nowrap bg-card">
                      <ItemMedia variant="icon">{item.kind === "folder" ? <Folder /> : <File />}</ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="truncate text-xs">{item.sourceName}</ItemTitle>
                        <ItemDescription className="truncate font-mono text-[10px]">{item.sourcePath}</ItemDescription>
                      </ItemContent>
                      <Badge variant={meta.variant}>{localizedItemStatus(item.status, props.t)}</Badge>
                    </Item>
                  </div>
                )
              })}
            </ItemGroup>

            <div ref={hubRef} className="relative grid justify-items-center gap-2">
              <ItemMedia variant="icon" className="size-12 rounded-full bg-background"><GitBranch /></ItemMedia>
              <Badge variant="secondary">{props.transferMode === "move" ? props.t("transfer.move", "移动") : props.t("transfer.copy", "复制")}</Badge>
            </div>

            <ItemGroup className="relative gap-2">
              {targets.map((target, index) => (
                <div ref={targetRefs[index]} key={target.path || target.label} className="relative">
                  <Item variant="outline" size="sm" className="flex-nowrap bg-card">
                    <ItemMedia variant="icon"><FolderOpen /></ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="truncate text-xs">{target.label}</ItemTitle>
                      <ItemDescription className="truncate font-mono text-[10px]">{target.path}</ItemDescription>
                    </ItemContent>
                    <Badge variant="outline">{target.count}</Badge>
                  </Item>
                </div>
              ))}
            </ItemGroup>

            {sources.map((item, index) => (
              <AnimatedBeam
                key={`source:${item.sourcePath}`}
                containerRef={containerRef}
                fromRef={sourceRefs[index]!}
                toRef={hubRef}
                pathColor="var(--border)"
                gradientStartColor="var(--primary)"
                gradientStopColor="var(--primary)"
                pathWidth={1.5}
                duration={3.6 + index * 0.35}
              />
            ))}
            {targets.map((target, index) => (
              <AnimatedBeam
                key={`target:${target.path || target.label}`}
                containerRef={containerRef}
                fromRef={hubRef}
                toRef={targetRefs[index]!}
                pathColor="var(--border)"
                gradientStartColor="var(--primary)"
                gradientStopColor="var(--primary)"
                pathWidth={1.5}
                duration={3.8 + index * 0.35}
              />
            ))}
          </div>
        ) : (
          <Empty className="h-full border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon"><GitBranch /></EmptyMedia>
              <EmptyTitle className="text-sm">{props.t("empty.topologyTitle", "等待路由拓扑")}</EmptyTitle>
              <EmptyDescription className="text-xs">{props.emptyText}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function ResultDetailPanel(props: {
  group?: { parentPath: string; items: ClassqPlanItem[] }
  issueLines: string[]
  logs: string[]
  itemCount: number
  emptyText: string
  t: ViewProps["t"]
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  return (
    <Tabs defaultValue="plan" className="h-full min-h-0 gap-0" data-testid="classq-result-tabs">
      <Card className="h-full min-h-0 gap-0 py-0">
        <CardHeader className="border-b px-3 py-2 !pb-2">
          <CardTitle className="text-sm">{props.t("detail.title", "结果详情")}</CardTitle>
          <CardDescription className="truncate text-xs">{props.group?.parentPath ?? props.emptyText}</CardDescription>
          <CardAction className="flex items-center gap-1">
            <ResultTabList issueCount={props.issueLines.length} logCount={props.logs.length} planCount={props.itemCount} t={props.t} />
            <IconButton disabled={!props.itemCount} icon={Copy} label={props.t("actions.copyPlan", "复制计划")} onClick={props.onCopyResults} />
            <IconButton disabled={!props.logs.length} icon={Terminal} label={props.t("actions.copyLogs", "复制日志")} onClick={props.onCopyLogs} />
          </CardAction>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 px-0">
          <TabsContent value="plan" className="h-full min-h-0">
            {props.group
              ? <PlanDetailTable group={props.group} t={props.t} />
              : <Empty className="h-full border-0 p-4"><EmptyHeader><EmptyMedia variant="icon"><FolderOpen /></EmptyMedia><EmptyTitle className="text-sm">{props.t("empty.detailTitle", "等待分类结果")}</EmptyTitle><EmptyDescription className="text-xs">{props.emptyText}</EmptyDescription></EmptyHeader></Empty>}
          </TabsContent>
          <TabsContent value="issues" className="h-full min-h-0">
            <WorkbenchTextView empty={props.t("empty.issues", "暂无问题")} lines={props.issueLines} />
          </TabsContent>
          <TabsContent value="logs" className="h-full min-h-0">
            <WorkbenchTextView empty={props.t("empty.logs", "运行日志会显示在这里")} lines={props.logs} />
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  )
}

function PlanDetailTable(props: { group: { parentPath: string; items: ClassqPlanItem[] }; t: ViewProps["t"] }) {
  const keywordItems = props.group.items.filter((item) => item.stage === "keyword")
  const waitItems = props.group.items.filter((item) => item.stage === "wait")
  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="classq-plan-table">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2"><FolderOpen className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="truncate text-xs font-semibold">{baseName(props.group.parentPath)}</div><div className="truncate font-mono text-[11px] text-muted-foreground">{props.group.parentPath}</div></div></div>
        <div className="flex shrink-0 items-center gap-1">{keywordItems.map((item) => <Badge key={item.sourcePath} variant="outline" className="max-w-48 gap-1"><Search className="size-3" /><span className="truncate">{item.sourceName}</span></Badge>)}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-card/95">
            <TableRow>
              <TableHead className="w-[34%]">{props.t("table.source", "源节点")}</TableHead>
              <TableHead className="w-[42%]">{props.t("table.target", "等待目录目标")}</TableHead>
              <TableHead className="w-[10%]">{props.t("table.type", "类型")}</TableHead>
              <TableHead className="w-[14%] text-right">{props.t("table.status", "状态")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waitItems.map((item) => {
              const meta = itemStatusMeta(item.status)
              const StatusIcon = meta.icon
              const KindIcon = item.kind === "folder" ? Folder : File
              return (
                <TableRow key={item.sourcePath}>
                  <TableCell className="min-w-0 whitespace-normal"><div className="flex min-w-0 items-center gap-2"><KindIcon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="truncate text-xs font-medium">{item.sourceName}</div><div className="truncate font-mono text-[10px] text-muted-foreground">{item.sourcePath}</div></div></div></TableCell>
                  <TableCell className="min-w-0 whitespace-normal"><div className="truncate font-mono text-[11px]">{item.targetRelative}</div><div className="truncate font-mono text-[10px] text-muted-foreground">{item.targetPath}</div></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.kind === "folder" ? props.t("type.folder", "目录") : props.t("type.file", "文件")}</TableCell>
                  <TableCell className="text-right"><Badge variant={meta.variant} className="gap-1"><StatusIcon className="size-3" />{localizedItemStatus(item.status, props.t)}</Badge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {!waitItems.length && <div className="flex min-h-32 items-center justify-center p-4 text-sm text-muted-foreground">{props.t("empty.table", "此目录没有等待项")}</div>}
      </ScrollArea>
    </section>
  )
}

function buildExplorerTree(groups: Array<{ parentPath: string; items: ClassqPlanItem[] }>): { elements: TreeViewElement[]; expandedIds: string[]; selectionMap: Map<string, string> } {
  const rootGroups = new Map<string, Array<{ parentPath: string; items: ClassqPlanItem[] }>>()
  for (const group of groups) {
    const rootPath = group.items[0]?.rootPath ?? group.parentPath
    const list = rootGroups.get(rootPath) ?? []
    list.push(group)
    rootGroups.set(rootPath, list)
  }
  const selectionMap = new Map<string, string>()
  const expandedIds: string[] = []
  const elements = [...rootGroups.entries()].map(([rootPath, rootItems]) => {
    const rootId = `root:${rootPath}`
    expandedIds.push(rootId)
    selectionMap.set(rootId, rootItems[0]?.parentPath ?? rootPath)
    return {
      id: rootId,
      name: baseName(rootPath) || rootPath,
      type: "folder" as const,
      children: rootItems.map((group) => {
        const parentId = `parent:${group.parentPath}`
        expandedIds.push(parentId)
        selectionMap.set(parentId, group.parentPath)
        return {
          id: parentId,
          name: baseName(group.parentPath),
          type: "folder" as const,
          children: group.items.map((item, index) => {
            const id = `item:${group.parentPath}:${index}`
            selectionMap.set(id, group.parentPath)
            return { id, name: item.sourceName, type: item.kind, isSelectable: true }
          }),
        }
      }),
    }
  })
  return { elements, expandedIds, selectionMap }
}

function ResultTabs(props: { compact?: boolean; logs: string[]; result: ClassqData | null; t: ViewProps["t"]; onCopyLogs: () => void; onCopyResults: () => void }) {
  const issueLines = [
    ...(props.result?.errors ?? []),
    ...(props.result?.items ?? []).filter((item) => item.reason && item.status !== "ready").map((item) => `${item.sourcePath}: ${item.reason}`),
  ]
  return (
    <Tabs defaultValue="plan" className="h-full min-h-0 gap-0" data-testid="classq-result-tabs">
      <Card className="h-full min-h-0 gap-0 py-0">
        <CardHeader className="border-b px-2 py-2 !pb-2">
          <CardTitle className="text-sm">{props.t("detail.title", "结果详情")}</CardTitle>
          <CardAction><ResultTabList issueCount={issueLines.length} logCount={props.logs.length} planCount={props.result?.items.length ?? 0} t={props.t} /></CardAction>
        </CardHeader>
        <CardContent className="min-w-0 min-h-0 flex-1 overflow-hidden p-1.5">
          <TabsContent value="plan" className="h-full min-h-0"><PlanPanel compact={props.compact} result={props.result} t={props.t} onCopy={props.onCopyResults} /></TabsContent>
          <TabsContent value="issues" className="h-full min-h-0"><TextPanel empty={props.t("empty.issues", "暂无问题")} lines={issueLines} t={props.t} /></TabsContent>
          <TabsContent value="logs" className="h-full min-h-0"><TextPanel actionLabel={props.t("actions.copy", "复制")} empty={props.t("empty.logs", "运行日志会显示在这里")} icon={Terminal} lines={props.logs} t={props.t} onAction={props.onCopyLogs} /></TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  )
}

function PlanPanel(props: { compact?: boolean; result: ClassqData | null; t: ViewProps["t"]; onCopy: () => void }) {
  return (
    <Card className="h-full min-h-0 gap-0 py-0">
      <CardHeader className={props.compact ? "border-b px-2 py-1.5 !pb-1.5" : "border-b px-3 py-2 !pb-2"}>
        <CardTitle className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><PLAN_ICON /><span>{props.result?.items.length ? props.t("plan.itemCount", "{{count}} 项", { count: props.result.items.length }) : props.t("plan.waiting", "等待扫描")}</span></CardTitle>
        <CardAction><Button disabled={!props.result?.items.length} size="xs" variant="ghost" onClick={props.onCopy}><Copy data-icon="inline-start" />{props.t("actions.copy", "复制")}</Button></CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0"><PlanRows items={props.result?.items ?? []} roots={[]} /></CardContent>
    </Card>
  )
}

function TextPanel(props: { actionLabel?: string; empty: string; icon?: LucideIcon; lines: string[]; t: ViewProps["t"]; onAction?: () => void }) {
  const Icon = props.icon
  return (
    <Card className="h-full min-h-0 gap-0 py-0">
      <CardHeader className="border-b px-3 py-2 !pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon />}{props.lines.length ? props.t("text.lineCount", "{{count}} 行", { count: props.lines.length }) : props.empty}</CardTitle>
        {props.onAction && <CardAction><Button disabled={!props.lines.length} size="xs" variant="ghost" onClick={props.onAction}>{props.actionLabel ?? props.t("actions.copy", "复制")}</Button></CardAction>}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0"><ScrollArea className="h-full min-h-0">{props.lines.length ? <pre className="p-3 text-xs leading-5 text-muted-foreground">{props.lines.join("\n")}</pre> : <div className="flex min-h-24 items-center justify-center p-4 text-sm text-muted-foreground">{props.empty}</div>}</ScrollArea></CardContent>
    </Card>
  )
}

function HeaderLine(props: { status: ClassqStatusMeta; subtitle: string }) {
  const Icon = NODE_ICON
  return <FloatingWindowNodeHeader><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}><Icon /></div><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold leading-none">ClassQ</h3><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{props.subtitle}</p></div></div></div></FloatingWindowNodeHeader>
}

function StatusStrip(props: { progress: number; status: ClassqStatusMeta; text?: string }) {
  return <Card className="gap-0 py-0"><CardContent className="grid gap-1 p-2"><div className="flex min-w-0 items-center justify-between gap-2"><div className="truncate text-xs font-medium">{props.text || props.status.description}</div><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div><Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} /></CardContent></Card>
}

function RiskToggle(props: { checked: boolean; compact?: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void; t: ViewProps["t"] }) {
  const label = props.checked ? props.t("risk.dryRun", "预览") : props.t("risk.live", "实时")
  return (
    <Field orientation="horizontal" className="w-auto shrink-0 items-center gap-2">
      <FieldContent className="min-w-0 gap-0">
        <FieldLabel htmlFor="classq-dry-run" className={cn("items-center text-xs", !props.checked && "text-destructive")}>
          <ShieldAlert className="size-3.5" />
          {label}
        </FieldLabel>
        {!props.compact && <FieldDescription className="text-[11px]">{props.checked ? props.t("risk.dryRunDescription", "不改动文件") : props.t("risk.liveDescription", "会改动文件")}</FieldDescription>}
      </FieldContent>
      <Switch id="classq-dry-run" aria-label={label} checked={props.checked} disabled={props.disabled} onCheckedChange={props.onCheckedChange} />
    </Field>
  )
}

function IconButton(props: { active?: boolean; disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  const Icon = props.icon
  return <Tooltip><TooltipTrigger asChild><Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant={props.active ? "secondary" : "outline"} onClick={props.onClick}><Icon /></Button></TooltipTrigger><TooltipContent>{props.label}</TooltipContent></Tooltip>
}

function statusFromState(data: ClassqCardState, running: boolean, result: ClassqData | null, t: ViewProps["t"]): ClassqStatusMeta {
  if (running || data.phase === "running") return { label: t("status.running", "运行中"), description: data.progressText || t("status.runningDescription", "正在扫描关键词目录或处理等待项"), tone: "running", badgeVariant: "secondary", iconClass: "bg-primary text-primary-foreground" }
  if (data.phase === "error" || result?.errorCount) return { label: t("status.failed", "失败"), description: data.progressText || result?.errors[0] || t("status.failedDescription", "上次运行失败，请查看问题"), tone: "error", badgeVariant: "destructive", iconClass: "bg-destructive text-destructive-foreground" }
  if (data.phase === "completed") return { label: t("status.done", "完成"), description: t("status.doneDescription", "上次运行已完成"), tone: "success", badgeVariant: "default", iconClass: "bg-primary text-primary-foreground" }
  return { label: t("status.ready", "就绪"), description: t("status.readyDescription", "扫描根目录中的关键词目录和等待项"), tone: "idle", badgeVariant: "outline", iconClass: "bg-secondary text-secondary-foreground" }
}

function itemStatusMeta(status: ClassqPlanItem["status"]) {
  if (status === "moved") return { icon: CheckCircle2, label: "Moved", variant: "default" as const }
  if (status === "copied") return { icon: CheckCircle2, label: "Copied", variant: "default" as const }
  if (status === "found") return { icon: Search, label: "Found", variant: "outline" as const }
  if (status === "ready") return { icon: ListTree, label: "Ready", variant: "secondary" as const }
  if (status === "conflict") return { icon: AlertTriangle, label: "Conflict", variant: "destructive" as const }
  if (status === "error") return { icon: XCircle, label: "Error", variant: "destructive" as const }
  return { icon: AlertTriangle, label: "Skipped", variant: "outline" as const }
}

function localizedItemStatus(status: ClassqPlanItem["status"], t: ViewProps["t"]): string {
  const fallbacks: Record<ClassqPlanItem["status"], string> = {
    found: "已找到",
    ready: "就绪",
    skipped: "已跳过",
    moved: "已移动",
    copied: "已复制",
    conflict: "冲突",
    error: "错误",
  }
  return t(`status.item.${status}`, fallbacks[status])
}

function summaryText(props: ViewProps): string {
  if (props.result) return props.t("summary.result", "关键词 {{keyword}} / 等待 {{wait}} / 就绪 {{ready}}", { keyword: props.result.keywordCount, wait: props.result.waitCount, ready: props.result.readyCount })
  if (props.roots.length) return props.t("summary.roots", "{{count}} 个根目录 / {{action}}", { count: props.roots.length, action: actionLabel(props.action, props.t) })
  return props.t("summary.idle", "通过关键词递归分类文件夹")
}

function viewSubtitle(props: ViewProps): string {
  if ((props.running || props.status.tone === "error") && props.data.progressText) return props.data.progressText
  return summaryText(props)
}

function actionLabel(action: ClassqAction, t: ViewProps["t"]): string {
  return action === "plan" ? t("action.scanLabel", "扫描根目录") : t("action.classifyLabel", "执行分类")
}

function executionLabel(action: ClassqAction, dryRun: boolean, t: ViewProps["t"]): string {
  if (action === "plan") return t("action.scanLabel", "扫描根目录")
  return dryRun ? t("action.classifyPreview", "预览分类") : t("action.classifyLabel", "执行分类")
}

function buildInput(action: ClassqAction, data: ClassqCardState): ClassqInput {
  return {
    action,
    paths: splitLines(data.pathsText),
    keyword: data.keyword,
    waitKeyword: data.waitKeyword,
    transferMode: data.transferMode ?? "move",
    existingPolicy: data.existingPolicy ?? "merge",
    dryRun: data.dryRun ?? true,
  }
}

function groupByParent(items: ClassqPlanItem[]): Array<{ parentPath: string; items: ClassqPlanItem[] }> {
  const groups = new Map<string, ClassqPlanItem[]>()
  for (const item of items) {
    const list = groups.get(item.parentPath) ?? []
    list.push(item)
    groups.set(item.parentPath, list)
  }
  return [...groups.entries()].map(([parentPath, groupItems]) => ({ parentPath, items: groupItems }))
}

function baseName(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}

function splitLines(value: unknown): string[] {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function getHostData(host: NodeComponentProps<ClassqCardState, Partial<ClassqCardState>>["host"], compId: string): ClassqCardState {
  return host.state?.getData?.() ?? host.getData<ClassqCardState>(compId) ?? {}
}
