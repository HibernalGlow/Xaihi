import { useRef } from "react"
import type { KeyboardEvent, PointerEvent, ReactNode } from "react"
import type { KisakiCardId, KisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout"
import type { KisakiFloatingPanelState, KisakiFloatingRect, KisakiFloatingViewport, KisakiResizeDirection } from "@hibernalglow/xaihi-kisaki/floating-panel"
import { moveKisakiFloatingRect, resizeKisakiFloatingRect } from "@hibernalglow/xaihi-kisaki/floating-panel"
import { Grip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KisakiCardStack } from "./card-layout"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

type Interaction = { pointerId: number; kind: "drag" | KisakiResizeDirection; startX: number; startY: number; rect: KisakiFloatingRect }

const RESIZE_HANDLES: Array<{ direction: KisakiResizeDirection; className: string }> = [
  { direction: "n", className: "inset-x-3 top-0 h-2 cursor-n-resize" }, { direction: "ne", className: "right-0 top-0 size-3 cursor-ne-resize" }, { direction: "e", className: "inset-y-3 right-0 w-2 cursor-e-resize" }, { direction: "se", className: "bottom-0 right-0 size-4 cursor-se-resize" },
  { direction: "s", className: "inset-x-3 bottom-0 h-2 cursor-s-resize" }, { direction: "sw", className: "bottom-0 left-0 size-3 cursor-sw-resize" }, { direction: "w", className: "inset-y-3 left-0 w-2 cursor-w-resize" }, { direction: "nw", className: "left-0 top-0 size-3 cursor-nw-resize" },
]

export function KisakiFloatingAnalysisPanel({ state, viewport, layout, onStateChange, onLayoutChange, renderCard }: { state: KisakiFloatingPanelState; viewport: KisakiFloatingViewport; layout: KisakiCardLayout; onStateChange: (state: KisakiFloatingPanelState) => void; onLayoutChange: (layout: KisakiCardLayout) => void; renderCard: (id: KisakiCardId) => ReactNode }) {
  const { t } = useNodeI18n("kisaki")
  const interactionRef = useRef<Interaction | null>(null)
  if (!state.open) return null

  function start(event: PointerEvent<HTMLElement>, kind: Interaction["kind"]) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    interactionRef.current = { pointerId: event.pointerId, kind, startX: event.clientX, startY: event.clientY, rect: state.rect }
  }

  function move(event: PointerEvent<HTMLElement>) {
    const active = interactionRef.current
    if (!active || active.pointerId !== event.pointerId) return
    const deltaX = event.clientX - active.startX, deltaY = event.clientY - active.startY
    const rect = active.kind === "drag" ? moveKisakiFloatingRect(active.rect, deltaX, deltaY, viewport) : resizeKisakiFloatingRect(active.rect, active.kind, deltaX, deltaY, viewport)
    onStateChange({ ...state, rect })
  }

  function finish(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    interactionRef.current = null
  }

  function moveByKeyboard(event: KeyboardEvent<HTMLElement>) {
    const delta = event.shiftKey ? 32 : 12
    const vector = event.key === "ArrowLeft" ? [-delta, 0] : event.key === "ArrowRight" ? [delta, 0] : event.key === "ArrowUp" ? [0, -delta] : event.key === "ArrowDown" ? [0, delta] : undefined
    if (!vector) return
    event.preventDefault()
    const rect = event.altKey ? resizeKisakiFloatingRect(state.rect, "se", vector[0]!, vector[1]!, viewport) : moveKisakiFloatingRect(state.rect, vector[0]!, vector[1]!, viewport)
    onStateChange({ ...state, rect })
  }

  return <aside data-testid="czkawka-floating-analysis" className="absolute z-30 flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-2xl" style={{ left: state.rect.x, top: state.rect.y, width: state.rect.width, height: state.rect.height }}><header aria-label={t("floating.move", "移动浮动分析面板")} tabIndex={0} className="flex shrink-0 cursor-grab items-center gap-2 border-b bg-muted/40 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" onPointerDown={(event) => start(event, "drag")} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={moveByKeyboard}><Grip className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{t("floating.title", "浮动分析工作区")}</span><Button aria-label={t("floating.close", "关闭浮动分析面板")} size="icon-xs" variant="ghost" onPointerDown={(event) => event.stopPropagation()} onClick={() => onStateChange({ ...state, open: false })}><X /></Button></header><div className="min-h-0 flex-1 overflow-auto p-2"><KisakiCardStack layout={layout} panel="analysis" onChange={onLayoutChange} renderCard={renderCard} /></div>{RESIZE_HANDLES.map((handle) => <span key={handle.direction} role="separator" aria-label={t("floating.resize", "从{{direction}}方向调整浮动分析面板", { direction: handle.direction })} className={cn("absolute z-40 touch-none hover:bg-primary/20", handle.className)} onPointerDown={(event) => start(event, handle.direction)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />)}</aside>
}
