import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, Info, Languages } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRESETS, STRATEGIES } from "./constants"
import type { EncodebCardState, EncodebPreset, EncodebStatusMeta, EncodebStrategy } from "./types"

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

export function PresetPicker(props: {
  disabled?: boolean
  preset: EncodebPreset
  onPresetChange: (preset: EncodebPreset) => void
}) {
  return (
    <ToggleGroup
      aria-label="编码预设"
      className="grid w-full grid-cols-3"
      disabled={props.disabled}
      size="sm"
      type="single"
      value={props.preset}
      variant="outline"
      onValueChange={(value) => {
        if (value) props.onPresetChange(value as EncodebPreset)
      }}
    >
      {PRESETS.map((item) => (
        <ToggleGroupItem key={item.value} aria-label={item.label} className="min-w-0" value={item.value}>
          <Languages data-icon="inline-start" />
          <span className="truncate">{item.shortLabel}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function StrategyPicker(props: {
  disabled?: boolean
  strategy: EncodebStrategy
  onStrategyChange: (strategy: EncodebStrategy) => void
}) {
  return (
    <ToggleGroup
      aria-label="修复策略"
      className="grid w-full grid-cols-2"
      disabled={props.disabled}
      size="sm"
      type="single"
      value={props.strategy}
      variant="outline"
      onValueChange={(value) => {
        if (value) props.onStrategyChange(value as EncodebStrategy)
      }}
    >
      {STRATEGIES.map((item) => (
        <ToggleGroupItem key={item.value} aria-label={item.label} className="min-w-0" value={item.value}>
          <span className="truncate">{item.shortLabel}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="encodeb-paths">源路径</Label>
          <Badge variant="outline" className="shrink-0">{props.pathCount} 条</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="encodeb-paths"
          aria-label="encodeb source paths"
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
          disabled={props.disabled}
          placeholder="每行一个目录或文件路径"
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴路径" onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空路径" onClick={props.onClear} />
        </div>
      </div>
    </div>
  )
}

export function EncodingFields(props: {
  disabled?: boolean
  preset: EncodebPreset
  srcEncoding: string
  dstEncoding: string
  onPatch: (patch: Partial<EncodebCardState>) => void
}) {
  const locked = props.preset !== "custom"
  return (
    <div className="grid grid-cols-2 gap-2">
      <EncodingField
        id="encodeb-src"
        label="源编码"
        value={props.srcEncoding}
        disabled={props.disabled || locked}
        onChange={(srcEncoding) => props.onPatch({ srcEncoding })}
      />
      <EncodingField
        id="encodeb-dst"
        label="目标编码"
        value={props.dstEncoding}
        disabled={props.disabled || locked}
        onChange={(dstEncoding) => props.onPatch({ dstEncoding })}
      />
    </div>
  )
}

export function OptionsPopover(props: {
  data: EncodebCardState
  disabled?: boolean
  preset: EncodebPreset
  srcEncoding: string
  dstEncoding: string
  strategy: EncodebStrategy
  onPatch: (patch: Partial<EncodebCardState>) => void
  onPresetChange: (preset: EncodebPreset) => void
  onStrategyChange: (strategy: EncodebStrategy) => void
}) {
  const presetMeta = PRESETS.find((item) => item.value === props.preset) ?? PRESETS[0]!
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="encodeb options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Languages />
              <span className="sr-only">编码选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>编码选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">编码选项</div>
          <p className="text-xs text-muted-foreground">预设、源/目标编码和修复策略集中在这里。</p>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">编码预设</Label>
            <PresetPicker disabled={props.disabled} preset={props.preset} onPresetChange={props.onPresetChange} />
            <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
              <div>{presetMeta.description}</div>
              <div className="mt-1 font-mono">示例：{presetMeta.example}</div>
            </div>
          </div>
          <EncodingFields
            disabled={props.disabled}
            preset={props.preset}
            srcEncoding={props.srcEncoding}
            dstEncoding={props.dstEncoding}
            onPatch={props.onPatch}
          />
          <div className="grid gap-1.5">
            <Label className="text-xs">修复策略</Label>
            <StrategyPicker disabled={props.disabled} strategy={props.strategy} onStrategyChange={props.onStrategyChange} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<EncodebCardState>
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
            <Button aria-label="encodeb defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 Encodeb 的路径、预设、编码和策略到明文配置。</p>
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
                <DialogTitle>Encodeb 配置</DialogTitle>
                <DialogDescription>当前 nodes.encodeb 默认值和配置文件位置。</DialogDescription>
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
  status: EncodebStatusMeta
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

function ConfigPreview(props: {
  config?: Partial<EncodebCardState>
  path?: string
}) {
  const content = props.config === undefined
    ? "# nodes.encodeb 暂无默认配置\n"
    : JSON.stringify(props.config, null, 2)
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

export function InfoHint({ description, label }: { description: string; label: string }) {
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

function EncodingField(props: {
  disabled?: boolean
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={props.id} className="text-xs">{props.label}</Label>
      <Input
        id={props.id}
        disabled={props.disabled}
        className="font-mono"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}
