import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Clock, Copy, Gauge, HardDrive, Info, Infinity as InfinityIcon, RotateCcw, Settings2, Terminal, Trash2 } from "lucide-react"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { INTERVAL_PRESETS } from "./constants"
import type { RecycleuCardState, RecycleuStatusMeta } from "./types"

type NodeT = ReturnType<typeof useNodeI18n>["t"]

interface PatchProps {
  data: RecycleuCardState
  disabled?: boolean
  onPatch: (patch: Partial<RecycleuCardState>) => void
  t: NodeT
}

export function CleanupFields({ compact = false, data, disabled, onPatch, t }: PatchProps & {
  compact?: boolean
}) {
  return (
    <FieldGroup className={cn("grid gap-3", compact ? "grid-cols-2" : "@md/recycleu:grid-cols-2")}>
      <NumberField
        ariaLabel={t("fields.intervalAria", "清理间隔秒数")}
        description={t("fields.intervalDescription", "最短 5 秒")}
        disabled={disabled}
        icon={Clock}
        id="recycleu-interval"
        label={t("fields.interval", "清理间隔")}
        max={3600}
        min={5}
        suffix={t("units.secondsShort", "秒")}
        value={data.interval ?? 10}
        onChange={(interval) => onPatch({ interval })}
      />
      <NumberField
        ariaLabel={t("fields.cyclesAria", "最大循环次数")}
        description={data.maxCycles === 0
          ? t("fields.cyclesUnlimitedDescription", "持续运行，直到任务被取消")
          : t("fields.cyclesDescription", "设为 0 可无限循环")}
        disabled={disabled}
        icon={Gauge}
        id="recycleu-cycles"
        label={t("fields.cycles", "循环次数")}
        max={360}
        min={0}
        value={data.maxCycles ?? 360}
        zeroBadge={t("common.unlimited", "无限")}
        onChange={(maxCycles) => onPatch({ maxCycles })}
      />
      <DriveField
        disabled={disabled}
        t={t}
        value={data.driveLetter ?? ""}
        onChange={(driveLetter) => onPatch({ driveLetter })}
      />
    </FieldGroup>
  )
}

export function IntervalPresets({ disabled, value, t, onChange }: {
  disabled?: boolean
  value: number
  t: NodeT
  onChange: (value: number) => void
}) {
  return (
    <Field>
      <FieldLabel>{t("presets.label", "快速间隔")}</FieldLabel>
      <ToggleGroup
        aria-label={t("presets.aria", "清理间隔预设")}
        disabled={disabled}
        type="single"
        value={String(value)}
        variant="outline"
        onValueChange={(next) => {
          const parsed = Number(next)
          if (Number.isFinite(parsed) && parsed > 0) onChange(parsed)
        }}
      >
        {INTERVAL_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset} value={String(preset)}>
            {preset < 60 ? t("presets.seconds", "{{count}} 秒", { count: preset }) : t("presets.minute", "1 分钟")}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}

/**
 * 危险动作按钮：确认交给 ExecuteButton 的引信闸门，节点侧不再自带确认弹窗。
 * `title`/`description`/`cancelLabel`/`confirmLabel`/`variant` 保留在签名里，
 * 旧调用点因此不用改；闸门形态确定后它们不再参与渲染。
 */
export function ConfirmActionButton(props: {
  cancelLabel: string
  children?: ReactNode
  confirmLabel: string
  description: string
  disabled?: boolean
  icon: LucideIcon
  label: string
  size?: "sm" | "default" | "lg"
  title: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost"
  undoWindow?: number
  onConfirm: () => void
}) {
  const Icon = props.icon
  return (
    <ExecuteButton
      dangerous
      disabled={props.disabled}
      idleIcon={<Icon data-icon="inline-start" />}
      label={props.children ?? props.label}
      size={props.size ?? "sm"}
      undoWindow={props.undoWindow}
      onExecute={props.onConfirm}
    />
  )
}

export function IconConfirmButton(props: {
  cancelLabel: string
  confirmLabel: string
  description: string
  disabled?: boolean
  icon: LucideIcon
  label: string
  title: string
  destructive?: boolean
  undoWindow?: number
  onConfirm: () => void
}) {
  const Icon = props.icon
  // ExecuteButton 不是 TooltipTrigger 可挂载的可聚焦节点，图标态只用 aria-label 命名。
  return (
    <ExecuteButton
      compact
      dangerous
      disabled={props.disabled}
      idleIcon={<Icon />}
      label={props.label}
      undoWindow={props.undoWindow}
      onExecute={props.onConfirm}
    />
  )
}

export function SettingsPopover({ data, disabled, onPatch, t }: PatchProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={t("actions.command", "操作和参数")} size="icon-sm" variant="outline">
              <Settings2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("actions.settings", "清理参数")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,440px)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t("settings.title", "清理参数")}</div>
            <p className="text-xs text-muted-foreground">{t("settings.description", "调整目标盘符、间隔和循环上限；0 次表示无限循环。")}</p>
          </div>
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-4">
          <CleanupFields data={data} disabled={disabled} onPatch={onPatch} t={t} />
          <IntervalPresets disabled={disabled} value={data.interval ?? 10} t={t} onChange={(interval) => onPatch({ interval })} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TimerDial(props: {
  cleanCount: number
  compact?: boolean
  interval: number
  maxCycles: number
  progress: number
  remainingSeconds: number
  running: boolean
  status: RecycleuStatusMeta
  t: NodeT
}) {
  const progress = Math.max(0, Math.min(100, props.progress))
  const unlimited = props.maxCycles === 0
  return (
    <div className="relative grid shrink-0 place-items-center">
      <AnimatedCircularProgressBar
        ariaLabel={props.t("dial.aria", "清理周期进度")}
        className={cn(props.compact ? "size-28 text-base" : "size-52 text-xl")}
        gaugePrimaryColor="var(--primary)"
        gaugeSecondaryColor="var(--muted)"
        value={progress}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          {props.running ? (
            <div className={cn("font-semibold tabular-nums", props.compact ? "text-xl" : "text-4xl")}>
              {props.remainingSeconds}{props.t("units.secondsShort", "秒")}
            </div>
          ) : (
            <Trash2 className={cn("text-muted-foreground", props.compact ? "size-6" : "size-10")} />
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {unlimited && <InfinityIcon className="size-3.5" />}
            <span>{unlimited ? props.t("dial.unlimited", "无限循环") : props.t("dial.cycleLimit", "上限 {{count}} 次", { count: props.maxCycles })}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">{props.t("dial.cleaned", "已清理 {{count}} 次", { count: props.cleanCount })}</div>
        </div>
      </AnimatedCircularProgressBar>
      {props.status.tone === "running" && <span className="pointer-events-none absolute inset-2 rounded-full ring-2 ring-primary/30 animate-pulse" />}
    </div>
  )
}

export function StatusStrip({ compact = false, progress, status, text, unlimited, t }: {
  compact?: boolean
  progress: number
  status: RecycleuStatusMeta
  text?: string
  unlimited: boolean
  t: NodeT
}) {
  return (
    <Card className={cn("gap-0 py-0", compact && "rounded-lg")}>
      <CardContent className={cn("grid gap-2 p-3", compact && "p-2")}>
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="shrink-0" variant={status.badgeVariant}>{status.label}</Badge>
          {unlimited && <Badge className="shrink-0" variant="secondary"><InfinityIcon />{t("common.unlimited", "无限")}</Badge>}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{text || status.detail}</span>
        </div>
        {status.tone === "running" && <Progress aria-label={t("status.progressAria", "当前周期进度")} value={progress} />}
      </CardContent>
    </Card>
  )
}

export function LogPanel({ compact = false, logs, t, onCopyLogs, onReset }: {
  compact?: boolean
  logs: string[]
  t: NodeT
  onCopyLogs: () => void
  onReset: () => void
}) {
  return (
    <Card className="h-full min-h-0 gap-0 py-0" data-testid="recycleu-history-panel">
      <CardHeader className="border-b px-3 py-3 !pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Terminal />{t("history.title", "运行日志")}</CardTitle>
        <CardDescription className="text-xs">{t("history.description", "倒计时、清理结果与错误按运行顺序记录。")}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button aria-label={t("actions.copy", "复制")} disabled={!logs.length} size="icon-sm" variant="outline" onClick={onCopyLogs}><Copy /></Button>
          <Button aria-label={t("actions.reset", "重置")} size="icon-sm" variant="ghost" onClick={onReset}><RotateCcw /></Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className={cn("h-full min-h-0", compact && "max-h-32")}>
          {logs.length ? (
            <ItemGroup className="gap-1 p-2">
              {logs.map((line, index) => (
                <Item key={`${index}-${line}`} size="sm" variant="muted">
                  <ItemMedia variant="icon"><Terminal /></ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="break-all font-mono text-xs">{line}</ItemTitle>
                    <ItemDescription className="text-[10px]">{t("history.sequence", "记录 #{{count}}", { count: String(index + 1).padStart(3, "0") })}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <Empty className="h-full min-h-36 border-0 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Terminal /></EmptyMedia>
                <EmptyTitle className="text-sm">{t("history.emptyTitle", "暂无日志")}</EmptyTitle>
                <EmptyDescription className="text-xs">{t("history.emptyDescription", "启动后会显示倒计时、清理结果和错误。")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function NumberField(props: {
  ariaLabel: string
  description: string
  disabled?: boolean
  icon: LucideIcon
  id: string
  label: string
  max: number
  min: number
  suffix?: string
  value: number
  zeroBadge?: string
  onChange: (value: number) => void
}) {
  const Icon = props.icon
  return (
    <Field>
      <FieldLabel className="flex items-center gap-1.5" htmlFor={props.id}>
        <Icon className="size-3.5" />
        {props.label}
        {props.value === 0 && props.zeroBadge && <Badge variant="secondary"><InfinityIcon />{props.zeroBadge}</Badge>}
      </FieldLabel>
      <Input
        id={props.id}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        type="number"
        value={props.value}
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          if (Number.isFinite(value)) props.onChange(Math.max(props.min, Math.min(props.max, Math.floor(value))))
        }}
      />
      <FieldDescription>{props.description}{props.suffix ? ` · ${props.suffix}` : ""}</FieldDescription>
    </Field>
  )
}

function DriveField(props: {
  disabled?: boolean
  t: NodeT
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field className="col-span-2 @md/recycleu:col-span-1">
      <FieldLabel className="flex items-center gap-1.5" htmlFor="recycleu-drive"><HardDrive className="size-3.5" />{props.t("fields.drive", "目标盘符")}</FieldLabel>
      <Input
        id="recycleu-drive"
        aria-label={props.t("fields.driveAria", "盘符")}
        disabled={props.disabled}
        maxLength={2}
        placeholder={props.t("fields.allDrives", "全部")}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value.toUpperCase().replace(/[^A-Z:]/g, "").slice(0, 2))}
      />
      <FieldDescription>{props.value ? props.t("fields.driveSelected", "仅清理 {{drive}} 盘", { drive: props.value.replace(":", "") }) : props.t("fields.driveDescription", "留空表示所有回收站")}</FieldDescription>
    </Field>
  )
}
