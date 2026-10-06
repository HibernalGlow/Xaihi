import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { CrashuData, CrashuInput } from "@xiranite/node-crashu/core"
import type { LucideIcon } from "lucide-react"
import { Copy, FolderSearch, MoveRight, RotateCcw, Search, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PathInput } from "@/components/ui/path-input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NumberTicker } from "@/components/ui/number-ticker"
import { cn } from "@/lib/utils"
import { tNode, useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { DEFAULT_THRESHOLD, NODE_ICON } from "./constants"
import { ActionIconButton, AdvancedOptionsPopover, ConflictPicker, DirectionPicker, MatchPlanBoard, PrimarySwitches, RichLogPanel, SourcePathsInput, StatusStrip, TargetNamesInput } from "./controls"
import type { CrashuAction, CrashuCardState, CrashuPhase, CrashuStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("crashu")
  const data = host.getData<CrashuCardState>(compId) ?? {}
  const dataRef = useRef<CrashuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<CrashuCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const progress = data.progress ?? 0
  const sourcePaths = splitLines(data.sourcePathsText)
  const targetNames = splitLines(data.targetNamesText)
  const threshold = data.similarityThreshold ?? DEFAULT_THRESHOLD
  const dryRun = data.dryRun ?? true
  const direction = data.moveDirection ?? "to_target"
  const conflict = data.conflictPolicy ?? "skip"
  const phase = phaseFromState(data, running)
  const status = statusFromState(data, running, result)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<CrashuCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.sourcePathsText, data.targetPath, data.targetNamesText, data.destinationPath, data.similarityThreshold, data.moveDirection, data.conflictPolicy, defaults])

  function patch(patchData: Partial<CrashuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-100)
    patch({ logs: nextLogs })
  }

  async function pasteSources() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ sourcePathsText: text.trim() })
  }

  async function execute(action: CrashuAction) {
    if (running) return
    if (!sourcePaths.length) {
      patch({ phase: "error", progress: 0, progressText: t("error.noSource", "请先输入至少一个源目录。") })
      return
    }

    const input: CrashuInput = {
      action,
      sourcePaths,
      targetPath: data.targetPath,
      targetNames,
      destinationPath: data.destinationPath,
      similarityThreshold: threshold,
      autoMove: action === "move",
      moveDirection: direction,
      conflictPolicy: conflict,
      dryRun,
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: t("error.noRunEnv", "当前环境没有本地运行能力，请使用桌面模式或 CLI。") })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: phaseForAction(action), progress: 0, progressText: t("progress.start", "{{action}}开始", { action: actionLabel(action) }), result: null })
      const response = await run<CrashuInput, CrashuData>("crashu", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<CrashuData>

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

  async function copyResults() {
    const matches = result?.similarFolders ?? []
    const lines = matches.map((item) => `${item.path} -> ${item.target} (${Math.round(item.similarity * 100)}%)`)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<CrashuCardState> = {}
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
      sourcePathsText: undefined,
      targetPath: undefined,
      targetNamesText: undefined,
      destinationPath: undefined,
      similarityThreshold: undefined,
      moveDirection: undefined,
      conflictPolicy: undefined,
    })
  }

  const commonProps = createViewProps({
    compactSurface,
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    host,
    logs,
    phase,
    progress,
    result,
    running,
    sourcePaths,
    status,
    targetNames,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.openConfigFile,
    onPatch: patch,
    onPasteSources: pasteSources,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/crashu flex h-full min-h-0 w-full overflow-hidden">
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
  compactSurface: boolean
  configDirty: boolean
  configFilePath?: string
  data: CrashuCardState
  defaults?: Partial<CrashuCardState>
  dryRun: boolean
  host: NodeComponentProps["host"]
  logs: string[]
  phase: CrashuPhase
  progress: number
  result: CrashuData | null
  running: boolean
  sourcePaths: string[]
  status: CrashuStatusMeta
  targetNames: string[]
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: CrashuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPatch: (patch: Partial<CrashuCardState>) => void
  onPasteSources: () => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

// ==================== VIEW: COLLAPSED ====================

function CollapsedView(props: ViewProps) {
  const Icon = NODE_ICON
  return (
    <div data-testid="crashu-collapsed-view" className="flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Icon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>{tNode("crashu", "name", "Crashu")}</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
      {props.status.tone === "running" && <div className="text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

// ==================== VIEW: COMPACT (landscape) ====================

function CompactView(props: ViewProps) {
  return (
    <div data-testid="crashu-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <SourcePathsInput compact disabled={props.running} pathCount={props.sourcePaths.length} value={props.data.sourcePathsText ?? ""} onChange={(sourcePathsText) => props.onPatch({ sourcePathsText })} onClear={() => props.onPatch({ sourcePathsText: "" })} onPaste={props.onPasteSources} />
          <TargetNamesInput compact disabled={props.running || Boolean(props.data.targetPath?.trim())} targetCount={props.targetNames.length} value={props.data.targetNamesText ?? ""} onChange={(targetNamesText) => props.onPatch({ targetNamesText })} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <PrimarySwitches compact className="min-w-0 flex-1" data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <CrashuDisplayTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

// ==================== VIEW: PORTRAIT COMPACT (tall narrow) ====================

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="crashu-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <SourcePathsInput compact disabled={props.running} pathCount={props.sourcePaths.length} value={props.data.sourcePathsText ?? ""} onChange={(sourcePathsText) => props.onPatch({ sourcePathsText })} onClear={() => props.onPatch({ sourcePathsText: "" })} onPaste={props.onPasteSources} />
        <TargetNamesInput compact disabled={props.running || Boolean(props.data.targetPath?.trim())} targetCount={props.targetNames.length} value={props.data.targetNamesText ?? ""} onChange={(targetNamesText) => props.onPatch({ targetNamesText })} />
        <div className="flex min-w-0 items-center gap-2">
          <PrimarySwitches compact className="min-w-0 flex-1" data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <CrashuDisplayTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </div>
  )
}

// ==================== VIEW: FULL (pipeline 3-zone layout) ====================

function FullView(props: ViewProps) {
  return (
    <div data-testid="crashu-full-view" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      {/* Top bar: header + pipeline + toolbar + stats */}
      <div className="flex shrink-0 flex-col gap-2 @3xl/crashu:flex-row @3xl/crashu:items-center @3xl/crashu:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @3xl/crashu:flex-row @3xl/crashu:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || tNode("crashu", "subtitle.full", "{{sources}} 源 / {{targets}} 目标 / {{mode}}", { sources: props.sourcePaths.length, targets: props.targetNames.length, mode: props.dryRun ? tNode("crashu", "mode.dry", "预演") : tNode("crashu", "mode.liveExecute", "真实执行") })} />
          <PipelineIndicator phase={props.phase} />
          <div data-testid="crashu-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-1">
            <ToolbarActions {...props} hidePrimaryAction />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      {(props.status.tone === "running" || props.status.tone === "error") && (
        <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
      )}

      {/* Main 3-zone pipeline grid: Input → Results → Execution Gate */}
      <div className="grid min-h-0 flex-1 gap-2 grid-cols-1 @2xl/crashu:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] @4xl/crashu:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(240px,300px)]">
        {/* Zone 1: Input */}
        <section data-testid="crashu-source-panel" className="flex min-h-0 flex-col gap-2 overflow-auto rounded-lg border bg-card p-2">
          <ZoneLabel icon={FolderSearch} label={tNode("crashu", "zone.input", "匹配输入")} />
          <SourcePathsInput disabled={props.running} pathCount={props.sourcePaths.length} value={props.data.sourcePathsText ?? ""} onChange={(sourcePathsText) => props.onPatch({ sourcePathsText })} onClear={() => props.onPatch({ sourcePathsText: "" })} onPaste={props.onPasteSources} />
          <TargetNamesInput disabled={props.running || Boolean(props.data.targetPath?.trim())} targetCount={props.targetNames.length} value={props.data.targetNamesText ?? ""} onChange={(targetNamesText) => props.onPatch({ targetNamesText })} />
        </section>

        <section data-testid="crashu-match-matrix" className="flex min-h-0 flex-col gap-2">
          <SimilarityRibbon result={props.result} />
          <MatchPlanBoard result={props.result} />
        </section>
        <div className="min-h-0">
          <ExecutionGate {...props} />
        </div>
      </div>
    </div>
  )
}

// ==================== LOCAL HELPERS ====================

function ExecutionGate(props: ViewProps) {
  const live = !props.dryRun
  return (
    <section className={cn("flex h-full min-h-0 flex-col gap-2 overflow-auto rounded-lg border bg-card p-2", live && "border-destructive/50 bg-destructive/[0.03]")}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <ZoneLabel icon={ShieldAlert} label={tNode("crashu", "zone.gate", "执行闸门")} tone={live ? "danger" : "default"} />
        <Badge variant={live ? "destructive" : "outline"}>{props.dryRun ? tNode("crashu", "mode.dry", "预演") : tNode("crashu", "mode.live", "真实")}</Badge>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-md border bg-card p-2">
        <Field orientation="horizontal" className="min-w-0 flex-1 items-center gap-2">
          <ShieldAlert className={cn("size-3.5 shrink-0", live ? "text-destructive" : "text-muted-foreground")} />
          <FieldContent className="min-w-0 gap-0.5">
            <FieldTitle className="truncate text-xs">{live ? tNode("crashu", "execution.liveState", "真实：将移动文件夹") : tNode("crashu", "execution.previewState", "预演：不移动文件夹")}</FieldTitle>
            <FieldDescription className="line-clamp-2 text-[11px]">{live ? tNode("crashu", "execution.liveDescription", "执行前仍会要求确认真实移动。") : tNode("crashu", "execution.previewDescription", "生成匹配与移动计划，不会写入文件系统。")}</FieldDescription>
          </FieldContent>
          <Switch
            aria-label={tNode("crashu", "aria.previewSwitch", "crashu 预演切换")}
            checked={props.dryRun}
            disabled={props.running}
            size="sm"
            onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
          />
        </Field>
      </div>

      <div className="grid gap-2">
        <GateTextField
          disabled={props.running}
          label={tNode("crashu", "labels.destination", "移动目标根目录")}
          placeholder="D:/destination"
          value={props.data.destinationPath ?? ""}
          onChange={(destinationPath) => props.onPatch({ destinationPath })}
        />
        <GateNumberField
          disabled={props.running}
          label={tNode("crashu", "labels.threshold", "相似度阈值")}
          min={0}
          max={1}
          step={0.05}
          value={props.data.similarityThreshold ?? DEFAULT_THRESHOLD}
          onChange={(similarityThreshold) => props.onPatch({ similarityThreshold })}
        />
      </div>

      <Field className="gap-1.5">
        <FieldTitle className="text-xs text-muted-foreground">{tNode("crashu", "labels.moveDirection", "移动方向")}</FieldTitle>
        <DirectionPicker disabled={props.running} value={props.data.moveDirection ?? "to_target"} onChange={(moveDirection) => props.onPatch({ moveDirection })} />
      </Field>

      <Field className="gap-1.5">
        <FieldTitle className="text-xs text-muted-foreground">{tNode("crashu", "labels.conflictPolicy", "冲突策略")}</FieldTitle>
        <ConflictPicker disabled={props.running} value={props.data.conflictPolicy ?? "skip"} onChange={(conflictPolicy) => props.onPatch({ conflictPolicy })} />
      </Field>

      <div className="mt-auto pt-2 [&>button]:w-full"><PrimaryActionButton props={props} /></div>
    </section>
  )
}

function SimilarityRibbon(props: { result: CrashuData | null }) {
  const matches = props.result?.similarFolders ?? []
  return (
    <section className="shrink-0 rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <ZoneLabel icon={Search} label={tNode("crashu", "matrix.similarityIndex", "相似度索引")} />
        <Badge variant="outline">{tNode("crashu", "matrix.matches", "{{count}} 个匹配", { count: matches.length })}</Badge>
      </div>
      <div className="grid min-h-8 grid-flow-col auto-cols-fr gap-1">
        {matches.length ? matches.slice(0, 12).map((match) => (
          <div
            key={`${match.path}:${match.target}`}
            className={cn("rounded-sm bg-primary", match.similarity < 0.75 && "bg-muted-foreground/60", match.similarity < 0.5 && "bg-destructive/70")}
            style={{ opacity: Math.max(0.25, match.similarity) }}
            title={`${match.name}: ${Math.round(match.similarity * 100)}%`}
          />
        )) : <div className="rounded-sm bg-muted" />}
      </div>
    </section>
  )
}

function GateTextField(props: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const id = `crashu-gate-${props.label}`
  return (
    <Field className="min-w-0 gap-1">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">{props.label}</FieldLabel>
      <PathInput
        id={id}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onValueChange={props.onChange}
      />
    </Field>
  )
}

function GateNumberField(props: {
  disabled?: boolean
  label: string
  max?: number
  min?: number
  onChange: (value: number) => void
  step?: number
  value: number
}) {
  const id = `crashu-gate-${props.label}`
  return (
    <Field className="min-w-0 gap-1">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">{props.label}</FieldLabel>
      <Input
        id={id}
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        step={props.step}
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </Field>
  )
}

function ZoneLabel({ icon: Icon, label, tone }: {
  icon: LucideIcon
  label: string
  tone?: "default" | "danger"
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Icon className={cn("size-3.5", tone === "danger" ? "text-destructive" : "text-muted-foreground")} />
      <span className="text-xs font-semibold">{label}</span>
    </div>
  )
}

function PipelineIndicator({ phase }: { phase: CrashuPhase }) {
  const steps = [
    tNode("crashu", "pipeline.input", "输入"),
    tNode("crashu", "pipeline.match", "匹配"),
    tNode("crashu", "pipeline.plan", "计划"),
    tNode("crashu", "pipeline.execute", "执行"),
  ]
  const activeIndex = phase === "idle" ? 0
    : phase === "scanning" ? 1
    : phase === "planning" ? 2
    : phase === "moving" || phase === "completed" ? 3
    : 0

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {steps.map((label, index) => {
        const isActive = index === activeIndex
        const isDone = (index < activeIndex) || (phase === "completed" && index < 3)
        return (
          <div key={label} className="flex items-center gap-0.5">
            {index > 0 && <div className={cn("h-px w-3", isDone ? "bg-primary/50" : "bg-border")} />}
            <div className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
              isActive ? "bg-primary text-primary-foreground" : isDone ? "text-primary" : "text-muted-foreground",
            )}>
              <span className="tabular-nums">{index + 1}</span>
              <span className="hidden @3xl/crashu:inline">{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==================== SHARED COMPONENTS ====================

function ToolbarActions(props: ViewProps & { compact?: boolean; hidePrimaryAction?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      <ActionIconButton disabled={props.running || !props.sourcePaths.length} icon={Search} label={tNode("crashu", "actions.scanMatch", "扫描匹配")} onClick={() => props.onExecute("scan")} />
      <ActionIconButton disabled={props.running || !props.sourcePaths.length} icon={Search} label={tNode("crashu", "actions.plan", "生成计划")} onClick={() => props.onExecute("plan")} />
      {!props.compact && !props.hidePrimaryAction && <PrimaryActionButton props={props} />}
      <ActionIconButton disabled={!props.result} icon={Copy} label={tNode("crashu", "copyResults", "复制结果")} onClick={props.onCopyResults} />
      <ActionIconButton icon={RotateCcw} label={tNode("crashu", "actions.clearState", "清空状态")} onClick={props.onReset} />
      {!props.compact && (
        <NodeConfigButton nodeKey="crashu"
          configDirty={props.configDirty}
          configFilePath={props.configFilePath}
          defaults={props.defaults}
          disabled={props.running}
          onOpenConfigFile={props.onOpenConfigFile}
          onResetOverride={props.onResetOverride}
          onRestoreDefault={props.onRestoreDefault}
          onSaveDefault={props.onSaveDefault}
        />
      )}
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const disabled = !props.sourcePaths.length || !props.data.destinationPath
  const label = props.dryRun ? tNode("crashu", "actions.dryMove", "预演移动") : tNode("crashu", "actions.liveMove", "真实移动")

  // 真实移动无法撤销，引信窗口取默认值的 1.5 倍，留足中止时间。
  return (
    <ExecuteButton
      dangerous={!props.dryRun}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={<MoveRight />}
      undoWindow={6000}
      onExecute={() => props.onExecute("move")}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: CrashuStatusMeta
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
            <h3 className="truncate text-sm font-semibold leading-none">{tNode("crashu", "name", "Crashu")}</h3>
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
  result: CrashuData | null
}) {
  const stats = [
    { label: tNode("crashu", "stats.sources", "源"), value: props.result?.sourceCount ?? 0, numeric: true },
    { label: tNode("crashu", "stats.targets", "目标"), value: props.result?.targetCount ?? 0, numeric: true },
    { label: tNode("crashu", "stats.matches", "匹配"), value: props.result?.similarFound ?? 0, numeric: true },
    { label: tNode("crashu", "stats.moved", "移动"), value: props.result?.movedCount ?? 0, numeric: true },
    { label: tNode("crashu", "stats.skipped", "跳过"), value: props.result?.skippedCount ?? 0, numeric: true },
    { label: tNode("crashu", "stats.progress", "进度"), value: props.progress, numeric: false, suffix: "%" },
  ]

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/crashu:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{stat.label}</div>
          <div className="text-sm font-semibold tabular-nums">
            {stat.numeric ? (
              <NumberTicker value={stat.value} className="text-foreground dark:text-foreground" />
            ) : (
              <span>{stat.value}{stat.suffix}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CrashuDisplayTabs(props: {
  compact?: boolean
  logs: string[]
  result: CrashuData | null
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
      <TabsList className="shrink-0">
        <TabsTrigger value="results">{tNode("crashu", "tabs.results", "结果")}</TabsTrigger>
        <TabsTrigger value="logs">{tNode("crashu", "tabs.logs", "日志")}</TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="min-h-0 flex-1">
        <MatchPlanBoard compact={props.compact} result={props.result} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <RichLogPanel compact={props.compact} logs={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

// ==================== LOGIC FUNCTIONS ====================

function statusFromState(data: CrashuCardState, running: boolean, result: CrashuData | null): CrashuStatusMeta {
  if (running || data.phase === "scanning" || data.phase === "planning" || data.phase === "moving") {
    return {
      label: tNode("crashu", "status.running", "运行中"),
      description: data.progressText || tNode("crashu", "desc.running", "Crashu 正在匹配或移动文件夹。"),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || result?.errors.length) {
    return {
      label: tNode("crashu", "status.error", "失败"),
      description: data.progressText || result?.errors[0] || tNode("crashu", "desc.error", "上次任务失败，请查看结果和日志。"),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("crashu", "status.success", "完成"),
      description: data.progressText || tNode("crashu", "desc.success", "上次任务已完成。"),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  return {
    label: tNode("crashu", "status.idle", "就绪"),
    description: tNode("crashu", "desc.idle", "粘贴源目录和目标名称后开始匹配。"),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: CrashuCardState, running: boolean): CrashuPhase {
  if (running) return data.phase ?? "scanning"
  return data.phase ?? "idle"
}

function phaseForAction(action: CrashuAction): CrashuPhase {
  if (action === "scan") return "scanning"
  if (action === "plan") return "planning"
  if (action === "move") return "moving"
  return "scanning"
}

function actionLabel(action: CrashuAction): string {
  if (action === "scan") return tNode("crashu", "actionLabel.scan", "扫描")
  if (action === "plan") return tNode("crashu", "actionLabel.plan", "计划")
  if (action === "move") return tNode("crashu", "actionLabel.move", "移动")
  return action
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.similarFound) return tNode("crashu", "summary.matches", "匹配 {{matched}} / 移动 {{moved}}", { matched: props.result.similarFound, moved: props.result.movedCount })
  if (props.sourcePaths.length) return tNode("crashu", "summary.sources", "{{sources}} 源 / {{targets}} 目标 / {{mode}}", { sources: props.sourcePaths.length, targets: props.targetNames.length, mode: props.dryRun ? tNode("crashu", "mode.dry", "预演") : tNode("crashu", "mode.live", "真实") })
  return tNode("crashu", "summary.empty", "粘贴源目录后开始匹配")
}

function splitLines(text?: string): string[] {
  return (text ?? "").split(/\r?\n|[;]/).map((item) => item.trim()).filter(Boolean)
}
