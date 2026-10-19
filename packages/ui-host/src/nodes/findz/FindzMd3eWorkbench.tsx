import { useEffect, useMemo, useRef, useState } from "react"
import type {
  FindzArchiveRow,
  FindzLibrarySummary,
  FindzMemberRow,
  FindzTask,
  FindzTreemapNode,
} from "@xiranite/findz-native"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Filter,
  Folder,
  FolderOpen,
  Image,
  Layers,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { RuleTreeEditor, type RuleFieldDef, type RuleGroup } from "@/nodes/shared/RuleTreeEditor"
import {
  Md3eChoiceChips,
  Md3eCommandDock,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eShapeBadge,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface as NodeSurfaceState } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { FindzTreemap } from "./Treemap"
import { formatBytes, formatDensity, taskProgressPercent } from "./format"
import { isTerminalTask, type FindzArchiveSort, type FindzCardState } from "./types"
import type { FindzWorkspaceLayout } from "./workspace-layout"

export interface FindzMd3eWorkbenchProps {
  surface: NodeSurfaceState
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  card: FindzCardState
  root: string
  libraryIdDraft: string
  library?: FindzLibrarySummary
  archives: FindzArchiveRow[]
  members?: FindzMemberRow[]
  treemap?: FindzTreemapNode
  task?: FindzTask
  archivePage: { total: number; nextCursor?: string }
  hasPreviousPage: boolean
  hasNextPage: boolean
  busy: boolean
  error?: string
  filtersOpen: boolean
  selectionRevision: number
  breadcrumb: string[]
  workspaceLayout: FindzWorkspaceLayout
  rules: RuleGroup
  ruleFields: RuleFieldDef[]
  areaMetrics: Array<{ value: NonNullable<FindzCardState["areaBy"]>; label: string }>
  onFiltersOpenChange: (open: boolean) => void
  onWorkspaceLayoutChange: (layout: FindzWorkspaceLayout) => void
  onRootChange: (root: string) => void
  onLibraryIdChange: (id: string) => void
  onOpenLibrary: () => void
  onScan: () => void
  onAnalyze: () => void
  onPauseTask: () => void
  onResumeTask: () => void
  onCancelTask: () => void
  onSearchTextChange: (text: string) => void
  onRulesChange: (rules: RuleGroup) => void
  onAreaMetricChange: (areaBy: NonNullable<FindzCardState["areaBy"]>) => void
  onSelectArchive: (archiveId: number) => void
  onDeepRetryMember: (memberId: number) => void
  onDrill: (pathPrefix: string) => void
  onSort: (sortBy: FindzArchiveSort) => void
  onPreviousPage: () => void
  onNextPage: () => void
  onExport: (format: "json" | "csv") => void
}

export function FindzMd3eWorkbench(props: FindzMd3eWorkbenchProps) {
  const { t, library, task, busy } = props
  const [stageLens, setStageLens] = useState<"studio" | "explorer" | "treemap" | "rules">("studio")
  const compactActions = (props.surface.width ?? 0) < 360

  const taskActive = Boolean(task && !isTerminalTask(task))
  const degraded = library?.watcherHealth === "degraded"
  const taskProgress = task ? taskProgressPercent(task) : library ? 100 : 0

  const watcherStatusLabel = library
    ? library.watcherHealth === "healthy"
      ? t("workspace.header.watching", "Watching")
      : t("workspace.header.watcherDegraded", "Watcher degraded")
    : t("workspace.header.noLibrary", "No library")

  const statusTone = degraded ? "danger" : taskActive ? "primary" : library ? "secondary" : "neutral"
  const subtitle = library
    ? t("workspace.header.librarySummary", "{{archives}} archives · {{members}} members", {
        archives: library.archiveCount.toLocaleString(),
        members: library.memberCount.toLocaleString(),
      })
    : t("workspace.header.openLibraryHint", "Open a local library to create its separate Findz index.")

  const activeAreaMetric =
    props.areaMetrics.find((m) => m.value === (props.card.areaBy ?? "archiveSize")) ?? props.areaMetrics[0]

  const stats = [
    { label: "归档总数", value: library?.archiveCount ?? 0, tone: "primary" as const },
    { label: "内部成员", value: library?.memberCount ?? 0, tone: "secondary" as const },
    { label: "当前匹配", value: props.archivePage.total, tone: "tertiary" as const },
    { label: "索引进度", value: `${taskProgress}%`, tone: "neutral" as const },
  ]

  return (
    <Md3eNodeSurface
      nodeId="findz"
      surface={props.surface}
      data-testid="findz-workspace"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 overflow-hidden p-2.5 text-foreground"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Archive}
          title="Findz"
          domainTag="ARCHIVE SPATIAL INDEX"
          statusLabel={watcherStatusLabel}
          statusTone={statusTone}
          subtitle={subtitle}
          progress={taskProgress}
          running={taskActive}
          stats={stats}
          toolbarTestId="findz-header-toolbar"
          actions={
            <>
              <Button
                aria-label={t("workspace.header.scanLibrary", "Scan library")}
                variant="secondary"
                size="icon-sm"
                shapeRole="toolbar"
                className="rounded-full"
                disabled={!library || busy}
                onClick={props.onScan}
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                aria-label={t("workspace.header.analyzeHeaders", "Analyze image headers")}
                variant="secondary"
                size="icon-sm"
                shapeRole="toolbar"
                className="rounded-full"
                disabled={!library || busy}
                onClick={props.onAnalyze}
              >
                <ScanLine className="size-3.5" />
              </Button>

              {taskActive && task ? (
                <>
                  {task.status === "paused" ? (
                    <Button
                      aria-label={t("workspace.header.resumeTask", "Resume task")}
                      size="icon-sm"
                      variant="secondary"
                      shapeRole="toolbar"
                      className="rounded-full"
                      onClick={props.onResumeTask}
                    >
                      <Play className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      aria-label={t("workspace.header.pauseTask", "Pause task")}
                      size="icon-sm"
                      variant="secondary"
                      shapeRole="toolbar"
                      className="rounded-full"
                      onClick={props.onPauseTask}
                    >
                      <Pause className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    aria-label={t("workspace.header.cancelTask", "Cancel task")}
                    size="icon-sm"
                    variant="destructive"
                    shapeRole="toolbar"
                    className="rounded-full"
                    onClick={props.onCancelTask}
                  >
                    <Square className="size-3.5" />
                  </Button>
                </>
              ) : null}
            </>
          }
        />
      </FloatingWindowNodeHeader>

      {props.error ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 rounded-[18px] bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{props.error}</span>
        </div>
      ) : null}

      {/* Top Expressive Stage Lens & Breadcrumb Ribbon */}
      <div
        aria-label={t("workspace.lanes.scope", "Library scope")}
        data-testid="findz-scope-lane"
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-1.5"
      >
        <Md3eStageLensBar
          ariaLabel="Findz 空间工作台镜头"
          items={[
            { id: "studio", label: "双翼全景台", icon: Layers },
            { id: "explorer", label: "归档层次流", icon: Archive, badge: props.archivePage.total },
            { id: "treemap", label: "空间热力树图", icon: BarChart3 },
            { id: "rules", label: "布尔规则树", icon: Filter },
          ]}
          value={stageLens}
          onChange={setStageLens}
        />

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Button
            size="xs"
            shapeRole="tab"
            className="h-6 rounded-full px-2.5 font-bold"
            variant={props.breadcrumb.length ? "ghost" : "secondary"}
            onClick={() => props.card.libraryId && props.onDrill("")}
          >
            {t("workspace.library", "Library")}
          </Button>
          {props.breadcrumb.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-0.5">
              <span className="opacity-45">/</span>
              <Button
                size="xs"
                shapeRole="tab"
                className="h-6 rounded-full px-2.5 font-bold"
                variant={index === props.breadcrumb.length - 1 ? "secondary" : "ghost"}
                onClick={() => props.card.libraryId && props.onDrill(props.breadcrumb.slice(0, index + 1).join("/"))}
              >
                {segment}
              </Button>
            </span>
          ))}
          <Button
            aria-label={t("workspace.exportJson", "Export filtered archives as JSON")}
            size="xs"
            variant="secondary"
            className="h-6 rounded-full px-2.5 font-bold"
            disabled={!props.card.libraryId || busy}
            onClick={() => props.onExport("json")}
          >
            <Download className="size-3" />
            JSON
          </Button>
          <Button
            aria-label={t("workspace.exportCsv", "Export filtered archives as CSV")}
            size="xs"
            variant="secondary"
            className="h-6 rounded-full px-2.5 font-bold"
            disabled={!props.card.libraryId || busy}
            onClick={() => props.onExport("csv")}
          >
            <Download className="size-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Main Asymmetric Tonal Canvas (Zero Swimlane Reskin) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-hidden @3xl/findz:grid-cols-[minmax(280px,0.92fr)_minmax(0,1.58fr)]">
        {/* Left Tonal Control Column */}
        {(stageLens === "studio" || stageLens === "rules") ? (
          <div
            data-testid="findz-source-lane"
            className={cn(
              "flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5",
              stageLens === "rules" && "@3xl/findz:col-span-2",
            )}
          >
            <Md3eTonalZone
              tone="primary"
              eyebrow="LIBRARY MOUNT"
              title="归档索引库挂载"
              badge={
                <Md3eStatusPill tone={library ? "primary" : "neutral"}>
                  {library ? `ID: ${library.libraryId}` : "未挂载"}
                </Md3eStatusPill>
              }
            >
              <div className="grid gap-2">
                <Input
                  aria-label={t("workspace.header.rootLabel", "Findz library root")}
                  value={props.root}
                  placeholder={t("workspace.header.rootPlaceholder", "Local ZIP / CBZ library root")}
                  className="h-8 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] px-3 font-mono text-xs"
                  onChange={(event) => props.onRootChange(event.target.value)}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                  <Input
                    className="h-8 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] px-3 font-mono text-xs"
                    aria-label={t("workspace.header.libraryIdLabel", "Library id")}
                    value={props.libraryIdDraft}
                    placeholder={t("workspace.header.libraryIdPlaceholder", "Index name")}
                    onChange={(event) => props.onLibraryIdChange(event.target.value)}
                  />
                  <Button
                    size="sm"
                    shapeRole="primary"
                    className="rounded-full font-black"
                    disabled={!props.root.trim() || busy}
                    onClick={props.onOpenLibrary}
                  >
                    <FolderOpen className="size-3.5" />
                    {t("workspace.header.openLibrary", "Open library")}
                  </Button>
                </div>
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="QUERY & RULE MATRIX"
              title="全文检索与条件规则树"
              testId="findz-query-lane"
              className="flex-1"
              bodyClassName="flex flex-col gap-2"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t("workspace.searchLabel", "Search Findz index")}
                  className="h-8 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] pl-8 pr-3 text-xs"
                  value={props.card.text ?? ""}
                  placeholder={t("workspace.searchPlaceholder", "Search archive and member paths")}
                  onChange={(event) => props.onSearchTextChange(event.target.value)}
                />
              </div>
              <div className="rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/80 p-2.5">
                <RuleTreeEditor
                  value={props.rules}
                  fields={props.ruleFields}
                  t={t}
                  onValueChange={props.onRulesChange}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="tertiary"
              eyebrow="AREA WEIGHT"
              title="空间树图面积维度"
            >
              <Md3eChoiceChips
                ariaLabel="树图面积权重"
                options={props.areaMetrics.map((m) => ({ value: m.value, label: m.label }))}
                value={(props.card.areaBy ?? "archiveSize") as NonNullable<FindzCardState["areaBy"]>}
                onChange={props.onAreaMetricChange}
              />
            </Md3eTonalZone>
          </div>
        ) : null}

        {/* Right Tonal Explorer + Treemap Deck */}
        {stageLens !== "rules" ? (
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-2.5 overflow-hidden",
              stageLens === "studio"
                ? "grid-rows-[minmax(0,1.15fr)_minmax(180px,0.85fr)]"
                : "grid-rows-1 @3xl/findz:col-span-2",
            )}
          >
            {(stageLens === "studio" || stageLens === "explorer") ? (
              <Md3eTonalZone
                tone="default"
                eyebrow="ARCHIVE HIERARCHY"
                title={t("workspace.lanes.hierarchy", "归档层次与成员透视")}
                testId="findz-results-lane"
                bodyClassName="flex min-h-0 flex-col overflow-hidden"
              >
                <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
                  <Md3eFindzArchiveExplorer
                    t={t}
                    archives={props.archives}
                    members={props.members}
                    pathPrefix={props.card.pathPrefix}
                    selectedArchiveId={props.card.selectedArchiveId}
                    selectionRevision={props.selectionRevision}
                    sortBy={props.card.sortBy ?? "archiveSize"}
                    sortDesc={props.card.sortDesc ?? true}
                    total={props.archivePage.total}
                    hasPreviousPage={props.hasPreviousPage}
                    hasNextPage={props.hasNextPage}
                    onSelectArchive={props.onSelectArchive}
                    onDeepRetryMember={props.onDeepRetryMember}
                    onDrillFolder={props.onDrill}
                    onSort={props.onSort}
                    onPreviousPage={props.onPreviousPage}
                    onNextPage={props.onNextPage}
                  />
                </div>
              </Md3eTonalZone>
            ) : null}

            {(stageLens === "studio" || stageLens === "treemap") ? (
              <Md3eTonalZone
                tone="default"
                eyebrow="SPATIAL TREEMAP"
                title={`${t("workspace.treemap", "Treemap")} · ${activeAreaMetric?.label ?? ""}`}
                testId="findz-treemap-lane"
                actions={
                  <Select
                    value={props.card.areaBy ?? "archiveSize"}
                    onValueChange={(areaBy) => props.onAreaMetricChange(areaBy as NonNullable<FindzCardState["areaBy"]>)}
                  >
                    <SelectTrigger
                      aria-label={t("workspace.areaMetricLabel", "Treemap area metric")}
                      size="sm"
                      className="h-7 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] px-2.5 text-xs font-bold"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {props.areaMetrics.map((metric) => (
                        <SelectItem key={metric.value} value={metric.value}>
                          {metric.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                bodyClassName="flex min-h-0 flex-col overflow-hidden"
              >
                <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-1.5">
                  <FindzTreemap
                    projection={props.treemap}
                    selectedArchiveId={props.card.selectedArchiveId}
                    onSelectArchive={props.onSelectArchive}
                    onDrill={props.onDrill}
                  />
                </div>
              </Md3eTonalZone>
            ) : null}
          </div>
        ) : null}
      </div>

      <Md3eCommandDock
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Md3eStatusPill tone={library ? "primary" : "neutral"}>
              <Database className="mr-1 inline size-3" />
              {library ? `${library.archiveCount} 归档 · ${library.memberCount} 成员` : "等待挂载索引库"}
            </Md3eStatusPill>
            <span className="truncate text-xs text-muted-foreground">
              面积维度：{activeAreaMetric?.label ?? "归档体积"}
            </span>
          </div>
        }
        trailing={
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            <Button
              aria-label="扫描中央目录"
              size="sm"
              variant="secondary"
              className={cn("rounded-full font-bold", compactActions && "size-8 px-0")}
              disabled={!library || busy}
              onClick={props.onScan}
            >
              <RefreshCw className="size-3.5" />
              {!compactActions ? "扫描中央目录" : null}
            </Button>
            <Button
              aria-label="解析图像头"
              size="sm"
              className={cn("rounded-full font-extrabold", compactActions && "size-8 px-0")}
              disabled={!library || busy}
              onClick={props.onAnalyze}
            >
              <ScanLine className="size-3.5" />
              {!compactActions ? "解析图像头" : null}
            </Button>
          </div>
        }
      />
    </Md3eNodeSurface>
  )
}

const SORT_COLUMNS: Array<{ id: FindzArchiveSort; labelKey: string; fallback: string }> = [
  { id: "archiveSize", labelKey: "workspace.columns.archiveSize", fallback: "Size" },
  { id: "name", labelKey: "workspace.columns.name", fallback: "Name" },
  { id: "memberCount", labelKey: "workspace.columns.memberCount", fallback: "Members" },
  { id: "maxAspectRatio", labelKey: "workspace.columns.maxAspectRatio", fallback: "Ratio" },
  { id: "modifiedUnixMs", labelKey: "workspace.columns.modifiedUnixMs", fallback: "Modified" },
]

interface FolderNode {
  name: string
  path: string
  folders: Map<string, FolderNode>
  archives: FindzArchiveRow[]
}

function createFolderNode(name = "", path = ""): FolderNode {
  return { name, path, folders: new Map(), archives: [] }
}

function buildHierarchy(archives: FindzArchiveRow[], pathPrefix?: string): FolderNode {
  const root = createFolderNode()
  const basePrefix = pathPrefix ? `${pathPrefix.replace(/\/+$/, "")}/` : ""

  for (const archive of archives) {
    const relativeFolder = archive.folderPath.startsWith(basePrefix)
      ? archive.folderPath.slice(basePrefix.length)
      : archive.folderPath.replace(/^\/+/, "")
    const segments = relativeFolder.split("/").filter(Boolean)

    let current = root
    let accumulated = pathPrefix ? pathPrefix.replace(/\/+$/, "") : ""

    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment
      let next = current.folders.get(segment)
      if (!next) {
        next = createFolderNode(segment, accumulated)
        current.folders.set(segment, next)
      }
      current = next
    }

    current.archives.push(archive)
  }

  return root
}

function sortedFolders(node: FolderNode): FolderNode[] {
  return [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function folderPathsForArchive(archive: FindzArchiveRow, pathPrefix?: string): string[] {
  const basePrefix = pathPrefix ? `${pathPrefix.replace(/\/+$/, "")}/` : ""
  const relativeFolder = archive.folderPath.startsWith(basePrefix)
    ? archive.folderPath.slice(basePrefix.length)
    : archive.folderPath.replace(/^\/+/, "")
  const segments = relativeFolder.split("/").filter(Boolean)
  const paths: string[] = []
  let accumulated = pathPrefix ? pathPrefix.replace(/\/+$/, "") : ""

  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment
    paths.push(accumulated)
  }

  return paths
}

export function Md3eFindzArchiveExplorer({
  t,
  archives,
  members,
  pathPrefix,
  selectedArchiveId,
  selectionRevision,
  sortBy,
  sortDesc,
  total,
  hasPreviousPage,
  hasNextPage,
  onSelectArchive,
  onDeepRetryMember,
  onDrillFolder,
  onSort,
  onPreviousPage,
  onNextPage,
}: {
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  archives: FindzArchiveRow[]
  members?: FindzMemberRow[]
  pathPrefix?: string
  selectedArchiveId?: number
  selectionRevision: number
  sortBy: FindzArchiveSort
  sortDesc: boolean
  total: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  onSelectArchive(archiveId: number): void
  onDeepRetryMember(memberId: number): void
  onDrillFolder(pathPrefix: string): void
  onSort(sortBy: FindzArchiveSort): void
  onPreviousPage(): void
  onNextPage(): void
}) {
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())
  const archiveRows = useRef(new Map<number, HTMLElement>())
  const hierarchy = useMemo(() => buildHierarchy(archives, pathPrefix), [archives, pathPrefix])

  useEffect(() => {
    if (selectedArchiveId === undefined) return
    const selectedArchive = archives.find((a) => a.id === selectedArchiveId)
    if (!selectedArchive) return
    const ancestors = folderPathsForArchive(selectedArchive, pathPrefix)
    if (!ancestors.length) return
    setCollapsedFolders((current) => {
      const next = new Set(current)
      let changed = false
      for (const folderPath of ancestors) changed = next.delete(folderPath) || changed
      return changed ? next : current
    })
  }, [archives, pathPrefix, selectedArchiveId, selectionRevision])

  function toggleFolder(path: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function renderFolder(node: FolderNode, depth: number): React.ReactNode {
    const isCollapsed = collapsedFolders.has(node.path)
    return (
      <div key={`folder:${node.path}`} className="flex flex-col gap-1">
        {node.path ? (
          <div
            className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-1.5 text-xs"
            style={{ marginLeft: `${depth * 12}px` }}
          >
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-bold"
            >
              <Folder className="size-3.5 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
              <span className="truncate">{node.name}</span>
            </button>
            <Button
              size="xs"
              variant="ghost"
              className="h-6 rounded-full px-2 text-[10px]"
              onClick={() => onDrillFolder(node.path)}
            >
              进入
            </Button>
          </div>
        ) : null}
        {!isCollapsed && (
          <>
            {sortedFolders(node).map((child) => renderFolder(child, node.path ? depth + 1 : depth))}
            {node.archives.map((archive) => (
              <Md3eArchiveCard
                key={archive.id}
                archive={archive}
                depth={node.path ? depth + 1 : depth}
                expanded={selectedArchiveId === archive.id}
                members={selectedArchiveId === archive.id ? members : undefined}
                onSelect={onSelectArchive}
                onDeepRetryMember={onDeepRetryMember}
                rowRef={(el) => {
                  if (el) archiveRows.current.set(archive.id, el)
                  else archiveRows.current.delete(archive.id)
                }}
                t={t}
              />
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {SORT_COLUMNS.map((col) => {
            const active = sortBy === col.id
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => onSort(col.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all",
                  active
                    ? "bg-[var(--md3e-primary,var(--primary))] text-[var(--md3e-on-primary,var(--primary-foreground))]"
                    : "bg-[var(--md3e-surface-high,var(--card))] text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{t(col.labelKey, col.fallback)}</span>
                {active ? sortDesc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Button
            size="icon-xs"
            variant="secondary"
            className="rounded-full"
            disabled={!hasPreviousPage}
            onClick={onPreviousPage}
            aria-label="上一页"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">{total}</span>
          <Button
            size="icon-xs"
            variant="secondary"
            className="rounded-full"
            disabled={!hasNextPage}
            onClick={onNextPage}
            aria-label="下一页"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {archives.length ? (
          <div className="flex flex-col gap-1.5 pr-1">{renderFolder(hierarchy, 0)}</div>
        ) : (
          <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
            挂载归档库并运行扫描后，这里将展示归档层次与成员列表。
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function Md3eArchiveCard({
  archive,
  depth,
  expanded,
  members,
  onSelect,
  onDeepRetryMember,
  rowRef,
  t,
}: {
  archive: FindzArchiveRow
  depth: number
  expanded: boolean
  members?: FindzMemberRow[]
  onSelect(archiveId: number): void
  onDeepRetryMember(memberId: number): void
  rowRef(row: HTMLElement | null): void
  t: FindzMd3eWorkbenchProps["t"]
}) {
  const density = formatDensity(archive.uncompressedSize, archive.archiveSize)
  return (
    <div
      ref={rowRef}
      className={cn(
        "flex flex-col rounded-[16px] p-2.5 transition-all",
        expanded
          ? "bg-[var(--md3e-primary-container,var(--card))]/45 rounded-[22px]"
          : "bg-[var(--md3e-surface-high,var(--card))] hover:rounded-[20px]",
      )}
      style={{ marginLeft: `${depth * 14}px` }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(archive.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(archive.id)
          }
        }}
        className="flex cursor-pointer items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Md3eShapeBadge icon={Archive} tone={expanded ? "primary" : "neutral"} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-xs font-bold text-foreground">{archive.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">· {archive.memberCount} 成员</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{formatBytes(archive.archiveSize)}</span>
              {density ? <span>(压缩比 {density})</span> : null}
            </div>
          </div>
        </div>
        <Md3eStatusPill tone={archive.health === "healthy" ? "secondary" : "danger"}>
          {archive.health === "healthy" ? "Healthy" : archive.health}
        </Md3eStatusPill>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))]/80 p-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("workspace.members", "Members")} ({archive.memberCount})
          </div>
          {members ? (
            <div className="flex flex-col gap-1">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-1.5 rounded-[10px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-1 text-xs"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Image className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-[11px] text-foreground">{member.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <span>{formatBytes(member.uncompressedSize)}</span>
                    {member.width && member.height ? (
                      <span>{member.width}×{member.height}</span>
                    ) : null}
                    {member.formatAnomaly ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-5 rounded-full px-1.5 text-[10px] text-destructive"
                        onClick={() => onDeepRetryMember(member.id)}
                      >
                        重试
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!members.length && (
                <div className="py-1 text-[11px] text-muted-foreground">No members in archive.</div>
              )}
            </div>
          ) : (
            <div className="py-1 text-[11px] text-muted-foreground">Loading member list…</div>
          )}
        </div>
      )}
    </div>
  )
}
