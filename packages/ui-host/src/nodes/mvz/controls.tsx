import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, Info, Package, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ACTIONS } from "./constants"
import type { MvzAction, MvzData } from "@xiranite/node-mvz/core"
import type { MvzCardState, MvzStatusMeta } from "./types"

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
  value: MvzAction
  onChange: (value: MvzAction) => void
}) {
  return (
    <div data-testid="mvz-action-picker" className="grid grid-cols-4 gap-1">
      {ACTIONS.map((item) => {
        const Icon = item.icon
        return (
          <Button
            key={item.value}
            aria-label={item.label}
            disabled={props.disabled}
            size="sm"
            variant={props.value === item.value ? "secondary" : "outline"}
            onClick={() => props.onChange(item.value)}
          >
            <Icon data-icon="inline-start" />
            <span className="truncate">{item.shortLabel}</span>
          </Button>
        )
      })}
    </div>
  )
}

export function EntryInput(props: {
  compact?: boolean
  disabled?: boolean
  entryCount: number
  archiveCount: number
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="mvz-entries">归档条目</Label>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline">{props.archiveCount} 包</Badge>
            <Badge variant="outline">{props.entryCount} 条</Badge>
          </div>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="mvz-entries"
          aria-label="mvz archive entries"
          disabled={props.disabled}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-16" : "h-28")}
          placeholder={"每行一个 archive//internal 格式条目\nD:\\books.zip//chapter1.md\nD:\\gallery.cbz//image/001.jpg"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴条目" onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空条目" onClick={props.onClear} />
        </div>
      </div>
    </div>
  )
}

export function OutputInput(props: {
  compact?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  onPaste: () => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && <Label htmlFor="mvz-output">输出目录</Label>}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Input
          id="mvz-output"
          aria-label="mvz output directory"
          disabled={props.disabled}
          className={cn("min-w-0 font-mono text-xs", props.compact && "h-9")}
          placeholder="留空或使用就近目录"
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴输出" onClick={props.onPaste} />
      </div>
    </div>
  )
}

export function RenameFields(props: {
  compact?: boolean
  disabled?: boolean
  pattern?: string
  replacement?: string
  onPatternChange: (value: string) => void
  onReplacementChange: (value: string) => void
}) {
  return (
    <div data-testid="mvz-rename-fields" className={cn("grid gap-1.5", props.compact ? "grid-cols-1" : "grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-1">
        {props.compact && <Label htmlFor="mvz-pattern" className="text-xs">正则模式</Label>}
        <Input
          id="mvz-pattern"
          aria-label="mvz rename pattern"
          disabled={props.disabled}
          className="min-w-0 font-mono text-xs"
          placeholder="正则模式，如 \\s+"
          value={props.pattern ?? ""}
          onChange={(event) => props.onPatternChange(event.currentTarget.value)}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {props.compact && <Label htmlFor="mvz-replacement" className="text-xs">替换文本</Label>}
        <Input
          id="mvz-replacement"
          aria-label="mvz rename replacement"
          disabled={props.disabled}
          className="min-w-0 font-mono text-xs"
          placeholder="替换为，如 _"
          value={props.replacement ?? ""}
          onChange={(event) => props.onReplacementChange(event.currentTarget.value)}
        />
      </div>
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: MvzCardState
  disabled?: boolean
  action: MvzAction
  onPatch: (patch: Partial<MvzCardState>) => void
}) {
  const pathOptionsDisabled = props.disabled || props.action === "delete" || props.action === "rename"
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="mvz-primary-switches"
    >
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="预演"
        description="默认只生成命令预览，不修改压缩包。关闭后会执行真实操作。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
      <SwitchRow
        checked={props.data.near ?? true}
        disabled={pathOptionsDisabled}
        icon={Package}
        label="就近输出"
        description="输出到压缩包所在目录，关闭后使用输出目录字段。"
        onCheckedChange={(near) => props.onPatch({ near })}
      />
      <SwitchRow
        checked={props.data.autoDir ?? true}
        disabled={pathOptionsDisabled}
        icon={Package}
        label="自动子目录"
        description="以压缩包名创建子目录，避免文件混在一起。"
        onCheckedChange={(autoDir) => props.onPatch({ autoDir })}
      />
      <SwitchRow
        checked={props.data.flatten ?? false}
        disabled={pathOptionsDisabled}
        icon={Package}
        label="扁平提取"
        description="丢弃压缩包内目录层级，所有文件直接放进输出目录。"
        onCheckedChange={(flatten) => props.onPatch({ flatten })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: MvzCardState
  disabled?: boolean
  onPatch: (patch: Partial<MvzCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="mvz advanced options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Package />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">低频参数收进这里，主界面只保留动作、条目和风险开关。</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mvz-separator" className="text-xs">条目分隔符</Label>
          <Input
            id="mvz-separator"
            aria-label="mvz separator"
            disabled={props.disabled}
            placeholder="默认 //"
            value={props.data.separator ?? ""}
            onChange={(event) => props.onPatch({ separator: event.currentTarget.value })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<MvzCardState>
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
            <Button aria-label="mvz defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 MVZ 的动作、条目、输出和开关到明文配置。</p>
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
                <DialogTitle>MVZ 配置</DialogTitle>
                <DialogDescription>当前 nodes.mvz 默认值和配置文件位置。</DialogDescription>
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
  status: MvzStatusMeta
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

export function ResultTabs(props: {
  compact?: boolean
  logs: string[]
  result: MvzData | null
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const preview = props.result?.preview ?? []
  const results = props.result?.results ?? []
  const hasPreview = preview.length > 0
  const hasResults = results.length > 0
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={cn("flex shrink-0 items-center justify-between gap-2 px-3 py-2", props.compact && "px-2 py-1.5")}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>结果</span>
          {hasPreview && <Badge variant="outline" className="shrink-0">{preview.length} 预览</Badge>}
          {hasResults && <Badge variant="outline" className="shrink-0">{results.length} 结果</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ActionIconButton disabled={!props.logs.length} icon={Clipboard} label="复制日志" onClick={props.onCopyLogs} />
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {hasResults ? (
          <div className="p-3 text-xs leading-5">
            <div className="grid gap-1">
              {results.slice(0, 80).map((item, index) => (
                <div
                  key={`${item.archive}:${item.action}:${index}`}
                  className={cn(
                    "truncate rounded-md border bg-muted/30 px-2 py-1",
                    !item.success && "border-destructive/40 bg-destructive/10 text-destructive",
                    item.success && "text-primary",
                  )}
                >
                  <span className="font-mono text-[11px] uppercase">{item.success ? "成功" : "失败"}</span>
                  {" "}
                  {item.action} {item.archive}
                  {item.message ? ` / ${item.message}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : hasPreview ? (
          <div className="p-3 text-xs leading-5">
            <div className="grid gap-1">
              {preview.slice(0, 80).map((item, index) => (
                <div
                  key={`${item.archive}:${item.action}:${index}`}
                  className="truncate rounded-md border bg-muted/30 px-2 py-1 text-muted-foreground"
                >
                  <span className="font-mono text-[11px] uppercase">计划</span>
                  {" "}
                  {item.action} {item.count} / {item.command ?? item.archive}
                </div>
              ))}
            </div>
          </div>
        ) : props.logs.length ? (
          <div className="p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {props.logs.slice(-80).map((line, index) => (
              <div key={index} className="truncate">{line}</div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-24 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            粘贴归档条目后预演或执行，预览与结果会显示在这里。
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function ConfigPreview(props: {
  config?: Partial<MvzCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.mvz 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
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
