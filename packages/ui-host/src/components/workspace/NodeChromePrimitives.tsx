import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const NODE_CHROME_PILL_CLASS_NAME = "xiranite-node-chrome-pill flex items-center gap-0.5 rounded-[4px] border border-transparent bg-background/45 p-0.5 shadow-sm backdrop-blur-md ring-1 ring-border/20"
export const NODE_CHROME_ACTION_CLASS_NAME = "text-muted-foreground hover:text-primary"

export function NodeChromePill({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(NODE_CHROME_PILL_CLASS_NAME, className)} {...props} />
}

export function NodeChromeExpandablePill({
  autoCollapse = true,
  children,
  className,
  ...props
}: ComponentProps<"div"> & { autoCollapse?: boolean }) {
  return (
    <div
      {...props}
      data-window-caption-visibility={autoCollapse ? "expand-on-hover" : "always-expanded"}
      className={cn("relative h-6 overflow-hidden", className)}
    >
      {autoCollapse ? <NodeChromeIdleIndicator /> : null}
      <NodeChromePill
        data-node-chrome-expanded-surface
        className="h-6 w-full rounded-full px-0.5 py-px"
      >
        {children}
      </NodeChromePill>
    </div>
  )
}

export function NodeChromeIdleIndicator({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-node-chrome-idle-indicator
      className={cn("pointer-events-none absolute left-1/2 top-1/2 h-1 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70 shadow-[0_0_8px_var(--ws-accent-glow)]", className)}
      {...props}
    />
  )
}

export function NodeChromeActionButton({
  className,
  danger = false,
  onPointerDown,
  ...props
}: ComponentProps<typeof Button> & { danger?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      data-node-chrome-action
      data-node-chrome-danger={danger || undefined}
      className={cn(
        NODE_CHROME_ACTION_CLASS_NAME,
        danger && "hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown?.(event)
      }}
      {...props}
    />
  )
}

export function NodeChromeActionPreview({
  className,
  danger = false,
  ...props
}: ComponentProps<"span"> & { danger?: boolean }) {
  return (
    <span
      data-node-chrome-action
      data-node-chrome-danger={danger || undefined}
      className={cn(
        NODE_CHROME_ACTION_CLASS_NAME,
        "grid size-6 place-items-center rounded-md transition-colors hover:bg-accent [&_svg]:size-3",
        danger && "hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      {...props}
    />
  )
}
