import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Filter,
  Folder,
  FolderOpen,
  HardDrive,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { RuleTreeEditor, type RuleFieldDef, type RuleGroup } from "@/nodes/shared/RuleTreeEditor"
import {
  Md3eActionGroup,
  Md3eBentoStatGrid,
  Md3eHeaderBanner,
  Md3eHeroActionBar,
  Md3eNodeSurface,
  Md3ePatchBackdrop,
  Md3eSectionCard,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
  Md3eStatusPill,
  Md3eWavyProgress,
} from "@/nodes/shared/controls"
import { useWorkspaceActions } from "@/store/workspaceStore"
import type { NodeSurface as NodeSurfaceState } from "@/nodes/shared/useNodeSurface"
import { FindzSwimlaneWorkspace } from "./FindzSwimlaneWorkspace"
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
  const { setUiFace } = useWorkspaceActions()
  const { t, library, task, busy } = props
  const taskActive = Boolean(task && !isTerminalTask(task))
  const degraded = library?.watcherHealth === "degraded"
  const taskProgress = task ? taskProgressPercent(task) : library ? 100 : 0

  const watcherStatusLabel = library
    ? library.watcherHealth === "healthy"
      ? t("workspace.header.watching", "Watching")
      : t("workspace.header.watcherDegraded", "Watcher degraded")
    : t("workspace.header.noLibrary", "No library")

  const statusTone = degraded ? "error" : taskActive ? "running" : library ? "success" : "idle"
  const subtitle = library
    ? t("workspace.header.librarySummary", "{{archives}} archives · {{members}} members", {
        archives: library.archiveCount.toLocaleString(),
        members: library.memberCount.toLocaleString(),
      })
    : t("workspace.header.openLibraryHint", "Open a local library to create its separate Findz index.")

  const activeAreaMetric = props.areaMetrics.find((m) => m.value === (props.card.areaBy ?? "archiveSize")) ?? props.areaMetrics[0]

  return (
    <Md3eNodeSurface
      nodeId="findz"
      surface={props.surface}
      data-testid="findz-workspace"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-1.5 overflow-hidden rounded-[24px] bg-[var(--md3e-surface-low,var(--background))] p-2 text-foreground"
    >
      {/* 1. Rossi Compact Expressive Top Bar */}
      <FloatingWindowNodeHeader>
        <Md3eHeaderBanner
          icon={Archive}
          title="Findz"
          subtitle={subtitle}
          status={{ label: watcherStatusLabel, tone: statusTone }}
          pills={
            <>
              {degraded && <TriangleAlert className="size-3.5 text-destructive" />}
              {task && (
                <Md3eStatusPill
                  label={`${t(`workspace.taskKinds.${task.kind}`, task.kind)} · ${t(`workspace.taskStatus.${task.status}`, task.status)}`}
                  tone={taskActive ? "running" : "secondary"}
                  compact
                />
              )}
              <Md3eStatusPill label={`${props.archivePage.total} 匹配`} tone="primary" compact dot={false} />
            </>
          }
          testId="findz-header-toolbar"
          actions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    aria-label="切换到传统界面"
                    size="xs"
                    variant="secondary"
                    shapeRole="toolbar"
                    className="gap-1 rounded-full font-bold"
                    onClick={() => setUiFace("legacy")}
                  >
                    <Sparkles className="size-3 text-primary" />
                    <span>Legacy 旧版</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>切换回 Findz 传统旧版 UI</TooltipContent>
              </Tooltip>
              <Md3eShapePopoverButton nodeId="findz" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("workspace.header.scanLibrary", "Scan library")}
                    variant="outline"
                    size="icon-sm"
                    shapeRole="toolbar"
                    disabled={!library || busy}
                    onClick={props.onScan}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("workspace.header.scanTooltip", "Scan ZIP central directories")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("workspace.header.analyzeHeaders", "Analyze image headers")}
                    variant="outline"
                    size="icon-sm"
                    shapeRole="toolbar"
                    disabled={!library || busy}
                    onClick={props.onAnalyze}
                  >
                    <ScanLine className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("workspace.header.analyzeTooltip", "Analyze image headers on demand")}</TooltipContent>
              </Tooltip>
              {taskActive && task && (
                <>
                  {task.status === "paused" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("workspace.header.resumeTask", "Resume task")}
                          size="icon-sm"
                          variant="outline"
                          shapeRole="toolbar"
                          onClick={props.onResumeTask}
                        >
                          <Play className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("workspace.header.resumeTask", "Resume task")}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("workspace.header.pauseTask", "Pause task")}
                          size="icon-sm"
                          variant="outline"
                          shapeRole="toolbar"
                          onClick={props.onPauseTask}
                        >
                          <Pause className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("workspace.header.pauseTask", "Pause task")}</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("workspace.header.cancelTask", "Cancel task")}
                        size="icon-sm"
                        variant="outline"
                        shapeRole="toolbar"
                        onClick={props.onCancelTask}
                      >
                        <Square className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("workspace.header.cancelTask", "Cancel task")}</TooltipContent>
                  </Tooltip>
                </>
              )}
            </>
          }
        />
      </FloatingWindowNodeHeader>

      {/* Error Alert Banner */}
      {props.error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 rounded-[16px] bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{props.error}</span>
        </div>
      )}

      {/* Active Task Wavy Progress Strip */}
      {task && !isTerminalTask(task) ? (
        <Md3ePatchBackdrop
          seed="findz-task-progress"
          tone="primary"
          asymmetric="sm"
          className="flex shrink-0 items-center gap-2.5 rounded-[18px] bg-[var(--md3e-surface,var(--card))] px-3 py-1.5"
          data-testid="findz-task-progressbar"
        >
          <span className="shrink-0 text-xs font-black tracking-tight text-foreground">
            {t(`workspace.taskKinds.${task.kind}`, task.kind)} · {t(`workspace.taskStatus.${task.status}`, task.status)}
          </span>
          <Md3eWavyProgress value={taskProgress} active className="min-w-0 flex-1" />
          <span className="shrink-0 rounded-full bg-[var(--md3e-primary-container,var(--secondary))] px-2 py-0.5 font-mono text-[10px] font-black tabular-nums text-[var(--md3e-on-primary-container,var(--foreground))]">
            {taskProgress}%
          </span>
        </Md3ePatchBackdrop>
      ) : null}

      {/* 2. Ground-up MD3E 3-Zone Swimlane Workbench (Full Vertical Height) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px]">
        <FindzSwimlaneWorkspace
          layout={props.workspaceLayout}
          onLayoutChange={props.onWorkspaceLayoutChange}
          labels={{
            enterSolo: t("workspace.laneActions.enterSolo", "Focus current lane"),
            exitSolo: t("workspace.laneActions.exitSolo", "Show all lanes"),
          }}
          lanes={{
            source: {
              label: t("workspace.lanes.source", "Source"),
              restoreLabel: t("workspace.laneActions.restoreSource", "Restore Source lane"),
              collapseLabel: t("workspace.laneActions.collapseSource", "Collapse Source lane"),
              resizeLabel: t("workspace.laneActions.resizeSource", "Resize Source lane"),
              defaultWidth: 360,
              content: (
                <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2" data-testid="findz-source-lane">
                  {/* Compact 2x2 Bento Stat Grid */}
                  <Md3eBentoStatGrid
                    className="grid-cols-2 gap-1.5"
                    items={[
                      { label: "归档总数", value: library?.archiveCount ?? 0, icon: Archive, tone: "primary" },
                      { label: "内部成员", value: library?.memberCount ?? 0, icon: Layers, tone: "secondary" },
                      { label: "当前匹配", value: props.archivePage.total, icon: Filter, tone: "tertiary" },
                      { label: "索引进度", value: `${taskProgress}%`, icon: Database, gauge: taskProgress },
                    ]}
                  />

                  {/* Library Mount Card */}
                  <Md3eSectionCard
                    seed="findz-library-mount"
                    title="归档索引库挂载"
                    badge="LIBRARY MOUNT"
                    description="挂载本地 ZIP / CBZ 归档目录并初始化独立 SQLite 索引库。"
                    icon={FolderOpen}
                  >
                    <div className="grid gap-2">
                      <Input
                        aria-label={t("workspace.header.rootLabel", "Findz library root")}
                        value={props.root}
                        placeholder={t("workspace.header.rootPlaceholder", "Local ZIP / CBZ library root")}
                        className="h-8 rounded-full border-0 bg-[var(--md3e-surface-high,var(--muted))]/85 px-3 font-mono text-xs"
                        onChange={(event) => props.onRootChange(event.target.value)}
                      />
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                        <Input
                          className="h-8 rounded-full border-0 bg-[var(--md3e-surface-high,var(--muted))]/85 px-3 font-mono text-xs"
                          aria-label={t("workspace.header.libraryIdLabel", "Library id")}
                          value={props.libraryIdDraft}
                          placeholder={t("workspace.header.libraryIdPlaceholder", "Index name")}
                          onChange={(event) => props.onLibraryIdChange(event.target.value)}
                        />
                        <Md3eStatusPill
                          label={library ? `ID: ${library.libraryId}` : "未挂载"}
                          tone={library ? "primary" : "neutral"}
                          compact
                        />
                      </div>
                      <Button
                        size="sm"
                        shapeRole="primary"
                        className="w-full rounded-full font-black"
                        disabled={!props.root.trim() || busy}
                        onClick={props.onOpenLibrary}
                      >
                        <FolderOpen className="size-3.5" />
                        {t("workspace.header.openLibrary", "Open library")}
                      </Button>
                    </div>
                  </Md3eSectionCard>

                  {/* Search & Rule Tree Filter Card */}
                  <Md3eSectionCard
                    seed="findz-query-card"
                    title="全文检索与规则树"
                    badge="QUERY & RULES"
                    description="按归档/成员路径快速检索，或展开多层级布尔条件树。"
                    icon={Search}
                    aria-label={t("workspace.lanes.query", "Search and filters")}
                    data-testid="findz-query-lane"
                  >
                    <Collapsible open={props.filtersOpen} onOpenChange={props.onFiltersOpenChange}>
                      <div className="flex flex-col gap-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            aria-label={t("workspace.searchLabel", "Search Findz index")}
                            className="h-8 rounded-full border-0 bg-[var(--md3e-surface-high,var(--muted))]/85 pl-8 pr-3 text-xs"
                            value={props.card.text ?? ""}
                            placeholder={t("workspace.searchPlaceholder", "Search archive and member paths")}
                            onChange={(event) => props.onSearchTextChange(event.target.value)}
                          />
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button
                            aria-label={t("workspace.advancedFilters", "Advanced filters")}
                            size="sm"
                            shapeRole="secondary"
                            variant={props.filtersOpen ? "default" : "secondary"}
                            className="w-full justify-between rounded-full px-3 font-bold"
                          >
                            <span className="flex items-center gap-1.5">
                              <Filter className="size-3.5" />
                              {t("workspace.filters", "Filters")}
                            </span>
                            <ChevronDown className={cn("size-3.5 transition-transform", props.filtersOpen && "rotate-180")} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent className="mt-2 rounded-[16px] bg-[var(--md3e-surface-low,var(--background))]/80 p-2.5">
                        <RuleTreeEditor
                          value={props.rules}
                          fields={props.ruleFields}
                          t={t}
                          onValueChange={props.onRulesChange}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </Md3eSectionCard>

                  {/* Spatial Area Metric Selector Card */}
                  <Md3eSectionCard
                    seed="findz-metric-selector"
                    title="树图面积权重"
                    badge="AREA METRIC"
                    icon={BarChart3}
                  >
                    <div className="grid gap-1">
                      {props.areaMetrics.map((metric) => (
                        <button
                          key={metric.value}
                          type="button"
                          onClick={() => props.onAreaMetricChange(metric.value)}
                          className={cn(
                            "flex items-center justify-between rounded-[12px] px-3 py-1.5 text-xs font-bold transition-all text-left",
                            (props.card.areaBy ?? "archiveSize") === metric.value
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-[var(--md3e-surface-high,var(--muted))]/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span>{metric.label}</span>
                          {(props.card.areaBy ?? "archiveSize") === metric.value && <Sparkles className="size-3" />}
                        </button>
                      ))}
                    </div>
                  </Md3eSectionCard>
                </div>
              ),
            },
            results: {
              label: t("workspace.lanes.results", "Results"),
              restoreLabel: t("workspace.laneActions.restoreResults", "Restore Results lane"),
              collapseLabel: t("workspace.laneActions.collapseResults", "Collapse Results lane"),
              resizeLabel: t("workspace.laneActions.resizeResults", "Resize Results lane"),
              defaultWidth: 680,
              content: (
                <section
                  aria-labelledby="findz-hierarchy-heading"
                  className="flex h-full min-h-0 flex-col gap-1.5 p-1.5"
                  data-testid="findz-results-lane"
                >
                  {/* Single-Row Compact Scope Breadcrumb & Export Bar */}
                  <div
                    aria-label={t("workspace.lanes.scope", "Library scope")}
                    className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-[14px] bg-[var(--md3e-surface,var(--card))] px-2.5 py-1 text-xs text-muted-foreground"
                    data-testid="findz-scope-lane"
                  >
                    <h2 id="findz-hierarchy-heading" className="sr-only">
                      {t("workspace.lanes.hierarchy", "Archive hierarchy")}
                    </h2>
                    <span className="shrink-0 font-black tracking-tight text-foreground">
                      {t("workspace.lanes.scope", "Library scope")}
                    </span>
                    <Button
                      size="xs"
                      shapeRole="tab"
                      className="h-6 rounded-full px-2 font-bold"
                      variant={props.breadcrumb.length ? "ghost" : "secondary"}
                      onClick={() => props.card.libraryId && props.onDrill("")}
                    >
                      {t("workspace.library", "Library")}
                    </Button>
                    {props.breadcrumb.map((segment, index) => (
                      <span key={`${segment}-${index}`} className="flex items-center gap-0.5">
                        <span className="opacity-50">/</span>
                        <Button
                          size="xs"
                          shapeRole="tab"
                          className="h-6 rounded-full px-2 font-bold"
                          variant={index === props.breadcrumb.length - 1 ? "secondary" : "ghost"}
                          onClick={() => props.card.libraryId && props.onDrill(props.breadcrumb.slice(0, index + 1).join("/"))}
                        >
                          {segment}
                        </Button>
                      </span>
                    ))}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={t("workspace.exportJson", "Export filtered archives as JSON")}
                        size="xs"
                        shapeRole="toolbar"
                        variant="secondary"
                        className="h-6 rounded-full px-2 font-bold"
                        disabled={!props.card.libraryId || busy}
                        onClick={() => props.onExport("json")}
                      >
                        <Download className="size-3" />
                        JSON
                      </Button>
                      <Button
                        aria-label={t("workspace.exportCsv", "Export filtered archives as CSV")}
                        size="xs"
                        shapeRole="toolbar"
                        variant="secondary"
                        className="h-6 rounded-full px-2 font-bold"
                        disabled={!props.card.libraryId || busy}
                        onClick={() => props.onExport("csv")}
                      >
                        <Download className="size-3" />
                        CSV
                      </Button>
                    </span>
                  </div>

                  {/* Direct Full-Height Expressive Archive Explorer */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[var(--md3e-surface,var(--card))] p-1.5">
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
                </section>
              ),
            },
            analysis: {
              label: t("workspace.lanes.analysis", "Analysis"),
              restoreLabel: t("workspace.laneActions.restoreAnalysis", "Restore Analysis lane"),
              collapseLabel: t("workspace.laneActions.collapseAnalysis", "Collapse Analysis lane"),
              resizeLabel: t("workspace.laneActions.resizeAnalysis", "Resize Analysis lane"),
              defaultWidth: 400,
              content: (
                <section
                  aria-labelledby="findz-treemap-heading"
                  className="flex h-full min-h-0 flex-col gap-1.5 p-1.5"
                  data-testid="findz-treemap-lane"
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 rounded-[14px] bg-[var(--md3e-surface,var(--card))] px-2.5 py-1">
                    <h2 id="findz-treemap-heading" className="truncate text-xs font-black tracking-tight text-foreground">
                      {t("workspace.treemap", "Treemap")} · <span className="font-normal text-muted-foreground">{activeAreaMetric?.label ?? ""}</span>
                    </h2>
                    <Select
                      value={props.card.areaBy ?? "archiveSize"}
                      onValueChange={(areaBy) => props.onAreaMetricChange(areaBy as NonNullable<FindzCardState["areaBy"]>)}
                    >
                      <SelectTrigger
                        aria-label={t("workspace.areaMetricLabel", "Treemap area metric")}
                        size="sm"
                        className="h-7 rounded-full border-0 bg-[var(--md3e-surface-high,var(--muted))] px-2.5 text-xs font-bold"
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
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[var(--md3e-surface,var(--card))] p-1.5">
                    <FindzTreemap
                      projection={props.treemap}
                      selectedArchiveId={props.card.selectedArchiveId}
                      onSelectArchive={props.onSelectArchive}
                      onDrill={props.onDrill}
                    />
                  </div>
                </section>
              ),
            },
          }}
        />
      </div>
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

  useEffect(() => {
    if (selectedArchiveId === undefined) return
    archiveRows.current.get(selectedArchiveId)?.scrollIntoView({ block: "nearest" })
  }, [collapsedFolders, selectedArchiveId, selectionRevision])

  const setArchiveRow = useCallback((archiveId: number, row: HTMLElement | null) => {
    if (row) archiveRows.current.set(archiveId, row)
    else archiveRows.current.delete(archiveId)
  }, [])

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }, [])

  return (
    <div
      data-testid="findz-archive-table"
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-low,var(--background))]/70 p-1.5"
    >
      {/* Expressive Sort & Pagination Pill Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 rounded-full bg-[var(--md3e-surface-high,var(--muted))]/75 px-2.5 py-1">
        <div className="text-[11px] font-bold text-muted-foreground">
          {t("workspace.table.indexedSummary", "{{visible}} of {{total}} indexed archives", {
            visible: archives.length,
            total,
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {SORT_COLUMNS.map((col) => {
            const active = sortBy === col.id
            const SortIcon = sortDesc ? ArrowDown : ArrowUp
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => onSort(col.id)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-[var(--md3e-surface,var(--card))] text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{t(col.labelKey, col.fallback)}</span>
                {active && <SortIcon className="size-2.5" />}
              </button>
            )
          })}
        </div>
        <Md3eActionGroup>
          <Button
            aria-label={t("workspace.table.previousPage", "Previous archive page")}
            disabled={!hasPreviousPage}
            onClick={onPreviousPage}
            size="xs"
            shapeRole="toolbar"
            variant="secondary"
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="size-3" />
          </Button>
          <Button
            aria-label={t("workspace.table.nextPage", "Next archive page")}
            disabled={!hasNextPage}
            onClick={onNextPage}
            size="xs"
            shapeRole="toolbar"
            variant="secondary"
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="size-3" />
          </Button>
        </Md3eActionGroup>
      </div>

      {/* Expressive Hierarchy Card Stream */}
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="grid gap-1 p-0.5">
          <Md3eHierarchyNodes
            node={hierarchy}
            depth={0}
            collapsedFolders={collapsedFolders}
            selectedArchiveId={selectedArchiveId}
            members={members}
            onToggleFolder={toggleFolder}
            onDrillFolder={onDrillFolder}
            onSelectArchive={onSelectArchive}
            onDeepRetryMember={onDeepRetryMember}
            setArchiveRow={setArchiveRow}
            t={t}
          />
          {!archives.length && (
            <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-[16px] bg-[var(--md3e-surface,var(--card))]/70 p-4 text-center text-xs text-muted-foreground">
              <Md3eShapeBadge icon={Archive} seed="findz-empty" tone="primary" size="sm" />
              <span className="font-bold text-foreground/85">
                {t("workspace.table.empty", "Open a library, then run a ZIP scan to populate the index.")}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Md3eHierarchyNodes({
  node,
  depth,
  collapsedFolders,
  selectedArchiveId,
  members,
  onToggleFolder,
  onDrillFolder,
  onSelectArchive,
  onDeepRetryMember,
  setArchiveRow,
  t,
}: {
  node: FolderNode
  depth: number
  collapsedFolders: ReadonlySet<string>
  selectedArchiveId?: number
  members?: FindzMemberRow[]
  onToggleFolder(path: string): void
  onDrillFolder(path: string): void
  onSelectArchive(archiveId: number): void
  onDeepRetryMember(memberId: number): void
  setArchiveRow(archiveId: number, row: HTMLElement | null): void
  t: FindzMd3eWorkbenchProps["t"]
}) {
  return (
    <>
      {sortedFolders(node).map((folder) => {
        const collapsed = collapsedFolders.has(folder.path)
        return (
          <Md3eFolderCard
            key={folder.path}
            folder={folder}
            depth={depth}
            collapsed={collapsed}
            onToggle={onToggleFolder}
            onDrill={onDrillFolder}
            t={t}
          >
            {!collapsed && (
              <Md3eHierarchyNodes
                node={folder}
                depth={depth + 1}
                collapsedFolders={collapsedFolders}
                selectedArchiveId={selectedArchiveId}
                members={members}
                onToggleFolder={onToggleFolder}
                onDrillFolder={onDrillFolder}
                onSelectArchive={onSelectArchive}
                onDeepRetryMember={onDeepRetryMember}
                setArchiveRow={setArchiveRow}
                t={t}
              />
            )}
          </Md3eFolderCard>
        )
      })}
      {node.archives.map((archive) => (
        <Md3eArchiveCard
          key={archive.id}
          archive={archive}
          depth={depth}
          expanded={selectedArchiveId === archive.id}
          members={selectedArchiveId === archive.id ? members : undefined}
          onSelect={onSelectArchive}
          onDeepRetryMember={onDeepRetryMember}
          rowRef={(row) => setArchiveRow(archive.id, row)}
          t={t}
        />
      ))}
    </>
  )
}

function Md3eFolderCard({
  folder,
  depth,
  collapsed,
  onToggle,
  onDrill,
  t,
  children,
}: {
  folder: FolderNode
  depth: number
  collapsed: boolean
  onToggle(path: string): void
  onDrill(path: string): void
  t: FindzMd3eWorkbenchProps["t"]
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center justify-between gap-1.5 rounded-[12px] bg-[var(--md3e-surface-high,var(--muted))]/55 px-2 py-1 text-xs font-bold transition-colors hover:bg-[var(--md3e-surface-high,var(--muted))]"
        style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(folder.path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform text-muted-foreground", collapsed && "-rotate-90")} />
          <Folder className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-mono">{folder.name}</span>
        </button>
        <Button
          size="xs"
          variant="ghost"
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => onDrill(folder.path)}
        >
          {t("workspace.drill", "Drill")}
        </Button>
      </div>
      {children}
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
        "flex flex-col rounded-[14px] p-2 transition-all",
        expanded
          ? "bg-[var(--md3e-surface,var(--card))] ring-2 ring-primary/40 shadow-xs"
          : "bg-[var(--md3e-surface-high,var(--muted))]/45 hover:bg-[var(--md3e-surface-high,var(--muted))]/75",
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
          <Md3eShapeBadge icon={Archive} seed={archive.name} tone={expanded ? "primary" : "neutral"} size="sm" />
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
        <Md3eStatusPill
          label={archive.health === "healthy" ? "Healthy" : archive.health}
          tone={archive.health === "healthy" ? "tertiary" : "error"}
          compact
        />
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("workspace.members", "Members")} ({archive.memberCount})
          </div>
          {members ? (
            <div className="flex flex-col gap-1">
              {members.map((member) => (
                <Md3eMemberItem key={member.id} member={member} onDeepRetry={onDeepRetryMember} />
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

function Md3eMemberItem({
  member,
  onDeepRetry,
}: {
  member: FindzMemberRow
  onDeepRetry(memberId: number): void
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 rounded-[10px] bg-[var(--md3e-surface-low,var(--background))]/85 px-2.5 py-1 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Image className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-[11px] text-foreground">{member.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{formatBytes(member.uncompressedSize)}</span>
        {member.width && member.height ? (
          <span>{member.width}×{member.height}</span>
        ) : null}
        {member.formatAnomaly && (
          <Button
            size="xs"
            variant="ghost"
            className="h-5 px-1 text-[10px] text-destructive hover:bg-destructive/10"
            onClick={() => onDeepRetry(member.id)}
          >
            重试
          </Button>
        )}
      </div>
    </div>
  )
}
