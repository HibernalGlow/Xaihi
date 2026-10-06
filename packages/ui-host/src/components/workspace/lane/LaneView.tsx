/**
 * LaneView — 泳道模式视图。
 *
 * 从 Xlchemy LaneContainer.svelte 移植为 React，作为 viewMode=lane 的渲染器。
 *
 * 数据模型（与其他 3 种 viewMode 共享同一份 store）：
 * - state.lanes: Lane[] — 当前 workspace 的所有泳道
 * - state.components: ComponentInstance[] — components 通过 laneId 归属到 lane
 * - lane.cardOrder: string[] — lane 内 card 的顺序
 *
 * 行为：
 * - lane 水平排列（flex-row），可水平滚动
 * - @dnd-kit 拖拽 lane 标题栏重排（REORDER_LANE）
 * - @dnd-kit 拖拽 card 跨 lane 移动（MOVE_COMPONENT_TO_LANE）
 * - 顶栏切换到 lane 时，若当前 workspace 还没 lane，自动建一个默认 lane
 * - "+ ADD LANE" 按钮：dispatch ADD_LANE
 * - 关闭 card：dispatch TOGGLE_COMPONENT_VISIBILITY(lane) — 仅 lane 模式下隐藏
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Columns3, Maximize2, Minimize2, Settings2 } from "lucide-react"
import { MouseSensor, TouchSensor, useSensor, useSensors, type UniqueIdentifier } from "@dnd-kit/core"
import { useWorkspaceActions, useWorkspaceShallowSelector, useWorkspaceVisibleComponents } from "@/store/workspaceStore"
import { isComponentVisibleInView } from "@/lib/componentVisibility"
import { translateLabel } from "@/lib/i18nLabel"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { useMarqueeSelection } from "@/hooks/useMarqueeSelection"
import { Button } from "@/components/ui/button"
import { Kanban, KanbanBoard, KanbanOverlay } from "@/components/ui/kanban"
import { Lane } from "./Lane"
import { cn } from "@/lib/utils"
import { SwimlaneBarMenuItem, SwimlaneNavigatorBar, type SwimlaneNavigatorDockTarget } from "@/components/workspace/swimlane/SwimlaneNavigatorBar"
import { SwimlaneNavigatorDockMenu } from "@/components/workspace/swimlane/SwimlaneNavigatorDockMenu"
import { SwimlaneBarAppearanceMenu } from "@/components/workspace/swimlane/SwimlaneBarAppearanceMenu"
import { SwimlaneFitMenuItems } from "@/components/workspace/swimlane/SwimlaneFitMenuItems"
import { adjacentSwimlane, DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES, fitSwimlaneWidthsToViewport, legacySwimlaneSessionState, normalizeSwimlanePreferences } from "@/components/workspace/swimlane/model"
import { useSwimlaneSessionStore } from "@/store/swimlaneSessionStore"

interface LaneCardItem {
  id: string
  moduleId: string
}

export function LaneView() {
  const { t } = useTranslation()
  const { lanes, activeWorkspaceId, laneWorkspacePreferences } = useWorkspaceShallowSelector((state) => ({
    lanes: state.lanes,
    activeWorkspaceId: state.activeWorkspaceId,
    laneWorkspacePreferences: state.laneWorkspacePreferences,
  }))
  const visibleComponents = useWorkspaceVisibleComponents()
  const workspaceActions = useWorkspaceActions()
  const laneScrollRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [viewportWidth, setViewportWidth] = useState(960)
  const [previewLaneId, setPreviewLaneId] = useState<string>()
  const [navigatorDockTargets, setNavigatorDockTargets] = useState<SwimlaneNavigatorDockTarget[]>([])
  const preferences = normalizeSwimlanePreferences(laneWorkspacePreferences[activeWorkspaceId])
  const sessionScopeId = `workspace:${activeWorkspaceId}`
  const swimlaneSession = useSwimlaneSessionStore((state) => state.sessions[sessionScopeId])
  const ensureSwimlaneSession = useSwimlaneSessionStore((state) => state.ensureSession)
  const patchSwimlaneSession = useSwimlaneSessionStore((state) => state.patchSession)
  const handleDropModule = useCallback((moduleId: string) => {
    workspaceActions.deployComponent(moduleId, { viewMode: "lane" })
  }, [workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)

  // Ctrl+左键拖动框选多卡片
  const getComponentId = useCallback((el: HTMLElement) => el.dataset.componentId ?? null, [])
  const handleMarqueeSelect = useCallback((ids: string[]) => {
    workspaceActions.setSelection(ids)
  }, [workspaceActions])
  const {
    rect: marqueeRect,
    onPointerDown: onMarqueePointerDown,
    onPointerMove: onMarqueePointerMove,
    onPointerUp: onMarqueePointerUp,
  } = useMarqueeSelection({
    containerRef: laneScrollRef,
    getComponentId,
    onSelect: handleMarqueeSelect,
    enabled: true,
  })
  const laneSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  )

  // 当前 workspace 的 lanes（隐藏的不渲染）
  const wsLanes = useMemo(
    () => lanes.filter(l => l.workspaceId === activeWorkspaceId && !l.hidden),
    [lanes, activeWorkspaceId],
  )
  const wsLanesRef = useRef(wsLanes)
  wsLanesRef.current = wsLanes
  const laneIds = useMemo(() => wsLanes.map((lane) => lane.id), [wsLanes])
  const legacySession = legacySwimlaneSessionState(laneWorkspacePreferences[activeWorkspaceId])
  const activeLaneId = swimlaneSession?.activeLaneId && laneIds.includes(swimlaneSession.activeLaneId)
    ? swimlaneSession.activeLaneId
    : legacySession?.activeLaneId && laneIds.includes(legacySession.activeLaneId)
      ? legacySession.activeLaneId
      : laneIds[0] ?? null
  const sessionHasSoloLane = swimlaneSession !== undefined
    && Object.prototype.hasOwnProperty.call(swimlaneSession, "soloLaneId")
  const candidateSoloLaneId = sessionHasSoloLane
    ? swimlaneSession.soloLaneId
    : legacySession?.soloLaneId
  const soloLaneId = candidateSoloLaneId && laneIds.includes(candidateSoloLaneId) ? candidateSoloLaneId : null
  const navigatorLaneId = preferences.navigatorFollowsFocus || !preferences.navigatorLaneId || !laneIds.includes(preferences.navigatorLaneId)
    ? activeLaneId
    : preferences.navigatorLaneId
  const navigatorDockTarget = navigatorDockTargets.find((target) => target.id === navigatorLaneId)
  const laneGeometryKey = wsLanes.map((lane) => `${lane.id}:${lane.collapsed}`).join("|")

  const fitWorkspaceLanes = useCallback((overrides: Record<string, number> = {}) => {
    const currentLanes = wsLanesRef.current
    const widths = fitSwimlaneWidthsToViewport(viewportWidth, currentLanes.map((lane) => ({
      id: lane.id,
      width: (overrides[lane.id] ?? lane.widthRatio) * 320,
      collapsed: lane.collapsed,
      collapsedWidth: 48,
      minimumWidth: 240,
      maximumWidth: 1_280,
    })))
    for (const lane of currentLanes) {
      const width = widths[lane.id]
      if (width !== undefined) workspaceActions.setLaneWidthRatio(lane.id, width / 320)
    }
  }, [viewportWidth, workspaceActions])

  useEffect(() => {
    if (preferences.autoFitToViewport) fitWorkspaceLanes()
  }, [fitWorkspaceLanes, laneGeometryKey, preferences.autoFitToViewport])

  // 在 lane 模式下未隐藏的组件
  const laneComponents = useMemo(
    () => visibleComponents.filter(c => isComponentVisibleInView(c, "lane")),
    [visibleComponents],
  )

  // 每个 lane 内的组件列表（按 cardOrder 排序；不在 cardOrder 中的也加上，放到末尾）
  const kanbanValue = useMemo<Record<UniqueIdentifier, LaneCardItem[]>>(() => {
    const columns: Record<UniqueIdentifier, LaneCardItem[]> = {}
    const visibleLaneIds = new Set(wsLanes.map((lane) => lane.id))
    for (const lane of wsLanes) {
      const order = lane.cardOrder ?? []
      const ordered = order
        .map(id => laneComponents.find(c => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map(c => ({ id: c.id, moduleId: c.moduleId }))
      // 加上没在 cardOrder 中的（可能是新部署但还没更新到 cardOrder）
      const orderedSet = new Set(ordered.map(c => c.id))
      for (const c of laneComponents) {
        if (c.laneId === lane.id && !orderedSet.has(c.id)) {
          ordered.push({ id: c.id, moduleId: c.moduleId })
        }
      }
      columns[lane.id] = ordered
    }
    const fallbackLane = wsLanes[0]
    if (fallbackLane) {
      const fallbackItems = columns[fallbackLane.id] ?? []
      const fallbackIds = new Set(fallbackItems.map((item) => item.id))
      for (const component of laneComponents) {
        if ((!component.laneId || !visibleLaneIds.has(component.laneId)) && !fallbackIds.has(component.id)) {
          fallbackItems.push({ id: component.id, moduleId: component.moduleId })
          fallbackIds.add(component.id)
        }
      }
      columns[fallbackLane.id] = fallbackItems
    }
    return columns
  }, [wsLanes, laneComponents])

  // Repair missing or deleted lane ownership through the normal lane action.
  const orphanComponents = useMemo(() => {
    const laneIds = new Set(wsLanes.map(l => l.id))
    return laneComponents.filter(c => !c.laneId || !laneIds.has(c.laneId))
  }, [laneComponents, wsLanes])

  useEffect(() => {
    const fallbackLaneId = wsLanes[0]?.id
    if (!fallbackLaneId) return
    for (const component of orphanComponents) workspaceActions.moveComponentToLane(component.id, fallbackLaneId)
  }, [orphanComponents, workspaceActions, wsLanes])

  const handleKanbanChange = useCallback((columns: Record<UniqueIdentifier, LaneCardItem[]>) => {
    const visibleLaneIds = new Set(wsLanes.map((lane) => lane.id))
    const laneOrder = Object.keys(columns).filter((id) => visibleLaneIds.has(id))
    const cardOrderByLane = Object.fromEntries(
      laneOrder.map((laneId) => [laneId, (columns[laneId] ?? []).map((card) => card.id)]),
    )
    workspaceActions.setLaneBoardLayout(activeWorkspaceId, laneOrder, cardOrderByLane)
  }, [activeWorkspaceId, workspaceActions, wsLanes])

  useEffect(() => {
    const scroller = laneScrollRef.current
    if (!scroller) return
    const update = () => setViewportWidth(Math.max(1, scroller.clientWidth || 960))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => {
      observer.disconnect()
    }
  }, [wsLanes.length])

  useEffect(() => () => {
    clearTimeout(focusTimerRef.current)
    clearTimeout(revealTimerRef.current)
    clearTimeout(restoreTimerRef.current)
  }, [])

  useLayoutEffect(() => {
    const board = laneScrollRef.current
    if (!board) return
    const next = wsLanes.flatMap<SwimlaneNavigatorDockTarget>((lane) => {
      const host = board.querySelector<HTMLElement>(`[data-lane-id="${lane.id}"]`)
      if (!host) return []
      return [{ id: lane.id, host, titleHost: host.querySelector<HTMLElement>(`[data-swimlane-navigator-title-slot="${lane.id}"]`) }]
    })
    setNavigatorDockTargets(next)
  }, [laneGeometryKey, wsLanes])

  useEffect(() => {
    if (laneIds.length === 0) return
    ensureSwimlaneSession(sessionScopeId, {
      activeLaneId: activeLaneId ?? undefined,
      soloLaneId,
    })
    if (!swimlaneSession?.activeLaneId || !laneIds.includes(swimlaneSession.activeLaneId)) {
      patchSwimlaneSession(sessionScopeId, { activeLaneId: activeLaneId ?? undefined })
    }
    if (swimlaneSession?.soloLaneId && !laneIds.includes(swimlaneSession.soloLaneId)) {
      patchSwimlaneSession(sessionScopeId, { soloLaneId: null })
    }
    if (legacySession) workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, {})
  }, [activeLaneId, activeWorkspaceId, ensureSwimlaneSession, laneIds, legacySession, patchSwimlaneSession, sessionScopeId, soloLaneId, swimlaneSession?.activeLaneId, swimlaneSession?.soloLaneId, workspaceActions])

  const scrollToLane = useCallback((laneId: string, activate = true) => {
    const scroller = laneScrollRef.current
    if (!scroller) return

    const laneElement = Array.from(scroller.querySelectorAll<HTMLElement>("[data-lane-id]"))
      .find((element) => element.dataset.laneId === laneId && element.closest("[data-lane-board='true']"))
    if (!laneElement) return

    const scrollerRect = scroller.getBoundingClientRect()
    const laneRect = laneElement.getBoundingClientRect()
    scroller.scrollTo({
      left: scroller.scrollLeft + laneRect.left - scrollerRect.left,
      behavior: "smooth",
    })
    if (activate) patchSwimlaneSession(sessionScopeId, {
      activeLaneId: laneId,
      ...(preferences.soloOnFocus ? { soloLaneId: laneId } : {}),
    })
  }, [patchSwimlaneSession, preferences.soloOnFocus, sessionScopeId])

  useEffect(() => {
    if (activeLaneId) scrollToLane(activeLaneId, false)
  }, [activeLaneId, scrollToLane, soloLaneId, viewportWidth])

  function activateLane(laneId: string) {
    clearTimeout(focusTimerRef.current)
    setPreviewLaneId(undefined)
    scrollToLane(laneId)
  }

  function scheduleFocus(laneId: string) {
    if (!preferences.focusOnHover || activeLaneId === laneId || focusTimerRef.current) return
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = undefined
      activateLane(laneId)
    }, preferences.focusDelayMs)
  }

  function cancelFocus() {
    clearTimeout(focusTimerRef.current)
    focusTimerRef.current = undefined
  }

  function scheduleReveal(edge: "left" | "right") {
    if (!activeLaneId || soloLaneId !== activeLaneId || revealTimerRef.current) return
    const target = adjacentSwimlane(laneIds, activeLaneId, edge)
    if (!target) return
    clearTimeout(restoreTimerRef.current)
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = undefined
      setPreviewLaneId(target)
      scrollToLane(target, false)
    }, preferences.edgeRevealDelayMs)
  }

  function restoreReveal() {
    clearTimeout(revealTimerRef.current)
    revealTimerRef.current = undefined
    if (!previewLaneId || !activeLaneId) return
    restoreTimerRef.current = setTimeout(() => {
      setPreviewLaneId(undefined)
      scrollToLane(activeLaneId, false)
    }, 320)
  }

  // 没有任何 lane：显示空态 + 创建默认 lane
  if (wsLanes.length === 0) {
    return (
      <div
        className={cn(
          "relative flex flex-1 items-center justify-center ws-canvas-bg transition-colors",
          isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        )}
        data-testid="lane-drop-target"
        {...moduleDropHandlers}
      >
        {isModuleOver && <ModuleDropHint label={t("registry:dropHint")} />}
        <div className="xiranite-ui-copy text-center space-y-4">
          <Columns3 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-mono text-muted-foreground">{t("view:lane.empty")}</p>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => workspaceActions.addLane()}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t("view:lane.addLane")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Kanban value={kanbanValue} getItemValue={(item) => item.id} onValueChange={handleKanbanChange} sensors={laneSensors}>
      <div ref={workspaceRef} className="relative flex-1 ws-canvas-bg flex min-w-0 overflow-hidden" data-testid="lane-drop-target">
        <div
          ref={laneScrollRef}
          data-scrollbar="hidden"
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onPointerDown={onMarqueePointerDown}
          onPointerMove={onMarqueePointerMove}
          onPointerUp={onMarqueePointerUp}
        >
          <KanbanBoard
            className="h-full w-max min-w-max gap-0 overflow-visible"
            data-lane-board="true"
          >
            {wsLanes.map((lane) => (
              <Lane
                key={lane.id}
                lane={lane}
                components={kanbanValue[lane.id] ?? []}
                active={activeLaneId === lane.id}
                solo={soloLaneId === lane.id}
                soloWidth={viewportWidth}
                onActivate={() => activateLane(lane.id)}
                onHoverFocus={() => scheduleFocus(lane.id)}
                onHoverFocusCancel={cancelFocus}
                hideTitleForNavigator={navigatorLaneId === lane.id && preferences.navigatorDock === "top" && navigatorDockTarget?.titleHost != null}
                onWidthRatioChange={(ratio) => preferences.autoFitToViewport ? fitWorkspaceLanes({ [lane.id]: ratio }) : workspaceActions.setLaneWidthRatio(lane.id, ratio)}
                onClear={() => workspaceActions.setComponentsVisibility((kanbanValue[lane.id] ?? []).map((component) => component.id), "lane", false)}
                onResetNavigatorPosition={() => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, {
                  navigatorDock: "floating",
                  navigatorLaneId: undefined,
                  navigatorPositionX: DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.navigatorPositionX,
                  navigatorPositionY: DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.navigatorPositionY,
                })}
              />
            ))}
          </KanbanBoard>
          {/* 框选视觉反馈 */}
          {marqueeRect && (
            <div
              className="pointer-events-none absolute border border-primary/60 bg-primary/10"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}
        </div>

        {/* Add Lane 按钮 */}
        <div className="flex-shrink-0 w-12 flex items-center justify-center border-l border-border/40">
          <button
            onClick={() => workspaceActions.addLane()}
            className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
            title={t("common:addLane")}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {activeLaneId && soloLaneId === activeLaneId ? <>
          <div data-swimlane-reveal-trigger="left" className="absolute inset-y-12 left-0 z-30 w-2" onPointerEnter={() => scheduleReveal("left")} onPointerLeave={restoreReveal} />
          <div data-swimlane-reveal-trigger="right" className="absolute inset-y-12 right-0 z-30 w-2" onPointerEnter={() => scheduleReveal("right")} onPointerLeave={restoreReveal} />
        </> : null}
        {soloLaneId !== activeLaneId || preferences.showNavigatorInSolo ? <SwimlaneNavigatorBar
          items={wsLanes.map((lane) => ({ id: lane.id, label: `${translateLabel(lane.label, t)} (${kanbanValue[lane.id]?.length ?? 0})` }))}
          activeId={activeLaneId ?? wsLanes[0]!.id}
          handleStyle={preferences.barHandleStyle}
          handlePosition={preferences.barHandlePosition}
          compactItems
          position={{ x: preferences.navigatorPositionX, y: preferences.navigatorPositionY }}
          dock={preferences.navigatorDock}
          dockTargetId={navigatorLaneId ?? undefined}
          dockTargets={navigatorDockTargets}
          titleHost={navigatorDockTarget?.titleHost}
          dockHost={navigatorDockTarget?.host}
          boundsHost={workspaceRef.current}
          onSelect={activateLane}
          onPositionChange={({ x, y }) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { navigatorPositionX: x, navigatorPositionY: y })}
          onDockChange={(navigatorDock, targetId) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { navigatorDock, ...(navigatorDock === "floating" ? {} : { navigatorLaneId: targetId ?? navigatorLaneId }) })}
          menu={<>
            <SwimlaneBarMenuItem onSelect={() => patchSwimlaneSession(sessionScopeId, { soloLaneId: soloLaneId === activeLaneId ? null : activeLaneId })}>
              {soloLaneId === activeLaneId ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {soloLaneId === activeLaneId ? "退出当前泳道独占" : "当前泳道独占视口"}
            </SwimlaneBarMenuItem>
            <SwimlaneBarMenuItem onSelect={() => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { focusOnHover: !preferences.focusOnHover })}>
              <Settings2 className="size-3.5" />{preferences.focusOnHover ? "关闭悬停聚焦" : "开启悬停聚焦"}
            </SwimlaneBarMenuItem>
            <SwimlaneFitMenuItems
              autoFit={preferences.autoFitToViewport}
              onFit={() => fitWorkspaceLanes()}
              onAutoFitChange={(autoFitToViewport) => {
                workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { autoFitToViewport })
                if (autoFitToViewport) fitWorkspaceLanes()
              }}
            />
            <SwimlaneNavigatorDockMenu dock={preferences.navigatorDock} followsFocus={preferences.navigatorFollowsFocus} onDockChange={(navigatorDock) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { navigatorDock, ...(navigatorDock === "floating" ? {} : { navigatorLaneId }) })} onFollowsFocusChange={(navigatorFollowsFocus) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { navigatorFollowsFocus, ...(navigatorFollowsFocus ? { navigatorLaneId: activeLaneId ?? undefined } : {}) })} />
            <SwimlaneBarAppearanceMenu
              style={preferences.barHandleStyle}
              position={preferences.barHandlePosition}
              onStyleChange={(barHandleStyle) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { barHandleStyle })}
              onPositionChange={(barHandlePosition) => workspaceActions.patchLaneWorkspacePreferences(activeWorkspaceId, { barHandlePosition })}
            />
          </>}
        /> : null}
      </div>
      <KanbanOverlay className="z-[1000]">
        {({ value, variant }) => {
          if (variant === "column") {
            const lane = wsLanes.find((item) => item.id === value)
            if (!lane) return null
            return (
              <div className="xiranite-ui-copy h-[min(72vh,720px)] w-80 overflow-hidden rounded-md border border-border/50 bg-card shadow-2xl">
                <div className="flex h-8 items-center border-b border-border/40 bg-muted/30 px-2 text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">
                  {typeof lane.label === "string" ? lane.label : value}
                </div>
                <div className="p-2 text-[10px] font-mono text-muted-foreground">
                  {(kanbanValue[lane.id] ?? []).length} items
                </div>
              </div>
            )
          }

          const component = laneComponents.find((item) => item.id === value)
          if (!component) return null
          return (
            <div className="xiranite-ui-copy w-80 rounded-md border border-border/50 bg-card/95 p-3 text-card-foreground shadow-2xl">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">
                {component.moduleId}
              </div>
              <div className="mt-2 h-24 rounded-sm bg-muted/30" />
            </div>
          )
        }}
      </KanbanOverlay>
    </Kanban>
  )
}

function ModuleDropHint({ label }: { label: string }) {
  return (
    <div className="xiranite-ui-copy pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-sm border border-primary/40 bg-card/95 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary shadow-sm">
      {label}
    </div>
  )
}
