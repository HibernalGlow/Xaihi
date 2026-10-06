import {
  lazy,
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Rnd, type RndDragCallback, type RndResizeCallback } from "react-rnd"
import { GripHorizontal, PanelRightClose, PictureInPicture2, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspaceActions, useWorkspaceSelector } from "@/store/workspaceStore"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { OverlayFloatingMetrics } from "@/store/workspace/types"

const ModuleRegistry = lazy(() =>
  import("@/components/views/ModuleRegistry").then((module) => ({ default: module.ModuleRegistry })),
)
const ThemeSettings = lazy(() =>
  import("@/components/views/ThemeSettings").then((module) => ({ default: module.ThemeSettings })),
)
const NodeOperationMonitor = lazy(() =>
  import("@/components/views/NodeOperationMonitor").then((module) => ({ default: module.NodeOperationMonitor })),
)
const NodeRunHistoryView = lazy(() =>
  import("@/components/views/NodeRunHistoryView").then((module) => ({ default: module.NodeRunHistoryView })),
)
const FileDeletionHistoryView = lazy(() =>
  import("@/components/views/FileDeletionHistoryView").then((module) => ({ default: module.FileDeletionHistoryView })),
)

const TITLE_KEYS = {
  registry: "overlay:registry",
  settings: "overlay:settings",
  operations: "overlay:operations",
  history: "overlay:history",
  deletions: "overlay:deletions",
} as const

const FLOATING_MARGIN = 16
const MIN_OVERLAY_WIDTH = 320
const MIN_OVERLAY_HEIGHT = 320

interface PixelSize {
  width: number
  height: number
}

interface PixelPosition {
  x: number
  y: number
}

function OverlayLoading() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-8 w-36 rounded-sm" />
      <Skeleton className="h-20 w-full rounded-sm" />
      <Skeleton className="h-20 w-11/12 rounded-sm" />
      <Skeleton className="h-20 w-full rounded-sm" />
    </div>
  )
}

export function OverlayHost() {
  const overlay = useWorkspaceSelector((state) => state.overlay)
  const overlayMode = useWorkspaceSelector((state) => state.overlayMode)
  const overlayWidth = useWorkspaceSelector((state) => state.overlayWidth)
  const overlayFloatingMetrics = useWorkspaceSelector((state) => state.overlayFloatingMetrics)
  const workspaceActions = useWorkspaceActions()
  const { t } = useTranslation()
  const [floatingLayerRef, floatingLayerSize] = useElementSize<HTMLDivElement>()
  const [liveSize, setLiveSize] = useState<PixelSize | null>(null)
  const [livePosition, setLivePosition] = useState<PixelPosition | null>(null)
  const reducedMotion = useReducedMotion()

  const floating = overlayMode === "floating"
  const floatingLimits = getFloatingLimits(floatingLayerSize)
  const floatingSize = getFloatingSize(floatingLayerSize, overlayFloatingMetrics, liveSize)
  const floatingPosition = getFloatingPosition(floatingLayerSize, floatingSize, overlayFloatingMetrics, livePosition)
  const dockedWidth = liveSize?.width ?? overlayWidth

  const startDockedResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    document.body.style.cursor = "ew-resize"
    document.body.style.userSelect = "none"
    let latestWidth = dockedWidth

    const onMove = (moveEvent: PointerEvent) => {
      const maxWidth = Math.max(MIN_OVERLAY_WIDTH, window.innerWidth - 96)
      latestWidth = clampPixel(window.innerWidth - moveEvent.clientX, MIN_OVERLAY_WIDTH, maxWidth)
      setLiveSize({ width: latestWidth, height: floatingSize.height })
    }

    const onUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      workspaceActions.setOverlayWidth(latestWidth)
      setLiveSize(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp, { once: true })
  }, [dockedWidth, floatingSize.height, workspaceActions])

  const handleFloatingDrag = useCallback<RndDragCallback>((_event, data) => {
    setLivePosition(clampFloatingPosition(floatingLayerSize, floatingSize, { x: data.x, y: data.y }))
  }, [floatingLayerSize, floatingSize])

  const handleFloatingDragStop = useCallback<RndDragCallback>((_event, data) => {
    const nextPosition = clampFloatingPosition(floatingLayerSize, floatingSize, { x: data.x, y: data.y })
    workspaceActions.setOverlayFloatingMetrics(positionToRatios(floatingLayerSize, floatingSize, nextPosition))
    setLivePosition(null)
  }, [floatingLayerSize, floatingSize, workspaceActions])

  const handleFloatingResize = useCallback<RndResizeCallback>((_event, _direction, ref, _delta, position) => {
    const nextSize = {
      width: clampPixel(ref.offsetWidth, MIN_OVERLAY_WIDTH, floatingLimits.maxWidth),
      height: clampPixel(ref.offsetHeight, MIN_OVERLAY_HEIGHT, floatingLimits.maxHeight),
    }
    setLiveSize(nextSize)
    setLivePosition(clampFloatingPosition(floatingLayerSize, nextSize, position))
  }, [floatingLayerSize, floatingLimits.maxHeight, floatingLimits.maxWidth])

  const handleFloatingResizeStop = useCallback<RndResizeCallback>((_event, _direction, ref, _delta, position) => {
    const nextSize = {
      width: clampPixel(ref.offsetWidth, MIN_OVERLAY_WIDTH, floatingLimits.maxWidth),
      height: clampPixel(ref.offsetHeight, MIN_OVERLAY_HEIGHT, floatingLimits.maxHeight),
    }
    const nextPosition = clampFloatingPosition(floatingLayerSize, nextSize, position)
    workspaceActions.setOverlayFloatingMetrics({
      ...sizeToRatios(floatingLayerSize, nextSize),
      ...positionToRatios(floatingLayerSize, nextSize, nextPosition),
    })
    setLiveSize(null)
    setLivePosition(null)
  }, [floatingLayerSize, floatingLimits.maxHeight, floatingLimits.maxWidth, workspaceActions])

  const panelTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }

  if (!overlay) return null

  const panelContent = (
    <OverlayPanelFrame
      floating={floating}
      title={t(TITLE_KEYS[overlay])}
      modeLabel={floating ? t("overlay:floatingMode") : t("overlay:dockMode")}
      dragLabel={t("overlay:drag")}
      closeLabel={t("common:collapse")}
      dockLabel={t("overlay:dockMode")}
      floatingLabel={t("overlay:floatingMode")}
      onModeToggle={() => workspaceActions.setOverlayMode(floating ? "docked" : "floating")}
      onClose={() => workspaceActions.setOverlay(null)}
    >
      <motion.div
        key={overlay}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
        transition={panelTransition}
      >
        <Suspense fallback={<OverlayLoading />}>
          {overlay === "registry" && <ModuleRegistry />}
          {overlay === "settings" && <ThemeSettings />}
          {overlay === "operations" && <NodeOperationMonitor />}
          {overlay === "history" && <NodeRunHistoryView />}
          {overlay === "deletions" && <FileDeletionHistoryView />}
        </Suspense>
      </motion.div>
    </OverlayPanelFrame>
  )

  return (
    <AnimatePresence initial={false}>
      {floating ? (
        <div
          key="workspace-floating-overlay-layer"
          ref={floatingLayerRef}
          className="pointer-events-none absolute inset-0 z-30"
          data-testid="workspace-floating-overlay-layer"
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            className="pointer-events-auto absolute inset-0 bg-background/20 backdrop-blur-[1px]"
            data-testid="workspace-overlay-backdrop"
            aria-label={t("common:collapse")}
            onClick={() => workspaceActions.setOverlay(null)}
          />
          <Rnd
            bounds="parent"
            dragHandleClassName="workspace-overlay-drag-handle"
            cancel=".workspace-overlay-no-drag"
            enableResizing
            minWidth={MIN_OVERLAY_WIDTH}
            minHeight={MIN_OVERLAY_HEIGHT}
            maxWidth={floatingLimits.maxWidth}
            maxHeight={floatingLimits.maxHeight}
            size={floatingSize}
            position={floatingPosition}
            onDrag={handleFloatingDrag}
            onDragStop={handleFloatingDragStop}
            onResize={handleFloatingResize}
            onResizeStop={handleFloatingResizeStop}
            className="pointer-events-auto z-40"
            data-testid="workspace-push-panel"
            data-overlay-mode={overlayMode}
          >
            <motion.aside
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.98 }}
              transition={panelTransition}
              className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-2xl shadow-black/25 ring-1 ring-primary/10 backdrop-blur-sm"
            >
              {panelContent}
            </motion.aside>
          </Rnd>
        </div>
      ) : (
        <motion.aside
          layout
          key="workspace-overlay"
          initial={{ opacity: 0, x: reducedMotion ? 0 : 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reducedMotion ? 0 : 28 }}
          transition={panelTransition}
          className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border/60 bg-card/95 backdrop-blur-sm"
          data-testid="workspace-push-panel"
          data-overlay-mode={overlayMode}
          style={{ width: dockedWidth, maxWidth: "calc(100vw - 5rem)" }}
        >
          <div
            role="separator"
            aria-label={t("overlay:resize")}
            title={t("overlay:resize")}
            className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1/2 cursor-ew-resize bg-transparent transition-colors hover:bg-primary/35"
            onPointerDown={startDockedResize}
          />
          {panelContent}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function OverlayPanelFrame({
  floating,
  title,
  modeLabel,
  dragLabel,
  closeLabel,
  dockLabel,
  floatingLabel,
  onModeToggle,
  onClose,
  children,
}: {
  floating: boolean
  title: string
  modeLabel: string
  dragLabel: string
  closeLabel: string
  dockLabel: string
  floatingLabel: string
  onModeToggle(): void
  onClose(): void
  children: ReactNode
}) {
  const modeToggleLabel = floating ? dockLabel : floatingLabel

  return (
    <>
      <header className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/45 px-3 backdrop-blur",
        floating && "rounded-t-lg",
      )}>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            floating && "workspace-overlay-drag-handle cursor-grab touch-none active:cursor-grabbing",
          )}
          title={floating ? dragLabel : undefined}
        >
          {floating && <GripHorizontal className="size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <h2 className="min-w-0 truncate font-mono text-[11px] font-semibold tracking-widest text-foreground">
              {title}
            </h2>
            <Badge variant="outline" className="mt-1 h-4 rounded-sm px-1.5 font-mono text-[8px] uppercase text-muted-foreground">
              {modeLabel}
            </Badge>
          </div>
        </div>
        <div className="workspace-overlay-no-drag flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onModeToggle}
            className="border border-border/60 bg-background/60 text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            data-testid="workspace-overlay-mode-toggle"
            title={modeToggleLabel}
            aria-label={modeToggleLabel}
          >
            {floating ? <PanelRightClose className="size-4" /> : <PictureInPicture2 className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            title={closeLabel}
            aria-label={closeLabel}
          >
            <X />
          </Button>
        </div>
      </header>
      {children}
    </>
  )
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<PixelSize>(() => getViewportSize())

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const update = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height })
      } else {
        setSize(getViewportSize())
      }
    }

    update()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(node)
    window.addEventListener("resize", update)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  return [ref, size] as const
}

function getViewportSize(): PixelSize {
  if (typeof window === "undefined") return { width: 1280, height: 720 }
  return {
    width: Math.max(window.innerWidth, MIN_OVERLAY_WIDTH + FLOATING_MARGIN * 2),
    height: Math.max(window.innerHeight, MIN_OVERLAY_HEIGHT + FLOATING_MARGIN * 2),
  }
}

function getFloatingLimits(layerSize: PixelSize) {
  const layerWidth = Math.max(layerSize.width, MIN_OVERLAY_WIDTH + FLOATING_MARGIN * 2)
  const layerHeight = Math.max(layerSize.height, MIN_OVERLAY_HEIGHT + FLOATING_MARGIN * 2)
  const availableWidth = Math.max(MIN_OVERLAY_WIDTH, layerWidth - FLOATING_MARGIN * 2)
  const availableHeight = Math.max(MIN_OVERLAY_HEIGHT, layerHeight - FLOATING_MARGIN * 2)
  return {
    layerWidth,
    layerHeight,
    availableWidth,
    availableHeight,
    maxWidth: availableWidth,
    maxHeight: availableHeight,
  }
}

function getFloatingSize(
  layerSize: PixelSize,
  metrics: OverlayFloatingMetrics,
  liveSize: PixelSize | null,
): PixelSize {
  if (liveSize) return liveSize
  const limits = getFloatingLimits(layerSize)
  return {
    width: clampPixel(limits.availableWidth * metrics.widthRatio, MIN_OVERLAY_WIDTH, limits.maxWidth),
    height: clampPixel(limits.availableHeight * metrics.heightRatio, MIN_OVERLAY_HEIGHT, limits.maxHeight),
  }
}

function getFloatingPosition(
  layerSize: PixelSize,
  size: PixelSize,
  metrics: OverlayFloatingMetrics,
  livePosition: PixelPosition | null,
): PixelPosition {
  if (livePosition) return clampFloatingPosition(layerSize, size, livePosition)
  const limits = getFloatingLimits(layerSize)
  const maxX = Math.max(0, limits.layerWidth - size.width - FLOATING_MARGIN * 2)
  const maxY = Math.max(0, limits.layerHeight - size.height - FLOATING_MARGIN * 2)
  return {
    x: FLOATING_MARGIN + maxX * clampUnit(metrics.xRatio),
    y: FLOATING_MARGIN + maxY * clampUnit(metrics.yRatio),
  }
}

function clampFloatingPosition(layerSize: PixelSize, size: PixelSize, position: PixelPosition): PixelPosition {
  const limits = getFloatingLimits(layerSize)
  const maxX = Math.max(FLOATING_MARGIN, limits.layerWidth - size.width - FLOATING_MARGIN)
  const maxY = Math.max(FLOATING_MARGIN, limits.layerHeight - size.height - FLOATING_MARGIN)
  return {
    x: clampPixel(position.x, FLOATING_MARGIN, maxX),
    y: clampPixel(position.y, FLOATING_MARGIN, maxY),
  }
}

function sizeToRatios(layerSize: PixelSize, size: PixelSize): Pick<OverlayFloatingMetrics, "widthRatio" | "heightRatio"> {
  const limits = getFloatingLimits(layerSize)
  return {
    widthRatio: clampRatio(size.width / limits.availableWidth, MIN_OVERLAY_WIDTH / limits.availableWidth),
    heightRatio: clampRatio(size.height / limits.availableHeight, MIN_OVERLAY_HEIGHT / limits.availableHeight),
  }
}

function positionToRatios(
  layerSize: PixelSize,
  size: PixelSize,
  position: PixelPosition,
): Pick<OverlayFloatingMetrics, "xRatio" | "yRatio"> {
  const limits = getFloatingLimits(layerSize)
  const maxX = Math.max(0, limits.layerWidth - size.width - FLOATING_MARGIN * 2)
  const maxY = Math.max(0, limits.layerHeight - size.height - FLOATING_MARGIN * 2)
  return {
    xRatio: maxX > 0 ? clampUnit((position.x - FLOATING_MARGIN) / maxX) : 0,
    yRatio: maxY > 0 ? clampUnit((position.y - FLOATING_MARGIN) / maxY) : 0,
  }
}

function clampPixel(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampUnit(value: number): number {
  return clampRatio(value, 0)
}

function clampRatio(value: number, min: number): number {
  return Math.min(1, Math.max(min, value))
}
