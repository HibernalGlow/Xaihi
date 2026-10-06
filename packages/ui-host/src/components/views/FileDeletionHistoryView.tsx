import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"
import {
  ArchiveRestore,
  CircleAlert,
  Clock3,
  Download,
  FileJson,
  FileText,
  Loader2,
  RotateCcw,
  TableProperties,
  Trash2,
  XCircle,
} from "lucide-react"
import type {
  FileDeletionQuery,
  FileDeletionRecord,
  FileDeletionState,
} from "@xiranite/api/client"
import { StatusMark } from "@/components/ui/status-mark"
import { downloadFileDeletionHistory } from "@/backend/fileDeletionClient"
import { OverlayViewShell } from "@/components/workspace/OverlayViewShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFileDeletionNodes, useFileDeletions, useRestoreFileDeletion } from "@/hooks/useFileDeletions"
import { cn } from "@/lib/utils"

type HistoryFilter = "all" | "recoverable" | FileDeletionState

const FILTERS: HistoryFilter[] = [
  "all",
  "recoverable",
  "pending",
  "trashed",
  "restored",
  "permanent",
  "delete-failed",
  "restore-failed",
]

const STATE_CLASS: Record<FileDeletionState, string> = {
  pending: "border-sky-500/35 text-sky-600 dark:text-sky-400",
  trashed: "border-emerald-500/35 text-emerald-600 dark:text-emerald-400",
  restored: "border-primary/35 text-primary",
  permanent: "border-muted-foreground/30 text-muted-foreground",
  "delete-failed": "border-destructive/40 text-destructive",
  "restore-failed": "border-amber-500/40 text-amber-700 dark:text-amber-400",
}

export function FileDeletionHistoryView() {
  const { t } = useTranslation()
  const [nodeId, setNodeId] = useState("all")
  const [filter, setFilter] = useState<HistoryFilter>("all")
  const query = useMemo(() => deletionQuery(nodeId, filter), [filter, nodeId])
  const history = useFileDeletions(query)
  const nodes = useFileDeletionNodes()
  const restore = useRestoreFileDeletion()
  const items = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data?.pages],
  )

  const exportHistory = (format: "jsonl" | "csv" | "markdown") => {
    downloadFileDeletionHistory(format, query)
  }

  return (
    <OverlayViewShell
      bodyClassName="overflow-hidden"
      header={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground">{t("view:deletions.title")}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t("view:deletions.subtitle")}</p>
            </div>
            <div className="self-end min-[380px]:self-auto">
              <ExportMenu onExport={exportHistory} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <Select value={nodeId} onValueChange={setNodeId}>
              <SelectTrigger size="sm" className="w-full" aria-label={t("view:deletions.nodeFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="all">{t("view:deletions.allNodes")}</SelectItem>
                {(nodes.data ?? []).map((node) => <SelectItem key={node} value={node}>{node}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(value) => setFilter(value as HistoryFilter)}>
              <SelectTrigger size="sm" className="w-full" aria-label={t("view:deletions.stateFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>{t(`view:deletions.filters.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {restore.isError ? (
            <div className="flex items-start gap-2 border-l-2 border-destructive bg-destructive/5 px-2 py-1.5 text-xs text-destructive" role="alert">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{restore.error instanceof Error ? restore.error.message : t("view:deletions.restoreFailed")}</span>
            </div>
          ) : null}
        </div>
      }
    >
      {history.isLoading ? (
        <CenteredState icon={<StatusMark status="running" size={20} />} label={t("view:deletions.loading")} />
      ) : history.isError ? (
        <CenteredState icon={<CircleAlert />} label={t("view:deletions.loadFailed")} tone="danger" />
      ) : items.length === 0 ? (
        <CenteredState icon={<Trash2 />} label={t("view:deletions.empty")} />
      ) : (
        <Virtuoso
          className="h-full"
          data={items}
          computeItemKey={(_index, item) => item.id}
          endReached={() => {
            if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage()
          }}
          itemContent={(_index, item) => (
            <DeletionRow
              item={item}
              restoring={restore.isPending && restore.variables === item.id}
              onRestore={() => restore.mutate(item.id)}
            />
          )}
          components={{
            Footer: () => history.isFetchingNextPage ? (
              <div className="flex h-10 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-label={t("view:deletions.loadingMore")} />
              </div>
            ) : null,
          }}
          data-testid="file-deletion-history-list"
        />
      )}
    </OverlayViewShell>
  )
}

function DeletionRow({
  item,
  restoring,
  onRestore,
}: {
  item: FileDeletionRecord
  restoring: boolean
  onRestore(): void
}) {
  const { t } = useTranslation()
  return (
    <article className="border-b border-border/55 px-4 py-3" data-deletion-id={item.id}>
      <div className="flex flex-col gap-2 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="rounded-sm font-mono text-[9px]">{item.nodeId}</Badge>
          <Badge variant="outline" className={cn("rounded-sm text-[9px]", STATE_CLASS[item.state])}>
            {t(`view:deletions.states.${item.state}`)}
          </Badge>
          {item.restoreAvailable ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <ArchiveRestore className="size-3" />
              {t("view:deletions.undoAvailable")}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 self-end gap-1.5 px-2 text-[10px]"
          disabled={!item.restoreAvailable || restoring}
          onClick={onRestore}
          aria-label={t("view:deletions.restorePath", { path: item.sourcePath })}
          title={item.restoreAvailable ? t("view:deletions.restore") : t("view:deletions.restoreUnavailable")}
        >
          {restoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {t("view:deletions.restore")}
        </Button>
      </div>
      <div className="mt-2 break-all font-mono text-[11px] leading-5 text-foreground" title={item.sourcePath}>
        {item.sourcePath}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{formatTime(item.deletedAt)}</span>
        <span>{t(`view:deletions.kinds.${item.deletionKind}`)}</span>
        {item.pathKind ? <span>{t(`view:deletions.pathKinds.${item.pathKind}`)}</span> : null}
        {item.size !== undefined ? <span>{formatBytes(item.size)}</span> : null}
        {item.componentId ? <span className="font-mono">{item.componentId}</span> : null}
        {item.workspaceId ? <span className="font-mono">{item.workspaceId}</span> : null}
      </div>
      {item.lastError ? (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-destructive">
          <XCircle className="mt-0.5 size-3 shrink-0" />
          <span className="break-words">{item.lastError}</span>
        </div>
      ) : null}
    </article>
  )
}

function ExportMenu({ onExport }: { onExport(format: "jsonl" | "csv" | "markdown"): void }) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="shrink-0">
          <Download data-icon="inline-start" />
          {t("view:deletions.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport("markdown")}>
          <FileText />Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("csv")}>
          <TableProperties />CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("jsonl")}>
          <FileJson />JSONL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CenteredState({ icon, label, tone = "muted" }: { icon: ReactNode; label: string; tone?: "muted" | "danger" }) {
  return (
    <div className={cn(
      "flex h-full min-h-60 flex-col items-center justify-center gap-2 px-6 text-center text-sm",
      tone === "danger" ? "text-destructive" : "text-muted-foreground",
    )}>
      <span className="[&_svg]:size-5">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

function deletionQuery(nodeId: string, filter: HistoryFilter): Omit<FileDeletionQuery, "cursor" | "limit"> {
  return {
    nodeId: nodeId === "all" ? undefined : nodeId,
    state: filter !== "all" && filter !== "recoverable" ? filter : undefined,
    restoreAvailable: filter === "recoverable" ? true : undefined,
  }
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`
  const units = ["KB", "MB", "GB", "TB"]
  let size = value / 1_024
  let unit = 0
  while (size >= 1_024 && unit < units.length - 1) {
    size /= 1_024
    unit += 1
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}
