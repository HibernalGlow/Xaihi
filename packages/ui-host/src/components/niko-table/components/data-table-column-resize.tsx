import type { Header } from "@tanstack/react-table"
import type { MouseEvent, TouchEvent } from "react"

import { cn } from "@/lib/utils"

export interface DataTableColumnResizeHandleProps<TData, TValue> {
  header: Header<TData, TValue>
  className?: string
}

export function DataTableColumnResizeHandle<TData, TValue>({
  header,
  className,
}: DataTableColumnResizeHandleProps<TData, TValue>) {
  if (!header.column.getCanResize()) return null

  const resize = header.getResizeHandler()

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
    resize(event)
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    event.stopPropagation()
    resize(event)
  }

  return (
    <div
      role="separator"
      aria-label={`调整 ${header.column.id} 列宽`}
      aria-orientation="vertical"
      aria-valuemin={header.column.columnDef.minSize}
      aria-valuemax={header.column.columnDef.maxSize}
      aria-valuenow={header.getSize()}
      className={cn(
        "absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-1 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border",
        "hover:after:bg-primary data-[resizing=true]:after:w-0.5 data-[resizing=true]:after:bg-primary",
        className,
      )}
      data-resizing={header.column.getIsResizing() || undefined}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        header.column.resetSize()
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  )
}

DataTableColumnResizeHandle.displayName = "DataTableColumnResizeHandle"
