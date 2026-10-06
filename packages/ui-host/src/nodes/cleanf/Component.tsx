import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { CleanfData, CleanfInput, CleanfPresetId } from "@xiranite/node-cleanf/core"
import { parseCleanfPaths } from "@xiranite/node-cleanf/paths"
import type { LucideIcon } from "lucide-react"
import { Copy, Eye, FileSearch, FolderSearch, Gauge, ListChecks, Play, RotateCcw, ShieldAlert, Trash2, Zap } from "lucide-react"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { tNode, useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { DEFAULT_SELECTED_PRESETS, NODE_ICON } from "./constants"
import { ActionIconButton, AdvancedOptionsPopover, LogPanel, PathInput, PresetPicker, PrimarySwitches, ResultList, StatusStrip } from "./controls"
import type { CleanfCardState, CleanfPhase, CleanfStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("cleanf")
  const data = host.getData<CleanfCardState>(compId) ?? {}
  const dataRef = useRef<CleanfCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<CleanfCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const progress = data.progress ?? 0
  const pathCount = parseCleanfPaths(data.pathText ?? "").length
  const selectedPresets = data.selectedPresets ?? DEFAULT_SELECTED_PRESETS
  const previewMode = data.previewMode ?? true
  const phase = phaseFromState(data, running)
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  async function reloadDefaults() {
    try {
      const response = await host.getNodeConfig?.<Partial<CleanfCardState>>()
      setDefaults(response?.config)
      setConfigFilePath(response?.path)
    } catch {
      // Browser QA has no desktop configuration service.
    }
  }

  useEffect(() => {
    void reloadDefaults()
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.pathText, data.selectedPresets, data.excludeKeywords, data.previewMode, defaults])

  function patch(patchData: Partial<CleanfCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-100)
    patch({ logs: nextLogs })
  }

  async function pastePath() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathText: text.trim() })
  }

  function togglePreset(id: CleanfPresetId) {
    const next = selectedPresets.includes(id)
      ? selectedPresets.filter((preset) => preset !== id)
      : [...selectedPresets, id]
    patch({ selectedPresets: next })
  }

  async function execute(override: Partial<CleanfCardState> = {}) {
    if (running) return
    const current = { ...dataRef.current, ...override }
    const paths = parseCleanfPaths(current.pathText ?? "")
    if (!paths.length) {
      patch({ phase: "error", progress: 0, progressText: t("error.noScanPath", "请先输入至少一个扫描路径。") })
      return
    }

    const input: CleanfInput = {
      paths,
      presets: current.selectedPresets ?? DEFAULT_SELECTED_PRESETS,
      exclude: current.excludeKeywords,
      preview: current.previewMode ?? true,
    }

    await runInput(input, input.preview ? t("actionLabel.preview", "预演") : t("actionLabel.clean", "清理"), override)
  }

  async function undoLastCleanup() {
    if (running) return
    await runInput({ action: "undo" }, t("actionLabel.undo", "撤销"))
  }

  async function runInput(input: CleanfInput, actionLabel: string, override: Partial<CleanfCardState> = {}) {
    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: t("error.noRunEnv", "当前环境没有本地运行能力，请使用桌面模式或 CLI。") })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: "scanning", progress: 0, progressText: t("progress.start", "{{action}}开始", { action: actionLabel }), result: null, ...override })
      const response = await run<CleanfInput, CleanfData>("cleanf", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<CleanfData>

      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: response.data ?? null,
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

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyResults() {
    const lines = result?.previewFiles.length
      ? result.previewFiles
      : Object.entries(result?.removedDetails ?? []).map(([key, count]) => `${key}: ${count}`)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<CleanfCardState> = {}
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

  const commonProps = createViewProps({
    configDirty,
    configFilePath,
    data,
    defaults,
    host,
    logs,
    pathCount,
    phase,
    previewMode,
    progress,
    result,
    running,
    selectedPresets,
    status,
    t,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.openConfigFile,
    onPastePath: pastePath,
    onPatch: patch,
    onReloadDefaults: reloadDefaults,
    onReset: reset,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onTogglePreset: togglePreset,
    onUndoLastCleanup: undoLastCleanup,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} data-testid="cleanf-surface" className="@container/cleanf flex h-full min-h-0 w-full overflow-hidden">
        <div className="flex min-h-0 w-full flex-col">
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
  data: CleanfCardState
  defaults?: Partial<CleanfCardState>
  host: NodeComponentProps["host"]
  logs: string[]
  pathCount: number
  phase: CleanfPhase
  previewMode: boolean
  progress: number
  result: CleanfData | null
  running: boolean
  selectedPresets: CleanfPresetId[]
  status: CleanfStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (override?: Partial<CleanfCardState>) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePath: () => void
  onPatch: (patch: Partial<CleanfCardState>) => void
  onReloadDefaults: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onTogglePreset: (id: CleanfPresetId) => void
  onUndoLastCleanup: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  const Icon = NODE_ICON
  return (
    <div data-testid="cleanf-collapsed-view" className="flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Icon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Cleanf</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="cleanf-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        <InlineExecutionGate compact props={props} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <CompactOutcomePanel logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="cleanf-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        <InlineExecutionGate compact props={props} />
        <ToolbarActions {...props} compact />
      </div>
      {(props.status.tone === "running" || props.status.tone === "error") && (
        <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
      )}
      <div className="min-h-0 flex-1">
        <CleanfDisplayTabs compact logs={props.logs} phase={props.phase} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="cleanf-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @3xl/cleanf:flex-row @3xl/cleanf:items-center @3xl/cleanf:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @3xl/cleanf:flex-row @3xl/cleanf:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || tNode("cleanf", "subtitle.full", "{{paths}} 路径 / {{presets}} 预设 / {{mode}}", { paths: props.pathCount, presets: props.selectedPresets.length, mode: props.previewMode ? tNode("cleanf", "mode.dry", "预演") : tNode("cleanf", "mode.liveExecute", "真实执行") })} />
          <div data-testid="cleanf-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolbarActions {...props} hidePrimaryAction />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} selectedPresets={props.selectedPresets.length} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 grid-cols-1 @2xl/cleanf:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] @4xl/cleanf:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(240px,290px)]">
        <PresetRulePanel {...props} />
        <PreviewDeletionPanel {...props} />
        <ExecutionGatePanel {...props} />
      </div>

      <LogsStrip logs={props.logs} onCopy={props.onCopyLogs} />
    </div>
  )
}

function PresetRulePanel(props: ViewProps) {
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-auto rounded-lg border bg-card/72 p-3 @2xl/cleanf:max-h-full">
      <div className="grid gap-3 border-b pb-3">
        <SectionTitle icon={FolderSearch} title={tNode("cleanf", "labels.input", "输入")} hint={tNode("cleanf", "labels.inputHint", "粘贴目录，选择清理预设，预演确认后再移入系统回收站。")} />
        <PathInput disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
      </div>
      <div className="grid gap-2 border-b pb-3">
        <SectionTitle icon={ListChecks} title={tNode("cleanf", "labels.presets", "清理预设")} />
        <PresetPicker disabled={props.running} selected={props.selectedPresets} onToggle={props.onTogglePreset} />
      </div>
    </section>
  )
}

function PreviewDeletionPanel(props: ViewProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card/72 @2xl/cleanf:max-h-full">
      <SectionTitle icon={FileSearch} title={tNode("cleanf", "labels.preview", "待删预览")} hint={tNode("cleanf", "labels.previewHint", "预演或清理后，这里列出将被删除的文件和分类统计。")} className="px-3 pt-3" />
      <div className="min-h-0 flex-1 px-3 pb-3">
        <CleanfDisplayTabs logs={props.logs} phase={props.phase} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </section>
  )
}

function ExecutionGatePanel(props: ViewProps) {
  return (
    <section className={cn(
      "col-span-1 flex min-h-0 flex-col gap-3 overflow-auto rounded-lg border bg-card/72 p-3 @2xl/cleanf:col-span-2 @4xl/cleanf:col-span-1 @4xl/cleanf:col-start-3 @4xl/cleanf:row-start-1",
      !props.previewMode && !props.running && "border-destructive/50 bg-destructive/[0.03]",
    )} data-testid="cleanf-execution-gate">
      <SectionTitle
        icon={Gauge}
        title={tNode("cleanf", "labels.gate", "执行闸门")}
        hint={props.previewMode ? tNode("cleanf", "gate.previewHint", "预演模式：仅扫描不删除。") : tNode("cleanf", "gate.liveHint", "真实模式：匹配项将移入系统回收站，可撤销恢复。")}
      />
      <PrimarySwitches data={props.data} disabled={props.running} onPatch={props.onPatch} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
          <span className="text-xs text-muted-foreground">{tNode("cleanf", "gate.progress", "进度")}</span>
          <span className="text-xs font-semibold tabular-nums">{props.progress}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border px-2 py-1.5 text-center">
            <div className="text-[11px] text-muted-foreground">{tNode("cleanf", "gate.presetsCount", "{{count}} 预设", { count: props.selectedPresets.length })}</div>
          </div>
          <div className="rounded-md border px-2 py-1.5 text-center">
            <div className="text-[11px] text-muted-foreground">{tNode("cleanf", "gate.pathsCount", "{{count}} 路径", { count: props.pathCount })}</div>
          </div>
        </div>
        <Badge variant={props.previewMode ? "outline" : "destructive"} className="w-fit">
          {props.previewMode ? <ShieldAlert className="size-3" /> : <Zap className="size-3" />}
          {props.previewMode ? tNode("cleanf", "mode.dry", "预演") : tNode("cleanf", "mode.live", "真实")}
        </Badge>
      </div>
      <PrimaryActionButton props={props} />
      <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
    </section>
  )
}

function LogsStrip(props: {
  logs: string[]
  onCopy: () => void
}) {
  if (!props.logs.length) return null
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md border bg-card/72 px-2 py-1">
      <Gauge className="size-3.5 shrink-0 text-muted-foreground" />
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-3 font-mono text-[11px] leading-5 text-muted-foreground">
          {props.logs.slice(-5).map((line, index) => (
            <span key={`${line}:${index}`} className="whitespace-nowrap">{line}</span>
          ))}
        </div>
      </ScrollArea>
      <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
        <Copy data-icon="inline-start" />
        {tNode("cleanf", "copyLogs", "复制日志")}
      </Button>
    </div>
  )
}

function SectionTitle(props: {
  icon: LucideIcon
  title: string
  hint?: string
  className?: string
}) {
  const Icon = props.icon
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", props.className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-sm font-semibold">{props.title}</span>
      {props.hint && <span className="ml-auto hidden min-w-0 truncate text-[11px] text-muted-foreground @3xl/cleanf:block">{props.hint}</span>}
    </div>
  )
}

function InlineExecutionGate({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <section
      data-testid="cleanf-execution-gate"
      className={cn("flex min-w-0 items-center gap-2 rounded-lg border bg-card/72 p-2", compact && "gap-1.5 p-1.5")}
    >
      <PrimarySwitches
        compact
        className="min-w-0 flex-1"
        data={props.data}
        disabled={props.running}
        onPatch={props.onPatch}
      />
      <div className="shrink-0">
        <PrimaryActionButton props={props} />
      </div>
    </section>
  )
}

function CompactOutcomePanel(props: {
  logs: string[]
  result: CleanfData | null
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const previewCount = props.result?.previewFiles.length ?? 0
  const removed = props.result?.totalRemoved ?? 0
  const hasResult = Boolean(props.result)
  const text = hasResult
    ? tNode("cleanf", "compact.resultSummary", "{{removed}} 项 / {{preview}} 预演项", { removed, preview: previewCount })
    : props.logs.length
      ? props.logs.at(-1) ?? ""
      : tNode("cleanf", "compact.waiting", "等待预演结果")
  return (
    <section className="flex min-h-0 items-center gap-2 rounded-lg border bg-card/72 px-2 py-1.5">
      <Eye className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{text}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {tNode("cleanf", "compact.outcome", "结果摘要")}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ActionIconButton disabled={!hasResult} icon={Copy} label={tNode("cleanf", "actions.copyResults", "复制结果")} onClick={props.onCopyResults} />
        <ActionIconButton disabled={!props.logs.length} icon={Eye} label={tNode("cleanf", "copyLogs", "复制日志")} onClick={props.onCopyLogs} />
      </div>
    </section>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean; hidePrimaryAction?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", props.compact && "justify-between")} data-testid="cleanf-secondary-actions">
      {!props.compact && !props.hidePrimaryAction && <PrimaryActionButton props={props} />}
      {!props.compact && (
        <div aria-label={tNode("cleanf", "actionGroup.inspect", "查看和复制")} className="flex min-w-0 items-center gap-1">
          <ActionIconButton disabled={!props.result} icon={Copy} label={tNode("cleanf", "actions.copyResults", "复制结果")} onClick={props.onCopyResults} />
          <ActionIconButton disabled={!props.logs.length} icon={Eye} label={tNode("cleanf", "copyLogs", "复制日志")} onClick={props.onCopyLogs} />
        </div>
      )}
      <div aria-label={tNode("cleanf", "actionGroup.history", "清理历史")} className={cn("flex items-center gap-1", !props.compact && "ml-1 border-l pl-1")}>
        <ActionIconButton disabled={props.running} icon={RotateCcw} label={tNode("cleanf", "actions.undoLastCleanup", "撤销上次清理")} onClick={props.onUndoLastCleanup} />
      </div>
      <div aria-label={tNode("cleanf", "actionGroup.config", "配置")} className={cn("flex items-center gap-1", !props.compact && "ml-1 border-l pl-1")}>
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
      </div>
      <div aria-label={tNode("cleanf", "actionGroup.reset", "重置")} className={cn("flex items-center gap-1", !props.compact && "ml-1 border-l pl-1")}>
        <ActionIconButton icon={RotateCcw} label={tNode("cleanf", "actions.clearState", "清空状态")} onClick={props.onReset} />
      </div>
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const disabled = !props.pathCount
  const dangerous = !props.previewMode
  const label = props.previewMode ? tNode("cleanf", "actions.dryClean", "预演清理") : tNode("cleanf", "actions.liveClean", "真实清理")
  return (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={dangerous ? <Trash2 /> : <Play />}
      onExecute={() => props.onExecute()}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: CleanfStatusMeta
  subtitle: string
}) {
  const Icon = NODE_ICON
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Icon />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Cleanf</h3>
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
  result: CleanfData | null
  selectedPresets: number
}) {
  const removed = props.result?.totalRemoved ?? 0
  const skipped = props.result?.skipped ?? 0
  const preview = props.result?.previewFiles.length ?? 0
  const stats = [
    { label: tNode("cleanf", "stats.total", "总计"), value: removed },
    { label: tNode("cleanf", "stats.skipped", "跳过"), value: skipped },
    { label: tNode("cleanf", "stats.preview", "预演项"), value: preview },
    { label: tNode("cleanf", "stats.presets", "预设"), value: props.selectedPresets },
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-2 gap-1 @3xl/cleanf:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="relative min-w-0 overflow-hidden rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{stat.label}</div>
          <div className="text-sm font-semibold tabular-nums">
            <NumberTicker value={stat.value} className="text-foreground" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CleanfDisplayTabs(props: {
  compact?: boolean
  logs: string[]
  phase: CleanfPhase
  result: CleanfData | null
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const hasResult = Boolean(props.result)
  const preferredTab = hasResult ? "results" : props.logs.length ? "logs" : "results"
  const [tab, setTab] = useState(preferredTab)

  useEffect(() => {
    setTab(preferredTab)
  }, [preferredTab])

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        <TabsTrigger value="results">{tNode("cleanf", "tabs.results", "结果")}</TabsTrigger>
        <TabsTrigger value="logs">{tNode("cleanf", "tabs.logs", "日志")}</TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="min-h-0 flex-1">
        <ResultList compact={props.compact} result={props.result} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <LogPanel compact={props.compact} logs={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function statusFromState(data: CleanfCardState, running: boolean): CleanfStatusMeta {
  if (running || data.phase === "scanning") {
    return {
      label: tNode("cleanf", "status.running", "运行中"),
      description: data.progressText || tNode("cleanf", "desc.running", "Cleanf 正在扫描并清理。"),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error") {
    return {
      label: tNode("cleanf", "status.error", "失败"),
      description: data.progressText || tNode("cleanf", "desc.error", "上次任务失败，请查看日志。"),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("cleanf", "status.success", "完成"),
      description: data.progressText || tNode("cleanf", "desc.success", "上次任务已完成。"),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  return {
    label: tNode("cleanf", "status.idle", "就绪"),
    description: tNode("cleanf", "desc.idle", "粘贴目录并选择预设后预演或清理。"),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: CleanfCardState, running: boolean): CleanfPhase {
  if (running) return data.phase ?? "scanning"
  return data.phase ?? "idle"
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.restored !== undefined) return tNode("cleanf", "summary.restored", "已恢复 {{restored}} 项 / 失败 {{failed}} 项", { restored: props.result.restored, failed: props.result.skipped })
  if (props.result?.totalRemoved) return tNode("cleanf", "summary.removed", "已移入回收站 {{removed}} 项 / 跳过 {{skipped}} 项", { removed: props.result.totalRemoved, skipped: props.result.skipped })
  if (props.pathCount) return tNode("cleanf", "summary.paths", "{{paths}} 条路径 / {{presets}} 预设 / {{mode}}", { paths: props.pathCount, presets: props.selectedPresets.length, mode: props.previewMode ? tNode("cleanf", "mode.dry", "预演") : tNode("cleanf", "mode.live", "真实") })
  return tNode("cleanf", "summary.empty", "粘贴目录后预演清理结果")
}
