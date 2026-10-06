import { memo, useRef, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { ComponentInstance, ComputedLayout, CardLayout } from "@/types/workspace"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { getModule } from "@/components/modules/registry"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useComponentSurfaceStatus } from "@/lib/componentSurfaceStatus"
import { ComponentProgressStrip } from "./ComponentProgressStrip"
import { NodeSurfaceChrome, type NodeSurfaceChromeAction } from "./NodeSurfaceChrome"
import { createSurfaceCommonActions } from "./createSurfaceCommonActions"
import {
  Maximize2,
  Minimize2,
  Minus,
  Expand,
} from "lucide-react"

interface Props {
  comp: ComponentInstance
  layout: ComputedLayout
  canvasRef: React.RefObject<HTMLDivElement | null>
  isFocused: boolean
  hasFocused: boolean
  cardLayout: CardLayout
  isLayoutResizing: boolean
  positioning?: "absolute" | "masonry"
}

const stateLabelKey: Record<ComputedLayout["state"], string> = {
  docked: "common:dock",
  floating: "common:float",
  compact: "common:compact",
  focused: "common:focusState",
  fullscreen: "common:full",
}

function isCardInteractionTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    "button, a, input, select, textarea, label, [role=button], [role=menuitem], [contenteditable=true]",
  ))
}

function ComponentCardInner({ comp, layout, cardLayout: _cardLayout, isLayoutResizing, positioning = "absolute" }: Props) {
  "use memo"
  const workspaceActions = useWorkspaceActions()
  const { t, i18n } = useTranslation()
  const { openComponent } = useWindowControls()
  const mod = getModule(comp.moduleId)
  const moduleId = comp.moduleId
  const moduleName = i18n.exists(`module:${moduleId}.name`) ? t(`module:${moduleId}.name`) : (mod?.name ?? comp.moduleId)
  const surfaceStatus = useComponentSurfaceStatus(comp)
  const { cardClickAction, cardDoubleClickAction } = useWorkspaceShallowSelector((state) => ({
    cardClickAction: state.cardClickAction,
    cardDoubleClickAction: state.cardDoubleClickAction,
  }))
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isFullscreen = layout.state === "fullscreen"
  const isCompact = layout.state === "compact"
  const isFocusedState = layout.state === "focused"
  const isMasonry = positioning === "masonry"

  function toggleCollapse() {
    workspaceActions.toggleCollapse(comp.id)
  }

  function toggleFullscreen() {
    workspaceActions.setFullscreen(isFullscreen ? null : comp.id)
  }

  function activateFocus() {
    workspaceActions.setCardLayout("focus")
    workspaceActions.focusComponent(comp.id)
  }

  function exitFocus() {
    workspaceActions.setCardLayout("grid")
    workspaceActions.focusComponent(null)
  }

  function executeCardAction(action: "focus" | "fullscreen") {
    if (action === "focus") {
      if (isFocusedState) return
      activateFocus()
    } else {
      toggleFullscreen()
    }
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    if (isCardInteractionTarget(event.target)) return
    if (cardClickAction === "none" || cardClickAction === cardDoubleClickAction) return
    if (cardDoubleClickAction === "none") {
      executeCardAction(cardClickAction)
      return
    }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      executeCardAction(cardClickAction)
    }, 250)
  }

  function handleCardDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (isCardInteractionTarget(event.target)) return
    if (cardDoubleClickAction === "none") return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    executeCardAction(cardDoubleClickAction)
  }

  // 构造操作栏动作列表，tone 决定红绿灯样式下的圆点颜色。
  const chromeActions: NodeSurfaceChromeAction[] = [
    {
      key: "collapse",
      label: comp.collapsed ? t("common:expand") : t("common:collapse"),
      icon: comp.collapsed ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />,
      tone: "minimize",
      onClick: () => toggleCollapse(),
    },
    ...(!isFocusedState && !isFullscreen ? [{
      key: "focus",
      label: t("common:focus"),
      icon: <Expand className="h-3 w-3" />,
      tone: "neutral" as const,
      onClick: () => activateFocus(),
    }] : []),
    ...(isFocusedState ? [{
      key: "exitFocus",
      preferenceKey: "focus" as const,
      label: t("common:exitFocus"),
      icon: <Minimize2 className="h-3 w-3" />,
      tone: "neutral" as const,
      onClick: () => exitFocus(),
    }] : []),
    {
      key: "fullscreen",
      label: isFullscreen ? t("common:exitFullscreen") : t("common:fullscreen"),
      icon: isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />,
      tone: "maximize",
      onClick: () => toggleFullscreen(),
    },
    ...createSurfaceCommonActions({
      componentId: comp.id,
      componentData: comp.data,
      currentMode: "cards",
      height: Math.round(layout.h),
      moduleId: comp.moduleId,
      moduleName,
      openComponent,
      t,
      width: Math.round(layout.w),
      workspaceActions,
    }),
  ]

  return (
    <div
      data-context-menu="component-card"
      data-component-id={comp.id}
      onPointerDown={() => workspaceActions.raiseComponent(comp.id)}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      style={{
        position: isMasonry ? "relative" : "absolute",
        left: 0,
        top: 0,
        width: isMasonry ? "100%" : layout.w,
        height: layout.h,
        opacity: layout.opacity,
        transform: isMasonry ? `scale(${layout.scale})` : `translate3d(${layout.x}px, ${layout.y}px, 0) scale(${layout.scale})`,
        transformOrigin: "top left",
        zIndex: layout.z,
        pointerEvents: layout.interactive ? "auto" : "none",
      }}
      className={cn(
        "xiranite-component-surface group relative flex flex-col overflow-hidden rounded-md bg-card/72 text-card-foreground outline outline-1 outline-transparent",
        !isLayoutResizing && "comp-card--animated backdrop-blur-md transition-[transform,width,height,opacity,background-color,box-shadow,outline-color] duration-200 ease-out",
        isMasonry && "break-inside-avoid",
        isFullscreen && "comp-card--fullscreen",
        (isFocusedState || isFullscreen)
          ? "bg-card/88 outline-primary/55 shadow-[0_0_0_1px_var(--ws-accent-glow),0_24px_60px_-24px_var(--ws-accent-glow)]"
          : "shadow-[0_18px_50px_-36px_oklch(0_0_0/0.42)] hover:bg-card/82 hover:outline-border/35 hover:shadow-[0_22px_58px_-34px_oklch(0_0_0/0.5)]",
        isCompact && "comp-card--compact",
      )}
    >
      <ComponentProgressStrip
        status={surfaceStatus}
        placement={comp.collapsed || isCompact ? "top" : "bottom"}
        compact={comp.collapsed || isCompact}
      />

      <NodeSurfaceChrome
        actions={chromeActions}
        collapsed={comp.collapsed}
        moduleId={moduleId}
        moduleName={moduleName}
        version={mod?.version}
        stateLabel={t(stateLabelKey[layout.state])}
      />

      {/* ── Body — always mounted so component state survives every layout morph ── */}
      {!comp.collapsed && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ModuleRenderer moduleId={comp.moduleId} compId={comp.id} />
        </div>
      )}
    </div>
  )
}

export const ComponentCard = memo(ComponentCardInner)
