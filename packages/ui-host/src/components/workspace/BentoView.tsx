import { useCallback, useLayoutEffect, useMemo, useRef, type DragEvent as ReactDragEvent, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { GridStack, type GridStackNode } from "gridstack"
import "gridstack/dist/gridstack.min.css"
import { LayoutTemplate, Maximize2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppleResizeHandle } from "@/components/ui/apple-resize-handle"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { getModule } from "@/components/modules/registry"
import { useMarqueeSelection } from "@/hooks/useMarqueeSelection"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { useWindowControls } from "@/hooks/useWindowControls"
import { isComponentVisibleInView } from "@/lib/componentVisibility"
import { useComponentSurfaceStatus } from "@/lib/componentSurfaceStatus"
import { cn } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceShallowSelector, useWorkspaceVisibleComponents } from "@/store/workspaceStore"
import type { ComponentInstance } from "@/types/workspace"
import { ComponentProgressStrip } from "./ComponentProgressStrip"
import { DefaultNodeDragGrip, NodeSurfaceChrome, type NodeSurfaceChromeAction } from "./NodeSurfaceChrome"
import { createSurfaceCommonActions } from "./createSurfaceCommonActions"

const GRID_COLUMNS = 12
const GRID_CELL_HEIGHT = 76
const GRID_MARGIN = 10
const DEFAULT_WIDGET = { x: 0, y: 0, w: 4, h: 4 }
const CLIPM_MIN_BENTO_HEIGHT = 8

function isBentoVisible(component: ComponentInstance) {
  return isComponentVisibleInView(component, "bento")
}

function layoutFor(component: ComponentInstance, index: number) {
  return component.bentoLayout ?? {
    x: (index % 3) * 4,
    y: Math.floor(index / 3) * 4,
    w: index % 5 === 0 ? 6 : DEFAULT_WIDGET.w,
    h: index % 7 === 2 ? 5 : DEFAULT_WIDGET.h,
  }
}

export function BentoView() {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const visibleComponents = useWorkspaceVisibleComponents()
  const gridRef = useRef<GridStack | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bentoComponents = useMemo(
    () => visibleComponents.filter(isBentoVisible),
    [visibleComponents],
  )
  const componentIds = useMemo(() => bentoComponents.map((component) => component.id).join("|"), [bentoComponents])
  const handleDropModule = useCallback((moduleId: string, event: ReactDragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
    const x = Math.max(0, Math.min(GRID_COLUMNS - DEFAULT_WIDGET.w, Math.floor(xRatio * GRID_COLUMNS) - Math.floor(DEFAULT_WIDGET.w / 2)))
    const y = Math.max(
      0,
      Math.floor((event.clientY - rect.top) / (GRID_CELL_HEIGHT + GRID_MARGIN)) - Math.floor(DEFAULT_WIDGET.h / 2),
    )
    workspaceActions.deployComponent(moduleId, {
      viewMode: "bento",
      bentoLayout: { ...DEFAULT_WIDGET, x, y },
    })
  }, [workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)
  // 框选多节点支持
  const selectedComponentIds = useWorkspaceShallowSelector((state) => state.selectedComponentIds)
  const selectedSet = useMemo(() => new Set(selectedComponentIds), [selectedComponentIds])
  const marqueeContainerRef = useRef<HTMLDivElement | null>(null)
  const handleMarqueeSelect = useCallback((ids: string[]) => {
    workspaceActions.setSelection(ids)
  }, [workspaceActions])
  const { rect, onPointerDown, onPointerMove, onPointerUp } = useMarqueeSelection({
    containerRef: marqueeContainerRef,
    getComponentId: (el) => el.dataset.componentId ?? null,
    onSelect: handleMarqueeSelect,
    enabled: true,
  })
  const persistGridLayout = useCallback((grid: GridStack) => {
    for (const node of grid.engine.nodes) {
      const id = node.id ? String(node.id) : node.el?.getAttribute("gs-id")
      if (!id) continue
      workspaceActions.setComponentBentoLayout(id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: node.w ?? DEFAULT_WIDGET.w,
        h: node.h ?? DEFAULT_WIDGET.h,
      })
    }
  }, [workspaceActions])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || bentoComponents.length === 0) return undefined

    pruneStaleGridItems(container, new Set(bentoComponents.map((component) => component.id)))
    gridRef.current?.destroy(false)
    const grid = GridStack.init({
      acceptWidgets: false,
      animate: true,
      cellHeight: GRID_CELL_HEIGHT,
      column: GRID_COLUMNS,
      float: false,
      margin: GRID_MARGIN,
      minRow: 1,
      draggable: {
        handle: ".xiranite-bento-drag-handle",
        cancel: "button, input, textarea, select, a, [role='button'], [role='tab'], [contenteditable='true'], .xiranite-no-drag",
      },
      resizable: {
        handles: "e,se,s,w",
      },
    }, container)
    gridRef.current = grid

    const syncLayout = (_event?: Event, _items?: GridStackNode[]) => {
      persistGridLayout(grid)
    }

    grid.on("change", syncLayout)
    grid.on("dragstop", syncLayout)
    grid.on("resizestop", syncLayout)

    return () => {
      syncLayout()
      grid.off("change")
      grid.off("dragstop")
      grid.off("resizestop")
      grid.destroy(false)
      if (gridRef.current === grid) gridRef.current = null
    }
  }, [bentoComponents.length, componentIds, persistGridLayout])

  if (bentoComponents.length === 0) {
    return (
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center ws-canvas-bg transition-colors",
          isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        )}
        data-testid="bento-drop-target"
        {...moduleDropHandlers}
      >
        {isModuleOver && <ModuleDropHint label={t("registry:dropHint")} />}
        <div className="xiranite-ui-copy space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-sm border-2 border-dashed border-border text-muted-foreground/50">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-mono text-muted-foreground">{t("view:bento.empty")}</p>
            <p className="mt-1 text-xs font-mono text-muted-foreground/60">{t("view:bento.emptyHint")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => workspaceActions.setOverlay("registry")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("view:bento.openRegistry")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={marqueeContainerRef}
      className={cn(
        "relative min-h-0 flex-1 overflow-auto ws-canvas-bg p-4 transition-colors",
        isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      data-testid="bento-drop-target"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      {...moduleDropHandlers}
    >
      {isModuleOver && <ModuleDropHint label={t("registry:dropHint")} />}
      <div
        ref={containerRef}
        key={componentIds}
        className="grid-stack xiranite-bento-grid mx-auto max-w-[1680px]"
        data-testid="bento-grid"
      >
        {bentoComponents.map((component, index) => {
          const layout = layoutFor(component, index)
          return (
            <div
              key={component.id}
              className="grid-stack-item"
              gs-id={component.id}
              gs-x={String(layout.x)}
              gs-y={String(layout.y)}
              gs-w={String(layout.w)}
              gs-h={String(layout.h)}
              gs-min-w="2"
              gs-min-h={component.moduleId === "clipm" ? String(CLIPM_MIN_BENTO_HEIGHT) : "2"}
            >
              <div className="grid-stack-item-content">
                <BentoWidget component={component} isSelected={selectedSet.has(component.id)} />
              </div>
            </div>
          )
        })}
      </div>
      {rect && (
        <div
          className="pointer-events-none absolute border border-primary/60 bg-primary/10"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      )}
    </div>
  )
}

function pruneStaleGridItems(container: HTMLElement, activeIds: Set<string>) {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement) || !child.classList.contains("grid-stack-item")) continue
    const id = child.getAttribute("gs-id") ?? child.getAttribute("data-gs-id")
    if (!id || !activeIds.has(id)) child.remove()
  }
}

function BentoWidget({ component, isSelected }: { component: ComponentInstance; isSelected?: boolean }) {
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const { t, i18n } = useTranslation()
  const mod = getModule(component.moduleId)
  const moduleName = i18n.exists(`module:${component.moduleId}.name`)
    ? t(`module:${component.moduleId}.name`)
    : (mod?.name ?? component.moduleId)
  const surfaceStatus = useComponentSurfaceStatus(component)

  function toggleCollapse(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    workspaceActions.toggleCollapse(component.id)
  }

  const actions: NodeSurfaceChromeAction[] = [
    {
      key: "collapse",
      label: component.collapsed ? t("common:expand") : t("common:collapse"),
      icon: component.collapsed ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />,
      onClick: toggleCollapse,
    },
    ...createSurfaceCommonActions({
      componentId: component.id,
      componentData: component.data,
      currentMode: "bento",
      height: 480,
      moduleId: component.moduleId,
      moduleName,
      openComponent,
      t,
      width: 640,
      workspaceActions,
    }),
  ]
  const dragHandle = (
    <span className="xiranite-bento-drag-handle cursor-grab text-muted-foreground/55 active:cursor-grabbing">
      <DefaultNodeDragGrip />
    </span>
  )

  return (
    <section
      data-component-id={component.id}
      data-context-menu="bento-cell"
      className={cn(
        "xiranite-component-surface xiranite-bento-drag-handle group relative flex h-full min-h-0 cursor-grab flex-col overflow-hidden rounded-md bg-card/72 text-card-foreground outline outline-1 outline-transparent shadow-[0_18px_50px_-36px_oklch(0_0_0/0.42)] backdrop-blur-md transition-[background-color,box-shadow,outline-color] hover:bg-card/82 hover:outline-border/35 hover:shadow-[0_22px_58px_-34px_oklch(0_0_0/0.5)] active:cursor-grabbing",
        isSelected && "outline-2 outline-primary/60",
      )}
    >
      <ComponentProgressStrip
        status={surfaceStatus}
        placement={component.collapsed ? "top" : "bottom"}
        compact={component.collapsed}
      />
      <NodeSurfaceChrome
        actions={actions}
        collapsed={component.collapsed}
        dragHandle={dragHandle}
        moduleId={component.moduleId}
        moduleName={moduleName}
        version={mod?.version}
      />
      {!component.collapsed && (
        <div className="min-h-0 flex-1 cursor-auto overflow-hidden">
          <ModuleRenderer moduleId={component.moduleId} compId={component.id} />
        </div>
      )}
      <AppleResizeHandle className="bottom-0.5 right-0.5 size-10" />
    </section>
  )
}

function ModuleDropHint({ label }: { label: string }) {
  return (
    <div className="xiranite-ui-copy pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-sm border border-primary/40 bg-card/95 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary shadow-sm">
      {label}
    </div>
  )
}

