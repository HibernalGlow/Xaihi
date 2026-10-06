import { useCallback, useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { EncodebAction, EncodebData, EncodebInput } from "@xiranite/node-encodeb/core"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { ArrowRight, Clipboard, Copy, Eraser, FileText, Gauge, Languages, Radar, RotateCcw, ScanSearch, ShieldAlert, Square, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { GridPattern } from "@/components/ui/grid-pattern"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModulePanel } from "@/components/ui/module-panel"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, PRESETS, STRATEGIES } from "./constants"
import { encodebPathsFromText } from "./model"
import type { EncodebCardState, EncodebPhase, EncodebPreset, EncodebStatusMeta, EncodebStrategy } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const data = host.getData<EncodebCardState>(compId) ?? {}
  const dataRef = useRef<EncodebCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<EncodebCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const paths = encodebPathsFromText(data.pathText)
  const logs = data.logs ?? []
  const mappings = data.mappings ?? []
  const matches = data.matches ?? []
  const preset = data.preset ?? "auto"
  const presetMeta = PRESETS.find((item) => item.value === preset) ?? PRESETS[0]!
  const srcEncoding = data.srcEncoding ?? presetMeta.srcEncoding ?? "cp437"
  const dstEncoding = data.dstEncoding ?? presetMeta.dstEncoding ?? "cp936"
  const transform = data.transform ?? presetMeta.transform
  const strategy = data.strategy ?? "replace"
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const squeezedRegularSurface = surface.mode === "regular" && (surface.width < 760 || surface.height < 560)
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  const reloadDefaults = useCallback(async () => {
    try {
      const response = await host.getNodeConfig?.<Partial<EncodebCardState>>()
      if (!response) return
      setDefaults(response.config)
      setConfigFilePath(response.path)
    } catch {
      // Configuration management is optional for lightweight hosts.
    }
  }, [host])

  useEffect(() => {
    void reloadDefaults()
  }, [reloadDefaults])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.pathText, data.preset, data.srcEncoding, data.dstEncoding, data.transform, data.strategy, defaults])

  function patch(patchData: Partial<EncodebCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    patch({ logs: [...(dataRef.current.logs ?? []), message].slice(-120) })
  }

  async function pastePath() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathText: text.trim() })
  }

  async function copyResults() {
    await host.clipboard?.writeText?.(resultLines(mappings, matches).join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function selectPreset(next: EncodebPreset) {
    const meta = PRESETS.find((item) => item.value === next)
    patch({
      preset: next,
      ...(meta?.srcEncoding ? { srcEncoding: meta.srcEncoding } : {}),
      ...(meta?.dstEncoding ? { dstEncoding: meta.dstEncoding } : {}),
      ...(meta?.transform ? { transform: meta.transform } : {}),
    })
  }

  async function execute(action: EncodebAction) {
    if (running) return
    const nextPaths = encodebPathsFromText(dataRef.current.pathText)
    if (!nextPaths.length) {
      patch({ phase: "error", progress: 0, progressText: "请先放入至少一个文件或目录路径。" })
      return
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: "当前宿主没有本地运行能力，请使用桌面模式或 CLI。" })
      pushLog("Native action is unavailable in this host.")
      return
    }

    const input: EncodebInput = {
      action,
      paths: nextPaths,
      srcEncoding,
      dstEncoding,
      transform,
      strategy,
    }

    setRunning(true)
    try {
      patch({
        phase: phaseForAction(action),
        progress: 0,
        progressText: `${labelForAction(action)}开始。`,
        mappings: action === "recover" ? dataRef.current.mappings : [],
        matches: action === "recover" ? dataRef.current.matches : [],
      })
      const response = await run<EncodebInput, EncodebData>("encodeb", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<EncodebData>

      const next = response.data ?? null
      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        mappings: next?.mappings ?? [],
        matches: next?.matches ?? [],
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
    patch({ phase: "idle", progress: 0, progressText: "", mappings: [], matches: [], logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<EncodebCardState> = {}
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
    patch({ pathText: undefined, preset: undefined, srcEncoding: undefined, dstEncoding: undefined, transform: undefined, strategy: undefined })
  }

  const commonProps = createViewProps({
    configDirty,
    configFilePath,
    data,
    defaults,
    dstEncoding,
    logs,
    mappings,
    matches,
    paths,
    phase,
    preset,
    presetMeta,
    progress,
    running,
    srcEncoding,
    status,
    strategy,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.openConfigFile,
    onPaste: pastePath,
    onPatch: patch,
    onPresetChange: selectPreset,
    onReset: reset,
    onResetOverride: resetOverride,
    onReloadDefaults: reloadDefaults,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onStrategyChange: (next) => patch({ strategy: next }),
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/encodeb relative h-full min-h-0 w-full overflow-hidden">
        <GridPattern
          className="pointer-events-none absolute inset-0 opacity-45 [mask-image:radial-gradient(circle_at_32%_18%,black,transparent_72%)]"
          width={22}
          height={22}
          x={-1}
          y={-1}
        />
        <NodeHeroGlow accent="chart-3" height="lg" primaryAt={[14, 0]} primaryStrength={18} primaryStop={34} accentAt={[86, 10]} accentStrength={20} accentStop={38} />
        <div className="relative flex h-full min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...commonProps} />
          ) : compactSurface || squeezedRegularSurface ? (
            portraitCompact ? <PortraitView {...commonProps} /> : <CompactView {...commonProps} />
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
  data: EncodebCardState
  defaults?: Partial<EncodebCardState>
  dstEncoding: string
  logs: string[]
  mappings: NonNullable<EncodebCardState["mappings"]>
  matches: string[]
  paths: string[]
  phase: EncodebPhase
  preset: EncodebPreset
  presetMeta: (typeof PRESETS)[number]
  progress: number
  running: boolean
  srcEncoding: string
  status: EncodebStatusMeta
  strategy: EncodebStrategy
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: EncodebAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<EncodebCardState>) => void
  onPresetChange: (preset: EncodebPreset) => void
  onReset: () => void
  onResetOverride: () => void
  onReloadDefaults: () => Promise<void>
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onStrategyChange: (strategy: EncodebStrategy) => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="encodeb-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/88 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Languages />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1 text-xs font-semibold leading-none">
          <span>Encodeb</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryAction compact props={props} />
      {props.running && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="encodeb-compact-view" className="flex h-full min-h-0 flex-col gap-2 p-3">
      <HeaderBar compact props={props} />
      <CodecRail compact props={props} />
      <CompactPresetSelect props={props} />
      <PathChamber compact props={props} />
      <CommandDeck compact props={props} />
      <MiniEvidence props={props} />
    </div>
  )
}

function PortraitView(props: ViewProps) {
  return (
    <div data-testid="encodeb-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <HeaderBar compact props={props} />
      <StatusMeter compact props={props} />
      <CodecRail compact vertical props={props} />
      <CompactPresetSelect props={props} />
      <PathChamber compact props={props} />
      <CommandDeck compact props={props} />
      <div className="min-h-0 flex-1">
        <EvidenceLedger compact props={props} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="encodeb-full-view" className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="grid shrink-0 gap-3 @5xl/encodeb:grid-cols-[minmax(0,1fr)_auto] @5xl/encodeb:items-start">
        <HeaderBar props={props} />
        <StatsDeck props={props} />
      </div>
      <CommandDeck props={props} />

      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: "minmax(190px, 0.72fr) minmax(300px, 1.45fr) minmax(220px, 0.82fr)" }}
      >
        <ModulePanel fill className="overflow-hidden bg-background/78 p-3" contentClassName="gap-3" icon={Clipboard} title="输入路径" subtitle="添加需要检查或修复的文件和目录">
            <PathChamber props={props} />
            <StatusMeter props={props} />
        </ModulePanel>

        <ModulePanel fill className="relative overflow-hidden bg-background/76 p-3" contentClassName="gap-3" icon={Gauge} title="编码设置" subtitle="选择源编码、目标编码和修复策略">
          {props.running && <BorderBeam size={90} duration={7} />}
            <CodecRail props={props} />
            <EncodingConsole props={props} />
            <DefaultsTools props={props} />
        </ModulePanel>

        <ModulePanel fill className="overflow-hidden bg-background/78 p-3" contentClassName="gap-3" icon={FileText} title="结果与日志" subtitle="查看扫描命中、预览映射和运行日志">
            <EvidenceLedger props={props} />
        </ModulePanel>
      </div>
    </div>
  )
}

function HeaderBar({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <FloatingWindowNodeHeader>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className={cn("grid shrink-0 place-items-center rounded-xl", compact ? "size-9" : "size-10", props.status.iconClass)}>
          <Languages className={compact ? "size-4" : "size-5"} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className={cn("truncate font-semibold leading-none", compact ? "text-sm" : "text-base")}>Encodeb</h3>
            <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{props.data.progressText || summaryText(props)}</p>
        </div>
      </div>
      <div className="hidden">
        <ToolButton disabled={!props.logs.length && !props.mappings.length && !props.matches.length} icon={RotateCcw} label="清空状态" onClick={props.onReset} />
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function StatsDeck({ props }: { props: ViewProps }) {
  const stats = [
    { label: "路径", value: props.paths.length },
    { label: "映射", value: props.mappings.length },
    { label: "疑似", value: props.matches.length },
    { label: "进度", value: `${props.progress}%` },
  ]
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {stats.map((item) => (
        <div key={item.label} className="min-w-0 rounded-lg border bg-background/70 px-3 py-2 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
          <div className="text-sm font-semibold tabular-nums">
            {typeof item.value === "number" ? <NumberTicker value={item.value} /> : item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function CodecRail({ compact, vertical, props }: { compact?: boolean; vertical?: boolean; props: ViewProps }) {
  const stages = [
    { key: "input", label: "输入", value: `${props.paths.length} 条路径`, active: props.phase === "idle" },
    { key: "encoding", label: props.srcEncoding, value: props.presetMeta.label, active: props.phase === "scanning" || props.phase === "previewing" },
    { key: "output", label: props.dstEncoding, value: props.strategy === "copy" ? "复制副本" : "原地重命名", active: props.phase === "executing" || props.phase === "completed" },
  ]

  return (
    <div className={cn("grid gap-1.5", vertical ? "grid-cols-1" : "grid-cols-[1fr_auto_1fr_auto_1fr]")}>
      {stages.map((stage, index) => (
        <div key={stage.key} className="contents">
          <div className={cn(
            "min-w-0 rounded-lg border bg-background/74 px-2 py-2",
            stage.active && "border-primary/45 bg-primary/8",
            compact && "py-1.5",
          )}>
            <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{stage.label}</div>
            <div className="truncate text-xs font-semibold">{stage.value}</div>
          </div>
          {index < stages.length - 1 && !vertical && (
            <div className="grid place-items-center text-muted-foreground">
              <ArrowRight className="size-4" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PathChamber({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="encodeb-paths" className="text-xs font-semibold">源路径</Label>
        <Badge variant="outline" className="shrink-0">{props.paths.length} 条</Badge>
      </div>
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="encodeb-paths"
          aria-label="encodeb source paths"
          className={cn("min-h-0 resize-none rounded-lg bg-background/78 font-mono text-xs", compact ? "h-16" : "h-32")}
          disabled={props.running}
          placeholder="每行一个乱码文件或目录路径"
          value={props.data.pathText ?? ""}
          onChange={(event) => props.onPatch({ pathText: event.currentTarget.value })}
        />
        <div className="grid content-start gap-1.5">
          <ToolButton disabled={props.running} icon={Clipboard} label="粘贴路径" onClick={props.onPaste} />
          <ToolButton disabled={props.running || !props.data.pathText} icon={Eraser} label="清空路径" onClick={() => props.onPatch({ pathText: "" })} />
        </div>
      </div>
    </div>
  )
}

function EncodingConsole({ props }: { props: ViewProps }) {
  const locked = props.preset !== "custom"
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold">编码预设</Label>
          <span className="truncate text-[11px] text-muted-foreground">{props.presetMeta.description}</span>
        </div>
        <select
          aria-label="编码预设"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={props.running}
          value={props.preset}
          onChange={(event) => props.onPresetChange(event.currentTarget.value as EncodebPreset)}
        >
          {PRESETS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
          <span className="font-medium">示例：</span>
          <span className="ml-1 font-mono text-muted-foreground">{props.presetMeta.example}</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <EncodingField disabled={props.running || locked} label="源编码" value={props.srcEncoding} onChange={(srcEncoding) => props.onPatch({ srcEncoding })} />
        <div className="grid h-9 place-items-center text-muted-foreground">
          <ArrowRight className="size-4" />
        </div>
        <EncodingField disabled={props.running || locked} label="目标编码" value={props.dstEncoding} onChange={(dstEncoding) => props.onPatch({ dstEncoding })} />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">修复策略</Label>
        <ToggleGroup
          aria-label="修复策略"
          className="grid w-full grid-cols-2"
          disabled={props.running}
          size="sm"
          type="single"
          value={props.strategy}
          variant="outline"
          onValueChange={(value) => {
            if (value) props.onStrategyChange(value as EncodebStrategy)
          }}
        >
          {STRATEGIES.map((item) => (
            <ToggleGroupItem key={item.value} aria-label={item.label} className="min-w-0" value={item.value}>
              <span className="truncate">{item.shortLabel}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

function EncodingField(props: {
  disabled?: boolean
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="min-w-0">
      <Label className="mb-1 block text-[11px] text-muted-foreground">{props.label}</Label>
      <Input
        disabled={props.disabled}
        className="h-9 font-mono text-xs"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function CommandDeck({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1 @4xl/encodeb:grid-cols-3")}>
      <CommandButton compact={compact} disabled={props.running || !props.paths.length} icon={ScanSearch} label="扫描乱码" onClick={() => props.onExecute("find")} />
      <CommandButton compact={compact} disabled={props.running || !props.paths.length} icon={FileText} label="预览映射" onClick={() => props.onExecute("preview")} />
      <PrimaryAction props={props} />
    </div>
  )
}

function CommandButton(props: {
  compact?: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onClick}>
      <Icon />
      <span className="truncate">{props.label}</span>
    </Button>
  )
}

function PrimaryAction({ compact, props }: { compact?: boolean; props: ViewProps }) {
  if (props.running) {
    return (
      <Button aria-label="encodeb running" disabled size={compact ? "icon-sm" : "sm"} variant="secondary">
        <Square />
        {!compact && <span>运行中</span>}
      </Button>
    )
  }

  const disabled = !props.paths.length
  return (
    <ExecuteButton
      compact={compact}
      dangerous
      disabled={disabled}
      idleIcon={<ShieldAlert />}
      label="执行修复"
      onExecute={() => props.onExecute("recover")}
    />
  )
}

function StatusMeter({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <div className={cn("rounded-lg border bg-background/70 p-2", compact && "p-1.5")}>
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-xs font-medium">{props.data.progressText || props.status.description}</div>
        <Badge variant={props.status.badgeVariant} className="shrink-0">{props.status.label}</Badge>
      </div>
      <Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} />
    </div>
  )
}

function DefaultsTools({ props }: { props: ViewProps }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-background/62 px-2 py-1.5">
      <div className="min-w-0">
        <div className="text-xs font-medium">默认配置</div>
        <div className="truncate text-[11px] text-muted-foreground">{props.configFilePath ?? "未连接配置文件"}</div>
      </div>
      <NodeConfigPopover
        autoRestoreKey="encodeb"
        configPath={props.configFilePath}
        defaults={props.defaults}
        dirty={props.configDirty}
        disabled={props.running}
        t={(key, fallback, vars) => tNode("encodeb", key, fallback, vars)}
        onOpenFile={props.onOpenConfigFile}
        onReload={props.onReloadDefaults}
        onRestore={props.onRestoreDefault}
        onSave={props.onSaveDefault}
      />
    </div>
  )
}

function CompactPresetSelect({ props }: { props: ViewProps }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-background/70 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor="encodeb-compact-preset" className="shrink-0 text-[11px] font-medium">修复预设</Label>
        <select
          id="encodeb-compact-preset"
          aria-label="快速选择编码预设"
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={props.running}
          value={props.preset}
          onChange={(event) => props.onPresetChange(event.currentTarget.value as EncodebPreset)}
        >
          {PRESETS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>
      <div className="truncate font-mono text-[10px] text-muted-foreground" title={props.presetMeta.example}>
        示例：{props.presetMeta.example}
      </div>
    </div>
  )
}

function MiniEvidence({ props }: { props: ViewProps }) {
  const lines = resultLines(props.mappings, props.matches)
  return (
    <div className="min-h-0 flex-1 rounded-lg border bg-background/70">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Radar className="size-3.5" />
          <span className="truncate">{lines.length ? `${lines.length} 条结果` : "等待扫描"}</span>
        </div>
        <ToolButton disabled={!lines.length} icon={Copy} label="复制结果" onClick={props.onCopyResults} />
      </div>
      <Separator />
      <ScrollArea className="h-[calc(100%-2.25rem)]">
        {lines.length ? (
          <pre className="p-2 text-xs leading-5 text-muted-foreground">{lines.slice(0, 12).join("\n")}</pre>
        ) : (
          <div className="flex min-h-20 items-center justify-center p-3 text-center text-xs text-muted-foreground">扫描或预览后显示疑似乱码文件名和转码映射。</div>
        )}
      </ScrollArea>
    </div>
  )
}

function EvidenceLedger({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const lines = resultLines(props.mappings, props.matches)
  return (
    <div className="grid h-full min-h-0 gap-2">
      <div className="grid min-h-0 gap-2 @4xl/encodeb:grid-cols-2">
        <LedgerPanel
          compact={compact}
          icon={FileText}
          title="映射预览"
          emptyText="运行预览映射后，这里会显示旧路径到新路径的对应关系。"
          lines={props.mappings.map((item) => `${item.src}\n  -> ${item.dst}`)}
          onCopy={props.onCopyResults}
        />
        <LedgerPanel
          compact={compact}
          icon={Radar}
          title="疑似乱码"
          emptyText="运行扫描后，这里会列出疑似乱码文件名。"
          lines={props.matches}
          onCopy={props.onCopyResults}
        />
      </div>
      <LedgerPanel
        compact={compact}
        icon={Gauge}
        title="运行日志"
        emptyText={lines.length ? "暂无日志。" : "命令执行过程会记录在这里。"}
        lines={props.logs}
        onCopy={props.onCopyLogs}
      />
    </div>
  )
}

function LedgerPanel(props: {
  compact?: boolean
  emptyText: string
  icon: LucideIcon
  lines: string[]
  title: string
  onCopy: () => void
}) {
  const Icon = props.icon
  return (
    <section className="flex min-h-0 flex-col rounded-lg border bg-background/66">
      <div className={cn("flex shrink-0 items-center justify-between gap-2", props.compact ? "px-2 py-1.5" : "px-3 py-2")}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="truncate">{props.title}</span>
          <Badge variant="outline" className="shrink-0">{props.lines.length}</Badge>
        </div>
        <ToolButton disabled={!props.lines.length} icon={Copy} label={`复制${props.title}`} onClick={props.onCopy} />
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className={cn("whitespace-pre-wrap break-all font-mono text-xs leading-5 text-muted-foreground", props.compact ? "p-2" : "p-3")}>
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className={cn("flex items-center justify-center p-4 text-center text-xs text-muted-foreground", props.compact ? "min-h-16" : "min-h-28")}>
            {props.emptyText}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function ToolButton(props: {
  active?: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant={props.active ? "secondary" : "outline"} onClick={props.onClick}>
          <Icon />
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

function statusFromState(data: EncodebCardState, running: boolean): EncodebStatusMeta {
  if (running || data.phase === "scanning" || data.phase === "previewing" || data.phase === "executing") {
    return {
      label: "运行中",
      description: data.progressText || "正在扫描、预览或修复文件名。",
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
    description: "放入路径后扫描乱码或预览转码映射。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: EncodebCardState, running: boolean): EncodebPhase {
  if (running) return data.phase ?? "scanning"
  return data.phase ?? "idle"
}

function phaseForAction(action: EncodebAction): EncodebPhase {
  if (action === "find") return "scanning"
  if (action === "preview") return "previewing"
  return "executing"
}

function labelForAction(action: EncodebAction): string {
  return ACTIONS.find((item) => item.value === action)?.label ?? action
}

function resultLines(mappings: NonNullable<EncodebCardState["mappings"]>, matches: string[]): string[] {
  return [
    ...mappings.map((item) => `map ${item.src} -> ${item.dst}`),
    ...matches.map((item) => `match ${item}`),
  ]
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.mappings.length) return `${props.mappings.length} 条转码映射等待确认`
  if (props.matches.length) return `${props.matches.length} 个疑似乱码文件名`
  if (props.paths.length) return `${props.paths.length} 条路径等待扫描`
  return "粘贴路径，选择编码方向，然后扫描或预览"
}
