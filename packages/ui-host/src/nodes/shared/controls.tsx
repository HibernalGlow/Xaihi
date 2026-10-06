import type { ComponentPropsWithoutRef, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { DatabaseZap, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface NodeStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

/**
 * RunningTint — 卡片背景状态层
 *
 * 替代节点 CollapsedView 中手写的 `animate-pulse bg-primary/10` 模式：
 * - running：背景轻染色 + BorderBeam 流光边框
 * - error：背景 destructive 轻染色
 * - success：背景 primary 轻染色
 * - idle / warning：透明
 *
 * 必须放在 position: relative 的父容器中（自身 absolute 贴满）。
 */
export function RunningTint(props: {
  tone: NodeStatusMeta["tone"]
  className?: string
}) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-0 opacity-70 transition-opacity",
          props.tone === "running" && "bg-primary/10",
          props.tone === "error" && "bg-destructive/10",
          props.tone === "success" && "bg-primary/10",
          props.className,
        )}
        aria-hidden="true"
      />
      {props.tone === "running" && (
        <BorderBeam
          size={140}
          duration={6}
          colorFrom="var(--primary)"
          colorTo="var(--chart-2)"
          borderWidth={1.5}
        />
      )}
    </>
  )
}

/**
 * RunStateIcon — 按钮/面板里状态图标的动画落点
 *
 * 唯一一处决定 animate-spin / animate-pulse 何时挂载：
 * - running 时给 `icon` 叠加 spin（默认）或 pulse（tone="pulse"）；
 * - 传入 `idleIcon` 时，非 running 直接渲染 idleIcon（按钮图标随状态切换的场景）。
 *
 * 纯呈现层：不读业务状态，只按 running/tone 决定类名；`aria-label`/`role` 等
 * SVG 属性透传，保留各调用点原有的可访问语义。卡片背景的整块染色是 RunningTint
 * 的职责，不是这个图标助手能替代的（图标在 Button 内部，无法铺满父容器）。
 */
export interface RunStateIconProps extends ComponentPropsWithoutRef<LucideIcon> {
  icon: LucideIcon
  running?: boolean
  tone?: "spin" | "pulse"
  idleIcon?: LucideIcon
  className?: string
}

export function RunStateIcon(props: RunStateIconProps) {
  const { icon: Icon, idleIcon, running = false, tone = "spin", className, ...rest } = props
  if (!running && idleIcon) {
    const IdleIcon = idleIcon
    return <IdleIcon className={className} {...rest} />
  }
  return (
    <Icon
      className={cn(className, running && (tone === "pulse" ? "animate-pulse" : "animate-spin"))}
      {...rest}
    />
  )
}

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

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: NodeStatusMeta
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

export function HeaderLine(props: {
  icon?: LucideIcon
  label: string
  status: NodeStatusMeta
  subtitle: string
}) {
  const Icon = props.icon
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
            <Icon />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">{props.label}</h3>
            <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{props.subtitle}</p>
        </div>
      </div>
    </div>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: unknown
  description: string
  dialogDescription: string
  disabled?: boolean
  nodeKey: string
  nodeLabel: string
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  const emptyConfigText = `# nodes.${props.nodeKey} 暂无默认配置\n`
  const content = props.defaults === undefined ? emptyConfigText : JSON.stringify(props.defaults, null, 2)
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={`${props.nodeKey} defaults`} disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
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
          <p className="text-xs text-muted-foreground">{props.description}</p>
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
                <DialogTitle>{props.nodeLabel} 配置</DialogTitle>
                <DialogDescription>{props.dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">配置文件</div>
                  <div className="mt-1 break-all font-mono text-xs">{props.configFilePath ?? "未连接本地配置服务"}</div>
                </div>
                <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5">
                  {content}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>打开文件</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function EmptyPanel(props: {
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center text-center text-muted-foreground",
        props.compact ? "min-h-16 p-3 text-xs" : "min-h-36 p-6 text-sm",
      )}
    >
      {props.children}
    </div>
  )
}

export function InfoHint(props: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${props.label}说明`}
          className="inline-grid size-5 shrink-0 cursor-help place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          role="img"
          tabIndex={0}
        >
          <Info className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{props.description}</TooltipContent>
    </Tooltip>
  )
}
