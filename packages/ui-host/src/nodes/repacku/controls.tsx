import type { LucideIcon } from "lucide-react"
import { Clipboard, Eye, FileText, FolderOpen, Info, SlidersHorizontal, Trash2 } from "lucide-react"
import type { RepackuAction } from "@xiranite/node-repacku/core"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ACTIONS } from "./constants"
import type { RepackuCardState, RepackuStatusMeta } from "./types"

interface CommonControlProps {
  data: RepackuCardState
  disabled: boolean
  onPatch: (patch: Partial<RepackuCardState>) => void
}

export function PathInput({ compact = false, data, disabled, id = "repacku-path", onPaste, onPatch }: CommonControlProps & {
  compact?: boolean
  id?: string
  onPaste: () => void
}) {
  return (
    <FieldGroup className={compact ? "gap-1" : "gap-3"}>
      <Field className="gap-1.5">
        <FieldLabel className={compact ? "sr-only" : undefined} htmlFor={id}>文件夹路径</FieldLabel>
        <InputGroup>
          <FolderOpen />
          <InputGroupInput
            id={id}
            disabled={disabled}
            placeholder="D:\\archive\\source"
            value={data.path ?? ""}
            onChange={(event) => onPatch({ path: event.currentTarget.value })}
          />
          <InputGroupButton disabled={disabled} onClick={onPaste} variant="ghost">
            <Clipboard data-icon="inline-start" />
            粘贴
          </InputGroupButton>
        </InputGroup>
      </Field>
    </FieldGroup>
  )
}

export function RepackWorkflowTabs({ action, disabled, className, onActionChange }: {
  action: RepackuAction
  disabled: boolean
  className?: string
  onActionChange: (value: RepackuAction) => void
}) {
  return (
    <Tabs className={cn("min-w-0", className)} value={action} onValueChange={(value) => onActionChange(value as RepackuAction)}>
      <TabsList aria-label="打包流程" variant="line" className="flex w-full justify-start overflow-x-auto">
        {ACTIONS.map((item) => (
          <TabsTrigger key={item.value} disabled={disabled} value={item.value} className="shrink-0">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function CompactOptionsPanel({ data, disabled, onPatch }: CommonControlProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CompactSwitch
        checked={data.dryRun ?? true}
        disabled={disabled}
        icon={Eye}
        label="预演"
        ariaLabel="预演模式"
        description="不写归档"
        onCheckedChange={(value) => onPatch({ dryRun: value })}
      />
      <CompactSwitch
        checked={data.deleteAfter ?? false}
        disabled={disabled}
        icon={Trash2}
        label="删源"
        ariaLabel="删除源文件"
        description="成功后"
        onCheckedChange={(value) => onPatch({ deleteAfter: value })}
      />
    </div>
  )
}

export function OptionsPanel({ data, disabled, onPatch }: CommonControlProps) {
  return (
    <section className="flex shrink-0 flex-col gap-3 border-b pb-3">
      <div>
        <div className="text-sm font-semibold">选项</div>
        <div className="text-xs text-muted-foreground">常用项留在卡片内，按容器空间自动换行。</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="repacku-types">目标文件类型</FieldLabel>
          <Input
            id="repacku-types"
            disabled={disabled}
            placeholder="image, document"
            value={data.typesText ?? ""}
            onChange={(event) => onPatch({ typesText: event.currentTarget.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="repacku-min-count">最少文件数</FieldLabel>
          <Input
            id="repacku-min-count"
            disabled={disabled}
            min={1}
            type="number"
            value={data.minCount ?? 2}
            onChange={(event) => onPatch({ minCount: Number(event.currentTarget.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <SwitchField
          checked={data.dryRun ?? true}
          disabled={disabled}
          icon={Eye}
          label="预演模式"
          description="只生成计划，不写归档。"
          onCheckedChange={(value) => onPatch({ dryRun: value })}
        />
        <SwitchField
          checked={data.deleteAfter ?? false}
          disabled={disabled}
          icon={Trash2}
          label="删除源文件"
          description="仅在压缩成功后执行。"
          onCheckedChange={(value) => onPatch({ deleteAfter: value })}
        />
      </div>
    </section>
  )
}

export function StatusStrip({ compact = false, progress, status, text }: {
  compact?: boolean
  progress: number
  status: RepackuStatusMeta
  text?: string
}) {
  return (
    <Alert className={cn("shrink-0 bg-background/70", compact && "px-3 py-2 text-xs")}>
      <SlidersHorizontal />
      <AlertTitle className={compact ? "min-h-3 text-xs" : undefined}>{status.label}</AlertTitle>
      <AlertDescription>
        <div className="flex w-full min-w-0 flex-col gap-2">
          <span className="truncate">{text || status.description}</span>
          {status.tone === "running" && <Progress value={progress} />}
        </div>
      </AlertDescription>
    </Alert>
  )
}

export function ConfigFilePanel(props: {
  compact?: boolean
  configDirty: boolean
  configFilePath?: string
  data: RepackuCardState
  defaults?: Partial<RepackuCardState>
  disabled: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onPatch: (patch: Partial<RepackuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onResetOverride: () => void
}) {
  return (
    <section className={cn("flex shrink-0 flex-col gap-3", props.compact ? "border-t pt-3" : "border-b pb-3")}>
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          运行配置
          {props.configDirty && <span className="text-xs font-normal text-muted-foreground">已覆盖默认值</span>}
        </div>
        {!props.compact && <div className="text-xs text-muted-foreground">默认值和可选 JSON 配置在卡片内编辑，不打开额外侧栏。</div>}
      </div>
      <Field>
        <FieldLabel htmlFor="repacku-config-path">配置 JSON 路径</FieldLabel>
        <Input
          id="repacku-config-path"
          disabled={props.disabled}
          placeholder="可选的已有配置路径"
          value={props.data.configPath ?? ""}
          onChange={(event) => props.onPatch({ configPath: event.currentTarget.value })}
        />
        {!props.compact && <FieldDescription>按配置压缩会使用它；分析完成后也会回填。</FieldDescription>}
      </Field>
      {!props.compact && <div className="grid grid-cols-2 gap-2 @md/repacku:grid-cols-5">
        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={!props.configFilePath} size={props.compact ? "sm" : "default"} variant="outline">
              <FileText data-icon="inline-start" />
              查看
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Repacku 配置</DialogTitle>
              <DialogDescription>网页端可直接查看当前明文配置位置和 nodes.repacku 默认值。</DialogDescription>
            </DialogHeader>
            <ConfigPreview config={props.defaults} nodeId="repacku" path={props.configFilePath} />
          </DialogContent>
        </Dialog>
        <Button disabled={!props.onOpenConfigFile} size={props.compact ? "sm" : "default"} variant="outline" onClick={() => void props.onOpenConfigFile?.()}>
          <FolderOpen data-icon="inline-start" />
          打开
        </Button>
        <Button disabled={props.disabled} size={props.compact ? "sm" : "default"} variant="outline" onClick={props.onSaveDefault}>保存默认</Button>
        <Button disabled={props.disabled} size={props.compact ? "sm" : "default"} variant="outline" onClick={props.onRestoreDefault}>恢复默认</Button>
        <Button disabled={props.disabled} size={props.compact ? "sm" : "default"} variant="ghost" onClick={props.onResetOverride}>清除覆盖</Button>
      </div>}
      {!props.compact && (
        <Button disabled={props.disabled} variant="ghost" onClick={props.onReset}>清空输出</Button>
      )}
    </section>
  )
}

function ConfigPreview(props: {
  config?: Partial<RepackuCardState>
  nodeId: string
  path?: string
}) {
  const content = props.config === undefined
    ? `# nodes.${props.nodeId} 暂无默认配置\n`
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

function CompactSwitch(props: {
  checked: boolean
  description: string
  disabled: boolean
  icon: LucideIcon
  label: string
  ariaLabel: string
  onCheckedChange: (value: boolean) => void
}) {
  const Icon = props.icon
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5", props.disabled && "opacity-60")}>
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{props.label}</span>
        <Switch
          aria-label={props.ariaLabel}
          checked={props.checked}
          className="ml-auto"
          disabled={props.disabled}
          size="sm"
          onCheckedChange={props.onCheckedChange}
        />
      </label>
      <InfoHint label={props.label} description={props.description} />
    </div>
  )
}

function SwitchField({ checked, description, disabled, icon: Icon, label, onCheckedChange }: {
  checked: boolean
  description: string
  disabled: boolean
  icon: LucideIcon
  label: string
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <Field orientation="horizontal" className="min-w-44 flex-1 rounded-md bg-muted/30 p-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      <FieldContent>
        <div className="flex min-w-0 items-center gap-1.5">
          <FieldTitle className="truncate">{label}</FieldTitle>
          <InfoHint label={label} description={description} />
        </div>
        <FieldDescription className="sr-only">{description}</FieldDescription>
      </FieldContent>
    </Field>
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
