import { lazy, Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Skeleton } from "@/components/ui/skeleton"
import type { ModuleProps } from "./ModuleRenderer"

const DatabaseDataView = lazy(() => import("./DatabaseDataView"))

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export default function DatabaseModule(props: ModuleProps) {
  const { t } = useTranslation()
  const [viewRequested, setViewRequested] = useState(false)

  useEffect(() => {
    if (viewRequested || typeof window === "undefined") return undefined

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setViewRequested(true), { timeout: 900 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }

    const handle = window.setTimeout(() => setViewRequested(true), 160)
    return () => window.clearTimeout(handle)
  }, [viewRequested])

  return (
    <Suspense fallback={<DatabaseLoading onActivate={() => setViewRequested(true)} />}>
      {viewRequested
        ? <DatabaseDataView {...props} />
        : <DatabaseLoading onActivate={() => setViewRequested(true)} label={t("module:database.loadView")} />}
    </Suspense>
  )
}

function DatabaseLoading({ label, onActivate }: { label?: string; onActivate(): void }) {
  const { t } = useTranslation()
  const text = label ?? t("module:database.loadingView")

  return (
    <button
      type="button"
      className="flex h-full w-full flex-col gap-3 overflow-hidden bg-card p-4 text-left"
      onClick={onActivate}
      onFocus={onActivate}
      aria-label={text}
      title={text}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-16 rounded-sm" />
        <Skeleton className="h-7 w-14 rounded-sm" />
        <Skeleton className="h-7 w-20 rounded-sm" />
        <Skeleton className="ml-auto h-7 w-24 rounded-sm" />
      </div>
      <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_1fr] gap-2">
        <Skeleton className="h-5 rounded-sm" />
        <Skeleton className="h-5 rounded-sm" />
        <Skeleton className="h-5 rounded-sm" />
        <Skeleton className="h-5 rounded-sm" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-full rounded-sm" />
        <Skeleton className="h-8 w-full rounded-sm" />
        <Skeleton className="h-8 w-11/12 rounded-sm" />
      </div>
      <span className="mt-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {text}
      </span>
    </button>
  )
}
