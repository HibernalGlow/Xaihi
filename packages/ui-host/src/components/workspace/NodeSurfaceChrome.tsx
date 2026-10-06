import { lazy, Suspense, useId, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { motion, type Transition } from "motion/react"
import { BookOpen, GripHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { hasNodeHelp } from "@/components/help/nodeHelpRegistry"
import { useChromeAppearance } from "@/components/workspace/useChromeAppearance"
import { cn } from "@/lib/utils"
import { applyChromeActionPreferences, type ChromeActionPreferenceKey } from "./chromeActionPreferences"
import { NODE_CHROME_PILL_CLASS_NAME, NodeChromeActionButton, NodeChromePill } from "./NodeChromePrimitives"

const LazyNodeHelpSheet = lazy(async () => {
  const module = await import("@/components/help/NodeHelpSheet")
  return { default: module.NodeHelpSheet }
})

/** 操作栏动作语义，用于红绿灯样式下决定圆点颜色。 */
export type ChromeActionTone = "close" | "minimize" | "maximize" | "neutral"

export interface NodeSurfaceChromeAction {
  key: string
  /** Stable key used by the toolbar customization preferences. */
  preferenceKey?: ChromeActionPreferenceKey
  label: string
  icon: ReactNode
  danger?: boolean
  tone?: ChromeActionTone
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  /** 若提供子菜单，点击按钮将展开下拉菜单而非直接触发 onClick。 */
  submenu?: NodeSurfaceChromeAction[]
}

/** 由 tone + danger 推断红绿灯颜色。danger 优先视作 close（红）。 */
function resolveTone(action: NodeSurfaceChromeAction): ChromeActionTone {
  if (action.tone) return action.tone
  if (action.danger) return "close"
  return "neutral"
}

/** 红绿灯样式下，圆点的底色 + hover 高亮色（按 tone 分配）。 */
function trafficLightDotClasses(tone: ChromeActionTone): string {
  switch (tone) {
    case "close":
      return "bg-destructive/70 hover:bg-destructive text-white"
    case "minimize":
      return "bg-yellow-500/75 hover:bg-yellow-500 text-black"
    case "maximize":
      return "bg-emerald-500/75 hover:bg-emerald-500 text-black"
    default:
      return "bg-muted-foreground/45 hover:bg-muted-foreground/70 text-foreground"
  }
}

export function NodeSurfaceChrome({
  actions,
  collapsed,
  dragHandle,
  moduleId,
  moduleName,
  stateLabel,
  hideIdleIndicator = false,
  version,
}: {
  actions: NodeSurfaceChromeAction[]
  collapsed?: boolean
  dragHandle?: ReactNode
  moduleId?: string
  moduleName: string
  stateLabel?: string
  /** Hides the idle island mark while preserving the expanded toolbar surface. */
  hideIdleIndicator?: boolean
  version?: string
}) {
  const { t } = useTranslation()
  const { visible, position, style, islandScale, islandMotion, islandDelay, islandIdleOffset, actionOrder, hiddenActions } = useChromeAppearance()
  const [helpOpen, setHelpOpen] = useState(false)
  const helpAvailable = hasNodeHelp(moduleId)
  const chromeActions = useMemo<NodeSurfaceChromeAction[]>(() => {
    const actionsWithHelp = !helpAvailable ? actions : [
      {
        key: "node-help",
        label: t("registry:help.open", { name: moduleName }),
        icon: <BookOpen className="h-3 w-3" />,
        onClick: (event) => {
          event.stopPropagation()
          setHelpOpen(true)
        },
      },
      ...actions,
    ]
    return applyChromeActionPreferences(actionsWithHelp, actionOrder, hiddenActions)
  }, [actionOrder, actions, helpAvailable, hiddenActions, moduleName, t])
  const helpSheet = helpAvailable ? (
    <Suspense fallback={null}>
      <LazyNodeHelpSheet
        open={helpOpen}
        moduleId={moduleId ?? null}
        moduleName={moduleName}
        version={version}
        onOpenChange={setHelpOpen}
      />
    </Suspense>
  ) : null

  if (!visible) return null

  const isTrafficLight = style === "traffic-light"
  // 折叠态是一整条窄条，左/右区分意义不大，统一保持右对齐（ml-auto）。
  // 位置设置主要作用于展开态的浮动操作栏。
  if (collapsed) {
    return (
      <>
        <div className="xiranite-ui-copy xiranite-node-chrome-bar flex h-full min-h-10 select-none items-center gap-2 border-b border-transparent px-3">
          <span className="xiranite-node-chrome-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80 shadow-[0_0_12px_var(--ws-accent-glow)]" />
          {dragHandle}
          <span className="min-w-0 truncate text-[10px] font-mono font-semibold uppercase tracking-widest text-foreground/80">
            {moduleName}
          </span>
          {version && (
            <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50">
              {version}
            </span>
          )}
          {stateLabel && (
            <span className="ml-1 shrink-0 rounded-[3px] bg-muted/35 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground">
              {stateLabel}
            </span>
          )}
          <div className={cn(
            "ml-auto flex items-center transition-opacity",
            isTrafficLight ? "gap-1.5" : "gap-0.5 opacity-65 group-focus-within:opacity-100 group-hover:opacity-100",
          )}>
            {chromeActions.map((action) => (
              <ChromeActionButton
                key={action.key}
                action={action}
                trafficLight={isTrafficLight}
              />
            ))}
          </div>
        </div>
        {helpSheet}
      </>
    )
  }

  if (position === "island") {
    return (
      <>
        <DynamicIslandChrome
          actions={chromeActions}
          dragHandle={dragHandle}
          delay={islandDelay}
          idleOffset={islandIdleOffset}
          motionPercent={islandMotion}
          scale={islandScale}
          hideIdleIndicator={hideIdleIndicator}
        />
        {helpSheet}
      </>
    )
  }

  const positionClass = position === "left" ? "left-2 justify-start" : "right-2 justify-end"

  if (isTrafficLight) {
    // 红绿灯：圆点常驻可见，hover 时圆点内出现图标。
    return (
      <>
        <div className={cn(
          "xiranite-ui-copy absolute top-2 z-20 flex items-center gap-1.5 transition-opacity duration-150",
          positionClass,
          "opacity-80 group-focus-within:opacity-100 group-hover:opacity-100",
        )}>
          {dragHandle && (
            <span className="xiranite-node-drag-handle xiranite-node-chrome-pill grid h-6 w-6 place-items-center rounded-[3px] border border-transparent text-muted-foreground transition-colors hover:bg-muted/55 hover:text-primary">
              {dragHandle}
            </span>
          )}
          {chromeActions.map((action) => (
            <ChromeActionButton
              key={action.key}
              action={action}
              trafficLight
            />
          ))}
        </div>
        {helpSheet}
      </>
    )
  }

  // 默认胶囊样式：hover/focus 时才浮现。
  return (
    <>
      <div className={cn(
        "xiranite-ui-copy pointer-events-none absolute top-2 z-20 flex items-center opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100",
        positionClass,
      )}>
        <NodeChromePill className="pointer-events-none group-focus-within:pointer-events-auto group-hover:pointer-events-auto">
          {dragHandle && (
            <span className="xiranite-node-drag-handle grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground transition-colors hover:bg-muted/55 hover:text-primary">
              {dragHandle}
            </span>
          )}
          {chromeActions.map((action) => (
            <ChromeActionButton
              key={action.key}
              action={action}
              trafficLight={false}
            />
          ))}
        </NodeChromePill>
      </div>
      {helpSheet}
    </>
  )
}

function DynamicIslandChrome({
  actions,
  delay,
  dragHandle,
  idleOffset,
  motionPercent,
  scale,
  hideIdleIndicator = false,
}: {
  actions: NodeSurfaceChromeAction[]
  delay: number
  dragHandle?: ReactNode
  idleOffset: number
  motionPercent: number
  scale: number
  hideIdleIndicator?: boolean
}) {
  const islandId = useId()
  const [expanded, setExpanded] = useState(false)
  const motionRatio = Math.max(0.1, motionPercent / 100)
  const buttonCount = actions.length + (dragHandle ? 1 : 0)
  const metrics = useMemo(
    () => getIslandMetrics(buttonCount, scale),
    [buttonCount, scale],
  )
  const transition = useMemo<Transition>(() => ({
    type: "spring",
    stiffness: Math.round(520 * motionRatio),
    damping: Math.round(38 * Math.sqrt(motionRatio)),
    mass: Number((0.48 / Math.sqrt(motionRatio)).toFixed(2)),
  }), [motionRatio])

  return (
    <div
      className="xiranite-ui-copy pointer-events-auto absolute left-1/2 top-2 z-20 -translate-x-1/2"
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
    >
      <motion.div
        id={`node-operation-island-${islandId}`}
        role="toolbar"
        aria-label="Node operation island"
        animate={{
          width: expanded ? metrics.compactWidth : metrics.idleWidth,
          height: expanded ? metrics.compactHeight : metrics.idleHeight,
          borderRadius: expanded ? metrics.compactHeight / 2 : metrics.idleHeight / 2,
        }}
        initial={false}
        transition={transition}
        className={cn(
          "relative mx-auto flex items-center justify-center text-foreground will-change-[width,height,border-radius]",
          "transition-[background-color,border-color,box-shadow,backdrop-filter] duration-150",
          expanded ? "overflow-hidden" : "overflow-visible",
          expanded
            ? cn(NODE_CHROME_PILL_CLASS_NAME, "border-border/35 bg-background/70 backdrop-blur-xl ring-primary/10")
            : "border-0 bg-transparent shadow-none backdrop-blur-0 hover:shadow-none",
        )}
      >
        <motion.div
          aria-hidden={expanded}
          animate={{
            opacity: expanded ? 0 : 1,
            scale: expanded ? 0.86 : 1,
            y: expanded ? -1 : idleOffset,
          }}
          initial={false}
          transition={{ duration: 0.11 / motionRatio, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            data-node-chrome-idle-indicator
            className={cn(
              "xiranite-node-chrome-dot h-1.5 w-5 rounded-full bg-primary/70 shadow-[0_0_10px_var(--ws-accent-glow)]",
              hideIdleIndicator && "bg-transparent shadow-none",
            )}
            style={hideIdleIndicator ? { backgroundColor: "transparent", boxShadow: "none" } : undefined}
          />
        </motion.div>
        <motion.div
          aria-hidden={!expanded}
          animate={{
            opacity: expanded ? 1 : 0,
            scale: expanded ? metrics.contentScale : metrics.contentScale * 0.96,
          }}
          initial={false}
          transition={{ duration: 0.12 / motionRatio, delay: expanded ? delay / 1000 : 0, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-0.5 px-2",
            expanded ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{ transformOrigin: "center" }}
        >
          {dragHandle && (
            <span className="xiranite-node-drag-handle grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground transition-colors hover:bg-muted/55 hover:text-primary">
              {dragHandle}
            </span>
          )}
          {actions.map((action) => (
            <ChromeActionButton
              key={action.key}
              action={action}
              trafficLight={false}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  )
}

function getIslandMetrics(buttonCount: number, customScale: number) {
  const customScaleRatio = customScale / 100
  const desiredContentWidth = Math.min(216, Math.max(112, buttonCount * 28 + 24) * customScaleRatio)
  const compactWidth = Math.round(Math.max(48, desiredContentWidth))
  const compactHeight = Math.round(Math.max(26, Math.min(34, 32 * customScaleRatio)))
  const idleWidth = Math.round(Math.max(38, Math.min(52, 46 * customScaleRatio)))
  const idleHeight = Math.round(Math.max(24, Math.min(34, 30 * customScaleRatio)))

  return {
    compactWidth,
    compactHeight,
    idleWidth,
    idleHeight,
    contentScale: Number(Math.max(0.84, Math.min(1, customScaleRatio)).toFixed(3)),
  }
}

function ChromeActionButton({
  action,
  trafficLight,
}: {
  action: NodeSurfaceChromeAction
  trafficLight: boolean
}) {
  const button = renderChromeButton(action, trafficLight)
  if (!action.submenu?.length) return button

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {button}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={8} className="min-w-[10rem]">
        {action.submenu.map((sub) => (
          <DropdownMenuItem
            key={sub.key}
            onSelect={(event) => {
              event.preventDefault()
              sub.onClick?.(event as unknown as MouseEvent<HTMLButtonElement>)
            }}
          >
            {sub.icon}
            <span>{sub.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 渲染操作栏单按钮（不带菜单）。子菜单模式下 onClick 由 DropdownMenu 接管。 */
function renderChromeButton(action: NodeSurfaceChromeAction, trafficLight: boolean) {
  const handleClick = action.submenu?.length ? undefined : action.onClick
  if (trafficLight) {
    const tone = resolveTone(action)
    return (
      <button
      type="button"
      data-action-key={action.key}
      title={action.label}
        aria-label={action.label}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleClick}
        className={cn(
          "grid h-3.5 w-3.5 place-items-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/70",
          trafficLightDotClasses(tone),
        )}
      >
        <span className="hidden leading-none group-hover:inline group-focus-within:inline [&_svg]:h-2.5 [&_svg]:w-2.5">
          {action.icon}
        </span>
      </button>
    )
  }

  return (
    <NodeChromeActionButton
      data-action-key={action.key}
      title={action.label}
      aria-label={action.label}
      onClick={handleClick}
      danger={action.danger}
    >
      {action.icon}
    </NodeChromeActionButton>
  )
}

export function DefaultNodeDragGrip() {
  // 12px：与同一条栏里六个动作图标的 `h-3 w-3` 对齐。原来是 `h-3.5`，
  // 把手和动作并排时会看出大小不一致（与主题无关，原生档就存在）。
  return <GripHorizontal className="h-3 w-3" />
}
