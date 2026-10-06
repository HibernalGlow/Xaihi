import { useEffect, useMemo, useRef, useState } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { TrenameAction, TrenameConflict, TrenameData, TrenameInput, TrenameOperation, TrenameScanMode } from "@xiranite/node-trename/core"
import { AlertTriangle, Archive, CheckCircle2, Copy, FilePenLine, GitCompare, History, Play, RotateCcw, ScanSearch, Search, ShieldAlert, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { tNode, useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { FileTreePanel } from "./FileTreePanel"
import { buildTreeModel } from "./treeModel"
import { JsonEditorDialog } from "./JsonEditorDialog"
import { TrenameDisplayTabs } from "./ResultPanels"
import { ActionIconButton, AdvancedOptionsPopover, KeySwitches, ModePicker, PathInput, StatusStrip } from "./controls"
import type { TrenameCardState, TrenamePhase, TrenameStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("trename")
  const data = host.getData<TrenameCardState>(compId) ?? {}
  const dataRef = useRef<TrenameCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<TrenameCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const jsonText = data.jsonText ?? result?.jsonContent ?? ""
  const tree = useMemo(() => buildTreeModel(jsonText), [jsonText])
  const pathCount = useMemo(() => parsePathInput(data.pathText ?? "").length, [data.pathText])
  const mode = data.mode ?? "normal"
  const dryRun = data.dryRun ?? true
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running, tree)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<TrenameCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  async function reloadDefaults() {
    const response = await host.getNodeConfig?.<Partial<TrenameCardState>>()
    if (!response) return
    setDefaults(response.config)
    setConfigFilePath(response.path)
    setConfigDirty(false)
  }

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.basePath,
    data.batchId,
    data.compact,
    data.dryRun,
    data.excludeExts,
    data.excludePatterns,
    data.includeHidden,
    data.includeRoot,
    data.keepRecent,
    data.maxLines,
    data.mode,
    data.pathText,
    data.undoPath,
    defaults,
  ])

  function patch(patchData: Partial<TrenameCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pastePath() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathText: text.trim() })
  }

  async function pasteJson() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ jsonText: text })
  }

  async function copyJson() {
    if (jsonText) await host.clipboard?.writeText?.(jsonText)
  }

  async function copyResults() {
    await host.clipboard?.writeText?.(resultLines(result).join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function execute(action: TrenameAction, override: Partial<TrenameCardState> = {}) {
    if (running) return
    const current = { ...dataRef.current, ...override }
    const nextJsonText = override.jsonText ?? jsonText
    const input = buildInput(action, current, nextJsonText)

    if (action === "scan" && !input.paths) {
      patch({ phase: "error", progress: 0, progressText: t("error.noScanPath", "请先输入至少一个扫描路径。") })
      return
    }
    if ((action === "import" || action === "validate" || action === "rename") && !input.jsonContent) {
      patch({ phase: "error", progress: 0, progressText: t("error.noJson", "请先扫描或导入 rename JSON。") })
      return
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: t("error.noRunEnv", "当前环境没有本地运行能力，请使用桌面模式或 CLI。") })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: phaseForAction(action), progress: 0, progressText: t("progress.start", "{{action}}开始", { action: actionLabel(action) }), ...override })
      const response = await run<TrenameInput, TrenameData>("trename", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<TrenameData>

      const next = response.data ?? null
      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: next,
        jsonText: next?.jsonContent || nextJsonText,
        basePath: next?.basePath || current.basePath,
        batchId: next?.operationId || current.batchId,
      })
      pushLog(response.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
    } finally {
      setRunning(false)
    }
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, jsonText: "", logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<TrenameCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    patch({
      pathText: undefined,
      basePath: undefined,
      mode: undefined,
      includeHidden: undefined,
      includeRoot: undefined,
      compact: undefined,
      dryRun: undefined,
      excludeExts: undefined,
      excludePatterns: undefined,
      maxLines: undefined,
      batchId: undefined,
      undoPath: undefined,
      keepRecent: undefined,
    })
  }

  const commonProps = createViewProps({
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    host,
    jsonText,
    logs,
    mode,
    pathCount,
    phase,
    progress,
    result,
    running,
    status,
    t,
    tree,
    onCopyJson: copyJson,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onModeChange: (nextMode: TrenameScanMode) => patch({ mode: nextMode }),
    onOpenConfigFile: host.openConfigFile,
    onPasteJson: pasteJson,
    onPastePath: pastePath,
    onPatch: patch,
    onReset: reset,
    onReloadDefaults: reloadDefaults,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/trename relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-2" />
        <div className="relative flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...commonProps} />
          ) : compactSurface ? (
            portraitCompact ? <PortraitCompactView {...commonProps} /> : <CompactView {...commonProps} />
          ) : (
            <FullView {...commonProps} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

type ViewProps = ReturnType<typeof createViewProps>

function createViewProps(props: {
  configDirty: boolean
  configFilePath?: string
  data: TrenameCardState
  defaults?: Partial<TrenameCardState>
  dryRun: boolean
  host: NodeComponentProps["host"]
  jsonText: string
  logs: string[]
  mode: TrenameScanMode
  pathCount: number
  phase: TrenamePhase
  progress: number
  result: TrenameData | null
  running: boolean
  status: TrenameStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  tree: ReturnType<typeof buildTreeModel>
  onCopyJson: () => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: TrenameAction, override?: Partial<TrenameCardState>) => void
  onModeChange: (mode: TrenameScanMode) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteJson: () => void
  onPastePath: () => void
  onPatch: (patch: Partial<TrenameCardState>) => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="trename-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <FilePenLine />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Trename</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="trename-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        <KeySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <TrenameDisplayTabs
            compact
            jsonText={props.jsonText}
            logs={props.logs}
            phase={props.phase}
            result={props.result}
            running={props.running}
            onCopyLogs={props.onCopyLogs}
            onCopyResults={props.onCopyResults}
            onUndoBatch={(batchId) => props.onExecute("undo", { batchId })}
          />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="trename-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        <KeySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <TrenameDisplayTabs
          compact
          jsonText={props.jsonText}
          logs={props.logs}
          phase={props.phase}
          result={props.result}
          running={props.running}
          onCopyLogs={props.onCopyLogs}
          onCopyResults={props.onCopyResults}
          onUndoBatch={(batchId) => props.onExecute("undo", { batchId })}
        />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="trename-full-view" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex shrink-0 flex-col gap-2 @3xl/trename:flex-row @3xl/trename:items-center @3xl/trename:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @3xl/trename:flex-row @3xl/trename:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
          <div data-testid="trename-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-1">
            <ToolbarActions {...props} hidePrimaryAction />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} tree={props.tree} />
      </div>

      {(props.status.tone === "running" || props.status.tone === "error") && (
        <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
      )}

      <div className="grid min-h-0 flex-1 gap-2 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] @2xl/trename:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] @2xl/trename:grid-rows-1 @4xl/trename:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(220px,280px)]">
        <div className="grid min-h-0 gap-2 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
          <ConflictHotZone conflicts={props.result?.conflicts ?? []} onCopy={props.onCopyResults} />
          <FileTreePanel jsonText={props.jsonText} />
        </div>

        <div className="grid min-h-0 gap-2 grid-rows-[minmax(0,1fr)_auto] @4xl/trename:contents">
          <ReviewDiffQueue operations={props.result?.operations ?? []} conflicts={props.result?.conflicts ?? []} onCopy={props.onCopyResults} />
          <ReviewExecutionGate {...props} />
        </div>
      </div>

      <LogsStrip logs={props.logs} onCopy={props.onCopyLogs} />
    </div>
  )
}

function ConflictHotZone(props: {
  conflicts: TrenameConflict[]
  onCopy: () => void
}) {
  const count = props.conflicts.length
  const groups = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of props.conflicts) map.set(c.type, (map.get(c.type) ?? 0) + 1)
    return [...map.entries()].map(([type, n]) => ({ type, count: n }))
  }, [props.conflicts])

  return (
    <section className={cn("flex h-full min-h-0 flex-col rounded-lg border bg-background/70", count > 0 && "border-destructive/40 bg-destructive/5")}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {count > 0 ? <AlertTriangle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-primary" />}
          <span className="truncate text-xs font-medium">{count > 0 ? "冲突热区" : "冲突"}</span>
          <Badge variant={count > 0 ? "destructive" : "outline"}>{count}</Badge>
        </div>
        <Button disabled={!count} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {count > 0 ? (
          <div className="grid gap-2 p-2">
            <div className="flex flex-wrap gap-1">
              {groups.map((group) => (
                <Badge key={group.type} variant="destructive">{group.type} × {group.count}</Badge>
              ))}
            </div>
            <div className="grid gap-1">
              {props.conflicts.slice(0, 80).map((item, index) => (
                <div key={`${item.type}:${item.srcPath}:${index}`} className="grid gap-0.5 rounded-md bg-destructive/5 px-2 py-1">
                  <div className="truncate text-xs font-medium">{basename(item.srcPath)} → {basename(item.tgtPath)}</div>
                  <div className="truncate text-[11px] text-destructive">{item.message}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground">
            暂无冲突，可安全执行
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function ReviewDiffQueue(props: {
  operations: TrenameOperation[]
  conflicts: TrenameConflict[]
  onCopy: () => void
}) {
  const conflictPaths = useMemo(() => {
    const set = new Set<string>()
    for (const c of props.conflicts) {
      set.add(c.srcPath)
      set.add(c.tgtPath)
    }
    return set
  }, [props.conflicts])

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitCompare className="size-4 text-muted-foreground" />
          <span className="truncate text-xs font-medium">差异队列</span>
          <Badge variant="outline">{props.operations.length}</Badge>
        </div>
        <Button disabled={!props.operations.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.operations.length ? (
          <div className="grid gap-1 p-2">
            {props.operations.slice(0, 200).map((item, index) => {
              const hasConflict = conflictPaths.has(item.originalPath) || conflictPaths.has(item.newPath)
              return (
                <div key={`${item.originalPath}:${item.newPath}:${index}`} className={cn("grid gap-0.5 rounded-md px-2 py-1.5", hasConflict ? "bg-destructive/5" : "hover:bg-muted/45")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-xs font-medium">{basename(item.originalPath)}</span>
                    <span className="shrink-0 text-primary">→</span>
                    <span className="truncate text-xs font-medium">{basename(item.newPath)}</span>
                    {hasConflict && <AlertTriangle className="size-3 shrink-0 text-destructive" />}
                  </div>
                  <div className="truncate pl-8 font-mono text-[11px] text-muted-foreground">{item.originalPath} → {item.newPath}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-36 items-center justify-center p-3 text-center text-xs text-muted-foreground">
            扫描并校验后，这里会显示 src → tgt 差异队列
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function ReviewExecutionGate(props: ViewProps) {
  return (
    <section className="flex min-h-0 flex-col gap-2 overflow-auto rounded-lg border bg-background/70 p-2">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold">执行闸门</span>
          </div>
          <Badge variant={props.dryRun ? "outline" : "destructive"}>{props.dryRun ? "预演" : "真实"}</Badge>
        </div>
        <ToggleGroup
          type="single"
          value={props.dryRun ? "dry" : "live"}
          onValueChange={(value) => { if (value) props.onPatch({ dryRun: value === "dry" }) }}
          className="grid w-full grid-cols-2"
          size="sm"
        >
          <ToggleGroupItem value="dry" className="min-w-0 gap-1">
            <ShieldAlert className="size-3.5" />
            <span className="truncate text-xs">预演</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="live" className="min-w-0 gap-1">
            <Zap className="size-3.5" />
            <span className="truncate text-xs">真实</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <PrimaryActionButton props={props} />
      </div>

      <Separator />

      <div className="grid gap-1.5">
        <div className="text-xs font-semibold">关键开关</div>
        <KeySwitches data={props.data} disabled={props.running} onPatch={props.onPatch} />
      </div>

      <Separator />

      <div className="grid gap-1.5">
        <PathInput disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
      </div>
    </section>
  )
}

function LogsStrip(props: {
  logs: string[]
  onCopy: () => void
}) {
  if (!props.logs.length) return null
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md border bg-background/70 px-2 py-1">
      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-3 font-mono text-[11px] leading-5 text-muted-foreground">
          {props.logs.slice(-5).map((line, index) => (
            <span key={`${line}:${index}`} className="whitespace-nowrap">{line}</span>
          ))}
        </div>
      </ScrollArea>
      <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
        <Copy data-icon="inline-start" />
      </Button>
    </div>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean; hidePrimaryAction?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      <ActionIconButton disabled={props.running || !props.pathCount} icon={ScanSearch} label={tNode("trename", "actions.scanPaths", "扫描路径")} onClick={() => props.onExecute("scan")} />
      <JsonEditorDialog
        disabled={props.running}
        jsonText={props.jsonText}
        pendingCount={props.tree.pending}
        readyCount={props.tree.ready}
        totalCount={props.tree.total}
        onChange={(jsonText) => props.onPatch({ jsonText })}
        onCopy={props.onCopyJson}
        onImport={() => props.onExecute("import")}
        onPaste={props.onPasteJson}
      />
      <ActionIconButton disabled={props.running || !props.jsonText} icon={Search} label={tNode("trename", "actions.validate", "校验冲突")} onClick={() => props.onExecute("validate")} />
      {!props.compact && !props.hidePrimaryAction && <PrimaryActionButton props={props} />}
      <ActionIconButton disabled={props.running} icon={History} label={tNode("trename", "actions.history", "读取历史")} onClick={() => props.onExecute("history")} />
      <ActionIconButton disabled={!props.jsonText} icon={Copy} label={tNode("trename", "copyJson", "复制 JSON")} onClick={props.onCopyJson} />
      <ActionIconButton disabled={!props.result && !props.logs.length} icon={RotateCcw} label={tNode("trename", "actions.clearState", "清空状态")} onClick={props.onReset} />
      {!props.compact && (
        <NodeConfigPopover
          configPath={props.configFilePath}
          defaults={props.defaults}
          dirty={props.configDirty}
          disabled={props.running}
          t={props.t}
          onOpenFile={props.onOpenConfigFile}
          onReload={props.onReloadDefaults}
          onRestore={props.onRestoreDefault}
          onSave={props.onSaveDefault}
        />
      )}
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const disabled = !props.jsonText
  const dangerous = !props.dryRun
  const label = props.dryRun ? tNode("trename", "actions.dryRename", "预演重命名") : tNode("trename", "actions.liveRename", "真实重命名")
  return (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={dangerous ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute("rename")}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: TrenameStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <FilePenLine />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Trename</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function StatsPanel(props: {
  progress: number
  result: TrenameData | null
  tree: ReturnType<typeof buildTreeModel>
}) {
  const conflictLabel = tNode("trename", "statConflicts", "冲突")
  const stats = [
    [tNode("trename", "statTotal", "总计"), props.result?.totalItems ?? props.tree.total],
    [tNode("trename", "statPending", "待填"), props.result?.pendingCount ?? props.tree.pending],
    [tNode("trename", "statReady", "就绪"), props.result?.readyCount ?? props.tree.ready],
    [tNode("trename", "statOk", "成功"), props.result?.successCount ?? 0],
    [conflictLabel, props.result?.conflicts.length ?? 0],
    [tNode("trename", "stats.progress", "进度"), `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/trename:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === conflictLabel && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function buildInput(action: TrenameAction, data: TrenameCardState, jsonText: string): TrenameInput {
  return {
    action,
    paths: data.pathText,
    includeHidden: data.includeHidden ?? false,
    includeRoot: data.includeRoot ?? true,
    excludeExts: data.excludeExts,
    excludePatterns: data.excludePatterns,
    maxLines: data.maxLines ?? 1000,
    compact: data.compact ?? true,
    mode: data.mode ?? "normal",
    jsonContent: jsonText,
    basePath: data.basePath,
    dryRun: data.dryRun ?? true,
    batchId: data.batchId,
    undoPath: data.undoPath,
    keepRecent: data.keepRecent ?? 10,
  }
}

function statusFromState(data: TrenameCardState, running: boolean, tree: ReturnType<typeof buildTreeModel>): TrenameStatusMeta {
  if (running || data.phase === "scanning" || data.phase === "validating" || data.phase === "renaming") {
    return {
      label: tNode("trename", "status.running", "运行中"),
      description: data.progressText || tNode("trename", "desc.running", "Trename 正在处理当前任务。"),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || data.result?.errors.length) {
    return {
      label: tNode("trename", "status.error", "失败"),
      description: data.progressText || data.result?.errors[0] || tNode("trename", "desc.error", "上次任务失败，请查看冲突和日志。"),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.result?.conflicts.length) {
    return {
      label: tNode("trename", "status.warning", "有冲突"),
      description: tNode("trename", "desc.warning", "{{count}} 个冲突需要处理。", { count: data.result.conflicts.length }),
      tone: "warning",
      badgeVariant: "outline",
      iconClass: "bg-secondary text-secondary-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("trename", "status.success", "完成"),
      description: data.progressText || tNode("trename", "desc.success", "上次任务已完成。"),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (tree.total) {
    return {
      label: tNode("trename", "status.pending", "待校验"),
      description: tNode("trename", "desc.pending", "{{total}} 项，{{ready}} 项已准备重命名。", { total: tree.total, ready: tree.ready }),
      tone: "idle",
      badgeVariant: "outline",
      iconClass: "bg-secondary text-secondary-foreground",
    }
  }
  return {
    label: tNode("trename", "status.idle", "就绪"),
    description: tNode("trename", "desc.idle", "粘贴目录并扫描成 rename JSON。"),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: TrenameCardState, running: boolean): TrenamePhase {
  if (running) return data.phase ?? "scanning"
  return data.phase ?? "idle"
}

function phaseForAction(action: TrenameAction): TrenamePhase {
  if (action === "scan") return "scanning"
  if (action === "validate") return "validating"
  if (action === "rename" || action === "undo") return "renaming"
  return "ready"
}

function actionLabel(action: TrenameAction): string {
  if (action === "scan") return tNode("trename", "actionLabel.scan", "扫描")
  if (action === "import") return tNode("trename", "actionLabel.import", "导入")
  if (action === "validate") return tNode("trename", "actionLabel.validate", "校验")
  if (action === "rename") return tNode("trename", "actionLabel.rename", "重命名")
  if (action === "undo") return tNode("trename", "actionLabel.undo", "撤销")
  return tNode("trename", "actionLabel.history", "读取历史")
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.conflicts.length) return tNode("trename", "summary.conflicts", "{{count}} 个冲突", { count: props.result.conflicts.length })
  if (props.tree.total) return tNode("trename", "summary.tree", "{{total}} 项 / {{ready}} 就绪 / {{mode}}", { total: props.tree.total, ready: props.tree.ready, mode: props.dryRun ? tNode("trename", "mode.dry", "预演") : tNode("trename", "mode.live", "真实") })
  if (props.pathCount) return tNode("trename", "summary.waiting", "{{count}} 条路径等待扫描", { count: props.pathCount })
  return tNode("trename", "summary.empty", "选择目录后扫描 rename JSON")
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}

function parsePathInput(text: string): string[] {
  const matches = [...text.matchAll(/"([^"]+)"|(\S+)/g)]
  const values = matches.map((match) => match[1] ?? match[2] ?? "").map((value) => value.trim()).filter(Boolean)
  return [...new Set(values)]
}

function resultLines(result: TrenameData | null): string[] {
  if (!result) return []
  return [
    ...result.operations.map((item) => `plan ${item.originalPath} -> ${item.newPath}`),
    ...result.conflicts.map((item) => `conflict ${item.type} ${item.srcPath} -> ${item.tgtPath} / ${item.message}`),
    ...result.history.map((item) => `history ${item.id} ${item.timestamp} ${item.description} ${item.undone ? "undone" : "active"}`),
  ]
}
