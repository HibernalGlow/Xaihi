import type { ReactElement, ReactNode } from "react"

import { cn } from "@/lib/utils"
import { BarHandleGlyph } from "./BarHandleGlyph"
import type { SwimlaneBarHandlePosition, SwimlaneBarHandleStyle } from "./model"

export function SwimlaneBarContent({
  children,
  handlePosition = "left",
  handleStyle = "grip",
  horizontal,
  menuOpen = false,
  label,
  renderHandle,
  onHandlePointerDown,
  onHandleContextMenu,
}: {
  children: ReactNode
  handlePosition?: SwimlaneBarHandlePosition
  handleStyle?: SwimlaneBarHandleStyle
  horizontal: boolean
  menuOpen?: boolean
  label: string
  renderHandle?(handle: ReactElement): ReactNode
  onHandlePointerDown?(event: React.PointerEvent<HTMLButtonElement>): void
  onHandleContextMenu?(event: React.MouseEvent<HTMLButtonElement>): void
}) {
  const handleButton = <button
    type="button"
    title={`${label}；右键打开设置`}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    data-swimlane-bar-handle="true"
    data-context-menu-stop=""
    data-swimlane-bar-handle-style={handleStyle}
    data-swimlane-bar-handle-position={handlePosition}
    data-reader-bar-handle-style={handleStyle}
    data-reader-bar-handle-position={handlePosition}
    className={cn("grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing", handleStyle === "edge" && "w-3")}
    onPointerDown={onHandlePointerDown}
    onContextMenu={onHandleContextMenu}
  >
    <BarHandleGlyph style={handleStyle} horizontal={horizontal} />
  </button>
  const handle = renderHandle ? renderHandle(handleButton) : handleButton

  return (
    <>
      {handlePosition === "left" ? handle : null}
      <div data-swimlane-bar-scroll="true" data-scrollbar="hidden" className={cn(
        "flex min-h-0 min-w-0 flex-1 gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        horizontal ? "flex-row overflow-x-auto overflow-y-hidden" : "flex-col overflow-x-hidden overflow-y-auto",
      )}>
        {children}
      </div>
      {handlePosition === "right" ? handle : null}
    </>
  )
}
