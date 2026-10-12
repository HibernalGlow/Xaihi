import { useEffect, useRef, useState } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps } from "@xiranite/contract"
import type { RecycleuData, RecycleuInput, RecycleuResult } from "@xiranite/node-recycleu/core"
import type { LucideIcon } from "lucide-react"
import { Activity, Gauge, HardDrive, Infinity as InfinityIcon, Play, RotateCcw, Settings2, ShieldCheck, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { statusFromState } from "./constants"
import {
  CleanupFields,
  ConfirmActionButton,
  IntervalPresets,
  LogPanel,
  SettingsPopover,
  StatusStrip,
  TimerDial,
} from "./controls"
import type { RecycleuCardState, RecycleuStatusMeta } from "./types"

const CONFIG_FIELDS = ["interval", "maxCycles", "driveLetter"] as const satisfies ReadonlyArray<keyof RecycleuCardState>

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("recycleu")
  const data = host.getData<RecycleuCardState>(compId) ?? {}
  const dataRef = useRef<RecycleuCardState>(data)
  dataRef.current = data
  const cancellationRequestedRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [defaults, setDefaults] = useState<Partial<RecycleuCardState> | undefined>()
  const [configPath, setConfigPath] = useState<string | undefined>()
  const [configLoading, setConfigLoading] = useState(false)
  const interval = clampNumber(data.interval, 10, 5, 3600)
  const maxCycles = clampNumber(data.maxCycles, 360, 0, 360)
  const driveLetter = sanitizeDrive(data.driveLetter)
  const logs = data.logs ?? []
  const cleanCount = data.cleanCount ?? data.result?.cleanCount ?? 0
  const lastCleanTime = data.lastCleanTime ?? data.result?.lastCleanTime ?? null
  const progress = data.progress ?? (running ? 0 : data.phase === "completed" ? 100 : 0)
  const remainingSeconds = data.remainingSeconds ?? interval
  const status = statusFromState(data, running, t)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.height >= 430)
  const crampedCompact = surface.mode === "compact" && surface.height > 0 && surface.height < 280
  const configDirty = defaults !== undefined && CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? ""))

  useEffect(() => {
    void loadDefaults()
  }, [host])

  function patch(patchData: Partial<RecycleuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    if (host.state?.patchData) host.state.patchData(patchData)
    else host.patchData(compId, patchData)
  }

  function pushLog(message: string, patchData: Partial<RecycleuCardState> = {}) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ ...patchData, logs: nextLogs })
  }

  function updateSettings(patchData: Partial<RecycleuCardState>) {
    const next: Partial<RecycleuCardState> = { ...patchData }
    if (next.interval !== undefined) next.interval = clampNumber(next.interval, 10, 5, 3600)
    if (next.maxCycles !== undefined) next.maxCycles = clampNumber(next.maxCycles, 360, 0, 360)
    if (next.driveLetter !== undefined) next.driveLetter = sanitizeDrive(next.driveLetter)
    patch(next)
  }

  function pickConfig(source: RecycleuCardState): Partial<RecycleuCardState> {
    return Object.fromEntries(
      CONFIG_FIELDS.flatMap((field) => source[field] === undefined ? [] : [[field, source[field]]]),
    ) as Partial<RecycleuCardState>
  }

  async function loadDefaults() {
    const getConfig = host.config?.get?.<Partial<RecycleuCardState>>() ?? host.getNodeConfig?.<Partial<RecycleuCardState>>()
    if (!getConfig) return

    setConfigLoading(true)
    try {
      const response = await getConfig
      setDefaults(response.config)
      setConfigPath(response.path)
    } finally {
      setConfigLoading(false)
    }
  }

  async function saveAsDefault() {
    const config = pickConfig(dataRef.current)
    const saveConfig = host.config?.save ?? host.saveNodeConfig
    if (!saveConfig) return

    setConfigLoading(true)
    try {
      await saveConfig(config)
      setDefaults(config)
    } finally {
      setConfigLoading(false)
    }
  }

  function restoreDefaults() {
    if (defaults) updateSettings(defaults)
  }

  async function openConfigFile() {
    await (host.config?.openFile?.() ?? host.openConfigFile?.())
  }

  async function execute(action: RecycleuInput["action"]) {
    if (running) return
    const runAction = host.runner?.run ?? host.actions?.run
    if (!runAction) {
      const message = t("errors.backendUnavailable", "Local Backend 暂不可用，无法执行 recycleu。")
      pushLog(message, { phase: "error", progress: 0, progressText: message })
      return
    }

    const input: RecycleuInput = {
      action,
      interval,
      maxCycles,
      driveLetter: driveLetter || undefined,
    }

    setRunning(true)
    patch({
      action,
      phase: "running",
      progress: 0,
      progressText: action === "start"
        ? (maxCycles === 0 ? t("status.startingUnlimited", "无限清理已启动，直到取消。") : t("status.starting", "自动清理已启动。"))
        : action === "clean_now"
          ? t("status.cleaning", "正在清空回收站。")
          : t("status.checking", "正在读取状态。"),
      remainingSeconds: interval,
    })

    try {
      const response = await runAction<RecycleuInput, RecycleuData>("recycleu", input, (event) => {
        if (event.type === "progress") {
          const seconds = parseRemainingSeconds(event.message)
          patch({
            progress: event.progress ?? dataRef.current.progress ?? 0,
            progressText: event.message,
            remainingSeconds: seconds ?? dataRef.current.remainingSeconds ?? interval,
          })
          pushLog(event.message)
          return
        }
        pushLog(event.message)
      }) as RecycleuResult

      const cancelled = response.data?.timerStatus === "cancelled" || cancellationRequestedRef.current
      patch({
        phase: cancelled ? "cancelled" : response.success ? "completed" : "error",
        progress: response.success ? 100 : cancelled ? dataRef.current.progress ?? 0 : 0,
        progressText: response.message,
        result: response.data ?? null,
        cleanCount: response.data?.cleanCount ?? dataRef.current.cleanCount ?? cleanCount,
        lastCleanTime: response.data?.lastCleanTime ?? dataRef.current.lastCleanTime ?? lastCleanTime,
        remainingSeconds: response.data?.remainingSeconds ?? 0,
      })
      pushLog(response.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pushLog(message, { phase: "error", progress: 0, progressText: message })
    } finally {
      cancellationRequestedRef.current = false
      setCancelling(false)
      setRunning(false)
    }
  }

  async function cancelCurrentRun() {
    if (!running || cancelling) return
    const cancel = host.runner?.cancelCurrent ?? host.actions?.cancelCurrent
    if (!cancel) {
      const message = t("errors.cancelUnavailable", "当前宿主不支持从节点取消任务。")
      pushLog(message, { progressText: message })
      return
    }

    setCancelling(true)
    cancellationRequestedRef.current = true
    try {
      const cancelled = await cancel()
      if (!cancelled) {
        cancellationRequestedRef.current = false
        const message = t("errors.noActiveRun", "没有可取消的 Recycleu 任务。")
        pushLog(message, { progressText: message })
      } else {
        const message = t("status.stopping", "正在停止自动清理…")
        patch({ phase: "running", progressText: message })
        pushLog(message)
      }
    } catch (error) {
      cancellationRequestedRef.current = false
      const message = error instanceof Error ? error.message : String(error)
      pushLog(message, { progressText: message })
    } finally {
      setCancelling(false)
    }
  }

  function reset() {
    patch({
      action: undefined,
      phase: "idle",
      progress: 0,
      progressText: "",
      remainingSeconds: interval,
      cleanCount: 0,
      lastCleanTime: null,
      result: null,
      logs: [],
    })
  }

  async function copyLogs() {
    if (logs.length) await host.clipboard?.writeText?.(logs.join("\n"))
  }

  const commonProps: ViewProps = {
    canCancel: Boolean(host.runner?.cancelCurrent ?? host.actions?.cancelCurrent),
    configDirty,
    configLoading,
    configPath,
    cleanCount,
    data: { ...data, interval, maxCycles, driveLetter },
    driveLetter,
    interval,
    lastCleanTime,
    logs,
    maxCycles,
    progress,
    remainingSeconds,
    running,
    cancelling,
    status,
    t,
    defaults: defaults as Record<string, unknown> | undefined,
    onCopyLogs: copyLogs,
    onLoadDefaults: loadDefaults,
    onOpenConfigFile: openConfigFile,
    onRestoreDefaults: restoreDefaults,
    onSaveDefault: saveAsDefault,
    onCancel: cancelCurrentRun,
    onExecute: execute,
    onPatch: updateSettings,
    onReset: reset,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} data-testid="recycleu-surface" className="@container/recycleu flex h-full min-h-0 w-full overflow-hidden">
        <div className="flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...commonProps} />
          ) : compactSurface ? (
            portraitCompact
              ? <PortraitCompactView {...commonProps} />
              : crampedCompact
                ? <CondensedCompactView {...commonProps} />
                : <CompactView {...commonProps} />
          ) : (
            <FullView {...commonProps} wide={surface.width >= 860} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

interface ViewProps {
  canCancel: boolean
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  cleanCount: number
  data: RecycleuCardState
  defaults?: Record<string, unknown>
  driveLetter: string
  interval: number
  lastCleanTime: string | null
  logs: string[]
  maxCycles: number
  progress: number
  remainingSeconds: number
  running: boolean
  cancelling: boolean
  status: RecycleuStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyLogs: () => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onRestoreDefaults: () => void
  onSaveDefault: () => Promise<void>
  onCancel: () => void
  onExecute: (action: RecycleuInput["action"]) => void
  onPatch: (patch: Partial<RecycleuCardState>) => void
  onReset: () => void
}

function ConfigManagement(props: ViewProps) {
  return (
    <NodeConfigPopover
      configPath={props.configPath}
      defaults={props.defaults}
      dirty={props.configDirty}
      disabled={props.running}
      loading={props.configLoading}
      t={props.t}
      onOpenFile={props.onOpenConfigFile}
      onReload={props.onLoadDefaults}
      onRestore={props.onRestoreDefaults}
      onSave={props.onSaveDefault}
    />
  )
}

function CollapsedView(props: ViewProps) {
  return (
    <div className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-destructive text-destructive-foreground"><Trash2 /></div>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold leading-none">
          <span>Recycleu</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
          {props.maxCycles === 0 && <Badge variant="secondary"><InfinityIcon /></Badge>}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{settingsText(props)}</div>
      </div>
      <div className="relative flex shrink-0 items-center gap-1">
        <ConfigManagement {...props} />
        <CollapsedCommandPopover {...props} />
      </div>
    </div>
  )
}

function CollapsedCommandPopover(props: ViewProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={props.t("actions.command", "操作和参数")} className="relative shrink-0" size="icon-sm" variant="outline"><Settings2 /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-4">
          <div className="text-sm font-semibold">{props.t("command.title", "Recycleu 操作")}</div>
          <p className="text-xs text-muted-foreground">{props.t("command.description", "折叠状态保留完整参数与清理动作。")}</p>
        </div>
        <div className="flex flex-col gap-4">
          <CleanupFields data={props.data} disabled={props.running} onPatch={props.onPatch} t={props.t} />
          <IntervalPresets disabled={props.running} value={props.interval} t={props.t} onChange={(interval) => props.onPatch({ interval })} />
          <ActionCluster compact props={props} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CondensedCompactView(props: ViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <HeaderLine {...props} />
      <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <TimerDial compact cleanCount={props.cleanCount} interval={props.interval} maxCycles={props.maxCycles} progress={props.progress} remainingSeconds={props.remainingSeconds} running={props.running} status={props.status} t={props.t} />
        <div className="flex min-w-0 flex-col gap-2">
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} unlimited={props.maxCycles === 0} t={props.t} />
          <ActionCluster compact props={props} />
        </div>
      </div>
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <HeaderLine {...props} />
      <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <TimerDial compact cleanCount={props.cleanCount} interval={props.interval} maxCycles={props.maxCycles} progress={props.progress} remainingSeconds={props.remainingSeconds} running={props.running} status={props.status} t={props.t} />
        <div className="flex min-w-0 flex-col gap-2">
          <CleanupFields compact data={props.data} disabled={props.running} onPatch={props.onPatch} t={props.t} />
          <ActionCluster compact props={props} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <HeaderLine {...props} />
      <Card className="shrink-0 gap-0 py-0">
        <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3">
          <TimerDial compact cleanCount={props.cleanCount} interval={props.interval} maxCycles={props.maxCycles} progress={props.progress} remainingSeconds={props.remainingSeconds} running={props.running} status={props.status} t={props.t} />
          <div className="flex min-w-0 flex-col gap-2"><ActionCluster compact props={props} /><StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} unlimited={props.maxCycles === 0} t={props.t} /></div>
        </CardContent>
      </Card>
      <Card className="shrink-0 gap-0 py-0">
        <CardHeader className="border-b px-3 py-2 !pb-2"><CardTitle className="text-sm">{props.t("controls.title", "清理控制")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 p-3"><CleanupFields data={props.data} disabled={props.running} onPatch={props.onPatch} t={props.t} /><IntervalPresets disabled={props.running} value={props.interval} t={props.t} onChange={(interval) => props.onPatch({ interval })} /></CardContent>
      </Card>
      <div className="min-h-0 flex-1"><LogPanel compact logs={props.logs} t={props.t} onCopyLogs={props.onCopyLogs} onReset={props.onReset} /></div>
    </div>
  )
}

function FullView(props: ViewProps & { wide: boolean }) {
  if (props.wide) {
    return (
      <div className="flex min-h-0 flex-1 p-3">
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 overflow-hidden">
          <ResizablePanel defaultSize={29} minSize={23}><div className="h-full min-h-0 pr-2"><ConfigCard {...props} /></div></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={34} minSize={29}><div className="h-full min-h-0 px-2"><MonitorCard {...props} /></div></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={37} minSize={25}><div className="h-full min-h-0 pl-2"><LogPanel logs={props.logs} t={props.t} onCopyLogs={props.onCopyLogs} onReset={props.onReset} /></div></ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(180px,1fr)] gap-3 p-3">
      <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)] gap-3"><ConfigCard {...props} /><MonitorCard compact {...props} /></div>
      <LogPanel logs={props.logs} t={props.t} onCopyLogs={props.onCopyLogs} onReset={props.onReset} />
    </div>
  )
}

function ConfigCard(props: ViewProps) {
  return (
    <Card className="h-full min-h-0 gap-0 py-0" data-testid="recycleu-config-panel">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Settings2 />{props.t("controls.title", "清理控制")}</CardTitle>
        <CardDescription className="text-xs">{props.t("controls.description", "设置目标盘符、清理间隔与循环上限。")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">
        <CleanupFields data={props.data} disabled={props.running} onPatch={props.onPatch} t={props.t} />
        <IntervalPresets disabled={props.running} value={props.interval} t={props.t} onChange={(interval) => props.onPatch({ interval })} />
        <ScheduleSummary {...props} />
      </CardContent>
    </Card>
  )
}

function MonitorCard(props: ViewProps & { compact?: boolean }) {
  return (
    <Card className="h-full min-h-0 gap-0 py-0" data-testid="recycleu-monitor-panel">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Gauge /><span>Recycleu</span><span className="text-muted-foreground">· {props.t("monitor.title", "清理监控")}</span></CardTitle>
        <CardDescription className="text-xs">{summaryText(props)}</CardDescription>
        <CardAction className="flex items-center gap-1"><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge><ConfigManagement {...props} /></CardAction>
      </CardHeader>
      <CardContent className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4", props.compact && "flex-row justify-between gap-3 p-3")}>
        <TimerDial compact={props.compact} cleanCount={props.cleanCount} interval={props.interval} maxCycles={props.maxCycles} progress={props.progress} remainingSeconds={props.remainingSeconds} running={props.running} status={props.status} t={props.t} />
        <div className={cn("flex w-full max-w-sm flex-col gap-3", props.compact && "min-w-0 flex-1")}>
          <ActionCluster props={props} />
          <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} unlimited={props.maxCycles === 0} t={props.t} />
        </div>
      </CardContent>
    </Card>
  )
}

function ScheduleSummary(props: ViewProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Metric icon={HardDrive} label={props.t("metrics.target", "清理范围")} value={props.driveLetter ? `${props.driveLetter}:` : props.t("fields.allDrives", "全部")} />
      <Metric icon={Activity} label={props.t("metrics.interval", "执行间隔")} value={props.t("metrics.seconds", "{{count}} 秒", { count: props.interval })} />
      <Metric icon={Gauge} label={props.t("metrics.cycles", "循环上限")} value={props.maxCycles === 0 ? props.t("common.unlimited", "无限") : props.t("metrics.times", "{{count}} 次", { count: props.maxCycles })} />
      <Metric icon={ShieldCheck} label={props.t("metrics.last", "上次清理")} value={props.lastCleanTime ?? props.t("common.none", "暂无")} />
    </div>
  )
}

function Metric(props: { icon: LucideIcon; label: string; value: string }) {
  const Icon = props.icon
  return <Item size="sm" variant="muted"><ItemMedia variant="icon"><Icon /></ItemMedia><ItemContent className="min-w-0"><ItemDescription className="text-[11px]">{props.label}</ItemDescription><ItemTitle className="truncate tabular-nums">{props.value}</ItemTitle></ItemContent></Item>
}

function HeaderLine(props: ViewProps) {
  return (
    <FloatingWindowNodeHeader>
    <div className="flex shrink-0 items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive text-destructive-foreground"><Trash2 /></div>
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold leading-none">Recycleu</h3><Badge variant={props.status.badgeVariant}>{props.status.label}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</p></div>
      </div>
      <div className="xiranite-app-region-no-drag flex shrink-0 items-center gap-1"><ConfigManagement {...props} /><Button aria-label={props.t("actions.reset", "重置")} disabled={props.running} size="icon-sm" variant="outline" onClick={props.onReset}><RotateCcw /></Button><SettingsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} t={props.t} /></div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function ActionCluster({ compact = false, props }: { compact?: boolean; props: ViewProps }) {
  const cancelLabel = props.t("actions.cancel", "取消")
  if (props.running) {
    return (
      <Button
        aria-label={props.t("actions.stop", "停止自动清理")}
        disabled={!props.canCancel || props.cancelling}
        size="sm"
        variant="destructive"
        onClick={props.onCancel}
      >
        <Square data-icon="inline-start" />
        {props.cancelling ? props.t("actions.stopping", "正在停止") : props.t("actions.stop", "停止自动清理")}
      </Button>
    )
  }

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-[1fr_1fr_auto]")}>
      <ConfirmActionButton
        cancelLabel={cancelLabel}
        confirmLabel={props.t("actions.confirmStart", "确认启动")}
        description={startDescription(props)}
        disabled={props.running}
        icon={Play}
        label={props.t("actions.start", "启动")}
        title={props.t("actions.startTitle", "启动自动清理？")}
        onConfirm={() => props.onExecute("start")}
      />
      <ConfirmActionButton
        cancelLabel={cancelLabel}
        confirmLabel={props.t("actions.confirmClean", "确认清理")}
        description={cleanDescription(props)}
        disabled={props.running}
        icon={Trash2}
        label={props.t("actions.cleanNow", "立即清理")}
        title={props.t("actions.cleanTitle", "立即清空回收站？")}
        variant="destructive"
        onConfirm={() => props.onExecute("clean_now")}
      />
      <Button aria-label={props.t("actions.status", "状态")} disabled={props.running} size="sm" variant="outline" onClick={() => props.onExecute("status")}><ShieldCheck data-icon="inline-start" />{compact ? props.t("actions.statusShort", "状态") : props.t("actions.checkStatus", "检查状态")}</Button>
    </div>
  )
}

function startDescription(props: ViewProps): string {
  const target = props.driveLetter ? `${props.driveLetter}:` : props.t("fields.allDrives", "全部")
  if (props.maxCycles === 0) {
    return props.t("confirm.startUnlimited", "将每 {{interval}} 秒清理 {{target}}，无限循环，直到任务被停止或取消。", { interval: props.interval, target })
  }
  return props.t("confirm.startLimited", "将每 {{interval}} 秒清理 {{target}}，最多执行 {{cycles}} 次。", { interval: props.interval, target, cycles: props.maxCycles })
}

function cleanDescription(props: ViewProps): string {
  const target = props.driveLetter ? `${props.driveLetter}:` : props.t("fields.allDrives", "全部")
  return props.t("confirm.clean", "将立即清空 {{target}} 的回收站内容。此操作不可撤销。", { target })
}

function summaryText(props: ViewProps): string {
  if (props.running || props.data.phase === "running") {
    return props.maxCycles === 0
      ? props.t("summary.runningUnlimited", "无限循环 · 下次清理 {{seconds}} 秒", { seconds: props.remainingSeconds })
      : props.t("summary.running", "下次清理 {{seconds}} 秒 · 已完成 {{count}} 次", { seconds: props.remainingSeconds, count: props.cleanCount })
  }
  if (props.lastCleanTime) return props.t("summary.last", "已清理 {{count}} 次 · 上次 {{time}}", { count: props.cleanCount, time: props.lastCleanTime })
  return props.maxCycles === 0 ? props.t("summary.readyUnlimited", "周期清空回收站 · 无限模式") : props.t("summary.ready", "周期清空回收站")
}

function settingsText(props: ViewProps): string {
  return props.t("summary.settings", "{{drive}} · {{interval}} 秒 · {{cycles}}", {
    drive: props.driveLetter ? `${props.driveLetter}:` : props.t("fields.allDrives", "全部"),
    interval: props.interval,
    cycles: props.maxCycles === 0 ? props.t("common.unlimited", "无限") : props.t("metrics.times", "{{count}} 次", { count: props.maxCycles }),
  })
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function sanitizeDrive(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z:]/g, "").replace(/:$/, "").slice(0, 1)
}

function parseRemainingSeconds(message: string): number | null {
  const match = message.match(/next clean in\s+(\d+)s/i)
  return match ? Number(match[1]) : null
}
