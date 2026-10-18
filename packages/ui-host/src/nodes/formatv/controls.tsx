import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, FolderTree, Hash, Info, Repeat, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  Md3eConnectedGroup,
  Md3eNodeShapePolicyPanel,
  Md3eShapeBadge,
  Md3eStatusPill,
  Md3eWavyProgress,
} from "@/nodes/shared/controls"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { DEFAULT_PREFIX_NAME } from "./constants"
import type { FormatvCardState, FormatvStatusMeta } from "./types"
import { tt } from "@/lib/i18nText"

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
          shapeRole={props.destructive ? "danger" : props.active ? "secondary" : "toolbar"}
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

export function PathInput(props: {
  compact?: boolean
  disabled?: boolean
  pathCount: number
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 rounded-[20px] bg-[var(--md3e-surface-high,var(--muted))]/65 p-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTree className="size-3.5 shrink-0 text-primary" />
          <Label htmlFor="formatv-paths" className="truncate text-xs font-extrabold tracking-tight">
            {tNode("pathsLabel", "视频目录")}
          </Label>
          <Md3eStatusPill
            label={tNode("pathsCount", "{{count}} 条", { count: props.pathCount })}
            tone={props.pathCount > 0 ? "primary" : "neutral"}
            compact
            dot={false}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ActionIconButton
            disabled={props.disabled}
            icon={Clipboard}
            label={tNode("buttons.pastePath", "粘贴路径")}
            onClick={props.onPaste}
          />
          <ActionIconButton
            disabled={props.disabled || !props.value}
            icon={Eraser}
            label={tNode("buttons.clearPath", "清空路径")}
            onClick={props.onClear}
          />
        </div>
      </div>
      <Textarea
        id="formatv-paths"
        aria-label="formatv paths"
        className={cn(
          "min-h-0 w-full resize-none rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] px-3 py-2 font-mono text-xs leading-relaxed",
          props.compact ? "h-14" : "h-20",
        )}
        disabled={props.disabled}
        placeholder={tt("module:formatv.pathsPlaceholder", "每行一个视频目录或文件路径")}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: FormatvCardState
  disabled?: boolean
  includePrefix?: boolean
  prefixValue?: string
  onPrefixChange?: (value: string) => void
  onPatch: (patch: Partial<FormatvCardState>) => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <Md3eConnectedGroup
      className="w-full"
      data-testid="formatv-key-switches"
    >
      {props.includePrefix && props.onPrefixChange ? (
        <PrefixField
          disabled={props.disabled}
          value={props.prefixValue ?? props.data.prefixName ?? DEFAULT_PREFIX_NAME}
          onChange={props.onPrefixChange}
        />
      ) : null}
      <SwitchRow
        checked={props.data.recursive ?? false}
        disabled={props.disabled}
        icon={FolderTree}
        label={tNode("switches.recursive", "递归")}
        description={tNode("switches.recursiveDesc", "递归扫描子目录内的视频文件。")}
        onCheckedChange={(recursive) => props.onPatch({ recursive })}
      />
      <SwitchRow
        checked={props.data.dryRun ?? false}
        disabled={props.disabled}
        icon={ShieldAlert}
        label={tNode("switches.dryRun", "预演")}
        description={tNode("switches.dryRunDesc", "开启后只生成重命名计划，不写入文件系统。关闭后执行真实重命名。")}
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
    </Md3eConnectedGroup>
  )
}

export function OptionsPopover(props: {
  data: FormatvCardState
  disabled?: boolean
  onPatch: (patch: Partial<FormatvCardState>) => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="formatv options" disabled={props.disabled} size="icon-sm" shapeRole="toolbar" variant="outline">
              <Repeat />
              <span className="sr-only">{tNode("options.title", "任务选项")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("options.title", "任务选项")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)] rounded-[24px] p-3.5">
        <div className="mb-3">
          <div className="text-sm font-bold tracking-tight">{tNode("options.title", "任务选项")}</div>
          <p className="text-xs text-muted-foreground">{tNode("options.description", "前缀名称和递归、预演开关集中在这里。")}</p>
        </div>
        <div className="grid gap-3">
          <PrimarySwitches
            includePrefix
            prefixValue={props.data.prefixName ?? DEFAULT_PREFIX_NAME}
            onPrefixChange={(prefixName) => props.onPatch({ prefixName })}
            data={props.data}
            disabled={props.disabled}
            onPatch={props.onPatch}
          />
          <Separator />
          <Md3eNodeShapePolicyPanel nodeId="formatv" compact />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<FormatvCardState>
  disabled?: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="formatv defaults" disabled={props.disabled} size="icon-sm" shapeRole="toolbar" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">{tNode("defaults.title", "默认配置")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("defaults.title", "默认配置")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 rounded-[24px] p-3.5">
        <div className="mb-3">
          <div className="text-sm font-bold tracking-tight">{tNode("defaults.title", "默认配置")}</div>
          <p className="text-xs text-muted-foreground">{tNode("defaults.description", "保存 FormatV 的路径、前缀和开关到明文配置。")}</p>
        </div>
        <div className="grid gap-2">
          <Md3eNodeShapePolicyPanel nodeId="formatv" compact />
          <Separator />
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>{tNode("buttons.saveDefault", "保存为默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>{tNode("buttons.restoreDefault", "恢复默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>{tNode("buttons.clearOverride", "清除覆盖")}</Button>
          <Separator />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">{tNode("buttons.viewConfig", "查看配置")}</Button>
            </DialogTrigger>
            <DialogContent className="rounded-[28px] sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{tNode("defaults.configTitle", "FormatV 配置")}</DialogTitle>
                <DialogDescription>{tNode("defaults.configDesc", "当前 nodes.formatv 默认值和配置文件位置。")}</DialogDescription>
              </DialogHeader>
              <ConfigPreview config={props.defaults} path={props.configFilePath} />
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>{tNode("buttons.openFile", "打开文件")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: FormatvStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-[18px] bg-[var(--md3e-surface-high,var(--muted))]/75 px-3 py-2", props.compact && "rounded-[14px] p-2")}>
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-xs font-bold">{props.text || props.status.description}</div>
        <Badge variant={props.status.badgeVariant} className="shrink-0 rounded-full">{props.status.label}</Badge>
      </div>
      {props.status.tone === "running" ? (
        <div className="space-y-1">
          <Md3eWavyProgress value={props.progress} running />
          <Progress value={props.progress} className="sr-only h-1.5" />
        </div>
      ) : (
        <Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} />
      )}
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
    <div className="flex min-w-0 items-center justify-between gap-2 bg-[var(--md3e-surface-high,var(--muted))]/75 px-3 py-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <Md3eShapeBadge
              icon={Icon}
              seed={`formatv-switch-${props.label}`}
              tone={props.checked ? "primary" : "neutral"}
              active={props.checked}
              size="sm"
            />
          ) : null}
          <span className="truncate text-xs font-bold">{props.label}</span>
        </span>
        <Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      </label>
      {props.description && <InfoHint label={props.label} description={props.description} />}
    </div>
  )
}

export function PrefixField(props: {
  disabled?: boolean
  value: string
  onChange: (value: string) => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 bg-[var(--md3e-surface-high,var(--muted))]/75 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Md3eShapeBadge icon={Hash} seed="formatv-prefix" tone="secondary" size="sm" />
        <Label htmlFor="formatv-prefix" className="truncate text-xs font-bold">
          {tNode("prefix.label", "前缀名称")}
        </Label>
      </div>
      <Input
        id="formatv-prefix"
        aria-label="formatv prefix name"
        disabled={props.disabled}
        className="h-8 w-28 shrink-0 rounded-full px-3 text-center font-mono text-xs font-bold"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function ConfigPreview(props: {
  config?: Partial<FormatvCardState>
  path?: string
}) {
  const { t: tNode } = useNodeI18n("formatv")
  const content = props.config === undefined
    ? `${tNode("defaults.noConfig", "# nodes.formatv 暂无默认配置")}\n`
    : JSON.stringify(props.config, null, 2)
  return (
    <div className="grid gap-3">
      <div className="rounded-[16px] border bg-muted/30 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{tNode("defaults.configFile", "配置文件")}</div>
        <div className="mt-1 break-all font-mono text-xs">{props.path ?? tNode("defaults.notConnected", "未连接本地配置服务")}</div>
      </div>
      <pre className="max-h-[45vh] overflow-auto rounded-[16px] border bg-muted/30 p-3 text-xs leading-5">
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
          className="inline-grid size-5 shrink-0 cursor-help place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
