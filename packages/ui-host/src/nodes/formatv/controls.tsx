import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, FolderTree, Info, Repeat, ShieldAlert } from "lucide-react"
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
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { DEFAULT_PREFIX_NAME } from "./constants"
import type { FormatvCardState, FormatvStatusMeta } from "./types"

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
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="formatv-paths">{tNode("pathsLabel", "视频目录")}</Label>
          <Badge variant="outline" className="shrink-0">{tNode("pathsCount", "{{count}} 条", { count: props.pathCount })}</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="formatv-paths"
          aria-label="formatv paths"
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
          disabled={props.disabled}
          placeholder={"每行一个视频目录或文件路径"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label={tNode("buttons.pastePath", "粘贴路径")} onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label={tNode("buttons.clearPath", "清空路径")} onClick={props.onClear} />
        </div>
      </div>
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: FormatvCardState
  disabled?: boolean
  onPatch: (patch: Partial<FormatvCardState>) => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="formatv-key-switches"
    >
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
    </div>
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
            <Button aria-label="formatv options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Repeat />
              <span className="sr-only">{tNode("options.title", "任务选项")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("options.title", "任务选项")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("options.title", "任务选项")}</div>
          <p className="text-xs text-muted-foreground">{tNode("options.description", "前缀名称和递归、预演开关集中在这里。")}</p>
        </div>
        <div className="grid gap-3">
          <PrefixField
            value={props.data.prefixName ?? DEFAULT_PREFIX_NAME}
            disabled={props.disabled}
            onChange={(prefixName) => props.onPatch({ prefixName })}
          />
          <PrimarySwitches data={props.data} disabled={props.disabled} onPatch={props.onPatch} />
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
            <Button aria-label="formatv defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">{tNode("defaults.title", "默认配置")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("defaults.title", "默认配置")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("defaults.title", "默认配置")}</div>
          <p className="text-xs text-muted-foreground">{tNode("defaults.description", "保存 FormatV 的路径、前缀和开关到明文配置。")}</p>
        </div>
        <div className="grid gap-2">
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>{tNode("buttons.saveDefault", "保存为默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>{tNode("buttons.restoreDefault", "恢复默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>{tNode("buttons.clearOverride", "清除覆盖")}</Button>
          <Separator />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">{tNode("buttons.viewConfig", "查看配置")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
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

export function PrefixField(props: {
  disabled?: boolean
  value: string
  onChange: (value: string) => void
}) {
  const { t: tNode } = useNodeI18n("formatv")
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="formatv-prefix" className="text-xs">{tNode("prefix.label", "前缀名称")}</Label>
      <Input
        id="formatv-prefix"
        aria-label="formatv prefix name"
        disabled={props.disabled}
        className="font-mono"
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
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{tNode("defaults.configFile", "配置文件")}</div>
        <div className="mt-1 break-all font-mono text-xs">{props.path ?? tNode("defaults.notConnected", "未连接本地配置服务")}</div>
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
