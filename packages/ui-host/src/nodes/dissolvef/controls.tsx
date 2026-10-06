import type { LucideIcon } from "lucide-react"
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clipboard, Clock3, Copy, Eraser, FileSymlink, FolderInput, Info, Layers, ListChecks, PackageOpen, ShieldAlert, Terminal, Trash2, Undo2, XCircle } from "lucide-react"
import type { DissolvefConflictMode } from "@xiranite/node-dissolvef/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { BUNDLE_MODES, CONFLICT_MODES, DEFAULT_THRESHOLD } from "./constants"
import type { DissolvefCardState, DissolvefStatusMeta } from "./types"

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
  compact?: boolean
  direct: boolean
  disabled?: boolean
  selectedModes: string[]
  onToggleMode: (mode: "nested" | "media" | "archive") => void
  onSetDirect: (direct: boolean) => void
}) {
  const bundleValues = BUNDLE_MODES.map((item) => item.value)

  return (
    <div data-testid="dissolvef-mode-picker" className="grid gap-1.5">
      <Tabs
        aria-label={tNode("dissolvef", "aria.modeStrategy", "dissolvef mode strategy")}
        value={props.direct ? "direct" : "bundle"}
        onValueChange={(value) => props.onSetDirect(value === "direct")}
      >
        <TabsList className="grid w-full grid-cols-2" variant="default">
          <TabsTrigger disabled={props.disabled} value="bundle">
            <Layers data-icon="inline-start" />
            <span className="truncate">{tNode("dissolvef", "mode.bundle", "捆绑")}</span>
          </TabsTrigger>
          <TabsTrigger disabled={props.disabled} value="direct">
            <PackageOpen data-icon="inline-start" />
            <span className="truncate">{tNode("dissolvef", "mode.direct", "直提")}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {!props.direct && (
        <ToggleGroup
          aria-label={tNode("dissolvef", "aria.bundleModes", "dissolvef bundle modes")}
          className="grid w-full grid-cols-3"
          disabled={props.disabled}
          size="sm"
          type="multiple"
          value={props.selectedModes}
          variant="outline"
          onValueChange={(nextValues) => {
            const changed = bundleValues.find((value) => nextValues.includes(value) !== props.selectedModes.includes(value))
            if (changed) props.onToggleMode(changed)
          }}
        >
          {BUNDLE_MODES.map((item) => {
            const label = tNode("dissolvef", `bundleModes.${item.value}.label`, item.label)
            const shortLabel = tNode("dissolvef", `bundleModes.${item.value}.shortLabel`, item.shortLabel)
            return (
              <ToggleGroupItem key={item.value} aria-label={label} className="w-full" value={item.value}>
                <item.icon data-icon="inline-start" />
                <span className="truncate">{shortLabel}</span>
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      )}
    </div>
  )
}

export function PathInput(props: {
  compact?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <Field className="min-h-0 min-w-0 gap-1.5">
      {!props.compact && (
        <FieldTitle>{tNode("dissolvef", "labels.targetFolder", "目标文件夹")}</FieldTitle>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Textarea
          id="dissolvef-path"
          aria-label={tNode("dissolvef", "aria.targetFolder", "dissolvef target folder")}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-20")}
          disabled={props.disabled}
          placeholder={tNode("dissolvef", "input.pathPlaceholder", "要溶解的文件夹路径\nD:/library/outer")}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label={tNode("dissolvef", "actions.pasteFolder", "粘贴文件夹")} onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label={tNode("dissolvef", "actions.clearPath", "清空路径")} onClick={props.onClear} />
        </div>
      </div>
    </Field>
  )
}

export function PrimarySwitches(props: {
  className?: string
  compact?: boolean
  data: DissolvefCardState
  direct: boolean
  disabled?: boolean
  showPreview?: boolean
  onPatch: (patch: Partial<DissolvefCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
        props.className,
      )}
      data-testid="dissolvef-primary-switches"
    >
      {props.showPreview !== false && (
        <SwitchRow
          compact={props.compact}
          checked={props.data.preview ?? true}
          disabled={props.disabled}
          icon={ShieldAlert}
          label={tNode("dissolvef", "switches.preview", "预演")}
          description={tNode("dissolvef", "switches.previewDescription", "开启后只生成计划，不移动或删除文件。关闭后会真实执行。")}
          onCheckedChange={(preview) => props.onPatch({ preview })}
        />
      )}
      <SwitchRow
        compact={props.compact}
        checked={props.data.protectFirstLevel ?? true}
        disabled={props.disabled || props.direct}
        icon={FolderInput}
        label={tNode("dissolvef", "switches.protectFirstLevel", "保护一级")}
        description={tNode("dissolvef", "switches.protectFirstLevelDescription", "开启后跳过第一层子文件夹，避免误伤顶层归档结构。")}
        onCheckedChange={(protectFirstLevel) => props.onPatch({ protectFirstLevel })}
      />
      <SwitchRow
        compact={props.compact}
        checked={props.data.enableSimilarity ?? true}
        disabled={props.disabled || props.direct}
        icon={Info}
        label={tNode("dissolvef", "switches.enableSimilarity", "相似度校验")}
        description={tNode("dissolvef", "switches.enableSimilarityDescription", "开启后比对父文件夹与子项名称相似度，低于阈值时跳过。")}
        onCheckedChange={(enableSimilarity) => props.onPatch({ enableSimilarity })}
      />
    </div>
  )
}

export function CollisionPolicy(props: {
  data: DissolvefCardState
  disabled?: boolean
  onPatch: (patch: Partial<DissolvefCardState>) => void
}) {
  const selected = props.data.fileConflict ?? "auto"
  return (
    <section data-testid="dissolvef-collision-policy" className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card/72 p-3">
      <div>
        <div className="text-sm font-semibold">{tNode("dissolvef", "collision.title", "冲突策略")}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{tNode("dissolvef", "collision.description", "目标目录已存在同名文件时的处理方式。")}</p>
      </div>
      <RadioGroup
        aria-label={tNode("dissolvef", "aria.collisionPolicy", "dissolvef collision policy")}
        className="gap-1.5"
        disabled={props.disabled}
        value={selected}
        onValueChange={(fileConflict) => props.onPatch({
          fileConflict: fileConflict as DissolvefConflictMode,
          dirConflict: fileConflict as DissolvefConflictMode,
        })}
      >
        {CONFLICT_MODES.map((mode) => {
          const id = `dissolvef-collision-${mode.value}`
          const label = tNode("dissolvef", `conflictModes.${mode.value}.label`, mode.label)
          return (
            <Field key={mode.value} orientation="horizontal" className="items-start gap-2 rounded-md border bg-background/40 p-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <RadioGroupItem id={id} value={mode.value} />
              <FieldContent className="gap-0.5">
                <FieldLabel htmlFor={id} className="cursor-pointer text-xs font-medium">{label}</FieldLabel>
                <FieldDescription className="text-[11px]">{tNode("dissolvef", `conflictModes.${mode.value}.description`, mode.description)}</FieldDescription>
              </FieldContent>
            </Field>
          )
        })}
      </RadioGroup>
    </section>
  )
}

export function AdvancedOptionsPopover(props: {
  data: DissolvefCardState
  direct: boolean
  disabled?: boolean
  onPatch: (patch: Partial<DissolvefCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={tNode("dissolvef", "aria.advancedOptions", "dissolvef advanced options")} disabled={props.disabled} size="icon-sm" variant="outline">
              <ShieldAlert />
              <span className="sr-only">{tNode("dissolvef", "advanced.title", "高级选项")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("dissolvef", "advanced.title", "高级选项")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,520px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("dissolvef", "advanced.title", "高级选项")}</div>
          <p className="text-xs text-muted-foreground">{tNode("dissolvef", "advanced.description", "相似度阈值、排除关键词、冲突策略和历史路径集中在这里。")}</p>
        </div>
        <div className="grid gap-3">
          <NumberField
            label={tNode("dissolvef", "labels.similarityThreshold", "相似度阈值")}
            value={props.data.similarityThreshold ?? DEFAULT_THRESHOLD}
            min={0}
            max={1}
            step={0.05}
            disabled={props.disabled || props.direct || !(props.data.enableSimilarity ?? true)}
            onChange={(similarityThreshold) => props.onPatch({ similarityThreshold })}
          />
          <TextField
            label={tNode("dissolvef", "labels.excludeKeywords", "排除关键词")}
            placeholder={tNode("dissolvef", "advanced.excludePlaceholder", "逗号或换行分隔，如: CG, pixiv")}
            value={props.data.excludeText ?? ""}
            disabled={props.disabled}
            onChange={(excludeText) => props.onPatch({ excludeText })}
          />
          <TextField
            label={tNode("dissolvef", "labels.historyPath", "历史路径")}
            placeholder={tNode("dissolvef", "advanced.historyPlaceholder", "留空则使用默认历史文件")}
            value={props.data.historyPath ?? ""}
            disabled={props.disabled}
            onChange={(historyPath) => props.onPatch({ historyPath })}
          />
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={tNode("dissolvef", "labels.fileConflict", "文件冲突")}
              value={props.data.fileConflict ?? "auto"}
              disabled={props.disabled || !props.direct}
              values={CONFLICT_MODES.map((item) => [item.value, tNode("dissolvef", `conflictModes.${item.value}.label`, item.label)])}
              onChange={(fileConflict) => props.onPatch({ fileConflict: fileConflict as DissolvefConflictMode })}
            />
            <SelectField
              label={tNode("dissolvef", "labels.dirConflict", "目录冲突")}
              value={props.data.dirConflict ?? "auto"}
              disabled={props.disabled || !props.direct}
              values={CONFLICT_MODES.map((item) => [item.value, tNode("dissolvef", `conflictModes.${item.value}.label`, item.label)])}
              onChange={(dirConflict) => props.onPatch({ dirConflict: dirConflict as DissolvefConflictMode })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: DissolvefStatusMeta
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
  compact?: boolean
  checked: boolean
  description?: string
  disabled?: boolean
  icon?: LucideIcon
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  const Icon = props.icon
  return (
    <Field orientation="horizontal" className="min-w-0 items-center gap-1.5 rounded-md border bg-card/72 px-2 py-1.5">
      <FieldContent className="min-w-0 gap-0.5">
        <FieldTitle className="min-w-0 text-xs">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-xs font-medium">{props.label}</span>
        </FieldTitle>
        {!props.compact && props.description && <FieldDescription className="line-clamp-2 text-[11px]">{props.description}</FieldDescription>}
      </FieldContent>
      <Switch aria-label={props.label} checked={props.checked} disabled={props.disabled} size="default" onCheckedChange={props.onCheckedChange} />
      {props.description && <InfoHint label={props.label} description={props.description} />}
    </Field>
  )
}

export function PlanList(props: {
  compact?: boolean
  result: DissolvefCardState["result"]
}) {
  const plan = props.result?.plan ?? []
  const lines = plan.map((item) => `${item.status} ${item.mode} ${item.operation} ${item.sourcePath}${item.targetPath ? ` -> ${item.targetPath}` : item.reason ? ` / ${item.reason}` : ""}`)
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{lines.length ? tNode("dissolvef", "boards.itemCount", "{{count}} 项", { count: lines.length }) : tNode("dissolvef", "boards.waitingRun", "等待运行")}</span>
        </div>
        <Badge variant="outline">{tNode("dissolvef", "boards.total", "总计 {{count}}", { count: props.result?.totalCount ?? 0 })}</Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {lines.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {lines.slice(0, 120).join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("dissolvef", "boards.planListEmpty", "运行后会显示移动和删除计划。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function HistoryPanel(props: {
  compact?: boolean
  result: DissolvefCardState["result"]
  onUndo: (id: string) => void
}) {
  const history = props.result?.history ?? []
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{history.length ? tNode("dissolvef", "boards.historyCount", "{{count}} 条", { count: history.length }) : tNode("dissolvef", "boards.noHistory", "无历史")}</span>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {history.length ? (
          <div className="grid gap-1 p-2">
            {history.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/45">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{item.id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{tNode("dissolvef", "boards.historyMeta", "{{mode}} / {{count}} 项{{undone}}", { mode: item.mode, count: item.count, undone: item.undone ? tNode("dissolvef", "boards.undoneSuffix", " / 已撤销") : "" })}</div>
                </div>
                {!item.undone && (
                  <Button aria-label={tNode("dissolvef", "actions.undoItem", "撤销 {{id}}", { id: item.id })} disabled={props.result === undefined} size="xs" variant="ghost" onClick={() => props.onUndo(item.id)}>
                    {tNode("dissolvef", "undo", "撤销")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("dissolvef", "boards.historyEmpty", "执行操作后会记录历史，可用于撤销。")}
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
          <span>{props.logs.length ? tNode("dissolvef", "boards.lineCount", "{{count}} 行", { count: props.logs.length }) : tNode("dissolvef", "boards.waitingLogs", "等待日志")}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          {tNode("dissolvef", "actions.copy", "复制")}
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
            {tNode("dissolvef", "boards.logsEmpty", "运行日志会显示在这里。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function DissolvePlanBoard(props: {
  compact?: boolean
  result: DissolvefCardState["result"]
}) {
  const plan = props.result?.plan ?? []
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5 shrink-0" />
          <span>{plan.length ? tNode("dissolvef", "boards.itemCount", "{{count}} 项", { count: plan.length }) : tNode("dissolvef", "boards.waitingRun", "等待运行")}</span>
        </div>
        <Badge variant="outline">{tNode("dissolvef", "boards.total", "总计 {{count}}", { count: props.result?.totalCount ?? 0 })}</Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {plan.length ? (
          <div className={cn("grid gap-1.5", props.compact ? "p-2" : "p-3")}>
            {plan.slice(0, 140).map((item, index) => (
              <DissolvePlanRow key={`${item.sourcePath}:${item.targetPath}:${index}`} compact={props.compact} item={item} />
            ))}
          </div>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("dissolvef", "boards.planBoardEmpty", "运行后显示上提、删除空壳和冲突跳过项。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function DissolveHistoryBoard(props: {
  compact?: boolean
  result: DissolvefCardState["result"]
  onUndo: (id: string) => void
}) {
  const history = props.result?.history ?? []
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" />
          <span>{history.length ? tNode("dissolvef", "boards.historyCount", "{{count}} 条", { count: history.length }) : tNode("dissolvef", "boards.noHistory", "无历史")}</span>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {history.length ? (
          <div className={cn("grid gap-1.5", props.compact ? "p-2" : "p-3")}>
            {history.map((item) => (
              <div key={item.id} className={cn("flex min-w-0 items-center gap-2 rounded-md border px-2 py-2", item.undone && "opacity-70")}>
                <Clock3 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <span className="truncate">{item.mode}</span>
                    <Badge variant={item.undone ? "outline" : "secondary"}>{tNode("dissolvef", "boards.itemCount", "{{count}} 项", { count: item.count })}</Badge>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{item.id} / {item.path}</div>
                </div>
                {!item.undone && (
                  <Button aria-label={tNode("dissolvef", "actions.undoItem", "撤销 {{id}}", { id: item.id })} disabled={props.result === undefined} size="xs" variant="ghost" onClick={() => props.onUndo(item.id)}>
                    <Undo2 data-icon="inline-start" />
                    {tNode("dissolvef", "undo", "撤销")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("dissolvef", "boards.historyEmpty", "执行操作后会记录历史，可用于撤销。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function RichLogPanel(props: {
  compact?: boolean
  logs: string[]
  onCopy: () => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/72">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Terminal className="size-3.5 shrink-0" />
          <span>{props.logs.length ? tNode("dissolvef", "boards.lineCount", "{{count}} 行", { count: props.logs.length }) : tNode("dissolvef", "boards.waitingLogs", "等待日志")}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          {tNode("dissolvef", "actions.copy", "复制")}
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
            {tNode("dissolvef", "boards.logsEmpty", "运行日志会显示在这里。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function DissolvePlanRow(props: {
  compact?: boolean
  item: NonNullable<DissolvefCardState["result"]>["plan"][number]
}) {
  const StatusIcon = dissolveStatusMeta(props.item.status).icon
  const status = dissolveStatusMeta(props.item.status)
  const ModeIcon = dissolveModeIcon(props.item.mode)
  const OperationIcon = props.item.operation === "delete_dir" ? Trash2 : FileSymlink
  return (
    <div className={cn("grid gap-1.5 rounded-md border px-2 py-2", props.item.status === "error" && "border-destructive/40", props.item.status === "skipped" && "opacity-75")}>
      <div className="flex min-w-0 items-center gap-2">
        <ModeIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{props.item.status} {props.item.mode} {props.item.operation}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <OperationIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{baseName(props.item.sourcePath)}</span>
            {props.item.operation === "move" && <ArrowRight className="size-3 shrink-0 text-muted-foreground" />}
            {props.item.operation === "move" && <span className="truncate">{baseName(props.item.targetPath)}</span>}
          </div>
          {!props.compact && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {props.item.sourcePath}{props.item.targetPath ? ` -> ${props.item.targetPath}` : ""}
            </div>
          )}
        </div>
        <Badge variant={status.variant} className="gap-1">
          <StatusIcon className="size-3" />
          {status.label}
        </Badge>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{props.item.reason || props.item.mode}</span>
        {props.item.similarity !== undefined && <span className="shrink-0 tabular-nums">{Math.round(props.item.similarity * 100)}%</span>}
      </div>
    </div>
  )
}

function dissolveStatusMeta(status: NonNullable<DissolvefCardState["result"]>["plan"][number]["status"]) {
  if (status === "success") return { icon: CheckCircle2, label: tNode("dissolvef", "planStatus.success", "完成"), variant: "default" as const }
  if (status === "error") return { icon: XCircle, label: tNode("dissolvef", "planStatus.error", "错误"), variant: "destructive" as const }
  if (status === "skipped") return { icon: AlertTriangle, label: tNode("dissolvef", "planStatus.skipped", "跳过"), variant: "outline" as const }
  return { icon: CircleDashed, label: tNode("dissolvef", "planStatus.pending", "待执行"), variant: "secondary" as const }
}

function dissolveModeIcon(mode: NonNullable<DissolvefCardState["result"]>["plan"][number]["mode"]) {
  if (mode === "direct") return PackageOpen
  return BUNDLE_MODES.find((item) => item.value === mode)?.icon ?? Layers
}

function baseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path || tNode("dissolvef", "boards.unspecified", "未指定")
}

function InfoHint({ description, label }: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={tNode("dissolvef", "aria.description", "{{label}}说明", { label })}
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
  const id = `dissolvef-${props.label}`
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

function NumberField(props: {
  disabled?: boolean
  label: string
  max?: number
  min?: number
  onChange: (value: number) => void
  step?: number
  value: number
}) {
  const id = `dissolvef-${props.label}`
  return (
    <Field className="min-w-0 gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs">{props.label}</FieldLabel>
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
    </Field>
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
    <Field className="min-w-0 gap-1.5">
      <FieldTitle className="text-xs">{props.label}</FieldTitle>
      <ToggleGroup
        aria-label={props.label}
        className="grid w-full grid-cols-4"
        disabled={props.disabled}
        size="sm"
        type="single"
        value={props.value}
        variant="outline"
        onValueChange={(value) => { if (value) props.onChange(value) }}
      >
        {props.values.map(([value, label]) => (
          <ToggleGroupItem
            key={value}
            aria-label={`${props.label} ${label}`}
            className="min-w-0"
            value={value}
          >
            <span className="truncate">{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}
