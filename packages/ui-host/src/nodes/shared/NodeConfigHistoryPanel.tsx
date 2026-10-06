import { useEffect, useState } from "react"
import { Check, Clock3, RotateCcw } from "lucide-react"
import { Diff, Hunk, parseDiff } from "react-diff-view"
import "react-diff-view/style/index.css"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { NodeConfigHistoryAdapter, NodeConfigPopoverProps } from "./NodeConfigPopover"

export default function NodeConfigHistoryPanel(props: { adapter: NodeConfigHistoryAdapter; t: NodeConfigPopoverProps["t"] }) {
  const [versions, setVersions] = useState<Awaited<ReturnType<NodeConfigHistoryAdapter["list"]>>["versions"]>([])
  const [selectedRevision, setSelectedRevision] = useState<string | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<NodeConfigHistoryAdapter["inspect"]>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void props.adapter.list({ limit: 100 }).then((result) => {
      if (!active) return
      setVersions(result.versions)
      setSelectedRevision((current) => current ?? result.versions[0]?.revision ?? null)
      setLoading(false)
    }, (reason) => {
      if (!active) return
      setError(errorMessage(reason))
      setLoading(false)
    })
    return () => { active = false }
  }, [props.adapter])

  useEffect(() => {
    if (!selectedRevision) {
      setDetail(null)
      return
    }
    let active = true
    setError(null)
    void props.adapter.inspect(selectedRevision).then((result) => {
      if (active) setDetail(result)
    }, (reason) => {
      if (active) setError(errorMessage(reason))
    })
    return () => { active = false }
  }, [props.adapter, selectedRevision])

  async function restoreSelected() {
    if (!selectedRevision) return
    setRestoring(true)
    setError(null)
    try {
      await props.adapter.restore(selectedRevision)
      const result = await props.adapter.list({ limit: 100 })
      setVersions(result.versions)
      setSelectedRevision(result.versions[0]?.revision ?? null)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setRestoring(false)
    }
  }

  if (loading) return <Message>{props.t("config.history.loading", "Loading history...")}</Message>
  if (!versions.length) return <Message>{props.t("config.history.empty", "No configuration changes have been recorded yet.")}</Message>

  return <div className="grid h-full min-h-0 overflow-hidden rounded-md border lg:grid-cols-[280px_minmax(0,1fr)]">
    <ScrollArea className="min-h-44 border-b lg:border-r lg:border-b-0">
      <div className="space-y-1 p-2">
        {versions.map((version) => <button
          key={version.revision}
          type="button"
          className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted data-[active=true]:bg-muted"
          data-active={selectedRevision === version.revision}
          onClick={() => setSelectedRevision(version.revision)}
        >
          <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{version.message}</span>
            <span className="block text-xs text-muted-foreground">{formatDate(version.createdAt)} · {version.revision.slice(0, 8)}</span>
            {version.fields.length ? <span className="mt-1 block truncate text-xs text-muted-foreground">{version.fields.join(", ")}</span> : null}
          </span>
          {selectedRevision === version.revision ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
        </button>)}
      </div>
    </ScrollArea>
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 p-3">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{detail?.message ?? props.t("config.history.detail", "Change detail")}</div><div className="text-xs text-muted-foreground">{detail?.source}</div></div>
        <Button disabled={!detail || restoring} size="sm" variant="outline" onClick={() => void restoreSelected()}><RotateCcw />{props.t("config.history.restore", "Restore this version")}</Button>
      </div>
      <Separator />
      {error ? <p role="alert" className="p-4 text-sm text-destructive">{error}</p> : null}
      <ScrollArea className="min-h-0 flex-1 bg-muted/10">
        {detail ? <DiffView patch={detail.patch} emptyLabel={props.t("config.history.noTextChanges", "No textual changes in this backup.")} /> : <Message>{props.t("config.history.select", "Select a version.")}</Message>}
      </ScrollArea>
    </div>
  </div>
}

function DiffView({ patch, emptyLabel }: { patch: string; emptyLabel: string }) {
  const files = parseDiff(patch)
  if (!files.length) return <Message>{emptyLabel}</Message>
  return <div className="min-w-max p-3 text-xs">{files.map((file) => <Diff key={`${file.oldRevision}-${file.newRevision}`} viewType="unified" diffType={file.type} hunks={file.hunks}>{(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}</Diff>)}</div>
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">{children}</div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
