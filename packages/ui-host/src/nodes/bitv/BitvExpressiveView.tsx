import { tt } from "@/lib/i18nText"
import type { ReactNode } from "react"
import type { BitvAction, BitvData, BitvVideoInfo } from "@xiranite/node-bitv/core"
import { BITV_DEFAULTS } from "@xiranite/node-bitv/defaults"
import {
  AlertTriangle,
  BarChart3,
  Clipboard,
  Copy,
  Eye,
  FileVideo,
  Folder,
  FolderOutput,
  Gauge,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Video,
  Waypoints,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PathInput, PathTextarea } from "@/components/ui/path-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eConnectedGroup,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3ePatchBackdrop,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eWavyProgress,
  useMd3eShapeContext,
} from "@/nodes/shared/controls"
import type { Md3eButtonRole, Md3eExpressiveShapeId } from "@/nodes/shared/md3eShapeSystem"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, NODE_META } from "./constants"
import type { BitvCardState, BitvStatusMeta } from "./types"

export interface BitvExpressiveViewProps {
  surface: NodeSurface
  compact: boolean
  action: BitvAction
  configDirty: boolean
  data: BitvCardState
  defaults?: Partial<BitvCardState>
  logs: string[]
  progress: number
  result: BitvData | null
  resultTab: string
  running: boolean
  status: BitvStatusMeta
  onCopyLogs: () => Promise<void> | void
  onCopyResults: () => Promise<void> | void
  onExecute: (action?: BitvAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<BitvCardState>) => void
  onReset: () => void
  onRestoreDefaults: () => void
  onSaveDefaults: () => Promise<void>
  onResultTabChange: (value: string) => void
}

type ViewMode = "narrow" | "tablet" | "desktop"
type Tone = "primary" | "secondary" | "plain"

const ACTION_ROLES: readonly Md3eButtonRole[] = ["primary", "secondary", "outline", "ghost"]

/**
 * 三档而不是两档：
 * - narrow：手机/窄卡片，单列滚动；
 * - tablet：中等宽度，动作条铺满、源与参数双列、结果全宽，仍在同一滚动列；
 * - desktop：宽窗，左控制 / 右结果的工作台。
 */
function resolveViewMode(surface: NodeSurface): ViewMode {
  if (surface.mode === "compact" || surface.mode === "portrait") return "narrow"
  if (surface.mode === "workspace" || surface.width >= 1000) return "desktop"
  if (surface.mode === "expanded" || surface.width >= 620) return "tablet"
  return "narrow"
}

function runLabelFor(action: BitvAction, data: BitvCardState): string {
  if (action === "status") return tt("module:bitv.runStatus", "检查环境")
  if (action === "analyze") return tt("module:bitv.runAnalyze", "开始分析")
  if (data.dryRun ?? true) return tt("module:bitv.runPlan", "生成分类计划")
  return `${data.transferMode === "move" ? tt("module:shared.ui.move", "移动") : tt("module:shared.ui.copy", "复制")}并分类`
}

export function BitvExpressiveView(props: BitvExpressiveViewProps) {
  const meta = ACTIONS.find((item) => item.value === props.action) ?? ACTIONS[0]!
  const dangerous = (props.action === "classify" || props.action === "report") && props.data.dryRun === false
  const runLabel = runLabelFor(props.action, props.data)

  if (props.surface.mode === "collapsed" || (props.compact && props.surface.height > 0 && props.surface.height < 150)) {
    return (
      <Md3eCollapsedCapsule
        nodeId="bitv"
        surface={props.surface}
        testId="bitv-md3e-surface"
        collapsedTestId="bitv-collapsed-view"
        icon={NODE_META.icon}
        title="BitV"
        badgeText={props.status.label}
        statusText={props.data.progressText || meta.description}
        progress={props.progress}
        running={props.running}
        action={<ExecuteButton size="xs" running={props.running} dangerous={dangerous} label={runLabel} onExecute={() => props.onExecute(props.action)} />}
      />
    )
  }

  return (
    <Md3eNodeSurface
      nodeId="bitv"
      surface={props.surface}
      data-testid="bitv-md3e-surface"
      data-ui-variant="md3e"
      className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--md3e-surface,var(--background))]"
    >
      <BitvExpressiveShell {...props} dangerous={dangerous} meta={meta} runLabel={runLabel} />
    </Md3eNodeSurface>
  )
}

function BitvExpressiveShell({
  dangerous,
  meta,
  runLabel,
  ...props
}: BitvExpressiveViewProps & {
  dangerous: boolean
  meta: (typeof ACTIONS)[number]
  runLabel: string
}) {
  const shapeCtx = useMd3eShapeContext()
  const roleShapes = shapeCtx?.activeRoleShapes
  const mode = resolveViewMode(props.surface)
  const isDryRun = props.data.dryRun ?? true
  const execute = (className?: string) => (
    <ExecuteButton
      className={cn(
        "min-w-0 rounded-[26px] font-black tracking-tight shadow-sm transition-transform active:scale-[0.98]",
        mode === "narrow" ? "h-14 flex-1 text-base" : "h-12 shrink-0 px-5 text-base",
        className,
      )}
      running={props.running}
      dangerous={dangerous}
      label={runLabel}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  const masthead = (
    <ExpressiveMasthead
      actions={
        <>
          <NodeConfigButton
            nodeKey="bitv"
            configDirty={props.configDirty}
            defaults={props.defaults}
            disabled={props.running}
            onResetOverride={props.onRestoreDefaults}
            onRestoreDefault={props.onRestoreDefaults}
            onSaveDefault={props.onSaveDefaults}
          />
          <ActionIconButton
            shapeRole="danger"
            disabled={props.running}
            icon={RotateCcw}
            label={tt("module:bitv.clearResults", "清空结果")}
            onClick={props.onReset}
          />
          <Md3eShapePopoverButton nodeId="bitv" />
        </>
      }
      meta={meta}
      mode={mode}
      primaryShape={roleShapes?.primary}
      progress={props.progress}
      progressText={props.data.progressText}
      result={props.result}
      running={props.running}
      status={props.status}
    />
  )

  const decks = (
    <>
      <ActionDeck
        action={props.action}
        mode={mode}
        roleShapes={roleShapes}
        running={props.running}
        onActionChange={(action) => props.onPatch({ action })}
      />
      <SourceDeck
        action={props.action}
        compact={mode === "narrow"}
        data={props.data}
        running={props.running}
        onPastePaths={props.onPastePaths}
        onPatch={props.onPatch}
      />
      <TuningDeck
        action={props.action}
        data={props.data}
        isDryRun={isDryRun}
        roleShapes={roleShapes}
        running={props.running}
        onPatch={props.onPatch}
      />
    </>
  )

  const results = (
    <ResultDeck
      action={props.action}
      logs={props.logs}
      mode={mode}
      onCopyLogs={props.onCopyLogs}
      onCopyResults={props.onCopyResults}
      onResultTabChange={props.onResultTabChange}
      pathsText={props.data.pathsText}
      result={props.result}
      resultTab={props.resultTab}
    />
  )

  const floatingDock = (
    <div
      className="absolute right-3 bottom-3 z-20 flex max-w-[calc(100%-1.5rem)] min-w-0 items-center gap-1.5"
      data-testid="bitv-floating-dock"
    >
      <Md3eStatusPill compact label={dangerous ? "LIVE" : "DRY-RUN"} tone={dangerous ? "error" : props.status.tone} />
      {props.action === "classify" || props.action === "report" ? (
        <ActionIconButton
          active={!isDryRun}
          disabled={props.running}
          icon={isDryRun ? Eye : Sparkles}
          label={isDryRun ? "当前为预演模式" : "当前为真实执行模式"}
          shapeRole="secondary"
          onClick={() => props.onPatch({ dryRun: !isDryRun })}
        />
      ) : null}
      {execute()}
    </div>
  )

  if (mode === "narrow") {
    return (
      <div
        data-bitv-layout="narrow"
        data-bitv-role-shapes={roleShapes ? JSON.stringify(roleShapes) : undefined}
        data-testid={props.surface.mode === "compact" ? "bitv-compact-view" : "bitv-portrait-view"}
        className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2"
      >
        {masthead}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {execute()}
          {props.action === "classify" || props.action === "report" ? (
            <ActionIconButton
              active={!isDryRun}
              disabled={props.running}
              icon={isDryRun ? Eye : Sparkles}
              label={isDryRun ? "当前为预演模式" : "当前为真实执行模式"}
              shapeRole="secondary"
              onClick={() => props.onPatch({ dryRun: !isDryRun })}
            />
          ) : null}
          <ActionIconButton
            disabled={props.running || props.action !== "analyze"}
            icon={Clipboard}
            label={tt("module:shared.ui.pastePath", "粘贴路径")}
            shapeRole="toolbar"
            onClick={props.onPastePaths}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1">
          {decks}
          {results}
        </div>
      </div>
    )
  }

  if (mode === "tablet") {
    return (
      <div
        data-bitv-layout="tablet"
        data-bitv-role-shapes={roleShapes ? JSON.stringify(roleShapes) : undefined}
        data-testid="bitv-tablet-view"
        className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2"
      >
        <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-14">
          <ActionDeck
            action={props.action}
            mode={mode}
            roleShapes={roleShapes}
            running={props.running}
            onActionChange={(action) => props.onPatch({ action })}
          />
          <div className="grid min-w-0 grid-cols-2 items-start gap-2">
            <SourceDeck
              action={props.action}
              compact={false}
              data={props.data}
              running={props.running}
              onPastePaths={props.onPastePaths}
              onPatch={props.onPatch}
            />
            <TuningDeck
              action={props.action}
              data={props.data}
              isDryRun={isDryRun}
              roleShapes={roleShapes}
              running={props.running}
              onPatch={props.onPatch}
            />
          </div>
          {results}
        </div>
        {floatingDock}
      </div>
    )
  }

  return (
    <div
      data-bitv-layout="desktop"
      data-bitv-role-shapes={roleShapes ? JSON.stringify(roleShapes) : undefined}
      data-testid="bitv-full-view"
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-2"
    >
      <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
      <div
        data-testid="bitv-workbench-grid"
        className="grid min-h-0 min-w-0 flex-1 gap-2"
        style={{ gridTemplateColumns: "minmax(0, 0.94fr) minmax(0, 1.06fr)" }}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5 pb-14">{decks}</div>
        {results}
      </div>
      {floatingDock}
    </div>
  )
}

function ExpressiveMasthead({
  actions,
  meta,
  mode,
  primaryShape,
  progress,
  progressText,
  result,
  running,
  status,
}: {
  actions: ReactNode
  meta: (typeof ACTIONS)[number]
  mode: ViewMode
  primaryShape?: Md3eExpressiveShapeId
  progress: number
  progressText?: string
  result: BitvData | null
  running: boolean
  status: BitvStatusMeta
}) {
  const compact = mode === "narrow"
  const desktop = mode === "desktop"
  const telemetry = telemetryFor(result)
  return (
    <Md3ePatchBackdrop
      seed="bitv-expressive-masthead"
      tone="primary"
      active
      corner="lg"
      data-testid="bitv-expressive-masthead"
      className="shrink-0 overflow-hidden rounded-[32px_20px_32px_18px] px-3 py-2"
    >
      <div className="relative z-10 flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <Md3eShapeBadge icon={meta.icon} shapeId={primaryShape} tone="primary" active size={compact ? "md" : "lg"} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--md3e-primary,var(--primary))]" />
              <span className="truncate font-mono text-[9px] font-black tracking-[0.22em] text-foreground/60">BITRATE SPECTRUM</span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={cn("truncate font-black leading-none tracking-[-0.045em] text-foreground", compact ? "text-xl" : "text-3xl")}>BitV</h1>
              <Md3eStatusPill label={status.label} tone={status.tone} compact />
            </div>
            <p className={cn("mt-1 text-[11px] leading-snug text-foreground/75", compact ? "line-clamp-1" : "line-clamp-2")}>{progressText || meta.description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {compact ? null : (
              <div data-testid="bitv-header-toolbar" className="flex shrink-0 items-center gap-1">
                {actions}
              </div>
            )}
            {desktop ? (
              <div data-testid="bitv-stats-dashboard" className="flex max-w-[460px] min-w-0 flex-wrap items-center justify-end gap-1">
                {telemetry.map((item) => (
                  <div key={item.label} className="flex min-w-0 flex-col rounded-[12px_8px_12px_8px] bg-[var(--md3e-surface,var(--card))]/55 px-2 py-0.5">
                    <span className="truncate text-[8px] font-bold tracking-wide text-foreground/65">{item.label}</span>
                    <span className="truncate font-mono text-[12px] font-black tabular-nums text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {desktop ? null : (
          <div
            data-testid="bitv-stats-dashboard"
            className={cn("min-w-0", compact ? "grid grid-cols-2 gap-1" : "flex gap-0.5", compact && !result && "hidden")}
          >
            {telemetry.map((item, index, items) => (
              <div
                key={item.label}
                className={cn(
                  "flex min-w-0 flex-col bg-[var(--md3e-surface,var(--card))]/55 px-2 py-1.5",
                  compact
                    ? "rounded-[14px_10px_14px_10px]"
                    : index === 0
                      ? "flex-1 rounded-l-[16px] rounded-r-[4px]"
                      : index === items.length - 1
                        ? "flex-1 rounded-l-[4px] rounded-r-[16px]"
                        : "flex-1 rounded-[4px]",
                )}
              >
                <span className="truncate text-[9px] font-bold tracking-wide text-foreground/65">{item.label}</span>
                <span className="truncate font-mono text-sm font-black tabular-nums text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {progress > 0 ? (
          <div className="min-w-0">
            <Md3eWavyProgress value={progress} running={running} />
          </div>
        ) : null}

        {compact ? (
          <div data-testid="bitv-header-toolbar" className="flex min-w-0 items-center justify-end gap-1">{actions}</div>
        ) : null}
      </div>
    </Md3ePatchBackdrop>
  )
}

function telemetryFor(result: BitvData | null) {
  const stats = result?.stats
  return [
    { label: tt("module:shared.ui.video", "视频"), value: stats?.totalVideos ?? 0 },
    { label: "平均码率", value: stats ? `${stats.averageBitrateMbps.toFixed(1)} Mbps` : "—" },
    { label: "分类操作", value: result?.operations.length ?? 0 },
    { label: tt("module:shared.ui.issues", "问题"), value: result?.errors.length ?? 0 },
  ]
}

function ActionDeck({
  action,
  mode,
  onActionChange,
  roleShapes,
  running,
}: {
  action: BitvAction
  mode: ViewMode
  onActionChange: (action: BitvAction) => void
  roleShapes?: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  running: boolean
}) {
  return (
    <section
      data-testid="bitv-action-deck"
      aria-label="BitV 动作模式"
      className={cn("grid min-w-0 shrink-0 gap-1.5", mode === "tablet" ? "grid-cols-4" : "grid-cols-2")}
    >
      {ACTIONS.map((item, index) => {
        const selected = item.value === action
        const role = ACTION_ROLES[index] ?? "ghost"
        return (
          <button
            key={item.value}
            type="button"
            disabled={running}
            aria-pressed={selected}
            data-bitv-action={item.value}
            data-bitv-action-shape={roleShapes?.[role]}
            onClick={() => onActionChange(item.value)}
            style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            className={cn(
              "group relative flex min-h-16 min-w-0 items-center gap-2 overflow-hidden rounded-[24px_14px_24px_14px] p-2 text-left transition-[background-color,border-radius,transform] duration-300 active:scale-[0.97] disabled:opacity-60",
              selected
                ? "rounded-[28px] bg-[var(--md3e-secondary-container,var(--secondary))] text-[var(--md3e-on-secondary-container,var(--secondary-foreground))] shadow-sm"
                : "bg-[var(--md3e-surface-high,var(--muted))] text-foreground",
            )}
          >
            <Md3eShapeBadge active={selected} icon={item.icon} shapeId={roleShapes?.[role]} size="sm" tone={selected ? "secondary" : "neutral"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black">{item.shortLabel}</span>
              <span className={cn("block truncate text-[10.5px] leading-tight opacity-70", selected || mode !== "narrow" ? "block" : "hidden")}>{item.description}</span>
            </span>
          </button>
        )
      })}
    </section>
  )
}

function SourceDeck({
  action,
  compact,
  data,
  onPastePaths,
  onPatch,
  running,
}: {
  action: BitvAction
  compact: boolean
  data: BitvCardState
  onPastePaths: () => void
  onPatch: (patch: Partial<BitvCardState>) => void
  running: boolean
}) {
  const showSource = action === "analyze"
  const showReport = action === "report"
  const showTarget = action === "classify" || action === "report"
  if (!showSource && !showReport && !showTarget) {
    return (
      <ExpressiveDeck eyebrow="ENVIRONMENT" title="环境检查" tone="plain" icon={Sparkles}>
        <p className="text-[11px] leading-relaxed text-muted-foreground">检查本机 ffprobe 是否可用；该动作只读取环境，不会修改任何文件。</p>
      </ExpressiveDeck>
    )
  }
  return (
    <ExpressiveDeck eyebrow="INPUT" title={showReport ? "分析报告" : showTarget ? "分类目标" : "视频源"} tone="primary" icon={showReport ? FolderOutput : Folder}>
      <div className="flex min-w-0 flex-col gap-2">
        {showSource ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-[10px] font-bold text-foreground/70">{tt("module:bitv.videoInputLabel", "视频源路径")}</span>
              <ActionIconButton disabled={running} icon={Clipboard} label={tt("module:shared.ui.pastePath", "粘贴路径")} shapeRole="secondary" onClick={onPastePaths} />
            </div>
            {compact ? (
              <PathInput
                aria-label={tt("module:bitv.videoPathPlaceholder", "bitv 视频路径")}
                className="h-10 w-full min-w-0 rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs"
                disabled={running}
                dropMode="append"
                placeholder={tt("module:bitv.videoPathHint", "视频文件或目录路径，每行一个")}
                value={data.pathsText ?? ""}
                onValueChange={(pathsText) => onPatch({ pathsText })}
              />
            ) : (
              <PathTextarea
                aria-label={tt("module:bitv.videoPathPlaceholder", "bitv 视频路径")}
                className="min-h-20 w-full min-w-0 rounded-[18px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs"
                disabled={running}
                placeholder={"每行一个视频文件或目录\nD:/Videos/clip.mp4\nD:/Videos/Season 1"}
                value={data.pathsText ?? ""}
                onValueChange={(pathsText) => onPatch({ pathsText })}
              />
            )}
            <Input
              aria-label={tt("module:bitv.reportOutputPlaceholder", "bitv 报告输出路径")}
              className="h-9 w-full min-w-0 rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs"
              disabled={running}
              placeholder={tt("module:bitv.saveReportHint", "可选：保存分析报告到 .json")}
              value={data.outputPath ?? ""}
              onChange={(event) => onPatch({ outputPath: event.currentTarget.value })}
            />
          </div>
        ) : null}

        {showReport ? (
          <ExpressiveField
            disabled={running}
            label={tt("module:bitv.reportPlaceholder", "bitv 分析报告")}
            placeholder={tt("module:bitv.reportJsonPath", "BitV 分析报告 JSON 路径")}
            value={data.reportPath ?? ""}
            onChange={(reportPath) => onPatch({ reportPath })}
          />
        ) : null}

        {showTarget ? (
          <ExpressiveField
            disabled={running}
            label={tt("module:bitv.classifyTargetPlaceholder", "bitv 分类目标目录")}
            placeholder={tt("module:bitv.classifyTarget", "分类目标目录")}
            value={data.targetPath ?? ""}
            onChange={(targetPath) => onPatch({ targetPath })}
          />
        ) : null}
      </div>
    </ExpressiveDeck>
  )
}

function ExpressiveField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean
  label: string
  onChange: (next: string) => void
  placeholder: string
  value: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[10px] font-bold text-foreground/70">{label}</span>
      <Input
        aria-label={label}
        className="h-9 w-full min-w-0 rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function TuningDeck({
  action,
  data,
  isDryRun,
  onPatch,
  roleShapes,
  running,
}: {
  action: BitvAction
  data: BitvCardState
  isDryRun: boolean
  onPatch: (patch: Partial<BitvCardState>) => void
  roleShapes?: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  running: boolean
}) {
  const targetAction = action === "classify" || action === "report"
  return (
    <ExpressiveDeck eyebrow="TUNING" title="分级与传输" tone="secondary" icon={SlidersHorizontal}>
      <div className="flex min-w-0 flex-col gap-2">
        {targetAction ? (
          <div role="group" aria-label="传输模式" className="grid grid-cols-2 gap-1.5">
            {[
              { value: "copy" as const, label: tt("module:shared.ui.copy", "复制") },
              { value: "move" as const, label: tt("module:shared.ui.move", "移动") },
            ].map((option) => {
              const selected = (data.transferMode ?? "copy") === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={running}
                  onClick={() => onPatch({ transferMode: option.value })}
                  style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                  className={cn(
                    "min-h-10 min-w-0 rounded-[18px] px-3 text-xs font-black transition-[background-color,border-radius] duration-300",
                    selected
                      ? "rounded-full bg-[var(--md3e-primary,var(--primary))] text-[var(--md3e-on-primary,var(--primary-foreground))] shadow-xs"
                      : "bg-[var(--md3e-surface-lowest,var(--card))]/80 text-muted-foreground",
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}

        <ExpressiveStepper
          disabled={running}
          icon={Gauge}
          label={tt("module:bitv.bitrateStep", "码率步长")}
          max={20}
          min={0.5}
          step={0.5}
          unit="Mbps"
          value={data.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps}
          onChange={(bitrateStepMbps) => onPatch({ bitrateStepMbps })}
        />
        <ExpressiveStepper
          disabled={running}
          icon={BarChart3}
          label={tt("module:bitv.levelCount", "分级数量")}
          max={16}
          min={1}
          step={1}
          unit="级"
          value={data.maxLevels ?? BITV_DEFAULTS.maxLevels}
          onChange={(maxLevels) => onPatch({ maxLevels })}
        />

        {action === "analyze" || action === "classify" ? (
          <ExpressiveSwitch
            checked={data.recursive ?? BITV_DEFAULTS.recursive}
            description={tt("module:bitv.includeSubfolders", "目录包含子文件夹")}
            disabled={running}
            icon={Folder}
            label={tt("module:shared.ui.scanRecursive", "递归扫描")}
            shapeId={roleShapes?.toolbar}
            onCheckedChange={(recursive) => onPatch({ recursive })}
          />
        ) : null}
        {targetAction ? (
          <ExpressiveSwitch
            checked={isDryRun}
            description={tt("module:bitv.writeOnDisable", "关闭后执行文件操作")}
            disabled={running}
            icon={isDryRun ? Eye : Sparkles}
            label={tt("module:shared.ui.dryRunMode", "预演模式")}
            shapeId={roleShapes?.outline}
            onCheckedChange={(dryRun) => onPatch({ dryRun })}
          />
        ) : null}
      </div>
    </ExpressiveDeck>
  )
}

function ExpressiveStepper({
  disabled,
  icon: Icon,
  label,
  max,
  min,
  onChange,
  step,
  unit,
  value,
}: {
  disabled: boolean
  icon: LucideIcon
  label: string
  max: number
  min: number
  onChange: (next: number) => void
  step: number
  unit: string
  value: number
}) {
  const decimals = String(step).includes(".") ? String(step).split(".")[1]!.length : 0
  const clamp = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next))
    return Number(bounded.toFixed(decimals))
  }
  return (
    <div className="min-w-0 rounded-[22px] bg-[var(--md3e-surface-lowest,var(--card))]/85 p-2.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon className="size-3.5 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
            <span className="truncate text-[10px] font-bold text-foreground/70">{label}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <output className="font-mono text-2xl font-black leading-none tabular-nums text-foreground">{value.toFixed(decimals)}</output>
            <span className="text-[9px] font-semibold text-muted-foreground">{unit}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button aria-label={`${label} 减少`} className="transition-transform active:scale-90" disabled={disabled || value <= min} shapeRole="toolbar" size="icon" type="button" variant="secondary" onClick={() => onChange(clamp(value - step))}>
            <Minus />
          </Button>
          <Button aria-label={`${label} 增加`} className="transition-transform active:scale-90" disabled={disabled || value >= max} shapeRole="secondary" size="icon" type="button" variant="secondary" onClick={() => onChange(clamp(value + step))}>
            <Plus />
          </Button>
        </div>
      </div>
      <ExpressiveRange
        disabled={disabled}
        label={label}
        max={max}
        min={min}
        step={step}
        value={value}
        onChange={(next) => onChange(clamp(next))}
      />
    </div>
  )
}

/**
 * MD3E 滑杆：16px 厚轨 + 可读的大数；抓手是竖条而不是小圆点，
 * 按下时变宽、两端保持圆角，避免退回到通用 1.5px 细线。
 */
function ExpressiveRange({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  disabled: boolean
  label: string
  max: number
  min: number
  onChange: (next: number) => void
  step: number
  value: number
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div
      data-slot="md3e-slider"
      data-md3e-slider-value={value}
      className="group relative mt-3 h-10 min-w-0 rounded-full focus-within:ring-[3px] focus-within:ring-[var(--md3e-primary,var(--primary))]/30"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--md3e-surface-high,var(--muted))]"
      >
        <div
          className="h-full rounded-full bg-[var(--md3e-primary,var(--primary))] transition-[width] duration-150"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-9 w-1.5 -translate-y-1/2 rounded-[6px] bg-[var(--md3e-primary,var(--primary))] shadow-[0_0_0_4px_var(--md3e-surface-lowest,var(--card))] transition-[width,height,border-radius] duration-150 group-active:h-10 group-active:w-2.5 motion-reduce:transition-none"
        style={{ left: `calc(${Math.max(0, Math.min(100, pct))}% - 3px)` }}
      />
      <input
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

function ExpressiveSwitch({
  checked,
  description,
  disabled,
  icon,
  label,
  onCheckedChange,
  shapeId,
}: {
  checked: boolean
  description: string
  disabled: boolean
  icon: LucideIcon
  label: string
  onCheckedChange: (checked: boolean) => void
  shapeId?: Md3eExpressiveShapeId
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[20px] bg-[var(--md3e-surface-lowest,var(--card))]/85 p-2">
      <Md3eShapeBadge icon={icon} shapeId={shapeId} size="sm" tone={checked ? "primary" : "neutral"} active={checked} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold text-foreground">{label}</div>
        <div className="truncate text-[9px] text-muted-foreground">{description}</div>
      </div>
      <Switch aria-label={label} checked={checked} disabled={disabled} showIcon onCheckedChange={onCheckedChange} />
    </div>
  )
}

function ExpressiveDeck({
  children,
  className,
  eyebrow,
  icon: Icon,
  title,
  tone,
  trailing,
}: {
  children: ReactNode
  className?: string
  eyebrow: string
  icon?: LucideIcon
  title: string
  tone: Tone
  trailing?: ReactNode
}) {
  const toneClass =
    tone === "primary"
      ? "bg-[var(--md3e-primary-container,var(--secondary))]/45"
      : tone === "secondary"
        ? "bg-[var(--md3e-secondary-container,var(--secondary))]/45"
        : "bg-[var(--md3e-surface-high,var(--muted))]"
  return (
    <section className={cn("flex min-w-0 shrink-0 flex-col overflow-hidden rounded-[28px_18px_28px_18px] p-3", toneClass, className)}>
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
        {Icon ? <Md3eShapeBadge icon={Icon} seed={`deck-${title}`} size="sm" tone={tone === "secondary" ? "secondary" : "primary"} /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-bold tracking-[0.16em] text-foreground/55">{eyebrow}</div>
          <div className="truncate text-sm font-black tracking-tight text-foreground">{title}</div>
        </div>
        {trailing ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{trailing}</div> : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function ResultDeck({
  action,
  logs,
  mode,
  onCopyLogs,
  onCopyResults,
  onResultTabChange,
  pathsText,
  result,
  resultTab,
}: {
  action: BitvAction
  logs: string[]
  mode: ViewMode
  onCopyLogs: () => Promise<void> | void
  onCopyResults: () => Promise<void> | void
  onResultTabChange: (value: string) => void
  pathsText?: string
  result: BitvData | null
  resultTab: string
}) {
  const tabs = [
    { id: "tree", label: tt("module:shared.ui.fileTree", "文件树"), icon: FolderOutput },
    { id: "videos", label: tt("module:shared.ui.video", "视频"), icon: Video, badge: result?.videos.length ?? 0 },
    { id: "plan", label: tt("module:shared.ui.plan", "计划"), icon: Waypoints, badge: result?.operations.length ?? 0 },
    { id: "issues", label: tt("module:shared.ui.issues", "问题"), icon: AlertTriangle, badge: result?.errors.length ?? 0 },
    { id: "logs", label: tt("module:shared.ui.log", "日志"), icon: Terminal, badge: logs.length },
    { id: "shapes", label: "形状", icon: Sparkles },
  ]
  const activeTab = tabs.find((tab) => tab.id === resultTab) ?? tabs[0]!
  const inputCount = (pathsText ?? "").split(/\r?\n/).filter((line) => line.trim()).length
  const activeCount = activeTab.id === "tree" ? inputCount : activeTab.badge
  return (
    <ExpressiveDeck
      className={cn(
        "min-w-0",
        mode === "narrow" ? "h-[330px] min-h-[300px]" : mode === "tablet" ? "h-[320px] min-h-[300px] shrink-0" : "min-h-0 flex-1",
      )}
      eyebrow="SPECTRUM DECK"
      icon={BarChart3}
      title="结果谱系"
      tone="plain"
      trailing={
        <>
          <Md3eStatusPill compact label={`视频 ${result?.videos.length ?? 0}`} tone="primary" />
          <Md3eStatusPill compact label={`计划 ${result?.operations.length ?? 0}`} tone="secondary" />
          <Md3eStatusPill compact label={`问题 ${result?.errors.length ?? 0}`} tone={(result?.errors.length ?? 0) > 0 ? "error" : "neutral"} />
        </>
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
          <Md3eStageLensBar
            ariaLabel="BitV 结果视图"
            className="min-w-0"
            items={tabs.map(({ badge, icon, id, label }) => ({ badge: badge ? badge : undefined, icon, id, label }))}
            onChange={onResultTabChange}
            value={resultTab}
          />
          <div className="flex min-w-0 items-center gap-1">
            <ActionIconButton disabled={!(result?.videos.length || result?.operations.length)} icon={Copy} label="复制结果" shapeRole="secondary" onClick={() => void onCopyResults()} />
            <ActionIconButton disabled={!logs.length} icon={Clipboard} label={tt("module:shared.ui.copyLog", "复制日志")} shapeRole="toolbar" onClick={() => void onCopyLogs()} />
          </div>
        </div>

        <div className={cn("flex min-h-[220px] min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-[24px_16px_24px_16px] bg-[var(--md3e-surface-lowest,var(--card))]/75 p-2", mode === "desktop" && "pb-14")}>
          {mode !== "desktop" ? null : (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[18px_12px_18px_12px] bg-[var(--md3e-surface-high,var(--muted))] px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Md3eShapeBadge active icon={activeTab.icon} seed={`bitv-result-stage-${activeTab.id}`} size="sm" tone="primary" />
                <div className="min-w-0">
                  <div className="truncate text-[8px] font-bold tracking-[0.16em] text-foreground/55">RESULT STAGE</div>
                  <div className="truncate text-[12px] font-black tracking-tight text-foreground">{activeTab.label}</div>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <Md3eStatusPill compact label={`${activeCount ?? 0} 项`} tone="secondary" />
                {activeTab.id === "videos" ? <Md3eStatusPill compact label="按码率分档" tone="primary" /> : null}
                {activeTab.id === "shapes" ? <Md3eStatusPill compact label="节点形状偏好" tone="neutral" /> : null}
              </div>
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {resultTab === "tree" ? (
              <BitvPathTree pathsText={pathsText} />
            ) : resultTab === "videos" ? (
              <BitvVideoSpectrum videos={result?.videos ?? []} />
            ) : resultTab === "plan" ? (
              <BitvPlanList operations={result?.operations ?? []} />
            ) : resultTab === "issues" ? (
              <TextResult description="分析完成后，无法探测或写入失败的文件会列在这里。" hint="状态正常" icon={AlertTriangle} lines={result?.errors ?? []} title="未发现问题" tone="error" />
            ) : resultTab === "logs" ? (
              <TextResult description="执行时会实时追加分析、计划与传输日志。" hint="等待运行" icon={Terminal} lines={logs} title="暂无运行事件" />
            ) : (
              <ScrollArea className="h-full">
                <Md3eNodeShapePolicyPanel compact={mode === "narrow"} nodeId="bitv" />
              </ScrollArea>
            )}
          </div>
        </div>
        {action === "status" ? <p className="truncate px-1 text-[9px] text-muted-foreground">环境检查不会修改文件。</p> : null}
      </div>
    </ExpressiveDeck>
  )
}

function ResultEmptyStage({
  description,
  hint,
  icon,
  seed,
  title,
}: {
  description: string
  hint: string
  icon: LucideIcon
  seed: string
  title: string
}) {
  return (
    <div className="flex h-full min-h-[160px] min-w-0 items-center justify-center p-1.5">
      <Md3ePatchBackdrop active className="flex w-full max-w-[480px] flex-col items-center gap-2 px-5 py-6 text-center" seed={seed} tone="primary">
        <Md3eShapeBadge active icon={icon} seed={`${seed}-badge`} size="lg" tone="primary" />
        <div className="text-sm font-black tracking-tight text-foreground">{title}</div>
        <p className="max-w-[340px] text-[10px] leading-4 text-muted-foreground">{description}</p>
        <Md3eStatusPill compact label={hint} tone="secondary" />
      </Md3ePatchBackdrop>
    </div>
  )
}

type TreeNode = { name: string; path: string; kind: "directory" | "video"; children: TreeNode[] }

function BitvPathTree({ pathsText }: { pathsText?: string }) {
  const roots = buildPathTree(pathsText)
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="bitv-path-tree">
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 px-1">
        <span className="truncate text-[10px] font-bold text-muted-foreground">{tt("module:bitv.analysisInput", "视频分析输入")}</span>
        <Md3eStatusPill compact label={`${roots.length} 项`} tone="primary" />
      </div>
      {roots.length ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex w-full min-w-0 flex-col gap-1 p-1">
            {roots.map((node) => <TreeRow key={node.path} node={node} />)}
          </div>
        </ScrollArea>
      ) : (
        <div className="min-h-0 flex-1">
          <ResultEmptyStage
            description={tt("module:bitv.addedHere", "在左侧添加视频文件或目录，执行分析后会在这里展开路径树。")}
            hint="等待输入"
            icon={FolderOutput}
            seed="bitv-empty-tree"
            title="还没有视频输入"
          />
        </div>
      )}
    </div>
  )
}

function TreeRow({ depth = 0, node }: { depth?: number; node: TreeNode }) {
  const Icon = node.kind === "video" ? FileVideo : Folder
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 rounded-[16px_10px_16px_10px] bg-[var(--md3e-surface-high,var(--card))] px-2 py-1 text-[11px]" style={{ marginLeft: `${Math.min(depth, 6) * 10}px` }}>
        <Md3eShapeBadge icon={Icon} seed={node.path} size="sm" tone={node.kind === "video" ? "primary" : "neutral"} />
        <span className="truncate font-mono font-semibold" title={node.path}>{node.name}</span>
      </div>
      {node.children.map((child) => <TreeRow key={child.path} depth={depth + 1} node={child} />)}
    </div>
  )
}

function buildPathTree(pathsText?: string): TreeNode[] {
  const roots: TreeNode[] = []
  for (const raw of pathsText?.split(/\r?\n/) ?? []) {
    const path = raw.trim().replace(/^['"]|['"]$/g, "")
    if (!path) continue
    const parts = path.replaceAll("\\", "/").split("/").filter(Boolean)
    let nodes = roots
    let joined = path.startsWith("/") ? "/" : ""
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]!
      joined = joined ? `${joined}/${name}` : name
      const last = index === parts.length - 1
      const kind = last && /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mpg|mpeg|ogv|ts|mts|m2ts)$/i.test(name) ? "video" : "directory"
      let node = nodes.find((item) => item.name === name && item.kind === kind)
      if (!node) {
        node = { name, path: joined, kind, children: [] }
        nodes.push(node)
      }
      nodes = node.children
    }
  }
  return roots
}

type SpectrumTone = "primary" | "secondary" | "tertiary"

interface SpectrumBand {
  level: string
  videos: BitvVideoInfo[]
  averageBitrate: number
  peakBitrate: number
  tone: SpectrumTone
}

const SPECTRUM_TONES: readonly SpectrumTone[] = ["primary", "secondary", "tertiary"]

const SPECTRUM_FILL_CLASS: Record<SpectrumTone, string> = {
  primary: "bg-[var(--md3e-primary,var(--primary))]",
  secondary: "bg-[var(--md3e-secondary,var(--secondary))]",
  tertiary: "bg-[var(--md3e-tertiary,var(--accent))]",
}

const SPECTRUM_MARKER_CLASS: Record<SpectrumTone, string> = {
  primary: "bg-[var(--md3e-on-primary,var(--primary-foreground))]",
  secondary: "bg-[var(--md3e-on-secondary,var(--secondary-foreground))]",
  tertiary: "bg-[var(--md3e-on-tertiary,var(--accent-foreground))]",
}

function bitrateThresholdFor(level: string): number {
  const match = /([\d.]+)\s*Mbps/i.exec(level)
  if (!match) return Number.POSITIVE_INFINITY
  const value = Number(match[1])
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

function buildSpectrumBands(videos: readonly BitvVideoInfo[]): SpectrumBand[] {
  const grouped = new Map<string, BitvVideoInfo[]>()
  for (const video of videos) {
    const items = grouped.get(video.bitrateLevel) ?? []
    items.push(video)
    grouped.set(video.bitrateLevel, items)
  }
  return [...grouped.entries()]
    .map(([level, items]) => ({
      level,
      videos: [...items].sort((a, b) => b.bitrateMbps - a.bitrateMbps),
      averageBitrate: items.reduce((total, video) => total + video.bitrateMbps, 0) / items.length,
      peakBitrate: Math.max(...items.map((video) => video.bitrateMbps)),
      tone: "primary" as SpectrumTone,
    }))
    .sort((a, b) => bitrateThresholdFor(a.level) - bitrateThresholdFor(b.level) || a.averageBitrate - b.averageBitrate)
    .map((band, index) => ({
      ...band,
      tone: SPECTRUM_TONES[index % SPECTRUM_TONES.length] ?? "primary",
    }))
}

function SpectrumTrack({ maxBitrate, tone, value }: { maxBitrate: number; tone: SpectrumTone; value: number }) {
  const pct = Math.max(4, Math.min(100, (value / Math.max(0.001, maxBitrate)) * 100))
  return (
    <div
      aria-label={`${value.toFixed(2)} Mbps`}
      aria-valuemax={Math.round(maxBitrate)}
      aria-valuemin={0}
      aria-valuenow={Math.round(value)}
      className="relative mt-1.5 h-4 min-w-0 overflow-hidden rounded-full bg-[var(--md3e-surface-highest,var(--muted))]"
      role="meter"
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--md3e-spring,cubic-bezier(0.34,1.56,0.64,1))]", SPECTRUM_FILL_CLASS[tone])}
        style={{ width: `${pct}%` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle,var(--md3e-on-surface,var(--foreground))_1px,transparent_1px)] [background-size:12px_100%]"
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 h-2.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--md3e-surface-lowest,var(--card))]",
          SPECTRUM_MARKER_CLASS[tone],
        )}
        style={{ left: `calc(${Math.min(pct, 97)}% )` }}
      />
    </div>
  )
}

function SpectrumVideoRow({ maxBitrate, tone, video }: { maxBitrate: number; tone: SpectrumTone; video: BitvVideoInfo }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-[inherit] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold text-foreground" title={video.path}>{video.filename}</span>
        <Md3eStatusPill compact label={`${video.bitrateMbps.toFixed(2)} Mbps`} tone={tone} />
      </div>
      <SpectrumTrack maxBitrate={maxBitrate} tone={tone} value={video.bitrateMbps} />
      <div className="flex min-w-0 items-center justify-between gap-2 font-mono text-[8px] text-muted-foreground">
        <span className="truncate">{video.resolution} · {video.fps.toFixed(0)}fps · {formatClock(video.durationSeconds)}</span>
        <span className="shrink-0 tabular-nums">{formatBytes(video.sizeBytes)}</span>
      </div>
    </div>
  )
}

function SpectrumBandSection({ band, maxBitrate }: { band: SpectrumBand; maxBitrate: number }) {
  return (
    <Md3ePatchBackdrop
      className="min-w-0 p-2"
      data-testid={`bitv-spectrum-band-${band.level}`}
      seed={`bitv-spectrum-${band.level}`}
      tone={band.tone}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Md3eShapeBadge active icon={Gauge} seed={`bitv-spectrum-badge-${band.level}`} size="sm" tone={band.tone} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] font-black text-foreground">{band.level}</div>
          <div className="truncate text-[9px] text-muted-foreground">{band.videos.length} 条 · 均值 {band.averageBitrate.toFixed(2)} Mbps</div>
        </div>
        <Md3eStatusPill compact label={`峰值 ${band.peakBitrate.toFixed(1)}`} tone={band.tone} />
      </div>
      <Md3eConnectedGroup className="mt-2" orientation="vertical">
        {band.videos.map((video) => (
          <SpectrumVideoRow key={video.path} maxBitrate={maxBitrate} tone={band.tone} video={video} />
        ))}
      </Md3eConnectedGroup>
    </Md3ePatchBackdrop>
  )
}

function BitvVideoSpectrum({ videos }: { videos: BitvVideoInfo[] }) {
  const bands = buildSpectrumBands(videos)
  const averageBitrate = videos.length ? videos.reduce((total, video) => total + video.bitrateMbps, 0) / videos.length : 0
  const peakBitrate = videos.length ? Math.max(...videos.map((video) => video.bitrateMbps)) : 0

  if (!videos.length) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 p-3 text-center" data-testid="bitv-spectrum">
        <Md3eShapeBadge icon={BarChart3} seed="bitv-spectrum-empty" size="lg" tone="primary" />
        <div className="text-[12px] font-black tracking-tight text-foreground">码率谱系待生成</div>
        <p className="max-w-[240px] text-[10px] leading-4 text-muted-foreground">执行「分析码率」后，这里会按分档显示每条视频的码率、时长与占比。</p>
        <Md3eStatusPill compact label="等待分析" tone="neutral" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col" data-testid="bitv-spectrum">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Md3eShapeBadge active icon={BarChart3} seed="bitv-spectrum-header" size="sm" tone="primary" />
          <div className="min-w-0">
            <div className="truncate text-[9px] font-bold tracking-[0.16em] text-foreground/55">BITRATE SPECTRUM</div>
            <div className="truncate text-[13px] font-black tracking-tight text-foreground">码率谱系</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Md3eStatusPill compact label={`${videos.length} 条`} tone="primary" />
          <Md3eStatusPill compact label={`均值 ${averageBitrate.toFixed(2)}`} tone="secondary" />
          <Md3eStatusPill compact label={`峰值 ${peakBitrate.toFixed(2)}`} tone="tertiary" />
        </div>
      </div>

      <div aria-label="码率分布" className="px-1 pb-2">
        <div className="flex h-3 min-w-0 gap-0.5 overflow-hidden rounded-full bg-[var(--md3e-surface-highest,var(--muted))]">
          {bands.map((band) => (
            <div
              className={cn("h-full min-w-[8px] first:rounded-l-full last:rounded-r-full", SPECTRUM_FILL_CLASS[band.tone])}
              key={band.level}
              style={{ flexGrow: band.videos.length }}
              title={`${band.level}：${band.videos.length} 条`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
          {bands.map((band) => (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--md3e-surface-high,var(--muted))] px-2 py-0.5" key={band.level}>
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", SPECTRUM_FILL_CLASS[band.tone])} />
              <span className="truncate font-mono text-[8px] font-bold text-foreground">{band.level}</span>
              <span className="font-mono text-[8px] tabular-nums text-muted-foreground">{band.videos.length}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col gap-2 p-1">
          {bands.map((band) => (
            <SpectrumBandSection band={band} key={band.level} maxBitrate={peakBitrate} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BitvPlanList({ operations }: { operations: BitvData["operations"] }) {
  if (!operations.length) {
    return (
      <ResultEmptyStage
        description="执行分析并生成分类计划后，按码率档位排列的复制/移动操作会出现在这里。"
        hint="等待计划"
        icon={Waypoints}
        seed="bitv-empty-plan"
        title="还没有分类计划"
      />
    )
  }
  return (
    <div className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
      <Md3eConnectedGroup className="w-full p-1" orientation="vertical">
        {operations.map((op) => (
          <div key={`${op.sourcePath}-${op.targetPath}`} className="flex min-w-0 flex-col gap-1 overflow-hidden rounded-[inherit] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2 text-[11px]">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Md3eShapeBadge icon={op.success ? FolderOutput : AlertTriangle} seed={`${op.sourcePath}-${op.targetPath}`} size="sm" tone={op.success ? "primary" : "error"} />
                <Md3eStatusPill compact label={op.dryRun ? "预演" : op.mode === "move" ? "移动" : "复制"} tone={op.success ? "primary" : "error"} />
              </div>
              <span className="truncate font-mono text-[9px] font-bold text-muted-foreground">{op.bitrateLevel}</span>
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground" title={op.sourcePath}>{op.sourcePath}</div>
            <div className="truncate font-mono font-bold text-foreground" title={op.targetPath}>→ {op.targetPath}</div>
            {op.error ? <div className="break-words text-destructive">{op.error}</div> : null}
          </div>
        ))}
      </Md3eConnectedGroup>
    </div>
  )
}

function TextResult({
  description,
  hint,
  icon,
  lines,
  title,
  tone,
}: {
  description: string
  hint: string
  icon: LucideIcon
  lines: string[]
  title: string
  tone?: "error"
}) {
  if (!lines.length) {
    return <ResultEmptyStage description={description} hint={hint} icon={icon} seed={`bitv-empty-${title}`} title={title} />
  }
  return (
    <div className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
      <pre className={cn("whitespace-pre-wrap break-words rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-2.5 font-mono text-[11px] leading-5", tone === "error" ? "text-destructive" : "text-muted-foreground")}>{lines.join("\n")}</pre>
    </div>
  )
}
