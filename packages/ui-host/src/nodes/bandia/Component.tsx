import { useEffect, useRef, useState, type ReactNode } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { BandiaAction, BandiaData, BandiaInput, BandiaPathMapping } from "@xiranite/node-bandia/core"
// 解析实现仍只有一份，它住在 `packages/nodes/bandia/src/path-mappings.ts`（core 只是再导出）。GUI 取的是这条非 core
// 子路径：值导入 `.../core` 会往面进程里放第二份执行宿主，ADR-0074 §5 否决（同 classf 走 `.../blacklist` 的形状）。
import { mappingsToText, parseBandiaPaths, parsePathMappings } from "@xiranite/node-bandia/path-mappings"
import type { LucideIcon } from "lucide-react"
import { Archive, ArrowRight, Boxes, Copy, ExternalLink, FileArchive, Gauge, PackageOpen, RotateCcw, Route, Square } from "lucide-react"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { GridPattern } from "@/components/ui/grid-pattern"
import { ModulePanel } from "@/components/ui/module-panel"
import { NumberTicker } from "@/components/ui/number-ticker"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode, useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { DEFAULT_OUTPUT_PREFIX, MODES } from "./constants"
import {
  ActionIconButton,
  MappingInput,
  ModePicker,
  OptionsFields,
  OptionsPopover,
  PathInput,
  PrimarySwitches,
  StatusStrip,
} from "./controls"
import { QueuePreview, ResultTabs, StatsPanel } from "./ResultPanels"
import type { BandiaCardState, BandiaMode, BandiaStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("bandia")
  const data = host.getData<BandiaCardState>(compId) ?? {}
  const dataRef = useRef<BandiaCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<BandiaCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const mode = data.mode ?? "extract"
  const modeMeta = MODES.find((item) => item.value === mode) ?? MODES[0]!
  const logs = data.logs ?? []
  const result = data.result ?? null
  const progress = data.progress ?? 0
  const archivePaths = parseBandiaPaths(data.pathText ?? "")
  const rawPaths = parseRawPaths(data.pathText ?? "")
  const paths = mode === "extract" ? archivePaths : rawPaths
  const mappings = parsePathMappings(data.mappingText ?? "")
  const dryRun = data.dryRun ?? true
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<BandiaCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  async function reloadDefaults() {
    const response = await host.getNodeConfig?.<Partial<BandiaCardState>>()
    if (!response) return
    setDefaults(response.config)
    setConfigFilePath(response.path)
    setConfigDirty(false)
  }

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.compressFormat,
    data.deleteAfter,
    data.deleteSource,
    data.dryRun,
    data.extractMode,
    data.mappingText,
    data.mode,
    data.outputDir,
    data.outputPrefix,
    data.overwriteMode,
    data.parallel,
    data.useTrash,
    data.workers,
    defaults,
  ])

  function patch(patchData: Partial<BandiaCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-100)
    patch({ logs: nextLogs })
  }

  async function pasteInput() {
    const text = await host.clipboard?.readText?.()
    if (!text) return
    if (mode !== "extract" && (text.trim().startsWith("{") || text.includes("=>"))) {
      patch({ mappingText: text })
    } else {
      patch({ pathText: text.trim() })
    }
  }

  async function execute(action: BandiaAction = mode) {
    if (running) return
    const input = buildInput(action, dataRef.current, paths, mappings)
    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: t("error.noRunEnv", "Native execution is unavailable in this host. Use desktop mode or CLI.") })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: "running", progress: 0, progressText: t("progress.start", "{{action}} started", { action: labelForAction(action) }), result: null })
      const response = await run<BandiaInput, BandiaData>("bandia", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<BandiaData>

      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: response.data ?? null,
        mappingText: response.data?.pathMappings.length ? mappingsToText(response.data.pathMappings) : dataRef.current.mappingText,
        mode: response.data?.pathMappings.length ? "repack" : dataRef.current.mode,
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

  async function requestStop() {
    if (!running) return
    await host.actions?.run?.("bandia", { action: "stop" })
    patch({ phase: "error", progressText: t("error.stopRequested", "Stop requested") })
    pushLog("Stop requested.")
  }

  async function copyResults() {
    const lines = [
      ...(result?.pathMappings ?? []).map((mapping) => `${mapping.archivePath} => ${mapping.extractedPath}`),
      ...(result?.results ?? []).map((item) => `${item.success ? "ok" : "fail"} ${item.sourcePath}${resultTarget(item) ? ` -> ${resultTarget(item)}` : ""}${item.error ? ` / ${item.error}` : ""}`),
    ]
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<BandiaCardState> = {}
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
      mode: undefined,
      mappingText: undefined,
      outputDir: undefined,
      deleteAfter: undefined,
      useTrash: undefined,
      parallel: undefined,
      workers: undefined,
      extractMode: undefined,
      overwriteMode: undefined,
      outputPrefix: undefined,
      compressFormat: undefined,
      deleteSource: undefined,
      dryRun: undefined,
    })
  }

  const commonProps = createViewProps({
    archivePaths,
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    host,
    logs,
    mappings,
    mode,
    modeMeta,
    paths,
    progress,
    result,
    running,
    status,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: (value?: BandiaAction) => execute(value),
    onModeChange: (value: BandiaMode) => patch({ mode: value }),
    onOpenConfigFile: host.openConfigFile,
    onPaste: pasteInput,
    onPatch: patch,
    onReset: reset,
    onReloadDefaults: reloadDefaults,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onStop: requestStop,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/bandia relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-3" primaryStrength={15} accentStrength={16} />
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
  archivePaths: string[]
  configDirty: boolean
  configFilePath?: string
  data: BandiaCardState
  defaults?: Partial<BandiaCardState>
  dryRun: boolean
  host: NodeComponentProps["host"]
  logs: string[]
  mappings: BandiaPathMapping[]
  mode: BandiaMode
  modeMeta: typeof MODES[number]
  paths: string[]
  progress: number
  result: BandiaData | null
  running: boolean
  status: BandiaStatusMeta
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (value?: BandiaAction) => void
  onModeChange: (value: BandiaMode) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<BandiaCardState>) => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onStop: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  const Icon = props.modeMeta.icon
  const isRunning = props.status.tone === "running"
  return (
    <div data-testid="bandia-collapsed-view" className="relative h-full min-h-0 w-full p-1">
      <div className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
        <GridPattern width={24} height={24} className="fill-muted-foreground/[0.04] stroke-muted-foreground/[0.08]" />
        <RunningTint tone={props.status.tone} />
        {isRunning && <BorderBeam size={30} duration={5} colorFrom="var(--chart-3)" colorTo="var(--primary)" />}
        <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
          <FileArchive />
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs font-semibold leading-none">
            <span>Bandia</span>
            <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{summaryText(props)}</span>
          </div>
        </div>
        <RunActionButton compact props={props} />
        {isRunning && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
      </div>
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="bandia-compact-view" className="relative flex min-h-0 flex-1 flex-col">
      <GridPattern width={28} height={28} className="fill-muted-foreground/[0.035] stroke-muted-foreground/[0.07]" />
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine modeMeta={props.modeMeta} status={props.status} subtitle={props.data.progressText || props.modeMeta.description} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
          {props.running ? <ActionIconButton destructive icon={Square} label={tNode("bandia", "actions.stop", "Stop")} onClick={props.onStop} /> : <RunActionButton compact props={props} />}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <MiniPipeline props={props} />
        <PathInput compact archiveCount={props.archivePaths.length} data={props.data} disabled={props.running} mode={props.mode} pathCount={props.paths.length} onPaste={props.onPaste} onPatch={props.onPatch} />
        {props.mode !== "extract" && (
          <MappingInput compact data={props.data} disabled={props.running} mappingCount={props.mappings.length} mode={props.mode} onPatch={props.onPatch} />
        )}
        <PrimarySwitches compact data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <QueuePreview archivePaths={props.archivePaths} mappings={props.mappings} mode={props.mode} paths={props.paths} result={props.result} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="bandia-portrait-view" className="relative flex h-full min-h-0 flex-col gap-2 p-2">
      <GridPattern width={30} height={30} className="fill-muted-foreground/[0.035] stroke-muted-foreground/[0.07]" />
      <div className="relative flex shrink-0 items-start justify-between gap-2">
        <HeaderLine modeMeta={props.modeMeta} status={props.status} subtitle={props.data.progressText || props.modeMeta.description} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
          {props.running ? <ActionIconButton destructive icon={Square} label={tNode("bandia", "actions.stop", "Stop")} onClick={props.onStop} /> : <RunActionButton compact props={props} />}
        </div>
      </div>
      <div className="relative grid shrink-0 gap-2">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <VerticalPipeline props={props} />
        <PathInput compact archiveCount={props.archivePaths.length} data={props.data} disabled={props.running} mode={props.mode} pathCount={props.paths.length} onPaste={props.onPaste} onPatch={props.onPatch} />
        <PrimarySwitches compact data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
      </div>
      {(props.status.tone === "running" || props.status.tone === "error") && (
        <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
      )}
      <div className="relative min-h-0 flex-1">
        <ResultTabs
          compact
          archivePaths={props.archivePaths}
          logs={props.logs}
          mappings={props.mappings}
          mode={props.mode}
          paths={props.paths}
          result={props.result}
          running={props.running}
          onCopyLogs={props.onCopyLogs}
          onCopyResults={props.onCopyResults}
        />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="bandia-full-view" className="relative flex min-h-0 flex-1 flex-col gap-3 p-3">
      <GridPattern width={34} height={34} className="fill-muted-foreground/[0.03] stroke-muted-foreground/[0.06]" />
      <div className="relative flex shrink-0 flex-col gap-3 @4xl/bandia:flex-row @4xl/bandia:items-start @4xl/bandia:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <HeaderLine
            modeMeta={props.modeMeta}
            status={props.status}
            subtitle={props.data.progressText || tNode("bandia", "subtitle.full", "{{label}} / {{mode}} / {{count}} items", {
              label: props.modeMeta.label,
              mode: props.dryRun ? tNode("bandia", "mode.dry", "Dry run") : tNode("bandia", "mode.liveExecute", "Live run"),
              count: props.paths.length || props.mappings.length,
            })}
          />
          <PipelineRibbon props={props} />
        </div>
        <StatsPanel archiveCount={props.archivePaths.length} mappingCount={props.mappings.length} pathCount={props.paths.length} progress={props.progress} result={props.result} />
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 @4xl/bandia:grid-cols-[minmax(240px,0.9fr)_minmax(280px,1fr)_minmax(320px,1.25fr)]">
        <InputSilo props={props} />
        <ProcessingChamber props={props} />
        <MappingOutput props={props} />
      </div>
      <LogsRail props={props} />
    </div>
  )
}

function PipelineRibbon({ props }: { props: ViewProps }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <PipelinePill icon={PackageOpen} label="Input" value={String(props.paths.length || props.archivePaths.length)} />
      <ArrowRight className="size-3.5 shrink-0" />
      <PipelinePill icon={Gauge} label={props.dryRun ? "Plan" : "Commit"} value={props.status.label} />
      <ArrowRight className="size-3.5 shrink-0" />
      <PipelinePill icon={Route} label="Output" value={String(props.result?.results.length ?? props.mappings.length)} />
    </div>
  )
}

function MiniPipeline({ props }: { props: ViewProps }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 rounded-lg border bg-background/65 p-1.5">
      <MiniStage icon={PackageOpen} label="In" value={props.paths.length || props.archivePaths.length} />
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <MiniStage icon={Gauge} label={props.dryRun ? "Plan" : "Run"} value={props.progress} suffix="%" />
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <MiniStage icon={Route} label="Out" value={props.result?.results.length ?? props.mappings.length} />
    </div>
  )
}

function VerticalPipeline({ props }: { props: ViewProps }) {
  return (
    <div className="grid gap-1.5 rounded-lg border bg-background/65 p-2">
      <VerticalStage icon={PackageOpen} label="Input queue" value={`${props.paths.length || props.archivePaths.length}`} />
      <VerticalStage icon={Gauge} label={props.dryRun ? "Command plan" : "Live execution"} value={`${props.progress}%`} />
      <VerticalStage icon={Route} label="Mapping output" value={`${props.result?.results.length ?? props.mappings.length}`} />
    </div>
  )
}

function PipelinePanel(props: {
  children: ReactNode
  className?: string
  icon: LucideIcon
  subtitle: string
  title: string
}) {
  return (
    <ModulePanel fill className={cn("bg-background/80 p-3", props.className)} contentClassName="gap-0" icon={props.icon} title={props.title} subtitle={props.subtitle}>
      {props.children}
    </ModulePanel>
  )
}

function InputSilo({ props }: { props: ViewProps }) {
  return (
    <PipelinePanel
      icon={PackageOpen}
      title="Input silo"
      subtitle={`${props.mode === "extract" ? props.archivePaths.length : props.paths.length} queued / ${props.mappings.length} mappings`}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <PathInput archiveCount={props.archivePaths.length} data={props.data} disabled={props.running} mode={props.mode} pathCount={props.paths.length} onPaste={props.onPaste} onPatch={props.onPatch} />
        {props.mode !== "extract" && (
          <MappingInput data={props.data} disabled={props.running} mappingCount={props.mappings.length} mode={props.mode} onPatch={props.onPatch} />
        )}
        <div className="min-h-0 flex-1">
          <QueuePreview compact archivePaths={props.archivePaths} mappings={props.mappings} mode={props.mode} paths={props.paths} result={props.result} />
        </div>
      </div>
    </PipelinePanel>
  )
}

function ProcessingChamber({ props }: { props: ViewProps }) {
  return (
    <PipelinePanel
      icon={Boxes}
      title="Command chamber"
      subtitle={props.dryRun ? "Planning commands without file writes" : "Live file operations are armed"}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid shrink-0 place-items-center rounded-xl border bg-muted/20 py-3">
          <AnimatedCircularProgressBar
            value={props.progress}
            className="size-24 text-lg"
            gaugePrimaryColor={props.status.tone === "error" ? "var(--destructive)" : "var(--primary)"}
            gaugeSecondaryColor="color-mix(in oklch, var(--muted-foreground) 18%, transparent)"
          />
          <div className="mt-2 text-xs font-medium text-muted-foreground">{props.status.description}</div>
        </div>
        <ScrollArea className="min-h-0 flex-1 pr-1">
          <div className="grid gap-3">
            <PrimarySwitches data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
            <OptionsFields data={props.data} disabled={props.running} mode={props.mode} onPatch={props.onPatch} />
          </div>
        </ScrollArea>
        <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{props.dryRun ? "Dry run" : "Live run"}</span>
            <span className="mx-1">/</span>
            <span>{canRun(props.mode, props.paths, props.mappings) ? "ready" : "waiting for input"}</span>
          </div>
          <div data-testid="bandia-header-toolbar" className="flex items-center gap-1">
            {props.running ? <ActionIconButton destructive icon={Square} label={tNode("bandia", "actions.stop", "Stop")} onClick={props.onStop} /> : <RunActionButton props={props} />}
            <ToolbarActions {...props} hidePrimaryAction />
          </div>
        </div>
      </div>
    </PipelinePanel>
  )
}

function MappingOutput({ props }: { props: ViewProps }) {
  const failureCount = props.result?.failedCount ?? 0
  return (
    <PipelinePanel
      icon={Route}
      title="Mapping output"
      subtitle={failureCount ? `${failureCount} failed item(s)` : "Rows, mappings, and run artifacts"}
    >
      <ResultTabs
        archivePaths={props.archivePaths}
        logs={props.logs}
        mappings={props.mappings}
        mode={props.mode}
        paths={props.paths}
        result={props.result}
        running={props.running}
        onCopyLogs={props.onCopyLogs}
        onCopyResults={props.onCopyResults}
      />
    </PipelinePanel>
  )
}

function LogsRail({ props }: { props: ViewProps }) {
  const recentLogs = props.logs.slice(-4)
  return (
    <div className="relative grid shrink-0 gap-2 rounded-xl border bg-background/75 px-3 py-2 @4xl/bandia:grid-cols-[auto_minmax(0,1fr)_auto] @4xl/bandia:items-center">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Archive className="size-3.5" />
        <span>Recent log</span>
        <Badge variant="outline">{props.logs.length}</Badge>
      </div>
      <ScrollArea className="max-h-16 min-h-0">
        <div className="grid gap-1 text-xs text-muted-foreground">
          {recentLogs.length ? recentLogs.map((line, index) => <div key={`${index}:${line}`} className="truncate font-mono">{line}</div>) : <div>No run output yet.</div>}
        </div>
      </ScrollArea>
      <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopyLogs}>
        <Copy data-icon="inline-start" />
        Copy
      </Button>
    </div>
  )
}

function PipelinePill({ icon: Icon, label, value }: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-md border bg-background/70 px-2 py-1">
      <Icon className="size-3.5 shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-28 truncate font-medium text-foreground">{value}</span>
    </span>
  )
}

function MiniStage({ icon: Icon, label, suffix = "", value }: {
  icon: LucideIcon
  label: string
  suffix?: string
  value: number
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="mx-auto grid size-7 place-items-center rounded-md bg-muted/50 text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="mt-1 truncate text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold tabular-nums">
        <NumberTicker value={value} className="text-inherit" />
        {suffix}
      </div>
    </div>
  )
}

function VerticalStage({ icon: Icon, label, value }: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
      <Icon className="size-4 text-muted-foreground" />
      <span className="truncate text-xs font-medium">{label}</span>
      <Badge variant="outline" className="shrink-0">{value}</Badge>
    </div>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean; hidePrimaryAction?: boolean }) {
  const { t } = useNodeI18n("bandia")
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      {!props.compact && !props.hidePrimaryAction && (
        props.running ? (
          <ActionIconButton destructive icon={Square} label={tNode("bandia", "actions.stop", "Stop")} onClick={props.onStop} />
        ) : (
          <RunActionButton compact props={props} />
        )
      )}
      <ActionIconButton
        disabled={!props.paths.length && !props.mappings.length}
        icon={ExternalLink}
        label={tNode("bandia", "actions.exportEfu", "Export EFU")}
        onClick={() => props.onExecute("export_efu")}
      />
      <ActionIconButton disabled={!props.result} icon={Copy} label={tNode("bandia", "copyResults", "Copy results")} onClick={props.onCopyResults} />
      <ActionIconButton disabled={!props.logs.length} icon={Archive} label={tNode("bandia", "copyLogs", "Copy logs")} onClick={props.onCopyLogs} />
      <ActionIconButton icon={RotateCcw} label={tNode("bandia", "actions.clearState", "Clear state")} onClick={props.onReset} />
      {!props.compact && (
        <NodeConfigPopover
          configPath={props.configFilePath}
          defaults={props.defaults}
          dirty={props.configDirty}
          disabled={props.running}
          t={t}
          onOpenFile={props.onOpenConfigFile}
          onReload={props.onReloadDefaults}
          onRestore={props.onRestoreDefault}
          onSave={props.onSaveDefault}
        />
      )}
    </div>
  )
}
function RunActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const disabled = props.running || !canRun(props.mode, props.paths, props.mappings)
  const dangerous = isDangerous(props)
  const label = tNode("bandia", "actions.runLabel", "{{mode}}{{action}}", {
    mode: props.dryRun ? tNode("bandia", "mode.dry", "Dry run") : tNode("bandia", "mode.execute", "Run"),
    action: props.modeMeta.shortLabel,
  })

  return (
    <ExecuteButton
      dangerous={dangerous}
      disabled={disabled}
      compact={compact}
      label={label}
      onExecute={() => props.onExecute(props.mode)}
    />
  )
}

function HeaderLine({ modeMeta, status, subtitle }: {
  modeMeta: typeof MODES[number]
  status: BandiaStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <modeMeta.icon />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Bandia</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function buildInput(action: BandiaAction, data: BandiaCardState, paths: string[], mappings: BandiaPathMapping[]): BandiaInput {
  return {
    action,
    paths,
    mappings,
    mappingText: data.mappingText,
    deleteAfter: data.deleteAfter ?? true,
    useTrash: data.useTrash ?? true,
    parallel: data.parallel ?? false,
    workers: data.workers ?? 2,
    extractMode: data.extractMode ?? "auto",
    outputPrefix: data.outputPrefix ?? DEFAULT_OUTPUT_PREFIX,
    overwriteMode: data.overwriteMode ?? "overwrite",
    outputDir: data.outputDir,
    compressFormat: data.compressFormat ?? "zip",
    deleteSource: data.deleteSource ?? true,
    dryRun: data.dryRun ?? true,
    openInEverything: action === "export_efu",
  }
}

function statusFromState(data: BandiaCardState, running: boolean): BandiaStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: tNode("bandia", "status.running", "Running"),
      description: tNode("bandia", "desc.running", "Bandia is processing the current queue."),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("bandia", "status.success", "Done"),
      description: tNode("bandia", "desc.success", "The previous task completed."),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error") {
    return {
      label: tNode("bandia", "status.error", "Failed"),
      description: tNode("bandia", "desc.error", "The previous task failed. Check results and logs."),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  return {
    label: tNode("bandia", "status.idle", "Ready"),
    description: tNode("bandia", "desc.idle", "Paste paths or mappings to preview a run."),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function canRun(mode: BandiaMode, paths: string[], mappings: BandiaPathMapping[]): boolean {
  return mode === "extract" ? paths.length > 0 : paths.length > 0 || mappings.length > 0
}

function isDangerous(props: ViewProps): boolean {
  if (props.dryRun) return false
  if (props.mode === "extract") return props.data.deleteAfter ?? true
  return props.data.deleteSource ?? true
}

function labelForAction(action: BandiaAction): string {
  if (action === "extract") return tNode("bandia", "actionLabel.extract", "Extract")
  if (action === "compress") return tNode("bandia", "actionLabel.compress", "Compress")
  if (action === "repack") return tNode("bandia", "actionLabel.repack", "Repack")
  if (action === "export_efu") return tNode("bandia", "actionLabel.export_efu", "Export")
  return action
}

function resultTarget(item: { outputPath?: string; archivePath?: string }): string | undefined {
  return item.outputPath ?? item.archivePath
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.failedCount) return tNode("bandia", "summary.failed", "{{count}} failed", { count: props.result.failedCount })
  const modeLabel = props.dryRun ? tNode("bandia", "mode.dry", "Dry run") : tNode("bandia", "mode.live", "Live")
  if (props.mode === "extract") return tNode("bandia", "summary.archives", "{{count}} archives / {{mode}}", { count: props.archivePaths.length, mode: modeLabel })
  return tNode("bandia", "summary.items", "{{count}} items / {{mode}}", { count: props.paths.length || props.mappings.length, mode: modeLabel })
}

function parseRawPaths(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/\r?\n|[;]/)
    .map((item) => stripOuterQuotes(item.trim()))
    .filter((item) => item && !seen.has(item) && Boolean(seen.add(item)))
}

function stripOuterQuotes(value: string): string {
  let result = value.trim()
  while (result.length >= 2 && isQuote(result[0]!) && isQuote(result[result.length - 1]!)) {
    result = result.slice(1, -1).trim()
  }
  if (result && isQuote(result[0]!)) result = result.slice(1).trim()
  if (result && isQuote(result[result.length - 1]!)) result = result.slice(0, -1).trim()
  return result
}

function isQuote(value: string): boolean {
  return value === "\"" || value === "'"
}
