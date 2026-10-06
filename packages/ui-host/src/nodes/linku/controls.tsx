import type { LucideIcon } from "lucide-react"
import { Clipboard, DatabaseZap, Eraser, Info, Link2, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import type { LinkuActionMeta } from "./constants"
import { ACTIONS } from "./constants"
import type { LinkuCardState, LinkuStatusMeta } from "./types"

export function ActionIconButton(props: {
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
          variant={props.destructive ? "destructive" : "outline"}
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

/** 源/目标/配置路径输入框，带粘贴和清空按钮 */
export function PathField(props: {
  compact?: boolean
  disabled?: boolean
  id: string
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <FieldGroup className="gap-2">
      <Field className="gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={props.id} className="text-xs">{props.label}</FieldLabel>
          <div className="flex shrink-0 items-center gap-1">
            <ActionIconButton disabled={props.disabled} icon={Clipboard} label="粘贴" onClick={props.onPaste} />
            <ActionIconButton disabled={props.disabled || !props.value} icon={Eraser} label="清空" onClick={props.onClear} />
          </div>
        </div>
        <Input
          id={props.id}
          aria-label={props.label}
          className={cn("min-h-0 font-mono text-xs", props.compact ? "h-8" : "h-9")}
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      </Field>
    </FieldGroup>
  )
}

/**
 * 横向 action 工具栏：info / create / move / list / recover / restore
 *
 * 危险动作的确认交给 `ExecuteButton` 的引信闸门，节点侧不再自带确认弹窗。图标态
 * 只靠 `aria-label` 命名（与 `recycleu` 的 `IconConfirmButton` 同一口径）：
 * `TooltipTrigger asChild` 会把指针/焦点处理器注到直接子元素上，而 ExecuteButton
 * 不接收这些 prop，包进来只会得到一颗永不弹出的 tooltip。
 */
export function ActionBar(props: {
  activeAction?: string
  disabled?: boolean
  onRun: (action: LinkuActionMeta["value"]) => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" data-testid="linku-action-bar">
      {ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <ExecuteButton
            key={action.value}
            compact
            dangerous={Boolean(action.destructive)}
            disabled={props.disabled}
            idleIcon={<Icon />}
            label={action.label}
            variant={action.destructive ? "destructive" : props.activeAction === action.value ? "secondary" : "outline"}
            onExecute={() => props.onRun(action.value)}
          />
        )
      })}
    </div>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: LinkuStatusMeta
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

/** 高级选项：configPath 在这里，低频参数收进 Popover */
export function AdvancedOptionsPopover(props: {
  configPath: string
  disabled?: boolean
  onPatch: (patch: Partial<LinkuCardState>) => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="linku advanced options" disabled={props.disabled} size="icon-sm" variant="outline">
              <Settings2 />
              <span className="sr-only">高级选项</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>高级选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">高级选项</div>
          <p className="text-xs text-muted-foreground">链接记录配置文件路径，留空则使用默认位置。</p>
        </div>
        <FieldGroup className="gap-2">
          <Field className="gap-1.5">
            <Label htmlFor="linku-configPath" className="text-xs">配置文件路径</Label>
            <Input
              id="linku-configPath"
              className="h-8 font-mono text-xs"
              disabled={props.disabled}
              placeholder="%APPDATA%/Xiranite/linku.toml"
              value={props.configPath}
              onChange={(event) => props.onPatch({ configPath: event.currentTarget.value })}
            />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<LinkuCardState>
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
            <Button aria-label="linku defaults" disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">保存 Linku 的源路径、目标路径和配置文件位置到明文配置。</p>
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
                <DialogTitle>Linku 配置</DialogTitle>
                <DialogDescription>当前 nodes.linku 默认值和配置文件位置。</DialogDescription>
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

function ConfigPreview(props: {
  config?: Partial<LinkuCardState>
  path?: string
}) {
  const content = props.config === undefined ? "# nodes.linku 暂无默认配置\n" : JSON.stringify(props.config, null, 2)
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

/** 紧凑态用：把信息提示收成 Info 图标 */
export function InfoHint({ description, label }: { description: string; label: string }) {
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

/** 链接图标，用于 HeaderLine */
export { Link2 as LinkuIcon }
