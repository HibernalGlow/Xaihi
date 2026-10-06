/**
 * LaneCard — 泳道内的卡片。
 *
 * 从 Xlchemy LaneCard.svelte 移植为 React，简化为：
 * - 标题栏（拖拽手柄 + 模块名 + 关闭按钮）
 * - 内容区（ModuleRenderer）
 *
 * 拖拽：由 @dnd-kit 的 sortable handle 触发，释放时由 LaneView dispatch MOVE_COMPONENT_TO_LANE。
 *
 * 关闭：dispatch TOGGLE_COMPONENT_VISIBILITY(lane) — 仅在 lane 模式下隐藏。
 *
 */
import { useRef, type PointerEvent } from "react"
import { useTranslation } from "react-i18next"
import { useWorkspaceActions, useWorkspaceComponent, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { getModule } from "@/components/modules/registry"
import { useWindowControls } from "@/hooks/useWindowControls"
import { KanbanItem, KanbanItemHandle } from "@/components/ui/kanban"
import { DefaultNodeDragGrip, NodeSurfaceChrome, type NodeSurfaceChromeAction } from "@/components/workspace/NodeSurfaceChrome"
import { createSurfaceCommonActions } from "@/components/workspace/createSurfaceCommonActions"
import { cn } from "@/lib/utils"

interface Props {
  compId: string
  moduleId: string
}

export function LaneCard({ compId, moduleId }: Props) {
  const { t, i18n } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const component = useWorkspaceComponent(compId)
  const isSelected = useWorkspaceShallowSelector((s) => s.selectedComponentIds.includes(compId))
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null)
  const mod = getModule(moduleId)
  const laneHeight = component?.laneSize?.height ?? 420
  const moduleName = mod && i18n.exists(`module:${moduleId}.name`) ? t(`module:${moduleId}.name`) : (mod?.name ?? moduleId)
  const actions: NodeSurfaceChromeAction[] = createSurfaceCommonActions({
    componentId: compId,
    componentData: component?.data,
    currentMode: "lane",
    height: Math.round(laneHeight),
    moduleId,
    moduleName,
    openComponent,
    t,
    width: 640,
    workspaceActions,
  })
  const dragHandle = (
    <KanbanItemHandle
      data-lane-card-drag-handle="true"
      className="text-muted-foreground/55"
      title={t("common:dragToOtherLane")}
    >
      <DefaultNodeDragGrip />
    </KanbanItemHandle>
  )

  function handleHeightResizeStart(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    const target = event.currentTarget
    const pointerId = event.pointerId
    resizeStartRef.current = { y: event.clientY, height: laneHeight }
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId || !resizeStartRef.current) return
      workspaceActions.setComponentLaneSize(compId, {
        height: resizeStartRef.current.height + (moveEvent.clientY - resizeStartRef.current.y),
      })
    }

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      resizeStartRef.current = null
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // The pointer may already be released by the browser.
      }
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("pointercancel", handleUp)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("pointercancel", handleUp)
  }

  return (
    <KanbanItem
      value={compId}
      data-card-id={compId}
      data-component-id={compId}
      style={{ height: laneHeight }}
      className={cn(
        "xiranite-component-surface group relative flex min-h-[220px] flex-col overflow-hidden rounded-md bg-card/72 text-card-foreground outline outline-1 outline-transparent shadow-[0_18px_50px_-36px_oklch(0_0_0/0.42)] backdrop-blur-md transition-[background-color,box-shadow,outline-color] hover:bg-card/82 hover:outline-border/35 hover:shadow-[0_22px_58px_-34px_oklch(0_0_0/0.5)]",
        isSelected && "outline-2 outline-primary/60",
      )}
    >
      <NodeSurfaceChrome actions={actions} dragHandle={dragHandle} moduleId={moduleId} moduleName={moduleName} version={mod?.version} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ModuleRenderer moduleId={moduleId} compId={compId} />
      </div>
      <button
        type="button"
        aria-label={t("common:resize")}
        className="xiranite-no-drag h-2 cursor-ns-resize border-t border-border/35 bg-muted/20 transition-colors hover:bg-primary/30"
        onPointerDown={handleHeightResizeStart}
      />
    </KanbanItem>
  )
}
