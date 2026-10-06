import { lazy, Suspense, useCallback, type DragEvent as ReactDragEvent } from "react"
import { useTranslation } from "react-i18next"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { cn } from "@/lib/utils"

const FlowCanvasView = lazy(() =>
  import("./FlowCanvasView").then((module) => ({ default: module.FlowCanvasView })),
)

function FlowCanvasLoading({ label }: { label?: string }) {
  const { t } = useTranslation()
  const text = label ?? t("view:flow.loadingCanvas")

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col overflow-hidden p-5 text-left"
      aria-label={text}
    >
      <div className="relative h-full w-full overflow-hidden rounded-md border border-border/60 bg-card/60">
        <div className="absolute left-10 top-10 h-52 w-72 rounded-md border border-border/50 bg-background/70 p-3 shadow-sm">
          <Skeleton className="mb-3 h-3 w-24 rounded-sm" />
          <Skeleton className="h-24 w-full rounded-sm" />
          <Skeleton className="mt-3 h-2.5 w-2/3 rounded-sm" />
        </div>
        <div className="absolute left-[24rem] top-32 h-48 w-72 rounded-md border border-border/50 bg-background/70 p-3 shadow-sm">
          <Skeleton className="mb-3 h-3 w-20 rounded-sm" />
          <Skeleton className="h-20 w-full rounded-sm" />
          <Skeleton className="mt-3 h-2.5 w-3/4 rounded-sm" />
        </div>
        <div className="absolute left-64 top-24 h-px w-32 rotate-12 bg-border/70" />
        <span className="xiranite-ui-copy absolute bottom-4 left-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {text}
        </span>
      </div>
    </div>
  )
}

export function FlowView() {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const handleDropModule = useCallback((moduleId: string, event: ReactDragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const clientX = Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2
    const clientY = Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2
    workspaceActions.deployComponent(moduleId, {
      viewMode: "flow",
      flowPosition: {
        x: Math.max(0, Math.round(clientX - rect.left - 192)),
        y: Math.max(0, Math.round(clientY - rect.top - 160)),
      },
    })
  }, [workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)

  return (
    <div
      className={cn(
        "relative flex-1 min-h-0 w-full ws-canvas-bg transition-colors",
        isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      data-testid="flow-drop-target"
      {...moduleDropHandlers}
    >
      {isModuleOver && (
        <div
          data-testid="flow-drop-shield"
          className="absolute inset-0 z-20"
          {...moduleDropHandlers}
        >
          <ModuleDropHint label={t("registry:dropHint")} />
        </div>
      )}
      <Suspense fallback={<FlowCanvasLoading />}>
        <FlowCanvasView />
      </Suspense>
    </div>
  )
}

function ModuleDropHint({ label }: { label: string }) {
  return (
    <div className="xiranite-ui-copy pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-sm border border-primary/40 bg-card/95 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary shadow-sm">
      {label}
    </div>
  )
}
