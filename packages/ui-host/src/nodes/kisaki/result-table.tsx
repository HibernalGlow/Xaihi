import { useDeferredValue, useRef, useState } from "react"
import type { MouseEvent, PointerEvent, UIEvent } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, CircleStop, ClipboardCopy, Copy, ExternalLink, FolderOpen, ListFilter, MousePointer2, PanelRight, RefreshCw } from "lucide-react"
import type { KisakiEntry, KisakiGroup, KisakiMusicCheckType, KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { TableBody, TableCell, TableComponent, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { isLocalImagePath } from "@/nodes/shared/LocalImagePreview"
import { LocalImagePreviewDialog } from "@/nodes/shared/LocalImagePreviewDialog"
import type { LocalImagePreviewItem } from "@/nodes/shared/LocalImagePreviewDialog"
import { getLocalMediaKind, isLocalAudioPath, LocalMediaPreview } from "@/nodes/shared/LocalMediaPreview"
import { LocalAudioPreviewDialog } from "@/nodes/shared/LocalAudioPreviewDialog"
import type { LocalAudioPreviewItem } from "@/nodes/shared/LocalAudioPreviewDialog"
import { isLocalVideoPath } from "@/nodes/shared/LocalVideoPreview"
import { LocalVideoPreviewDialog } from "@/nodes/shared/LocalVideoPreviewDialog"
import type { LocalVideoPreviewItem } from "@/nodes/shared/LocalVideoPreviewDialog"
import { LocalMediaPreviewPanel } from "@/nodes/shared/LocalMediaPreviewPanel"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { KisakiPhase } from "./types"
import { KisakiNikoResultTable } from "./niko-result-table"
import type { KisakiImageComparisonMode, KisakiImageComparisonState } from "@hibernalglow/xaihi-kisaki/image-comparison"

export type KisakiResultColumnId = "name" | "path" | "size" | "groupSize" | "modified" | "similarity" | "dimensions" | "fps" | "codec" | "title" | "artist" | "year" | "bitrate" | "length" | "target" | "error" | "currentExtension" | "properExtension" | "exifTags"

export interface KisakiResultColumn {
  id: KisakiResultColumnId
  label: string
  align?: "right"
  value: (entry: KisakiEntry, group: KisakiGroup) => string | number
  display?: (entry: KisakiEntry, group: KisakiGroup) => string
}

const column = (id: KisakiResultColumnId, label: string, value: KisakiResultColumn["value"], display?: KisakiResultColumn["display"], align?: "right"): KisakiResultColumn => ({ id, label, value, display, align })
const NAME = column("name", "名称", (entry) => entry.name)
const PATH = column("path", "路径", (entry) => entry.path)
const SIZE = column("size", "大小", (entry) => entry.size, (entry) => formatBytes(entry.size), "right")
const GROUP_SIZE = column("groupSize", "组大小", (_entry, group) => group.totalBytes, (_entry, group) => formatBytes(group.totalBytes), "right")
const MODIFIED = column("modified", "修改时间", (entry) => entry.modifiedDate, (entry) => formatDate(entry.modifiedDate))
const SIMILARITY = column("similarity", "相似度", (entry) => numeric(entry.similarity), (entry) => entry.similarity || "—")
const DIMENSIONS = column("dimensions", "分辨率", (entry) => (entry.width ?? 0) * (entry.height ?? 0), (entry) => entry.width && entry.height ? `${entry.width}×${entry.height}` : "—")
const FPS = column("fps", "帧率", (entry) => entry.fps ?? 0, (entry) => formatFps(entry.fps), "right")
const CODEC = column("codec", "编码", (entry) => entry.codec ?? "")
const TITLE = column("title", "标题", (entry) => entry.title ?? "")
const ARTIST = column("artist", "艺术家", (entry) => entry.artist ?? "")
const YEAR = column("year", "年份", (entry) => numeric(entry.year))
const BITRATE = column("bitrate", "码率", (entry) => entry.bitrate ?? 0, (entry) => entry.bitrate ? `${entry.bitrate} kbps` : "—", "right")
const LENGTH = column("length", "时长", (entry) => numeric(entry.length), (entry) => entry.length || "—")
const TARGET = column("target", "目标路径", (entry) => entry.secondaryPath ?? "")
const ERROR = column("error", "错误类型", (entry) => entry.detail ?? "")
const CURRENT_EXTENSION = column("currentExtension", "当前扩展名", (entry) => extension(entry.name))
const PROPER_EXTENSION = column("properExtension", "正确扩展名", (entry) => entry.properExtension ?? "")
const EXIF_TAGS = column("exifTags", "EXIF 标签", (entry) => entry.exifTags?.map((tag) => tag.name).join(", ") ?? "")

export const KISAKI_RESULT_COLUMNS: Record<KisakiTool, readonly KisakiResultColumn[]> = {
  "duplicate-files": [SIZE, GROUP_SIZE, NAME, PATH, MODIFIED],
  "empty-folders": [NAME, PATH, MODIFIED],
  "big-files": [SIZE, NAME, PATH, MODIFIED],
  "empty-files": [NAME, PATH, MODIFIED],
  "temporary-files": [NAME, PATH, MODIFIED],
  "similar-images": [SIMILARITY, SIZE, GROUP_SIZE, DIMENSIONS, NAME, PATH, MODIFIED],
  "similar-videos": [SIMILARITY, SIZE, GROUP_SIZE, DIMENSIONS, FPS, CODEC, BITRATE, LENGTH, NAME, PATH, MODIFIED],
  "duplicate-music": [SIZE, GROUP_SIZE, NAME, TITLE, ARTIST, YEAR, BITRATE, LENGTH, PATH, MODIFIED],
  "invalid-symlinks": [NAME, PATH, TARGET, ERROR, MODIFIED],
  "broken-files": [NAME, PATH, ERROR, SIZE, MODIFIED],
  "bad-extensions": [NAME, PATH, CURRENT_EXTENSION, PROPER_EXTENSION, MODIFIED],
  "bad-names": [NAME, PATH, TARGET, MODIFIED],
  "exif-remover": [NAME, PATH, EXIF_TAGS, SIZE, MODIFIED],
  "video-optimizer": [SIZE, DIMENSIONS, CODEC, LENGTH, NAME, PATH, MODIFIED],
}

type SortState = { id: KisakiResultColumnId; descending: boolean }
type ColumnWidths = Partial<Record<KisakiResultColumnId, number>>
type ResultRowItem = { entry: KisakiEntry; group: KisakiGroup; indexInGroup: number }
type ResizeState = { tool: KisakiTool; id: KisakiResultColumnId; startX: number; startWidth: number }
type PreviewResizeState = { tool: KisakiTool; startX: number; startWidth: number }
type ViewportState = { scrollTop: number; height: number }
type GroupSelection = { paths: string[]; selected: boolean }
type BoxSelectionMode = "replace" | "add" | "remove"
type BoxSelectionState = { pointerId: number; startY: number; currentY: number; mode: BoxSelectionMode }
type MusicPreviewSettings = { checkType: KisakiMusicCheckType; maximumDifference: string; minimumFragmentDuration: string; similarTitlesOnly: boolean }
type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const SELECT_WIDTH = 44
const PREVIEW_WIDTH = 60
const GROUP_WIDTH = 68
const RESULT_ROW_HEIGHT = 52
const WRAPPED_RESULT_ROW_HEIGHT = 72
const MIN_COLUMN_WIDTH = 72
const MAX_COLUMN_WIDTH = 640
const MIN_PREVIEW_WIDTH = 52
const MAX_PREVIEW_WIDTH = 184

export interface KisakiResultTableProps {
  tool: KisakiTool
  groups: KisakiGroup[]
  running: boolean
  phase?: KisakiPhase
  statusMessage?: string
  filterText?: string
  externalFiltering?: boolean
  selectedPaths: string[]
  musicCheckType?: KisakiMusicCheckType
  musicMaximumDifference?: string
  musicMinimumFragmentDuration?: string
  musicCompareFingerprintsOnlyWithSimilarTitles?: boolean
  previewPanelEnabled?: boolean
  thumbnailEnabled?: boolean
  reversePathDisplay?: boolean
  wrapText?: boolean
  getFileUrl?: (path: string) => string
  imageComparison?: KisakiImageComparisonBindings
  onCopyText?: (text: string) => Promise<void>
  onCopyFiles?: (paths: string[]) => Promise<void>
  onOpenPath?: (path: string) => Promise<void>
  onRevealPath?: (path: string) => Promise<void>
  onFilterTextChange?: (value: string) => void
  onRetry?: () => Promise<void>
  onPreviewPanelEnabledChange?: (enabled: boolean) => void
  onSelectionChange: (paths: string[]) => void
}

export interface KisakiImageComparisonBindings {
  groups: readonly KisakiGroup[]
  state: KisakiImageComparisonState
  open: (path: string) => void
  close: () => void
  setMode: (mode: KisakiImageComparisonMode) => void
  setColorCoding: (colorCoding: boolean) => void
  setTarget: (path: string) => void
  setSwipe: (swipePercent: number) => void
  setOpacity: (onionOpacity: number) => void
}

function LegacyKisakiResultTable(props: KisakiResultTableProps) {
  const { t } = useNodeI18n("kisaki")
  const resizeRef = useRef<ResizeState | null>(null)
  const previewResizeRef = useRef<PreviewResizeState | null>(null)
  const boxInitialSelectionRef = useRef<string[]>([])
  const [filters, setFilters] = useState<Partial<Record<KisakiTool, string>>>({})
  const [sorts, setSorts] = useState<Partial<Record<KisakiTool, SortState>>>({})
  const [anchors, setAnchors] = useState<Partial<Record<KisakiTool, string>>>({})
  const [widths, setWidths] = useState<Partial<Record<KisakiTool, ColumnWidths>>>({})
  const [previewWidths, setPreviewWidths] = useState<Partial<Record<KisakiTool, number>>>({})
  const [viewports, setViewports] = useState<Partial<Record<KisakiTool, ViewportState>>>({})
  const [activePreviewPaths, setActivePreviewPaths] = useState<Partial<Record<KisakiTool, string>>>({})
  const [boxSelection, setBoxSelection] = useState<BoxSelectionState | null>(null)
  const filter = props.filterText ?? filters[props.tool] ?? ""
  const deferredFilter = useDeferredValue(filter)
  const sort = sorts[props.tool] ?? { id: defaultSort(props.tool), descending: false }
  const columns = localizeColumns(KISAKI_RESULT_COLUMNS[props.tool], t)
  const visibleGroups = filterAndSortResultGroups(props.groups, columns, props.externalFiltering ? "" : deferredFilter, sort)
  const rows = flattenResultRows(visibleGroups)
  const previewItems = buildLocalImagePreviewItems(rows, t)
  const videoPreviewItems = buildLocalVideoPreviewItems(rows, t)
  const audioPreviewItems = buildLocalAudioPreviewItems(rows, { checkType: props.musicCheckType ?? "tags", maximumDifference: props.musicMaximumDifference ?? "10", minimumFragmentDuration: props.musicMinimumFragmentDuration ?? "15", similarTitlesOnly: props.musicCompareFingerprintsOnlyWithSimilarTitles ?? true }, t)
  const visibleEntries = selectableEntries(rows)
  const selectedSet = new Set(props.selectedPaths)
  const groupSelections = buildGroupSelections(visibleGroups, selectedSet)
  const toolWidths = widths[props.tool] ?? {}
  const previewWidth = previewWidths[props.tool] ?? PREVIEW_WIDTH
  const previewSize = clamp(previewWidth - 24, 28, 160)
  const showThumbnail = props.thumbnailEnabled !== false
  const rowHeight = Math.max(props.wrapText ? WRAPPED_RESULT_ROW_HEIGHT : RESULT_ROW_HEIGHT, showThumbnail ? previewSize + 16 : 0)
  const gridTemplateColumns = [SELECT_WIDTH, ...(showThumbnail ? [previewWidth] : []), GROUP_WIDTH, ...columns.map((item) => toolWidths[item.id] ?? defaultColumnWidth(item.id))].map((width) => `${width}px`).join(" ")
  const tableWidth = SELECT_WIDTH + (showThumbnail ? previewWidth : 0) + GROUP_WIDTH + columns.reduce((total, item) => total + (toolWidths[item.id] ?? defaultColumnWidth(item.id)), 0)
  const viewport = viewports[props.tool] ?? { scrollTop: 0, height: 520 }
  const window = calculateVirtualWindow(rows.length, viewport.scrollTop, viewport.height, rowHeight, 8)
  const renderedRows = rows.slice(window.start, window.end).map((_row, offset) => ({ index: window.start + offset, start: (window.start + offset) * rowHeight }))

  function select(entry: KisakiEntry, checked: boolean, event: MouseEvent) {
    if (entry.isReference) return
    const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace"
    props.onSelectionChange(applyResultSelection(props.selectedPaths, visibleEntries, entry.path, checked, mode, anchors[props.tool]))
    setAnchors((current) => ({ ...current, [props.tool]: entry.path }))
  }

  function selectGroup(_group: KisakiGroup, selection: GroupSelection) {
    props.onSelectionChange(selection.selected ? props.selectedPaths.filter((path) => !selection.paths.includes(path)) : unique([...props.selectedPaths, ...selection.paths]))
  }

  function changeSort(id: KisakiResultColumnId) {
    setSorts((current) => ({ ...current, [props.tool]: current[props.tool]?.id === id ? { id, descending: !current[props.tool]!.descending } : { id, descending: false } }))
  }

  function startResize(event: PointerEvent<HTMLSpanElement>, id: KisakiResultColumnId) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    resizeRef.current = { tool: props.tool, id, startX: event.clientX, startWidth: toolWidths[id] ?? defaultColumnWidth(id) }
  }

  function resizeColumn(event: PointerEvent<HTMLSpanElement>) {
    const active = resizeRef.current
    if (!active || active.tool !== props.tool) return
    const width = clamp(active.startWidth + event.clientX - active.startX, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)
    setWidths((current) => ({ ...current, [props.tool]: { ...current[props.tool], [active.id]: width } }))
  }

  function finishResize(event: PointerEvent<HTMLSpanElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    resizeRef.current = null
  }

  function startPreviewResize(event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    previewResizeRef.current = { tool: props.tool, startX: event.clientX, startWidth: previewWidth }
  }

  function resizePreview(event: PointerEvent<HTMLSpanElement>) {
    const active = previewResizeRef.current
    if (!active || active.tool !== props.tool) return
    const width = clamp(active.startWidth + event.clientX - active.startX, MIN_PREVIEW_WIDTH, MAX_PREVIEW_WIDTH)
    setPreviewWidths((current) => ({ ...current, [props.tool]: width }))
  }

  function finishPreviewResize(event: PointerEvent<HTMLSpanElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    previewResizeRef.current = null
  }

  function updateViewport(event: UIEvent<HTMLDivElement>) {
    const scrollTop = event.currentTarget.scrollTop
    const height = event.currentTarget.clientHeight || viewport.height
    setViewports((current) => ({ ...current, [props.tool]: { scrollTop, height } }))
  }

  function changeFilter(value: string) {
    if (props.onFilterTextChange) props.onFilterTextChange(value)
    else setFilters((current) => ({ ...current, [props.tool]: value }))
  }

  function changeActivePreview(path: string | undefined) {
    setActivePreviewPaths((current) => ({ ...current, [props.tool]: path }))
  }

  function togglePreviewPanel() {
    const enabled = !props.previewPanelEnabled
    props.onPreviewPanelEnabledChange?.(enabled)
    if (!enabled) changeActivePreview(undefined)
  }

  function startBoxSelection(event: PointerEvent<HTMLTableSectionElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top
    const mode: BoxSelectionMode = event.altKey ? "remove" : event.ctrlKey || event.metaKey || event.shiftKey ? "add" : "replace"
    boxInitialSelectionRef.current = props.selectedPaths
    setBoxSelection({ pointerId: event.pointerId, startY: y, currentY: y, mode })
  }

  function moveBoxSelection(event: PointerEvent<HTMLTableSectionElement>) {
    if (!boxSelection || boxSelection.pointerId !== event.pointerId) return
    const currentY = event.clientY - event.currentTarget.getBoundingClientRect().top
    setBoxSelection({ ...boxSelection, currentY })
    props.onSelectionChange(applyBoxSelection(boxInitialSelectionRef.current, rows, boxSelection.startY, currentY, rowHeight, boxSelection.mode))
  }

  function finishBoxSelection(event: PointerEvent<HTMLTableSectionElement>) {
    if (!boxSelection || boxSelection.pointerId !== event.pointerId) return
    const currentY = event.clientY - event.currentTarget.getBoundingClientRect().top
    props.onSelectionChange(applyBoxSelection(boxInitialSelectionRef.current, rows, boxSelection.startY, currentY, rowHeight, boxSelection.mode))
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    setBoxSelection(null)
  }

  const notice = props.phase === "error" ? { icon: AlertTriangle, text: props.statusMessage || t("result.scanFailedHint", "扫描失败，请检查扫描条件后重试。"), destructive: true } : props.phase === "stopped" ? { icon: CircleStop, text: props.statusMessage || t("result.scanStoppedWithResults", "扫描已停止，已保留返回的结果。"), destructive: false } : null
  const emptyText = props.running ? t("result.analyzing", "正在分析文件…") : deferredFilter ? t("result.noFilterMatch", "没有匹配当前筛选的结果。") : props.phase === "error" ? props.statusMessage || t("result.scanFailed", "扫描失败，请重试。") : props.phase === "stopped" ? t("result.scanStoppedEmpty", "扫描已停止，没有返回结果。") : props.phase === "completed" ? t("result.scanCompletedEmpty", "扫描完成，未发现匹配项。") : t("result.addDirectory", "添加目录并开始扫描。")
  const activePreviewPath = activePreviewPaths[props.tool]
  const panelOpen = Boolean(props.previewPanelEnabled && activePreviewPath && [...previewItems, ...videoPreviewItems, ...audioPreviewItems].some((item) => item.path === activePreviewPath))

  return <section className={cn("min-h-0 rounded-md border bg-card", panelOpen ? "grid grid-cols-[minmax(0,1fr)_288px] grid-rows-[auto_minmax(0,1fr)]" : "flex flex-col")} data-testid="czkawka-result-table" aria-busy={filter !== deferredFilter}><div className="col-span-full">{notice ? <div role={notice.destructive ? "alert" : "status"} className={cn("flex items-center gap-2 border-b px-2 py-1.5 text-xs", notice.destructive ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground")}><notice.icon className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{notice.text}</span><Button disabled={!props.onRetry || props.running} size="xs" variant="ghost" onClick={() => void props.onRetry?.()}><RefreshCw />{t("result.rescan", "重新扫描")}</Button></div> : null}<div className="flex items-center justify-between gap-2 border-b px-2 py-1.5"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]"><ListFilter className="size-3.5 text-primary" />{t("result.groups", "结果组")}</div><div className="flex items-center gap-1"><Button aria-label={props.previewPanelEnabled ? t("result.disablePinnedPreview", "禁用固定预览") : t("result.enablePinnedPreview", "启用固定预览")} disabled={!props.onPreviewPanelEnabledChange} size="icon-sm" variant={props.previewPanelEnabled ? "secondary" : "ghost"} onClick={togglePreviewPanel}><PanelRight /></Button><Input aria-label={t("result.filterLabel", "筛选结果")} className="h-7 w-48 text-xs" placeholder={t("result.filterPlaceholder", "过滤当前工具结果")} value={filter} onChange={(event) => changeFilter(event.currentTarget.value)} /></div></div></div><div className="min-h-0 flex-1 overflow-auto" data-testid="czkawka-result-viewport" onScroll={updateViewport}><TableComponent className="grid text-xs" style={{ minWidth: tableWidth }}><TableHeader className="sticky top-0 z-10 grid bg-card"><TableRow className="grid" style={{ gridTemplateColumns }}><TableHead />{showThumbnail ? <TableHead className="relative">{t("result.preview", "预览")}<span role="separator" aria-label={t("result.resizePreview", "调整预览列宽")} aria-orientation="vertical" className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-primary/40" onPointerDown={startPreviewResize} onPointerMove={resizePreview} onPointerUp={finishPreviewResize} onPointerCancel={finishPreviewResize} /></TableHead> : null}<TableHead>{t("result.group", "组")}</TableHead>{columns.map((item) => <TableHead key={item.id} className={cn("relative overflow-hidden", item.align === "right" && "text-right")} style={{ width: toolWidths[item.id] ?? defaultColumnWidth(item.id) }}><Button className="h-7 max-w-[calc(100%-6px)] px-1 text-xs" variant="ghost" onClick={() => changeSort(item.id)}>{item.label}{sort.id !== item.id ? <ChevronsUpDown className="size-3 opacity-40" /> : sort.descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}</Button><span role="separator" aria-label={t("result.resizeColumn", "调整{{column}}列宽", { column: item.label })} aria-orientation="vertical" className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-primary/40" onPointerDown={(event) => startResize(event, item.id)} onPointerMove={resizeColumn} onPointerUp={finishResize} onPointerCancel={finishResize} /></TableHead>)}</TableRow></TableHeader><TableBody className="relative grid select-none" style={{ height: rows.length * rowHeight }} onPointerDown={startBoxSelection} onPointerMove={moveBoxSelection} onPointerUp={finishBoxSelection} onPointerCancel={finishBoxSelection}>{renderedRows.map((virtualRow) => { const row = rows[virtualRow.index]!; return <VirtualResultRow key={row.entry.id} row={row} columns={columns} gridTemplateColumns={gridTemplateColumns} selectedSet={selectedSet} groupSelection={groupSelections.get(row.group)!} getFileUrl={props.getFileUrl} onCopyText={props.onCopyText} onCopyFiles={props.onCopyFiles} onOpenPath={props.onOpenPath} onRevealPath={props.onRevealPath} onPreview={changeActivePreview} onSelect={select} onSelectGroup={selectGroup} previewSize={previewSize} showThumbnail={showThumbnail} reversePathDisplay={props.reversePathDisplay} rowHeight={rowHeight} start={virtualRow.start} t={t} wrapText={props.wrapText} /> })}{boxSelection ? <TableRow aria-hidden data-testid="czkawka-selection-box" className="pointer-events-none absolute left-0 z-20 grid w-full border border-primary bg-primary/10" style={{ top: Math.min(boxSelection.startY, boxSelection.currentY), height: Math.abs(boxSelection.currentY - boxSelection.startY) }}><TableCell><MousePointer2 className="size-3 text-primary" /></TableCell></TableRow> : null}</TableBody></TableComponent>{rows.length === 0 ? <div className="grid h-56 place-items-center text-xs text-muted-foreground">{emptyText}</div> : null}</div>{panelOpen ? <LocalMediaPreviewPanel imageItems={previewItems} videoItems={videoPreviewItems} audioItems={audioPreviewItems} activePath={activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={changeActivePreview} /> : null}<LocalImagePreviewDialog items={previewItems} activePath={props.previewPanelEnabled ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={changeActivePreview} /><LocalVideoPreviewDialog items={videoPreviewItems} activePath={props.previewPanelEnabled ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={changeActivePreview} /><LocalAudioPreviewDialog items={audioPreviewItems} activePath={props.previewPanelEnabled ? undefined : activePreviewPath} getFileUrl={props.getFileUrl} onActivePathChange={changeActivePreview} /></section>
}

export function KisakiResultTable(props: KisakiResultTableProps) {
  return <KisakiNikoResultTable {...props} columns={KISAKI_RESULT_COLUMNS[props.tool]} />
}

function VirtualResultRow({ row, columns, gridTemplateColumns, selectedSet, groupSelection, getFileUrl, onCopyText, onCopyFiles, onOpenPath, onRevealPath, onPreview, onSelect, onSelectGroup, previewSize, showThumbnail, reversePathDisplay, rowHeight, start, t, wrapText }: { row: ResultRowItem; columns: readonly KisakiResultColumn[]; gridTemplateColumns: string; selectedSet: Set<string>; groupSelection: GroupSelection; getFileUrl?: (path: string) => string; onCopyText?: (text: string) => Promise<void>; onCopyFiles?: (paths: string[]) => Promise<void>; onOpenPath?: (path: string) => Promise<void>; onRevealPath?: (path: string) => Promise<void>; onPreview: (path: string) => void; onSelect: (entry: KisakiEntry, checked: boolean, event: MouseEvent) => void; onSelectGroup: (group: KisakiGroup, selection: GroupSelection) => void; previewSize: number; showThumbnail: boolean; reversePathDisplay?: boolean; rowHeight: number; start: number; t: Translate; wrapText?: boolean }) {
  const { entry, group, indexInGroup } = row
  const selected = selectedSet.has(entry.path)
  const mediaKind = getLocalMediaKind(entry.path)
  const canOpenPreview = Boolean(mediaKind)
  return <ContextMenu><ContextMenuTrigger asChild><TableRow data-index={entry.id} data-group={group.id} data-group-start={indexInGroup === 0 ? "true" : undefined} data-state={selected ? "selected" : undefined} className={cn("absolute left-0 grid w-full", indexInGroup === 0 && group.id > 0 && "border-t-2 border-t-primary/30")} style={{ gridTemplateColumns, height: rowHeight, transform: `translateY(${start}px)` }}><TableCell><Checkbox aria-label={t("result.selectEntry", "选择 {{name}}", { name: entry.name })} disabled={entry.isReference} checked={selected} onClick={(event) => { event.preventDefault(); onSelect(entry, !selected, event) }} /></TableCell>{showThumbnail ? <TableCell className="py-2">{canOpenPreview ? <button type="button" aria-label={mediaKind === "image" ? t("result.previewEntry", "预览 {{name}}", { name: entry.name }) : t("result.playEntry", "播放 {{name}}", { name: entry.name })} className="rounded-md" style={{ width: previewSize, height: previewSize }} data-no-box-select onClick={() => onPreview(entry.path)}><LocalMediaPreview path={entry.path} getFileUrl={getFileUrl} className="grid size-full place-items-center overflow-hidden rounded-md border bg-background" /></button> : <div style={{ width: previewSize, height: previewSize }}><LocalMediaPreview path={entry.path} getFileUrl={getFileUrl} className="grid size-full place-items-center overflow-hidden rounded-md border bg-background" /></div>}</TableCell> : null}<TableCell className="relative"><span aria-hidden className={cn("absolute inset-y-1 left-0 w-0.5 rounded-full", group.id % 2 === 0 ? "bg-primary/70" : "bg-chart-2/70")} /><button className="flex items-center gap-1 font-mono" onClick={() => onSelectGroup(group, groupSelection)}><span className={cn("size-2 rounded-full", groupSelection.selected ? "bg-primary" : "bg-muted-foreground/40")} />{String(group.id + 1).padStart(2, "0")}{indexInGroup === 0 && group.entries.length > 1 ? <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">{group.entries.length}</Badge> : null}</button></TableCell>{columns.map((item) => <TableCell key={item.id} className={cn("min-w-0 overflow-hidden", wrapText ? "whitespace-normal break-words leading-tight" : "truncate", item.align === "right" && "text-right font-mono")} title={String(item.display?.(entry, group) ?? item.value(entry, group))}>{item.id === "path" ? <div className={cn("flex min-w-0 items-center gap-1", wrapText && "h-full")}>{entry.isReference ? <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">{t("result.reference", "参考")}</Badge> : null}<span className={cn("font-mono", wrapText ? "line-clamp-2 break-all" : "truncate")}>{reversePathDisplay ? formatReversePath(entry.path) : entry.path}</span></div> : <span className={wrapText ? "line-clamp-2" : undefined}>{item.display?.(entry, group) ?? String(item.value(entry, group) || "—")}</span>}</TableCell>)}</TableRow></ContextMenuTrigger><ContextMenuContent><ContextMenuItem disabled={groupSelection.selected} onSelect={() => onSelectGroup(group, { ...groupSelection, selected: false })}>{t("result.selectGroup", "选中该组")}</ContextMenuItem><ContextMenuItem disabled={!groupSelection.selected} onSelect={() => onSelectGroup(group, { ...groupSelection, selected: true })}>{t("result.unselectGroup", "取消选中该组")}</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem disabled={!onCopyText} onSelect={() => void onCopyText?.(entry.path)}><Copy />{t("result.copyPath", "复制路径")}</ContextMenuItem><ContextMenuItem disabled={!onCopyText} onSelect={() => void onCopyText?.(entry.name)}><ClipboardCopy />{t("result.copyName", "复制名称")}</ContextMenuItem><ContextMenuItem disabled={!onCopyFiles} title={onCopyFiles ? undefined : t("result.copyFileUnsupported", "当前宿主不支持复制本地文件对象")} onSelect={() => void onCopyFiles?.([entry.path])}><ClipboardCopy />{t("result.copyFile", "复制文件")}</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem disabled={!onOpenPath} onSelect={() => void onOpenPath?.(entry.path)}><ExternalLink />{t("result.open", "打开")}</ContextMenuItem><ContextMenuItem disabled={!onRevealPath} onSelect={() => void onRevealPath?.(entry.path)}><FolderOpen />{t("result.reveal", "在文件管理器中定位")}</ContextMenuItem></ContextMenuContent></ContextMenu>
}

export function formatReversePath(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  const prefix = normalized.startsWith("//") ? "//" : ""
  const parts = normalized.slice(prefix.length).split("/").filter(Boolean)
  if (parts.length < 2) return path
  return [...parts].reverse().join(" ‹ ")
}

function buildLocalImagePreviewItems(rows: ResultRowItem[], t: Translate): LocalImagePreviewItem[] {
  return rows.filter((row) => isLocalImagePath(row.entry.path)).map(({ entry, group }) => ({
    path: entry.path,
    name: entry.name,
    metadata: [
      { label: t("result.columns.size", "大小"), value: formatBytes(entry.size) },
      { label: t("result.columns.dimensions", "分辨率"), value: entry.width && entry.height ? `${entry.width}×${entry.height}` : "—" },
      { label: t("result.columns.modified", "修改时间"), value: formatDate(entry.modifiedDate) },
      { label: t("result.columns.similarity", "相似度"), value: entry.similarity || "—" },
      { label: t("result.group", "组"), value: String(group.id + 1).padStart(2, "0") },
    ],
  }))
}

function buildLocalVideoPreviewItems(rows: ResultRowItem[], t: Translate): LocalVideoPreviewItem[] {
  return rows.filter((row) => isLocalVideoPath(row.entry.path)).map(({ entry, group }) => ({
    path: entry.path,
    name: entry.name,
    metadata: [
      { label: t("result.columns.size", "大小"), value: formatBytes(entry.size) },
      { label: t("result.columns.dimensions", "分辨率"), value: entry.width && entry.height ? `${entry.width}×${entry.height}` : "—" },
      { label: t("result.columns.modified", "修改时间"), value: formatDate(entry.modifiedDate) },
      { label: t("result.columns.similarity", "相似度"), value: entry.similarity || "—" },
      { label: t("result.group", "组"), value: String(group.id + 1).padStart(2, "0") },
    ],
  }))
}

function buildLocalAudioPreviewItems(rows: ResultRowItem[], settings: MusicPreviewSettings, t: Translate): LocalAudioPreviewItem[] {
  return rows.filter((row) => isLocalAudioPath(row.entry.path)).map(({ entry, group }) => ({
    path: entry.path,
    name: entry.name,
    metadata: [
      { label: t("result.audio.checkType", "判断方式"), value: settings.checkType === "fingerprint" ? t("result.audio.fingerprint", "音频指纹") : t("result.audio.tags", "标签") },
      ...(settings.checkType === "fingerprint" ? [
        { label: t("result.audio.maximumDifference", "最大指纹差异"), value: settings.maximumDifference },
        { label: t("result.audio.minimumFragment", "最小片段"), value: `${settings.minimumFragmentDuration} s` },
        { label: t("result.audio.titleConstraint", "标题限制"), value: settings.similarTitlesOnly ? t("result.audio.similarTitles", "仅相似标题") : t("result.audio.anyTitle", "不限标题") },
      ] : []),
      { label: t("result.columns.title", "标题"), value: entry.title || "—" },
      { label: t("result.columns.artist", "艺术家"), value: entry.artist || "—" },
      { label: t("result.audio.genre", "流派"), value: entry.genre || "—" },
      { label: t("result.columns.year", "年份"), value: entry.year || "—" },
      { label: t("result.columns.bitrate", "码率"), value: entry.bitrate ? `${entry.bitrate} kbps` : "—" },
      { label: t("result.columns.length", "时长"), value: entry.length || "—" },
      { label: t("result.columns.size", "大小"), value: formatBytes(entry.size) },
      { label: t("result.group", "组"), value: String(group.id + 1).padStart(2, "0") },
    ],
  }))
}

export function flattenResultRows(groups: KisakiGroup[]): ResultRowItem[] {
  return groups.flatMap((group) => group.entries.map((entry, indexInGroup) => ({ entry, group, indexInGroup })))
}

function selectableEntries(rows: ResultRowItem[]): KisakiEntry[] {
  const entries: KisakiEntry[] = []
  for (const row of rows) if (!row.entry.isReference) entries.push(row.entry)
  return entries
}

function buildGroupSelections(groups: KisakiGroup[], selected: Set<string>): Map<KisakiGroup, GroupSelection> {
  const selections = new Map<KisakiGroup, GroupSelection>()
  for (const group of groups) {
    const paths: string[] = []
    let allSelected = true
    for (const entry of group.entries) {
      if (entry.isReference) continue
      paths.push(entry.path)
      if (!selected.has(entry.path)) allSelected = false
    }
    selections.set(group, { paths, selected: paths.length > 0 && allSelected })
  }
  return selections
}

export function calculateVirtualWindow(count: number, scrollTop: number, viewportHeight: number, rowHeight: number, overscan: number): { start: number; end: number } {
  const start = clamp(Math.floor(scrollTop / rowHeight) - overscan, 0, count)
  const end = clamp(Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan, start, count)
  return { start, end }
}

export function applyResultSelection(current: string[], visible: KisakiEntry[], path: string, checked: boolean, mode: "replace" | "toggle" | "range", anchor?: string): string[] {
  if (mode === "replace") return checked ? [path] : []
  if (mode === "toggle") return checked ? unique([...current, path]) : current.filter((item) => item !== path)
  const start = anchor ? visible.findIndex((entry) => entry.path === anchor) : -1
  const end = visible.findIndex((entry) => entry.path === path)
  if (start < 0 || end < 0) return checked ? unique([...current, path]) : current.filter((item) => item !== path)
  const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1).map((entry) => entry.path)
  return checked ? unique([...current, ...range]) : current.filter((item) => !range.includes(item))
}

export function applyBoxSelection(current: string[], rows: ResultRowItem[], startY: number, endY: number, rowHeight: number, mode: BoxSelectionMode): string[] {
  if (rows.length === 0 || rowHeight <= 0) return mode === "replace" ? [] : current
  const top = Math.max(0, Math.min(startY, endY))
  const bottom = Math.max(0, Math.max(startY, endY))
  const startIndex = clamp(Math.floor(top / rowHeight), 0, rows.length - 1)
  const endIndex = clamp(Math.floor(Math.max(top, bottom - 0.001) / rowHeight), startIndex, rows.length - 1)
  const paths = rows.slice(startIndex, endIndex + 1).filter((row) => !row.entry.isReference).map((row) => row.entry.path)
  if (mode === "replace") return unique(paths)
  if (mode === "add") return unique([...current, ...paths])
  const removed = new Set(paths)
  return current.filter((path) => !removed.has(path))
}

export function filterAndSortResultGroups(groups: KisakiGroup[], columns: readonly KisakiResultColumn[], filter: string, sort: SortState): KisakiGroup[] {
  const needle = filter.trim().toLocaleLowerCase()
  const sortColumn = columns.find((item) => item.id === sort.id) ?? columns[0]!
  return groups.map((group) => ({ ...group, entries: group.entries.filter((entry) => !needle || columns.some((item) => String(item.display?.(entry, group) ?? item.value(entry, group)).toLocaleLowerCase().includes(needle))).toSorted((left, right) => { const a = sortColumn.value(left, group); const b = sortColumn.value(right, group); const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }); return sort.descending ? -compared : compared }) })).filter((group) => group.entries.length > 0)
}

function localizeColumns(columns: readonly KisakiResultColumn[], t: Translate): KisakiResultColumn[] {
  return columns.map((item) => ({ ...item, label: t(`result.columns.${item.id}`, item.label) }))
}

function defaultColumnWidth(id: KisakiResultColumnId): number {
  if (id === "path" || id === "target") return 320
  if (id === "name" || id === "title" || id === "artist" || id === "error") return 160
  if (id === "modified") return 176
  if (id === "currentExtension" || id === "properExtension") return 132
  return 104
}

function defaultSort(tool: KisakiTool): KisakiResultColumnId { return tool === "big-files" ? "size" : "path" }
function extension(name: string): string { const index = name.lastIndexOf("."); return index > 0 ? name.slice(index + 1) : "" }
function numeric(value: string | undefined): number { const parsed = Number.parseFloat(value ?? ""); return Number.isFinite(parsed) ? parsed : 0 }
function formatFps(value: number | undefined): string { return value === undefined ? "—" : `${Number(value.toFixed(2))} fps` }
function unique(values: string[]): string[] { return [...new Set(values)] }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
function formatDate(value: number): string { if (!value) return "—"; const milliseconds = value < 10_000_000_000 ? value * 1000 : value; return new Date(milliseconds).toLocaleString() }
function formatBytes(bytes: number): string { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB", "TB"]; let value = bytes / 1024; let unit = units[0]!; for (let index = 1; index < units.length && value >= 1024; index += 1) { value /= 1024; unit = units[index]! } return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}` }
function isInteractiveTarget(target: EventTarget | null): boolean { return target instanceof Element && Boolean(target.closest("button, input, a, [role=checkbox], [role=menu], [role=menuitem], [data-no-box-select]")) }
