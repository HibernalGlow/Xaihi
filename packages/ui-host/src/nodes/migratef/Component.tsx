import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { MigratefAction, MigratefData, MigratefInput, MigratefMode } from "@xiranite/node-migratef/core"
import { Copy, FolderSync, History, Play, RotateCcw, ShieldAlert, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { ACTIONS, MODES } from "./constants"
import {
  ActionIconButton,
  ActionPicker,
  AdvancedOptionsPopover,
  ModePicker,
  PrimarySwitches,
  ResultTabs,
  SourceInput,
  StatusStrip,
  TargetInput,
} from "./controls"
import type { MigratefActionMode, MigratefCardState, MigratefPhase, MigratefStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("migratef")
  const data = host.getData<MigratefCardState>(compId) ?? {}
  const dataRef = useRef<MigratefCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<MigratefCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const mode = data.mode ?? "preserve"
  const modeMeta = MODES.find((item) => item.value === mode) ?? MODES[0]!
  const action = data.action ?? "move"
  const actionMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[0]!
  const sources = splitPaths(data.sourceText)
  const dryRun = data.dryRun ?? true
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<MigratefCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  async function reloadDefaults() {
    const response = await host.getNodeConfig?.<Partial<MigratefCardState>>()
    if (!response) return
    setDefaults(response.config)
    setConfigFilePath(response.path)
    setConfigDirty(false)
  }

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.sourceText,
    data.targetPath,
    data.historyPath,
    data.mode,
    data.action,
    data.dryRun,
    defaults,
  ])

  function patch(patchData: Partial<MigratefCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pasteSource() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ sourceText: text.trim() })
  }

  async function pasteTarget() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ targetPath: text.trim() })
  }

  async function copyLogs() {
    if (logs.length) await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function execute(executeAction: MigratefAction, override: Partial<MigratefCardState> = {}) {
    if (running) return
    const current = { ...dataRef.current, ...override }
    const input = buildInput(executeAction, current)

    if ((executeAction === "move" || executeAction === "copy" || executeAction === "plan") && !input.sourcePaths?.length) {
      patch({ phase: "error", progress: 0, progressText: "请先输入至少一个源路径。" })
      return
    }
    if ((executeAction === "move" || executeAction === "copy" || executeAction === "plan") && !input.targetPath) {
      patch({ phase: "error", progress: 0, progressText: "请先输入目标路径。" })
      return
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: "当前环境没有本地运行能力，请使用桌面模式或 CLI。" })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: "running", progress: 0, progressText: `${actionLabel(executeAction)}开始` })
      const response = await run<MigratefInput, MigratefData>("migratef", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<MigratefData>

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

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<MigratefCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined && value !== "") (config as Record<string, unknown>)[field] = value
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
      sourceText: undefined,
      targetPath: undefined,
      historyPath: undefined,
      mode: undefined,
      action: undefined,
      dryRun: undefined,
    })
  }

  const commonProps = createViewProps({
    action,
    actionMeta,
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    host,
    logs,
    mode,
    modeMeta,
    phase,
    progress,
    result,
    running,
    sourceCount: sources.length,
    status,
    t,
    onActionChange: (value: MigratefActionMode) => patch({ action: value }),
    onCopyLogs: copyLogs,
    onExecute: execute,
    onModeChange: (value: MigratefMode) => patch({ mode: value }),
    onOpenConfigFile: host.openConfigFile,
    onPasteSource: pasteSource,
    onPasteTarget: pasteTarget,
    onPatch: patch,
    onReset: reset,
    onReloadDefaults: reloadDefaults,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onUndo: (batchId?: string) => execute("undo", batchId ? { result: { ...result, operationId: batchId } as MigratefData } : {}),
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/migratef relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-5" />
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
  action: MigratefActionMode
  actionMeta: typeof ACTIONS[number]
  configDirty: boolean
  configFilePath?: string
  data: MigratefCardState
  defaults?: Partial<MigratefCardState>
  dryRun: boolean
  host: NodeComponentProps["host"]
  logs: string[]
  mode: MigratefMode
  modeMeta: typeof MODES[number]
  phase: MigratefPhase
  progress: number
  result: MigratefData | null
  running: boolean
  sourceCount: number
  status: MigratefStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: MigratefActionMode) => void
  onCopyLogs: () => void
  onExecute: (action: MigratefAction, override?: Partial<MigratefCardState>) => void
  onModeChange: (value: MigratefMode) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteSource: () => void
  onPasteTarget: () => void
  onPatch: (patch: Partial<MigratefCardState>) => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onUndo: (batchId?: string) => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="migratef-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <FolderSync />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>MigrateF</span>
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
    <div data-testid="migratef-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
        <SourceInput compact disabled={props.running} pathCount={props.sourceCount} value={props.data.sourceText ?? ""} onChange={(sourceText) => props.onPatch({ sourceText })} onClear={() => props.onPatch({ sourceText: "" })} onPaste={props.onPasteSource} />
        <TargetInput compact disabled={props.running} value={props.data.targetPath ?? ""} onChange={(targetPath) => props.onPatch({ targetPath })} onPaste={props.onPasteTarget} />
        <PrimarySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onUndo={props.onUndo} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="migratef-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
        <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
        <SourceInput compact disabled={props.running} pathCount={props.sourceCount} value={props.data.sourceText ?? ""} onChange={(sourceText) => props.onPatch({ sourceText })} onClear={() => props.onPatch({ sourceText: "" })} onPaste={props.onPasteSource} />
        <TargetInput compact disabled={props.running} value={props.data.targetPath ?? ""} onChange={(targetPath) => props.onPatch({ targetPath })} onPaste={props.onPasteTarget} />
        <PrimarySwitches compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onUndo={props.onUndo} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="migratef-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/migratef:flex-row @4xl/migratef:items-center @4xl/migratef:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/migratef:flex-row @4xl/migratef:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || `${props.modeMeta.label} / ${props.actionMeta.label} / ${props.dryRun ? "预演" : "真实执行"} / ${props.sourceCount} 源`} />
          <div data-testid="migratef-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolbarActions {...props} />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @5xl/migratef:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.45fr)_minmax(220px,0.65fr)]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader>
            <CardTitle>配置</CardTitle>
            <CardDescription>源、目标和目录结构策略。</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <div className="grid gap-4">
              <ModePicker disabled={props.running} mode={props.mode} onModeChange={props.onModeChange} />
              <SourceInput disabled={props.running} pathCount={props.sourceCount} value={props.data.sourceText ?? ""} onChange={(sourceText) => props.onPatch({ sourceText })} onClear={() => props.onPatch({ sourceText: "" })} onPaste={props.onPasteSource} />
              <TargetInput disabled={props.running} value={props.data.targetPath ?? ""} onChange={(targetPath) => props.onPatch({ targetPath })} onPaste={props.onPasteTarget} />
              <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0">
            <CardTitle>迁移清单</CardTitle>
            <CardDescription>预演结果、冲突和运行记录集中在同一视图。</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden">
            <ResultTabs logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onUndo={props.onUndo} />
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader>
            <CardTitle>操作</CardTitle>
            <CardDescription>先预演，确认后再执行真实写入。</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
            <PrimarySwitches data={props.data} disabled={props.running} onPatch={props.onPatch} />
            <StatsPanel progress={props.progress} result={props.result} />
            <div className="mt-auto grid gap-2">
              <PrimaryActionButton props={props} />
              <Button disabled={props.running || !props.result?.operationId} size="sm" variant="outline" onClick={() => props.onUndo(props.result?.operationId)}>
                <Undo2 data-icon="inline-start" />撤销最近
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      <ActionIconButton disabled={props.running} icon={History} label="读取历史" onClick={() => props.onExecute("history")} />
      <ActionIconButton disabled={props.running} icon={Undo2} label="撤销最近" onClick={() => props.onUndo()} />
      <ActionIconButton disabled={!props.logs.length} icon={Copy} label="复制日志" onClick={props.onCopyLogs} />
      <ActionIconButton icon={RotateCcw} label="清空状态" onClick={props.onReset} />
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
  const disabled = !props.sourceCount || !props.data.targetPath?.trim()
  const label = props.dryRun ? `预演${props.actionMeta.shortLabel}` : `真实${props.actionMeta.shortLabel}`
  const action: MigratefAction = props.action

  return (
    <ExecuteButton
      dangerous={!props.dryRun}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={props.dryRun ? <Play /> : <ShieldAlert />}
      onExecute={() => props.onExecute(action)}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: MigratefStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <FolderSync />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">MigrateF</h3>
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
  result: MigratefData | null
}) {
  const stats = [
    ["总计", props.result?.totalCount ?? 0],
    ["迁移", props.result?.migratedCount ?? 0],
    ["跳过", props.result?.skippedCount ?? 0],
    ["失败", props.result?.failedCount ?? props.result?.errorCount ?? 0],
    ["批次", props.result?.operationId ? props.result.operationId.slice(0, 6) : "-"],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/migratef:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "失败" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function buildInput(executeAction: MigratefAction, data: MigratefCardState): MigratefInput {
  return {
    action: executeAction,
    mode: data.mode ?? "preserve",
    sourcePaths: splitPaths(data.sourceText),
    targetPath: data.targetPath,
    historyPath: data.historyPath,
    dryRun: data.dryRun ?? true,
    batchId: executeAction === "undo" ? data.result?.operationId : undefined,
  }
}

function statusFromState(data: MigratefCardState, running: boolean): MigratefStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "MigrateF 正在处理当前任务。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || (data.result?.errors.length ?? 0) > 0 || (data.result?.failedCount ?? 0) > 0) {
    return {
      label: "失败",
      description: data.progressText || data.result?.errors[0] || "上次任务存在失败项，请查看计划和日志。",
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
    description: "输入源路径和目标后预演或迁移。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: MigratefCardState, running: boolean): MigratefPhase {
  if (running) return "running"
  return data.phase ?? "idle"
}

function actionLabel(action: MigratefAction): string {
  if (action === "move") return "移动"
  if (action === "copy") return "复制"
  if (action === "undo") return "撤销"
  if (action === "plan") return "计划"
  return "读取历史"
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.migratedCount) return `${props.result.migratedCount} 项已迁移`
  if (props.result?.plan.length) return `${props.result.plan.length} 项计划 / ${props.result.skippedCount} 跳过`
  if (props.sourceCount) return `${props.sourceCount} 源 / ${props.modeMeta.shortLabel} / ${props.dryRun ? "预演" : "真实"}`
  return "输入源路径和目标后开始"
}

function splitPaths(text?: string): string[] {
  if (!text) return []
  return [...new Set(text.split(/\r?\n|;|,/).map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean))]
}
