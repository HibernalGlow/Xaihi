import { forwardRef, type ButtonHTMLAttributes } from "react"
import { GripVertical } from "lucide-react"

import { LaneCollapseIcon } from "@/components/workspace/lane/LaneCollapseIcon"
import { cn } from "@/lib/utils"

export const SwimlaneCollapseDragButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  collapsed: boolean
  laneLabel: string
}>(({ collapsed, laneLabel, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={`${collapsed ? "展开" : "折叠"}${laneLabel}；按住可拖动`}
    title={`${collapsed ? "展开" : "折叠"}${laneLabel}；按住可拖动`}
    className={cn(
      "grid size-7 shrink-0 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground hover:[&_[data-swimlane-collapse-icon]]:hidden hover:[&_[data-swimlane-drag-icon]]:block active:cursor-grabbing",
      className,
    )}
    {...props}
  >
    <span data-swimlane-collapse-icon><LaneCollapseIcon collapsed={collapsed} /></span>
    <GripVertical data-swimlane-drag-icon className="hidden size-3.5" />
  </button>
))

SwimlaneCollapseDragButton.displayName = "SwimlaneCollapseDragButton"
