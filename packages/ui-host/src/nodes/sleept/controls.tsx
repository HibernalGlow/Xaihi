import type { LucideIcon } from "lucide-react"
import { Activity, DatabaseZap, Info, Settings2, ShieldAlert } from "lucide-react"
import type { NetTriggerMode, PowerMode } from "@xiranite/node-sleept/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { NET_TRIGGER_MODES, POWER_MODES, TIMER_MODES } from "./constants"
import type { SleeptCardState, SleeptStatusMeta, SleeptTimerMode } from "./types"

export function ActionIconButton(props: {
  active?: boolean
  destructive?: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={props.label}
          disabled={props.disabled}
          size="icon-sm"
          variant={props.destructive ? "destructive" : props.active ? "secondary" : "outline"}
          onClick={props.onClick}
        >
          <Icon />
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

export function TimerModePicker(props: {
  compact?: boolean
  disabled?: boolean
  mode: SleeptTimerMode
  onModeChange: (mode: SleeptTimerMode) => void
}) {
  return (
    <ToggleGroup
      aria-label="触发模式"
      className="grid w-full grid-cols-4"
      disabled={props.disabled}
      type="single"
      value={props.mode}
      variant="outline"
      onValueChange={(value) => { if (value) props.onModeChange(value as SleeptTimerMode) }}
      data-testid="sleept-timer-modes"
    >
      {TIMER_MODES.map((item) => <ToggleGroupItem key={item.value} className="min-w-0" value={item.value}><item.icon data-icon="inline-start" /><span className="truncate">{props.compact ? item.shortLabel : item.label}</span></ToggleGroupItem>)}
    </ToggleGroup>
  )
}

export function PowerModePicker(props: {
  disabled?: boolean
  mode: PowerMode
  onModeChange: (mode: PowerMode) => void
}) {
  return (
    <Tabs value={props.mode} onValueChange={(value) => props.onModeChange(value as PowerMode)} className="w-full" data-testid="sleept-power-modes">
      <TabsList aria-label="电源动作" variant="line" className="grid h-auto w-full grid-cols-2 @sm/sleept:grid-cols-3">
        {POWER_MODES.map((item) => <TabsTrigger key={item.value} disabled={props.disabled} value={item.value}><item.icon /><span className="truncate">{item.shortLabel}</span></TabsTrigger>)}
      </TabsList>
    </Tabs>
  )
}

export function TimerSettings(props: {
  compact?: boolean
  data: SleeptCardState
  disabled?: boolean
  onPatch: (patch: Partial<SleeptCardState>) => void
}) {
  if (props.data.timerMode === "specific_time") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="sleept-target-datetime" className="text-xs">目标时间</Label>
        <Input
          id="sleept-target-datetime"
          aria-label="sleept target datetime"
          disabled={props.disabled}
          className="font-mono text-xs"
          placeholder="YYYY-MM-DD HH:MM:SS"
          value={props.data.targetDatetime ?? ""}
          onChange={(event) => props.onPatch({ targetDatetime: event.currentTarget.value })}
        />
      </div>
    )
  }

  if (props.data.timerMode === "netspeed") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="上传阈值(KB/s)" value={props.data.uploadThreshold ?? 242} min={0} disabled={props.disabled} onChange={(uploadThreshold) => props.onPatch({ uploadThreshold })} />
        <NumberField label="下载阈值(KB/s)" value={props.data.downloadThreshold ?? 242} min={0} disabled={props.disabled} onChange={(downloadThreshold) => props.onPatch({ downloadThreshold })} />
        <NumberField label="持续(分钟)" value={props.data.netDuration ?? 2} min={0.5} step={0.5} disabled={props.disabled} onChange={(netDuration) => props.onPatch({ netDuration })} />
        <TriggerModeField value={props.data.netTriggerMode ?? "both"} disabled={props.disabled} onChange={(netTriggerMode) => props.onPatch({ netTriggerMode })} />
      </div>
    )
  }

  if (props.data.timerMode === "cpu") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="CPU 阈值(%)" value={props.data.cpuThreshold ?? 10} min={1} max={100} disabled={props.disabled} onChange={(cpuThreshold) => props.onPatch({ cpuThreshold })} />
        <NumberField label="持续(分钟)" value={props.data.cpuDuration ?? 2} min={0.5} step={0.5} disabled={props.disabled} onChange={(cpuDuration) => props.onPatch({ cpuDuration })} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="sleept-countdown-fields">
      <NumberField label="时" value={props.data.hours ?? 0} min={0} max={23} disabled={props.disabled} onChange={(hours) => props.onPatch({ hours })} />
      <NumberField label="分" value={props.data.minutes ?? 0} min={0} max={59} disabled={props.disabled} onChange={(minutes) => props.onPatch({ minutes })} />
      <NumberField label="秒" value={props.data.seconds ?? 5} min={0} max={59} disabled={props.disabled} onChange={(seconds) => props.onPatch({ seconds })} />
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: SleeptCardState
  disabled?: boolean
  onPatch: (patch: Partial<SleeptCardState>) => void
}) {
  return (
    <div
      className={cn("grid gap-2", props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]")}
      data-testid="sleept-key-switches"
    >
      <SwitchRow
        checked={props.data.dryrun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="演练模式"
        description="开启时只模拟电源操作，不真正休眠/关机/重启。关闭后会真实执行系统电源动作。"
        onCheckedChange={(dryrun) => props.onPatch({ dryrun })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: SleeptCardState
  disabled?: boolean
  onPatch: (patch: Partial<SleeptCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="sleept advanced options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Settings2 />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">监控类模式的最多等待秒数；设为 0 时持续监控，直到手动取消。</p>
        </div>
        <NumberField
          label="最大等待(秒，0=无限)"
          value={props.data.maxWaitSeconds ?? 3600}
          min={0}
          disabled={props.disabled}
          onChange={(maxWaitSeconds) => props.onPatch({ maxWaitSeconds })}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<SleeptCardState>
  disabled?: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="sleept defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">默认配置</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>默认配置</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">默认配置</div>
          <p className="text-xs text-muted-foreground">保存 Sleept 的计时模式、电源操作和阈值到明文配置。</p>
        </div>
        <div className="grid gap-2">
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>保存为默认</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>恢复默认</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>清除覆盖</Button>
          <Separator />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">查看配置</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Sleept 配置</DialogTitle>
                <DialogDescription>当前 nodes.sleept 默认值和配置文件位置。</DialogDescription>
              </DialogHeader>
              <ConfigPreview config={props.defaults} path={props.configFilePath} />
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>打开文件</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: SleeptStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-md border bg-background/70 p-2", props.compact && "p-1.5")}>
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-xs font-medium">{props.text || props.status.description}</div>
        <Badge variant={props.status.badgeVariant} className="shrink-0">{props.status.label}</Badge>
      </div>
      <Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} />
    </div>
  )
}

export function SwitchRow(props: {
  checked: boolean
  description?: string
  disabled?: boolean
  icon?: LucideIcon
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  const Icon = props.icon
  return (
    <div className="flex min-w-0 items-center justify-between gap-1.5 rounded-md border bg-background/60 px-2 py-1.5">
      <label className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-xs font-medium">{props.label}</span>
        </span>
        <Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      </label>
      {props.description && <InfoHint label={props.label} description={props.description} />}
    </div>
  )
}

export function StatsIconButton(props: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label="刷新状态" disabled={props.disabled} size="icon-sm" variant="outline" onClick={props.onClick}>
          <Activity />
          <span className="sr-only">刷新状态</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>刷新 CPU 与网速</TooltipContent>
    </Tooltip>
  )
}

function ConfigPreview(props: {
  config?: Partial<SleeptCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.sleept 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
  return (
    <div className="grid gap-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">配置文件</div>
        <div className="mt-1 break-all font-mono text-xs">{props.path ?? "未连接本地配置服务"}</div>
      </div>
      <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5">
        {content}
      </pre>
    </div>
  )
}

function InfoHint({ description, label }: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${label}说明`}
          className="inline-grid size-5 shrink-0 cursor-help place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          role="img"
          tabIndex={0}
        >
          <Info className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  )
}

function NumberField(props: {
  disabled?: boolean
  label: string
  max?: number
  min?: number
  onChange: (value: number) => void
  step?: number
  value: number
}) {
  const id = `sleept-${props.label}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        aria-label={`sleept ${props.label}`}
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        step={props.step}
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

function TriggerModeField(props: {
  disabled?: boolean
  value: NetTriggerMode
  onChange: (value: NetTriggerMode) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs">触发条件</Label>
      <div className="grid grid-cols-2 gap-1">
        {NET_TRIGGER_MODES.map((item) => (
          <Button
            key={item.value}
            aria-label={item.label}
            disabled={props.disabled}
            size="sm"
            variant={props.value === item.value ? "secondary" : "outline"}
            onClick={() => props.onChange(item.value)}
          >
            <span className="truncate text-xs">{item.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
