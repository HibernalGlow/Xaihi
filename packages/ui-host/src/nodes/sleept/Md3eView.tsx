import type { PowerMode, SleeptData } from "@xiranite/node-sleept/core"
import { formatDuration } from "@xiranite/node-sleept/duration"
import { Clock, Copy, Play, RotateCcw, ShieldAlert, Sparkles } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { POWER_MODES, TIMER_MODES } from "./constants"
import { AdvancedOptionsPopover, StatsIconButton, TimerSettings } from "./controls"
import type { SleeptCardState, SleeptPhase, SleeptStats, SleeptStatusMeta, SleeptTimerMode } from "./types"

export interface SleeptMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: SleeptCardState
  defaults?: Partial<SleeptCardState>
  dryrun: boolean
  durationSec: number
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
}

export function SleeptMd3eView(props: SleeptMd3eViewProps) {
  const undoWindowMs = useWorkspaceStore((state) => state.executeUndoWindowMs)
  const label = props.dryrun ? "开始演练" : "开始执行"
  const timerLabel = TIMER_MODES.find((item) => item.value === props.timerMode)?.label ?? "倒计时"
  const powerLabel = POWER_MODES.find((item) => item.value === props.powerMode)?.label ?? "休眠"
  const monitoring = props.timerMode === "netspeed" || props.timerMode === "cpu"

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={!props.dryrun}
      running={props.running}
      compact={compact}
      label={label}
      idleIcon={props.dryrun ? <Play /> : <ShieldAlert />}
      undoWindow={Math.round((undoWindowMs ?? 1000) * 1.5)}
      onExecute={() => props.onExecute()}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="sleept"
        surface={props.surface}
        testId="sleept-md3e-surface"
        collapsedTestId="sleept-collapsed-view"
        icon={Clock}
        title="Sleept"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${timerLabel} · ${powerLabel} · ${props.dryrun ? "演练" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const telemetry = [
    { label: "模式", value: timerLabel, tone: "primary" as const },
    { label: "时长", value: formatDuration(props.durationSec), tone: "secondary" as const },
    { label: "CPU", value: `${props.stats.cpu.toFixed(1)}%`, tone: "tertiary" as const },
    { label: "上行", value: `${props.stats.upload.toFixed(1)}`, tone: "neutral" as const },
    { label: "下行", value: `${props.stats.download.toFixed(1)}`, tone: "neutral" as const },
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
      nodeId="sleept"
      surface={props.surface}
      data-testid="sleept-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Clock}
          title="Sleept"
          domainTag="POWER CHRONO"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${timerLabel} / ${powerLabel} / ${props.dryrun ? "演练" : "真实执行"}`
          }
          progress={props.progress}
          running={props.running}
          stats={telemetry}
          toolbarTestId="sleept-header-toolbar"
          actions={
            <>
              <StatsIconButton disabled={props.running} onClick={props.onRefreshStats} />
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.logs.length}
                icon={Copy}
                label="复制日志"
                onClick={props.onCopyLogs}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label="清空状态"
                onClick={props.onReset}
              />
              <NodeConfigButton
                nodeKey="sleept"
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

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "sleept-portrait-view"
              : "sleept-compact-view"
            : "sleept-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/sleept:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.38fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="TRIGGER & POWER"
              title="触发序列与电源操作"
              badge={<Md3eStatusPill tone="primary">{powerLabel}</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="Sleept 计时模式"
                  options={TIMER_MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
                  value={props.timerMode}
                  disabled={props.running}
                  onChange={props.onTimerModeChange}
                />
                <Md3eChoiceChips
                  ariaLabel="Sleept 电源模式"
                  options={POWER_MODES.map((p) => ({ value: p.value, label: p.label, icon: p.icon }))}
                  value={props.powerMode}
                  disabled={props.running}
                  onChange={props.onPowerModeChange}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="CHRONO THRESHOLDS"
              title="时间与监控阈值"
            >
              <TimerSettings
                compact={props.compactSurface}
                data={props.data}
                disabled={props.running}
                onPatch={props.onPatch}
              />
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              <Md3eSwitchRow
                icon={props.dryrun ? ShieldAlert : Sparkles}
                label="演练模式 (Dry-Run)"
                description="仅倒计时或监控触发而不真正执行休眠/关机"
                checked={props.dryrun}
                disabled={props.running}
                onCheckedChange={(dryrun) => props.onPatch({ dryrun })}
              />
            </Md3eConnectedGroup>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="STANDBY DIAL & TELEMETRY"
            title="系统待命拨盘与日志"
            bodyClassName="flex min-h-0 flex-col gap-2.5 overflow-hidden"
          >
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-[22px] bg-[var(--md3e-surface-lowest,var(--muted))]/75 py-3 text-center">
              <AnimatedCircularProgressBar
                ariaLabel="Sleept countdown progress"
                value={props.progress}
                className="size-36 text-xl"
              >
                <span className="font-mono text-lg font-black tabular-nums">
                  {monitoring ? "MONITOR" : formatDuration(props.durationSec)}
                </span>
              </AnimatedCircularProgressBar>
              <span className="text-[11px] text-muted-foreground">
                {monitoring ? "持续监控 CPU / 网速阈值" : "待命倒计时"}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <ScrollArea className="h-full">
                <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
                  {props.logs.length ? props.logs.join("\n") : "运行日志会显示在这里。"}
                </pre>
              </ScrollArea>
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryrun ? "secondary" : "danger"}>
                {props.dryrun ? "DRY-RUN 演练" : `LIVE ${powerLabel}`}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                CPU {props.stats.cpu.toFixed(1)}% · ↑{props.stats.upload.toFixed(1)} · ↓{props.stats.download.toFixed(1)} KB/s
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
