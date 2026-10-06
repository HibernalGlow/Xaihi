import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, FileCode, FolderInput, Info, RotateCcw, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MODULES, findModuleMeta } from "./constants"
import type { MarkuCardState, MarkuStatusMeta } from "./types"

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

export function ModulePicker(props: {
  compact?: boolean
  disabled?: boolean
  module: string
  onModuleChange: (value: string) => void
}) {
  const meta = findModuleMeta(props.module)
  if (props.compact) {
    return (
      <Select disabled={props.disabled} value={meta.id} onValueChange={props.onModuleChange}>
        <SelectTrigger aria-label="marku module" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODULES.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.shortLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div data-testid="marku-module-grid" className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-1">
      {MODULES.map((item) => (
        <Button
          key={item.id}
          aria-label={item.label}
          disabled={props.disabled}
          size="sm"
          variant={meta.id === item.id ? "secondary" : "outline"}
          onClick={() => props.onModuleChange(item.id)}
        >
          <item.icon data-icon="inline-start" />
          <span className="truncate">{item.shortLabel}</span>
        </Button>
      ))}
    </div>
  )
}

export function TextInput(props: {
  compact?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="marku-input-text">Markdown 文本</Label>
          <Badge variant="outline" className="shrink-0">{props.value.length} 字</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="marku-input-text"
          aria-label="marku input text"
          disabled={props.disabled}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-32")}
          placeholder="粘贴 Markdown 文本后将以 text 模式处理（路径输入会被忽略）。"
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴文本" onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空文本" onClick={props.onClear} />
        </div>
      </div>
    </div>
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
          <Label htmlFor="marku-paths">扫描路径</Label>
          <Badge variant="outline" className="shrink-0">{props.pathCount} 条</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="marku-paths"
          aria-label="marku scan paths"
          disabled={props.disabled}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
          placeholder={'"D:\\docs" "D:\\notes\\readme.md"'}
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

export function ConfigField(props: {
  compact?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <Label htmlFor="marku-config" className="text-xs">模块配置 JSON</Label>
      )}
      <Input
        id="marku-config"
        aria-label="marku step config"
        disabled={props.disabled}
        className={cn("min-w-0 font-mono text-xs", props.compact && "h-8")}
        placeholder='{"mode":"h2l","bullet":"- "}'
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}

export function PrimarySwitches(props: {
  compact?: boolean
  data: MarkuCardState
  disabled?: boolean
  hasText: boolean
  onPatch: (patch: Partial<MarkuCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
      )}
      data-testid="marku-primary-switches"
    >
      <SwitchRow
        checked={props.data.recursive ?? false}
        disabled={props.disabled || props.hasText}
        icon={FolderInput}
        label="递归"
        description="扫描子目录里的 Markdown 文件。仅路径模式有效。"
        onCheckedChange={(recursive) => props.onPatch({ recursive })}
      />
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled || props.hasText}
        icon={ShieldAlert}
        label="预演"
        description="默认只输出 diff 不写回文件。关闭后会真实写回磁盘。"
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
      <SwitchRow
        checked={props.data.enableUndo ?? true}
        disabled={props.disabled || (props.data.dryRun ?? true) || props.hasText}
        icon={RotateCcw}
        label="撤销记录"
        description="真实写回时记录可撤销快照。关闭预演后可调整。"
        onCheckedChange={(enableUndo) => props.onPatch({ enableUndo })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: MarkuCardState
  disabled?: boolean
  onPatch: (patch: Partial<MarkuCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="marku advanced options" disabled={props.disabled} size="icon-sm" variant="outline">
              <FileCode />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">低频参数收进这里，主界面只保留模块、输入和风险开关。</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="marku-history-path" className="text-xs">撤销历史路径</Label>
          <Input
            id="marku-history-path"
            aria-label="marku history path"
            disabled={props.disabled}
            placeholder="留空使用默认 ~/.xiranite/marku-history.json"
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
  defaults?: Partial<MarkuCardState>
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
            <Button aria-label="marku defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 Marku 的模块、输入和风险开关到明文配置。</p>
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
                <DialogTitle>Marku 配置</DialogTitle>
                <DialogDescription>当前 nodes.marku 默认值和配置文件位置。</DialogDescription>
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
  status: MarkuStatusMeta
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
  result: MarkuCardState["result"]
  onCopyLogs: () => void
  onCopyOutput: () => void
}) {
  const diffCount = props.result?.diffs.filter((item) => item.changed).length ?? 0
  const hasOutput = Boolean(props.result?.outputText)
  const hasDiff = Boolean(props.result?.diffText) || diffCount > 0
  const hasHistory = Boolean(props.result?.history.length)
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={cn("flex shrink-0 items-center justify-between gap-2 px-3 py-2", props.compact && "px-2 py-1.5")}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>结果</span>
          {hasOutput && <Badge variant="outline" className="shrink-0">输出</Badge>}
          {diffCount > 0 && <Badge variant="outline" className="shrink-0">{diffCount} 差异</Badge>}
          {hasHistory && <Badge variant="outline" className="shrink-0">{props.result?.history.length} 历史</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ActionIconButton disabled={!hasOutput} icon={Clipboard} label="复制输出" onClick={props.onCopyOutput} />
          <ActionIconButton disabled={!props.logs.length} icon={Clipboard} label="复制日志" onClick={props.onCopyLogs} />
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.result ? (
          <div className="p-3 text-xs leading-5">
            {hasOutput ? (
              <pre className="whitespace-pre-wrap break-words font-mono">{props.result.outputText}</pre>
            ) : hasDiff ? (
              props.result.diffText ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-muted-foreground">{props.result.diffText}</pre>
              ) : (
                <div className="grid gap-1.5">
                  {props.result.diffs.slice(0, 40).map((item) => (
                    <div key={item.file} className="rounded-md border bg-muted/30 px-2 py-1.5">
                      <div className={cn("truncate font-medium", item.changed && "text-primary")}>
                        {item.changed ? "已修改" : "无变化"} · {item.file}
                      </div>
                      {item.diff && (
                        <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] opacity-80">{item.diff}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : hasHistory ? (
              <div className="grid gap-1">
                {props.result.history.slice(0, 40).map((item) => (
                  <div key={item.id} className="truncate rounded-md border bg-muted/30 px-2 py-1">
                    <span className="font-mono text-[11px] text-muted-foreground">{item.id.slice(0, 8)}</span>
                    {" "}
                    <span className="font-medium">{item.module}</span>
                    {" "}
                    · {item.files.length} 文件
                    {item.undone ? " · 已撤销" : ""}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">暂无结果，运行模块后这里会显示输出与差异。</div>
            )}
            {props.result.errors.length > 0 && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                {props.result.errors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>
        ) : props.logs.length ? (
          <div className="p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {props.logs.slice(-80).map((line, index) => (
              <div key={index} className="truncate">{line}</div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-24 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            粘贴 Markdown 或路径后运行模块，结果与日志会显示在这里。
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function ConfigPreview(props: {
  config?: Partial<MarkuCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.marku 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
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
