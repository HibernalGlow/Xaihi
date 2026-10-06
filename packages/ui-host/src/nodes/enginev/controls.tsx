import type { LucideIcon } from "lucide-react"
import { Clipboard, Columns3, Copy, DatabaseZap, Eye, FolderInput, Info, List, MapPin, Settings2, SlidersHorizontal } from "lucide-react"
import type { EngineVAction } from "@xiranite/node-enginev/core"
import { DEFAULT_TEMPLATE, DEFAULT_WORKSHOP_PATH } from "@xiranite/node-enginev/defaults"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PathInput as SharedPathInput } from "@/components/ui/path-input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { NodeSectionHeader } from "@/nodes/shared/NodeSectionHeader"
import { ACTIONS } from "./constants"
import type { EngineVCardState, EngineVStatusMeta, EngineVUiConfig } from "./types"

interface PatchProps {
  data: EngineVCardState
  disabled?: boolean
  onPatch: (patch: Partial<EngineVCardState>) => void
}

export function EngineWorkflowTabs(props: {
  action: EngineVAction
  disabled?: boolean
  className?: string
  iconOnly?: boolean
  variant?: "floating"
  onActionChange: (value: EngineVAction) => void
}) {
  const floating = props.variant === "floating"
  const workflowActions = ACTIONS.filter((item) => item.value !== "filter")

  return (
    <Tabs className={cn("min-w-0", props.className)} value={props.action} onValueChange={(value) => props.onActionChange(value as EngineVAction)}>
      <TabsList
        aria-label="EngineV 工作流"
        variant="line"
        className={cn("h-auto", floating ? "flex w-auto max-w-full overflow-x-auto" : "grid w-full grid-cols-3")}
      >
        {workflowActions.map((item) => (
          <TabsTrigger
            key={item.value}
            disabled={props.disabled}
            value={item.value}
            className={cn("min-w-0 gap-1.5 px-1.5 text-xs", floating && "h-8 shrink-0 px-2")}
          >
            <item.icon />
            {floating ? <span className={props.iconOnly ? "sr-only" : undefined}>{item.shortLabel}</span> : item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function ActionIconButton(props: {
  label: string
  icon: LucideIcon
  disabled?: boolean
  destructive?: boolean
  active?: boolean
  ghost?: boolean
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
          variant={props.destructive ? "destructive" : props.active ? "secondary" : props.ghost ? "ghost" : "outline"}
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

export function PathInput(props: PatchProps & {
  compact?: boolean
  onPaste: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 px-1.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
              <FolderInput className="size-3.5" />
            </span>
            <Label htmlFor="enginev-workshop-path">工坊目录</Label>
          </div>
          <Badge variant="outline" className="shrink-0">Wallpaper Engine</Badge>
        </div>
      )}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <SharedPathInput
          id="enginev-workshop-path"
          aria-label={tNode("enginev", "aria.workshopPath", "Wallpaper Engine 工坊路径")}
          disabled={props.disabled}
          placeholder={DEFAULT_WORKSHOP_PATH}
          value={props.data.workshopPath ?? ""}
          onValueChange={(workshopPath) => props.onPatch({ workshopPath })}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="enginev paste path" disabled={props.disabled} size="icon-sm" variant="outline" onClick={props.onPaste}>
              <Clipboard />
            </Button>
          </TooltipTrigger>
          <TooltipContent>从剪贴板粘贴路径</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="enginev use default path"
              disabled={props.disabled}
              size="icon-sm"
              variant="outline"
              onClick={() => props.onPatch({ workshopPath: DEFAULT_WORKSHOP_PATH })}
            >
              <FolderInput />
            </Button>
          </TooltipTrigger>
          <TooltipContent>使用默认工坊路径</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export function FilterFields({ compact, data, disabled, onPatch }: PatchProps & { compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", !compact && "@2xl/enginev:grid-cols-3")}>
      <InputField
        label="标题"
        value={data.titleFilter ?? ""}
        disabled={disabled}
        placeholder="按标题包含文本过滤"
        onChange={(titleFilter) => onPatch({ titleFilter })}
      />
      <InputField
        label="分级"
        value={data.ratingFilter ?? ""}
        disabled={disabled}
        placeholder="Everyone / Mature"
        onChange={(ratingFilter) => onPatch({ ratingFilter })}
      />
      <InputField
        label="类型"
        value={data.typeFilter ?? ""}
        disabled={disabled}
        placeholder="Video / Scene"
        onChange={(typeFilter) => onPatch({ typeFilter })}
      />
      <div className="@2xl/enginev:col-span-3">
        <InputField
          label="选中 ID"
          value={data.idsText ?? ""}
          disabled={disabled}
          placeholder="123456, 789012"
          onChange={(idsText) => onPatch({ idsText })}
        />
      </div>
    </div>
  )
}

export function OptionsFields({ compact, data, disabled, onPatch }: PatchProps & { compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", !compact && "@3xl/enginev:grid-cols-2")}>
      <InputField
        label="重命名模板"
        value={data.template ?? DEFAULT_TEMPLATE}
        disabled={disabled}
        onChange={(template) => onPatch({ template })}
      />
      <InputField
        path
        label="目标 / 导出路径"
        value={data.targetPath || data.outputPath || ""}
        disabled={disabled}
        placeholder="复制目标目录或导出文件路径"
        onChange={(value) => onPatch({ targetPath: value, outputPath: value })}
      />
      <div className={cn("grid gap-2", !compact && "@3xl/enginev:col-span-2 @6xl/enginev:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]")}>
        <SwitchRow
          checked={data.dryRun ?? true}
          disabled={disabled}
          icon={Eye}
          label="预演"
          description="先生成计划，不写入文件系统。"
          onCheckedChange={(dryRun) => onPatch({ dryRun })}
        />
        <SwitchRow
          checked={data.copyMode ?? false}
          disabled={disabled}
          icon={Copy}
          label="复制模式"
          description="重命名时复制到目标目录，不移动原目录。"
          onCheckedChange={(copyMode) => onPatch({ copyMode })}
        />
        <Select
          value={data.exportFormat ?? "json"}
          disabled={disabled}
          onValueChange={(exportFormat) => onPatch({ exportFormat: exportFormat as EngineVCardState["exportFormat"] })}
        >
          <SelectTrigger aria-label={tNode("enginev", "aria.exportFormat", "enginev export format")} className="w-full @3xl/enginev:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="paths">路径</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function FilterPopover(props: PatchProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={tNode("enginev", "aria.filterSelect", "筛选和选择")} disabled={props.disabled} size="icon-sm" variant="outline">
              <SlidersHorizontal />
              <span className="sr-only">筛选和选择</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>筛选和选择</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <NodeSectionHeader icon={SlidersHorizontal} title="筛选和选择" description="筛选条件会同时影响重命名、删除和导出。" />
        </div>
        <FilterFields {...props} />
      </PopoverContent>
    </Popover>
  )
}

export function OptionsPopover(props: PatchProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="enginev template and options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Settings2 />
              <span className="sr-only">模板和写入选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>模板和写入选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-3">
          <NodeSectionHeader icon={Settings2} title="模板和写入选项" description="关键开关在紧凑态仍然可达，但不会常驻占用侧栏。" />
        </div>
        <OptionsFields {...props} />
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<EngineVCardState>
  disabled?: boolean
  uiDefaults?: EngineVUiConfig
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
            <Button aria-label="enginev defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">默认配置</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>默认配置</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <NodeSectionHeader icon={DatabaseZap} title="默认配置" description="保存当前路径、导出路径和模板到明文配置。" />
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
                <DialogTitle>EngineV 配置</DialogTitle>
                <DialogDescription>网页端可直接查看当前明文配置位置和 nodes.enginev 默认值。</DialogDescription>
              </DialogHeader>
              <ConfigPreview config={props.defaults} nodeId="enginev" path={props.configFilePath} uiConfig={props.uiDefaults} />
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>打开文件</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ConfigPreview(props: {
  config?: Partial<EngineVCardState>
  nodeId: string
  path?: string
  uiConfig?: EngineVUiConfig
}) {
  const preview: Record<string, unknown> = props.config === undefined ? {} : { ...props.config }
  if (props.uiConfig !== undefined) preview.ui = props.uiConfig
  const content = props.config === undefined && props.uiConfig === undefined
    ? `# nodes.${props.nodeId} 暂无默认配置\n`
    : JSON.stringify(preview, null, 2)
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

export function GallerySettingsPopover(props: PatchProps) {
  const columns = String(props.data.galleryColumns ?? 0)
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="enginev gallery display settings" disabled={props.disabled} size="icon-sm" variant="outline">
              <Columns3 />
              <span className="sr-only">画廊显示设置</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>画廊显示设置</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <NodeSectionHeader icon={Columns3} title="画廊显示" description="列数默认随卡片宽度变化，也可以手动覆盖。" />
        </div>
        <div className="grid gap-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">每行数量</Label>
            <Select
              value={columns}
              disabled={props.disabled}
              onValueChange={(value) => props.onPatch({ galleryColumns: value === "0" ? undefined : Number(value) })}
            >
              <SelectTrigger aria-label="enginev gallery columns" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">自动</SelectItem>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <SelectItem key={value} value={String(value)}>{value} 列</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SwitchRow
            checked={props.data.galleryCompact ?? false}
            disabled={props.disabled}
            icon={Columns3}
            label="紧凑密度"
            description="减少卡片间距和文字占高。"
            onCheckedChange={(galleryCompact) => props.onPatch({ galleryCompact })}
          />
          <SwitchRow
            checked={props.data.galleryShowMeta ?? true}
            disabled={props.disabled}
            icon={List}
            label="显示元信息"
            description="类型、分级和大小。"
            onCheckedChange={(galleryShowMeta) => props.onPatch({ galleryShowMeta })}
          />
          <SwitchRow
            checked={props.data.galleryShowPath ?? true}
            disabled={props.disabled}
            icon={MapPin}
            label="显示路径"
            description="底部路径摘要和复制入口。"
            onCheckedChange={(galleryShowPath) => props.onPatch({ galleryShowPath })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: EngineVStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-md border bg-card/70 p-2", props.compact && "p-1.5")}>
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
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-card/60 p-2">
      <label className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-xs font-medium">{props.label}</span>
        </span>
        <Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      </label>
      {props.description && <InfoHint label={props.label} description={props.description} />}
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

function InputField(props: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  path?: boolean
  placeholder?: string
  value: string
}) {
  const id = `enginev-${props.label}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      {props.path
        ? <SharedPathInput id={id} disabled={props.disabled} placeholder={props.placeholder} value={props.value} onValueChange={props.onChange} />
        : <Input id={id} disabled={props.disabled} placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)} />}
    </div>
  )
}
