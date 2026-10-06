import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Skeleton } from "@/components/ui/skeleton"
import type { ModuleProps } from "./ModuleRenderer"

const ThemeSettings = lazy(() =>
  import("@/components/views/ThemeSettings").then((m) => ({ default: m.ThemeSettings })),
)
const ModuleRegistryView = lazy(() =>
  import("@/components/views/ModuleRegistry").then((m) => ({ default: m.ModuleRegistry })),
)
const NodeRunHistoryView = lazy(() =>
  import("@/components/views/NodeRunHistoryView").then((m) => ({ default: m.NodeRunHistoryView })),
)
const NodeOperationMonitor = lazy(() =>
  import("@/components/views/NodeOperationMonitor").then((m) => ({ default: m.NodeOperationMonitor })),
)

function OverlayViewLoading() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-8 w-36 rounded-sm" />
      <Skeleton className="h-20 w-full rounded-sm" />
      <Skeleton className="h-20 w-11/12 rounded-sm" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {t("common:loading")}
      </span>
    </div>
  )
}

/** 主题/通用设置卡片 */
export function SettingsModule(_: ModuleProps) {
  return (
    <Suspense fallback={<OverlayViewLoading />}>
      <ThemeSettings />
    </Suspense>
  )
}

/** 模块库卡片 */
export function ModuleRegistryModule(_: ModuleProps) {
  return (
    <Suspense fallback={<OverlayViewLoading />}>
      <ModuleRegistryView />
    </Suspense>
  )
}

/** 运行历史卡片 */
export function NodeHistoryModule(_: ModuleProps) {
  return (
    <Suspense fallback={<OverlayViewLoading />}>
      <NodeRunHistoryView />
    </Suspense>
  )
}

/** 节点运行监控卡片 */
export function NodeOperationsModule(_: ModuleProps) {
  return (
    <Suspense fallback={<OverlayViewLoading />}>
      <NodeOperationMonitor />
    </Suspense>
  )
}
