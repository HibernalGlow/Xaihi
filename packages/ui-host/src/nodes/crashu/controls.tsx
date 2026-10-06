import type { LucideIcon } from "lucide-react"
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clipboard, Copy, DatabaseZap, Eraser, Folder, GitCompareArrows, Info, ListChecks, ShieldAlert, Terminal, XCircle } from "lucide-react"
import type { CrashuConflictPolicy, CrashuMoveDirection } from "@xiranite/node-crashu/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PathTextarea } from "@/components/ui/path-input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tNode } from "@/nodes/shared/useNodeI18n"
import { CONFLICT_POLICIES, DEFAULT_THRESHOLD, MOVE_DIRECTIONS } from "./constants"
import type { CrashuCardState, CrashuStatusMeta } from "./types"
import { RubberSegment } from "@/components/ui/rubber-segment"

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

export function SourcePathsInput(props: {
  compact?: boolean
  disabled?: boolean
  pathCount: number
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <Field className="min-h-0 min-w-0 gap-1.5">
      {!props.compact && (
        <FieldTitle className="flex items-center justify-between gap-2">
          <span>{tNode("crashu", "input.sourceFolders", "源目录")}</span>
          <Badge variant="outline" className="shrink-0">{tNode("crashu", "input.lineCount", "{{count}} 条", { count: props.pathCount })}</Badge>
        </FieldTitle>
      )}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <PathTextarea
          id="crashu-sources"
          aria-label={tNode("crashu", "aria.sourcePaths", "crashu source paths")}
          className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-24")}
          disabled={props.disabled}
          placeholder={tNode("crashu", "input.sourcePlaceholder", "每行一个源根目录\nD:/source/gallery")}
          value={props.value}
          onValueChange={props.onChange}
        />
        <div className="grid content-start gap-1.5">
          <ActionIconButton disabled={props.disabled} icon={Clipboard} label={tNode("crashu", "input.pasteSources", "粘贴源目录")} onClick={props.onPaste} />
          <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label={tNode("crashu", "input.clearSources", "清空源目录")} onClick={props.onClear} />
        </div>
      </div>
    </Field>
  )
}

export function TargetNamesInput(props: {
  compact?: boolean
  disabled?: boolean
  targetCount: number
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field className="min-h-0 min-w-0 gap-1.5">
      {!props.compact && (
        <FieldTitle className="flex items-center justify-between gap-2">
          <span>{tNode("crashu", "input.targetNames", "目标名称")}</span>
          <Badge variant="outline" className="shrink-0">{tNode("crashu", "input.lineCount", "{{count}} 条", { count: props.targetCount })}</Badge>
        </FieldTitle>
      )}
      <Textarea
        id="crashu-targets"
        aria-label={tNode("crashu", "aria.targetNames", "crashu target names")}
        className={cn("min-h-0 resize-none font-mono text-xs", props.compact ? "h-14" : "h-20")}
        disabled={props.disabled}
        placeholder={tNode("crashu", "input.targetPlaceholder", "每行一个目标文件夹名，或填写目标目录自动读取")}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </Field>
  )
}

export function DirectionPicker(props: {
  disabled?: boolean
  value: CrashuMoveDirection
  onChange: (value: CrashuMoveDirection) => void
}) {
  return (
    <RubberSegment
      aria-label={tNode("crashu", "aria.moveDirection", "crashu move direction")}
      className="w-full"
      disabled={props.disabled}
      size="sm"
      value={props.value}
      onChange={value => props.onChange(value as CrashuMoveDirection)}
      items={MOVE_DIRECTIONS.map(item => ({
        value: item.value,
        label:
          item.value === "to_target"
            ? tNode("crashu", "moveDirection.toTarget", "源 → 目标")
            : tNode("crashu", "moveDirection.toSource", "目标 → 源"),
      }))}
    />
  )
}

export function ConflictPicker(props: {
  disabled?: boolean
  value: CrashuConflictPolicy
  onChange: (value: CrashuConflictPolicy) => void
}) {
  return (
    <RubberSegment
      aria-label={tNode("crashu", "aria.conflictPolicy", "crashu conflict policy")}
      className="w-full"
      disabled={props.disabled}
      size="sm"
      value={props.value}
      onChange={value => props.onChange(value as CrashuConflictPolicy)}
      items={CONFLICT_POLICIES.map(item => ({
        value: item.value,
        label: tNode("crashu", `conflictPolicy.${item.value}`, item.value),
      }))}
    />
  )
}

export function PrimarySwitches(props: {
  className?: string
  compact?: boolean
  data: CrashuCardState
  disabled?: boolean
  onPatch: (patch: Partial<CrashuCardState>) => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        props.compact ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]",
        props.className,
      )}
      data-testid="crashu-primary-switches"
    >
      <SwitchRow
        compact={props.compact}
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={ShieldAlert}
        label={tNode("crashu", "fields.preview", "预演")}
        description={tNode("crashu", "fields.previewDescription", "开启后只扫描和生成计划，不真实移动文件夹。关闭后会执行真实移动。")}
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
    </div>
  )
}

export function AdvancedOptionsPopover(props: {
  data: CrashuCardState
  disabled?: boolean
  onPatch: (patch: Partial<CrashuCardState>) => void
}) {
  const label = tNode("crashu", "aria.advancedOptions", "crashu advanced options")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={label} className="xiranite-no-drag" disabled={props.disabled} size="icon-sm" variant="outline" onPointerDown={(event) => event.stopPropagation()}>
              <ShieldAlert />
              <span className="sr-only">{tNode("crashu", "advanced.title", "高级选项")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("crashu", "advanced.title", "高级选项")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,520px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("crashu", "advanced.title", "高级选项")}</div>
          <p className="text-xs text-muted-foreground">{tNode("crashu", "advanced.description", "相似度阈值、目标目录和冲突策略集中在这里。")}</p>
        </div>
        <div className="grid gap-3">
          <NumberField
            label={tNode("crashu", "fields.similarityThreshold", "相似度阈值")}
            value={props.data.similarityThreshold ?? DEFAULT_THRESHOLD}
            min={0}
            max={1}
            step={0.05}
            disabled={props.disabled}
            onChange={(similarityThreshold) => props.onPatch({ similarityThreshold })}
          />
          <TextField
            label={tNode("crashu", "fields.targetFolder", "目标目录")}
            placeholder={tNode("crashu", "fields.targetFolderPlaceholder", "填写目录可自动读取子文件夹作为目标名")}
            value={props.data.targetPath ?? ""}
            disabled={props.disabled}
            onChange={(targetPath) => props.onPatch({ targetPath })}
          />
          <TextField
            label={tNode("crashu", "fields.destinationRoot", "移动目标根目录")}
            placeholder={tNode("crashu", "fields.destinationRootPlaceholder", "移动操作的最终根目录")}
            value={props.data.destinationPath ?? ""}
            disabled={props.disabled}
            onChange={(destinationPath) => props.onPatch({ destinationPath })}
          />
          <Field className="gap-1.5">
            <FieldTitle className="text-xs">{tNode("crashu", "labels.moveDirection", "移动方向")}</FieldTitle>
            <DirectionPicker disabled={props.disabled} value={props.data.moveDirection ?? "to_target"} onChange={(moveDirection) => props.onPatch({ moveDirection })} />
          </Field>
          <Field className="gap-1.5">
            <FieldTitle className="text-xs">{tNode("crashu", "labels.conflictPolicy", "冲突策略")}</FieldTitle>
            <ConflictPicker disabled={props.disabled} value={props.data.conflictPolicy ?? "skip"} onChange={(conflictPolicy) => props.onPatch({ conflictPolicy })} />
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<CrashuCardState>
  disabled?: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  const label = tNode("crashu", "aria.defaults", "crashu defaults")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={label} className="xiranite-no-drag" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"} onPointerDown={(event) => event.stopPropagation()}>
              <DatabaseZap />
              <span className="sr-only">{tNode("crashu", "defaults.title", "默认配置")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tNode("crashu", "defaults.title", "默认配置")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">{tNode("crashu", "defaults.title", "默认配置")}</div>
          <p className="text-xs text-muted-foreground">{tNode("crashu", "defaults.description", "保存 Crashu 的源目录、目标和移动策略到明文配置。")}</p>
        </div>
        <div className="grid gap-2">
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>{tNode("crashu", "defaults.save", "保存为默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>{tNode("crashu", "defaults.restore", "恢复默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>{tNode("crashu", "defaults.clear", "清除覆盖")}</Button>
          <Separator />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">{tNode("crashu", "defaults.view", "查看配置")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{tNode("crashu", "defaults.dialogTitle", "Crashu 配置")}</DialogTitle>
                <DialogDescription>{tNode("crashu", "defaults.dialogDescription", "当前 nodes.crashu 默认值和配置文件位置。")}</DialogDescription>
              </DialogHeader>
              <ConfigPreview config={props.defaults} path={props.configFilePath} />
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>{tNode("crashu", "defaults.openFile", "打开文件")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: CrashuStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-md border bg-card p-2", props.compact && "p-1.5")}>
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
    <Field orientation="horizontal" className="min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
      <FieldContent className="min-w-0 gap-0.5">
        <FieldTitle className="min-w-0 text-xs">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-xs font-medium">{props.label}</span>
        </FieldTitle>
        {!props.compact && props.description && <FieldDescription className="line-clamp-2 text-[11px]">{props.description}</FieldDescription>}
      </FieldContent>
      <Switch aria-label={props.label} checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      {props.description && <InfoHint label={props.label} description={props.description} />}
    </Field>
  )
}

export function MatchList(props: {
  compact?: boolean
  result: CrashuCardState["result"]
}) {
  const matches = props.result?.similarFolders ?? []
  const plan = props.result?.plan ?? []
  const lines = plan.length
    ? plan.map((item) => `${item.status} ${Math.round(item.similarity * 100)}% ${item.sourcePath}${item.destinationPath ? ` -> ${item.destinationPath}` : ` / ${item.reason}`}`)
    : matches.map((item) => `${Math.round(item.similarity * 100)}% ${item.name} -> ${item.target}`)
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{lines.length ? tNode("crashu", "boards.itemCount", "{{count}} 项", { count: lines.length }) : tNode("crashu", "boards.waitingRun", "等待运行")}</span>
        </div>
        <Badge variant="outline">{tNode("crashu", "boards.matches", "匹配 {{count}}", { count: matches.length })}</Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {lines.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {lines.slice(0, 120).join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("crashu", "boards.matchListEmpty", "运行后会显示匹配和移动计划。")}
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
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{props.logs.length ? tNode("crashu", "boards.lineCount", "{{count}} 行", { count: props.logs.length }) : tNode("crashu", "boards.waitingLogs", "等待日志")}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          {tNode("crashu", "actions.copy", "复制")}
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
            {tNode("crashu", "boards.logsEmpty", "运行日志会显示在这里。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function MatchPlanBoard(props: {
  compact?: boolean
  result: CrashuCardState["result"]
}) {
  const matches = props.result?.similarFolders ?? []
  const plan = props.result?.plan ?? []
  const total = plan.length || matches.length
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5 shrink-0" />
          <span>{total ? tNode("crashu", "boards.itemCount", "{{count}} 项", { count: total }) : tNode("crashu", "boards.waitingRun", "等待运行")}</span>
        </div>
        <Badge variant="outline">{tNode("crashu", "boards.matches", "匹配 {{count}}", { count: matches.length })}</Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {total ? (
          <div className={cn("grid gap-1.5", props.compact ? "p-2" : "p-3")}>
            {plan.length
              ? plan.slice(0, 120).map((item, index) => (
                <CrashuPlanRow key={`${item.sourcePath}:${item.destinationPath}:${index}`} compact={props.compact} item={item} />
              ))
              : matches.slice(0, 120).map((item, index) => (
                <CrashuMatchRow key={`${item.path}:${item.target}:${index}`} compact={props.compact} item={item} />
              ))}
          </div>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {tNode("crashu", "boards.matchBoardEmpty", "运行后显示匹配通道、相似度和移动计划。")}
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
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Terminal className="size-3.5 shrink-0" />
          <span>{props.logs.length ? tNode("crashu", "boards.lineCount", "{{count}} 行", { count: props.logs.length }) : tNode("crashu", "boards.waitingLogs", "等待日志")}</span>
        </div>
        <Button disabled={!props.logs.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          {tNode("crashu", "actions.copy", "复制")}
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
            {tNode("crashu", "boards.logsEmpty", "运行日志会显示在这里。")}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function CrashuMatchRow(props: {
  compact?: boolean
  item: NonNullable<CrashuCardState["result"]>["similarFolders"][number]
}) {
  const score = Math.round(props.item.similarity * 100)
  return (
    <div className="grid gap-1.5 rounded-md border px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <GitCompareArrows className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <span className="truncate">{props.item.name}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{props.item.target}</span>
          </div>
          {!props.compact && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{props.item.matchSrc} / {props.item.matchTgt}</div>
          )}
        </div>
        <Badge variant={score >= 85 ? "default" : "outline"}>{score}%</Badge>
      </div>
      <Progress value={score} className="h-1.5 bg-muted" label={`${score}%`} />
    </div>
  )
}

function CrashuPlanRow(props: {
  compact?: boolean
  item: NonNullable<CrashuCardState["result"]>["plan"][number]
}) {
  const score = Math.round(props.item.similarity * 100)
  const meta = crashuPlanStatusMeta(props.item.status)
  const StatusIcon = meta.icon
  return (
    <div className={cn("grid gap-1.5 rounded-md border px-2 py-2", props.item.status === "error" && "border-destructive/40", props.item.status === "skipped" && "opacity-75")}>
      <div className="flex min-w-0 items-center gap-2">
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <span className="truncate">{baseName(props.item.sourcePath)}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{baseName(props.item.destinationPath || props.item.targetName)}</span>
          </div>
          {!props.compact && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {props.item.sourcePath}{props.item.destinationPath ? ` -> ${props.item.destinationPath}` : ""}
            </div>
          )}
        </div>
        <Badge variant={meta.variant} className="gap-1">
          <StatusIcon className="size-3" />
          {meta.label}
        </Badge>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{props.item.reason || props.item.direction}</span>
        <span className="shrink-0 tabular-nums">{score}%</span>
      </div>
    </div>
  )
}

function crashuPlanStatusMeta(status: NonNullable<CrashuCardState["result"]>["plan"][number]["status"]) {
  if (status === "success") return { icon: CheckCircle2, label: tNode("crashu", "planStatus.success", "完成"), variant: "default" as const }
  if (status === "error") return { icon: XCircle, label: tNode("crashu", "planStatus.error", "错误"), variant: "destructive" as const }
  if (status === "skipped") return { icon: AlertTriangle, label: tNode("crashu", "planStatus.skipped", "跳过"), variant: "outline" as const }
  return { icon: CircleDashed, label: tNode("crashu", "planStatus.pending", "待执行"), variant: "secondary" as const }
}

function baseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path || tNode("crashu", "boards.unspecified", "未指定")
}

function ConfigPreview(props: {
  config?: Partial<CrashuCardState>
  path?: string
}) {
  const content = props.config === undefined
    ? tNode("crashu", "defaults.none", "# nodes.crashu 暂无默认配置\n")
    : JSON.stringify(props.config, null, 2)
  return (
    <div className="grid gap-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{tNode("crashu", "defaults.configFile", "配置文件")}</div>
        <div className="mt-1 break-all font-mono text-xs">{props.path ?? tNode("crashu", "defaults.noConfigService", "未连接本地配置服务")}</div>
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
          aria-label={tNode("crashu", "aria.description", "{{label}}说明", { label })}
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
  const id = `crashu-${props.label}`
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
  const id = `crashu-${props.label}`
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
