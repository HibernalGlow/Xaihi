import { useState } from "react"
import type { ReactNode } from "react"
import type { ClassfAction, ClassfData, ClassfPlacementMode, ClassfTransferMode, ClassfWorkItemMode } from "@xiranite/node-classf/core"
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Clipboard,
  ClipboardList,
  Clock3,
  Copy,
  Folder,
  FolderCheck,
  FolderTree,
  Layers3,
  Play,
  RotateCcw,
  ShieldAlert,
  Terminal,
  Trash2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Input } from "@/components/ui/input"
import { PathTextarea } from "@/components/ui/path-input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eNodeSurface,
  Md3eShapeBadge,
  Md3eStageLensBar,
  Md3eStatusPill,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, NODE_ICON, PLACEMENT_MODES, PLAN_ICON, TRANSFER_MODES } from "./constants"
import { BlacklistKeywordsEditor } from "./BlacklistKeywordsEditor"
import { ClassfPlanRows, ClassfPlanTree } from "./ClassfPlanTree"
import { ClassfQueueControls } from "./ClassfQueueControls"
import { analyzeClassfPlan } from "./planAnalysis"
import type { ClassfCardState, ClassfStatusMeta } from "./types"

export interface ClassfExpressiveViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: ClassfAction
  actionMeta: (typeof ACTIONS)[number]
  configFilePath?: string
  configDirty: boolean
  data: ClassfCardState
  defaults?: Partial<ClassfCardState>
  logs: string[]
  paths: string[]
  progress: number
  planCurrent: boolean
  result: ClassfData | null
  running: boolean
  status: ClassfStatusMeta
  tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  onActionChange: (value: ClassfAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: ClassfAction) => void
  onImportDeletionHistory: () => Promise<{ path: string; csv: string } | undefined>
  onPastePaths: () => void
  onPatch: (patch: Partial<ClassfCardState>) => void
  onRevealPath?: (path: string) => Promise<void>
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onOpenConfigFile?: () => Promise<void> | void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

type ViewMode = "narrow" | "tablet" | "desktop"
type InspectLens = "tree" | "matrix" | "analysis" | "logs"
type Tone = "primary" | "secondary" | "tertiary" | "error" | "neutral"

interface ClassfAnalysis {
  alreadyCount: number
  delCount: number
  waitCount: number
  alreadyRatio: number
  delRatio: number
  waitRatio: number
  fileCount: number
  directoryCount: number
  maxDepth: number
  extensions: { extension: string; count: number }[]
}

const DOCK_CLEARANCE = 72

function resolveViewMode(props: Pick<ClassfExpressiveViewProps, "surface" | "compactSurface" | "portraitCompact">): ViewMode {
  if (props.compactSurface || props.portraitCompact) return "narrow"
  if (props.surface.mode === "workspace" || props.surface.width >= 1000) return "desktop"
  if (props.surface.mode === "expanded" || props.surface.width >= 620) return "tablet"
  return "narrow"
}

function runLabel(props: ClassfExpressiveViewProps): string {
  if (props.action === "plan") return props.tNode("actions.planRun", "生成计划")
  return props.data.dryRun ?? true
    ? props.tNode("actions.dryClassify", "预演分类")
    : props.tNode("actions.liveClassify", "执行分类")
}

export function ClassfExpressiveView(props: ClassfExpressiveViewProps) {
  const [inspectLens, setInspectLens] = useState<InspectLens>("tree")
  const mode = resolveViewMode(props)
  const live = props.action === "classify" && !(props.data.dryRun ?? true)
  const analysis = analyzeClassfPlan(props.result) as ClassfAnalysis
  const label = runLabel(props)
  const translate = (key: string, fallback: string, vars?: Record<string, unknown>) => {
    const text = props.tNode(key, fallback, vars)
    if (!vars) return text
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""))
  }

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      className={compact ? "h-9 px-3.5 text-xs" : "h-10 px-5 text-sm font-bold"}
      compact={compact === true}
      dangerous={live}
      disabled={!props.paths.length}
      idleIcon={props.action === "plan" ? <ClipboardList /> : <Play />}
      label={label}
      running={props.running}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="classf"
        surface={props.surface}
        testId="classf-md3e-surface"
        collapsedTestId="classf-collapsed-view"
        icon={NODE_ICON}
        title="ClassF"
        badgeText={props.status.label}
        statusText={props.data.progressText || `${props.paths.length} 项源 · ${props.result?.readyCount ?? 0} 可执行`}
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const masthead = (
    <ClassfMasthead
      actions={
        <>
          <ActionIconButton
            shapeRole="secondary"
            disabled={!props.result?.items.length}
            icon={Copy}
            label={props.tNode("actions.copyResults", "复制结果")}
            onClick={props.onCopyResults}
          />
          <ActionIconButton
            shapeRole="toolbar"
            disabled={!props.logs.length}
            icon={Terminal}
            label={props.tNode("actions.copyLogs", "复制日志")}
            onClick={props.onCopyLogs}
          />
          <NodeConfigPopover
            {...(props.configFilePath ? { configPath: props.configFilePath } : {})}
            {...(props.defaults ? { defaults: props.defaults } : {})}
            dirty={props.configDirty}
            disabled={props.running}
            t={props.tNode}
            {...(props.onOpenConfigFile ? { onOpenFile: props.onOpenConfigFile } : {})}
            onReload={props.onReloadDefaults}
            onRestore={props.onRestoreDefault}
            onSave={props.onSaveDefault}
          />
          <ActionIconButton
            shapeRole="danger"
            disabled={props.running}
            icon={RotateCcw}
            label={props.tNode("actions.clear", "清空状态")}
            onClick={props.onReset}
          />
        </>
      }
      errors={props.result?.errorCount ?? 0}
      mode={mode}
      progress={props.progress}
      readyCount={props.result?.readyCount ?? 0}
      running={props.running}
      sources={props.paths.length}
      status={props.status}
      subtitle={props.data.progressText || `${props.paths.length} 个来源 · ${props.planCurrent ? "计划已同步" : "待生成计划"}`}
      conflicts={props.result?.conflictCount ?? 0}
    />
  )

  const sourcePanel = (
    <ClassfPanel
      data-testid="classf-scan-sources"
      icon={Archive}
      meta={`${props.paths.length} 个路径`}
      title={props.tNode("sections.scanSources", "来源")}
    >
      <Segmented
        ariaLabel="工作项类型"
        disabled={props.running}
        onChange={(workItemMode) => props.onPatch({ workItemMode })}
        options={[
          { value: "files" as ClassfWorkItemMode, label: props.tNode("workItemModes.files", "压缩包"), icon: Archive },
          { value: "folders" as ClassfWorkItemMode, label: props.tNode("workItemModes.folders", "文件夹"), icon: Folder },
          { value: "mixed" as ClassfWorkItemMode, label: props.tNode("workItemModes.mixed", "混合"), icon: Layers3 },
        ]}
        value={props.data.workItemMode ?? "files"}
      />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <PathTextarea
          id="classf-paths"
          aria-label="classf paths"
          className="h-24 min-h-24 resize-none rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs leading-5"
          disabled={props.running}
          placeholder={props.tNode("placeholders.sameaRoots", "例如 D:/set/reviewed.zip")}
          value={props.data.pathsText ?? ""}
          onValueChange={(pathsText) => props.onPatch({ pathsText })}
        />
        <div className="flex flex-col gap-1">
          <ActionIconButton
            shapeRole="secondary"
            disabled={props.running}
            icon={Clipboard}
            label={props.tNode("actions.paste", "粘贴路径")}
            onClick={props.onPastePaths}
          />
          <ActionIconButton
            shapeRole="danger"
            disabled={props.running || !props.data.pathsText}
            icon={Trash2}
            label={props.tNode("actions.clearPaths", "清空路径")}
            onClick={() => props.onPatch({ pathsText: "" })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">CrashU 来源</span>
          <span className="truncate text-[11px] text-muted-foreground">留空使用默认库</span>
        </div>
        <Textarea
          aria-label="classf crashu sources"
          className="h-9 min-h-9 resize-none rounded-[12px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
          disabled={props.running}
          placeholder={props.tNode("placeholders.crashuSources", "每行一个目录")}
          rows={1}
          value={props.data.crashuSourcesText ?? ""}
          onChange={(event) => props.onPatch({ crashuSourcesText: event.currentTarget.value })}
        />
      </div>
      <BlacklistKeywordsEditor
        data={props.data}
        disabled={props.running}
        t={translate}
        onImportDeletionHistory={props.onImportDeletionHistory}
        onPatch={props.onPatch}
      />
    </ClassfPanel>
  )

  const queuePanel = (
    <ClassfPanel icon={FolderTree} title={props.tNode("queues.title", "分流规则")}>
      <ClassfQueueControls data={props.data} disabled={props.running} t={translate} onPatch={props.onPatch} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">放置位置</span>
        <Segmented
          ariaLabel="放置位置模式"
          disabled={props.running}
          onChange={(placementMode) => props.onPatch({ placementMode })}
          options={PLACEMENT_MODES.map((placement) => ({
            value: placement.value as ClassfPlacementMode,
            label: props.tNode(`placementModes.${placement.value}`, placement.label),
            icon: placement.icon,
          }))}
          value={props.data.placementMode ?? "local"}
        />
        {(props.data.placementMode ?? "local") === "root" ? (
          <Input
            id="classf-target"
            aria-label="classf target"
            className="h-9 rounded-[12px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] text-xs"
            disabled={props.running}
            placeholder={props.tNode("placeholders.targetRequired", "根目录分流必须填写目标根目录")}
            value={props.data.targetDir ?? ""}
            onChange={(event) => props.onPatch({ targetDir: event.currentTarget.value })}
          />
        ) : null}
      </div>
    </ClassfPanel>
  )

  const actionOptions = ACTIONS.map((action) => ({
    value: action.value,
    label: action.value === "plan"
      ? props.tNode("actions.planRun", "生成计划")
      : props.tNode("actions.classifyRun", "执行分类"),
    icon: action.icon,
  }))
  const transferOptions = TRANSFER_MODES.map((transfer) => ({
    value: transfer.value as ClassfTransferMode,
    label: props.tNode(`transferModes.${transfer.value}`, transfer.label),
    icon: transfer.icon,
  }))
  const actionHint = props.action === "plan"
    ? "只计算分类结果，不改动文件。"
    : props.data.dryRun ?? true
      ? "模拟分类过程，不会移动或复制文件。"
      : "会真实移动或复制文件，执行前请确认计划已同步。"

  const dryRunSwitch = (
    <Switch
      aria-label={props.tNode("fields.dryRun", "预演模式")}
      checked={props.data.dryRun ?? true}
      disabled={props.running}
      size="sm"
      onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
    />
  )

  const executionContent = (
    <>
      <div className="flex flex-col gap-1.5">
        <Segmented
          ariaLabel="执行阶段"
          disabled={props.running}
          onChange={props.onActionChange}
          options={actionOptions}
          value={props.action}
        />
        <p className={cn("text-[11px] leading-4", live ? "text-destructive" : "text-muted-foreground")}>{actionHint}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">传输方式</span>
        <Segmented
          ariaLabel="传输模式"
          disabled={props.running}
          onChange={(transferMode) => props.onPatch({ transferMode })}
          options={transferOptions}
          value={props.data.transferMode ?? "move"}
        />
      </div>
      <label className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] px-3 py-2">
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-foreground">{props.tNode("fields.dryRun", "预演模式")}</span>
          <span className="block text-[11px] leading-4 text-muted-foreground">只计算目标位置，不改动文件</span>
        </span>
        {dryRunSwitch}
      </label>
    </>
  )

  const executionPanel = (
    <ClassfPanel data-testid="classf-execution-gate" icon={ShieldAlert} title={props.tNode("sections.executionGate", "执行")}>{executionContent}</ClassfPanel>
  )

  const executionBar = (
    <section className="flex min-w-0 shrink-0 items-center gap-3 rounded-[20px] bg-[var(--md3e-surface-low,var(--card))] p-2.5" data-testid="classf-execution-gate">
      <div className="flex shrink-0 items-center gap-1.5">
        <ShieldAlert className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
        <h2 className="text-[13px] font-bold tracking-tight text-foreground">{props.tNode("sections.executionGate", "执行")}</h2>
      </div>
      <div className="flex min-w-[200px] shrink-0 flex-col gap-1">
        <Segmented
          ariaLabel="执行阶段"
          disabled={props.running}
          onChange={props.onActionChange}
          options={actionOptions}
          value={props.action}
        />
        <p className={cn("text-[11px] leading-4", live ? "text-destructive" : "text-muted-foreground")}>{actionHint}</p>
      </div>
      <div className="flex min-w-[150px] shrink-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">传输方式</span>
        <Segmented
          ariaLabel="传输模式"
          disabled={props.running}
          onChange={(transferMode) => props.onPatch({ transferMode })}
          options={transferOptions}
          value={props.data.transferMode ?? "move"}
        />
      </div>
      <label className="ml-auto flex shrink-0 items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">预演</span>
        {dryRunSwitch}
      </label>
    </section>
  )

  const resultsPanel = (
    <ClassfResultsPanel
      analysis={analysis}
      inspectLens={inspectLens}
      logs={props.logs}
      mode={mode}
      onChangeLens={setInspectLens}
      {...(props.onRevealPath ? { onRevealPath: props.onRevealPath } : {})}
      paths={props.paths}
      planCurrent={props.planCurrent}
      result={props.result}
      {...(props.data.runningItem ? { runningItem: props.data.runningItem } : {})}
      tNode={translate}
    />
  )

  const floatingDock = (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-end">
      <div
        className="pointer-events-auto flex max-w-full min-w-0 items-center gap-1.5"
        data-testid="classf-floating-dock"
      >
        {mode !== "narrow" ? <Md3eStatusPill compact label={live ? "实际执行" : "预演模式"} tone={live ? "error" : "secondary"} /> : null}
        {primaryCta()}
      </div>
    </div>
  )

  if (mode === "narrow") {
    return (
      <Md3eNodeSurface
        nodeId="classf"
        surface={props.surface}
        data-testid="classf-md3e-surface"
        data-ui-variant="md3e"
        className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--md3e-surface,var(--background))]"
      >
        <div
          data-testid={props.compactSurface ? (props.portraitCompact ? "classf-portrait-view" : "classf-compact-view") : "classf-full-view"}
          className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2 relative"
        >
          {masthead}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain" style={{ paddingBottom: DOCK_CLEARANCE }}>
            {sourcePanel}
            {queuePanel}
            {executionPanel}
            {resultsPanel}
          </div>
          {floatingDock}
        </div>
      </Md3eNodeSurface>
    )
  }

  if (mode === "tablet") {
    return (
      <Md3eNodeSurface
        nodeId="classf"
        surface={props.surface}
        data-testid="classf-md3e-surface"
        data-ui-variant="md3e"
        className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--md3e-surface,var(--background))]"
      >
        <div data-testid="classf-tablet-view" className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2">
          <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain" style={{ paddingBottom: DOCK_CLEARANCE }}>
            <div className="grid min-w-0 grid-cols-2 items-start gap-2">
              {sourcePanel}
              {queuePanel}
            </div>
            {executionPanel}
            {resultsPanel}
          </div>
          {floatingDock}
        </div>
      </Md3eNodeSurface>
    )
  }

  return (
    <Md3eNodeSurface
      nodeId="classf"
      surface={props.surface}
      data-testid="classf-md3e-surface"
      data-ui-variant="md3e"
      className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--md3e-surface,var(--background))]"
    >
      <div data-testid="classf-full-view" className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-2">
        <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
        <div
          className="grid min-h-0 min-w-0 flex-1 gap-2"
          style={{ gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)" }}
        >
          <aside className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5" style={{ paddingBottom: 8 }}>
            {sourcePanel}
            {queuePanel}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            {executionBar}
            {resultsPanel}
          </div>
        </div>
        {floatingDock}
      </div>
    </Md3eNodeSurface>
  )
}

function ClassfMasthead({
  actions,
  conflicts,
  errors,
  mode,
  progress,
  readyCount,
  running,
  sources,
  status,
  subtitle,
}: {
  actions: ReactNode
  conflicts: number
  errors: number
  mode: ViewMode
  progress: number
  readyCount: number
  running: boolean
  sources: number
  status: ClassfStatusMeta
  subtitle: string
}) {
  const compact = mode === "narrow"
  const statusTone: Tone = status.tone === "error" ? "error" : status.tone === "running" ? "primary" : status.tone === "success" ? "tertiary" : "neutral"
  const telemetry = [
    { label: "来源", value: sources },
    { label: "可执行", value: readyCount },
    { label: "冲突", value: conflicts, ...(conflicts > 0 ? { tone: "error" as const } : {}) },
    { label: "错误", value: errors, ...(errors > 0 ? { tone: "error" as const } : {}) },
  ]

  return (
    <header className="shrink-0" data-testid="classf-expressive-masthead">
      <div className="flex min-w-0 items-center gap-2.5 rounded-[24px_18px_24px_18px] bg-[var(--md3e-primary-container,var(--secondary))]/35 px-3 py-2.5">
        <Md3eShapeBadge active icon={NODE_ICON} seed="classf-masthead" size={compact ? "sm" : "md"} tone="primary" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className={cn("truncate font-black leading-none tracking-[-0.045em] text-foreground", compact ? "text-xl" : "text-2xl")}>ClassF</h1>
            <Md3eStatusPill label={status.label} tone={statusTone} />
          </div>
          <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-foreground/70">{subtitle}</p>
        </div>
        {compact ? null : (
          <>
            <Telemetry items={telemetry} />
            <div className="flex shrink-0 items-center gap-1" data-testid="classf-header-toolbar">{actions}</div>
          </>
        )}
      </div>
      {compact ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <Telemetry compact items={telemetry} />
          <div className="flex shrink-0 items-center gap-1" data-testid="classf-header-toolbar">{actions}</div>
        </div>
      ) : null}
      {running || (progress > 0 && progress < 100) ? <MastheadProgress running={running} value={progress} /> : null}
    </header>
  )
}

function Telemetry({ compact = false, items }: { compact?: boolean; items: { label: string; value: number; tone?: "error" }[] }) {
  if (compact) {
    return (
      <div className="flex min-w-[140px] flex-1 flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="classf-stats-dashboard">
        {items.map((item) => (
          <span key={item.label} className="inline-flex min-w-0 items-baseline gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">{item.label}</span>
            <span className={cn("font-mono text-sm font-bold tabular-nums", item.tone === "error" ? "text-destructive" : "text-foreground")}>{item.value}</span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 shrink-0 items-center" data-testid="classf-stats-dashboard">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn("flex min-w-0 flex-col px-3", index > 0 && "border-l border-foreground/10")}
        >
          <span className="truncate text-[10px] font-medium text-muted-foreground">{item.label}</span>
          <span className={cn("truncate font-mono text-base font-bold leading-5 tabular-nums", item.tone === "error" ? "text-destructive" : "text-foreground")}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function MastheadProgress({ running, value }: { running: boolean; value: number }) {
  return (
    <div
      aria-label="ClassF 进度"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(value)}
      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--md3e-surface-high,var(--muted))]"
      role="progressbar"
    >
      <div
        className={cn("h-full rounded-full bg-[var(--md3e-primary,var(--primary))] transition-[width] duration-300", running && "animate-pulse")}
        style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function ClassfPanel({
  children,
  className,
  icon: Icon,
  meta,
  title,
  ...rest
}: {
  children: ReactNode
  className?: string
  icon: LucideIcon
  meta?: ReactNode
  title: string
} & Omit<React.ComponentPropsWithoutRef<"section">, "children" | "title">) {
  return (
    <section
      className={cn("flex min-h-0 min-w-0 shrink-0 flex-col rounded-[20px] bg-[var(--md3e-surface-low,var(--card))] p-3", className)}
      {...rest}
    >
      <div className="mb-2.5 flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
        <h2 className="truncate text-[13px] font-bold tracking-tight text-foreground">{title}</h2>
        {meta ? <div className="ml-auto shrink-0 text-[11px] text-muted-foreground">{meta}</div> : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-2.5">{children}</div>
    </section>
  )
}

function Segmented<T extends string>({
  ariaLabel,
  className,
  disabled,
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  className?: string
  disabled?: boolean
  onChange: (next: T) => void
  options: readonly { value: T; label: string; icon?: LucideIcon }[]
  value: T
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex min-w-0 flex-wrap items-center gap-1 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            className={cn(
              "inline-flex min-w-[84px] flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 text-[12px] leading-tight transition-colors disabled:opacity-50",
              selected
                ? "rounded-[11px] bg-[var(--md3e-primary-container,var(--secondary))] font-bold text-[var(--md3e-on-primary-container,var(--primary))]"
                : "rounded-[10px] font-medium text-muted-foreground hover:bg-[var(--md3e-surface-high,var(--card))] hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ClassfResultsPanel({
  analysis,
  inspectLens,
  logs,
  mode,
  onChangeLens,
  onRevealPath,
  paths,
  planCurrent,
  result,
  runningItem,
  tNode,
}: {
  analysis: ClassfAnalysis
  inspectLens: InspectLens
  logs: string[]
  mode: ViewMode
  onChangeLens: (value: InspectLens) => void
  onRevealPath?: (path: string) => Promise<void>
  paths: string[]
  planCurrent: boolean
  result: ClassfData | null
  runningItem?: ClassfCardState["runningItem"]
  tNode: ClassfExpressiveViewProps["tNode"]
}) {
  const items = result?.items ?? []
  const tabs: { id: InspectLens; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: "tree", label: tNode("tabs.tree", "文件树"), icon: FolderTree, badge: items.length || paths.length },
    { id: "matrix", label: tNode("tabs.matrix", "分类矩阵"), icon: PLAN_ICON },
    { id: "analysis", label: tNode("tabs.analysis", "分析"), icon: BarChart3 },
    { id: "logs", label: tNode("tabs.logs", "日志"), icon: Terminal, badge: logs.length },
  ]
  const stale = !planCurrent && items.length > 0
  const emptyAlign = mode === "desktop" ? "center" : "start"
  const summary = items.length
    ? `${items.length} 个条目 · ${result?.readyCount ?? 0} 个可执行`
    : paths.length
      ? `${paths.length} 个来源 · 尚未生成计划`
      : "添加来源后生成第一份计划"

  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-[var(--md3e-surface-lowest,var(--card))]", mode === "desktop" ? "flex-1" : "shrink-0")}
      data-testid="classf-classification-matrix"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-foreground">分类结果</h2>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{summary}</p>
        </div>
        {stale ? <Md3eStatusPill compact icon={AlertTriangle} label="计划已失效" tone="error" /> : null}
      </div>
      <div className="min-w-0 px-3 pt-2 pb-2">
        <Md3eStageLensBar ariaLabel="ClassF 结果视图" className="max-w-full" items={tabs} onChange={onChangeLens} value={inspectLens} />
      </div>
      <div
        className="flex min-h-[220px] min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2"
        style={mode === "desktop" ? { paddingBottom: 64 } : undefined}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {inspectLens === "tree" ? (
            items.length ? (
              <ClassfPlanTree
                {...(onRevealPath ? { onRevealPath } : {})}
                planCurrent={planCurrent}
                result={result}
                showStaleBadge={false}
                {...(runningItem ? { runningItem } : {})}
                t={tNode}
              />
            ) : (
              <ResultEmptyStage
                align={emptyAlign}
                description={tNode("tree.emptyDescription", "生成计划后，这里会按目标目录展示每个文件的位置。")}
                icon={FolderTree}
                title={tNode("tree.empty", "等待分类计划")}
              />
            )
          ) : inspectLens === "matrix" ? (
            items.length ? (
              <ClassfPlanRows compact={mode === "narrow"} items={items} paths={paths} {...(runningItem ? { runningItem } : {})} t={tNode} />
            ) : (
              <ResultEmptyStage
                align={emptyAlign}
                description={paths.length ? tNode("empty.ready", "生成计划后，这里会列出每个来源与目标路径。") : tNode("empty.noSources", "添加来源路径后，这里会预览完整分类结果。")}
                icon={PLAN_ICON}
                title={paths.length ? "还没有分类矩阵" : "还没有来源路径"}
              />
            )
          ) : inspectLens === "analysis" ? (
            <ClassfAnalysisPanel analysis={analysis} itemCount={items.length} tNode={tNode} />
          ) : logs.length ? (
            <div className="h-full overflow-y-auto font-mono text-[12px] leading-5 text-muted-foreground">
              {logs.map((line, index) => (
                <div key={`${line}:${index}`} className="border-b border-[var(--md3e-surface-high,var(--border))]/70 px-1.5 py-1.5 last:border-0">{line}</div>
              ))}
            </div>
          ) : (
            <ResultEmptyStage
              align={emptyAlign}
              description="执行计划或分类时，分析、传输和 SameA 分组事件会实时追加到这里。"
              icon={Terminal}
              title="暂无运行日志"
            />
          )}
        </div>
      </div>
    </section>
  )
}

function ClassfAnalysisPanel({
  analysis,
  itemCount,
  tNode,
}: {
  analysis: ClassfAnalysis
  itemCount: number
  tNode: ClassfExpressiveViewProps["tNode"]
}) {
  const stages = [
    { label: tNode("stages.already", "already"), value: analysis.alreadyCount, ratio: analysis.alreadyRatio, tone: "primary" as const, icon: FolderCheck },
    { label: tNode("stages.wait", "wait"), value: analysis.waitCount, ratio: analysis.waitRatio, tone: "secondary" as const, icon: Clock3 },
    { label: tNode("stages.del", "del"), value: analysis.delCount, ratio: analysis.delRatio, tone: "error" as const, icon: Trash2 },
  ]
  const classified = analysis.alreadyCount + analysis.waitCount + analysis.delCount
  return (
    <div className="h-full overflow-y-auto px-1 py-1" data-testid="classf-analysis">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stages.map((stage) => (
          <div key={stage.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <stage.icon className="size-3.5 shrink-0" />
              <span className="truncate">{stage.label}</span>
            </span>
            <span className="truncate font-mono text-2xl font-bold leading-7 tabular-nums text-foreground">
              {stage.value}
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">{stage.ratio}%</span>
            </span>
          </div>
        ))}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Layers3 className="size-3.5 shrink-0" />
            <span className="truncate">最大层级</span>
          </span>
          <span className="truncate font-mono text-2xl font-bold leading-7 tabular-nums text-foreground">{analysis.maxDepth}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--md3e-surface-high,var(--border))]/70 pt-3">
        <div className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
          <span className="font-medium text-muted-foreground">分流占比</span>
          <span className="font-mono tabular-nums text-muted-foreground">{classified}/{itemCount}</span>
        </div>
        <div className="mt-2 flex h-2 min-w-0 gap-0.5 overflow-hidden rounded-full bg-[var(--md3e-surface-high,var(--muted))]">
          {stages.map((stage) => (
            <div
              key={stage.label}
              className={cn(
                "h-full min-w-[6px] first:rounded-l-full last:rounded-r-full",
                stage.tone === "primary" ? "bg-[var(--md3e-primary,var(--primary))]" : stage.tone === "secondary" ? "bg-[var(--md3e-secondary,var(--secondary))]" : "bg-destructive",
              )}
              style={{ flexGrow: Math.max(stage.value, stage.ratio) || 1 }}
              title={`${stage.label}：${stage.value} (${stage.ratio}%)`}
            />
          ))}
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {stages.map((stage) => (
            <span key={stage.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", stage.tone === "primary" ? "bg-[var(--md3e-primary,var(--primary))]" : stage.tone === "secondary" ? "bg-[var(--md3e-secondary,var(--secondary))]" : "bg-destructive")} aria-hidden="true" />
              <span>{stage.label}</span>
              <span className="font-mono tabular-nums text-foreground">{stage.value}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--md3e-surface-high,var(--border))]/70 pt-3 text-[11px] text-muted-foreground">
        <span>文件 <span className="font-mono tabular-nums text-foreground">{analysis.fileCount}</span></span>
        <span>目录 <span className="font-mono tabular-nums text-foreground">{analysis.directoryCount}</span></span>
        <span className="h-3 w-px bg-[var(--md3e-surface-high,var(--border))]" aria-hidden="true" />
        {analysis.extensions.length ? analysis.extensions.map((entry) => (
          <span key={entry.extension} className="inline-flex items-center gap-1 rounded-md bg-[var(--md3e-surface-low,var(--muted))] px-1.5 py-0.5">
            <span className="font-mono font-medium text-foreground">{entry.extension}</span>
            <span className="font-mono tabular-nums">{entry.count}</span>
          </span>
        )) : <span>生成计划后显示扩展名分布</span>}
      </div>
    </div>
  )
}

function ResultEmptyStage({
  align = "start",
  description,
  icon: Icon,
  title,
}: {
  align?: "start" | "center"
  description: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div className={cn("flex h-full min-h-[180px] min-w-0 justify-center p-4", align === "center" ? "items-center" : "items-start pt-8")}>
      <div className="flex max-w-[320px] flex-col items-center gap-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--md3e-primary-container,var(--secondary))]/45 text-[var(--md3e-primary,var(--primary))]">
          <Icon className="size-5" />
        </span>
        <div className="text-[15px] font-bold tracking-tight text-foreground">{title}</div>
        <p className="text-[12px] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
