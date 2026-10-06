import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, FileText, Info, Link, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ACTIONS, DEFAULT_MIN_SIMILARITY } from "./constants"
import type { RawfilterCardState, RawfilterStatusMeta } from "./types"

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

export function ActionPicker(props: {
  disabled?: boolean
  value: RawfilterCardState["action"]
  onActionChange: (value: RawfilterCardState["action"]) => void
}) {
  return (
    <Tabs value={props.value ?? "execute"} onValueChange={(value) => props.onActionChange(value as RawfilterCardState["action"])} data-testid="rawfilter-action-picker">
      <TabsList aria-label="过滤流程" variant="line" className="grid w-full grid-cols-3">
        {ACTIONS.map((item) => <TabsTrigger key={item.value} disabled={props.disabled} value={item.value}><item.icon /><span className="truncate">{item.shortLabel}</span></TabsTrigger>)}
      </TabsList>
    </Tabs>
  )
}

export function PathInput(props: {
  compact?: boolean
  data: RawfilterCardState
  disabled?: boolean
  onPaste: () => void
  onPatch: (patch: Partial<RawfilterCardState>) => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="rawfilter-path">目录路径</Label>
          {props.data.path ? (
            <Badge variant="outline" className="shrink-0">已设置</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">待输入</span>
          )}
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <Input
          id="rawfilter-path"
          aria-label="rawfilter 目录路径"
          disabled={props.disabled}
          className="min-w-0 font-mono text-xs"
          placeholder={"D:\\archives 或 D:/gallery"}
          value={props.data.path ?? ""}
          onChange={(event) => props.onPatch({ path: event.currentTarget.value })}
        />
        <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴路径" onClick={props.onPaste} />
        <ActionIconButton
          disabled={props.disabled}
          icon={Eraser}
          label="清空路径"
          onClick={() => props.onPatch({ path: "" })}
        />
      </div>
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: RawfilterCardState
  disabled?: boolean
  onPatch: (patch: Partial<RawfilterCardState>) => void
}) {
  const trashOnly = props.data.trashOnly ?? false
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="rawfilter-primary-switches"
    >
      <SwitchRow
        checked={props.data.nameOnlyMode ?? false}
        disabled={props.disabled}
        icon={FileText}
        label="仅名称模式"
        description="只按归档名归组，不计算相似度；minSimilarity 被忽略。"
        onCheckedChange={(nameOnlyMode) => props.onPatch({ nameOnlyMode })}
      />
      <SwitchRow
        checked={props.data.createShortcuts ?? false}
        disabled={props.disabled || trashOnly}
        icon={Link}
        label="创建快捷方式"
        description="对额外翻译版本生成 .url 快捷方式而非移动到 multi 目录。"
        onCheckedChange={(createShortcuts) => props.onPatch({ createShortcuts })}
      />
      <SwitchRow
        checked={trashOnly}
        disabled={props.disabled}
        icon={Trash2}
        label="仅移回收站"
        description="所有重复/原始版本一律移入 trash 子目录，不生成 multi 或快捷方式。"
        onCheckedChange={(checked) => props.onPatch({ trashOnly: checked, createShortcuts: checked ? false : props.data.createShortcuts })}
      />
      <SwitchRow
        checked={props.data.dryRun ?? false}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="预演"
        description="执行动作只生成计划不写入文件系统；关闭后执行动作会真实移动文件。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
    </div>
  )
}

export function OptionsPopover(props: {
  data: RawfilterCardState
  disabled?: boolean
  onPatch: (patch: Partial<RawfilterCardState>) => void
}) {
  const nameOnlyMode = props.data.nameOnlyMode ?? false
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="rawfilter 高级选项" disabled={props.disabled} size="icon-sm" variant="outline">
              <SlidersHorizontal />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">相似度阈值等低频参数集中在这里。</p>
        </div>
        <div className="grid gap-3">
          <NumberField
            label="最小相似度"
            min={0}
            max={1}
            step={0.01}
            value={props.data.minSimilarity ?? DEFAULT_MIN_SIMILARITY}
            disabled={props.disabled || nameOnlyMode}
            onChange={(minSimilarity) => props.onPatch({ minSimilarity })}
          />
          <p className="text-xs text-muted-foreground">
            {nameOnlyMode
              ? "已启用仅名称模式，相似度阈值不生效。"
              : "归组时归档名 token 的 Jaccard 相似度低于此值视为不同组。"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<RawfilterCardState>
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
            <Button aria-label="rawfilter 默认配置" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">rawfilter 默认配置</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>默认配置</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">默认配置</div>
          <p className="text-xs text-muted-foreground">保存 Rawfilter 的动作、路径和开关到明文配置。</p>
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
                <DialogTitle>Rawfilter 配置</DialogTitle>
                <DialogDescription>当前 nodes.rawfilter 默认值和配置文件位置。</DialogDescription>
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
  status: RawfilterStatusMeta
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
  config?: Partial<RawfilterCardState>
  path?: string
}) {
  const content = props.config === undefined
    ? "# nodes.rawfilter 暂无默认配置\n"
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
  step?: number
  onChange: (value: number) => void
  value: number
}) {
  const id = `rawfilter-${props.label}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
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
