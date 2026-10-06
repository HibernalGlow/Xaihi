import { cn } from "@/lib/utils"
import {
  shouldShowSurfaceStatus,
  type ComponentSurfacePhase,
  type ComponentSurfaceStatus,
} from "@/lib/componentSurfaceStatus"

interface ComponentProgressStripProps {
  status: ComponentSurfaceStatus
  placement?: "top" | "bottom"
  compact?: boolean
}

const PHASE_CLASS: Record<ComponentSurfacePhase, string> = {
  idle: "bg-muted/40",
  queued: "bg-primary/45",
  running: "bg-primary",
  completed: "bg-primary",
  error: "bg-destructive",
  cancelled: "bg-primary/60",
}

/**
 * 卡片/Bento widget 共享的边缘进度条。
 * - running 且 progress 为 null → 不定式动画条
 * - 终态在 RECENT_TERMINAL_MS 窗口内可见，之后自动隐藏
 * - idle 不渲染
 */
export function ComponentProgressStrip({
  status,
  placement = "bottom",
  compact = false,
}: ComponentProgressStripProps) {
  if (!shouldShowSurfaceStatus(status)) return null

  const indeterminate = status.progress == null && status.phase === "running"
  const themedProgress = status.phase !== "error"
  const widthPct = status.progress == null ? undefined : `${Math.max(0, Math.min(100, status.progress))}%`
  const title = [status.message ?? status.label ?? "component progress", status.progress != null ? `${Math.round(status.progress)}%` : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      aria-label={status.message ?? status.label ?? "component progress"}
      title={title}
      className={cn(
        "xiranite-ui-copy pointer-events-none absolute inset-x-0 z-30",
        placement === "top" ? "top-0" : "bottom-0",
        compact && "h-[2px]",
        !compact && "h-[3px]",
      )}
    >
      <div className="h-full w-full bg-muted/45">
        <div
          className={cn(
            "h-full transition-[width,background-color] duration-200",
            PHASE_CLASS[status.phase],
            themedProgress && "xiranite-node-progress-active",
            indeterminate && "xiranite-progress-indeterminate",
          )}
          style={widthPct ? { width: widthPct } : indeterminate ? undefined : { width: status.phase === "completed" ? "100%" : "0%" }}
        />
      </div>
    </div>
  )
}
