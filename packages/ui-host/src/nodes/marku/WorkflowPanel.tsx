// Workflow-mode surface for the Marku card: the React Flow canvas fills the
// whole card while a collapsible sidebar mirrors the ordered steps and hosts
// the inspector, shared inputs and run results. All state transitions come
// from workflow-state.ts; persistence goes through the host config service.
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ChevronDown, ChevronUp, CopyPlus, FilePlus2, PanelRightClose, PanelRightOpen, Play, Plus, Save, ShieldAlert, Trash2 } from "lucide-react"
import type { MarkuAction, MarkuWorkflow, MarkuWorkflowLibrary } from "@xiranite/node-marku/core"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { findModuleMeta } from "./constants"
import { ActionIconButton, PathInput, PrimarySwitches, StatusStrip, TextInput } from "./controls"
import { splitPaths } from "./model"
import { HeaderLine } from "./normal-views"
import type { MarkuCardState, MarkuStatusMeta } from "./types"
import {
  activateWorkflow,
  addWorkflowStep,
  createWorkflowDraftFromNormal,
  duplicateWorkflowInLibrary,
  duplicateWorkflowStep,
  ensureStepSelection,
  findWorkflowStep,
  moveWorkflowStep,
  removeWorkflowFromLibrary,
  removeWorkflowStep,
  stateAfterActiveWorkflowDeleted,
  updateWorkflowStepConfig,
  updateWorkflowStepModule,
  upsertWorkflowInLibrary,
} from "./workflow-state"
import { WorkflowEditor } from "./WorkflowEditor"
import { WorkflowInspector } from "./WorkflowInspector"
import { WorkflowResults } from "./WorkflowResults"

export interface WorkflowPanelProps {
  compact: boolean
  data: MarkuCardState
  library: MarkuWorkflowLibrary
  progress: number
  running: boolean
  status: MarkuStatusMeta
  onCopyText: (text: string) => void
  onExecute: (action: MarkuAction) => void
  onExitWorkflow: () => void
  onPastePath: () => void
  onPasteText: () => void
  onPatch: (patch: Partial<MarkuCardState>) => void
  onSaveLibrary: (library: MarkuWorkflowLibrary) => void | Promise<void>
}

/** Debounce for syncing draft edits back into the saved library entry. */
const LIBRARY_SYNC_DELAY_MS = 600

export default function WorkflowPanel(props: WorkflowPanelProps) {
  "use no memo"
  const draft = props.data.workflowDraft ?? null
  const activeWorkflowId = props.data.activeWorkflowId ?? ""
  const selectedStepId = ensureStepSelection(draft, props.data.selectedWorkflowStepId)
  const selectedStep = findWorkflowStep(draft, selectedStepId)
  const selectedIndex = draft && selectedStepId ? draft.steps.findIndex((step) => step.id === selectedStepId) : -1
  const hasText = Boolean(props.data.inputText?.trim())
  const pathCount = splitPaths(props.data.pathText).length
  const dryRun = props.data.dryRun ?? true
  const canRun = Boolean(draft?.steps.length) && (hasText || pathCount > 0) && !props.running

  const libraryRef = useRef(props.library)
  libraryRef.current = props.library
  const saveLibraryRef = useRef(props.onSaveLibrary)
  saveLibraryRef.current = props.onSaveLibrary
  const dataRef = useRef(props.data)
  dataRef.current = props.data
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingLibrarySync = useRef<MarkuWorkflow | undefined>(undefined)
  useEffect(() => () => flushPendingLibrarySync(), [])
  // The canvas owns the card; the sidebar is an optional editing companion.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const showSidebar = props.compact || sidebarOpen || !draft

  function applyDraft(next: MarkuWorkflow, extra: Partial<MarkuCardState> = {}) {
    props.onPatch({ workflowDraft: next, workflowRun: null, result: null, ...extra })
    scheduleLibrarySync(next)
  }

  /** Draft edits flow back into the library only when they belong to a saved entry. */
  function scheduleLibrarySync(next: MarkuWorkflow) {
    const activeId = dataRef.current.activeWorkflowId
    if (!activeId || activeId !== next.id) return
    if (!libraryRef.current.workflows.some((workflow) => workflow.id === next.id)) return
    clearTimeout(syncTimer.current)
    pendingLibrarySync.current = next
    syncTimer.current = setTimeout(flushPendingLibrarySync, LIBRARY_SYNC_DELAY_MS)
  }

  function persistLibrary(next: MarkuWorkflowLibrary) {
    libraryRef.current = next
    void saveLibraryRef.current(next)
  }

  function flushPendingLibrarySync() {
    clearTimeout(syncTimer.current)
    syncTimer.current = undefined
    const pending = pendingLibrarySync.current
    pendingLibrarySync.current = undefined
    if (!pending || !libraryRef.current.workflows.some((workflow) => workflow.id === pending.id)) return
    persistLibrary(upsertWorkflowInLibrary(libraryRef.current, pending))
  }

  function cancelPendingLibrarySync() {
    clearTimeout(syncTimer.current)
    syncTimer.current = undefined
    pendingLibrarySync.current = undefined
  }

  function selectWorkflow(workflowId: string) {
    flushPendingLibrarySync()
    const patch = activateWorkflow(libraryRef.current, workflowId)
    if (patch) props.onPatch(patch)
  }

  function createNewWorkflow() {
    flushPendingLibrarySync()
    const module = selectedStep?.module ?? draft?.steps[0]?.module ?? props.data.module ?? "markt"
    const next = createWorkflowDraftFromNormal(module, {})
    props.onPatch({ workflowDraft: next, activeWorkflowId: "", selectedWorkflowStepId: next.steps[0]?.id, workflowRun: null, result: null })
  }

  function saveDraftToLibrary() {
    if (!draft) return
    cancelPendingLibrarySync()
    const named = draft.name.trim() ? draft : { ...draft, name: "未命名工作流" }
    persistLibrary(upsertWorkflowInLibrary(libraryRef.current, named))
    props.onPatch({ workflowDraft: named, activeWorkflowId: named.id })
  }

  function duplicateActiveWorkflow() {
    if (!activeWorkflowId) return
    flushPendingLibrarySync()
    const outcome = duplicateWorkflowInLibrary(libraryRef.current, activeWorkflowId)
    if (!outcome) return
    persistLibrary(outcome.library)
    const patch = activateWorkflow(outcome.library, outcome.workflow.id)
    if (patch) props.onPatch(patch)
  }

  function deleteActiveWorkflow() {
    if (!activeWorkflowId) return
    cancelPendingLibrarySync()
    persistLibrary(removeWorkflowFromLibrary(libraryRef.current, activeWorkflowId))
    props.onPatch(stateAfterActiveWorkflowDeleted({ module: draft?.steps[0]?.module ?? "markt", config: {} }))
  }

  function addStep() {
    if (!draft) return
    const outcome = addWorkflowStep(draft, selectedStep?.module ?? "markt")
    applyDraft(outcome.workflow, { selectedWorkflowStepId: outcome.stepId })
  }

  function removeStep(stepId: string) {
    if (!draft || draft.steps.length <= 1) return
    const next = removeWorkflowStep(draft, stepId)
    const keep = dataRef.current.selectedWorkflowStepId === stepId ? undefined : dataRef.current.selectedWorkflowStepId
    applyDraft(next, { selectedWorkflowStepId: ensureStepSelection(next, keep) })
  }

  function duplicateStep(stepId: string) {
    if (!draft) return
    const outcome = duplicateWorkflowStep(draft, stepId)
    if (outcome) applyDraft(outcome.workflow, { selectedWorkflowStepId: outcome.stepId })
  }

  function moveStep(stepId: string, targetIndex: number) {
    if (draft) applyDraft(moveWorkflowStep(draft, stepId, targetIndex))
  }

  function changeStepModule(stepId: string, module: string) {
    if (draft) applyDraft(updateWorkflowStepModule(draft, stepId, module))
  }

  function changeStepConfig(stepId: string, config: Record<string, unknown>) {
    if (draft) applyDraft(updateWorkflowStepConfig(draft, stepId, config))
  }

  return (
    <div data-testid="marku-workflow-panel" className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={draft?.name.trim() ? `工作流 · ${draft.name}` : "工作流模式 · 未保存草稿"} />
        <div className="flex shrink-0 items-center gap-1">
          <RunWorkflowButton canRun={canRun} dryRun={dryRun} running={props.running} onExecute={props.onExecute} />
          {!props.compact && draft && (
            <ActionIconButton
              icon={sidebarOpen ? PanelRightClose : PanelRightOpen}
              label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
              onClick={() => setSidebarOpen((open) => !open)}
            />
          )}
          <ActionIconButton disabled={props.running} icon={ArrowLeft} label="返回普通模式" onClick={props.onExitWorkflow} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {/* Always controlled: an empty id keeps the placeholder without flipping Radix into uncontrolled mode. */}
        <Select disabled={props.running || !props.library.workflows.length} value={activeWorkflowId} onValueChange={selectWorkflow}>
          <SelectTrigger aria-label="marku workflow library" size="sm" className="w-44">
            <SelectValue placeholder="选择已保存工作流" />
          </SelectTrigger>
          <SelectContent>
            {props.library.workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name.trim() || "未命名工作流"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="marku workflow name"
          className="h-8 w-40 text-xs"
          disabled={props.running || !draft}
          placeholder="工作流名称"
          value={draft?.name ?? ""}
          onChange={(event) => { if (draft) applyDraft({ ...draft, name: event.currentTarget.value }) }}
        />
        <ActionIconButton disabled={props.running} icon={FilePlus2} label="新建工作流" onClick={createNewWorkflow} />
        <ActionIconButton disabled={props.running || !draft} icon={Save} label="保存到库" onClick={saveDraftToLibrary} />
        <ActionIconButton disabled={props.running || !activeWorkflowId} icon={CopyPlus} label="复制工作流" onClick={duplicateActiveWorkflow} />
        <ActionIconButton destructive disabled={props.running || !activeWorkflowId} icon={Trash2} label="删除工作流" onClick={deleteActiveWorkflow} />
        <ActionIconButton disabled={props.running || !draft} icon={Plus} label="添加步骤" onClick={addStep} />
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        {!props.compact && draft && (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-background/55">
            <WorkflowEditor
              running={props.running}
              selectedStepId={selectedStepId}
              viewport={props.data.workflowViewport}
              workflow={draft}
              run={props.data.workflowRun}
              onChangeStepConfig={changeStepConfig}
              onChangeStepModule={changeStepModule}
              onMoveStep={moveStep}
              onSelectStep={(stepId) => props.onPatch({ selectedWorkflowStepId: stepId })}
              onViewportChange={(workflowViewport) => props.onPatch({ workflowViewport })}
            />
          </div>
        )}

        {showSidebar && (
          <aside
            data-testid="marku-workflow-sidebar"
            className={cn(
              "flex min-h-0 flex-col gap-2 overflow-y-auto",
              props.compact || !draft ? "min-w-0 flex-1" : "w-80 shrink-0 pr-1",
            )}
          >
            <div data-testid="marku-workflow-steps" className="grid shrink-0 gap-1 rounded-lg border bg-background/60 p-2">
              <span className="text-xs font-semibold">步骤</span>
              {draft?.steps.map((step, index) => {
                const meta = findModuleMeta(step.module)
                return (
                  <div key={step.id} className={cn("flex items-center gap-1 rounded-md border px-2 py-1", step.id === selectedStepId ? "border-primary bg-primary/5" : "border-transparent bg-muted/30")}>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => props.onPatch({ selectedWorkflowStepId: step.id })}
                    >
                      <Badge variant="outline" className="shrink-0 tabular-nums">{index + 1}</Badge>
                      <meta.icon className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate text-xs font-medium">{meta.shortLabel}</span>
                    </button>
                    <ActionIconButton disabled={props.running || index === 0} icon={ChevronUp} label="上移步骤" onClick={() => moveStep(step.id, index - 1)} />
                    <ActionIconButton disabled={props.running || index === draft.steps.length - 1} icon={ChevronDown} label="下移步骤" onClick={() => moveStep(step.id, index + 1)} />
                    <ActionIconButton disabled={props.running} icon={CopyPlus} label="复制步骤" onClick={() => duplicateStep(step.id)} />
                    <ActionIconButton destructive disabled={props.running || draft.steps.length <= 1} icon={Trash2} label="删除步骤" onClick={() => removeStep(step.id)} />
                  </div>
                )
              })}
            </div>

            <WorkflowInspector
              running={props.running}
              step={selectedStep}
              stepIndex={selectedIndex}
              onConfigChange={changeStepConfig}
              onModuleChange={changeStepModule}
            />

            <div className="grid shrink-0 gap-2 rounded-lg border bg-background/60 p-2">
              <div className="text-xs font-semibold">输入</div>
              <TextInput compact disabled={props.running} value={props.data.inputText ?? ""} onChange={(inputText) => props.onPatch({ inputText })} onClear={() => props.onPatch({ inputText: "" })} onPaste={props.onPasteText} />
              <PathInput compact disabled={props.running || hasText} pathCount={pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
              <PrimarySwitches compact data={props.data} disabled={props.running} hasText={hasText} onPatch={props.onPatch} />
            </div>

            {(props.status.tone === "running" || props.status.tone === "error") && (
              <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
            )}
            <div className="h-64 shrink-0">
              <WorkflowResults result={props.data.result ?? null} run={props.data.workflowRun ?? null} onCopyText={props.onCopyText} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function RunWorkflowButton(props: {
  canRun: boolean
  dryRun: boolean
  running: boolean
  onExecute: (action: MarkuAction) => void
}) {
  const dangerous = !props.dryRun
  return (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={!props.canRun}
      label={props.dryRun ? "预演工作流" : "真实写回工作流"}
      idleIcon={dangerous ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute("workflow")}
    />
  )
}
