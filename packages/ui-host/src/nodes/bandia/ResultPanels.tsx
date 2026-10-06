import { useEffect, useMemo, useState } from "react"
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table"
import { getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table"
import type { BandiaData, BandiaPathMapping } from "@xiranite/node-bandia/core"
import { Archive, CheckCircle2, Copy, FileArchive, FolderOpen, ListChecks, XCircle } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { BandiaMode } from "./types"

type BandiaResultRow = {
  command: string
  duration: number
  error: string
  id: string
  kind: "extract" | "compress" | "export" | "mapping"
  source: string
  status: "ok" | "fail" | "skipped" | "mapped"
  target: string
}

export function StatsPanel(props: {
  archiveCount: number
  mappingCount: number
  pathCount: number
  progress: number
  result: BandiaData | null
}) {
  const done = (props.result?.extractedCount ?? 0) + (props.result?.compressedCount ?? 0)
  const stats = [
    ["Input", props.archiveCount || props.pathCount],
    ["Mapping", props.result?.pathMappings.length ?? props.mappingCount],
    ["Done", done],
    ["Failed", props.result?.failedCount ?? 0],
    ["Progress", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-5 gap-1">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "Failed" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export function QueuePreview(props: {
  archivePaths: string[]
  compact?: boolean
  mappings: BandiaPathMapping[]
  mode: BandiaMode
  paths: string[]
  result: BandiaData | null
}) {
  const isExtract = props.mode === "extract"
  const items = isExtract
    ? props.archivePaths.map((path) => ({ source: path, target: "", ok: resultOk(props.result, path) }))
    : queueMappings(props).map((mapping) => ({ source: mapping.extractedPath, target: mapping.archivePath, ok: resultOk(props.result, mapping.extractedPath) }))
  const Icon = isExtract ? FileArchive : FolderOpen

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <div className="truncate text-xs font-medium">{isExtract ? "Archive queue" : "Mapping queue"}</div>
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {items.length ? (
          <div className="grid gap-1 p-2">
            {items.slice(0, 120).map((item, index) => (
              <div key={`${item.source}:${item.target}:${index}`} className="grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted/45">
                <div className="flex min-w-0 items-center gap-2">
                  {item.ok === true ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  ) : item.ok === false ? (
                    <XCircle className="size-3.5 shrink-0 text-destructive" />
                  ) : (
                    <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                  )}
                  <span className="truncate text-xs font-medium">{basename(item.source)}</span>
                </div>
                {item.target && (
                  <div className="truncate pl-7 text-[11px] text-muted-foreground">{"->"} {basename(item.target)}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-24 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {isExtract ? "Paste archive paths to build an extraction queue." : "Paste source paths or mappings to build a compression queue."}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export function ResultTabs(props: {
  archivePaths?: string[]
  compact?: boolean
  logs: string[]
  mappings?: BandiaPathMapping[]
  mode?: BandiaMode
  paths?: string[]
  result: BandiaData | null
  running?: boolean
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const hasQueue = Boolean(props.mode)
  const resultRows = createResultRows(props.result)
  const preferredTab = props.running
    ? "queue"
    : resultRows.length || props.result
      ? "results"
      : props.logs.length
        ? "logs"
        : "queue"
  const [tab, setTab] = useState(hasQueue ? preferredTab : "results")

  useEffect(() => {
    setTab(hasQueue ? preferredTab : "results")
  }, [hasQueue, preferredTab])

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        {hasQueue && <TabsTrigger value="queue">Queue</TabsTrigger>}
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>
      {hasQueue && (
        <TabsContent value="queue" className="min-h-0 flex-1">
          <QueuePreview
            compact={props.compact}
            archivePaths={props.archivePaths ?? []}
            mappings={props.mappings ?? []}
            mode={props.mode ?? "extract"}
            paths={props.paths ?? []}
            result={props.result}
          />
        </TabsContent>
      )}
      <TabsContent value="results" className="min-h-0 flex-1">
        <ResultTablePanel compact={props.compact} rows={resultRows} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <TextPanel compact={props.compact} emptyText="Run logs will appear here." icon={Archive} lines={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function ResultTablePanel(props: {
  compact?: boolean
  rows: BandiaResultRow[]
  onCopy: () => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const columns = useMemo<ColumnDef<BandiaResultRow>[]>(() => [
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      enableColumnFilter: true,
      filterFn: optionArrayFilter,
      meta: {
        label: "Status",
        variant: "multiSelect",
        options: [
          { label: "ok", value: "ok" },
          { label: "fail", value: "fail" },
          { label: "skipped", value: "skipped" },
          { label: "mapped", value: "mapped" },
        ],
      },
    },
    {
      accessorKey: "kind",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Kind" />,
      cell: ({ row }) => <span className="text-xs">{row.original.kind}</span>,
      enableColumnFilter: true,
      filterFn: optionArrayFilter,
      meta: {
        label: "Kind",
        variant: "multiSelect",
        options: [
          { label: "extract", value: "extract" },
          { label: "compress", value: "compress" },
          { label: "export", value: "export" },
          { label: "mapping", value: "mapping" },
        ],
      },
    },
    {
      accessorKey: "source",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Source" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-xs font-medium" title={row.original.source}>{basename(row.original.source)}</div>
          <div className="truncate text-[10px] text-muted-foreground" title={row.original.source}>{row.original.source}</div>
        </div>
      ),
      enableColumnFilter: true,
      meta: {
        label: "Source",
        placeholder: "Filter sources...",
        variant: "text",
      },
    },
    {
      accessorKey: "target",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Target" />,
      cell: ({ row }) => row.original.target ? (
        <div className="min-w-0">
          <div className="truncate text-xs" title={row.original.target}>{basename(row.original.target)}</div>
          <div className="truncate text-[10px] text-muted-foreground" title={row.original.target}>{row.original.target}</div>
        </div>
      ) : <span className="text-xs text-muted-foreground">-</span>,
      enableColumnFilter: true,
      meta: {
        label: "Target",
        placeholder: "Filter targets...",
        variant: "text",
      },
    },
    {
      accessorKey: "error",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Error" />,
      cell: ({ row }) => row.original.error ? (
        <span className="line-clamp-2 text-xs text-destructive" title={row.original.error}>{row.original.error}</span>
      ) : <span className="text-xs text-muted-foreground">-</span>,
      enableColumnFilter: true,
      meta: {
        label: "Error",
        placeholder: "Filter errors...",
        variant: "text",
      },
    },
  ], [])
  const table = useReactTable({
    data: props.rows,
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
        pageIndex: 0,
        pageSize: props.compact ? 8 : 12,
      },
    },
  })

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" />
          <span>{props.rows.length ? `${props.rows.length} row(s)` : "Waiting for a run"}</span>
        </div>
        <Button disabled={!props.rows.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          Copy
        </Button>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <DataTable table={table} className="h-full min-h-0" data-testid="bandia-result-data-table">
          <DataTableToolbar table={table} className="p-0 pb-2" />
        </DataTable>
      </div>
    </section>
  )
}

function TextPanel(props: {
  compact?: boolean
  emptyText: string
  icon: typeof ListChecks
  lines: string[]
  onCopy: () => void
}) {
  const Icon = props.icon
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{props.lines.length ? `${props.lines.length} line(s)` : "Waiting for a run"}</span>
        </div>
        <Button disabled={!props.lines.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          Copy
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className={props.compact ? "whitespace-pre-wrap p-2 text-xs leading-5 text-muted-foreground" : "whitespace-pre-wrap p-3 text-xs leading-5 text-muted-foreground"}>
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {props.emptyText}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function StatusBadge({ status }: { status: BandiaResultRow["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-[10px]",
        status === "ok" && "border-primary/40 text-primary",
        status === "fail" && "border-destructive/40 text-destructive",
        status === "skipped" && "text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  )
}

function queueMappings(props: {
  mappings: BandiaPathMapping[]
  paths: string[]
}): BandiaPathMapping[] {
  if (props.mappings.length) return props.mappings
  return props.paths.map((path) => ({ archivePath: `${path}.zip`, extractedPath: path }))
}

function resultOk(result: BandiaData | null, sourcePath: string): boolean | undefined {
  const match = result?.results.find((item) => item.sourcePath === sourcePath)
  return match?.success
}

function createResultRows(result: BandiaData | null): BandiaResultRow[] {
  const mappings = (result?.pathMappings ?? []).map((mapping, index) => ({
    command: "",
    duration: 0,
    error: "",
    id: `mapping:${index}:${mapping.archivePath}:${mapping.extractedPath}`,
    kind: "mapping" as const,
    source: mapping.archivePath,
    status: "mapped" as const,
    target: mapping.extractedPath,
  }))
  const rows = (result?.results ?? []).map((item, index) => ({
    command: item.command ?? "",
    duration: item.durationMs,
    error: item.error ?? "",
    id: `result:${index}:${item.sourcePath}:${item.archivePath ?? item.outputPath ?? ""}`,
    kind: item.kind,
    source: item.sourcePath,
    status: item.skipped ? "skipped" as const : item.success ? "ok" as const : "fail" as const,
    target: item.outputPath ?? item.archivePath ?? "",
  }))
  return [...mappings, ...rows]
}

function optionArrayFilter(row: { getValue: (columnId: string) => unknown }, columnId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return true
  return value.includes(String(row.getValue(columnId)))
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}
