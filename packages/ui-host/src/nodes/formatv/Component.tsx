import { tt } from "@/lib/i18nText"
import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { FormatvAction, FormatvData, FormatvInput } from "@xiranite/node-formatv/core"
import { Copy, FolderOpen, Minus, Plus, RotateCcw, Search, SlidersHorizontal, Square, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import {
  Md3eBentoStatGrid,
  Md3eHeaderBanner,
  Md3eHeroActionBar,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eSectionCard,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
  Md3eStatusPill,
  RunningTint,
} from "@/nodes/shared/controls"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { ACTIONS, DEFAULT_PREFIX_NAME } from "./constants"
import { ActionIconButton, OptionsPopover, PathInput, PrimarySwitches, StatusStrip } from "./controls"
import type { FormatvCardState, FormatvPhase, FormatvStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const data = host.getData<FormatvCardState>(compId) ?? {}
  const dataRef = useRef<FormatvCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<FormatvCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)
  const { t: tNode } = useNodeI18n("formatv")

  const logs = data.logs ?? []
  const result = data.result ?? null
  const pathCount = splitLines(data.pathText ?? "").length
  const prefixName = data.prefixName || DEFAULT_PREFIX_NAME
  const recursive = data.recursive ?? false
  const dryRun = data.dryRun ?? false
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running, result, tNode)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 340 && surface.height >= 360)

  useEffect(() => {
    host.getNodeConfig?.<Partial<FormatvCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.pathText, data.prefixName, data.recursive, data.dryRun, defaults])

  function patch(patchData: Partial<FormatvCardState>) {
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

  async function copyResults() {
    const lines = [
      ...(result?.duplicates ?? []),
      ...(result?.operations ?? []).map((item) => `${item.status} ${item.sourcePath} -> ${item.targetPath}`),
      ...(result?.normalFiles ?? []),
      ...(result?.novFiles ?? []),
    ]
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function execute(action: FormatvAction) {
    if (running) return
    const paths = splitLines(dataRef.current.pathText ?? "")
    if (!paths.length) {
      patch({ phase: "error", progress: 0, progressText: tNode("pathRequired", "请先输入至少一个视频路径。") })
      return
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: tNode("noNative", "当前环境没有本地运行能力，请使用桌面模式或 CLI。") })
      pushLog("Native action is unavailable in this host.")
      return
    }

    const input: FormatvInput = {
      action,
      paths,
      recursive,
      prefixName,
      dryRun,
    }

    setRunning(true)
    try {
      patch({ phase: phaseForAction(action), progress: 0, progressText: tNode("actionStart", "{{action}}开始", { action: actionLabel(action, tNode) }), result: null })
      const response = await run<FormatvInput, FormatvData>("formatv", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<FormatvData>

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
    const config: Partial<FormatvCardState> = {}
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
    patch({ pathText: undefined, prefixName: undefined, recursive: undefined, dryRun: undefined })
  }

  const commonProps = createViewProps({
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    host,
    logs,
    pathCount,
    phase,
    prefixName,
    progress,
    recursive,
    result,
    running,
    status,
    tNode,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.openConfigFile,
    onPaste: pastePath,
    onPatch: patch,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  })

  return (
    <TooltipProvider>
      <Md3eNodeSurface
        nodeId="formatv"
        surface={surface}
        className="@container/formatv relative flex h-full min-h-0 w-full overflow-hidden rounded-[28px]"
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...commonProps} />
          ) : compactSurface ? (
            portraitCompact ? <PortraitCompactView {...commonProps} /> : <CompactView {...commonProps} />
          ) : (
            <FullView {...commonProps} />
          )}
        </div>
      </Md3eNodeSurface>
    </TooltipProvider>
  )
}

type ViewProps = ReturnType<typeof createViewProps>

function createViewProps(props: {
  configDirty: boolean
  configFilePath?: string
  data: FormatvCardState
  defaults?: Partial<FormatvCardState>
  dryRun: boolean
  host: NodeComponentProps["host"]
  logs: string[]
  pathCount: number
  phase: FormatvPhase
  prefixName: string
  progress: number
  recursive: boolean
  result: FormatvData | null
  running: boolean
  status: FormatvStatusMeta
  tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: FormatvAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<FormatvCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="formatv-collapsed-view" className="relative flex h-full min-h-0 items-center gap-3 overflow-hidden rounded-[26px] bg-[var(--md3e-surface,var(--card))] px-4 py-3">
      <RunningTint tone={props.status.tone} />
      <Md3eShapeBadge icon={Video} seed="formatv-collapsed" tone="primary" active size="md" />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-black tracking-tight leading-none">
          <span>FormatV</span>
          <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs font-black tabular-nums text-primary">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="formatv-compact-view" className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface,var(--card))] px-3.5 py-2.5">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1.5">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPaste} />
        <PrimarySwitches
          compact
          includePrefix
          prefixValue={props.prefixName}
          onPrefixChange={(prefixName) => props.onPatch({ prefixName })}
          data={props.data}
          disabled={props.running}
          onPatch={props.onPatch}
        />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <ResultTabs compact logs={props.logs} result={props.result} running={props.running} prefixName={props.prefixName} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="formatv-portrait-view" className="flex h-full min-h-0 flex-col gap-2.5 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface,var(--card))] px-3.5 py-2.5">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1.5">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2.5">
        <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPaste} />
        <PrimarySwitches
          compact
          includePrefix
          prefixValue={props.prefixName}
          onPrefixChange={(prefixName) => props.onPatch({ prefixName })}
          data={props.data}
          disabled={props.running}
          onPatch={props.onPatch}
        />
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <ResultTabs compact logs={props.logs} result={props.result} running={props.running} prefixName={props.prefixName} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="formatv-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
      <FloatingWindowNodeHeader>
        <Md3eHeaderBanner
          icon={Video}
          title="FormatV"
          eyebrow="节点 / 视频前缀与查重"
          subtitle={props.data.progressText || props.tNode("headerSubtitle", "{{count}} 路径 / {{mode}} / 前缀 {{prefix}}", { count: props.pathCount, mode: props.dryRun ? props.tNode("modeDryRun", "预演") : props.tNode("modeWrite", "真实执行"), prefix: props.prefixName })}
          status={props.status}
          pills={
            <Md3eStatusPill
              label={`#${props.prefixName}`}
              tone="secondary"
              compact
              dot={false}
            />
          }
          testId="formatv-header-toolbar"
          actions={
            <>
              <Md3eShapePopoverButton nodeId="formatv" />
              <ActionIconButton disabled={!props.result && !props.logs.length} icon={RotateCcw} label={props.tNode("buttons.reset", tt("module:shared.ui.clearState", "清空状态"))} onClick={props.onReset} />
              <NodeConfigButton
                nodeKey="formatv"
                configDirty={props.configDirty}
                configFilePath={props.configFilePath}
                defaults={props.defaults}
                disabled={props.running}
                onOpenConfigFile={props.onOpenConfigFile}
                onResetOverride={props.onResetOverride}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <StatsPanel progress={props.progress} result={props.result} prefixName={props.prefixName} />

      <div data-slot="md3e-workbench-grid">
        <Md3eSectionCard
          seed="formatv-control-deck"
          icon={SlidersHorizontal}
          title={props.tNode("sections.input", tt("module:formatv.sections.input", "输入"))}
          badge={props.tNode("sections.keySwitches", tt("module:shared.ui.keyToggles", "关键开关"))}
          description={props.tNode("sections.inputDesc", tt("module:formatv.sections.inputDesc", "粘贴视频目录，扫描后可加/移除 .nov 或查重。"))}
          className="flex min-h-0 flex-col gap-3"
        >
          <Md3eHeroActionBar
            primary={<PrimaryActionButton props={props} />}
            secondary={
              <>
                <RenameActionButton action="add_nov" props={props} />
                <RenameActionButton action="remove_nov" props={props} />
                <ActionIconButton disabled={props.running || !props.pathCount} icon={Copy} label={props.tNode("buttons.checkDuplicates", tt("module:shared.ui.findDuplicates", "查重"))} onClick={() => props.onExecute("check_duplicates")} />
              </>
            }
          />

          <PathInput
            disabled={props.running}
            pathCount={props.pathCount}
            value={props.data.pathText ?? ""}
            onChange={(pathText) => props.onPatch({ pathText })}
            onClear={() => props.onPatch({ pathText: "" })}
            onPaste={props.onPaste}
          />

          <PrimarySwitches
            includePrefix
            prefixValue={props.prefixName}
            onPrefixChange={(prefixName) => props.onPatch({ prefixName })}
            data={props.data}
            disabled={props.running}
            onPatch={props.onPatch}
          />

          {(props.status.tone === "running" || props.status.tone === "error") && (
            <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
          )}
        </Md3eSectionCard>

        <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden">
          <ResultTabs
            logs={props.logs}
            result={props.result}
            running={props.running}
            prefixName={props.prefixName}
            onCopyLogs={props.onCopyLogs}
            onCopyResults={props.onCopyResults}
          />
        </div>
      </div>
    </div>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", props.compact && "justify-between")}>
      <ActionIconButton disabled={props.running || !props.pathCount} icon={Search} label={props.tNode("buttons.scan", tt("module:formatv.actionScanVideos", "扫描视频"))} onClick={() => props.onExecute("scan")} />
      <RenameActionButton action="add_nov" props={props} />
      <RenameActionButton action="remove_nov" props={props} />
      <ActionIconButton disabled={props.running || !props.pathCount} icon={Copy} label={props.tNode("buttons.checkDuplicates", tt("module:shared.ui.findDuplicates", "查重"))} onClick={() => props.onExecute("check_duplicates")} />
      <ActionIconButton disabled={!props.result && !props.logs.length} icon={RotateCcw} label={props.tNode("buttons.reset", tt("module:shared.ui.clearState", "清空状态"))} onClick={props.onReset} />
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  if (props.running) {
    return (
      <Button aria-label={props.tNode("aria.running", "formatv running")} disabled size={compact ? "icon-sm" : "default"} shapeRole="primary" variant="secondary">
        <Square />
        {!compact && <span>{props.tNode("status.running", "运行中")}</span>}
      </Button>
    )
  }

  const disabled = !props.pathCount
  const label = props.tNode("buttons.scan", tt("module:formatv.actionScanVideos", "扫描视频"))
  return (
    <Button aria-label={label} disabled={disabled} size={compact ? "icon-sm" : "default"} shapeRole="primary" onClick={() => props.onExecute("scan")}>
      <Search />
      {!compact && <span>{label}</span>}
    </Button>
  )
}

function RenameActionButton({ action, props }: { action: "add_nov" | "remove_nov"; props: ViewProps }) {
  const { t: tNode } = useNodeI18n("formatv")
  const meta = action === "add_nov"
    ? { icon: Plus, label: tNode("buttons.addNov", "添加 .nov") }
    : { icon: Minus, label: tNode("buttons.removeNov", "移除 .nov") }
  const Icon = meta.icon
  const disabled = props.running || !props.pathCount

  return (
    <ExecuteButton
      compact
      dangerous={!props.dryRun}
      disabled={disabled}
      label={meta.label}
      idleIcon={<Icon />}
      onExecute={() => props.onExecute(action)}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: FormatvStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
      <div className="flex min-w-0 items-center gap-2.5">
        <Md3eShapeBadge icon={Video} seed="formatv-header" tone="primary" active size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-black tracking-tight leading-none">FormatV</h3>
            <Md3eStatusPill label={status.label} tone={status.tone} compact />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </FloatingWindowNodeHeader>
  )
}

function StatsPanel(props: {
  progress: number
  result: FormatvData | null
  prefixName: string
}) {
  const { t: tNode } = useNodeI18n("formatv")
  const dupLabel = tNode("stats.duplicates", "查重")
  return (
    <Md3eBentoStatGrid
      items={[
        { label: tNode("stats.normal", "普通"), value: props.result?.normalCount ?? 0, icon: Video, tone: "primary" },
        { label: tNode("stats.nov", ".nov"), value: props.result?.novCount ?? 0, icon: Video, tone: "secondary" },
        { label: props.prefixName, value: props.result?.prefixedCounts[props.prefixName] ?? 0, icon: Video, tone: "tertiary" },
        { label: tNode("stats.success", "成功"), value: props.result?.successCount ?? 0, icon: Video, tone: "default" },
        { label: dupLabel, value: props.result?.duplicateCount ?? 0, icon: Video, tone: (props.result?.duplicateCount ?? 0) > 0 ? "error" : "default" },
        { label: tNode("stats.progress", "进度"), value: `${props.progress}%`, icon: Video, gauge: props.progress },
      ]}
    />
  )
}

function ResultTabs(props: {
  compact?: boolean
  logs: string[]
  result: FormatvData | null
  prefixName: string
  running?: boolean
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  const resultLines = buildResultLines(props.result, props.prefixName)
  const files = buildFileRows(props.result, props.prefixName)
  const preferredTab = props.running
    ? "files"
    : files.length
      ? "files"
      : props.logs.length
        ? "logs"
        : "files"

  return (
    <Md3eSectionCard
      seed="formatv-results"
      className="flex h-full min-h-0 flex-1 flex-col p-3"
    >
      <Tabs defaultValue={preferredTab} className="flex h-full min-h-0 flex-col">
        <div className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <TabsList className="shrink-0">
            <TabsTrigger value="files">{tNode("tabs.files", "文件")}</TabsTrigger>
            <TabsTrigger value="results">{tNode("tabs.results", "重复")}</TabsTrigger>
            <TabsTrigger value="logs">{tNode("tabs.logs", "日志")}</TabsTrigger>
            <TabsTrigger value="shapes">形状</TabsTrigger>
          </TabsList>
          <Md3eStatusPill
            label={files.length ? tNode("empty.itemCount", "{{count}} 项", { count: files.length }) : tNode("empty.waitingRun", "等待运行")}
            tone={files.length > 0 ? "primary" : "neutral"}
            compact
          />
        </div>
        <TabsContent value="files" className="min-h-0 flex-1">
          <FileTablePanel compact={props.compact} files={files} onCopy={props.onCopyResults} />
        </TabsContent>
        <TabsContent value="results" className="min-h-0 flex-1">
          <TextPanel
            compact={props.compact}
            emptyText={tNode("empty.results", "扫描、加/移除 .nov 或查重后会显示文件列表和操作结果。")}
            icon={Video}
            lines={resultLines}
            onCopy={props.onCopyResults}
          />
        </TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <TextPanel compact={props.compact} emptyText={tNode("empty.logs", "运行日志会显示在这里。")} icon={Copy} lines={props.logs} onCopy={props.onCopyLogs} />
        </TabsContent>
        <TabsContent value="shapes" className="min-h-0 flex-1 overflow-auto">
          <Md3eNodeShapePolicyPanel nodeId="formatv" />
        </TabsContent>
      </Tabs>
    </Md3eSectionCard>
  )
}

function FileTablePanel(props: { compact?: boolean; files: Array<{ path: string; state: string }>; onCopy: () => void }) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <section className="flex h-full min-h-0 flex-col rounded-[20px] bg-[var(--md3e-surface-low,var(--background))]/75 p-2.5">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <FolderOpen className="size-3.5 text-primary" />
          <span>{props.files.length ? tNode("empty.itemCount", "{{count}} 项", { count: props.files.length }) : tNode("empty.waitingRun", "等待运行")}</span>
        </div>
        <Button disabled={!props.files.length} size="xs" variant="secondary" className="rounded-full" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          {tNode("buttons.copy", "复制")}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {props.files.length ? (
          <div className="space-y-1.5 pr-1">
            {props.files.map((file) => (
              <div key={file.path} className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--md3e-surface-high,var(--muted))]/65 px-3 py-2 text-xs">
                <span className="truncate font-mono" title={file.path}>{file.path.split(/[\\/]/).at(-1)}</span>
                <Badge variant={file.state === "重复" ? "destructive" : "secondary"} className="shrink-0 rounded-full border-0">{file.state}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
            <Md3eShapeBadge icon={Video} seed="formatv-empty" tone="neutral" size="md" />
            <span>{tNode("empty.results", "扫描后会显示文件列表。")}</span>
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function TextPanel(props: {
  compact?: boolean
  emptyText: string
  icon: typeof Video
  lines: string[]
  onCopy: () => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  const Icon = props.icon
  return (
    <section className="flex h-full min-h-0 flex-col rounded-[20px] bg-[var(--md3e-surface-low,var(--background))]/75 p-2.5">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-muted-foreground">
          <Icon className="size-3.5 text-primary" />
          <span>{props.lines.length ? tNode("empty.itemCount", "{{count}} 项", { count: props.lines.length }) : tNode("empty.waitingRun", "等待运行")}</span>
        </div>
        <Button disabled={!props.lines.length} size="xs" variant="secondary" className="rounded-full" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          {tNode("buttons.copy", "复制")}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground"}>
            <Md3eShapeBadge icon={Icon} seed={`formatv-empty-${props.emptyText}`} tone="neutral" size="md" />
            <span>{props.emptyText}</span>
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function buildResultLines(result: FormatvData | null, prefixName: string): string[] {
  if (!result) return []
  if (result.operations.length) {
    return result.operations.map((item) => `${item.status} ${item.sourcePath} -> ${item.targetPath}${item.reason ? ` / ${item.reason}` : ""}`)
  }
  if (result.duplicates.length) {
    return result.duplicates.map((item) => `duplicate ${item}`)
  }
  return [
    ...result.normalFiles.map((file) => `normal ${file}`),
    ...result.novFiles.map((file) => `.nov ${file}`),
    ...(result.prefixedFiles[prefixName] ?? []).map((file) => `${prefixName} ${file}`),
  ]
}

function buildFileRows(result: FormatvData | null, prefixName: string): Array<{ path: string; state: string }> {
  if (!result) return []
  const duplicates = new Set(result.duplicates)
  return [
    ...result.normalFiles.map((path) => ({ path, state: duplicates.has(path) ? tt("module:shared.ui.duplicate", "重复") : tt("module:formatv.visibleLabel", "可见") })),
    ...result.novFiles.map((path) => ({ path, get state() { return tt("module:formatv.hiddenNovState", "隐藏 (.nov)") } })),
    ...(result.prefixedFiles[prefixName] ?? []).map((path) => ({ path, get state() { return tt("module:formatv.prefixedFiles", "前缀文件") } })),
  ]
}

function statusFromState(data: FormatvCardState, running: boolean, result: FormatvData | null, tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string): FormatvStatusMeta {
  if (running || data.phase === "scan" || data.phase === "add_nov" || data.phase === "remove_nov" || data.phase === "check_duplicates") {
    return {
      label: tNode("status.running", "运行中"),
      description: data.progressText || tNode("statusDesc.running", "FormatV 正在处理视频文件。"),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || result?.errors.length) {
    return {
      label: tNode("status.error", "失败"),
      description: data.progressText || result?.errors[0] || tNode("statusDesc.error", "上次任务失败，请查看结果和日志。"),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("status.completed", "完成"),
      description: data.progressText || tNode("statusDesc.completed", "上次任务已完成。"),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  return {
    label: tNode("status.idle", "就绪"),
    description: tNode("statusDesc.idle", "粘贴视频目录后扫描或查重。"),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-[var(--md3e-primary-container,var(--secondary))] text-[var(--md3e-on-primary-container,var(--primary))]",
  }
}

function phaseFromState(data: FormatvCardState, running: boolean): FormatvPhase {
  if (running) return data.phase ?? "scan"
  return data.phase ?? "idle"
}

function phaseForAction(action: FormatvAction): FormatvPhase {
  if (action === "scan") return "scan"
  if (action === "add_nov") return "add_nov"
  if (action === "remove_nov") return "remove_nov"
  return "check_duplicates"
}

function actionLabel(action: FormatvAction, tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string): string {
  const meta = ACTIONS.find((item) => item.value === action)
  if (!meta) return action
  if (action === "scan") return tNode("buttons.scan", meta.shortLabel)
  if (action === "add_nov") return tNode("buttons.addNov", meta.shortLabel)
  if (action === "remove_nov") return tNode("buttons.removeNov", meta.shortLabel)
  return tNode("buttons.checkDuplicates", meta.shortLabel)
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.duplicateCount) return props.tNode("summary.duplicates", "{{count}} 个重复", { count: props.result.duplicateCount })
  if (props.result?.errorCount) return props.tNode("summary.errors", "{{count}} 个失败", { count: props.result.errorCount })
  if (props.result) return props.tNode("summary.videos", "{{normal}} 普通 / {{nov}} .nov", { normal: props.result.normalCount, nov: props.result.novCount })
  if (props.pathCount) return props.tNode("summary.waiting", "{{count}} 条路径等待扫描", { count: props.pathCount })
  return props.tNode("summary.empty", "未设置视频路径")
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
