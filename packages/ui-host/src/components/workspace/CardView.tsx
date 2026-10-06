import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useWorkspaceActions, useWorkspaceShallowSelector, useWorkspaceVisibleComponents } from "@/store/workspaceStore"
import { ComponentCard } from "./ComponentCard"
import { computeLayout } from "@/lib/workspaceLayout"
import { isComponentVisibleInView } from "@/lib/componentVisibility"
import { useComponentSurfaceStatusMap } from "@/lib/componentSurfaceStatus"
import { getCardWeight, type CardWeightMeta } from "@/lib/cardWeight"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { Button } from "@/components/ui/button"
import { LayoutGrid, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * CardView — 卡片形态渲染器。
 * 仅在 viewMode === "cards" 时挂载。grid/stack/split/focus 子布局由 cardLayout 决定。
 * free 模式已删除。
 */
export function CardView() {
  const { cardLayout, focusedComponentId, fullscreenComponentId } = useWorkspaceShallowSelector((state) => ({
    cardLayout: state.cardLayout,
    focusedComponentId: state.focusedComponentId,
    fullscreenComponentId: state.fullscreenComponentId,
  }))
  const visibleComponents = useWorkspaceVisibleComponents()
  const workspaceActions = useWorkspaceActions()
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLDivElement>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const resizeIdleTimerRef = useRef<number | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const handleDropModule = useCallback((moduleId: string) => {
    workspaceActions.deployComponent(moduleId, { viewMode: "cards" })
  }, [workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)

  // 仅渲染未在 cards 模式下隐藏的组件
  const cardComponents = useMemo(
    () => visibleComponents.filter(c => isComponentVisibleInView(c, "cards")),
    [visibleComponents],
  )

  // 派生每个卡片的运行状态（订阅一次 operations）+ 权重，供 computeLayout 智能排序/放大
  const statusMap = useComponentSurfaceStatusMap(cardComponents)
  const cardWeights = useMemo<Record<string, CardWeightMeta>>(() => {
    const now = Date.now()
    const out: Record<string, CardWeightMeta> = {}
    for (const comp of cardComponents) {
      const status = statusMap[comp.id]
      if (!status) continue
      out[comp.id] = getCardWeight({
        component: comp,
        status,
        focusedComponentId,
        now,
      })
    }
    return out
  }, [cardComponents, statusMap, focusedComponentId])

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return

    const applySize = (rawWidth: number, rawHeight: number, immediate = false) => {
      const next = {
        w: Math.round(rawWidth),
        h: Math.round(rawHeight),
      }

      if (next.w <= 0 || next.h <= 0) return
      if (next.w === sizeRef.current.w && next.h === sizeRef.current.h) return

      if (immediate) {
        if (resizeFrameRef.current !== null) {
          cancelAnimationFrame(resizeFrameRef.current)
          resizeFrameRef.current = null
        }
        sizeRef.current = next
        setSize(next)
        return
      }

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null
        sizeRef.current = next
        setSize(next)
        setIsResizing(true)

        if (resizeIdleTimerRef.current !== null) {
          window.clearTimeout(resizeIdleTimerRef.current)
        }

        resizeIdleTimerRef.current = window.setTimeout(() => {
          resizeIdleTimerRef.current = null
          setIsResizing(false)
        }, 140)
      })
    }

    applySize(el.clientWidth, el.clientHeight, true)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      applySize(width, height)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
      }
      if (resizeIdleTimerRef.current !== null) {
        window.clearTimeout(resizeIdleTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (fullscreenComponentId) workspaceActions.setFullscreen(null)
        else if (focusedComponentId) workspaceActions.focusComponent(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreenComponentId, focusedComponentId, workspaceActions])

  const layouts = useMemo(
    () =>
      computeLayout({
        components: cardComponents,
        layout: cardLayout,
        focusedId: focusedComponentId,
        fullscreenId: fullscreenComponentId,
        W: size.w,
        H: size.h,
        cardWeights,
      }),
    [cardComponents, cardLayout, focusedComponentId, fullscreenComponentId, size.h, size.w, cardWeights],
  )

  const isEmpty = cardComponents.length === 0

  return (
    <div
      className={cn(
        "flex-1 ws-canvas-bg overflow-hidden relative transition-colors",
        isEmpty && "flex items-center justify-center",
        isResizing && "ws-canvas-bg--resizing",
        isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      ref={canvasRef}
      data-testid="cards-drop-target"
      {...moduleDropHandlers}
    >
      {isModuleOver && <ModuleDropHint label={t("registry:dropHint")} />}

      {isEmpty ? (
        <div className="xiranite-ui-copy text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-sm border-2 border-dashed border-border flex items-center justify-center">
              <LayoutGrid className="h-5 w-5 text-muted-foreground/50" />
            </div>
          </div>
          <div>
            <p className="text-sm font-mono text-muted-foreground">{t("view:cards.empty")}</p>
            <p className="text-xs font-mono text-muted-foreground/60 mt-1">{t("view:cards.emptyHint")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => workspaceActions.setOverlay("registry")}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t("view:cards.openRegistry")}
          </Button>
        </div>
      ) : (
        <>
          {cardComponents.map(comp => (
            <ComponentCard
              key={comp.id}
              comp={comp}
              layout={layouts[comp.id]}
              canvasRef={canvasRef}
              isFocused={focusedComponentId === comp.id}
              hasFocused={focusedComponentId !== null}
              cardLayout={cardLayout}
              isLayoutResizing={isResizing}
            />
          ))}

          {fullscreenComponentId && (
            <button
              onClick={() => workspaceActions.setFullscreen(null)}
              className="xiranite-ui-copy absolute bottom-4 left-1/2 z-[1001] -translate-x-1/2 rounded-full border border-border bg-card/90 px-4 py-1.5 font-mono text-[11px] tracking-widest text-muted-foreground backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-150 hover:text-primary"
            >
              {t("view:cards.exitFullscreen")}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ModuleDropHint({ label }: { label: string }) {
  return (
    <div className="xiranite-ui-copy pointer-events-none absolute left-1/2 top-4 z-[1002] -translate-x-1/2 rounded-sm border border-primary/40 bg-card/95 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary shadow-sm">
      {label}
    </div>
  )
}
