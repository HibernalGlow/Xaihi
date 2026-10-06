import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { NodeComponentProps } from "@xiranite/contract"
import type { FindzAnalysisScope, FindzArchiveRow, FindzLibrarySummary, FindzMemberRow, FindzTask, FindzTreemapNode } from "@xiranite/findz-native"
import type { FindzData, FindzInput } from "@xiranite/node-findz/core"
import { ChevronDown, Download, Filter, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RuleTreeEditor } from "@/nodes/shared/RuleTreeEditor"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { cn } from "@/lib/utils"
import { FindzArchiveTable } from "./ArchiveTable"
import { FindzSwimlaneWorkspace } from "./FindzSwimlaneWorkspace"
import { FindzTreemap } from "./Treemap"
import { createFindzRuleTree, getFindzAreaMetrics, getFindzRuleFields, isTerminalTask, type FindzArchiveSort, type FindzCardState } from "./types"
import { FindzTaskProgressBar, FindzWorkspaceHeader } from "./WorkspaceHeader"
import { normalizeFindzWorkspaceLayout } from "./workspace-layout"

type FindzProps = NodeComponentProps<FindzCardState, Partial<FindzCardState>>

export function Component({ host }: FindzProps) {
  const { t } = useNodeI18n("findz")
  const [card, setCard] = useState<FindzCardState>(() => host.state.getData() ?? {})
  const [library, setLibrary] = useState<FindzLibrarySummary>()
  const [archives, setArchives] = useState<FindzArchiveRow[]>([])
  const [members, setMembers] = useState<FindzMemberRow[]>()
  const [treemap, setTreemap] = useState<FindzTreemapNode>()
  const [task, setTask] = useState<FindzTask>()
  const [archivePage, setArchivePage] = useState<{ total: number; nextCursor?: string }>({ total: 0 })
  const [pageTrail, setPageTrail] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const queryGeneration = useRef(0)
  const memberRequestGeneration = useRef(0)
  const deferredText = useDeferredValue(card.text ?? "")
  const rules = card.rules ?? createFindzRuleTree()
  const areaMetrics = getFindzAreaMetrics(t)
  const ruleFields = getFindzRuleFields(t)

  const patch = useCallback((next: Partial<FindzCardState>) => {
    if (changesQueryState(next)) queryGeneration.current++
    setCard((current) => {
      const merged = { ...current, ...next }
      host.state.patchData(next)
      return merged
    })
  }, [host])

  const invoke = useCallback(async (input: FindzInput): Promise<FindzData> => {
    if (!host.runner?.run) throw new Error("Findz requires the desktop backend.")
    const result = await host.runner.run<FindzInput, FindzData>("findz", input)
    if (!result.success) throw new Error(result.message)
    return result.data ?? { action: input.action ?? "query_archives" }
  }, [host])

  const refresh = useCallback(async (libraryId: string, override: Partial<FindzCardState> = {}) => {
    const generation = ++queryGeneration.current
    const queryState = { ...card, ...override }
    const query = {
      rules: (queryState.rules ?? createFindzRuleTree()) as never,
      sortBy: queryState.sortBy ?? "archiveSize",
      sortDesc: queryState.sortDesc ?? true,
      page: { cursor: queryState.pageCursor, limit: 200 },
    }
    try {
      const [archiveData, treemapData] = await Promise.all([
        invoke({ action: "query_archives", libraryId, text: override.text ?? deferredText, pathPrefix: queryState.pathPrefix, query }),
        invoke({ action: "treemap", libraryId, text: override.text ?? deferredText, pathPrefix: queryState.pathPrefix, areaBy: queryState.areaBy ?? "archiveSize", query }),
      ])
      if (queryGeneration.current !== generation) return
      setArchives(archiveData.archives?.items ?? [])
      setArchivePage({ total: archiveData.archives?.total ?? 0, nextCursor: archiveData.archives?.nextCursor })
      setTreemap(treemapData.treemap)
    } catch (cause) {
      if (queryGeneration.current === generation) setError(errorMessage(cause))
    }
  }, [card, deferredText, invoke])

  const openLibrary = useCallback(async () => {
    const root = card.libraryRoot?.trim()
    if (!root) return
    setBusy(true)
    setError(undefined)
    try {
      const data = await invoke({ action: "open_library", library: { root } })
      if (!data.library) throw new Error(t("errors.libraryMissing", "Findz did not return a library."))
      setLibrary(data.library)
      patch({ libraryRoot: root, libraryId: data.library.libraryId, pathPrefix: undefined, selectedArchiveId: undefined, pageCursor: undefined })
      setPageTrail([])
      setMembers(undefined)
      await refresh(data.library.libraryId, { libraryRoot: root, libraryId: data.library.libraryId, pathPrefix: undefined })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [card.libraryRoot, invoke, patch, refresh])

  const startTask = useCallback(async (action: "scan" | "analyze", analysisScope?: FindzAnalysisScope) => {
    if (!card.libraryId) return
    setBusy(true)
    setError(undefined)
    try {
      const data = await invoke({ action, libraryId: card.libraryId, ...(analysisScope ? { analysisScope } : {}) })
      if (!data.task) throw new Error(t("errors.taskMissing", "Findz did not create a task."))
      setTask(data.task)
      patch({ taskId: data.task.id })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [card.libraryId, invoke, patch])

  const controlTask = useCallback(async (action: "pause" | "resume" | "cancel") => {
    if (!card.libraryId || !task) return
    try {
      const data = await invoke({ action, libraryId: card.libraryId, taskId: task.id })
      if (data.task) setTask(data.task)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [card.libraryId, invoke, task])

  const selectArchive = useCallback(async (archiveId: number) => {
    if (!card.libraryId) return
    const requestGeneration = ++memberRequestGeneration.current
    patch({ selectedArchiveId: archiveId })
    setSelectionRevision((current) => current + 1)
    setMembers(undefined)
    try {
      const data = await invoke({ action: "query_members", libraryId: card.libraryId, archiveId, text: deferredText })
      if (memberRequestGeneration.current !== requestGeneration) return
      setMembers(data.members?.items ?? [])
    } catch (cause) {
      if (memberRequestGeneration.current === requestGeneration) setError(errorMessage(cause))
    }
  }, [card.libraryId, deferredText, invoke, patch])

  const changeSort = useCallback((sortBy: FindzArchiveSort) => {
    const next = { sortBy, sortDesc: card.sortBy === sortBy ? !card.sortDesc : true, pageCursor: undefined }
    setPageTrail([])
    patch(next)
    if (card.libraryId) void refresh(card.libraryId, next)
  }, [card.libraryId, card.sortBy, card.sortDesc, patch, refresh])

  const drill = useCallback((pathPrefix: string) => {
    if (!card.libraryId) return
    patch({ pathPrefix, selectedArchiveId: undefined, pageCursor: undefined })
    setPageTrail([])
    setMembers(undefined)
    void refresh(card.libraryId, { pathPrefix, selectedArchiveId: undefined })
  }, [card.libraryId, patch, refresh])

  const nextPage = useCallback(() => {
    if (!archivePage.nextCursor) return
    setPageTrail((trail) => [...trail, card.pageCursor ?? ""])
    patch({ pageCursor: archivePage.nextCursor, selectedArchiveId: undefined })
    setMembers(undefined)
  }, [archivePage.nextCursor, card.pageCursor, patch])

  const previousPage = useCallback(() => {
    if (!pageTrail.length) return
    const previousCursor = pageTrail[pageTrail.length - 1]
    setPageTrail((trail) => trail.slice(0, -1))
    patch({ pageCursor: previousCursor || undefined, selectedArchiveId: undefined })
    setMembers(undefined)
  }, [pageTrail, patch])

  const resetPage = useCallback((next: Partial<FindzCardState>) => {
    setPageTrail([])
    patch({ ...next, pageCursor: undefined })
  }, [patch])

  const exportArchives = useCallback(async (format: "json" | "csv") => {
    if (!card.libraryId) return
    setBusy(true)
    setError(undefined)
    try {
      const rows: FindzArchiveRow[] = []
      let cursor: string | undefined
      do {
        const data = await invoke({
          action: "export_rows",
          libraryId: card.libraryId,
          text: deferredText,
          pathPrefix: card.pathPrefix,
          query: { rules: rules as never, sortBy: card.sortBy ?? "archiveSize", sortDesc: card.sortDesc ?? true, page: { cursor, limit: 1_000 } },
        })
        rows.push(...(data.archives?.items ?? []))
        cursor = data.archives?.nextCursor
      } while (cursor)
      downloadArchiveExport(rows, format)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [card.libraryId, card.pathPrefix, card.sortBy, card.sortDesc, deferredText, invoke, rules])

  useEffect(() => {
    if (!card.libraryId) return
    const timeout = window.setTimeout(() => { void refresh(card.libraryId!) }, 180)
    return () => window.clearTimeout(timeout)
  }, [card.libraryId, card.pathPrefix, card.pageCursor, card.rules, card.sortBy, card.sortDesc, card.areaBy, deferredText, refresh])

  useEffect(() => () => {
    queryGeneration.current++
    memberRequestGeneration.current++
  }, [])

  useEffect(() => {
    if (!task || isTerminalTask(task) || !card.libraryId) return
    let cancelled = false
    const poll = async () => {
      try {
        const data = await invoke({ action: "task", libraryId: card.libraryId!, taskId: task.id })
        if (cancelled || !data.task) return
        setTask(data.task)
        if (isTerminalTask(data.task)) void refresh(card.libraryId!)
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause))
      }
    }
    void poll()
    const interval = window.setInterval(() => { void poll() }, 900)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [card.libraryId, invoke, refresh, task])

  const breadcrumb = useMemo(() => card.pathPrefix?.split("/").filter(Boolean) ?? [], [card.pathPrefix])
  const workspaceLayout = normalizeFindzWorkspaceLayout(card.workspace)
  return <TooltipProvider>
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background" data-testid="findz-workspace">
      {error && <div role="alert" className="mx-2 mt-2 flex shrink-0 items-center gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"><TriangleAlert className="size-4" />{error}</div>}
      {task && !isTerminalTask(task) ? <FindzTaskProgressBar task={task} /> : null}
      <FindzSwimlaneWorkspace
        layout={workspaceLayout}
        onLayoutChange={(workspace) => patch({ workspace })}
        labels={{ enterSolo: t("workspace.laneActions.enterSolo", "Focus current lane"), exitSolo: t("workspace.laneActions.exitSolo", "Show all lanes") }}
        lanes={{
          source: {
            label: t("workspace.lanes.source", "Source"),
            restoreLabel: t("workspace.laneActions.restoreSource", "Restore Source lane"),
            collapseLabel: t("workspace.laneActions.collapseSource", "Collapse Source lane"),
            resizeLabel: t("workspace.laneActions.resizeSource", "Resize Source lane"),
            defaultWidth: 340,
            content: <div className="flex h-full min-h-0 flex-col" data-testid="findz-source-lane">
              <FindzWorkspaceHeader root={card.libraryRoot ?? ""} library={library} task={task} busy={busy} onRootChange={(libraryRoot) => patch({ libraryRoot })} onOpen={() => void openLibrary()} onScan={() => void startTask("scan")} onAnalyze={() => void startTask("analyze")} onPause={() => void controlTask("pause")} onResume={() => void controlTask("resume")} onCancel={() => void controlTask("cancel")} />
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <section aria-label={t("workspace.lanes.query", "Search and filters")} className="border bg-muted/20" data-testid="findz-query-lane">
                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <div className="flex flex-col gap-2 p-2">
                      <Input aria-label={t("workspace.searchLabel", "Search Findz index")} value={card.text ?? ""} placeholder={t("workspace.searchPlaceholder", "Search archive and member paths")} onChange={(event) => resetPage({ text: event.target.value })} />
                      <CollapsibleTrigger asChild><Button aria-label={t("workspace.advancedFilters", "Advanced filters")} size="sm" variant={filtersOpen ? "secondary" : "outline"}><Filter />{t("workspace.filters", "Filters")}<ChevronDown className={cn("transition-transform", filtersOpen && "rotate-180")} /></Button></CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="border-t bg-background/90 p-3"><RuleTreeEditor value={rules} fields={ruleFields} t={t} onValueChange={(next) => resetPage({ rules: next })} /></CollapsibleContent>
                  </Collapsible>
                </section>
              </div>
            </div>,
          },
          results: {
            label: t("workspace.lanes.results", "Results"),
            restoreLabel: t("workspace.laneActions.restoreResults", "Restore Results lane"),
            collapseLabel: t("workspace.laneActions.collapseResults", "Collapse Results lane"),
            resizeLabel: t("workspace.laneActions.resizeResults", "Resize Results lane"),
            defaultWidth: 660,
            content: <section aria-labelledby="findz-hierarchy-heading" className="flex h-full min-h-0 flex-col" data-testid="findz-results-lane">
              <div aria-label={t("workspace.lanes.scope", "Library scope")} className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5 text-xs text-muted-foreground" data-testid="findz-scope-lane">
                <span className="shrink-0 font-medium text-foreground">{t("workspace.lanes.scope", "Library scope")}</span>
                <Button size="xs" variant={breadcrumb.length ? "ghost" : "secondary"} onClick={() => card.libraryId && drill("")}>{t("workspace.library", "Library")}</Button>
                {breadcrumb.map((segment, index) => <span key={`${segment}-${index}`} className="flex items-center gap-1"><span>/</span><Button size="xs" variant={index === breadcrumb.length - 1 ? "secondary" : "ghost"} onClick={() => card.libraryId && drill(breadcrumb.slice(0, index + 1).join("/"))}>{segment}</Button></span>)}
                <span className="ml-auto flex shrink-0 items-center gap-1"><Button aria-label={t("workspace.exportJson", "Export filtered archives as JSON")} size="xs" variant="ghost" disabled={!card.libraryId || busy} onClick={() => void exportArchives("json")}><Download />JSON</Button><Button aria-label={t("workspace.exportCsv", "Export filtered archives as CSV")} size="xs" variant="ghost" disabled={!card.libraryId || busy} onClick={() => void exportArchives("csv")}><Download />CSV</Button></span>
              </div>
              <div className="flex shrink-0 items-center border-b px-3 py-2"><h2 id="findz-hierarchy-heading" className="text-xs font-medium">{t("workspace.lanes.hierarchy", "Archive hierarchy")}</h2></div>
              <FindzArchiveTable className="min-h-0" archives={archives} members={members} pathPrefix={card.pathPrefix} selectedArchiveId={card.selectedArchiveId} selectionRevision={selectionRevision} sortBy={card.sortBy ?? "archiveSize"} sortDesc={card.sortDesc ?? true} total={archivePage.total} hasPreviousPage={pageTrail.length > 0} hasNextPage={Boolean(archivePage.nextCursor)} onSelectArchive={(archiveId) => void selectArchive(archiveId)} onDeepRetryMember={(memberId) => void startTask("analyze", { kind: "members", memberIds: [memberId], deepRetry: true })} onDrillFolder={drill} onSort={changeSort} onPreviousPage={previousPage} onNextPage={nextPage} />
            </section>,
          },
          analysis: {
            label: t("workspace.lanes.analysis", "Analysis"),
            restoreLabel: t("workspace.laneActions.restoreAnalysis", "Restore Analysis lane"),
            collapseLabel: t("workspace.laneActions.collapseAnalysis", "Collapse Analysis lane"),
            resizeLabel: t("workspace.laneActions.resizeAnalysis", "Resize Analysis lane"),
            defaultWidth: 400,
            content: <section aria-labelledby="findz-treemap-heading" className="flex h-full min-h-0 flex-col" data-testid="findz-treemap-lane">
              <div className="flex shrink-0 flex-col gap-1 border-b px-3 py-2"><h2 id="findz-treemap-heading" className="text-xs font-medium">{t("workspace.treemap", "Treemap")}</h2><Select value={card.areaBy ?? "archiveSize"} onValueChange={(areaBy) => resetPage({ areaBy: areaBy as FindzCardState["areaBy"] })}><SelectTrigger aria-label={t("workspace.areaMetricLabel", "Treemap area metric")} size="sm"><SelectValue /></SelectTrigger><SelectContent>{areaMetrics.map((metric) => <SelectItem key={metric.value} value={metric.value}>{metric.label}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">{t("workspace.treemapPanel.area", "Area")}: {areaMetrics.find((metric) => metric.value === (card.areaBy ?? "archiveSize"))?.label}</span></div>
              <FindzTreemap projection={treemap} selectedArchiveId={card.selectedArchiveId} onSelectArchive={(archiveId) => void selectArchive(archiveId)} onDrill={drill} />
            </section>,
          },
        }}
      />
    </div>
  </TooltipProvider>
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function changesQueryState(patch: Partial<FindzCardState>): boolean {
  return "libraryRoot" in patch || "libraryId" in patch || "pathPrefix" in patch || "text" in patch || "rules" in patch || "sortBy" in patch || "sortDesc" in patch || "areaBy" in patch || "pageCursor" in patch
}

function downloadArchiveExport(rows: readonly FindzArchiveRow[], format: "json" | "csv"): void {
  const content = format === "json"
    ? JSON.stringify(rows, null, 2)
    : ["path,size,memberCount,imageMemberCount,analyzedImageCount,anomalyCount,estimatedSavingsBytes", ...rows.map((row) => [row.relativePath, row.size, row.memberCount, row.imageMemberCount, row.analyzedImageCount, row.anomalyCount, row.estimatedSavingsBytes].map(csvCell).join(","))].join("\n")
  const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `findz-archives.${format}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text
}
