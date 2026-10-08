import { useEffect, useRef, useState } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { PowerMode, SleeptData, SleeptInput } from "@xiranite/node-sleept/core"
import { countdownSeconds, formatDuration } from "@xiranite/node-sleept/duration"
import { sleeptInputFromInteractionValues, type SleeptInteractionAction } from "@xiranite/node-sleept/interaction"
import { Clock, Copy, Play, RotateCcw, ShieldAlert } from "lucide-react"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { POWER_MODES, TIMER_MODES } from "./constants"
import {
  ActionIconButton,
  AdvancedOptionsPopover,
  PrimarySwitches,
  PowerModePicker,
  StatsIconButton,
  StatusStrip,
  TimerModePicker,
  TimerSettings,
} from "./controls"
import type { SleeptCardState, SleeptPhase, SleeptStats, SleeptStatusMeta, SleeptTimerMode } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const data = host.getData<SleeptCardState>(compId) ?? {}
  const dataRef = useRef<SleeptCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<SleeptCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const timerMode = data.timerMode ?? "countdown"
  const powerMode = data.powerMode ?? "sleep"
  const dryrun = data.dryrun ?? false
  const logs = data.logs ?? []
  const result = data.result ?? null
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const stats = data.stats ?? { cpu: 0, upload: 0, download: 0 }
  const status = statusFromState(data, running)
  const durationSec = countdownSeconds({
    hours: data.hours,
    minutes: data.minutes,
    seconds: data.seconds,
  })
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<SleeptCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.cpuDuration,
    data.cpuThreshold,
    data.downloadThreshold,
    data.dryrun,
    data.hours,
    data.maxWaitSeconds,
    data.minutes,
    data.netDuration,
    data.netTriggerMode,
    data.powerMode,
    data.seconds,
    data.targetDatetime,
    data.timerMode,
    data.uploadThreshold,
    defaults,
  ])

  function patch(patchData: Partial<SleeptCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-100)
    patch({ logs: nextLogs })
  }

  async function execute(action: SleeptInput["action"], override: Partial<SleeptCardState> = {}) {
    if (running) return
    const current = { ...dataRef.current, ...override }
    const input = buildInput(action, current)

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: "当前环境没有本地运行能力，请使用桌面模式或 CLI。" })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: "running", progress: 0, progressText: `${labelForAction(action)}开始`, ...override })
      const response = await run<SleeptInput, SleeptData>("sleept", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<SleeptData>

      const next = response.data ?? null
      const nextStats: SleeptStats = next
        ? { cpu: next.currentCpu, upload: next.currentUpload, download: next.currentDownload }
        : stats
      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: next,
        stats: nextStats,
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

  async function refreshStats() {
    await execute("get_stats")
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<SleeptCardState> = {}
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
      timerMode: undefined,
      powerMode: undefined,
      hours: undefined,
      minutes: undefined,
      seconds: undefined,
      targetDatetime: undefined,
      uploadThreshold: undefined,
      downloadThreshold: undefined,
      netDuration: undefined,
      netTriggerMode: undefined,
      cpuThreshold: undefined,
      cpuDuration: undefined,
      dryrun: undefined,
      maxWaitSeconds: undefined,
    })
  }

  const commonProps = createViewProps({
    configDirty,
    configFilePath,
    data,
    defaults,
    dryrun,
    durationSec,
    host,
    logs,
    phase,
    powerMode,
    progress,
    result,
    running,
    stats,
    status,
    timerMode,
    onCopyLogs: copyLogs,
    onExecute: (override?: Partial<SleeptCardState>) => execute(timerMode, override),
    onOpenConfigFile: host.openConfigFile,
    onPatch: patch,
    onPowerModeChange: (nextMode: PowerMode) => patch({ powerMode: nextMode }),
    onRefreshStats: refreshStats,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onTimerModeChange: (nextMode: SleeptTimerMode) => patch({ timerMode: nextMode }),
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/sleept relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow />
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
  data: SleeptCardState
  defaults?: Partial<SleeptCardState>
  dryrun: boolean
  durationSec: number
  host: NodeComponentProps["host"]
  logs: string[]
  phase: SleeptPhase
  powerMode: PowerMode
  progress: number
  result: SleeptData | null
  running: boolean
  stats: SleeptStats
  status: SleeptStatusMeta
  timerMode: SleeptTimerMode
  onCopyLogs: () => void
  onExecute: (override?: Partial<SleeptCardState>) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPatch: (patch: Partial<SleeptCardState>) => void
  onPowerModeChange: (mode: PowerMode) => void
  onRefreshStats: () => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onTimerModeChange: (mode: SleeptTimerMode) => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="sleept-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Clock />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Sleept</span>
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
    <div data-testid="sleept-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <StatsIconButton disabled={props.running} onClick={props.onRefreshStats} />
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <TimerModePicker compact disabled={props.running} mode={props.timerMode} onModeChange={props.onTimerModeChange} />
        <PowerModePicker disabled={props.running} mode={props.powerMode} onModeChange={props.onPowerModeChange} />
        <TimerSettings compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <PrimarySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <SleeptDisplayTabs
            compact
            logs={props.logs}
            progress={props.progress}
            stats={props.stats}
            timerMode={props.timerMode}
            onCopyLogs={props.onCopyLogs}
          />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="sleept-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <StatsIconButton disabled={props.running} onClick={props.onRefreshStats} />
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <TimerModePicker compact disabled={props.running} mode={props.timerMode} onModeChange={props.onTimerModeChange} />
        <PowerModePicker disabled={props.running} mode={props.powerMode} onModeChange={props.onPowerModeChange} />
        <TimerSettings compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <PrimarySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
      </div>
      <div className="min-h-0 flex-1">
        <SleeptDisplayTabs
          compact
          logs={props.logs}
          progress={props.progress}
          stats={props.stats}
          timerMode={props.timerMode}
          onCopyLogs={props.onCopyLogs}
        />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="sleept-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/sleept:flex-row @4xl/sleept:items-center @4xl/sleept:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/sleept:flex-row @4xl/sleept:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || `${timerLabel(props.timerMode)} / ${powerLabel(props.powerMode)} / ${props.dryrun ? "演练" : "真实执行"}`} />
          <div data-testid="sleept-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <StatsIconButton disabled={props.running} onClick={props.onRefreshStats} />
            <ActionIconButton disabled={!props.logs.length} icon={Copy} label="复制日志" onClick={props.onCopyLogs} />
            <ActionIconButton icon={RotateCcw} label="清空状态" onClick={props.onReset} />
          </div>
        </div>
        <StatsPanel durationSec={props.durationSec} progress={props.progress} stats={props.stats} timerMode={props.timerMode} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @4xl/sleept:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.45fr)]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0"><CardTitle>触发序列</CardTitle><CardDescription>先确定计时或监控条件，再进入电源操作。</CardDescription></CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <div className="grid gap-4">
            <TimerModePicker disabled={props.running} mode={props.timerMode} onModeChange={props.onTimerModeChange} />
            <TimerSettings data={props.data} disabled={props.running} onPatch={props.onPatch} />
            <PrimarySwitches data={props.data} disabled={props.running} onPatch={props.onPatch} />
            <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
            <Separator />
            <div className="grid gap-2">
              <div>
                <div className="text-sm font-semibold">执行动作</div>
                <p className="mt-0.5 text-xs text-muted-foreground">动作、演练状态与启动在同一处确认。</p>
              </div>
              <PowerModePicker disabled={props.running} mode={props.powerMode} onModeChange={props.onPowerModeChange} />
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><span className="text-xs font-medium">配置管理</span><NodeConfigButton nodeKey="sleept" configDirty={props.configDirty} configFilePath={props.configFilePath} defaults={props.defaults} disabled={props.running} onOpenConfigFile={props.onOpenConfigFile} onResetOverride={props.onResetOverride} onRestoreDefault={props.onRestoreDefault} onSaveDefault={props.onSaveDefault} /></div>
              <PrimaryActionButton props={props} />
            </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0"><CardTitle>系统待命</CardTitle><CardDescription>{timerLabel(props.timerMode)} · {powerLabel(props.powerMode)}</CardDescription></CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <CountdownConsole durationSec={props.durationSec} progress={props.progress} timerMode={props.timerMode} />
            <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
            <div className="min-h-0 flex-1">
          <SleeptDisplayTabs
            logs={props.logs}
            progress={props.progress}
            stats={props.stats}
            timerMode={props.timerMode}
            onCopyLogs={props.onCopyLogs}
          />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function CountdownConsole(props: { durationSec: number; progress: number; timerMode: SleeptTimerMode }) {
  const monitoring = props.timerMode === "netspeed" || props.timerMode === "cpu"
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-2 py-3 text-center">
      <AnimatedCircularProgressBar ariaLabel="Sleept countdown progress" value={props.progress} className="size-48 text-2xl">
        <span className="font-mono text-2xl tabular-nums">{monitoring ? "MONITOR" : formatDuration(props.durationSec)}</span>
      </AnimatedCircularProgressBar>
      <span className="text-xs text-muted-foreground">{monitoring ? "持续监控，0 为无限等待" : "待命倒计时"}</span>
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const label = props.dryrun ? "开始演练" : "开始执行"

  // 到点就是关机/休眠这类撤不回去的动作，引信窗口取默认值的 1.5 倍。
  return (
    <ExecuteButton
      dangerous={!props.dryrun}
      running={props.running}
      compact={compact}
      label={label}
      idleIcon={props.dryrun ? <Play /> : <ShieldAlert />}
      undoWindow={6000}
      onExecute={() => props.onExecute()}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: SleeptStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Clock />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Sleept</h3>
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
  durationSec: number
  progress: number
  stats: SleeptStats
  timerMode: SleeptTimerMode
}) {
  const stats = [
    ["模式", timerLabel(props.timerMode)],
    ["时长", formatDuration(props.durationSec)],
    ["CPU", `${props.stats.cpu.toFixed(1)}%`],
    ["上行", `${props.stats.upload.toFixed(1)}`],
    ["下行", `${props.stats.download.toFixed(1)}`],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/sleept:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  )
}

function SleeptDisplayTabs(props: {
  compact?: boolean
  logs: string[]
  progress: number
  stats: SleeptStats
  timerMode: SleeptTimerMode
  onCopyLogs: () => void
}) {
  return (
    <Tabs defaultValue="stats" className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        <TabsTrigger value="stats">状态</TabsTrigger>
        <TabsTrigger value="logs">日志</TabsTrigger>
      </TabsList>
      <TabsContent value="stats" className="min-h-0 flex-1">
        <StatsBoard compact={props.compact} progress={props.progress} stats={props.stats} timerMode={props.timerMode} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <LogBoard compact={props.compact} logs={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function StatsBoard(props: {
  compact?: boolean
  progress: number
  stats: SleeptStats
  timerMode: SleeptTimerMode
}) {
  const showRing = props.timerMode === "countdown" || props.timerMode === "specific_time"
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-lg border bg-background/70 p-3">
      {showRing ? (
        <div className="flex shrink-0 items-center justify-center">
          <AnimatedCircularProgressBar value={props.progress} max={100} min={0} className="h-24 w-24" />
        </div>
      ) : null}
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <StatTile label="CPU" value={`${props.stats.cpu.toFixed(1)}%`} />
        <StatTile label="上行 KB/s" value={props.stats.upload.toFixed(1)} />
        <StatTile label="下行 KB/s" value={props.stats.download.toFixed(1)} />
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        {showRing
          ? "倒计时/指定时间模式下，进度环显示倒计时进度。"
          : "监控模式下，点击「刷新状态」可读取当前 CPU 与网速。"}
      </p>
    </section>
  )
}

function StatTile(props: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
      <div className="truncate text-[11px] text-muted-foreground">{props.label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{props.value}</div>
    </div>
  )
}

function LogBoard(props: {
  compact?: boolean
  logs: string[]
  onCopy: () => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{props.logs.length ? `${props.logs.length} 条` : "等待运行"}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.logs.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {props.logs.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            运行日志会显示在这里。
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function buildInput(action: SleeptInput["action"], data: SleeptCardState): SleeptInput {
  const interactionAction: SleeptInteractionAction = action === "get_stats" || action === "status"
    ? "get_stats"
    : action === "countdown" || action === "specific_time" || action === "netspeed" || action === "cpu"
      ? action
      : data.timerMode ?? "countdown"
  return sleeptInputFromInteractionValues({
    action: interactionAction,
    powerMode: data.powerMode ?? "sleep",
    hours: data.hours ?? 2,
    minutes: data.minutes ?? 0,
    seconds: data.seconds ?? 5,
    targetDatetime: data.targetDatetime,
    uploadThreshold: data.uploadThreshold ?? 242,
    downloadThreshold: data.downloadThreshold ?? 242,
    netDuration: data.netDuration ?? 2,
    netTriggerMode: data.netTriggerMode ?? "both",
    cpuThreshold: data.cpuThreshold ?? 10,
    cpuDuration: data.cpuDuration ?? 2,
    dryrun: data.dryrun ?? false,
    maxWaitSeconds: data.maxWaitSeconds ?? 3600,
  })
}

function statusFromState(data: SleeptCardState, running: boolean): SleeptStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "Sleept 正在监控或倒计时。",
      tone: "running",
      badgeVariant: "secondary",
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
  if (data.phase === "cancelled") {
    return {
      label: "已取消",
      description: data.progressText || "任务已取消或超时。",
      tone: "warning",
      badgeVariant: "outline",
      iconClass: "bg-secondary text-secondary-foreground",
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
  return {
    label: "就绪",
    description: "选择计时模式与电源操作后开始。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: SleeptCardState, running: boolean): SleeptPhase {
  if (running) return data.phase ?? "running"
  return data.phase ?? "idle"
}

function labelForAction(action: SleeptInput["action"]): string {
  if (action === "get_stats") return "读取状态"
  if (action === "countdown") return "倒计时"
  if (action === "specific_time") return "指定时间"
  if (action === "netspeed") return "网速监控"
  if (action === "cpu") return "CPU 监控"
  return "Sleept"
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.phase === "completed") return "任务已完成"
  return `${timerLabel(props.timerMode)} / ${powerLabel(props.powerMode)} / ${props.dryrun ? "演练" : "真实"}`
}

function timerLabel(mode: SleeptTimerMode): string {
  return TIMER_MODES.find((item) => item.value === mode)?.label ?? "倒计时"
}

function powerLabel(mode: PowerMode): string {
  return POWER_MODES.find((item) => item.value === mode)?.label ?? "休眠"
}
