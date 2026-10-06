import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, FolderInput, Info, ShieldAlert, SlidersHorizontal, Trash2, Zap } from "lucide-react"
import type { BandiaArchiveFormat, BandiaExtractMode, BandiaOverwriteMode } from "@xiranite/node-bandia/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { DEFAULT_OUTPUT_PREFIX, MODES } from "./constants"
import type { BandiaCardState, BandiaMode, BandiaStatusMeta } from "./types"

interface PatchProps {
  data: BandiaCardState
  disabled?: boolean
  mode: BandiaMode
  onPatch: (patch: Partial<BandiaCardState>) => void
}

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
  mode: BandiaMode
  onModeChange: (mode: BandiaMode) => void
}) {
  return (
    <Tabs value={props.mode} onValueChange={(v) => v && props.onModeChange(v as BandiaMode)}>
      <TabsList variant="line" className="grid w-full grid-cols-3">
        {MODES.map((item) => {
          const Icon = item.icon
          return (
            <TabsTrigger
              key={item.value}
              aria-label={item.label}
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

export function PathInput(props: PatchProps & {
  archiveCount: number
  compact?: boolean
  pathCount: number
  onPaste: () => void
}) {
  const isExtract = props.mode === "extract"
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="bandia-paths">{isExtract ? "压缩包路径" : "源路径"}</Label>
          <Badge variant="outline" className="shrink-0">
            {isExtract ? `${props.archiveCount} 个归档` : `${props.pathCount} 个路径`}
          </Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="bandia-paths"
          aria-label={isExtract ? "压缩包路径" : "源路径"}
          disabled={props.disabled}
          className={cn("min-h-0 resize-none", props.compact ? "h-16" : "h-28")}
          placeholder={isExtract ? "每行一个 .zip / .7z / .rar 路径" : "每行一个文件夹或文件路径"}
          value={props.data.pathText ?? ""}
          onChange={(event) => props.onPatch({ pathText: event.currentTarget.value })}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴输入" onClick={props.onPaste} />
          <ActionIconButton
            disabled={props.disabled}
            icon={FolderInput}
            label="清空输入"
            onClick={() => props.onPatch({ pathText: "" })}
          />
        </div>
      </div>
    </div>
  )
}

export function MappingInput(props: PatchProps & {
  compact?: boolean
  mappingCount: number
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="bandia-mappings">路径映射</Label>
          <Badge variant="outline" className="shrink-0">{props.mappingCount} 条映射</Badge>
        </div>
      )}
      <Textarea
        id="bandia-mappings"
        aria-label="路径映射"
        disabled={props.disabled}
        className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-16" : "h-28")}
        placeholder='{"mappings":[{"archivePath":"a.zip","extractedPath":"folder"}]}'
        value={props.data.mappingText ?? ""}
        onChange={(event) => props.onPatch({ mappingText: event.currentTarget.value })}
      />
    </div>
  )
}

export function PrimarySwitches(props: PatchProps & {
  compact?: boolean
}) {
  const isExtract = props.mode === "extract"
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact
          ? "grid-cols-2"
          : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="bandia-primary-switches"
    >
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="预演"
        description="默认只生成命令计划，不写入文件系统。关闭后会执行真实 Bandizip 操作。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
      {isExtract ? (
        <>
          <SwitchRow
            checked={props.data.deleteAfter ?? true}
            disabled={props.disabled}
            icon={Trash2}
            label="删源"
            description="解压成功后删除原压缩包。建议配合回收站。"
            onCheckedChange={(deleteAfter) => props.onPatch({ deleteAfter })}
          />
          <SwitchRow
            checked={props.data.useTrash ?? true}
            disabled={props.disabled || !(props.data.deleteAfter ?? true)}
            icon={Trash2}
            label="回收站"
            description="删除源压缩包时优先移入回收站。"
            onCheckedChange={(useTrash) => props.onPatch({ useTrash })}
          />
          <SwitchRow
            checked={props.data.parallel ?? false}
            disabled={props.disabled}
            icon={Zap}
            label="并行"
            description="多压缩包同时处理，适合大量小归档。"
            onCheckedChange={(parallel) => props.onPatch({ parallel })}
          />
        </>
      ) : (
        <SwitchRow
          checked={props.data.deleteSource ?? true}
          disabled={props.disabled}
          icon={Trash2}
          label="删源"
          description="压缩成功后删除源目录。真实运行前请确认路径。"
          onCheckedChange={(deleteSource) => props.onPatch({ deleteSource })}
        />
      )}
    </div>
  )
}

export function OptionsFields(props: PatchProps) {
  const isExtract = props.mode === "extract"
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2" data-testid="bandia-options-fields">
      {isExtract ? (
        <>
          <SelectField
            label="解压模式"
            value={props.data.extractMode ?? "auto"}
            disabled={props.disabled}
            values={[
              ["auto", "智能"],
              ["normal", "普通"],
            ]}
            onChange={(extractMode) => props.onPatch({ extractMode: extractMode as BandiaExtractMode })}
          />
          <SelectField
            label="覆盖策略"
            value={props.data.overwriteMode ?? "overwrite"}
            disabled={props.disabled}
            values={[
              ["overwrite", "覆盖"],
              ["skip", "跳过"],
              ["rename", "自动改名"],
            ]}
            onChange={(overwriteMode) => props.onPatch({ overwriteMode: overwriteMode as BandiaOverwriteMode })}
          />
          <NumberField
            label="工作线程"
            value={props.data.workers ?? 2}
            min={1}
            max={8}
            disabled={props.disabled || !(props.data.parallel ?? false)}
            onChange={(workers) => props.onPatch({ workers })}
          />
          <TextField
            label="普通模式前缀"
            value={props.data.outputPrefix ?? DEFAULT_OUTPUT_PREFIX}
            disabled={props.disabled || (props.data.extractMode ?? "auto") === "auto"}
            onChange={(outputPrefix) => props.onPatch({ outputPrefix })}
          />
        </>
      ) : (
        <>
          <SelectField
            label="压缩格式"
            value={props.data.compressFormat ?? "zip"}
            disabled={props.disabled}
            values={[
              ["zip", "ZIP"],
              ["7z", "7Z"],
            ]}
            onChange={(compressFormat) => props.onPatch({ compressFormat: compressFormat as BandiaArchiveFormat })}
          />
          <TextField
            label="输出目录"
            value={props.data.outputDir ?? ""}
            disabled={props.disabled}
            placeholder="留空则写入源路径同级目录"
            onChange={(outputDir) => props.onPatch({ outputDir })}
          />
        </>
      )}
    </div>
  )
}

export function OptionsPopover(props: PatchProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="Bandia 选项" disabled={props.disabled} size="icon-sm" variant="outline">
              <SlidersHorizontal />
              <span className="sr-only">Bandia 选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Bandia 选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">任务选项</div>
          <p className="text-xs text-muted-foreground">低频参数集中在这里，卡片主体只保留关键开关。</p>
        </div>
        <div className="grid gap-3">
          <PrimarySwitches {...props} />
          <OptionsFields {...props} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<BandiaCardState>
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
            <Button aria-label="Bandia 默认配置" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">Bandia 默认配置</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>默认配置</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">默认配置</div>
          <p className="text-xs text-muted-foreground">保存 Bandia 的模式、映射和运行选项到明文配置。</p>
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
                <DialogTitle>Bandia 配置</DialogTitle>
                <DialogDescription>网页端可直接查看当前明文配置位置和 nodes.bandia 默认值。</DialogDescription>
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
  status: BandiaStatusMeta
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
  config?: Partial<BandiaCardState>
  path?: string
}) {
  const content = props.config === undefined
    ? "# nodes.bandia 暂无默认配置\n"
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
  value: number
}) {
  const id = `bandia-${props.label}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

function SelectField(props: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  value: string
  values: Array<[string, string]>
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs">{props.label}</Label>
      <Select value={props.value} disabled={props.disabled} onValueChange={props.onChange}>
        <SelectTrigger aria-label={props.label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.values.map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TextField(props: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const id = `bandia-${props.label}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}
