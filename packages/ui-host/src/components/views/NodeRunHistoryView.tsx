import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table"
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  Copy,
  Eye,
  History,
  Loader2,
  Trash2,
} from "lucide-react"
import type { NodeRunHistoryItemDTO, NodeRunHistoryStatusDTO } from "@xiranite/shared"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { OverlayViewShell } from "@/components/workspace/OverlayViewShell"
import { useClearNodeRunHistory, useDeleteNodeRunHistory, useNodeRunHistory } from "@/hooks/useNodeRunHistory"
import { cn } from "@/lib/utils"
import { StatusMark } from "@/components/ui/status-mark"

const STATUS_ICON: Record<NodeRunHistoryStatusDTO, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: CircleAlert,
  cancelled: CircleSlash,
}

const STATUS_CLASS: Record<NodeRunHistoryStatusDTO, string> = {
  success: "border-primary/40 text-primary",
  error: "border-destructive/40 text-destructive",
  cancelled: "text-muted-foreground",
}

const STATUS_OPTIONS = [
  { label: "success", value: "success" },
  { label: "error", value: "error" },
  { label: "cancelled", value: "cancelled" },
]

export function NodeRunHistoryView() {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<SortingState>([{ id: "finishedAt", desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const historyQuery = useNodeRunHistory({ limit: 200 })
  const deleteMutation = useDeleteNodeRunHistory()
  const clearMutation = useClearNodeRunHistory()
  const items = historyQuery.data?.items ?? []
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null

  async function copyInput(item: NodeRunHistoryItemDTO) {
    try {
      await navigator.clipboard.writeText(formatJson(item.input ?? null))
      setCopiedId(item.id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Clipboard access can be blocked by browser permissions.
    }
  }

  function deleteItem(item: NodeRunHistoryItemDTO) {
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        if (selectedId === item.id) setSelectedId(null)
      },
    })
  }

  async function clearAll() {
    await clearMutation.mutateAsync({})
    setSelectedId(null)
  }

  const columns = useMemo<ColumnDef<NodeRunHistoryItemDTO>[]>(() => [
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.statusLabel")} />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      enableColumnFilter: true,
      filterFn: optionArrayFilter,
      meta: {
        label: t("view:history.statusLabel"),
        variant: "multiSelect",
        options: STATUS_OPTIONS.map((option) => ({
          ...option,
          label: t(`view:history.status.${option.value}`),
        })),
      },
    },
    {
      accessorKey: "finishedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.finishedAt")} />,
      cell: ({ row }) => (
        <div className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {formatTime(row.original.finishedAt)}
        </div>
      ),
    },
    {
      accessorKey: "nodeId",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.nodeId")} />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.nodeId}</span>,
      enableColumnFilter: true,
      meta: {
        label: t("view:history.nodeId"),
        placeholder: t("view:history.filterNode"),
        variant: "text",
      },
    },
    {
      accessorKey: "inputSummary",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.inputSummary")} />,
      cell: ({ row }) => (
        <div className="max-w-[32rem] truncate text-xs" title={row.original.inputSummary || undefined}>
          {row.original.inputSummary || <span className="text-muted-foreground">{t("view:history.noInputSummary")}</span>}
        </div>
      ),
      enableColumnFilter: true,
      meta: {
        label: t("view:history.inputSummary"),
        placeholder: t("view:history.filterInput"),
        variant: "text",
      },
    },
    {
      accessorKey: "message",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.message")} />,
      cell: ({ row }) => (
        <div className="max-w-[24rem] truncate text-xs text-muted-foreground" title={row.original.message}>
          {row.original.message}
        </div>
      ),
      enableColumnFilter: true,
      meta: {
        label: t("view:history.message"),
        placeholder: t("view:history.filterMessage"),
        variant: "text",
      },
    },
    {
      accessorKey: "durationMs",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t("view:history.durationLabel")} />,
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("view:history.duration", { ms: row.original.durationMs })}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("view:history.actions")}</span>,
      cell: ({ row }) => {
        const item = row.original
        const deleting = deleteMutation.isPending && deleteMutation.variables === item.id
        const copied = copiedId === item.id

        return (
          <div className="flex justify-end gap-1">
            <Button
              aria-label={t("view:history.copyInput")}
              disabled={item.input === undefined || item.input === null}
              size="icon-sm"
              title={copied ? t("view:history.copied") : t("view:history.copyInput")}
              variant="ghost"
              onClick={() => void copyInput(item)}
            >
              {copied ? <CheckCircle2 /> : <Copy />}
            </Button>
            <Button
              aria-label={t("view:history.viewDetail")}
              size="icon-sm"
              title={t("view:history.viewDetail")}
              variant={selectedId === item.id ? "outline" : "ghost"}
              onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
            >
              <Eye />
            </Button>
            <Button
              aria-label={t("view:history.delete")}
              disabled={deleting}
              size="icon-sm"
              title={t("view:history.delete")}
              variant="ghost"
              onClick={() => deleteItem(item)}
            >
              {deleting ? <StatusMark status="running" size={16} /> : <Trash2 />}
            </Button>
          </div>
        )
      },
      enableHiding: false,
    },
  ], [copiedId, deleteMutation.isPending, deleteMutation.variables, selectedId, t])

  const table = useReactTable({
    data: items,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  return (
    <OverlayViewShell
      header={
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("view:history.title")}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{t("view:history.subtitle")}</p>
          </div>
          <Button
            disabled={clearMutation.isPending || items.length === 0}
            size="sm"
            variant="outline"
            onClick={() => void clearAll()}
          >
            {clearMutation.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            {t("view:history.clearAll")}
          </Button>
        </div>
      }
      bodyClassName="px-4 py-4"
    >
      {historyQuery.isLoading ? (
        <div className="flex h-full min-h-60 items-center justify-center text-sm text-muted-foreground">
          <StatusMark className="mr-2" status="running" size={16} />
          {t("view:history.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full min-h-60 flex-col items-center justify-center text-center">
          <History className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t("view:history.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground/60">{t("view:history.emptyHint")}</p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <DataTable table={table} className="min-h-0" data-testid="node-run-history-data-table">
            <DataTableToolbar table={table} className="p-0 pb-2" />
          </DataTable>
          {selectedItem && <HistoryDetail item={selectedItem} />}
        </div>
      )}
    </OverlayViewShell>
  )
}

function HistoryDetail({ item }: { item: NodeRunHistoryItemDTO }) {
  const { t } = useTranslation()
  const stats = isNumberRecord(item.result?.stats) ? item.result.stats : undefined
  const outputPath = item.result?.outputPath

  return (
    <section className="flex max-h-[22rem] min-h-0 flex-col rounded-md border bg-background/70">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.nodeId}</div>
          <div className="truncate text-[11px] text-muted-foreground">{item.inputSummary || item.message}</div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <Separator />
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-2">
        <DetailSection label={t("view:history.input")}>
          {item.input === undefined || item.input === null ? (
            <p className="text-xs text-muted-foreground">{t("view:history.noInput")}</p>
          ) : (
            <pre className="max-h-52 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
              {formatJson(item.input)}
            </pre>
          )}
        </DetailSection>
        <DetailSection label={t("view:history.result")}>
          {item.result === undefined || item.result === null ? (
            <p className="text-xs text-muted-foreground">{t("view:history.noResult")}</p>
          ) : (
            <pre className="max-h-52 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
              {formatJson(item.result)}
            </pre>
          )}
        </DetailSection>
        <DetailSection label={t("view:history.metadata")}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <MetaField label={t("view:history.componentId")} value={item.componentId ?? "-"} />
            <MetaField label={t("view:history.workspaceId")} value={item.workspaceId ?? "-"} />
            <MetaField label={t("view:history.events", { count: item.eventCount })} value={String(item.eventCount)} />
            <MetaField label={t("view:history.durationLabel")} value={t("view:history.duration", { ms: item.durationMs })} />
          </div>
        </DetailSection>
        {(stats || outputPath) && (
          <DetailSection label={t("view:history.output")}>
            <div className="flex flex-col gap-2">
              {outputPath && <code className="break-all rounded-md bg-muted/40 p-2 text-[11px]">{outputPath}</code>}
              {stats && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {Object.entries(stats).map(([key, value]) => (
                    <MetaField key={key} label={key} value={String(value)} />
                  ))}
                </div>
              )}
            </div>
          </DetailSection>
        )}
      </div>
    </section>
  )
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1">
      <div className="truncate text-[9px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-[11px] text-foreground" title={value}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: NodeRunHistoryStatusDTO }) {
  const { t } = useTranslation()
  const Icon = STATUS_ICON[status]
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5 text-[10px]", STATUS_CLASS[status])}>
      <Icon />
      {t(`view:history.status.${status}`)}
    </Badge>
  )
}

function optionArrayFilter(row: { getValue: (columnId: string) => unknown }, columnId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return true
  return value.includes(String(row.getValue(columnId)))
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === "number")
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}
