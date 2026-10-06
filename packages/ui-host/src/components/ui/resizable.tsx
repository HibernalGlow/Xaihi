import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ collapsedSize, defaultSize, maxSize, minSize, ...props }: ResizablePrimitive.PanelProps) {
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      collapsedSize={normalizePanelSize(collapsedSize)}
      defaultSize={normalizePanelSize(defaultSize)}
      maxSize={normalizePanelSize(maxSize)}
      minSize={normalizePanelSize(minSize)}
      {...props}
    />
  )
}

// Keep the project wrapper's pre-v4 contract: bare numbers are percentages.
// Callers that need fixed sizing can pass an explicit unit such as "240px".
function normalizePanelSize(size: number | string | undefined) {
  return typeof size === "number" ? `${size}%` : size
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        "[[data-resizable-handle-style=line]_&]:bg-primary/35 [[data-resizable-handle-style=line]_&]:after:w-2 [[data-resizable-handle-style=minimal]_&]:bg-transparent [[data-resizable-handle-style=minimal]_&]:after:w-px [[data-resizable-handle-style=minimal]_&]:after:bg-border/60",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border [[data-resizable-handle-style=line]_&]:hidden [[data-resizable-handle-style=minimal]_&]:hidden [[data-resizable-handle-style=dots]_&]:size-4 [[data-resizable-handle-style=dots]_&]:rounded-full [[data-resizable-handle-style=dots]_&]:bg-background">
          <GripVerticalIcon className="size-2.5 [[data-resizable-handle-style=dots]_&]:hidden" />
          <span className="hidden size-1.5 rounded-full bg-primary shadow-[0_-3px_0_var(--border),0_3px_0_var(--border)] [[data-resizable-handle-style=dots]_&]:block" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
