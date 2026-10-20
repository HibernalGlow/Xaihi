import { useWorkspaceSelector } from "@/store/workspaceStore"
import { tt } from "@/lib/i18nText"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Activity, DatabaseZap, Info, Minus, Plus, Shapes, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  getMd3eShapeSpec,
  MD3E_EXPRESSIVE_SHAPES,
  type Md3eButtonRole,
  type Md3eExpressiveShapeId,
} from "./md3eShapeSystem"
import {
  Md3eConnectedGroup,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eShapePreviewGlyph,
  Md3eShapeProvider,
  Md3eWavyProgress,
  useMd3eShapeContext,
} from "./Md3eShapeContext"

export {
  Md3eConnectedGroup,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eShapePreviewGlyph,
  Md3eShapeProvider,
  Md3eWavyProgress,
  useMd3eShapeContext,
}

export interface NodeStatusMeta {
  label: string
  description: string
  tone: "idle" | "running" | "success" | "error" | "warning"
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  iconClass: string
}

export type Md3eExpressiveTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "warning"
  | "error"
  | "neutral"
  | "sunken"

const BADGE_SHAPE_POOL: readonly Md3eExpressiveShapeId[] = [
  "sunny-10",
  "clover-4",
  "flower-8",
  "cookie-6",
  "cookie-8",
  "cookie-12",
  "gem",
  "pentagon",
  "arch",
  "cookie-4",
  "hexagon",
  "octagon",
  "shield",
  "pebble",
]

function hashSeedString(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function expressiveShapeForSeed(seed: string): Md3eExpressiveShapeId {
  const idx = hashSeedString(seed || "md3e") % BADGE_SHAPE_POOL.length
  return BADGE_SHAPE_POOL[idx] ?? "cookie-8"
}

export function Md3eShapeBadge(props: {
  icon?: LucideIcon
  children?: ReactNode
  seed?: string
  shapeId?: Md3eExpressiveShapeId
  tone?: Md3eExpressiveTone
  active?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const Icon = props.icon
  const resolvedShapeId = props.shapeId ?? expressiveShapeForSeed(props.seed ?? "badge")
  const spec = getMd3eShapeSpec(resolvedShapeId)
  const tone = props.tone ?? "primary"
  const active = props.active ?? false

  const sizeClass =
    props.size === "sm"
      ? "size-8"
      : props.size === "lg"
        ? "size-11"
        : "size-9"
  const iconSizeClass =
    props.size === "sm"
      ? "size-3.5"
      : props.size === "lg"
        ? "size-5"
        : "size-4"

  const colorPair =
    tone === "error" || tone === "warning"
      ? active
        ? "text-destructive [&_path]:fill-destructive/28"
        : "text-destructive [&_path]:fill-destructive/18"
      : tone === "secondary"
        ? active
          ? "text-[var(--md3e-on-secondary-container,var(--secondary-foreground))] [&_path]:fill-[var(--md3e-secondary-container,var(--secondary))]"
          : "text-[var(--md3e-on-secondary-container,var(--secondary-foreground))] [&_path]:fill-[color-mix(in_oklab,var(--md3e-secondary-container,var(--secondary))_75%,transparent)]"
        : tone === "tertiary"
          ? active
            ? "text-[var(--md3e-on-tertiary-container,var(--accent-foreground))] [&_path]:fill-[var(--md3e-tertiary-container,var(--accent))]"
            : "text-[var(--md3e-on-tertiary-container,var(--accent-foreground))] [&_path]:fill-[color-mix(in_oklab,var(--md3e-tertiary-container,var(--accent))_75%,transparent)]"
          : tone === "neutral" || tone === "sunken"
            ? active
              ? "text-primary [&_path]:fill-[var(--md3e-primary-container,var(--secondary))]"
              : "text-muted-foreground [&_path]:fill-[var(--md3e-surface-highest,var(--muted))]"
            : active
              ? "text-primary-foreground [&_path]:fill-primary"
              : "text-[var(--md3e-on-primary-container,var(--primary))] [&_path]:fill-[var(--md3e-primary-container,var(--secondary))]"

  return (
    <div
      data-slot="md3e-shape-badge"
      data-md3e-badge-shape={resolvedShapeId}
      data-md3e-badge-tone={tone}
      data-active={active ? "true" : "false"}
      className={cn(
        "relative inline-grid shrink-0 place-items-center select-none transition-transform duration-200 ease-[var(--md3e-spring)]",
        sizeClass,
        colorPair,
        props.className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full transition-transform duration-300 ease-[var(--md3e-spring)]"
      >
        <path d={spec.svgPath} />
      </svg>
      <span className="relative z-10 inline-grid place-items-center">
        {Icon ? <Icon className={iconSizeClass} /> : props.children}
      </span>
    </div>
  )
}

export function Md3ePatchBackdrop(props: {
  children: ReactNode
  seed?: string
  tone?: Md3eExpressiveTone
  active?: boolean
  corner?: "sm" | "md" | "lg"
  asymmetric?: "sm" | "md" | "lg" | boolean
  decor?: boolean
  className?: string
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  const {
    children,
    seed = "patch",
    tone = "neutral",
    active = false,
    corner,
    asymmetric,
    decor = true,
    className,
    ...rest
  } = props
  const resolvedCorner =
    corner ?? (typeof asymmetric === "string" ? asymmetric : asymmetric === false ? "sm" : "md")
  const h = hashSeedString(seed)
  const patchShapeA = getMd3eShapeSpec(BADGE_SHAPE_POOL[h % BADGE_SHAPE_POOL.length] ?? "flower-8")
  const patchShapeB = getMd3eShapeSpec(BADGE_SHAPE_POOL[(h >> 4) % BADGE_SHAPE_POOL.length] ?? "clover-4")
  const rotA = (h % 36) - 18
  const rotB = ((h >> 6) % 44) - 22

  const cornerClass =
    resolvedCorner === "sm"
      ? "rounded-[18px_22px_10px_20px]"
      : resolvedCorner === "lg"
        ? "rounded-[24px_28px_12px_26px]"
        : "rounded-[20px_24px_12px_22px]"

  const surfaceClass =
    tone === "primary" && active
      ? "bg-[color-mix(in_oklab,var(--md3e-primary-container,var(--secondary))_72%,var(--md3e-surface,var(--card)))] text-foreground"
      : tone === "secondary" && active
        ? "bg-[color-mix(in_oklab,var(--md3e-secondary-container,var(--secondary))_70%,var(--md3e-surface,var(--card)))] text-foreground"
        : tone === "tertiary" && active
          ? "bg-[color-mix(in_oklab,var(--md3e-tertiary-container,var(--accent))_68%,var(--md3e-surface,var(--card)))] text-foreground"
          : tone === "warning" || tone === "error"
            ? active
              ? "bg-destructive/20 text-foreground"
              : "bg-destructive/12 text-foreground"
            : tone === "sunken"
              ? "bg-[var(--md3e-surface-low,var(--muted))] text-foreground"
              : "bg-[var(--md3e-surface,var(--card))] text-foreground"

  return (
    <div
      data-slot="md3e-patch-backdrop"
      data-md3e-patch-tone={tone}
      data-active={active ? "true" : "false"}
      className={cn(
        "relative min-w-0 overflow-hidden transition-colors duration-200 [&>*:not([aria-hidden=true])]:relative [&>*:not([aria-hidden=true])]:z-10",
        cornerClass,
        surfaceClass,
        className,
      )}
      {...rest}
    >
      {decor ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-0 w-24 overflow-hidden select-none"
        >
          <svg
            viewBox="0 0 120 100"
            className="absolute -top-4 -right-5 size-20 opacity-20"
            style={{ transform: `rotate(${rotA}deg)` }}
          >
            <path
              d={patchShapeA.svgPath}
              fill="var(--md3e-primary-container, var(--primary))"
            />
          </svg>
          <svg
            viewBox="0 0 120 100"
            className="absolute -right-2 -bottom-6 size-16 opacity-18"
            style={{ transform: `rotate(${rotB}deg)` }}
          >
            <path
              d={patchShapeB.svgPath}
              fill="var(--md3e-tertiary-container, var(--accent))"
            />
          </svg>
        </div>
      ) : null}
      {children}
    </div>
  )
}

export function Md3eStatusPill(props: {
  label: ReactNode
  tone?: NodeStatusMeta["tone"] | "primary" | "secondary" | "tertiary" | "neutral"
  dot?: boolean
  showDot?: boolean
  icon?: LucideIcon
  compact?: boolean
  className?: string
}) {
  const Icon = props.icon
  const showDot = props.dot ?? props.showDot ?? !Icon
  const tone = props.tone ?? "idle"

  const pillClass =
    tone === "error"
      ? "bg-destructive/20 text-destructive"
      : tone === "running" || tone === "primary"
        ? "bg-[var(--md3e-primary-container,var(--secondary))] text-[var(--md3e-on-primary-container,var(--primary))]"
        : tone === "success" || tone === "tertiary"
          ? "bg-[var(--md3e-tertiary-container,var(--accent))] text-[var(--md3e-on-tertiary-container,var(--accent-foreground))]"
          : tone === "warning" || tone === "secondary"
            ? "bg-[var(--md3e-secondary-container,var(--secondary))] text-[var(--md3e-on-secondary-container,var(--secondary-foreground))]"
            : "bg-[var(--md3e-surface-highest,var(--muted))] text-foreground"

  const dotClass =
    tone === "error"
      ? "bg-destructive"
      : tone === "running" || tone === "primary"
        ? "bg-primary animate-pulse"
        : tone === "success" || tone === "tertiary"
          ? "bg-[var(--md3e-tertiary,var(--accent))]"
          : "bg-current opacity-75"

  return (
    <span
      data-slot="md3e-status-pill"
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold tracking-tight",
        props.compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
        pillClass,
        props.className,
      )}
    >
      {Icon ? (
        <Icon className="size-3 shrink-0" />
      ) : showDot ? (
        <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
      ) : null}
      <span className="truncate">{props.label}</span>
    </span>
  )
}

export function Md3eActionGroup(props: {
  children: ReactNode
  orientation?: "horizontal" | "vertical"
  className?: string
} & ComponentPropsWithoutRef<"div">) {
  const { children, orientation = "horizontal", className, ...rest } = props
  return (
    <div
      data-slot="md3e-action-group"
      data-orientation={orientation}
      className={cn(
        "inline-flex items-center gap-1 rounded-[18px] bg-[var(--md3e-surface-highest,var(--muted))]/75 p-1",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function RunningTint(props: {
  tone: NodeStatusMeta["tone"]
  className?: string
}) {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] opacity-80 transition-opacity duration-300",
          props.tone === "running" && "bg-primary/14",
          props.tone === "error" && "bg-destructive/14",
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
  shapeRole?: Md3eButtonRole
  onClick: () => void
}) {
  const Icon = props.icon
  const role: Md3eButtonRole = props.shapeRole
    ?? (props.destructive ? "danger" : props.active ? "secondary" : "toolbar")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={props.label}
          disabled={props.disabled}
          size="icon-sm"
          shapeRole={role}
          variant={props.destructive ? "destructive" : props.active ? "secondary" : "outline"}
          className="border-0 bg-[var(--md3e-surface-high,var(--muted))] shadow-none transition-transform active:scale-92"
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

export const Md3eActionIconButton = ActionIconButton

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: NodeStatusMeta
  text?: string
  className?: string
}) {
  const isRunning = props.status.tone === "running"
  const tone: Md3eExpressiveTone =
    props.status.tone === "error"
      ? "error"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "tertiary"
          : "neutral"

  return (
    <Md3ePatchBackdrop
      seed={`status-${props.status.label}`}
      tone={tone}
      active={isRunning || props.status.tone === "success"}
      corner={props.compact ? "sm" : "md"}
      decor={false}
      data-slot="md3e-status-strip"
      data-tone={props.status.tone}
      className={cn(
        "shrink-0",
        props.compact ? "p-2" : "px-3 py-2.5",
        props.className,
      )}
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Md3eShapeBadge
            icon={Activity}
            seed={`status-badge-${props.status.label}`}
            tone={tone}
            active={isRunning}
            size="sm"
          />
          <div className="line-clamp-1 text-xs font-bold tracking-tight text-foreground">
            {props.text || props.status.description}
          </div>
        </div>
        <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
      </div>
      {isRunning ? (
        <div className="space-y-1">
          <Md3eWavyProgress value={props.progress} running />
          <Progress value={props.progress} className="sr-only h-1" />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Progress
            value={props.progress}
            className={cn("h-2 flex-1 rounded-full", props.status.tone === "error" && "bg-destructive/20")}
          />
          <span className="size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
        </div>
      )}
    </Md3ePatchBackdrop>
  )
}

export const Md3eStatusBanner = StatusStrip

export function HeaderLine(props: {
  icon?: LucideIcon
  label: string
  status: NodeStatusMeta
  subtitle: string
  eyebrow?: string
  pills?: ReactNode
}) {
  const Icon = props.icon ?? Sparkles
  const badgeTone: Md3eExpressiveTone =
    props.status.tone === "error"
      ? "error"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "tertiary"
          : "primary"

  return (
    <div className="min-w-0" data-slot="md3e-header-line">
      <div className="flex min-w-0 items-center gap-2.5">
        <Md3eShapeBadge
          icon={Icon}
          seed={`node-hero-${props.label}`}
          tone={badgeTone}
          active={props.status.tone === "running" || props.status.tone === "success"}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-black tracking-tight text-foreground @[520px]:text-lg leading-none">
              {props.label}
            </h3>
            <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
            {props.pills}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.subtitle}</p>
        </div>
      </div>
    </div>
  )
}

export function Md3eHeaderBanner(props: {
  icon?: LucideIcon
  title: string
  subtitle: string
  eyebrow?: string
  status?: NodeStatusMeta
  pills?: ReactNode
  actions?: ReactNode
  testId?: string
  className?: string
}) {
  const Icon = props.icon ?? Sparkles
  const tone: Md3eExpressiveTone =
    props.status?.tone === "error"
      ? "error"
      : props.status?.tone === "running"
        ? "primary"
        : props.status?.tone === "success"
          ? "tertiary"
          : "primary"

  return (
    <Md3ePatchBackdrop
      seed={`hero-banner-${props.title}`}
      tone={tone}
      active={props.status?.tone === "running"}
      corner="lg"
      decor={false}
      data-slot="md3e-header-banner"
      className={cn(
        "flex w-full shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-1.5 shadow-xs",
        props.className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Md3eShapeBadge
          icon={Icon}
          seed={`hero-icon-${props.title}`}
          tone={tone}
          active
          size="sm"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-black tracking-tight text-foreground @[520px]:text-base leading-none">
            {props.title}
          </h3>
          {props.status ? (
            <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
          ) : null}
          {props.pills}
          {props.subtitle ? (
            <span className="hidden max-w-[26rem] truncate text-xs text-muted-foreground @[680px]:inline" title={props.subtitle}>
              · {props.subtitle}
            </span>
          ) : null}
        </div>
      </div>
      {props.actions ? (
        <div
          data-testid={props.testId}
          className="relative z-10 flex shrink-0 flex-wrap items-center gap-1 rounded-[14px] bg-[var(--md3e-surface-highest,var(--muted))]/75 px-1.5 py-0.5"
        >
          {props.actions}
        </div>
      ) : null}
    </Md3ePatchBackdrop>
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
            <Button
              aria-label={`${props.nodeKey} defaults`}
              disabled={props.disabled}
              size="icon-sm"
              shapeRole="toolbar"
              variant={props.configDirty ? "secondary" : "outline"}
            >
              <DatabaseZap />
              <span className="sr-only">{tt("module:shared.ui.defaultConfig", "默认配置")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tt("module:shared.ui.defaultConfig", "默认配置")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 rounded-[28px] border-0 bg-[var(--md3e-surface-high,var(--popover))] p-4 shadow-xl">
        <div className="mb-3">
          <div className="text-sm font-extrabold tracking-tight">{tt("module:shared.ui.defaultConfig", "默认配置")}</div>
          <p className="text-xs text-muted-foreground">{props.description}</p>
        </div>
        <div className="grid gap-2">
          <Md3eNodeShapePolicyPanel nodeId={props.nodeKey} compact />
          <Separator className="my-1 opacity-40" />
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>{tt("module:shared.ui.saveAsDefault", "保存为默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>{tt("module:shared.ui.restoreDefaults", "恢复默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>{tt("module:shared.ui.clearOverride", "清除覆盖")}</Button>
          <Separator className="opacity-40" />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">{tt("module:shared.ui.viewConfig", "查看配置")}</Button>
            </DialogTrigger>
            <DialogContent className="rounded-[28px] sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{props.nodeLabel} {tt("module:shared.ui.configuration", "配置")}</DialogTitle>
                <DialogDescription>{props.dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="rounded-[18px] bg-muted/40 px-3.5 py-2.5">
                  <div className="text-xs font-medium text-muted-foreground">{tt("module:shared.ui.configFile", "配置文件")}</div>
                  <div className="mt-1 break-all font-mono text-xs">{props.configFilePath ?? tt("module:shared.ui.configServiceOffline", "未连接本地配置服务")}</div>
                </div>
                <pre className="max-h-[45vh] overflow-auto rounded-[18px] bg-muted/40 p-3.5 text-xs leading-5">
                  {content}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>{tt("module:shared.ui.openFile", "打开文件")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function Md3eShapePopoverButton(props: {
  nodeId: string
  label?: string
  className?: string
}) {
  const triggerLabel = props.label ?? `${props.nodeId} 控件形状策略`
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              shapeRole="toolbar"
              aria-label={triggerLabel}
              className={cn("border-0", props.className)}
            >
              <Shapes className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{triggerLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 rounded-[28px] border-0 bg-[var(--md3e-surface-high,var(--popover))] p-3.5 shadow-xl">
        <Md3eNodeShapePolicyPanel nodeId={props.nodeId} compact />
      </PopoverContent>
    </Popover>
  )
}

export function Md3eHeroActionBar(props: {
  primary: ReactNode
  secondary?: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="md3e-hero-action-bar"
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[22px] bg-[var(--md3e-surface,var(--card))] p-1.5",
        "[&>[data-slot=button]:first-child]:h-11 [&>[data-slot=button]:first-child]:flex-1 [&>[data-slot=button]:first-child]:rounded-full [&>[data-slot=button]:first-child]:text-sm [&>[data-slot=button]:first-child]:font-extrabold [&>[data-slot=button]:first-child]:shadow-sm",
        "[&>[data-phase]:first-child]:h-11 [&>[data-phase]:first-child]:flex-1 [&>[data-phase]:first-child]:rounded-full",
        props.className,
      )}
    >
      {props.primary}
      {props.secondary ? (
        <div className="flex shrink-0 items-center gap-1 rounded-[16px] bg-[var(--md3e-surface-high,var(--muted))] p-1">
          {props.secondary}
        </div>
      ) : null}
    </div>
  )
}

export function Md3eSectionCard(props: {
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  badge?: ReactNode
  actions?: ReactNode
  seed?: string
  tone?: "default" | "high" | "primary" | "secondary" | "tertiary" | "danger"
  className?: string
}) {
  const mappedTone: Md3eExpressiveTone =
    props.tone === "danger"
      ? "error"
      : props.tone === "primary"
        ? "primary"
        : props.tone === "secondary"
          ? "secondary"
          : props.tone === "tertiary"
            ? "tertiary"
            : "neutral"

  const seedStr = props.seed ?? (typeof props.title === "string" ? props.title : "section")

  return (
    <Md3ePatchBackdrop
      seed={seedStr}
      tone={mappedTone}
      active={props.tone === "primary" || props.tone === "secondary" || props.tone === "tertiary" || props.tone === "danger"}
      corner="md"
      decor={false}
      data-slot="md3e-section-card"
      className={cn(
        "w-full min-w-0 shrink-0 overflow-hidden p-2.5",
        props.tone === "high" && "bg-[var(--md3e-surface-high,var(--muted))]",
        props.className,
      )}
    >
      {props.title || props.description || props.actions || props.badge ? (
        <div className="mb-1.5 flex shrink-0 min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {props.icon || props.title ? (
              <Md3eShapeBadge
                icon={props.icon ?? Sparkles}
                seed={seedStr}
                tone={mappedTone === "neutral" ? "primary" : mappedTone}
                size="sm"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              {props.title ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-black tracking-tight text-foreground">
                    {props.title}
                  </span>
                  {props.badge !== undefined && props.badge !== null ? (
                    typeof props.badge === "string" || typeof props.badge === "number" ? (
                      <Md3eStatusPill label={props.badge} tone="primary" compact />
                    ) : (
                      props.badge
                    )
                  ) : null}
                </div>
              ) : null}
              {props.description ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">{props.description}</p>
              ) : null}
            </div>
          </div>
          {props.actions ? <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-1 overflow-hidden">{props.actions}</div> : null}
        </div>
      ) : null}
      {props.children}
    </Md3ePatchBackdrop>
  )
}

export interface Md3eBentoStatItem {
  label: string
  value: ReactNode
  caption?: ReactNode
  icon?: LucideIcon
  tone?: "default" | "primary" | "secondary" | "tertiary" | "error"
  gauge?: number
}

export function Md3eStatTile(props: Md3eBentoStatItem & { className?: string }) {
  const tone: Md3eExpressiveTone =
    props.tone === "error"
      ? "error"
      : props.tone === "primary"
        ? "primary"
        : props.tone === "secondary"
          ? "secondary"
          : props.tone === "tertiary"
            ? "tertiary"
            : "neutral"

  const isHighlighted = props.tone === "error"
  const gaugePct =
    props.gauge !== undefined
      ? Math.max(0, Math.min(100, props.gauge))
      : typeof props.value === "string" && props.value.endsWith("%")
        ? Math.max(0, Math.min(100, Number.parseFloat(props.value) || 0))
        : typeof props.value === "number" && props.value > 0
          ? Math.min(100, 35 + (props.value % 65))
          : 18

  return (
    <Md3ePatchBackdrop
      seed={`stat-${props.label}`}
      tone={tone}
      active={isHighlighted}
      corner="sm"
      decor={false}
      data-slot="md3e-stat-tile"
      className={cn(
        "flex min-w-0 items-center gap-2 px-2.5 py-1.5",
        !isHighlighted && "bg-[var(--md3e-surface-high,var(--muted))]/80",
        props.className,
      )}
    >
      <Md3eShapeBadge
        icon={props.icon ?? Sparkles}
        seed={`stat-icon-${props.label}`}
        tone={tone === "neutral" ? "secondary" : tone}
        active={props.tone === "primary" || props.tone === "error"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-1.5">
          <span className="truncate text-[11px] font-bold text-muted-foreground leading-none">{props.label}</span>
          <span
            className={cn(
              "shrink-0 truncate font-mono text-sm font-black tracking-tight tabular-nums @[480px]:text-base leading-none",
              props.tone === "error" && "text-destructive",
            )}
          >
            {props.value}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1" aria-hidden="true">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/12">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                props.tone === "error" ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${gaugePct}%` }}
            />
          </div>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              props.tone === "error" ? "bg-destructive" : "bg-primary/70",
            )}
          />
          {props.caption ? (
            <span className="max-w-[50%] truncate text-[10px] text-muted-foreground">{props.caption}</span>
          ) : null}
        </div>
      </div>
    </Md3ePatchBackdrop>
  )
}

export function Md3eBentoStatGrid(props: {
  items: readonly Md3eBentoStatItem[]
  className?: string
}) {
  return (
    <div
      data-slot="md3e-bento-stat-grid"
      className={cn(
        "grid min-w-0 shrink-0 gap-2",
        props.className,
      )}
    >
      {props.items.map((item) => (
        <Md3eStatTile key={item.label} {...item} />
      ))}
    </div>
  )
}

export function InfoHint(props: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${props.label}说明`}
          className="inline-grid size-5 shrink-0 cursor-help place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

export function useMd3eActive(): boolean {
  const uiFace = useWorkspaceSelector((state) => state.uiFace)
  if (uiFace) return uiFace === "md3e"
  return typeof document !== "undefined" && document.documentElement.dataset.uiFace === "md3e"
}

/**
 * MD3E 步进滑杆：一行标签 + 当前值 + 减/加两颗图标按钮 + 一条滑轨。
 * 三个入口写回同一个数（滑块、减、加），所以不会出现「拖了 3.5 但显示 3」。
 */
export function Md3eStepperSlider(props: {
  icon: LucideIcon
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
  className?: string
  children?: ReactNode
}) {
  const Icon = props.icon
  const decimals = String(props.step).includes(".") ? String(props.step).split(".")[1].length : 0
  const clamp = (next: number) => {
    const bounded = Math.min(props.max, Math.max(props.min, next))
    return Number(bounded.toFixed(decimals))
  }
  return (
    <div className={cn("rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/80 px-3 py-2 transition-all duration-150 hover:bg-[var(--md3e-surface-highest,var(--accent))]/60", props.className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{props.label}</span>
        <span className="shrink-0 rounded-full bg-[var(--md3e-secondary-container,var(--secondary))] px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-[var(--md3e-on-secondary-container,var(--secondary-foreground))]">
          {props.value.toFixed(decimals)}
        </span>
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          className="rounded-full"
          aria-label={`${props.label} 减少`}
          disabled={props.disabled || props.value <= props.min}
          onClick={() => props.onChange(clamp(props.value - props.step))}
        >
          <Minus />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          className="rounded-full"
          aria-label={`${props.label} 增加`}
          disabled={props.disabled || props.value >= props.max}
          onClick={() => props.onChange(clamp(props.value + props.step))}
        >
          <Plus />
        </Button>
      </div>
      <Slider
        className="mt-2"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        onValueChange={(next) => {
          const first = next[0]
          if (typeof first === "number") props.onChange(clamp(first))
        }}
        aria-label={props.label}
      />
      {props.children}
    </div>
  )
}

/**
 * MD3E 开关行：图标 + 标题 + 说明 + 右侧开关，整行可读、开关自带 aria-label。
 */
export function Md3eSwitchRow(props: {
  icon: LucideIcon
  label: string
  ariaLabel?: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  const Icon = props.icon
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/80 px-3 py-2 transition-all duration-150 hover:bg-[var(--md3e-surface-highest,var(--accent))]/60", props.className)}>
      <Icon className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold">{props.label}</div>
        {props.description ? (
          <div className="truncate text-[10px] text-muted-foreground">{props.description}</div>
        ) : null}
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onCheckedChange}
        aria-label={props.ariaLabel ?? props.label}
      />
    </div>
  )
}

export * from "./Md3eExpressiveKit"
