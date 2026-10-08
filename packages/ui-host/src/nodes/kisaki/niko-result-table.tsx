import { useCallback, useDeferredValue, useMemo, useState } from "react"
import type { RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import { AlertTriangle, CircleStop, ClipboardCopy, Copy, ExternalLink, FolderOpen, ListFilter, PanelRight, RefreshCw } from "lucide-react"
import type { KisakiEntry, KisakiGroup, KisakiMusicCheckType } from "@hibernalglow/xaihi-kisaki/core"
import { DataTable } from "@/components/niko-table/core/data-table"
import { DataTableRoot } from "@/components/niko-table/core/data-table-root"
import { DataTableBody, DataTableHeader } from "@/components/niko-table/core/data-table-structure"
import { DataTableVirtualizedBody, DataTableVirtualizedHeader } from "@/components/niko-table/core/data-table-virtualized-structure"
import type { DataTableColumnDef } from "@/components/niko-table/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isLocalImagePath } from "@/nodes/shared/LocalImagePreview"
import { LocalImagePreviewDialog, type LocalImagePreviewItem } from "@/nodes/shared/LocalImagePreviewDialog"
import { getLocalMediaKind, isLocalAudioPath, LocalMediaPreview } from "@/nodes/shared/LocalMediaPreview"
import { LocalAudioPreviewDialog, type LocalAudioPreviewItem } from "@/nodes/shared/LocalAudioPreviewDialog"
import { LocalMediaPreviewPanel } from "@/nodes/shared/LocalMediaPreviewPanel"
import { isLocalVideoPath } from "@/nodes/shared/LocalVideoPreview"
import { LocalVideoPreviewDialog, type LocalVideoPreviewItem } from "@/nodes/shared/LocalVideoPreviewDialog"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { KisakiImageComparisonDialog } from "./image-comparison-dialog"
import type { KisakiResultColumn, KisakiResultTableProps } from "./result-table"

type ResultRow = { id: string; entry: KisakiEntry; group: KisakiGroup; indexInGroup: number }
type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string
const VIRTUALIZE_AT = 200

export function KisakiNikoResultTable(props: KisakiResultTableProps & { columns: readonly KisakiResultColumn[] }) {
  const { t } = useNodeI18n("kisaki")
  const [localFilter, setLocalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [activePreviewPath, setActivePreviewPath] = useState<string>()
  const filter = props.filterText ?? localFilter
  const deferredFilter = useDeferredValue(filter)
  const localizedColumns = useMemo(() => props.columns.map((item) => ({ ...item, label: t(`result.columns.${item.id}`, item.label) })), [props.columns, t])
  const rows = useMemo(() => buildRows(props.groups, localizedColumns, props.externalFiltering ? "" : deferredFilter), [deferredFilter, localizedColumns, props.externalFiltering, props.groups])
  const selectablePaths = useMemo(() => new Set(rows.filter((row) => !row.entry.isReference).map((row) => row.entry.path)), [rows])
  const rowSelection = useMemo<RowSelectionState>(() => Object.fromEntries(props.selectedPaths.filter((path) => selectablePaths.has(path)).map((path) => [path, true])), [props.selectedPaths, selectablePaths])
  const selectedSet = useMemo(() => new Set(props.selectedPaths), [props.selectedPaths])
  const imageItems = useMemo(() => buildImageItems(rows, t), [rows, t])
  const videoItems = useMemo(() => buildVideoItems(rows, t), [rows, t])
  const audioItems = useMemo(() => buildAudioItems(rows, props, t), [props, rows, t])
  const allPreviewItems = useMemo(() => [...imageItems, ...videoItems, ...audioItems], [audioItems, imageItems, videoItems])
  const panelOpen = Boolean(props.previewPanelEnabled && activePreviewPath && allPreviewItems.some((item) => item.path === activePreviewPath))
  const virtualized = rows.length >= VIRTUALIZE_AT

  const selectGroup = useCallback((group: KisakiGroup) => {
    const paths = group.entries.filter((entry) => !entry.isReference).map((entry) => entry.path)
    const allSelected = paths.length > 0 && paths.every((path) => selectedSet.has(path))
    props.onSelectionChange(allSelected ? props.selectedPaths.filter((path) => !paths.includes(path)) : unique([...props.selectedPaths, ...paths]))
  }, [props, selectedSet])

  const columns = useMemo<DataTableColumnDef<ResultRow>[]>(() => [
    {
      id: "select",
      size: 42,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => <Checkbox aria-label={t("result.selectAll", "选择全部结果")} checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false} onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)} />,
      cell: ({ row }) => <Checkbox aria-label={t("result.selectEntry", "选择 {{name}}", { name: row.original.entry.name })} disabled={row.original.entry.isReference} checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked === true)} />,
    },
    {
      id: "group",
      accessorFn: (row) => row.group.id,
      size: 76,
      header: t("result.group", "组"),
      cell: ({ row }) => {
        const item = row.original
        const paths = item.group.entries.filter((entry) => !entry.isReference).map((entry) => entry.path)
        const allSelected = paths.length > 0 && paths.every((path) => selectedSet.has(path))
        return <button type="button" className="flex items-center gap-1 font-mono" onClick={() => selectGroup(item.group)}><span className={cn("size-2 rounded-full", allSelected ? "bg-primary" : "bg-muted-foreground/40")} />{String(item.group.id + 1).padStart(2, "0")}{item.indexInGroup === 0 && item.group.entries.length > 1 ? <Badge variant="outline" className="h-4 px-1 text-[9px]">{item.group.entries.length}</Badge> : null}</button>
      },
    },
    {
      id: "name",
      accessorFn: (row) => row.entry.name,
      size: props.thumbnailEnabled === false ? 180 : 236,
      header: t("result.columns.name", "名称"),
      cell: ({ row }) => {
        const entry = row.original.entry
        const mediaKind = getLocalMediaKind(entry.path)
        const preview = <LocalMediaPreview path={entry.path} getFileUrl={props.getFileUrl} className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-background" />
        const openPreview = () => {
          if (mediaKind === "image" && props.imageComparison && !props.previewPanelEnabled) props.imageComparison.open(entry.path)
          else setActivePreviewPath(entry.path)
        }
        return <div className="flex min-w-0 items-center gap-2">{props.thumbnailEnabled === false ? null : mediaKind ? <button type="button" aria-label={mediaKind === "image" ? t("result.previewEntry", "预览 {{name}}", { name: entry.name }) : t("result.playEntry", "播放 {{name}}", { name: entry.name })} className="shrink-0" onClick={openPreview}>{preview}</button> : preview}<div className="min-w-0"><div className={cn("text-xs font-medium", props.wrapText ? "line-clamp-2 break-all" : "truncate")} title={entry.path}>{entry.name}</div>{entry.isReference ? <Badge variant="secondary" className="mt-0.5 h-4 px-1 text-[9px]">{t("result.reference", "参考")}</Badge> : null}</div></div>
      },
    },
    ...localizedColumns.filter((item) => item.id !== "name").map<DataTableColumnDef<ResultRow>>((item) => ({
      id: item.id,
      accessorFn: (row) => item.value(row.entry, row.group),
      size: columnSize(item.id),
      header: item.label,
      cell: ({ row }) => {
        const value = item.display?.(row.original.entry, row.original.group) ?? item.value(row.original.entry, row.original.group)
        const text = item.id === "path" && props.reversePathDisplay ? reversePath(String(value)) : String(value || "—")
        return <div className={cn("min-w-0 text-xs", props.wrapText ? "line-clamp-2 break-all" : "truncate", item.align === "right" && "text-right font-mono")} title={String(value)}>{text}</div>
      },
    })),
  ], [localizedColumns, props.getFileUrl, props.reversePathDisplay, props.thumbnailEnabled, props.wrapText, selectGroup, selectedSet, t])

  const handleSelection = useCallback((updater: Updater<RowSelectionState>) => {
    const next = typeof updater === "function" ? updater(rowSelection) : updater
    props.onSelectionChange(Object.keys(next).filter((path) => next[path] && selectablePaths.has(path)))
  }, [props, rowSelection, selectablePaths])
  const renderContextMenu = useCallback((row: ResultRow) => <><ContextMenuItem onSelect={() => selectGroup(row.group)}>{t("result.toggleGroup", "切换该组选择")}</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem disabled={!props.onCopyText} onSelect={() => void props.onCopyText?.(row.entry.path)}><Copy />{t("result.copyPath", "复制路径")}</ContextMenuItem><ContextMenuItem disabled={!props.onCopyText} onSelect={() => void props.onCopyText?.(row.entry.name)}><ClipboardCopy />{t("result.copyName", "复制名称")}</ContextMenuItem><ContextMenuItem disabled={!props.onCopyFiles} onSelect={() => void props.onCopyFiles?.([row.entry.path])}><ClipboardCopy />{t("result.copyFile", "复制文件")}</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem disabled={!props.onOpenPath} onSelect={() => void props.onOpenPath?.(row.entry.path)}><ExternalLink />{t("result.open", "打开")}</ContextMenuItem><ContextMenuItem disabled={!props.onRevealPath} onSelect={() => void props.onRevealPath?.(row.entry.path)}><FolderOpen />{t("result.reveal", "在文件管理器中定位")}</ContextMenuItem></>, [props, selectGroup, t])

  const notice = props.phase === "error" ? { icon: AlertTriangle, text: props.statusMessage || t("result.scanFailedHint", "扫描失败，请检查扫描条件后重试。"), destructive: true } : props.phase === "stopped" ? { icon: CircleStop, text: props.statusMessage || t("result.scanStoppedWithResults", "扫描已停止，已保留返回的结果。"), destructive: false } : null
  const emptyText = props.running ? t("result.analyzing", "正在分析文件…") : deferredFilter ? t("result.noFilterMatch", "没有匹配当前筛选的结果。") : props.phase === "error" ? props.statusMessage || t("result.scanFailed", "扫描失败，请重试。") : props.phase === "stopped" ? t("result.scanStoppedEmpty", "扫描已停止，没有返回结果。") : props.phase === "completed" ? t("result.scanCompletedEmpty", "扫描完成，未发现匹配项。") : t("result.addDirectory", "添加目录并开始扫描。")
  const changeFilter = (value: string) => props.onFilterTextChange ? props.onFilterTextChange(value) : setLocalFilter(value)
  const togglePreviewPanel = () => { const enabled = !props.previewPanelEnabled; props.onPreviewPanelEnabledChange?.(enabled); if (!enabled) setActivePreviewPath(undefined) }

  return <section className={cn("h-full min-h-0 overflow-hidden rounded-md border bg-card", panelOpen ? "grid grid-cols-[minmax(0,1fr)_288px] grid-rows-[auto_minmax(0,1fr)]" : "flex flex-col")} data-testid="czkawka-result-table" data-table-engine="niko" aria-busy={filter !== deferredFilter}>
    <div className="col-span-full">{notice ? <div role={notice.destructive ? "alert" : "status"} className={cn("flex items-center gap-2 border-b px-2 py-1.5 text-xs", notice.destructive ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground")}><notice.icon className="size-3.5" /><span className="min-w-0 flex-1 truncate">{notice.text}</span><Button disabled={!props.onRetry || props.running} size="xs" variant="ghost" onClick={() => void props.onRetry?.()}><RefreshCw />{t("result.rescan", "重新扫描")}</Button></div> : null}<div className="flex items-center justify-between gap-2 border-b px-2 py-1.5"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]"><ListFilter className="size-3.5 text-primary" />{t("result.groups", "结果组")}<Badge variant="outline">{props.groups.length}</Badge></div><div className="flex items-center gap-1"><Button aria-label={props.previewPanelEnabled ? t("result.disablePinnedPreview", "禁用固定预览") : t("result.enablePinnedPreview", "启用固定预览")} disabled={!props.onPreviewPanelEnabledChange} size="icon-sm" variant={props.previewPanelEnabled ? "secondary" : "ghost"} onClick={togglePreviewPanel}><PanelRight /></Button><Input aria-label={t("result.filterLabel", "筛选结果")} className="h-7 w-48 text-xs" placeholder={t("result.filterPlaceholder", "过滤当前工具结果")} value={filter} onChange={(event) => changeFilter(event.currentTarget.value)} /></div></div></div>
    <div className="relative min-h-0 flex-1" data-testid="czkawka-result-viewport" data-virtualized={virtualized ? "true" : "false"}><DataTableRoot<ResultRow, unknown> className="h-full space-y-0" columns={columns} data={rows} config={{ enableFilters: false, enablePagination: false, enableRowSelection: true, enableSorting: true, enableMultiSort: false }} getRowId={(row) => row.id} state={{ rowSelection, sorting }} onRowSelectionChange={handleSelection} onSortingChange={setSorting}><DataTable className="h-full rounded-none border-0" height="100%">{virtualized ? <><DataTableVirtualizedHeader /><DataTableVirtualizedBody estimateSize={props.thumbnailEnabled === false ? 44 : 53} overscan={12} renderRowContextMenu={renderContextMenu} /></> : <><DataTableHeader /><DataTableBody renderRowContextMenu={renderContextMenu} /></>}</DataTable></DataTableRoot>{rows.length === 0 ? <div className="pointer-events-none absolute inset-x-0 top-12 grid h-44 place-items-center text-xs text-muted-foreground">{emptyText}</div> : null}</div>
    {panelOpen ? <LocalMediaPreviewPanel imageItems={imageItems} videoItems={videoItems} audioItems={audioItems} activePath={activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={setActivePreviewPath} /> : null}
    <LocalImagePreviewDialog items={imageItems} activePath={props.previewPanelEnabled || props.imageComparison ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={setActivePreviewPath} /><LocalVideoPreviewDialog items={videoItems} activePath={props.previewPanelEnabled ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={setActivePreviewPath} /><LocalAudioPreviewDialog items={audioItems} activePath={props.previewPanelEnabled ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={setActivePreviewPath} />
    {props.imageComparison ? <KisakiImageComparisonDialog getFileUrl={props.getFileUrl} groups={props.imageComparison.groups} state={props.imageComparison.state} onClose={props.imageComparison.close} onColorCodingChange={props.imageComparison.setColorCoding} onModeChange={props.imageComparison.setMode} onOpacityChange={props.imageComparison.setOpacity} onSwipeChange={props.imageComparison.setSwipe} onTargetChange={props.imageComparison.setTarget} /> : null}
  </section>
}

function buildRows(groups: KisakiGroup[], columns: readonly KisakiResultColumn[], filter: string): ResultRow[] {
  const needle = filter.trim().toLocaleLowerCase()
  return groups.flatMap((group) => group.entries.filter((entry) => !needle || columns.some((column) => String(column.display?.(entry, group) ?? column.value(entry, group)).toLocaleLowerCase().includes(needle))).map((entry, indexInGroup) => ({ id: entry.path, entry, group, indexInGroup })))
}
function buildImageItems(rows: ResultRow[], t: Translate): LocalImagePreviewItem[] { return rows.filter((row) => isLocalImagePath(row.entry.path)).map(({ entry, group }) => ({ path: entry.path, name: entry.name, metadata: mediaMetadata(entry, group, t) })) }
function buildVideoItems(rows: ResultRow[], t: Translate): LocalVideoPreviewItem[] { return rows.filter((row) => isLocalVideoPath(row.entry.path)).map(({ entry, group }) => ({ path: entry.path, name: entry.name, metadata: mediaMetadata(entry, group, t) })) }
function buildAudioItems(rows: ResultRow[], props: Pick<KisakiResultTableProps, "musicCheckType" | "musicMaximumDifference" | "musicMinimumFragmentDuration" | "musicCompareFingerprintsOnlyWithSimilarTitles">, t: Translate): LocalAudioPreviewItem[] { const fingerprint = (props.musicCheckType ?? "tags") === "fingerprint"; return rows.filter((row) => isLocalAudioPath(row.entry.path)).map(({ entry, group }) => ({ path: entry.path, name: entry.name, metadata: [{ label: t("result.audio.checkType", "判断方式"), value: fingerprint ? t("result.audio.fingerprint", "音频指纹") : t("result.audio.tags", "标签") }, ...(fingerprint ? [{ label: t("result.audio.maximumDifference", "最大指纹差异"), value: props.musicMaximumDifference ?? "10" }, { label: t("result.audio.minimumFragment", "最小片段"), value: `${props.musicMinimumFragmentDuration ?? "15"} s` }, { label: t("result.audio.titleConstraint", "标题限制"), value: props.musicCompareFingerprintsOnlyWithSimilarTitles !== false ? t("result.audio.similarTitles", "仅相似标题") : t("result.audio.anyTitle", "不限标题") }] : []), { label: t("result.columns.title", "标题"), value: entry.title || "—" }, { label: t("result.columns.artist", "艺术家"), value: entry.artist || "—" }, { label: t("result.audio.genre", "流派"), value: entry.genre || "—" }, { label: t("result.columns.year", "年份"), value: entry.year || "—" }, { label: t("result.columns.bitrate", "码率"), value: entry.bitrate ? `${entry.bitrate} kbps` : "—" }, { label: t("result.columns.length", "时长"), value: entry.length || "—" }, { label: t("result.columns.size", "大小"), value: formatBytes(entry.size) }, { label: t("result.group", "组"), value: String(group.id + 1).padStart(2, "0") }] })) }
function mediaMetadata(entry: KisakiEntry, group: KisakiGroup, t: Translate) {
  return [
    { label: t("result.columns.size", "大小"), value: formatBytes(entry.size) },
    { label: t("result.columns.dimensions", "分辨率"), value: entry.width && entry.height ? `${entry.width}×${entry.height}` : "—" },
    ...(entry.fps === undefined ? [] : [{ label: t("result.columns.fps", "帧率"), value: `${Number(entry.fps.toFixed(2))} fps` }]),
    ...(entry.codec ? [{ label: t("result.columns.codec", "编码"), value: entry.codec }] : []),
    ...(entry.bitrate === undefined ? [] : [{ label: t("result.columns.bitrate", "码率"), value: `${entry.bitrate} kbps` }]),
    ...(entry.length ? [{ label: t("result.columns.length", "时长"), value: entry.length }] : []),
    { label: t("result.columns.modified", "修改时间"), value: formatDate(entry.modifiedDate) },
    { label: t("result.columns.similarity", "相似度"), value: entry.similarity || "—" },
    { label: t("result.group", "组"), value: String(group.id + 1).padStart(2, "0") },
  ]
}
function columnSize(id: string) { if (id === "path" || id === "target") return 320; if (id === "title" || id === "artist" || id === "error") return 160; if (id === "modified") return 176; return 108 }
function reversePath(path: string) { const normalized = path.replaceAll("\\", "/"), prefix = normalized.startsWith("//") ? "//" : "", parts = normalized.slice(prefix.length).split("/").filter(Boolean); return parts.length < 2 ? path : parts.reverse().join(" ‹ ") }
function unique(values: string[]) { return [...new Set(values)] }
function formatDate(value: number) { if (!value) return "—"; return new Date(value < 10_000_000_000 ? value * 1000 : value).toLocaleString() }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB", "TB"]; let value = bytes / 1024, unit = units[0]!; for (let index = 1; index < units.length && value >= 1024; index += 1) { value /= 1024; unit = units[index]! } return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}` }
