import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { GifuAction, GifuData, GifuInput } from "@xiranite/node-gifu/core"
import { Film, LoaderCircle, Play, RotateCcw, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { ACTIONS } from "./constants"
import {
  ActionIconButton,
  OptionsPopover,
  OutputFields,
  PathsInput,
  RuntimeOptions,
  StatusStrip,
} from "./controls"
import { GifuResultTabs, GifuStatsPanel } from "./results"
import type { GifuCardState, GifuStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"
import { RunStateIcon } from "@/nodes/shared/controls"

export function Component({ compId, host }: NodeComponentProps<GifuCardState, Partial<GifuCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const data = getHostData(host, compId)
  const dataRef = useRef<GifuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<GifuCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const action = data.action ?? "plan"
  const actionMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[1]!
  const result = data.result ?? null
  const logs = data.logs ?? []
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)
  const pathCount = parseLines(data.pathsText).length

  useEffect(() => {
    const loadConfig = host.config?.get?.() ?? host.getNodeConfig?.()
    loadConfig
      ?.then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.pathsText,
    data.configPath,
    data.databasePath,
    data.format,
    data.outDir,
    data.outMode,
    data.durationMs,
    data.maxWorkers,
    data.namePrefix,
    data.dryRun,
    data.recordRun,
    defaults,
  ])

  function patch(patchData: Partial<GifuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    if (host.state?.patchData) host.state.patchData(patchData)
    else host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pastePaths() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathsText: text.trim() })
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyResults() {
    const current = dataRef.current.result
    if (!current) return
    const lines = [
      ...(current.archives ?? []).map((item) => `${item.status}\t${item.imageCount}\t${item.archivePath}\t${item.outputPath}`),
      current.command ? `${current.command.command} ${current.command.args.join(" ")}` : "",
    ].filter(Boolean)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  function reset() {
    patch({ logs: [], phase: "idle", progress: 0, progressText: "", result: null })
  }

  async function saveAsDefault() {
    const config: Partial<GifuCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    if (host.config?.save) await host.config.save(config)
    else await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    const empty: Partial<GifuCardState> = {}
    for (const field of CONFIG_FIELDS) empty[field] = undefined
    patch(empty)
  }

  async function execute(nextAction: GifuAction = action) {
    if (running) return
    const current = dataRef.current
    if (!parseLines(current.pathsText).length) {
      const message = "请先输入至少一个归档或目录。"
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
      const response = await run<GifuInput, GifuData>("gifu", buildInput(nextAction, current), (event: NodeRunEvent) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
          return
        }
        pushLog(event.message)
      }) as NodeRunResult<GifuData>

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

  const commonProps = {
    action,
    actionMeta,
    configDirty,
    configFilePath,
    data,
    defaults,
    logs,
    pathCount,
    progress,
    result,
    running,
    status,
    onActionChange: (value: GifuAction) => patch({ action: value }),
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.config?.openFile ?? host.openConfigFile,
    onPastePaths: pastePaths,
    onPatch: patch,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/gifu relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-2" primaryAt={[14, 0]} primaryStrength={14} accentAt={[86, 8]} />
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
  action: GifuAction
  actionMeta: typeof ACTIONS[number]
  configDirty: boolean
  configFilePath?: string
  data: GifuCardState
  defaults?: Partial<GifuCardState>
  logs: string[]
  pathCount: number
  progress: number
  result: GifuData | null
  running: boolean
  status: GifuStatusMeta
  onActionChange: (value: GifuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: GifuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePaths: () => void
  onPatch: (patch: Partial<GifuCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  const Icon = props.actionMeta.icon
  return (
    <div data-testid="gifu-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Film />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Gifu</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{summaryText(props)}</span>
        </div>
      </div>
      <RunActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="gifu-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <PathsInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
        <ActionDeck compact props={props} />
        <div className="grid grid-cols-2 gap-2">
          <OutputFields data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <GifuResultTabs compact logs={props.logs} result={props.result} running={props.running} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="gifu-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <PathsInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
        <ActionDeck compact props={props} />
      </div>
      <div className="min-h-0 flex-1">
        <GifuResultTabs compact logs={props.logs} result={props.result} running={props.running} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="gifu-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/gifu:flex-row @4xl/gifu:items-center @4xl/gifu:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/gifu:flex-row @4xl/gifu:items-center">
          <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
          <div data-testid="gifu-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ActionIconButton disabled={props.running} icon={RotateCcw} label="清空状态" onClick={props.onReset} />
            <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <NodeConfigButton nodeKey="gifu"
              configDirty={props.configDirty}
              configFilePath={props.configFilePath}
              defaults={props.defaults}
              disabled={props.running}
              onOpenConfigFile={props.onOpenConfigFile}
              onResetOverride={props.onResetOverride}
              onRestoreDefault={props.onRestoreDefault}
              onSaveDefault={props.onSaveDefault}
            />
          </div>
        </div>
        <GifuStatsPanel result={props.result} />
      </div>

      <div data-testid="gifu-wide-layout" className="grid min-h-0 flex-1 gap-3 @[760px]/gifu:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <section data-testid="gifu-control-panel" className="flex min-h-0 flex-col gap-3 overflow-auto rounded-xl border bg-card/90 p-3 shadow-sm">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">动画编译台</div>
              <div className="truncate text-xs text-muted-foreground">输入、参数和直接动作集中在同一控制台。</div>
            </div>
            <Badge className="shrink-0" variant="outline">{props.pathCount} 个输入</Badge>
          </div>
          <PathsInput data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
          <ActionDeck props={props} />
          <OutputFields data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <RuntimeOptions data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <div className="mt-auto">
            <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
          </div>
        </section>
        <div className="min-h-0">
          <GifuResultTabs logs={props.logs} result={props.result} running={props.running} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function ActionDeck({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <div
      data-testid="gifu-action-deck"
      className={compact ? "flex min-w-0 gap-1.5 overflow-x-auto pb-0.5" : "grid min-w-0 grid-cols-3 gap-2"}
    >
      {ACTIONS.map((action) => (
        <DirectActionButton key={action.value} action={action.value} compact={compact} props={props} />
      ))}
    </div>
  )
}

function DirectActionButton({ action, compact, props }: {
  action: GifuAction
  compact?: boolean
  props: ViewProps
}) {
  const meta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[1]!
  const label = actionLabel(action)
  const activeRunning = props.running && props.action === action
  const destructive = action === "make" && !(props.data.dryRun ?? true)
  const Icon = activeRunning ? LoaderCircle : meta.icon

  if (!destructive) {
    return (
      <Button
        aria-label={label}
        className={cn(
          compact && "h-8 shrink-0 px-2.5",
          !compact && "h-auto min-h-10 min-w-0 justify-start px-3 py-2",
        )}
        disabled={props.running}
        size="sm"
        variant={activeRunning ? "secondary" : "outline"}
        onClick={() => props.onExecute(action)}
      >
        <RunStateIcon icon={Icon} running={activeRunning} />
        <span className="truncate">{compact ? meta.shortLabel : label}</span>
      </Button>
    )
  }

  return (
    <ExecuteButton
      className={compact ? "shrink-0" : undefined}
      compact={compact}
      dangerous
      disabled={props.running}
      idleIcon={<RunStateIcon icon={Icon} running={activeRunning} />}
      label={label}
      size="sm"
      onExecute={() => props.onExecute(action)}
    />
  )
}

function RunActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  if (props.running) {
    return (
      <Button aria-label="gifu running" disabled size={compact ? "icon-sm" : "sm"} variant="secondary">
        <Square />
        {!compact && <span>运行中</span>}
      </Button>
    )
  }

  const label = props.action === "make" ? "运行生成" : props.action === "inspect" ? "运行检查" : "运行计划"
  return (
    <ExecuteButton
      compact={compact}
      dangerous={props.action === "make" && !(props.data.dryRun ?? true)}
      disabled={props.running}
      idleIcon={<Play />}
      label={label}
      onExecute={() => props.onExecute(props.action)}
    />
  )
}

function HeaderLine({ actionMeta, status, subtitle }: {
  actionMeta: typeof ACTIONS[number]
  status: GifuStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <actionMeta.icon />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Gifu</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function buildInput(action: GifuAction, data: GifuCardState): GifuInput {
  return {
    action,
    paths: parseLines(data.pathsText),
    configPath: clean(data.configPath),
    databasePath: clean(data.databasePath),
    format: data.format ?? "webp",
    outDir: clean(data.outDir),
    outMode: data.outMode ?? "same",
    durationMs: numberValue(data.durationMs),
    maxWorkers: numberValue(data.maxWorkers),
    namePrefix: clean(data.namePrefix),
    dryRun: data.dryRun ?? true,
    recordRun: data.recordRun ?? false,
  }
}

function statusFromState(data: GifuCardState, running: boolean): GifuStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "Gifu 正在扫描或生成动画。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: "完成",
      description: data.progressText || "上次任务已完成。",
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error") {
    return {
      label: "失败",
      description: data.progressText || "上次任务失败，请查看日志。",
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  return {
    label: "就绪",
    description: "输入归档或目录后即可生成计划。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.archives.length) return `${props.result.archives.length} 归档 / ${props.result.readyCount} 就绪`
  if (props.pathCount) return `${props.pathCount} 条路径等待${props.actionMeta.shortLabel}`
  return props.actionMeta.description
}

function actionLabel(action: GifuAction): string {
  return ACTIONS.find((item) => item.value === action)?.label ?? action
}

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function numberValue(value: unknown): number | undefined {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clean(value: unknown): string | undefined {
  const text = String(value ?? "").trim()
  return text || undefined
}

function getHostData(host: NodeComponentProps<GifuCardState, Partial<GifuCardState>>["host"], compId: string): GifuCardState {
  return host.state?.getData?.() ?? host.getData<GifuCardState>(compId) ?? {}
}
