import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Columns3, PanelBottom, PanelLeft, PanelRight, PanelTop } from "lucide-react"

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { SwimlaneBarContent } from "./SwimlaneBarContent"
import type { SwimlaneBarHandlePosition, SwimlaneBarHandleStyle, SwimlaneNavigatorDock } from "./model"

const PINNED_DOCKS = ["left", "right", "top", "bottom"] as const
const DOCK_ICONS = { left: PanelLeft, right: PanelRight, top: PanelTop, bottom: PanelBottom } as const

export interface SwimlaneNavigatorItem<Id extends string = string> {
  id: Id
  label: string
  icon?: ComponentType<{ className?: string }>
}

export interface SwimlaneNavigatorDockTarget<Id extends string = string> {
  id: Id
  host: HTMLElement
  titleHost?: HTMLElement | null
}

export function SwimlaneNavigatorBar<Id extends string>({
  items,
  activeId,
  handleStyle = "grip",
  handlePosition = "left",
  position = { x: 92, y: 94 },
  dock = "floating",
  dockTargetId,
  dockTargets,
  titleHost,
  dockHost,
  boundsHost,
  allowedDocks = PINNED_DOCKS,
  menu,
  className,
  compactItems = false,
  menuAriaLabel = "泳道操作栏设置",
  onSelect,
  onPositionChange,
  onDockChange,
}: {
  items: readonly SwimlaneNavigatorItem<Id>[]
  activeId: Id
  handleStyle?: SwimlaneBarHandleStyle
  handlePosition?: SwimlaneBarHandlePosition
  position?: { x: number; y: number }
  dock?: SwimlaneNavigatorDock
  dockTargetId?: Id
  dockTargets?: readonly SwimlaneNavigatorDockTarget<Id>[]
  titleHost?: HTMLElement | null
  dockHost?: HTMLElement | null
  boundsHost?: HTMLElement | null
  allowedDocks?: readonly Exclude<SwimlaneNavigatorDock, "floating">[]
  menu?: ReactNode
  className?: string
  compactItems?: boolean
  menuAriaLabel?: string
  onSelect(id: Id): void
  onPositionChange?(position: { x: number; y: number }): void
  onDockChange?(dock: SwimlaneNavigatorDock, targetId?: Id): void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const dragRef = useRef<DragSession | undefined>(undefined)
  const dockCandidateRef = useRef<DockCandidate<Id> | undefined>(undefined)
  const cleanupDragRef = useRef<(() => void) | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [livePosition, setLivePosition] = useState<{ left: number; top: number }>()
  const [dockCandidate, setDockCandidate] = useState<DockCandidate<Id>>()
  const [pendingDock, setPendingDock] = useState<{ dock: SwimlaneNavigatorDock; targetId?: Id }>()
  const fallbackHost = dockHost ?? titleHost?.closest<HTMLElement>("[data-lane-id],[data-czkawka-lane-id],[data-reader-swimlane],section") ?? null
  const targets: readonly SwimlaneNavigatorDockTarget<Id>[] = dockTargets?.length
    ? dockTargets
    : fallbackHost ? [{ id: dockTargetId ?? activeId, host: fallbackHost, titleHost }] : []
  const effectiveDock = pendingDock?.dock ?? dock
  const effectiveTargetId = pendingDock?.targetId ?? dockTargetId ?? activeId
  const currentTarget = targets.find((target) => target.id === effectiveTargetId) ?? targets[0]
  const currentTitleHost = currentTarget?.titleHost ?? (currentTarget?.id === effectiveTargetId ? titleHost : null)
  const laneHost = currentTarget?.host ?? fallbackHost
  const titleMounted = effectiveDock === "top" && currentTitleHost != null && !dragging
  const edgeMounted = effectiveDock !== "floating" && !titleMounted && laneHost != null && !dragging
  const horizontal = dragging || effectiveDock === "floating" || effectiveDock === "top" || effectiveDock === "bottom"

  useEffect(() => () => cleanupDragRef.current?.(), [])
  useEffect(() => setPendingDock(undefined), [dock, dockTargetId])

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !rootRef.current) return
    const root = rootRef.current
    const host = boundsHost ?? (root.offsetParent instanceof HTMLElement ? root.offsetParent : root.parentElement)
    if (!host) return
    cleanupDragRef.current?.()
    const rect = root.getBoundingClientRect()
    const bounds = host.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      left: rect.left - bounds.left,
      top: rect.top - bounds.top,
      width: rect.width,
      height: rect.height,
      bounds,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    dockCandidateRef.current = undefined
    setDockCandidate(undefined)
    setMenuOpen(false)
    const move = (pointer: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || pointer.pointerId !== drag.pointerId) return
      if (!drag.moved && Math.hypot(pointer.clientX - drag.startX, pointer.clientY - drag.startY) < 4) return
      if (!drag.moved) {
        drag.moved = true
        setDragging(true)
      }
      drag.bounds = host.getBoundingClientRect()
      drag.left = clamp(pointer.clientX - drag.bounds.left - drag.offsetX, 0, Math.max(0, drag.bounds.width - drag.width))
      drag.top = clamp(pointer.clientY - drag.bounds.top - drag.offsetY, 0, Math.max(0, drag.bounds.height - drag.height))
      setLivePosition({ left: drag.left, top: drag.top })
      const nextCandidate = dockCandidateForTargets(targets, pointer.clientX, pointer.clientY, allowedDocks)
      dockCandidateRef.current = nextCandidate
      setDockCandidate(nextCandidate)
      pointer.preventDefault()
    }
    const finish = (pointer?: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || pointer && pointer.pointerId !== drag.pointerId) return
      const dropped = pointer ? dockCandidateForTargets(targets, pointer.clientX, pointer.clientY, allowedDocks) : dockCandidateRef.current
      cleanupDragRef.current?.()
      cleanupDragRef.current = undefined
      dragRef.current = undefined
      setDragging(false)
      setLivePosition(undefined)
      setDockCandidate(undefined)
      dockCandidateRef.current = undefined
      if (!drag.moved) return
      if (dropped && dropped.dock !== "floating") {
        setPendingDock({ dock: dropped.dock, targetId: dropped.targetId })
        onDockChange?.(dropped.dock, dropped.targetId)
        return
      }
      setPendingDock({ dock: "floating" })
      onDockChange?.("floating")
      onPositionChange?.({
        x: percent(drag.left + drag.width, drag.bounds.width),
        y: percent(drag.top + drag.height, drag.bounds.height),
      })
    }
    // A blur event carries no pointerId, so passing it to `finish` made the handler bail out and leave
    // the drag mounted; end the drag without a pointer instead.
    const finishOnBlur = () => finish()
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", finish, true)
      window.removeEventListener("blur", finishOnBlur)
    }
    cleanupDragRef.current = cleanup
    window.addEventListener("pointermove", move, { capture: true })
    window.addEventListener("pointerup", finish, { capture: true })
    window.addEventListener("pointercancel", finish, { capture: true })
    window.addEventListener("blur", finishOnBlur)
    event.preventDefault()
    event.stopPropagation()
  }

  function closeMenuFromSecondContextClick(event: React.MouseEvent<HTMLElement>) {
    if (!menuOpen) return
    event.preventDefault()
    event.stopPropagation()
    setMenuOpen(false)
  }

  const root = (
    // Radix's ContextMenu.Root has no controlled `open` prop (its own state always wins), so the open
    // state is tracked through onOpenChange only.
    <ContextMenu modal={false} onOpenChange={setMenuOpen}>
      <nav
        ref={rootRef}
        aria-label="泳道快速切换"
        data-swimlane-navigator="true"
        data-swimlane-navigator-dock={dragging ? "dragging" : effectiveDock}
        data-swimlane-navigator-dock-target={effectiveTargetId}
        data-swimlane-navigator-dock-candidate={dockCandidate?.dock}
        data-swimlane-navigator-dock-candidate-target={dockCandidate?.targetId}
        data-reader-lane-navigator="true"
        data-reader-lane-navigator-dock={titleMounted ? "reader-title" : dragging ? "dragging" : effectiveDock}
        data-reader-lane-navigator-dock-candidate={dockCandidate?.dock}
        className={cn(
          "z-50 flex w-fit items-center gap-1 overflow-hidden",
          titleMounted
            ? "relative h-7 w-full max-w-full flex-row bg-transparent"
            : "max-h-[calc(100%-0.5rem)] max-w-[calc(100%-0.5rem)] rounded-md border border-border/75 bg-background/90 p-1 shadow-lg backdrop-blur-xl",
          horizontal ? "flex-row" : "flex-col",
          !titleMounted && "absolute",
          className,
        )}
        style={barStyle({ dock: effectiveDock, dragging, livePosition, position, titleMounted })}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <SwimlaneBarContent
          handlePosition={handlePosition}
          handleStyle={handleStyle}
          horizontal={horizontal}
          label="拖动或设置泳道切换栏"
          menuOpen={menuOpen}
          onHandlePointerDown={startDrag}
          renderHandle={(handle) => <ContextMenuTrigger asChild onContextMenu={closeMenuFromSecondContextClick}>{handle}</ContextMenuTrigger>}
        >
          {items.map(({ id, label, icon: Icon = Columns3 }) => (
            <button key={id} type="button" title={label} aria-label={label} aria-pressed={activeId === id} className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground", compactItems && "w-7 justify-center px-0", activeId === id && "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]")} onClick={() => onSelect(id)}>
              <Icon className="size-3.5" />
              {compactItems ? null : <span className="max-w-28 truncate">{label}</span>}
            </button>
          ))}
        </SwimlaneBarContent>
      </nav>
      {menu ? <ContextMenuContent aria-label={menuAriaLabel} className="w-56">{menu}</ContextMenuContent> : null}
    </ContextMenu>
  )
  const dockZones = dragging ? targets.map((target) => createPortal(<SwimlaneNavigatorDockZones key={target.id} active={dockCandidate?.targetId === target.id ? dockCandidate.dock : undefined} docks={allowedDocks} targetId={target.id} />, target.host)) : null
  const renderedRoot = titleMounted && currentTitleHost
    ? createPortal(root, currentTitleHost)
    : edgeMounted && laneHost
      ? createPortal(root, laneHost)
      : root
  return <>{dockZones}{renderedRoot}</>
}

export function SwimlaneBarMenuItem({ children, destructive = false, onSelect }: { children: ReactNode; destructive?: boolean; onSelect(): void }) {
  return <ContextMenuItem variant={destructive ? "destructive" : "default"} onSelect={onSelect}>{children}</ContextMenuItem>
}

function SwimlaneNavigatorDockZones({ active, docks, targetId }: { active?: SwimlaneNavigatorDock; docks: readonly Exclude<SwimlaneNavigatorDock, "floating">[]; targetId: string }) {
  return <div className="pointer-events-none absolute inset-0 z-30" data-swimlane-navigator-dock-zones={targetId}>
    {docks.map((dock) => {
      const Icon = DOCK_ICONS[dock]
      return <div key={dock} data-swimlane-navigator-dropzone={dock} data-active={active === dock ? "true" : "false"} className={cn("absolute grid size-9 place-items-center rounded-md border border-primary/40 bg-background/90 text-primary shadow-sm backdrop-blur transition-colors", dropZoneClass(dock), active === dock && "border-2 bg-primary/20 shadow-md")}><Icon className="size-4" /></div>
    })}
    <div data-swimlane-navigator-float-zone="true" data-active={active === "floating" ? "true" : "false"} className="absolute inset-0 -z-10" />
  </div>
}

function barStyle({ dock, dragging, livePosition, position, titleMounted }: { dock: SwimlaneNavigatorDock; dragging: boolean; livePosition?: { left: number; top: number }; position: { x: number; y: number }; titleMounted: boolean }): CSSProperties | undefined {
  if (titleMounted) return undefined
  if (dragging && livePosition) return { left: livePosition.left, top: livePosition.top }
  if (dock === "floating") return { left: `${position.x}%`, top: `${position.y}%`, transform: "translate(-100%, -100%)" }
  if (dock === "left") return { left: 4, top: "50%", transform: "translateY(-50%)" }
  if (dock === "right") return { right: 4, top: "50%", transform: "translateY(-50%)" }
  if (dock === "top") return { left: "50%", top: 4, transform: "translateX(-50%)" }
  return { bottom: 4, left: "50%", transform: "translateX(-50%)" }
}

function dockCandidateForTargets<Id extends string>(targets: readonly SwimlaneNavigatorDockTarget<Id>[], x: number, y: number, allowedDocks: readonly Exclude<SwimlaneNavigatorDock, "floating">[]): DockCandidate<Id> | undefined {
  for (const target of targets) {
    const rect = target.host.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
    const inset = 18
    const candidates: Array<[Exclude<SwimlaneNavigatorDock, "floating">, number]> = [
      ["left", Math.hypot(x - (rect.left + inset), y - (rect.top + rect.height / 2))],
      ["right", Math.hypot(x - (rect.right - inset), y - (rect.top + rect.height / 2))],
      ["top", Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + inset))],
      ["bottom", Math.hypot(x - (rect.left + rect.width / 2), y - (rect.bottom - inset))],
    ]
    const candidate = candidates.filter(([dock]) => allowedDocks.includes(dock)).toSorted((left, right) => left[1] - right[1])[0]
    if (candidate && candidate[1] <= inset) return { dock: candidate[0], targetId: target.id }
    return { dock: "floating", targetId: target.id }
  }
  return undefined
}

function dropZoneClass(dock: Exclude<SwimlaneNavigatorDock, "floating">): string {
  if (dock === "left") return "left-0 top-1/2 -translate-y-1/2"
  if (dock === "right") return "right-0 top-1/2 -translate-y-1/2"
  if (dock === "top") return "left-1/2 top-0 -translate-x-1/2"
  return "bottom-0 left-1/2 -translate-x-1/2"
}

function percent(value: number, total: number): number {
  return Math.round(clamp(value / Math.max(1, total) * 100, 0, 100) * 100) / 100
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

interface DragSession {
  pointerId: number
  offsetX: number
  offsetY: number
  left: number
  top: number
  width: number
  height: number
  bounds: DOMRect
  moved: boolean
  startX: number
  startY: number
}

interface DockCandidate<Id extends string> {
  dock: SwimlaneNavigatorDock
  targetId: Id
}
