import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface OverlayViewShellProps {
  /** 顶部标题/筛选区，统一 padding 与底部分隔线。 */
  header?: ReactNode
  /** 主体内容，置于可滚动区域。 */
  children: ReactNode
  /** 根容器额外类名（例如 `bg-card`）。 */
  className?: string
  /** 主体滚动区额外类名（例如 `p-4`）。 */
  bodyClassName?: string
}

/**
 * 统一的 overlay 视图容器壳。
 *
 * 所有 overlay 视图（设置、模块库、运行历史、节点运行）共用此壳，保证根容器、
 * header padding 与 body 滚动行为一致。视图组件只负责 header 与 body 内容，
 * 不再各自维护容器结构与间距——内容与容器解耦后，同一份视图内容既能放进
 * OverlayHost 侧栏，也能在未来作为卡片嵌入视图。
 */
export function OverlayViewShell({ header, children, className, bodyClassName }: OverlayViewShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      {header != null && (
        <div className="shrink-0 border-b border-border/60 px-4 py-3">{header}</div>
      )}
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>{children}</div>
    </div>
  )
}
