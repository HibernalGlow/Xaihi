import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, FolderSync, Info, ShieldAlert } from "lucide-react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ACTIONS, MODES } from "./constants"
import type { MigratefMode } from "@xiranite/node-migratef/core"
import type { MigratefCardState, MigratefStatusMeta } from "./types"

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
  mode: MigratefMode
  onModeChange: (value: MigratefMode) => void
}) {
  return (
    <Tabs
      data-testid="migratef-mode-picker"
      value={props.mode}
      onValueChange={(value) => {
        const mode = MODES.find((item) => item.value === value)?.value
        if (mode) props.onModeChange(mode)
      }}
    >
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

export function ActionPicker(props: {
  disabled?: boolean
  value: string
  onChange: (value: "move" | "copy") => void
}) {
  return (
    <Tabs data-testid="migratef-action-picker" value={props.value} onValueChange={(v) => v && props.onChange(v as "move" | "copy")}>
      <TabsList variant="line" className="grid w-full grid-cols-2">
        {ACTIONS.map((item) => (
          <TabsTrigger
            key={item.value}
            aria-label={item.label}
            disabled={props.disabled}
            value={item.value}
          >
            <span className="truncate">{item.shortLabel}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function SourceInput(props: {
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
          <Label htmlFor="migratef-sources">源路径</Label>
          <Badge variant="outline" className="shrink-0">{props.pathCount} 条</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="migratef-sources"
          aria-label="migratef source paths"
          disabled={props.disabled}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-16" : "h-28")}
          placeholder={"每行一个源文件或文件夹路径\nD:\\gallery\nD:\\books\\readme.md"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴源" onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空源" onClick={props.onClear} />
        </div>
      </div>
    </div>
  )
}

export function TargetInput(props: {
  compact?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  onPaste: () => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && <Label htmlFor="migratef-target">目标路径</Label>}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Input
          id="migratef-target"
          aria-label="migratef target path"
          disabled={props.disabled}
          className={cn("min-w-0 font-mono text-xs", props.compact && "h-9")}
          placeholder="D:\\target\\folder"
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴目标" onClick={props.onPaste} />
      </div>
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: MigratefCardState
  disabled?: boolean
  onPatch: (patch: Partial<MigratefCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="migratef-primary-switches"
    >
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label="预演"
        description="默认只生成迁移计划，不写入文件系统。关闭后会执行真实移动/复制。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: MigratefCardState
  disabled?: boolean
  onPatch: (patch: Partial<MigratefCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="migratef advanced options" disabled={props.disabled} size="icon-sm" variant="outline">
              <FolderSync />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">低频参数收进这里，主界面只保留路径、模式和风险开关。</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="migratef-history-path" className="text-xs">撤销历史路径</Label>
          <Input
            id="migratef-history-path"
            aria-label="migratef history path"
            disabled={props.disabled}
            placeholder="留空使用默认 ~/.xiranite/migratef-history.json"
            value={props.data.historyPath ?? ""}
            onChange={(event) => props.onPatch({ historyPath: event.currentTarget.value })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<MigratefCardState>
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
            <Button aria-label="migratef defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 MigrateF 的路径、模式和风险开关到明文配置。</p>
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
                <DialogTitle>MigrateF 配置</DialogTitle>
                <DialogDescription>当前 nodes.migratef 默认值和配置文件位置。</DialogDescription>
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
  status: MigratefStatusMeta
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
  result: MigratefCardState["result"]
  onCopyLogs: () => void
  onUndo: (batchId?: string) => void
}) {
  const plan = props.result?.plan ?? []
  const history = props.result?.history ?? []
  const hasPlan = plan.length > 0
  const hasHistory = history.length > 0
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={cn("flex shrink-0 items-center justify-between gap-2 px-3 py-2", props.compact && "px-2 py-1.5")}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>结果</span>
          {hasPlan && <Badge variant="outline" className="shrink-0">{plan.length} 计划</Badge>}
          {hasHistory && <Badge variant="outline" className="shrink-0">{history.length} 历史</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ActionIconButton disabled={!props.logs.length} icon={Clipboard} label="复制日志" onClick={props.onCopyLogs} />
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {hasPlan ? (
          <div className="p-3 text-xs leading-5">
            <div className="grid gap-1">
              {plan.slice(0, 80).map((item, index) => (
                <div
                  key={`${item.sourcePath}:${item.targetPath}:${index}`}
                  className={cn(
                    "truncate rounded-md border bg-muted/30 px-2 py-1",
                    item.status === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                    item.status === "skipped" && "text-muted-foreground",
                    item.status === "success" && "text-primary",
                  )}
                >
                  <span className="font-mono text-[11px] uppercase">{statusLabel(item.status)}</span>
                  {" "}
                  {item.sourcePath}
                  {item.targetPath ? ` -> ${item.targetPath}` : item.reason ? ` / ${item.reason}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : hasHistory ? (
          <div className="p-3 text-xs leading-5">
            <div className="grid gap-1">
              {history.slice(0, 40).map((item) => (
                <div key={item.id} className="flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
                  <span className="font-mono text-[11px] text-muted-foreground">{item.id.slice(0, 8)}</span>
                  <span className="truncate">
                    {item.action} · {item.operations.length} 项 · {item.description}
                    {item.undone ? " · 已撤销" : ""}
                  </span>
                  {!item.undone && (
                    <Button
                      aria-label="撤销该批次"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 shrink-0 px-2 text-[11px]"
                      onClick={() => props.onUndo(item.id)}
                    >
                      撤销
                    </Button>
                  )}
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
            输入源路径和目标后预演或迁移，计划与历史会显示在这里。
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === "pending") return "待处理"
  if (status === "success") return "成功"
  if (status === "skipped") return "跳过"
  if (status === "error") return "失败"
  return status
}

function ConfigPreview(props: {
  config?: Partial<MigratefCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.migratef 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
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
