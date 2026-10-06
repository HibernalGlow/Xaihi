import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { BarChart3, Maximize2, Minimize2, PanelLeft, TableProperties } from "lucide-react"
import { cn } from "@/lib/utils"
import { LaneResizer } from "@/components/workspace/lane/LaneResizer"
import { SwimlaneCollapseDragButton } from "@/components/workspace/swimlane/SwimlaneCollapseDragButton"
import { SwimlaneBarMenuItem, SwimlaneNavigatorBar } from "@/components/workspace/swimlane/SwimlaneNavigatorBar"
import { reorderSwimlanes } from "@/components/workspace/swimlane/model"
import { findzLaneCollapsed, findzLanePatch, findzLaneWidth, type FindzLaneId, type FindzWorkspaceLayout, updateFindzWorkspaceLayout } from "./workspace-layout"

interface FindzLaneDefinition {
  label: string
  restoreLabel: string
  collapseLabel: string
  resizeLabel: string
  defaultWidth: number
  content: ReactNode
}

export function FindzSwimlaneWorkspace({ layout, lanes, labels, onLayoutChange }: {
  layout: FindzWorkspaceLayout
  lanes: Record<FindzLaneId, FindzLaneDefinition>
  labels: { enterSolo: string; exitSolo: string }
  onLayoutChange(layout: FindzWorkspaceLayout): void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(960)
  const [draggedLane, setDraggedLane] = useState<FindzLaneId | null>(null)
  const compact = boardWidth < 860
  const activeLane = layout.laneOrder.includes(layout.activeLane) ? layout.activeLane : "results"

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const updateWidth = () => setBoardWidth(Math.max(1, workspace.clientWidth || 960))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (compact) return
    const board = boardRef.current
    const active = board?.querySelector<HTMLElement>(`[data-findz-lane-id="${activeLane}"]`)
    if (!board || !active) return
    board.scrollTo({ left: board.scrollLeft + active.getBoundingClientRect().left - board.getBoundingClientRect().left, behavior: "smooth" })
  }, [activeLane, compact, layout.soloLane])

  function updateLane(laneId: FindzLaneId, patch: { collapsed?: boolean; width?: number }) {
    onLayoutChange(updateFindzWorkspaceLayout(layout, findzLanePatch(laneId, patch)))
  }

  function activateLane(laneId: FindzLaneId) {
    const soloLane = layout.soloLane === laneId ? laneId : null
    onLayoutChange(updateFindzWorkspaceLayout(layout, { activeLane: laneId, soloLane }))
  }

  function moveLane(targetLane: FindzLaneId) {
    if (!draggedLane || draggedLane === targetLane) return
    onLayoutChange(updateFindzWorkspaceLayout(layout, { laneOrder: reorderSwimlanes(layout.laneOrder, draggedLane, targetLane) }))
    setDraggedLane(null)
  }

  function toggleSolo() {
    onLayoutChange(updateFindzWorkspaceLayout(layout, { activeLane, soloLane: layout.soloLane === activeLane ? null : activeLane }))
  }

  const navigatorItems = layout.laneOrder.map((id) => ({
    id,
    label: lanes[id].label,
    icon: id === "source" ? PanelLeft : id === "results" ? TableProperties : BarChart3,
  }))

  if (compact) return <div ref={workspaceRef} className="flex min-h-0 flex-1 overflow-hidden"><CompactWorkspace lanes={lanes} laneOrder={layout.laneOrder} /></div>

  return <div ref={workspaceRef} className="relative flex min-h-0 flex-1 overflow-hidden" data-testid="findz-swimlane-workspace">
    <div ref={boardRef} data-testid="findz-lane-board" className="flex min-h-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden border-l border-border/40">
      {layout.laneOrder.map((laneId) => <FindzSwimlane
        key={laneId}
        active={activeLane === laneId}
        collapsed={findzLaneCollapsed(layout, laneId)}
        definition={lanes[laneId]}
        effectiveWidth={layout.soloLane === laneId ? boardWidth : findzLaneWidth(layout, laneId)}
        laneId={laneId}
        solo={layout.soloLane === laneId}
        width={findzLaneWidth(layout, laneId)}
        onActivate={() => activateLane(laneId)}
        onCollapsedChange={(collapsed) => updateLane(laneId, { collapsed })}
        onDragStart={() => setDraggedLane(laneId)}
        onDrop={() => moveLane(laneId)}
        onWidthChange={(width) => updateLane(laneId, { width })}
      />)}
    </div>
    <SwimlaneNavigatorBar
      activeId={activeLane}
      boundsHost={workspaceRef.current}
      compactItems
      items={navigatorItems}
      position={{ x: layout.navigatorPositionX, y: layout.navigatorPositionY }}
      onPositionChange={({ x, y }) => onLayoutChange(updateFindzWorkspaceLayout(layout, { navigatorPositionX: x, navigatorPositionY: y }))}
      onSelect={activateLane}
      menu={<SwimlaneBarMenuItem onSelect={toggleSolo}>
        {layout.soloLane === activeLane ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        {layout.soloLane === activeLane ? labels.exitSolo : labels.enterSolo}
      </SwimlaneBarMenuItem>}
    />
  </div>
}

function CompactWorkspace({ lanes, laneOrder }: { lanes: Record<FindzLaneId, FindzLaneDefinition>; laneOrder: readonly FindzLaneId[] }) {
  return <div data-testid="findz-lane-board" data-findz-compact-workspace="true" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
    {laneOrder.map((laneId) => <section key={laneId} data-testid={`findz-lane-${laneId}`} data-findz-lane-id={laneId} className="flex min-h-80 shrink-0 flex-col border bg-card/40">
      <header className="flex h-8 shrink-0 items-center border-b border-border/40 bg-muted/30 px-3">
        <h2 className="text-xs font-semibold text-muted-foreground">{lanes[laneId].label}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{lanes[laneId].content}</div>
    </section>)}
  </div>
}

function FindzSwimlane({ active, collapsed, definition, effectiveWidth, laneId, onActivate, onCollapsedChange, onDragStart, onDrop, onWidthChange, solo, width }: {
  active: boolean
  collapsed: boolean
  definition: FindzLaneDefinition
  effectiveWidth: number
  laneId: FindzLaneId
  solo: boolean
  width: number
  onActivate(): void
  onCollapsedChange(collapsed: boolean): void
  onDragStart(): void
  onDrop(): void
  onWidthChange(width: number): void
}) {
  const widthRef = useRef(width)
  useEffect(() => { widthRef.current = width }, [width])
  if (collapsed) return <section
    data-testid={`findz-lane-${laneId}`}
    data-findz-lane-id={laneId}
    data-swimlane-active={active}
    className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-border/40 bg-muted/20 px-1 py-3 hover:bg-muted/40"
    onDragOver={(event) => event.preventDefault()}
    onDrop={onDrop}
    onPointerDown={onActivate}
  >
    <SwimlaneCollapseDragButton collapsed draggable aria-label={definition.restoreLabel} laneLabel={definition.label} onClick={() => onCollapsedChange(false)} onDragStart={onDragStart} />
    <span className="text-[10px] font-mono tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>{definition.label}</span>
  </section>

  return <section
    data-testid={`findz-lane-${laneId}`}
    data-findz-lane-id={laneId}
    data-swimlane-active={active}
    data-swimlane-solo={solo}
    className={cn("relative flex h-full min-w-60 shrink-0 flex-col border-r border-border/40 bg-card/40", active && "ring-1 ring-inset ring-primary/35")}
    style={{ width: effectiveWidth }}
    onDragOver={(event) => event.preventDefault()}
    onDrop={onDrop}
  >
    <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/30 px-2" onPointerDown={onActivate}>
      <SwimlaneCollapseDragButton collapsed={false} draggable aria-label={definition.collapseLabel} laneLabel={definition.label} onClick={() => onCollapsedChange(true)} onDragStart={onDragStart} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground" title={definition.label}>{definition.label}</span>
    </header>
    <div className="min-h-0 flex-1 overflow-hidden">{definition.content}</div>
    <LaneResizer className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1" label={definition.resizeLabel} onReset={() => onWidthChange(definition.defaultWidth)} onResize={(deltaRatio) => { widthRef.current += deltaRatio * 320; onWidthChange(widthRef.current) }} />
  </section>
}
