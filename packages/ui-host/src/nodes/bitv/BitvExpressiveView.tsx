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
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3ePatchBackdrop,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
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
        className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2"
      >
        <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1">
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
        <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-[26px_18px_26px_18px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2">
          <Md3eStatusPill tone={dangerous ? "error" : props.status.tone}>{dangerous ? "LIVE" : "DRY-RUN"}</Md3eStatusPill>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{props.data.progressText || props.status.description}</span>
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
      </div>
    )
  }

  return (
    <div
      data-bitv-layout="desktop"
      data-bitv-role-shapes={roleShapes ? JSON.stringify(roleShapes) : undefined}
      data-testid="bitv-full-view"
      className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-2"
    >
      <FloatingWindowNodeHeader>{masthead}</FloatingWindowNodeHeader>
      <div
        data-testid="bitv-workbench-grid"
        className="grid min-h-0 min-w-0 flex-1 gap-2"
        style={{ gridTemplateColumns: "minmax(0, 0.94fr) minmax(0, 1.06fr)" }}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">{decks}</div>
        {results}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-[26px_18px_26px_18px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2">
        <Md3eStatusPill tone={dangerous ? "error" : props.status.tone}>{dangerous ? "LIVE" : "DRY-RUN"}</Md3eStatusPill>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{props.data.progressText || props.status.description}</span>
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
  return (
    <Md3ePatchBackdrop
      seed="bitv-expressive-masthead"
      tone="primary"
      active
      corner="lg"
      data-testid="bitv-expressive-masthead"
      className="shrink-0 overflow-hidden rounded-[32px_20px_32px_18px] px-3 py-2.5"
    >
      <div className="relative z-10 flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Md3eShapeBadge icon={meta.icon} shapeId={primaryShape} tone="primary" active size={compact ? "md" : "lg"} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h1 className={cn("truncate font-black leading-none tracking-[-0.04em] text-foreground", compact ? "text-xl" : "text-3xl")}>BitV</h1>
              {compact ? null : (
                <span className="rounded-full bg-[var(--md3e-surface,var(--card))]/60 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em] text-foreground/80">
                  BITRATE SPECTRUM
                </span>
              )}
              <Md3eStatusPill label={status.label} tone={status.tone} compact />
            </div>
            <p className={cn("mt-1 text-[11px] leading-snug text-foreground/75", compact ? "line-clamp-1" : "line-clamp-2")}>{progressText || meta.description}</p>
          </div>
          {compact ? null : (
            <div data-testid="bitv-header-toolbar" className="flex shrink-0 items-center gap-1">
              {actions}
            </div>
          )}
        </div>

        <div data-testid="bitv-stats-dashboard" className={cn("grid min-w-0 gap-1.5", compact ? "grid-cols-2" : "grid-cols-4", compact && !result && "hidden")}>
          {telemetryFor(result).map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col rounded-[14px_10px_14px_10px] bg-[var(--md3e-surface,var(--card))]/55 px-2 py-1">
              <span className="truncate text-[9px] font-bold tracking-wide text-foreground/65">{item.label}</span>
              <span className="truncate font-mono text-sm font-black tabular-nums text-foreground">{item.value}</span>
            </div>
          ))}
        </div>

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
}: {
  children: ReactNode
  className?: string
  eyebrow: string
  icon?: LucideIcon
  title: string
  tone: Tone
}) {
  const toneClass =
    tone === "primary"
      ? "bg-[var(--md3e-primary-container,var(--secondary))]/45"
      : tone === "secondary"
        ? "bg-[var(--md3e-secondary-container,var(--secondary))]/45"
        : "bg-[var(--md3e-surface-high,var(--muted))]"
  return (
    <section className={cn("flex min-w-0 shrink-0 flex-col overflow-hidden rounded-[28px_18px_28px_18px] p-3", toneClass, className)}>
      <div className="mb-2 flex min-w-0 items-center gap-2">
        {Icon ? <Md3eShapeBadge icon={Icon} size="sm" tone={tone === "secondary" ? "secondary" : "primary"} /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-bold tracking-[0.16em] text-foreground/55">{eyebrow}</div>
          <div className="truncate text-sm font-black tracking-tight text-foreground">{title}</div>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
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
  return (
    <ExpressiveDeck
      className={cn(
        "min-w-0",
        mode === "narrow" ? "h-[330px] min-h-[300px]" : mode === "tablet" ? "h-[320px] min-h-[300px] shrink-0" : "min-h-0 flex-1",
      )}
      eyebrow="SPECTRUM DECK"
      icon={BarChart3}
      title="结果与谱系"
      tone="plain"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
          <div aria-label="BitV 结果视图" className="flex min-w-0 flex-wrap items-center gap-1 rounded-[20px] bg-[var(--md3e-surface-lowest,var(--card))] p-1" role="tablist">
            {tabs.map((tab) => {
              const selected = tab.id === resultTab
              const Icon = tab.icon
              return (
                <button key={tab.id} aria-selected={selected} data-state={selected ? "active" : "inactive"} role="tab" style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }} className={cn("inline-flex min-w-0 items-center gap-1 px-2.5 py-1.5 text-[10px] leading-none transition-[background-color,border-radius,color] duration-250", selected ? "rounded-full bg-[var(--md3e-primary,var(--primary))] font-black text-[var(--md3e-on-primary,var(--primary-foreground))] shadow-xs" : "rounded-[10px] font-semibold text-muted-foreground hover:rounded-[16px] hover:text-foreground")} type="button" onClick={() => onResultTabChange(tab.id)}>
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.badge ? <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums", selected ? "bg-black/20 text-inherit" : "bg-[var(--md3e-surface-high,var(--muted))] text-foreground/75")}>{tab.badge}</span> : null}
                </button>
              )
            })}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <ActionIconButton disabled={!(result?.videos.length || result?.operations.length)} icon={Copy} label="复制结果" shapeRole="secondary" onClick={() => void onCopyResults()} />
            <ActionIconButton disabled={!logs.length} icon={Clipboard} label={tt("module:shared.ui.copyLog", "复制日志")} shapeRole="toolbar" onClick={() => void onCopyLogs()} />
          </div>
        </div>

        <div className="flex min-h-[220px] min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-[var(--md3e-surface-lowest,var(--card))]/75 p-2">
          {resultTab === "tree" ? (
            <BitvPathTree pathsText={pathsText} />
          ) : resultTab === "videos" ? (
            <BitvVideoList videos={result?.videos ?? []} />
          ) : resultTab === "plan" ? (
            <BitvPlanList operations={result?.operations ?? []} />
          ) : resultTab === "issues" ? (
            <TextResult empty="未发现问题。" lines={result?.errors ?? []} tone="error" />
          ) : resultTab === "logs" ? (
            <TextResult empty="运行事件会显示在这里。" lines={logs} />
          ) : (
            <ScrollArea className="h-full">
              <Md3eNodeShapePolicyPanel compact={mode === "narrow"} nodeId="bitv" />
            </ScrollArea>
          )}
        </div>
        {action === "status" ? <p className="truncate px-1 text-[9px] text-muted-foreground">环境检查不会修改文件。</p> : null}
      </div>
    </ExpressiveDeck>
  )
}

type TreeNode = { name: string; path: string; kind: "directory" | "video"; children: TreeNode[] }

function BitvPathTree({ pathsText }: { pathsText?: string }) {
  const roots = buildPathTree(pathsText)
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="bitv-path-tree">
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 px-1">
        <span className="truncate text-[10px] font-bold text-muted-foreground">{tt("module:bitv.analysisInput", "视频分析输入")}</span>
        <Md3eStatusPill compact tone="primary">{roots.length} 项</Md3eStatusPill>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 p-1">
          {roots.length ? roots.map((node) => <TreeRow key={node.path} node={node} />) : <div className="py-8 text-center text-[11px] text-muted-foreground">{tt("module:bitv.addedHere", "添加文件或目录后会显示在这里。")}</div>}
        </div>
      </ScrollArea>
    </div>
  )
}

function TreeRow({ depth = 0, node }: { depth?: number; node: TreeNode }) {
  const Icon = node.kind === "video" ? FileVideo : Folder
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] px-2 py-1 text-[11px]" style={{ marginLeft: `${Math.min(depth, 6) * 10}px` }}>
        <Icon className="size-3.5 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
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

function BitvVideoList({ videos }: { videos: BitvVideoInfo[] }) {
  const maxBitrate = Math.max(1, ...videos.map((video) => video.bitrateMbps))
  return (
    <ScrollArea className="h-full">
      {videos.length ? (
        <div className="flex min-w-0 flex-col gap-1.5 p-1">
          {videos.map((video) => (
            <div key={video.path} className="flex min-w-0 flex-col gap-1.5 rounded-[18px_12px_18px_12px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] font-bold" title={video.path}>{video.filename}</div>
                  <div className="truncate font-mono text-[9px] text-muted-foreground">{video.resolution} · {video.durationSeconds.toFixed(0)}s</div>
                </div>
                <Md3eStatusPill compact tone="secondary">{video.bitrateLevel}</Md3eStatusPill>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <div className="h-full rounded-full bg-[var(--md3e-primary,var(--primary))] transition-[width] duration-500" style={{ width: `${Math.max(6, (video.bitrateMbps / maxBitrate) * 100)}%` }} />
                </div>
                <span className="shrink-0 font-mono text-[10px] font-black tabular-nums text-foreground">{video.bitrateMbps.toFixed(2)} Mbps</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <BarChart3 className="size-5 opacity-50" />
          <span>执行分析后，这里会列出视频码率和分级。</span>
        </div>
      )}
    </ScrollArea>
  )
}

function BitvPlanList({ operations }: { operations: BitvData["operations"] }) {
  return (
    <ScrollArea className="h-full">
      {operations.length ? (
        <div className="flex min-w-0 flex-col gap-1.5 p-1">
          {operations.map((op) => (
            <div key={`${op.sourcePath}-${op.targetPath}`} className="flex min-w-0 flex-col gap-1 rounded-[18px_12px_18px_12px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-2 text-[11px]">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Md3eStatusPill compact tone={op.success ? "primary" : "error"}>{op.dryRun ? "预演" : op.mode === "move" ? "移动" : "复制"}</Md3eStatusPill>
                <span className="truncate font-mono text-[9px] font-bold text-muted-foreground">{op.bitrateLevel}</span>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground" title={op.sourcePath}>{op.sourcePath}</div>
              <div className="truncate font-mono font-bold text-foreground" title={op.targetPath}>→ {op.targetPath}</div>
              {op.error ? <div className="break-words text-destructive">{op.error}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-center text-[11px] text-muted-foreground">暂无分类计划</div>
      )}
    </ScrollArea>
  )
}

function TextResult({ empty, lines, tone }: { empty: string; lines: string[]; tone?: "error" }) {
  return (
    <ScrollArea className="h-full">
      {lines.length ? (
        <pre className={cn("whitespace-pre-wrap break-words rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-2.5 font-mono text-[11px] leading-5", tone === "error" ? "text-destructive" : "text-muted-foreground")}>{lines.join("\n")}</pre>
      ) : (
        <div className="flex h-40 items-center justify-center text-center text-[11px] text-muted-foreground">{empty}</div>
      )}
    </ScrollArea>
  )
}
