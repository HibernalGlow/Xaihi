import type { RecycleuInput } from "@xiranite/node-recycleu/core"
import { Activity, Gauge, HardDrive, Infinity as InfinityIcon, Play, RotateCcw, ShieldCheck, Square, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eExpressiveHero,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eShapePreviewGlyph,
  Md3eStatusPill,
  Md3eTonalZone,
  Md3eWavyProgress,
  useMd3eShapeContext,
} from "@/nodes/shared/controls"
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { CleanupFields, ConfirmActionButton, IntervalPresets, LogPanel, SettingsPopover } from "./controls"
import type { RecycleuCardState, RecycleuStatusMeta } from "./types"

export interface RecycleuMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
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

export function RecycleuMd3eView(props: RecycleuMd3eViewProps) {
  const target = props.driveLetter ? `${props.driveLetter}:` : props.t("fields.allDrives", "全部")
  const cancelLabel = props.t("actions.cancel", "取消")

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="recycleu"
        surface={props.surface}
        testId="recycleu-surface"
        icon={Trash2}
        title="Recycleu"
        badgeText={props.status.label}
        statusText={`${target} · ${props.interval} 秒 · 已清理 ${props.cleanCount} 次`}
        progress={props.progress}
        running={props.running}
        action={
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
        }
      />
    )
  }

  const stats = [
    { label: props.t("metrics.target", "清理范围"), value: target, tone: "primary" as const, icon: HardDrive },
    { label: props.t("metrics.interval", "执行间隔"), value: `${props.interval}s`, tone: "secondary" as const, icon: Gauge },
    { label: props.t("metrics.cycles", "循环上限"), value: props.maxCycles === 0 ? "∞" : props.maxCycles, tone: "tertiary" as const, icon: Activity },
    { label: "已清理", value: props.cleanCount, tone: "danger" as const, icon: Trash2 },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "secondary"
          : "neutral"

  return (
    <Md3eNodeSurface
      nodeId="recycleu"
      surface={props.surface}
      data-testid="recycleu-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Trash2}
          title="Recycleu"
          domainTag="RECYCLE BIN PULSE"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${target} 盘符 · 每 ${props.interval} 秒 · ${props.maxCycles === 0 ? "无限循环" : `${props.maxCycles} 次上限`}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          actions={
            <>
              <SettingsPopover
                data={props.data}
                disabled={props.running}
                onPatch={props.onPatch}
                t={props.t}
              />
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
              <ActionIconButton
                shapeRole="accent"
                disabled={props.running}
                icon={RotateCcw}
                label={props.t("actions.reset", "重置")}
                onClick={props.onReset}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/recycleu:grid-cols-[minmax(260px,0.95fr)_minmax(0,1.45fr)]">
        <div
          data-testid="recycleu-config-panel"
          className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
        >
          <Md3eTonalZone
            tone="primary"
            eyebrow="PULSE DIAL"
            title={props.t("monitor.title", "清理监控拨盘")}
            testId="recycleu-monitor-panel"
          >
            <RecycleuPulseDial
              cleanCount={props.cleanCount}
              interval={props.interval}
              maxCycles={props.maxCycles}
              progress={props.progress}
              remainingSeconds={props.remainingSeconds}
              running={props.running}
              status={props.status}
              t={props.t}
            />
          </Md3eTonalZone>

          <Md3eTonalZone
            tone="secondary"
            eyebrow="CYCLE PARAMETERS"
            title={props.t("controls.title", "清理控制")}
          >
            <div className="flex flex-col gap-2.5">
              <CleanupFields
                data={props.data}
                disabled={props.running}
                onPatch={props.onPatch}
                t={props.t}
              />
              <IntervalPresets
                disabled={props.running}
                value={props.interval}
                t={props.t}
                onChange={(interval) => props.onPatch({ interval })}
              />
            </div>
          </Md3eTonalZone>

          <Md3eTonalZone
            className="hidden @md/recycleu:flex"
            tone="tertiary"
            eyebrow="SHAPE LANGUAGE"
            title="按钮形状策略"
            badge={<Md3eStatusPill label="节点级" tone="tertiary" compact />}
          >
            <Md3eNodeShapePolicyPanel nodeId="recycleu" compact />
          </Md3eTonalZone>
        </div>

        <Md3eTonalZone
          tone="default"
          eyebrow="PULSE TELEMETRY"
          title="回收站周期日志流"
          bodyClassName="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
            <LogPanel
              logs={props.logs}
              t={props.t}
              onCopyLogs={props.onCopyLogs}
              onReset={props.onReset}
            />
          </div>
        </Md3eTonalZone>
      </div>

      <Md3eCommandDock
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Md3eStatusPill
              label={props.maxCycles === 0 ? "无限循环模式" : `最多 ${props.maxCycles} 轮`}
              tone={props.maxCycles === 0 ? "danger" : "secondary"}
            />
            <span className="truncate text-xs text-muted-foreground">
              上次清理：{props.lastCleanTime ?? props.t("common.none", "暂无")}
            </span>
          </div>
        }
        trailing={
          props.running ? (
            <Button
              aria-label={props.t("actions.stop", "停止自动清理")}
              disabled={!props.canCancel || props.cancelling}
              size="sm"
              variant="destructive"
              className="rounded-full"
              onClick={props.onCancel}
            >
              <Square />
              {props.cancelling ? props.t("actions.stopping", "正在停止") : props.t("actions.stop", "停止自动清理")}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <ConfirmActionButton
                cancelLabel={cancelLabel}
                confirmLabel={props.t("actions.confirmStart", "确认启动")}
                description={`每 ${props.interval} 秒清理 ${target}`}
                disabled={props.running}
                icon={Play}
                label={props.t("actions.start", "启动")}
                title={props.t("actions.startTitle", "启动自动清理？")}
                onConfirm={() => props.onExecute("start")}
              />
              <ConfirmActionButton
                cancelLabel={cancelLabel}
                confirmLabel={props.t("actions.confirmClean", "确认清理")}
                description={`将立即清空 ${target} 的回收站内容。`}
                disabled={props.running}
                icon={Trash2}
                label={props.t("actions.cleanNow", "立即清理")}
                title={props.t("actions.cleanTitle", "立即清空回收站？")}
                variant="destructive"
                onConfirm={() => props.onExecute("clean_now")}
              />
              <Button
                aria-label={props.t("actions.status", "状态")}
                disabled={props.running}
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => props.onExecute("status")}
              >
                <ShieldCheck />
                {props.t("actions.checkStatus", "检查状态")}
              </Button>
            </div>
          )
        }
      />
    </Md3eNodeSurface>
  )
}

function RecycleuPulseDial({ cleanCount, interval, maxCycles, progress, remainingSeconds, running, status, t }: {
  cleanCount: number
  interval: number
  maxCycles: number
  progress: number
  remainingSeconds: number
  running: boolean
  status: RecycleuStatusMeta
  t: RecycleuMd3eViewProps["t"]
}) {
  const shapeContext = useMd3eShapeContext()
  const shapeId = shapeContext?.activeRoleShapes.primary ?? "cookie-8"
  const value = Math.max(0, Math.min(100, progress))
  const radius = 43
  const circumference = 2 * Math.PI * radius
  const activeLength = circumference * value / 100

  return (
    <div data-recycleu-md3e-dial data-md3e-recycleu-shape={shapeId} className="grid min-w-0 shrink-0 place-items-center py-1">
      <div className="relative grid size-36 place-items-center @sm/recycleu:size-44 @lg/recycleu:size-52">
        <Md3eShapePreviewGlyph
          shapeId={shapeId}
          className="pointer-events-none absolute inset-0 size-full fill-[var(--md3e-primary-container,var(--secondary))] opacity-90"
        />
        <div className="absolute inset-[13%] rounded-full bg-[var(--md3e-surface-lowest,var(--card))]/90 shadow-[0_10px_28px_color-mix(in_oklab,var(--md3e-primary,var(--primary))_18%,transparent)]" />
        <svg
          aria-label={t("dial.aria", "清理周期进度")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          className="absolute inset-[13%] size-[74%] -rotate-90 overflow-visible"
          role="progressbar"
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--md3e-surface-high,var(--muted))" strokeWidth="11" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--md3e-primary,var(--primary))"
            strokeDasharray={`${activeLength} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="11"
            data-progress-arc
          />
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
            const inner = 34
            const outer = index % 3 === 0 ? 39 : 37
            return (
              <line
                key={index}
                x1={50 + Math.cos(angle) * inner}
                y1={50 + Math.sin(angle) * inner}
                x2={50 + Math.cos(angle) * outer}
                y2={50 + Math.sin(angle) * outer}
                stroke="var(--md3e-on-surface-variant,var(--muted-foreground))"
                strokeWidth={index % 3 === 0 ? 1.5 : 1}
                strokeLinecap="round"
                opacity={index % 3 === 0 ? 0.78 : 0.42}
              />
            )
          })}
        </svg>
        <div className="relative z-10 flex min-w-0 max-w-[72%] flex-col items-center gap-0.5 text-center">
          {running ? (
            <span className="text-2xl font-black tabular-nums leading-none">{remainingSeconds}<span className="ml-0.5 text-xs font-bold">{t("units.secondsShort", "秒")}</span></span>
          ) : (
            <Trash2 aria-hidden="true" className="size-7 text-[var(--md3e-primary,var(--primary))]" />
          )}
          <span className="max-w-full truncate text-[10px] font-bold text-muted-foreground">{status.label}</span>
        </div>
      </div>
      <Md3eWavyProgress
        className="mt-2 max-w-[15rem]"
        label={t("dial.aria", "清理周期进度")}
        value={value}
      />
      <div className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <Md3eStatusPill
          label={maxCycles === 0 ? t("common.unlimited", "无限") : t("dial.cycleLimit", "上限 {{count}} 次", { count: maxCycles })}
          tone={maxCycles === 0 ? "danger" : "secondary"}
          icon={maxCycles === 0 ? InfinityIcon : undefined}
        />
        <span>{t("dial.cleaned", "已清理 {{count}} 次", { count: cleanCount })}</span>
        <span aria-hidden="true">·</span>
        <span>{interval}{t("units.secondsShort", "秒")}</span>
      </div>
    </div>
  )
}
