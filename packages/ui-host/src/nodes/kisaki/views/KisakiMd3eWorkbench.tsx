import * as React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  Ellipsis,
  FileText,
  FolderOpen,
  FolderSearch2,
  HardDrive,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  PanelTopOpen,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  TableProperties,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18nText"
import { formatBytes } from "@/lib/formatters"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { KisakiCardManager, KisakiCardTabs } from "../card-layout"
import { KisakiFilterPanel } from "../filter-panel"
import { KisakiFloatingAnalysisPanel } from "../floating-analysis-panel"
import { KisakiSimilarityReferenceDialog } from "../similarity-reference-dialog"
import { KisakiTokenEditor } from "../source-inputs"
import { ResultTable } from "./KisakiPanelsView"
import { Field, KisakiCardContent, StatusBar, SwitchLine } from "./KisakiCardsView"
import { KISAKI_TOOL_META, getKisakiToolMeta, type KisakiView } from "./model"
import type { KisakiPanel } from "../types"
import type { KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
import {
  KISAKI_WORKSPACE_DEFAULTS,
  updateKisakiWorkspaceLayout,
  type KisakiBarHandlePosition,
  type KisakiBarHandleStyle,
  type KisakiLaneId,
  type KisakiWorkspaceLayout,
} from "@hibernalglow/xaihi-kisaki/workspace-layout"
import { LaneResizer } from "@/components/workspace/lane/LaneResizer"
import { SwimlaneCollapseDragButton } from "@/components/workspace/swimlane/SwimlaneCollapseDragButton"
import {
  SwimlaneBarMenuItem,
  SwimlaneNavigatorBar,
  type SwimlaneNavigatorDockTarget,
} from "@/components/workspace/swimlane/SwimlaneNavigatorBar"
import { SwimlaneBarAppearanceMenu } from "@/components/workspace/swimlane/SwimlaneBarAppearanceMenu"
import { SwimlaneFitMenuItems } from "@/components/workspace/swimlane/SwimlaneFitMenuItems"
import { SwimlaneNavigatorDockMenu } from "@/components/workspace/swimlane/SwimlaneNavigatorDockMenu"
import { StandaloneApplicationSettings } from "@/nodes/shared/StandaloneApplicationContext"
import { adjacentSwimlane, fitSwimlaneWidthsToViewport, reorderSwimlanes } from "@/components/workspace/swimlane/model"
import {
  Md3eActionGroup,
  Md3eBentoStatGrid,
  Md3eHeaderBanner,
  Md3eHeroActionBar,
  Md3eSectionCard,
  Md3eShapeBadge,
  Md3eStatusPill,
} from "@/nodes/shared/controls"
import { useWorkspaceActions } from "@/store/workspaceStore"

function Md3eKisakiCardContent({ id, props }: { id: string; props: KisakiView }) {
  return <KisakiCardContent id={id} props={props} />
}

function Md3eKisakiSourcePanel(props: KisakiView) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <KisakiCardTabs
        activeId={props.data.sourcePanelTab}
        layout={props.cardLayout}
        panel="source"
        onActiveChange={(sourcePanelTab) => props.patch({ sourcePanelTab })}
        renderCard={(id) => <Md3eKisakiCardContent id={id} props={props} />}
      />
    </div>
  )
}

function Md3eKisakiAnalysisPanel(props: KisakiView) {
  const stats = props.result
  const progress = props.data.progress ?? 0
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <Md3eBentoStatGrid
        className="grid-cols-2 gap-1.5"
        items={[
          {
            label: props.t("metrics.files", tt("module:kisaki.metrics.files", "文件")),
            value: stats?.fileCount ?? 0,
            icon: FileText,
            tone: "primary",
          },
          {
            label: props.t("metrics.groups", tt("module:kisaki.metrics.groups", "分组")),
            value: stats?.groupCount ?? 0,
            icon: Layers,
            tone: "secondary",
          },
          {
            label: props.t("metrics.totalSize", tt("module:kisaki.metrics.totalSize", "总大小")),
            value: formatBytes(stats?.totalBytes ?? 0),
            icon: HardDrive,
            tone: "tertiary",
          },
          {
            label: props.t("metrics.reclaimable", tt("module:kisaki.metrics.reclaimable", "可回收")),
            value: formatBytes(stats?.reclaimableBytes ?? 0),
            icon: Sparkles,
            gauge: progress,
          },
        ]}
      />
      <KisakiCardTabs
        activeId={props.data.analysisPanelTab}
        layout={props.cardLayout}
        panel="analysis"
        onActiveChange={(analysisPanelTab) => props.patch({ analysisPanelTab })}
        renderCard={(id) => <Md3eKisakiCardContent id={id} props={props} />}
      />
    </div>
  )
}

export function Md3eKisakiFull(props: KisakiView) {
  const floatingOpen = props.floatingAvailable && props.floatingAnalysisPanel.open
  const layout = props.workspaceLayout
  const boardRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [boardWidth, setBoardWidth] = useState(960)
  const [previewLane, setPreviewLane] = useState<KisakiLaneId>()
  const [navigatorDockTargets, setNavigatorDockTargets] = useState<Array<SwimlaneNavigatorDockTarget<KisakiLaneId>>>([])
  const [draggedLane, setDraggedLane] = useState<KisakiLaneId | null>(null)
  const visibleLaneOrder = layout.laneOrder.filter((id) => !(floatingOpen && id === "analysis"))
  const visibleLaneKey = visibleLaneOrder.join("|")
  const activeLane = visibleLaneOrder.includes(layout.activeLane) ? layout.activeLane : visibleLaneOrder[0] ?? "results"
  const navigatorHostLane = layout.navigatorDock === "floating" || layout.navigatorFollowsFocus ? activeLane : layout.navigatorLane
  const navigatorDockTarget = navigatorDockTargets.find((target) => target.id === navigatorHostLane)

  const lanes: Record<
    KisakiLaneId,
    {
      collapsed: boolean
      collapsedLabel: string
      defaultWidth: number
      label: string
      resizeLabel: string
      width: number
      content: React.ReactNode
    }
  > = {
    source: {
      collapsed: layout.sourcePanelMinimized,
      collapsedLabel: props.t("workspace.restoreConditions", tt("module:kisaki.workspace.restoreConditions", "恢复扫描条件")),
      defaultWidth: 320,
      label: props.t("sections.conditions", tt("module:kisaki.sections.conditions", "扫描条件")),
      resizeLabel: props.t("workspace.resizeConditions", tt("module:kisaki.workspace.resizeConditions", "调整扫描条件宽度")),
      width: layout.sourcePanelWidth,
      content: <Md3eKisakiSourcePanel {...props} />,
    },
    results: {
      collapsed: layout.resultPanelMinimized,
      collapsedLabel: props.t("workspace.restoreResults", tt("module:kisaki.workspace.restoreResults", "恢复扫描结果")),
      defaultWidth: 740,
      label: props.t("tabs.results", tt("module:kisaki.tabs.results", "扫描结果")),
      resizeLabel: props.t("workspace.resizeResults", tt("module:kisaki.workspace.resizeResults", "调整扫描结果宽度")),
      width: layout.resultPanelWidth,
      content: (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[var(--md3e-surface-low,var(--background))]/80">
          <ResultTable {...props} />
        </div>
      ),
    },
    analysis: {
      collapsed: layout.analysisPanelMinimized,
      collapsedLabel: props.t("workspace.restoreAnalysis", tt("module:kisaki.workspace.restoreAnalysis", "恢复分析与操作")),
      defaultWidth: 330,
      label: props.t("sections.analysisOperations", tt("module:kisaki.sections.analysisOperations", "分析与操作")),
      resizeLabel: props.t("workspace.resizeAnalysis", tt("module:kisaki.workspace.resizeAnalysis", "调整分析面板宽度")),
      width: layout.analysisPanelWidth,
      content: <Md3eKisakiAnalysisPanel {...props} />,
    },
  }

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const update = () => setBoardWidth(Math.max(1, board.clientWidth || 960))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(board)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    const next = visibleLaneOrder.flatMap<Array<SwimlaneNavigatorDockTarget<KisakiLaneId>>[number]>((id) => {
      const host = board.querySelector<HTMLElement>(`[data-czkawka-lane-id="${id}"]`)
      if (!host) return []
      return [{ id, host, titleHost: host.querySelector<HTMLElement>(`[data-swimlane-navigator-title-slot="${id}"]`) }]
    })
    setNavigatorDockTargets(next)
  }, [layout.analysisPanelMinimized, layout.resultPanelMinimized, layout.sourcePanelMinimized, visibleLaneKey])

  useEffect(() => {
    if (!layout.autoFitToViewport) return
    const next = fitKisakiLayoutToViewport(layout, boardWidth, visibleLaneOrder)
    if (sameKisakiWidths(layout, next)) return
    props.setWorkspaceLayout(next)
  }, [boardWidth, layout.analysisPanelMinimized, layout.autoFitToViewport, layout.resultPanelMinimized, layout.sourcePanelMinimized, props.setWorkspaceLayout, visibleLaneKey])

  function scrollLane(id: KisakiLaneId) {
    const board = boardRef.current
    const lane = board?.querySelector<HTMLElement>(`[data-czkawka-lane-id="${id}"]`)
    if (!board || !lane) return
    board.scrollTo({ left: board.scrollLeft + lane.getBoundingClientRect().left - board.getBoundingClientRect().left, behavior: "smooth" })
  }

  useEffect(() => {
    scrollLane(activeLane)
  }, [activeLane, layout.soloLane])

  useEffect(() => () => {
    clearTimeout(focusTimerRef.current)
    clearTimeout(revealTimerRef.current)
    clearTimeout(restoreTimerRef.current)
  }, [])

  function patchLane(id: KisakiLaneId, patch: { collapsed?: boolean; width?: number }) {
    let next =
      id === "source"
        ? updateKisakiWorkspaceLayout(layout, { sourcePanelMinimized: patch.collapsed, sourcePanelWidth: patch.width })
        : id === "results"
          ? updateKisakiWorkspaceLayout(layout, { resultPanelMinimized: patch.collapsed, resultPanelWidth: patch.width })
          : updateKisakiWorkspaceLayout(layout, { analysisPanelMinimized: patch.collapsed, analysisPanelWidth: patch.width })
    if (layout.autoFitToViewport) next = fitKisakiLayoutToViewport(next, boardWidth, visibleLaneOrder)
    props.setWorkspaceLayout(next)
  }

  function moveLane(target: KisakiLaneId) {
    if (!draggedLane || draggedLane === target) return
    const laneOrder = reorderSwimlanes(layout.laneOrder, draggedLane, target)
    props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { laneOrder }))
    setDraggedLane(null)
  }

  function activateLane(id: KisakiLaneId) {
    if (activeLane === id && (!layout.soloOnFocus || layout.soloLane === id)) return
    clearTimeout(focusTimerRef.current)
    clearTimeout(revealTimerRef.current)
    clearTimeout(restoreTimerRef.current)
    setPreviewLane(undefined)
    props.setWorkspaceLayout(
      updateKisakiWorkspaceLayout(layout, {
        activeLane: id,
        ...(layout.soloOnFocus ? { soloLane: id } : {}),
      }),
    )
  }

  function scheduleFocus(id: KisakiLaneId) {
    if (!layout.focusOnHover || activeLane === id || focusTimerRef.current) return
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = undefined
      activateLane(id)
    }, layout.focusDelayMs)
  }

  function cancelFocus() {
    clearTimeout(focusTimerRef.current)
    focusTimerRef.current = undefined
  }

  function scheduleReveal(edge: "left" | "right") {
    if (layout.soloLane !== activeLane || revealTimerRef.current) return
    const target = adjacentSwimlane(visibleLaneOrder, activeLane, edge)
    if (!target) return
    clearTimeout(restoreTimerRef.current)
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = undefined
      setPreviewLane(target)
      scrollLane(target)
    }, layout.edgeRevealDelayMs)
  }

  function restoreReveal() {
    clearTimeout(revealTimerRef.current)
    revealTimerRef.current = undefined
    if (!previewLane) return
    restoreTimerRef.current = setTimeout(() => {
      setPreviewLane(undefined)
      scrollLane(activeLane)
    }, 320)
  }

  const navigatorItems = visibleLaneOrder.map((id) => ({
    id,
    label: `切换到 ${lanes[id].label.replace(" / LANE", "")}`,
    icon: id === "source" ? PanelLeft : id === "results" ? TableProperties : PanelRight,
  }))

  return (
    <div
      data-testid="czkawka-full-view"
      data-ui-variant="md3e"
      className="relative flex h-full min-h-0 flex-1 flex-col gap-1.5 overflow-hidden bg-[var(--md3e-surface-low,var(--background))] p-2"
    >
      {/* 1. Rossi Compact Expressive Top Toolbar */}
      <Md3eFullHeader {...props} />

      {/* 2. Ground-Up MD3E 3-Zone Swimlane Workbench (Full Vertical Height) */}
      <div ref={workspaceRef} className="relative flex min-h-0 flex-1 overflow-hidden rounded-[22px]">
        <div
          ref={boardRef}
          data-testid="czkawka-lane-board"
          data-scrollbar="hidden"
          className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden"
        >
          {visibleLaneOrder.map((id) => (
            <Md3eKisakiSwimlane
              key={id}
              {...lanes[id]}
              testId={id}
              active={activeLane === id}
              solo={layout.soloLane === id}
              effectiveWidth={layout.soloLane === id ? boardWidth : lanes[id].width}
              onActivate={() => activateLane(id)}
              onHoverFocus={() => scheduleFocus(id)}
              onHoverFocusCancel={cancelFocus}
              hideTitleForNavigator={
                navigatorHostLane === id && layout.navigatorDock === "top" && navigatorDockTarget?.titleHost != null
              }
              onCollapsedChange={(collapsed) => patchLane(id, { collapsed })}
              onWidthChange={(width) => patchLane(id, { width })}
              onResetNavigatorPosition={() =>
                props.setWorkspaceLayout(
                  updateKisakiWorkspaceLayout(layout, {
                    navigatorDock: "floating",
                    navigatorLane: id,
                    navigatorPositionX: KISAKI_WORKSPACE_DEFAULTS.navigatorPositionX,
                    navigatorPositionY: KISAKI_WORKSPACE_DEFAULTS.navigatorPositionY,
                  }),
                )
              }
              onDragStart={() => setDraggedLane(id)}
              onDrop={() => moveLane(id)}
            >
              {lanes[id].content}
            </Md3eKisakiSwimlane>
          ))}
        </div>
        {layout.soloLane === activeLane && !layout.showNavigatorInSolo ? null : (
          <SwimlaneNavigatorBar
            items={navigatorItems}
            activeId={activeLane}
            handleStyle={layout.barHandleStyle}
            handlePosition={layout.barHandlePosition}
            compactItems
            position={{ x: layout.navigatorPositionX, y: layout.navigatorPositionY }}
            dock={layout.navigatorDock}
            dockTargetId={navigatorHostLane}
            dockTargets={navigatorDockTargets}
            titleHost={navigatorDockTarget?.titleHost}
            dockHost={navigatorDockTarget?.host}
            boundsHost={workspaceRef.current}
            onSelect={activateLane}
            onPositionChange={({ x, y }) =>
              props.setWorkspaceLayout(
                updateKisakiWorkspaceLayout(layout, {
                  navigatorDock: "floating",
                  navigatorPositionX: x,
                  navigatorPositionY: y,
                }),
              )
            }
            onDockChange={(navigatorDock, targetId) =>
              props.setWorkspaceLayout(
                updateKisakiWorkspaceLayout(layout, {
                  navigatorDock,
                  ...(navigatorDock === "floating" ? {} : { navigatorLane: targetId ?? navigatorHostLane }),
                }),
              )
            }
            menu={
              <>
                <SwimlaneBarMenuItem
                  onSelect={() =>
                    props.setWorkspaceLayout(
                      updateKisakiWorkspaceLayout(layout, {
                        soloLane: layout.soloLane === activeLane ? null : activeLane,
                        activeLane,
                      }),
                    )
                  }
                >
                  {layout.soloLane === activeLane ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                  {layout.soloLane === activeLane ? "退出当前泳道独占" : "当前泳道独占视口"}
                </SwimlaneBarMenuItem>
                <SwimlaneBarMenuItem
                  onSelect={() =>
                    props.setWorkspaceLayout(
                      updateKisakiWorkspaceLayout(layout, {
                        focusOnHover: !layout.focusOnHover,
                      }),
                    )
                  }
                >
                  <Settings2 className="size-3.5" />
                  {layout.focusOnHover ? "关闭悬停聚焦" : "开启悬停聚焦"}
                </SwimlaneBarMenuItem>
                <SwimlaneFitMenuItems
                  autoFit={layout.autoFitToViewport}
                  onFit={() => props.setWorkspaceLayout(fitKisakiLayoutToViewport(layout, boardWidth, visibleLaneOrder))}
                  onAutoFitChange={(autoFitToViewport) =>
                    props.setWorkspaceLayout(
                      autoFitToViewport
                        ? fitKisakiLayoutToViewport(
                            updateKisakiWorkspaceLayout(layout, { autoFitToViewport }),
                            boardWidth,
                            visibleLaneOrder,
                          )
                        : updateKisakiWorkspaceLayout(layout, { autoFitToViewport }),
                    )
                  }
                />
                <SwimlaneNavigatorDockMenu
                  dock={layout.navigatorDock}
                  followsFocus={layout.navigatorFollowsFocus}
                  onDockChange={(navigatorDock) =>
                    props.setWorkspaceLayout(
                      updateKisakiWorkspaceLayout(layout, {
                        navigatorDock,
                        ...(navigatorDock === "floating" ? {} : { navigatorLane: navigatorHostLane }),
                      }),
                    )
                  }
                  onFollowsFocusChange={(navigatorFollowsFocus) =>
                    props.setWorkspaceLayout(
                      updateKisakiWorkspaceLayout(layout, {
                        navigatorFollowsFocus,
                        ...(navigatorFollowsFocus ? { navigatorLane: activeLane } : {}),
                      }),
                    )
                  }
                />
                <SwimlaneBarAppearanceMenu
                  style={layout.barHandleStyle}
                  position={layout.barHandlePosition}
                  onStyleChange={(barHandleStyle) =>
                    props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { barHandleStyle }))
                  }
                  onPositionChange={(barHandlePosition) =>
                    props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { barHandlePosition }))
                  }
                />
              </>
            }
          />
        )}
        {layout.soloLane === activeLane ? (
          <>
            <div
              data-swimlane-reveal-trigger="left"
              className="absolute inset-y-10 left-0 z-30 w-2"
              onPointerEnter={() => scheduleReveal("left")}
              onPointerLeave={restoreReveal}
            />
            <div
              data-swimlane-reveal-trigger="right"
              className="absolute inset-y-10 right-0 z-30 w-2"
              onPointerEnter={() => scheduleReveal("right")}
              onPointerLeave={restoreReveal}
            />
          </>
        ) : null}
      </div>
      {floatingOpen ? (
        <KisakiFloatingAnalysisPanel
          state={props.floatingAnalysisPanel}
          viewport={props.floatingViewport}
          layout={props.cardLayout}
          onStateChange={props.setFloatingAnalysisPanel}
          onLayoutChange={props.setCardLayout}
          renderCard={(id) => <KisakiCardContent id={id} props={props} />}
        />
      ) : null}
    </div>
  )
}

function fitKisakiLayoutToViewport(
  layout: KisakiWorkspaceLayout,
  viewportWidth: number,
  laneOrder: readonly KisakiLaneId[],
): KisakiWorkspaceLayout {
  const widths = fitSwimlaneWidthsToViewport(
    viewportWidth,
    laneOrder.map((id) => ({
      id,
      width:
        id === "source"
          ? layout.sourcePanelWidth
          : id === "results"
            ? layout.resultPanelWidth
            : layout.analysisPanelWidth,
      collapsed:
        id === "source"
          ? layout.sourcePanelMinimized
          : id === "results"
            ? layout.resultPanelMinimized
            : layout.analysisPanelMinimized,
      collapsedWidth: 48,
      minimumWidth: id === "results" ? 360 : id === "source" ? 220 : 210,
      maximumWidth: id === "results" ? 1_200 : id === "source" ? 560 : 520,
    })),
  )
  return updateKisakiWorkspaceLayout(layout, {
    sourcePanelWidth: widths.source ?? layout.sourcePanelWidth,
    resultPanelWidth: widths.results ?? layout.resultPanelWidth,
    analysisPanelWidth: widths.analysis ?? layout.analysisPanelWidth,
  })
}

function sameKisakiWidths(left: KisakiWorkspaceLayout, right: KisakiWorkspaceLayout): boolean {
  return (
    left.sourcePanelWidth === right.sourcePanelWidth &&
    left.resultPanelWidth === right.resultPanelWidth &&
    left.analysisPanelWidth === right.analysisPanelWidth
  )
}

function Md3eKisakiSwimlane({
  children,
  active,
  collapsed,
  collapsedLabel,
  defaultWidth,
  effectiveWidth,
  hideTitleForNavigator,
  label,
  onActivate,
  onCollapsedChange,
  onDragStart,
  onDrop,
  onHoverFocus,
  onHoverFocusCancel,
  onResetNavigatorPosition,
  onTitleHostChange,
  onWidthChange,
  resizeLabel,
  solo,
  testId,
  width,
}: {
  children: React.ReactNode
  active: boolean
  collapsed: boolean
  collapsedLabel: string
  defaultWidth: number
  effectiveWidth: number
  hideTitleForNavigator: boolean
  label: string
  onActivate: () => void
  onCollapsedChange: (collapsed: boolean) => void
  onDragStart: () => void
  onDrop: () => void
  onHoverFocus: () => void
  onHoverFocusCancel: () => void
  onResetNavigatorPosition: () => void
  onTitleHostChange?: (node: HTMLElement | null) => void
  onWidthChange: (width: number) => void
  resizeLabel: string
  solo: boolean
  testId: string
  width: number
}) {
  const widthRef = useRef(width)
  useEffect(() => {
    widthRef.current = width
  }, [width])

  if (collapsed) {
    return (
      <section
        data-testid={`czkawka-lane-${testId}`}
        data-czkawka-lane-id={testId}
        data-swimlane-active={active}
        onPointerEnter={onHoverFocus}
        onPointerLeave={onHoverFocusCancel}
        onPointerDown={onActivate}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="flex h-full w-12 shrink-0 flex-col items-center gap-2 rounded-[18px] bg-[var(--md3e-surface-mid,var(--card))]/40 px-1 py-3 backdrop-blur-xs transition-colors hover:bg-[var(--md3e-surface-mid,var(--card))]/70"
      >
        <SwimlaneCollapseDragButton
          collapsed
          laneLabel={label}
          draggable
          aria-label={collapsedLabel}
          onClick={() => onCollapsedChange(false)}
          onDragStart={onDragStart}
        />
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
          {label}
        </span>
      </section>
    )
  }

  return (
    <section
      data-testid={`czkawka-lane-${testId}`}
      data-czkawka-lane-id={testId}
      data-swimlane-active={active}
      data-swimlane-solo={solo}
      onPointerEnter={onHoverFocus}
      onPointerLeave={onHoverFocusCancel}
      onPointerDown={onActivate}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "relative flex h-full min-w-60 shrink-0 flex-col overflow-hidden rounded-[20px] bg-[var(--md3e-surface-mid,var(--card))]/50 backdrop-blur-xs transition-[box-shadow,border-color]",
        active ? "ring-1 ring-[var(--md3e-primary,var(--primary))]/50 shadow-xs" : "border border-border/30",
      )}
      style={{ width: effectiveWidth }}
    >
      <header className="flex h-7 shrink-0 items-center gap-1.5 bg-[var(--md3e-surface-high,var(--muted))]/65 px-2.5">
        <SwimlaneCollapseDragButton
          collapsed={false}
          laneLabel={label}
          draggable
          aria-label={collapsedLabel.replace("恢复", "折叠")}
          onClick={() => onCollapsedChange(true)}
          onDragStart={onDragStart}
        />
        <span ref={onTitleHostChange} className="flex min-w-0 flex-1" data-swimlane-navigator-title-slot={testId}>
          {hideTitleForNavigator ? null : (
            <span
              data-swimlane-lane-title="true"
              className="min-w-0 flex-1 truncate text-left text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground"
              title={label}
            >
              {label}
            </span>
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${label}更多设置`}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Ellipsis className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48" onPointerDown={(event) => event.stopPropagation()}>
            <DropdownMenuItem onSelect={onResetNavigatorPosition}>
              <RotateCcw className="size-3.5 mr-2" />
              重置操作栏位置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div
        data-scrollbar="hidden"
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          testId === "results" ? "p-1.5" : "p-2",
        )}
      >
        {children}
      </div>
      <LaneResizer
        label={resizeLabel}
        className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1"
        onReset={() => onWidthChange(defaultWidth)}
        onResize={(deltaRatio) => {
          widthRef.current += deltaRatio * 320
          onWidthChange(widthRef.current)
        }}
      />
    </section>
  )
}

function Md3eFullHeader(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  const { setUiFace } = useWorkspaceActions()
  const stats = props.result

  return (
    <Md3eHeaderBanner
      icon={meta.icon}
      title="Kisaki"
      subtitle={meta.description ?? "FILE FORENSICS / 11 SCANNERS / TS CONTROL PLANE"}
      eyebrow="FORENSIC CORE"
      tone="primary"
      testId="kisaki-header-banner"
      pills={
        <>
          <ToolSelector props={props} />
          <Md3eStatusPill
            label={`${stats?.fileCount ?? 0} 文件 · ${stats?.groupCount ?? 0} 组 · 可回收 ${formatBytes(stats?.reclaimableBytes ?? 0)}`}
            tone="primary"
            compact
            dot={false}
          />
          <Md3eStatusPill
            label={props.t("summary.selected", "{{count}} 已选", { count: props.selectedPaths.length })}
            tone="secondary"
            compact
          />
        </>
      }
      actions={
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                data-testid="kisaki-ui-face-switch"
                aria-label="切换到 Legacy 原版界面"
                variant="outline"
                size="xs"
                shapeRole="toolbar"
                className="gap-1 font-mono text-[11px]"
                onClick={() => setUiFace("legacy")}
              >
                原版
              </Button>
            </TooltipTrigger>
            <TooltipContent>切换回 Legacy 原版传统界面</TooltipContent>
          </Tooltip>

          {props.tool === "similar-images" || props.tool === "similar-videos" ? (
            <KisakiSimilarityReferenceDialog t={props.t} />
          ) : null}

          <Button
            aria-label={
              props.floatingAnalysisPanel.open
                ? props.t("actions.closeFloatingAnalysis", "关闭浮动分析面板")
                : props.t("actions.openFloatingAnalysis", "打开浮动分析面板")
            }
            disabled={!props.floatingAvailable}
            size="icon-xs"
            shapeRole="toolbar"
            variant={props.floatingAnalysisPanel.open ? "secondary" : "ghost"}
            onClick={() =>
              props.setFloatingAnalysisPanel({
                ...props.floatingAnalysisPanel,
                open: !props.floatingAnalysisPanel.open,
              })
            }
          >
            <PanelTopOpen />
          </Button>

          <KisakiCardManager layout={props.cardLayout} onChange={props.setCardLayout} />
          <KisakiNodeSettings props={props} />

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={props.t("filters.global", "Kisaki 全局筛选")}
              className="h-7 w-36 pl-7 pr-6 text-xs @[800px]:w-48 rounded-full bg-[var(--md3e-surface-high,var(--muted))]/70"
              placeholder={props.t("filters.searchCurrent", "搜索当前结果")}
              value={props.filterText}
              onChange={(event) => props.setFilterText(event.currentTarget.value)}
            />
            {props.filterText ? (
              <button
                type="button"
                aria-label={props.t("filters.clearSearch", "清除结果搜索")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => props.setFilterText("")}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          <KisakiFilterPanel
            tool={props.tool}
            state={props.filterState}
            stats={props.filterResult.stats}
            pathPatternError={props.filterResult.pathPatternError}
            textPatternError={props.filterResult.textPatternError}
            presets={props.filterPresets}
            onChange={props.setFilterState}
            onPresetsChange={props.setFilterPresets}
          />

          <Button
            size="xs"
            shapeRole="command"
            variant={props.running ? "destructive" : "default"}
            onClick={props.running ? props.cancelScan : props.executeScan}
            className="gap-1 font-semibold"
          >
            {props.running ? <X className="size-3.5" /> : <Play className="size-3.5" />}
            {props.running ? props.t("actions.stopScan", "停止") : props.t("actions.startScan", "扫描")}
          </Button>
        </div>
      }
    />
  )
}

export function Md3eKisakiCompact(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  const { setUiFace } = useWorkspaceActions()

  return (
    <div
      data-testid="czkawka-compact-view"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden bg-[var(--md3e-surface-low,var(--background))] p-2"
    >
      <Md3eHeaderBanner
        icon={meta.icon}
        title="Kisaki"
        subtitle={meta.label}
        eyebrow="COMPACT FORENSICS"
        tone="primary"
        compact
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              data-testid="kisaki-ui-face-switch"
              aria-label="切换到 Legacy 原版界面"
              variant="outline"
              size="xs"
              shapeRole="toolbar"
              onClick={() => setUiFace("legacy")}
            >
              原版
            </Button>
            <Button
              size="xs"
              shapeRole="command"
              variant={props.running ? "destructive" : "default"}
              onClick={props.running ? props.cancelScan : props.executeScan}
            >
              {props.running ? <X className="size-3" /> : <Play className="size-3" />}
            </Button>
          </div>
        }
      />

      <Tabs value={props.panel} onValueChange={(value) => props.setPanel(value as KisakiPanel)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full shrink-0 grid-cols-3 rounded-full bg-[var(--md3e-surface-mid,var(--muted))]/70 p-1">
          <TabsTrigger value="source" className="rounded-full text-xs data-[state=active]:bg-background">
            {props.t("tabs.conditions", "条件")}
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5 rounded-full text-xs data-[state=active]:bg-background">
            {props.t("tabs.results", "结果")}
            <Badge variant="outline" className="px-1 text-[10px]">
              {props.result?.fileCount ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="rounded-full text-xs data-[state=active]:bg-background">
            {props.t("tabs.analysis", "统计")}
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden pt-1.5">
          {props.panel === "source" ? (
            <Md3eKisakiSourcePanel {...props} />
          ) : props.panel === "results" ? (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-[var(--md3e-surface-mid,var(--card))]/50">
              <ResultTable {...props} />
            </div>
          ) : (
            <Md3eKisakiAnalysisPanel {...props} />
          )}
        </div>
      </Tabs>
    </div>
  )
}

export function Md3eKisakiCollapsed(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  const { setUiFace } = useWorkspaceActions()

  return (
    <div
      data-testid="czkawka-collapsed-view"
      data-ui-variant="md3e"
      className="flex h-full w-full items-center gap-2.5 rounded-[18px] bg-[var(--md3e-surface-mid,var(--card))] px-3 shadow-xs"
    >
      <Md3eShapeBadge icon={meta.icon} seed={`kisaki-collapsed-${props.tool}`} tone="primary" size="sm" active />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-foreground leading-none">Kisaki · {meta.label}</span>
          <Md3eStatusPill
            label={props.data.phase ?? "idle"}
            tone={props.data.phase === "error" ? "error" : props.running ? "running" : "idle"}
            compact
          />
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {props.data.progressText || props.t("summary.resultCount", "{{count}} 个结果", { count: props.result?.fileCount ?? 0 })}
        </div>
      </div>
      <Button
        aria-label={props.running ? props.t("actions.stopScan", "停止扫描") : props.t("actions.startScan", "开始扫描")}
        size="icon-xs"
        shapeRole="command"
        variant={props.running ? "destructive" : "default"}
        onClick={props.running ? props.cancelScan : props.executeScan}
      >
        {props.running ? <X /> : <Play />}
      </Button>
    </div>
  )
}

function ToolSelector({ compact = false, props }: { compact?: boolean; props: KisakiView }) {
  return (
    <Select value={props.tool} onValueChange={(tool) => props.patch({ tool: tool as KisakiTool })}>
      <SelectTrigger
        aria-label={props.t("tools.select", "选择扫描工具")}
        className={cn(
          "h-7 rounded-full bg-[var(--md3e-surface-high,var(--muted))]/70 text-xs",
          compact ? "w-36" : "w-48",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KISAKI_TOOL_META.filter(
          (definition) =>
            !("requiredNativeCapability" in definition) ||
            !definition.requiredNativeCapability ||
            props.nativeCapabilities.has(definition.requiredNativeCapability),
        ).map((definition) => {
          const tool = getKisakiToolMeta(definition.id, props.t)
          return (
            <SelectItem key={tool.id} value={tool.id}>
              <span className="flex items-center gap-2">
                <tool.icon className="size-3.5" />
                {tool.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function KisakiNodeSettings({ props }: { props: KisakiView }) {
  return (
    <StandaloneApplicationSettings
      title={props.t("settings.title", "Kisaki 节点设置")}
      description={props.t("settings.description", "适用于所有扫描器的目录过滤、缓存和性能设置。")}
      trigger={
        <Button aria-label={props.t("settings.open", "节点设置")} size="icon-xs" shapeRole="toolbar" variant="ghost">
          <Settings2 />
        </Button>
      }
    >
      <SettingsSection title={props.t("settings.general", "通用设置")}>
        <KisakiTokenEditor
          kind="rules"
          label={props.t("sources.excludedItems", "排除的项目")}
          value={props.data.excludedItemsText}
          placeholder={props.t("sources.excludedItemsPlaceholder", "*/cache*, */node_modules*")}
          onChange={(excludedItemsText) => props.patch({ excludedItemsText })}
        />
      </SettingsSection>
    </StandaloneApplicationSettings>
  )
}

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  )
}
