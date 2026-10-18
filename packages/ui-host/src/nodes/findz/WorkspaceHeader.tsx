import type { FindzLibrarySummary, FindzTask } from "@xiranite/findz-native"
import { FolderOpen, Pause, Play, RefreshCw, ScanLine, Sparkles, Square, TriangleAlert } from "lucide-react"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { taskProgressPercent } from "./format"

export function FindzWorkspaceHeader({ root, libraryId, library, task, busy, onRootChange, onLibraryIdChange, onOpen, onScan, onAnalyze, onPause, onResume, onCancel }: {
  root: string
  /** `open_library` 要的库 id：清单把它声明成必填，插件拿它当索引文件名。 */
  libraryId: string
  library?: FindzLibrarySummary
  task?: FindzTask
  busy: boolean
  onRootChange(value: string): void
  onLibraryIdChange(value: string): void
  onOpen(): void
  onScan(): void
  onAnalyze(): void
  onPause(): void
  onResume(): void
  onCancel(): void
}) {
  const { t } = useNodeI18n("findz")
  const taskActive = task && !isTerminal(task)
  return <header className="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5">
    <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <Input aria-label={t("workspace.header.rootLabel", "Findz library root")} value={root} placeholder={t("workspace.header.rootPlaceholder", "Local ZIP / CBZ library root")} onChange={(event) => onRootChange(event.target.value)} />
        <Input className="max-w-[11rem]" aria-label={t("workspace.header.libraryIdLabel", "Library id")} value={libraryId} placeholder={t("workspace.header.libraryIdPlaceholder", "Index name")} onChange={(event) => onLibraryIdChange(event.target.value)} />
        <Button size="sm" disabled={!root.trim() || busy} onClick={onOpen}>{t("workspace.header.openLibrary", "Open library")}</Button>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip><TooltipTrigger asChild><Button type="button" data-testid="findz-ui-face-switch" aria-label="切换到 MD3E 界面" variant="outline" size="xs" className="gap-1 font-mono text-[11px]" onClick={() => setUiFace("md3e")}><Sparkles className="size-3" />MD3E</Button></TooltipTrigger><TooltipContent>切换到全新 Material 3 Expressive (MD3E) 界面</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.header.scanLibrary", "Scan library")} variant="outline" size="icon-sm" disabled={!library || busy} onClick={onScan}><RefreshCw /></Button></TooltipTrigger><TooltipContent>{t("workspace.header.scanTooltip", "Scan ZIP central directories")}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.header.analyzeHeaders", "Analyze image headers")} variant="outline" size="icon-sm" disabled={!library || busy} onClick={onAnalyze}><ScanLine /></Button></TooltipTrigger><TooltipContent>{t("workspace.header.analyzeTooltip", "Analyze image headers on demand")}</TooltipContent></Tooltip>
        {taskActive && <TaskControls task={task} onPause={onPause} onResume={onResume} onCancel={onCancel} />}
      </div>
    </div>
    <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant={library?.watcherHealth === "degraded" ? "destructive" : "secondary"}>{library ? library.watcherHealth === "healthy" ? t("workspace.header.watching", "Watching") : t("workspace.header.watcherDegraded", "Watcher degraded") : t("workspace.header.noLibrary", "No library")}</Badge>
        {library?.watcherHealth === "degraded" && <TriangleAlert className="size-3.5 text-destructive" />}
        <span className="truncate">{library ? t("workspace.header.librarySummary", "{{archives}} archives · {{members}} members", { archives: library.archiveCount.toLocaleString(), members: library.memberCount.toLocaleString() }) : t("workspace.header.openLibraryHint", "Open a local library to create its separate Findz index.")}</span>
      </div>
      {task && <span className="shrink-0 tabular-nums">{t(`workspace.taskKinds.${task.kind}`, task.kind)} · {t(`workspace.taskStatus.${task.status}`, task.status)}</span>}
    </div>
  </header>
}

export function FindzTaskProgressBar({ task }: { task: FindzTask }) {
  const { t } = useNodeI18n("findz")
  const progress = taskProgressPercent(task)
  return <div className="flex shrink-0 items-center gap-3 border-b bg-muted/20 px-3 py-1.5" data-testid="findz-task-progressbar">
    <span className="shrink-0 text-xs text-muted-foreground">{t(`workspace.taskKinds.${task.kind}`, task.kind)} · {t(`workspace.taskStatus.${task.status}`, task.status)}</span>
    <Progress value={progress} className="h-1.5 min-w-0 flex-1" />
    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{progress}%</span>
  </div>
}

function TaskControls({ task, onPause, onResume, onCancel }: { task: FindzTask; onPause(): void; onResume(): void; onCancel(): void }) {
  const { t } = useNodeI18n("findz")
  return <>
    {task.status === "paused"
      ? <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.header.resumeTask", "Resume task")} size="icon-sm" variant="outline" onClick={onResume}><Play /></Button></TooltipTrigger><TooltipContent>{t("workspace.header.resumeTask", "Resume task")}</TooltipContent></Tooltip>
      : <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.header.pauseTask", "Pause task")} size="icon-sm" variant="outline" onClick={onPause}><Pause /></Button></TooltipTrigger><TooltipContent>{t("workspace.header.pauseTask", "Pause task")}</TooltipContent></Tooltip>}
    <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.header.cancelTask", "Cancel task")} size="icon-sm" variant="outline" onClick={onCancel}><Square /></Button></TooltipTrigger><TooltipContent>{t("workspace.header.cancelTask", "Cancel task")}</TooltipContent></Tooltip>
  </>
}

function isTerminal(task: FindzTask): boolean {
  return ["completed", "completed_with_warnings", "cancelled", "failed"].includes(task.status)
}
