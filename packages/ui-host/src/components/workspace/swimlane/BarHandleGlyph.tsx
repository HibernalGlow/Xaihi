import { Grab, GripHorizontal, GripVertical, Move } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SwimlaneBarHandleStyle } from "./model"

export function BarHandleGlyph({ style, horizontal, className }: {
  style: SwimlaneBarHandleStyle
  horizontal: boolean
  className?: string
}) {
  if (style === "edge") return <span className={cn(horizontal ? "h-4 w-0.5" : "h-0.5 w-4", "rounded-full bg-current", className)} />
  if (style === "grab") return <Grab className={cn("size-3.5", className)} />
  if (style === "move") return <Move className={cn("size-3.5", className)} />
  if (style === "groove") return <span className={cn("flex items-center justify-center gap-0.5", !horizontal && "flex-col", className)} aria-hidden="true">
    {[0, 1, 2].map((line) => <span key={line} className={horizontal ? "h-3 w-px rounded-full bg-current" : "h-px w-3 rounded-full bg-current"} />)}
  </span>
  return horizontal ? <GripVertical className={cn("size-3.5", className)} /> : <GripHorizontal className={cn("size-3.5", className)} />
}
