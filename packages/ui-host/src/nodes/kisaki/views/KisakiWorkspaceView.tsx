import * as React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Ellipsis, FolderOpen, Maximize2, Minimize2, PanelLeft, PanelRight, PanelTopOpen, Play, RotateCcw, Search, Settings2, TableProperties, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { KisakiCardManager } from "../card-layout"
import { KisakiFilterPanel } from "../filter-panel"
import { KisakiFloatingAnalysisPanel } from "../floating-analysis-panel"
import { KisakiSimilarityReferenceDialog } from "../similarity-reference-dialog"
import { KisakiTokenEditor } from "../source-inputs"
import { AnalysisPanel, ResultTable, SourcePanel } from "./KisakiPanelsView"
import { KisakiCardContent, Field, StatusBar, SwitchLine } from "./KisakiCardsView"
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
import { SwimlaneBarMenuItem, SwimlaneNavigatorBar, type SwimlaneNavigatorDockTarget } from "@/components/workspace/swimlane/SwimlaneNavigatorBar"
import { SwimlaneBarAppearanceMenu } from "@/components/workspace/swimlane/SwimlaneBarAppearanceMenu"
import { SwimlaneFitMenuItems } from "@/components/workspace/swimlane/SwimlaneFitMenuItems"
import { SwimlaneInteractionSettings } from "@/components/workspace/swimlane/SwimlaneInteractionSettings"
import { SwimlaneNavigatorDockMenu } from "@/components/workspace/swimlane/SwimlaneNavigatorDockMenu"
import { adjacentSwimlane, fitSwimlaneWidthsToViewport, reorderSwimlanes } from "@/components/workspace/swimlane/model"

function Full(props: KisakiView) {
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
  const lanes: Record<KisakiLaneId, { collapsed: boolean; collapsedLabel: string; defaultWidth: number; label: string; resizeLabel: string; width: number; content: React.ReactNode }> = {
    source: { collapsed: layout.sourcePanelMinimized, collapsedLabel: props.t("workspace.restoreConditions", "恢复扫描条件"), defaultWidth: 300, label: `${props.t("sections.conditions", "扫描条件")} / LANE`, resizeLabel: props.t("workspace.resizeConditions", "调整扫描条件宽度"), width: layout.sourcePanelWidth, content: <SourcePanel {...props} /> },
    results: { collapsed: layout.resultPanelMinimized, collapsedLabel: props.t("workspace.restoreResults", "恢复扫描结果"), defaultWidth: 720, label: `${props.t("tabs.results", "扫描结果")} / LANE`, resizeLabel: props.t("workspace.resizeResults", "调整扫描结果宽度"), width: layout.resultPanelWidth, content: <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card"><ResultTable {...props} /></section> },
    analysis: { collapsed: layout.analysisPanelMinimized, collapsedLabel: props.t("workspace.restoreAnalysis", "恢复分析与操作"), defaultWidth: 300, label: `${props.t("sections.analysisOperations", "分析与操作")} / LANE`, resizeLabel: props.t("workspace.resizeAnalysis", "调整分析面板宽度"), width: layout.analysisPanelWidth, content: <AnalysisPanel {...props} /> },
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
    let next = id === "source"
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
    props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, {
      activeLane: id,
      ...(layout.soloOnFocus ? { soloLane: id } : {}),
    }))
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
    <div data-testid="czkawka-full-view" className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <Header {...props} />
      <div ref={workspaceRef} className="relative flex min-h-0 flex-1 overflow-hidden">
        <div ref={boardRef} data-testid="czkawka-lane-board" data-scrollbar="hidden" className="flex min-h-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden border-l border-border/40">
          {visibleLaneOrder.map((id) => <KisakiSwimlane
          key={id}
          {...lanes[id]}
          testId={id}
          active={activeLane === id}
          solo={layout.soloLane === id}
          effectiveWidth={layout.soloLane === id ? boardWidth : lanes[id].width}
          onActivate={() => activateLane(id)}
          onHoverFocus={() => scheduleFocus(id)}
          onHoverFocusCancel={cancelFocus}
          hideTitleForNavigator={navigatorHostLane === id && layout.navigatorDock === "top" && navigatorDockTarget?.titleHost != null}
          onCollapsedChange={(collapsed) => patchLane(id, { collapsed })}
          onWidthChange={(width) => patchLane(id, { width })}
          onResetNavigatorPosition={() => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, {
            navigatorDock: "floating",
            navigatorLane: id,
            navigatorPositionX: KISAKI_WORKSPACE_DEFAULTS.navigatorPositionX,
            navigatorPositionY: KISAKI_WORKSPACE_DEFAULTS.navigatorPositionY,
          }))}
          onDragStart={() => setDraggedLane(id)}
          onDrop={() => moveLane(id)}
          >{lanes[id].content}</KisakiSwimlane>)}
        </div>
        {layout.soloLane === activeLane && !layout.showNavigatorInSolo ? null : <SwimlaneNavigatorBar
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
          onPositionChange={({ x, y }) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { navigatorDock: "floating", navigatorPositionX: x, navigatorPositionY: y }))}
          onDockChange={(navigatorDock, targetId) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { navigatorDock, ...(navigatorDock === "floating" ? {} : { navigatorLane: targetId ?? navigatorHostLane }) }))}
          menu={<>
            <SwimlaneBarMenuItem onSelect={() => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { soloLane: layout.soloLane === activeLane ? null : activeLane, activeLane }))}>
              {layout.soloLane === activeLane ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {layout.soloLane === activeLane ? "退出当前泳道独占" : "当前泳道独占视口"}
            </SwimlaneBarMenuItem>
            <SwimlaneBarMenuItem onSelect={() => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { focusOnHover: !layout.focusOnHover }))}>
              <Settings2 className="size-3.5" />{layout.focusOnHover ? "关闭悬停聚焦" : "开启悬停聚焦"}
            </SwimlaneBarMenuItem>
            <SwimlaneFitMenuItems
              autoFit={layout.autoFitToViewport}
              onFit={() => props.setWorkspaceLayout(fitKisakiLayoutToViewport(layout, boardWidth, visibleLaneOrder))}
              onAutoFitChange={(autoFitToViewport) => props.setWorkspaceLayout(autoFitToViewport
                ? fitKisakiLayoutToViewport(updateKisakiWorkspaceLayout(layout, { autoFitToViewport }), boardWidth, visibleLaneOrder)
                : updateKisakiWorkspaceLayout(layout, { autoFitToViewport }))}
            />
            <SwimlaneNavigatorDockMenu dock={layout.navigatorDock} followsFocus={layout.navigatorFollowsFocus} onDockChange={(navigatorDock) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { navigatorDock, ...(navigatorDock === "floating" ? {} : { navigatorLane: navigatorHostLane }) }))} onFollowsFocusChange={(navigatorFollowsFocus) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { navigatorFollowsFocus, ...(navigatorFollowsFocus ? { navigatorLane: activeLane } : {}) }))} />
            <SwimlaneBarAppearanceMenu
              style={layout.barHandleStyle}
              position={layout.barHandlePosition}
              onStyleChange={(barHandleStyle) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { barHandleStyle }))}
              onPositionChange={(barHandlePosition) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(layout, { barHandlePosition }))}
            />
          </>}
        />}
        {layout.soloLane === activeLane ? <>
          <div data-swimlane-reveal-trigger="left" className="absolute inset-y-10 left-0 z-30 w-2" onPointerEnter={() => scheduleReveal("left")} onPointerLeave={restoreReveal} />
          <div data-swimlane-reveal-trigger="right" className="absolute inset-y-10 right-0 z-30 w-2" onPointerEnter={() => scheduleReveal("right")} onPointerLeave={restoreReveal} />
        </> : null}
      </div>
      {floatingOpen ? <KisakiFloatingAnalysisPanel state={props.floatingAnalysisPanel} viewport={props.floatingViewport} layout={props.cardLayout} onStateChange={props.setFloatingAnalysisPanel} onLayoutChange={props.setCardLayout} renderCard={(id) => <KisakiCardContent id={id} props={props} />} /> : null}
    </div>
  )
}

function fitKisakiLayoutToViewport(layout: KisakiWorkspaceLayout, viewportWidth: number, laneOrder: readonly KisakiLaneId[]): KisakiWorkspaceLayout {
  const widths = fitSwimlaneWidthsToViewport(viewportWidth, laneOrder.map((id) => ({
    id,
    width: id === "source" ? layout.sourcePanelWidth : id === "results" ? layout.resultPanelWidth : layout.analysisPanelWidth,
    collapsed: id === "source" ? layout.sourcePanelMinimized : id === "results" ? layout.resultPanelMinimized : layout.analysisPanelMinimized,
    collapsedWidth: 48,
    minimumWidth: id === "results" ? 360 : id === "source" ? 220 : 210,
    maximumWidth: id === "results" ? 1_200 : id === "source" ? 560 : 520,
  })))
  return updateKisakiWorkspaceLayout(layout, {
    sourcePanelWidth: widths.source ?? layout.sourcePanelWidth,
    resultPanelWidth: widths.results ?? layout.resultPanelWidth,
    analysisPanelWidth: widths.analysis ?? layout.analysisPanelWidth,
  })
}

function sameKisakiWidths(left: KisakiWorkspaceLayout, right: KisakiWorkspaceLayout): boolean {
  return left.sourcePanelWidth === right.sourcePanelWidth
    && left.resultPanelWidth === right.resultPanelWidth
    && left.analysisPanelWidth === right.analysisPanelWidth
}

function KisakiSwimlane({ children, active, collapsed, collapsedLabel, defaultWidth, effectiveWidth, hideTitleForNavigator, label, onActivate, onCollapsedChange, onDragStart, onDrop, onHoverFocus, onHoverFocusCancel, onResetNavigatorPosition, onTitleHostChange, onWidthChange, resizeLabel, solo, testId, width }: { children: React.ReactNode; active: boolean; collapsed: boolean; collapsedLabel: string; defaultWidth: number; effectiveWidth: number; hideTitleForNavigator: boolean; label: string; onActivate: () => void; onCollapsedChange: (collapsed: boolean) => void; onDragStart: () => void; onDrop: () => void; onHoverFocus: () => void; onHoverFocusCancel: () => void; onResetNavigatorPosition: () => void; onTitleHostChange?: (node: HTMLElement | null) => void; onWidthChange: (width: number) => void; resizeLabel: string; solo: boolean; testId: string; width: number }) {
  const widthRef = useRef(width)
  useEffect(() => { widthRef.current = width }, [width])
  if (collapsed) return (
    <section data-testid={`czkawka-lane-${testId}`} data-czkawka-lane-id={testId} data-swimlane-active={active} onPointerEnter={onHoverFocus} onPointerLeave={onHoverFocusCancel} onPointerDown={onActivate} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-border/40 bg-muted/20 px-1 py-3 hover:bg-muted/40">
      <SwimlaneCollapseDragButton collapsed laneLabel={label} draggable aria-label={collapsedLabel} onClick={() => onCollapsedChange(false)} onDragStart={onDragStart} />
      <span className="text-[10px] font-mono tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>{label}</span>
    </section>
  )
  return (
    <section data-testid={`czkawka-lane-${testId}`} data-czkawka-lane-id={testId} data-swimlane-active={active} data-swimlane-solo={solo} onPointerEnter={onHoverFocus} onPointerLeave={onHoverFocusCancel} onPointerDown={onActivate} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className={cn("relative flex h-full min-w-60 shrink-0 flex-col border-r border-border/40 bg-card/40", active && "ring-1 ring-inset ring-primary/35")} style={{ width: effectiveWidth }}>
        <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/30 px-2">
        <SwimlaneCollapseDragButton collapsed={false} laneLabel={label} draggable aria-label={collapsedLabel.replace("恢复", "折叠")} onClick={() => onCollapsedChange(true)} onDragStart={onDragStart} />
        <span ref={onTitleHostChange} className="flex min-w-0 flex-1" data-swimlane-navigator-title-slot={testId}>
          {hideTitleForNavigator ? null : <span data-swimlane-lane-title="true" className="min-w-0 flex-1 truncate text-left text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground" title={label}>{label}</span>}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`${label}更多设置`} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><Ellipsis className="size-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48" onPointerDown={(event) => event.stopPropagation()}>
            <DropdownMenuItem onSelect={onResetNavigatorPosition}><RotateCcw />重置操作栏位置</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div data-scrollbar="hidden" className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      <LaneResizer label={resizeLabel} className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1" onReset={() => onWidthChange(defaultWidth)} onResize={(deltaRatio) => { widthRef.current += deltaRatio * 320; onWidthChange(widthRef.current) }} />
    </section>
  )
}

function Compact(props: KisakiView) {
  return (
    <div data-testid="czkawka-compact-view" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <CompactHeader {...props} />
      <Tabs value={props.panel} onValueChange={(value) => props.setPanel(value as KisakiPanel)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="source">{props.t("tabs.conditions", "条件")}</TabsTrigger>
          <TabsTrigger value="results">
            {props.t("tabs.results", "结果")} <Badge variant="outline">{props.result?.fileCount ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="analysis">{props.t("tabs.analysis", "统计")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {props.panel === "source" ? (
          <SourcePanel {...props} />
        ) : props.panel === "results" ? (
          <ResultTable {...props} />
        ) : (
          <AnalysisPanel {...props} />
        )}
      </div>
    </div>
  )
}

function Collapsed(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  return (
    <div data-testid="czkawka-collapsed-view" className="flex h-full w-full items-center gap-2 rounded-lg border bg-card px-3">
      <meta.icon className="size-5 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Kisaki · {meta.label}</div>
        <div className="truncate text-xs text-muted-foreground">{props.data.progressText || props.t("summary.resultCount", "{{count}} 个结果", { count: props.result?.fileCount ?? 0 })}</div>
      </div>
      <Badge variant={props.data.phase === "error" ? "destructive" : "outline"}>{props.data.phase ?? "idle"}</Badge>
      <Button aria-label={props.running ? props.t("actions.stopScan", "停止扫描") : props.t("actions.startScan", "开始扫描")} size="icon-sm" variant={props.running ? "destructive" : "default"} onClick={props.running ? props.cancelScan : props.executeScan}>
        {props.running ? <X /> : <Play />}
      </Button>
    </div>
  )
}

function Header(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid size-9 place-items-center rounded-md border bg-muted/40">
          <meta.icon className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h3 className="shrink-0 text-base font-semibold tracking-tight">Kisaki</h3><ToolSelector props={props} /></div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">FILE FORENSICS / 11 SCANNERS / TS CONTROL PLANE</p>
        </div>
      </div>
      <div className="min-w-32 max-w-72 flex-1"><StatusBar {...props} /></div>
      <div className="flex items-center gap-2">
        {props.tool === "similar-images" || props.tool === "similar-videos" ? <KisakiSimilarityReferenceDialog t={props.t} /> : null}
        <Button
          aria-label={props.floatingAnalysisPanel.open ? props.t("actions.closeFloatingAnalysis", "关闭浮动分析面板") : props.t("actions.openFloatingAnalysis", "打开浮动分析面板")}
          disabled={!props.floatingAvailable}
          size="icon-sm"
          variant={props.floatingAnalysisPanel.open ? "secondary" : "ghost"}
          onClick={() =>
            props.setFloatingAnalysisPanel({
              ...props.floatingAnalysisPanel,
              open: !props.floatingAnalysisPanel.open
            })
          }
        >
          <PanelTopOpen />
        </Button>
        <KisakiCardManager layout={props.cardLayout} onChange={props.setCardLayout} />
        <KisakiNodeSettings props={props} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={props.t("filters.global", "Kisaki 全局筛选")} className="h-8 w-48 pl-7 pr-7 text-xs" placeholder={props.t("filters.searchCurrent", "搜索当前工具结果")} value={props.filterText} onChange={(event) => props.setFilterText(event.currentTarget.value)} />
          {props.filterText ? (
            <button type="button" aria-label={props.t("filters.clearSearch", "清除结果搜索")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => props.setFilterText("")}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <KisakiFilterPanel tool={props.tool} state={props.filterState} stats={props.filterResult.stats} pathPatternError={props.filterResult.pathPatternError} textPatternError={props.filterResult.textPatternError} presets={props.filterPresets} onChange={props.setFilterState} onPresetsChange={props.setFilterPresets} />
        <Badge variant="outline">{props.t("summary.selected", "{{count}} 已选", { count: props.selectedPaths.length })}</Badge>
        <Button size="sm" variant={props.running ? "destructive" : "default"} onClick={props.running ? props.cancelScan : props.executeScan}>
          {props.running ? <X /> : <Play />}
          {props.running ? props.t("actions.stopScan", "停止扫描") : props.t("actions.startScan", "开始扫描")}
        </Button>
      </div>
    </header>
  )
}

function CompactHeader(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  return (
    <header className="grid shrink-0 gap-2 border-b pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/40">
          <meta.icon className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1"><h3 className="shrink-0 text-sm font-semibold">Kisaki</h3><ToolSelector compact props={props} /></div>
          <p className="truncate font-mono text-[10px] text-muted-foreground">11 SCANNERS / TS CONTROL PLANE</p>
        </div>
        {props.tool === "similar-images" || props.tool === "similar-videos" ? <KisakiSimilarityReferenceDialog t={props.t} /> : null}
        <Button className="shrink-0" size="sm" variant={props.running ? "destructive" : "default"} onClick={props.running ? props.cancelScan : props.executeScan}>
          {props.running ? <X /> : <Play />}
          {props.running ? props.t("actions.stopScan", "停止扫描") : props.t("actions.startScan", "开始扫描")}
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1"><StatusBar {...props} /></div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={props.t("filters.global", "Kisaki 全局筛选")} className="h-8 w-full pl-7 pr-7 text-xs" placeholder={props.t("filters.search", "搜索结果")} value={props.filterText} onChange={(event) => props.setFilterText(event.currentTarget.value)} />
          {props.filterText ? (
            <button type="button" aria-label={props.t("filters.clearSearch", "清除结果搜索")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => props.setFilterText("")}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <KisakiFilterPanel tool={props.tool} state={props.filterState} stats={props.filterResult.stats} pathPatternError={props.filterResult.pathPatternError} textPatternError={props.filterResult.textPatternError} presets={props.filterPresets} onChange={props.setFilterState} onPresetsChange={props.setFilterPresets} />
        <Badge className="shrink-0" variant="outline">
          {props.selectedPaths.length}
        </Badge>
        <KisakiCardManager layout={props.cardLayout} onChange={props.setCardLayout} />
        <KisakiNodeSettings props={props} />
      </div>
    </header>
  )
}

function ToolSelector({ compact = false, props }: { compact?: boolean; props: KisakiView }) {
  return (
    <Select value={props.tool} onValueChange={(tool) => props.patch({ tool: tool as KisakiTool })}>
      <SelectTrigger aria-label={props.t("tools.select", "选择扫描工具")} className={cn("h-8 text-xs", compact ? "w-40" : "w-52")}><SelectValue /></SelectTrigger>
      <SelectContent>{KISAKI_TOOL_META.filter((definition) => !definition.requiredNativeCapability || props.nativeCapabilities.has(definition.requiredNativeCapability)).map((definition) => { const tool = getKisakiToolMeta(definition.id, props.t); return <SelectItem key={tool.id} value={tool.id}><span className="flex items-center gap-2"><tool.icon className="size-3.5" />{tool.label}</span></SelectItem> })}</SelectContent>
    </Select>
  )
}

function KisakiNodeSettings({ props }: { props: KisakiView }) {
  const availableThreads = typeof navigator === "undefined" ? 1 : Math.max(1, navigator.hardwareConcurrency || 1)
  const deleteOutdatedCache = props.data.deleteOutdatedCacheByTool?.[props.tool] ?? true
  const minimumKiB = Math.floor(Number(props.data.minimumFileSize ?? 0) / 1000)
  const maximumKiB = props.data.maximumFileSize ? Math.floor(Number(props.data.maximumFileSize) / 1000) : 2_147_483
  async function browse(field: "cacheFolderPath" | "configFolderPath") {
    const path = await props.pickDirectory?.()
    if (path) props.patch({ [field]: path })
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button aria-label={props.t("settings.open", "节点设置")} size="icon-sm" variant="ghost"><Settings2 /></Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{props.t("settings.title", "Kisaki 节点设置")}</DialogTitle><DialogDescription>{props.t("settings.description", "适用于所有扫描器的目录过滤、缓存和性能设置。")}</DialogDescription></DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="grid gap-5">
            <SettingsSection title={props.t("settings.general", "通用设置")}>
              <KisakiTokenEditor kind="rules" label={props.t("sources.excludedItems", "排除的项目")} value={props.data.excludedItemsText} placeholder={props.t("sources.excludedItemsPlaceholder", "*/cache/*; *.part；每条规则需包含 *")} onChange={(excludedItemsText) => props.patch({ excludedItemsText })} />
              <KisakiTokenEditor kind="extensions" label={props.t("sources.allowedExtensions", "允许的扩展名")} value={props.data.allowedExtensions} placeholder="jpg,png,IMAGE" onChange={(allowedExtensions) => props.patch({ allowedExtensions })} />
              <KisakiTokenEditor kind="extensions" label={props.t("sources.excludedExtensions", "排除的扩展名")} value={props.data.excludedExtensions} placeholder="tmp,bak" onChange={(excludedExtensions) => props.patch({ excludedExtensions })} />
              {props.data.allowedExtensions?.trim() && props.data.excludedExtensions?.trim() ? <p className="text-[11px] text-amber-600 dark:text-amber-400">{props.t("sources.allowedPriority", "Czkawka core 在允许列表非空时优先使用允许列表；排除扩展名暂不参与匹配。")}</p> : null}
              <Field label={props.t("sources.fileSizeKiB", "文件大小（KB）")}><div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><Input aria-label={props.t("sources.minimumSizeKiB", "最小文件大小（KB）")} type="number" min={0} max={2_147_483} value={minimumKiB} onChange={(event) => props.patch({ minimumFileSize: String(Number(event.currentTarget.value) * 1000) })} /><span className="text-muted-foreground">~</span><Input aria-label={props.t("sources.maximumSizeKiB", "最大文件大小（KB）")} type="number" min={0} max={2_147_483} value={maximumKiB} onChange={(event) => props.patch({ maximumFileSize: String(Number(event.currentTarget.value) * 1000) })} /></div></Field>
              <Field label={props.t("sources.referencePathKeywords", "参考路径关键词")}><Input value={props.data.referencePathKeywords ?? "#compare"} placeholder="#compare" onChange={(event) => props.patch({ referencePathKeywords: event.currentTarget.value })} /><p className="text-[11px] leading-relaxed text-muted-foreground">{props.t("sources.referencePathKeywordsHint", "包含这些关键词的路径将自动标记为参考（用逗号分隔）。")}</p></Field>
              <SwitchLine label={props.t("sources.recursive", "递归扫描")} checked={props.data.recursive ?? true} onChange={(recursive) => props.patch({ recursive })} />
            </SettingsSection>
            <SettingsSection title={props.t("settings.cachePerformance", "缓存与性能")}>
              <SettingsDirectoryField label={props.t("cache.cacheFolder", "缓存文件夹路径")} value={props.data.cacheFolderPath ?? ""} placeholder={props.t("cache.systemDefault", "系统默认")} browseLabel={props.t("common.browse", "浏览")} onChange={(cacheFolderPath) => props.patch({ cacheFolderPath })} onBrowse={() => void browse("cacheFolderPath")} />
              <SettingsDirectoryField label={props.t("cache.configFolder", "配置文件夹路径")} value={props.data.configFolderPath ?? ""} placeholder={props.t("cache.systemDefault", "系统默认")} browseLabel={props.t("common.browse", "浏览")} onChange={(configFolderPath) => props.patch({ configFolderPath })} onBrowse={() => void browse("configFolderPath")} />
              <Field label={props.t("sources.threads", "线程数")}><div className="flex items-center gap-2"><Input aria-label="kisaki scan threads" type="number" min={1} max={availableThreads} value={props.data.threadCount || String(availableThreads)} onChange={(event) => props.patch({ threadCount: event.currentTarget.value })} /><span className="shrink-0 text-xs text-muted-foreground">/ {availableThreads}</span></div></Field>
              <SwitchLine label={props.t("sources.useCache", "使用缓存")} checked={props.data.useCache ?? true} onChange={(useCache) => props.patch({ useCache })} />
              <SwitchLine label={props.t("cache.saveJson", "同时保存 JSON 缓存")} checked={props.data.saveAlsoAsJson ?? false} onChange={(saveAlsoAsJson) => props.patch({ saveAlsoAsJson })} />
              <SwitchLine label={props.t("cache.deleteOutdated", "清理当前工具的过期缓存项")} checked={deleteOutdatedCache} onChange={(enabled) => props.patch({ deleteOutdatedCacheByTool: { ...props.data.deleteOutdatedCacheByTool, [props.tool]: enabled } })} />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{props.t("cache.restartHint", "缓存与配置目录在首次原生扫描时初始化；修改后需重启桌面后端。")}</p>
            </SettingsSection>
            <SettingsSection title={props.t("settings.swimlaneWorkspace", "泳道工作区")}>
              <SwimlaneInteractionSettings
                value={{ soloOnFocus: props.workspaceLayout.soloOnFocus, showNavigatorInSolo: props.workspaceLayout.showNavigatorInSolo, edgeRevealDelayMs: props.workspaceLayout.edgeRevealDelayMs, focusOnHover: props.workspaceLayout.focusOnHover, focusDelayMs: props.workspaceLayout.focusDelayMs }}
                labels={{ soloOnFocus: "主泳道聚焦时自动独占", showNavigatorInSolo: "独占时显示泳道切换栏", focusOnHover: "启用主泳道悬停重新聚焦", focusDelay: "主泳道悬停重新聚焦延迟" }}
                onChange={(patch) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(props.workspaceLayout, patch))}
              />
              <Field label={props.t("settings.barHandleStyle", "操作栏拖拽手柄样式")}>
                <Select value={props.workspaceLayout.barHandleStyle} onValueChange={(barHandleStyle) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(props.workspaceLayout, { barHandleStyle: barHandleStyle as KisakiBarHandleStyle }))}>
                  <SelectTrigger aria-label="操作栏拖拽手柄样式"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="grip">六点</SelectItem><SelectItem value="groove">三槽</SelectItem><SelectItem value="move">四向</SelectItem><SelectItem value="grab">抓手</SelectItem><SelectItem value="edge">短轨</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label={props.t("settings.barHandlePosition", "操作栏拖拽手柄位置")}>
                <Select value={props.workspaceLayout.barHandlePosition} onValueChange={(barHandlePosition) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(props.workspaceLayout, { barHandlePosition: barHandlePosition as KisakiBarHandlePosition }))}>
                  <SelectTrigger aria-label="操作栏拖拽手柄位置"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="left">左侧</SelectItem><SelectItem value="right">右侧</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label={props.t("settings.navigatorDock", "泳道切换栏位置")}>
                <Select value={props.workspaceLayout.navigatorDock} onValueChange={(navigatorDock) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(props.workspaceLayout, { navigatorDock: navigatorDock === "left" || navigatorDock === "right" || navigatorDock === "top" || navigatorDock === "bottom" ? navigatorDock : "floating", ...(navigatorDock === "floating" ? {} : { navigatorLane: props.workspaceLayout.activeLane }) }))}>
                  <SelectTrigger aria-label="泳道切换栏位置"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="floating">悬浮</SelectItem><SelectItem value="top">顶部</SelectItem><SelectItem value="right">右侧</SelectItem><SelectItem value="bottom">底部</SelectItem><SelectItem value="left">左侧</SelectItem></SelectContent>
                </Select>
              </Field>
              <SwitchLine label="固定栏跟随聚焦泳道" checked={props.workspaceLayout.navigatorFollowsFocus} onChange={(navigatorFollowsFocus) => props.setWorkspaceLayout(updateKisakiWorkspaceLayout(props.workspaceLayout, { navigatorFollowsFocus, ...(navigatorFollowsFocus ? { navigatorLane: props.workspaceLayout.activeLane } : {}) }))} />
            </SettingsSection>
            <SettingsSection title={props.t("tools.duplicateFiles", "重复文件")}>
              <Field label={props.t("cache.minHash", "最小缓存文件大小 - 哈希（KB）")}><Input type="number" min={1} value={props.data.duplicateMinimalHashCacheSizeKiB ?? "256"} onChange={(event) => props.patch({ duplicateMinimalHashCacheSizeKiB: event.currentTarget.value })} /></Field>
              <Field label={props.t("cache.minPrehash", "最小缓存文件大小 - 预哈希（KB）")}><Input type="number" min={1} value={props.data.duplicateMinimalPrehashCacheSizeKiB ?? "256"} onChange={(event) => props.patch({ duplicateMinimalPrehashCacheSizeKiB: event.currentTarget.value })} /></Field>
            </SettingsSection>
            <SettingsSection title={props.t("settings.other", "其它")}>
              <SwitchLine label={props.t("sources.reversePathDisplay", "反向显示路径")} checked={props.data.reversePathDisplay ?? false} onChange={(reversePathDisplay) => props.patch({ reversePathDisplay })} />
              <SwitchLine label={props.t("sources.tableWrapText", "表格文字折行")} checked={props.data.tableWrapText ?? false} onChange={(tableWrapText) => props.patch({ tableWrapText })} />
              <Button disabled={!props.data.cacheFolderPath || !props.openPath} variant="outline" onClick={() => void props.openPath?.(props.data.cacheFolderPath!)}><FolderOpen />{props.t("cache.openFolder", "打开缓存文件夹")}</Button>
            </SettingsSection>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) { return <section className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0"><h4 className="text-sm font-semibold">{title}</h4>{children}</section> }
function SettingsDirectoryField({ browseLabel, label, onBrowse, onChange, placeholder, value }: { browseLabel: string; label: string; onBrowse: () => void; onChange: (value: string) => void; placeholder: string; value: string }) { return <Field label={label}><div className="flex gap-2"><Input className="min-w-0 flex-1" value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} /><Button className="shrink-0" type="button" variant="outline" onClick={onBrowse}><FolderOpen />{browseLabel}</Button></div></Field> }

export { Collapsed, Compact, Full }
