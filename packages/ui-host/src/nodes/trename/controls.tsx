import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, Eye, EyeOff, FolderInput, Info, ListTree, Settings2, ShieldAlert } from "lucide-react"
import type { TrenameScanMode } from "@xiranite/node-trename/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { DEFAULT_EXCLUDE_EXTS_TEXT, SCAN_MODES } from "./constants"
import type { TrenameCardState, TrenameStatusMeta } from "./types"

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

export function ModePicker(props: {
  disabled?: boolean
  mode: TrenameScanMode
  onModeChange: (mode: TrenameScanMode) => void
}) {
  return (
    <Tabs
      value={props.mode}
      aria-label={tNode("trename", "aria.scanMode", "trename scan mode")}
      onValueChange={(v) => {
        if (v) props.onModeChange(v as TrenameScanMode)
      }}
    >
      <TabsList variant="line" className="grid w-full grid-cols-2">
        {SCAN_MODES.map((item) => {
          const Icon = item.icon
          return (
            <TabsTrigger
              key={item.value}
              aria-label={item.label}
              className="min-w-0"
              disabled={props.disabled}
              value={item.value}
            >
              <Icon />
              <span className="truncate">{item.shortLabel}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
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
    <FieldGroup className="gap-2">
      <Field className="gap-1.5">
        {!props.compact && (
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="trename-paths">扫描路径</FieldLabel>
            <Badge variant="outline" className="shrink-0">{props.pathCount} 条</Badge>
          </div>
        )}
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <Textarea
            id="trename-paths"
            aria-label={tNode("trename", "aria.scanPaths", "trename scan paths")}
            className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
            disabled={props.disabled}
            placeholder={'"D:\\gallery-a" "D:\\gallery-b"'}
            value={props.value}
            onChange={(event) => props.onChange(event.currentTarget.value)}
          />
          <div className="grid content-start gap-1.5">
            <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴路径" onClick={props.onPaste} />
            <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空路径" onClick={props.onClear} />
          </div>
        </div>
      </Field>
    </FieldGroup>
  )
}

export function KeySwitches(props: {
  compact?: boolean
  data: TrenameCardState
  disabled?: boolean
  onPatch: (patch: Partial<TrenameCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="trename-key-switches"
    >
      <SwitchRow
        checked={props.data.includeRoot ?? true}
        disabled={props.disabled}
        icon={ListTree}
        label="根目录"
        description="开启后把根目录本身也写入 rename JSON，适合整批翻译目录名。"
        onCheckedChange={(includeRoot) => props.onPatch({ includeRoot })}
      />
      <SwitchRow
        checked={props.data.includeHidden ?? false}
        disabled={props.disabled}
        icon={(props.data.includeHidden ?? false) ? Eye : EyeOff}
        label="隐藏项"
        description="扫描隐藏文件和以点开头的路径。"
        onCheckedChange={(includeHidden) => props.onPatch({ includeHidden })}
      />
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="预演"
        description="保持开启时只生成计划，不执行真实重命名。关闭后真实写入文件系统。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
      <SwitchRow
        checked={props.data.compact ?? true}
        disabled={props.disabled}
        icon={FolderInput}
        label="紧凑 JSON"
        description="导出的 rename JSON 使用紧凑格式，便于复制给翻译流程。"
        onCheckedChange={(compact) => props.onPatch({ compact })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: TrenameCardState
  disabled?: boolean
  onPatch: (patch: Partial<TrenameCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={tNode("trename", "aria.advancedOptions", "trename advanced options")} disabled={props.disabled} size="icon-sm" variant="outline">
              <Settings2 />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,520px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">低频参数收进这里，主界面只保留路径、模式、风险开关和执行动作。</p>
        </div>
        <FieldGroup className="gap-3">
          <TextField label="base path" value={props.data.basePath ?? ""} disabled={props.disabled} onChange={(basePath) => props.onPatch({ basePath })} />
          <TextField label="排除扩展名" value={props.data.excludeExts ?? DEFAULT_EXCLUDE_EXTS_TEXT} disabled={props.disabled} onChange={(excludeExts) => props.onPatch({ excludeExts })} />
          <TextField label="排除模式" value={props.data.excludePatterns ?? ""} disabled={props.disabled} placeholder="processed,numbered" onChange={(excludePatterns) => props.onPatch({ excludePatterns })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="分段行数" value={props.data.maxLines ?? 1000} min={0} disabled={props.disabled} onChange={(maxLines) => props.onPatch({ maxLines })} />
            <NumberField label="历史数量" value={props.data.keepRecent ?? 10} min={1} disabled={props.disabled} onChange={(keepRecent) => props.onPatch({ keepRecent })} />
          </div>
          <TextField label="undo path" value={props.data.undoPath ?? ""} disabled={props.disabled} onChange={(undoPath) => props.onPatch({ undoPath })} />
          <TextField label="batch id" value={props.data.batchId ?? ""} disabled={props.disabled} onChange={(batchId) => props.onPatch({ batchId })} />
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<TrenameCardState>
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
            <Button aria-label={tNode("trename", "aria.defaults", "trename defaults")} disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 Trename 的路径、扫描模式和风险开关到明文配置。</p>
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
                <DialogTitle>Trename 配置</DialogTitle>
                <DialogDescription>当前 nodes.trename 默认值和配置文件位置。</DialogDescription>
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
  status: TrenameStatusMeta
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

function ConfigPreview(props: {
  config?: Partial<TrenameCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.trename 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
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

function TextField(props: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const id = `trename-${props.label}`
  return (
    <Field className="gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </Field>
  )
}

function NumberField(props: {
  disabled?: boolean
  label: string
  min?: number
  onChange: (value: number) => void
  value: number
}) {
  const id = `trename-${props.label}`
  return (
    <Field className="gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        disabled={props.disabled}
        min={props.min}
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </Field>
  )
}
