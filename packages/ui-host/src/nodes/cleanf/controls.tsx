import type { LucideIcon } from "lucide-react"
import { Clipboard, Eraser, Eye, Info, ShieldAlert, Sparkles } from "lucide-react"
import type { CleanfPresetId } from "@xiranite/node-cleanf/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { PRESET_METAS } from "./constants"
import type { CleanfCardState, CleanfStatusMeta } from "./types"

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
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor="cleanf-paths">{tNode("cleanf", "fields.scanPaths.label", "扫描路径")}</FieldLabel>
          <Badge variant="outline" className="shrink-0">{tNode("cleanf", "fields.scanPaths.count", "{{count}} 条", { count: props.pathCount })}</Badge>
        </div>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="cleanf-paths"
          aria-label={tNode("cleanf", "aria.scanPaths", "cleanf scan paths")}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
          disabled={props.disabled}
          placeholder={tNode("cleanf", "fields.scanPaths.placeholder", "每行一个文件夹路径\nD:/gallery\nD:/archives")}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label={tNode("cleanf", "actions.pastePaths", "粘贴路径")} onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label={tNode("cleanf", "actions.clearPaths", "清空路径")} onClick={props.onClear} />
        </div>
      </div>
    </div>
  )
}

export function PresetPicker(props: {
  disabled?: boolean
  selected: CleanfPresetId[]
  onToggle: (id: CleanfPresetId) => void
}) {
  return (
    <div data-testid="cleanf-preset-picker" className="grid gap-1">
      {PRESET_METAS.map((preset) => {
          const active = props.selected.includes(preset.id)
          const Icon = preset.icon
          const label = tNode("cleanf", preset.labelKey, preset.id)
          const description = tNode("cleanf", preset.descriptionKey, "")
          return (
          <Field
            key={preset.id}
            orientation="horizontal"
            className={cn(
              "rounded-md border bg-card/72 px-2 py-1.5 transition-colors",
              active && "border-primary/40 bg-primary/5",
              props.disabled && "opacity-60",
            )}
          >
            <Checkbox
              id={`cleanf-preset-${preset.id}`}
              aria-label={label}
              checked={active}
              disabled={props.disabled}
              onCheckedChange={() => props.onToggle(preset.id)}
            />
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor={`cleanf-preset-${preset.id}`} className="min-w-0 text-xs">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
              </FieldLabel>
              <FieldDescription className="truncate text-[11px]">{description}</FieldDescription>
            </FieldContent>
          </Field>
        )
      })}
    </div>
  )
}

export function PrimarySwitches(props: {
  className?: string
  compact?: boolean
  data: CleanfCardState
  disabled?: boolean
  onPatch: (patch: Partial<CleanfCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
        props.className,
      )}
      data-testid="cleanf-primary-switches"
    >
      <SwitchRow
        checked={props.data.previewMode ?? true}
        compact={props.compact}
        disabled={props.disabled}
        icon={ShieldAlert}
        label={tNode("cleanf", "fields.previewMode.label", "预演模式")}
        description={tNode("cleanf", "fields.previewMode.description", "开启后只扫描并预览待清理项目，不写入文件系统。关闭后会将匹配项移入系统回收站。")}
        onCheckedChange={(previewMode) => props.onPatch({ previewMode })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: CleanfCardState
  disabled?: boolean
  onPatch: (patch: Partial<CleanfCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={tNode("cleanf", "aria.advancedOptions", "cleanf advanced options")} disabled={props.disabled} size="icon-sm" variant="outline">
              <Sparkles />
              <span className="sr-only">{tNode("cleanf", "advanced.title", "高级选项")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("cleanf", "advanced.title", "高级选项")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("cleanf", "advanced.title", "高级选项")}</div>
          <p className="text-xs text-muted-foreground">{tNode("cleanf", "advanced.description", "排除关键词用于跳过路径中包含这些字符串的项目。")}</p>
        </div>
        <div className="grid gap-2">
          <TextField
            label={tNode("cleanf", "fields.excludeKeywords.label", "排除关键词")}
            placeholder={tNode("cleanf", "fields.excludeKeywords.placeholder", "逗号分隔，如: node_modules, .git")}
            value={props.data.excludeKeywords ?? ""}
            disabled={props.disabled}
            onChange={(excludeKeywords) => props.onPatch({ excludeKeywords })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: CleanfStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-md border bg-card/72 p-2", props.compact && "p-1.5")}>
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
  compact?: boolean
  description?: string
  disabled?: boolean
  icon?: LucideIcon
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  const Icon = props.icon
  const id = `cleanf-switch-${props.label}`
  return (
    <Field orientation="horizontal" className={cn("rounded-md border bg-card/72 px-2 py-1.5", props.compact && "border-0 bg-transparent px-1 py-0")}>
      <FieldContent className="min-w-0 gap-0.5">
        <FieldLabel htmlFor={id} className="min-w-0 text-xs">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{props.label}</span>
        </FieldLabel>
        {props.description && <FieldDescription className="sr-only">{props.description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      {props.description && !props.compact && <InfoHint label={props.label} description={props.description} />}
    </Field>
  )
}

export function ResultList(props: {
  compact?: boolean
  result: CleanfCardState["result"]
}) {
  const result = props.result
  const previewFiles = result?.previewFiles ?? []
  const details = result?.removedDetails ?? {}
  const restored = result?.restored
  const lines = restored !== undefined
    ? [tNode("cleanf", "results.restored", "已恢复 {{count}} 项", { count: restored })]
    : previewFiles.length
    ? previewFiles
    : Object.entries(details).map(([key, count]) => `${key}: ${count}`)
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Eye className="size-3.5" />
          <span>{lines.length ? tNode("cleanf", "results.itemCount", "{{count}} 项", { count: lines.length }) : tNode("cleanf", "results.waiting", "等待运行")}</span>
        </div>
        <Badge variant="outline">
          {restored !== undefined
            ? tNode("cleanf", "results.restoredBadge", "恢复 {{count}}", { count: restored })
            : tNode("cleanf", "results.total", "总计 {{count}}", { count: result?.totalRemoved ?? 0 })}
        </Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {lines.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {lines.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("cleanf", "results.empty", "运行后会显示待删除项目和分类统计。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function LogPanel(props: {
  compact?: boolean
  logs: string[]
  onCopy: () => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{props.logs.length ? tNode("cleanf", "logs.lineCount", "{{count}} 行", { count: props.logs.length }) : tNode("cleanf", "logs.waiting", "等待日志")}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          {tNode("cleanf", "copyLogs", "复制")}
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.logs.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {props.logs.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("cleanf", "logs.empty", "运行日志会显示在这里。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function InfoHint({ description, label }: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={tNode("cleanf", "aria.description", "{{label}}说明", { label })}
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
  const id = `cleanf-${props.label}`
  return (
    <Field className="min-w-0 gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs">{props.label}</FieldLabel>
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
