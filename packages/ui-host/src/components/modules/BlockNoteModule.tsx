import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { PartialBlock } from "@blocknote/core"
import { Skeleton } from "@/components/ui/skeleton"
import { useComponentData } from "@/hooks/useComponentData"
import type { ModuleProps } from "./ModuleRenderer"

const BlockNoteEditor = lazy(() => import("./BlockNoteEditor"))

interface BlockNoteData {
  doc?: PartialBlock[]
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export default function BlockNoteModule({ compId }: ModuleProps) {
  const { t } = useTranslation()
  const [data, setData] = useComponentData<BlockNoteData>(compId)
  const [editorRequested, setEditorRequested] = useState(false)

  useEffect(() => {
    if (editorRequested || typeof window === "undefined") return undefined

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setEditorRequested(true), { timeout: 800 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }

    const handle = window.setTimeout(() => setEditorRequested(true), 120)
    return () => window.clearTimeout(handle)
  }, [editorRequested])

  const handleDocChange = useCallback((doc: PartialBlock[]) => {
    setData({ doc })
  }, [setData])

  return (
    <Suspense fallback={<BlockNoteLoading onActivate={() => setEditorRequested(true)} />}>
      {editorRequested
        ? <BlockNoteEditor doc={data.doc} onDocChange={handleDocChange} />
        : <BlockNoteLoading onActivate={() => setEditorRequested(true)} label={t("module:blocknote.loadEditor")} />}
    </Suspense>
  )
}

function BlockNoteLoading({ label, onActivate }: { label?: string; onActivate(): void }) {
  const { t } = useTranslation()
  const text = label ?? t("module:blocknote.loading")

  return (
    <button
      type="button"
      className="flex h-full w-full flex-col gap-3 overflow-hidden p-4 text-left"
      onClick={onActivate}
      onFocus={onActivate}
      aria-label={text}
      title={text}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-2.5 w-20 rounded-sm" />
        <Skeleton className="h-2.5 w-10 rounded-sm" />
      </div>
      <Skeleton className="h-4 w-2/3 rounded-sm" />
      <Skeleton className="h-3 w-full rounded-sm" />
      <Skeleton className="h-3 w-5/6 rounded-sm" />
      <Skeleton className="h-3 w-3/5 rounded-sm" />
      <span className="mt-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {text}
      </span>
    </button>
  )
}
