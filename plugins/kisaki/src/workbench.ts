function createStore<TContext>(config: { context: TContext; on?: Record<string, any> }) {
  let context = config.context
  const listeners = new Set<(snapshot: { context: TContext }) => void>()
  return {
    getSnapshot: () => ({ context }),
    trigger: {
      replace: (event: { next: TContext }) => {
        context = event.next
        for (const l of listeners) l({ context })
      },
    },
    subscribe: (listener: (snapshot: { context: TContext }) => void) => {
      listeners.add(listener)
      return { unsubscribe: () => listeners.delete(listener) }
    },
  }
}
import type { NodeRunEvent, NodeRunResult } from "./contract.js"

import {
  appendKisakiActivityLog,
  type KisakiActivityLogEntry,
  type KisakiActivityLogInput,
} from "./activity-log.js"
import {
  nextKisakiCacheRegenerationState,
  type KisakiCacheRegenerationState,
} from "./cache-regeneration.js"
import type { KisakiAction, KisakiData, KisakiGroup, KisakiInput, KisakiSelectionStrategy, KisakiTool } from "./core.js"
import {
  closeKisakiImageComparison,
  createKisakiImageComparison,
  kisakiImageComparisonPreferences,
  openKisakiImageComparison,
  setKisakiImageComparisonColorCoding,
  setKisakiImageComparisonMode,
  setKisakiImageComparisonOpacity,
  setKisakiImageComparisonSwipe,
  setKisakiImageComparisonTarget,
  type KisakiImageComparisonMode,
  type KisakiImageComparisonPreferences,
  type KisakiImageComparisonState,
} from "./image-comparison.js"
import type { KisakiFilterState } from "./filters.js"
import {
  createKisakiSelectionHistory,
  pushKisakiSelectionHistory,
  redoKisakiSelectionHistory,
  type KisakiSelectionHistory,
  undoKisakiSelectionHistory,
} from "./selection-assistant.js"

export type KisakiWorkbenchPhase = "idle" | "running" | "completed" | "stopped" | "error"
export type KisakiWorkbenchPanel = "source" | "results" | "analysis"

export interface KisakiWorkbenchState {
  running: boolean
  panel: KisakiWorkbenchPanel
  resultsByTool: Partial<Record<KisakiTool, KisakiData>>
  selectedPathsByTool: Partial<Record<KisakiTool, string[]>>
  selectionHistoriesByTool: Partial<Record<KisakiTool, KisakiSelectionHistory>>
  filterStatesByTool: Partial<Record<KisakiTool, KisakiFilterState>>
  activityLog: KisakiActivityLogEntry[]
  cacheRegeneration: KisakiCacheRegenerationState
  imageComparison: KisakiImageComparisonState
}

export interface KisakiWorkbenchInitialState {
  result?: KisakiData | null
  filterStatesByTool?: Partial<Record<KisakiTool, KisakiFilterState>>
  activityLog?: KisakiActivityLogEntry[]
  cacheRegeneration?: KisakiCacheRegenerationState
  imageComparison?: Partial<KisakiImageComparisonPreferences>
}

export interface KisakiWorkbenchPersistencePatch {
  phase?: KisakiWorkbenchPhase
  progress?: number
  progressText?: string
  result?: KisakiData | null
  operation?: KisakiData | null
  filterStatesByTool?: Partial<Record<KisakiTool, KisakiFilterState>>
  activityLog?: KisakiActivityLogEntry[]
  cacheRegeneration?: KisakiCacheRegenerationState
  imageComparison?: KisakiImageComparisonPreferences
}

export interface KisakiWorkbenchPort {
  persist(patch: KisakiWorkbenchPersistencePatch): void
  run?: (
    nodeId: string,
    input: KisakiInput,
    onEvent?: (event: NodeRunEvent) => void,
  ) => Promise<NodeRunResult<KisakiData>>
  cancel?: () => Promise<unknown>
}

export interface KisakiScanMessages {
  noRoots: string
  noRuntime: string
  cacheRegeneration: string
  starting: string
  stopping: string
}

export interface KisakiOperationMessages {
  description(action: KisakiAction, count: number): string
}

export interface KisakiWorkbench {
  subscribe(listener: (state: KisakiWorkbenchState) => void): () => void
  getState(): KisakiWorkbenchState
  updatePort(port: KisakiWorkbenchPort): void
  getResult(tool: KisakiTool, persisted?: KisakiData | null): KisakiData | null
  getSelectedPaths(tool: KisakiTool): string[]
  getFilterState(tool: KisakiTool): KisakiFilterState | undefined
  getSelectionHistory(tool: KisakiTool): KisakiSelectionHistory
  setPanel(panel: KisakiWorkbenchPanel): void
  setFilterState(tool: KisakiTool, filter: KisakiFilterState): void
  setSelectedPaths(tool: KisakiTool, paths: string[]): void
  resetSelectedPaths(tool: KisakiTool, paths?: string[]): void
  undoSelection(tool: KisakiTool): void
  redoSelection(tool: KisakiTool): void
  addActivityLog(tool: KisakiTool, input: Omit<KisakiActivityLogInput, "tool">): void
  clearActivityLog(): void
  openImageComparison(groups: readonly KisakiGroup[], path: string): void
  closeImageComparison(): void
  setImageComparisonMode(mode: KisakiImageComparisonMode): void
  setImageComparisonColorCoding(colorCoding: boolean): void
  setImageComparisonTarget(groups: readonly KisakiGroup[], path: string): void
  setImageComparisonSwipe(swipePercent: number): void
  setImageComparisonOpacity(onionOpacity: number): void
  executeScan(tool: KisakiTool, input: KisakiInput, messages: KisakiScanMessages): Promise<void>
  cancelScan(tool: KisakiTool, messages: Pick<KisakiScanMessages, "stopping">): Promise<void>
  executeOperation(
    tool: KisakiTool,
    action: KisakiAction,
    input: KisakiInput,
    messages: KisakiOperationMessages,
  ): Promise<void>
}

const EMPTY_PORT: KisakiWorkbenchPort = { persist: () => undefined }

export function createKisakiWorkbench(
  initial: KisakiWorkbenchInitialState = {},
  initialPort: KisakiWorkbenchPort = EMPTY_PORT,
): KisakiWorkbench {
  let port = initialPort
  const initialState: KisakiWorkbenchState = {
    running: false,
    panel: "source",
    resultsByTool: initial.result ? { [initial.result.tool]: initial.result } : {},
    selectedPathsByTool: {},
    selectionHistoriesByTool: {},
    filterStatesByTool: initial.filterStatesByTool ?? {},
    activityLog: initial.activityLog ?? [],
    cacheRegeneration: initial.cacheRegeneration ?? {},
    imageComparison: createKisakiImageComparison(initial.imageComparison),
  }
  const store = createStore({
    context: initialState,
    on: {
      replace: (_context, event: { next: KisakiWorkbenchState }) => event.next,
    },
  })

  function getState(): KisakiWorkbenchState {
    return store.getSnapshot().context
  }

  function replace(update: (current: KisakiWorkbenchState) => KisakiWorkbenchState): KisakiWorkbenchState {
    const next = update(getState())
    store.trigger.replace({ next })
    return next
  }

  function addActivityLog(tool: KisakiTool, input: Omit<KisakiActivityLogInput, "tool">): void {
    const state = replace((current) => ({
      ...current,
      activityLog: appendKisakiActivityLog(current.activityLog, { ...input, tool }),
    }))
    port.persist({ activityLog: state.activityLog })
  }

  function fail(tool: KisakiTool, kind: KisakiActivityLogInput["kind"], message: string, action?: KisakiAction): void {
    port.persist({ phase: "error", progressText: message })
    addActivityLog(tool, { kind, level: "error", message, action })
  }

  function resetSelectedPaths(tool: KisakiTool, paths: string[] = []): void {
    const selectedPaths = [...paths]
    replace((current) => ({
      ...current,
      selectedPathsByTool: { ...current.selectedPathsByTool, [tool]: selectedPaths },
      selectionHistoriesByTool: {
        ...current.selectionHistoriesByTool,
        [tool]: createKisakiSelectionHistory(selectedPaths),
      },
    }))
  }

  return {
    subscribe(listener) {
      const subscription = store.subscribe((snapshot) => listener(snapshot.context))
      return () => subscription.unsubscribe()
    },
    getState,
    updatePort(nextPort) {
      port = nextPort
    },
    getResult(tool, persisted) {
      return getState().resultsByTool[tool] ?? (persisted?.tool === tool ? persisted : null)
    },
    getSelectedPaths(tool) {
      return getState().selectedPathsByTool[tool] ?? []
    },
    getFilterState(tool) {
      return getState().filterStatesByTool[tool]
    },
    getSelectionHistory(tool) {
      const state = getState()
      return state.selectionHistoriesByTool[tool] ?? createKisakiSelectionHistory(state.selectedPathsByTool[tool] ?? [])
    },
    setPanel(panel) {
      replace((current) => current.panel === panel ? current : { ...current, panel })
    },
    setFilterState(tool, filter) {
      const state = replace((current) => ({
        ...current,
        filterStatesByTool: { ...current.filterStatesByTool, [tool]: filter },
      }))
      port.persist({ filterStatesByTool: state.filterStatesByTool })
    },
    setSelectedPaths(tool, paths) {
      const selectedPaths = [...paths]
      replace((current) => ({
        ...current,
        selectedPathsByTool: { ...current.selectedPathsByTool, [tool]: selectedPaths },
        selectionHistoriesByTool: {
          ...current.selectionHistoriesByTool,
          [tool]: pushKisakiSelectionHistory(
            current.selectionHistoriesByTool[tool] ?? createKisakiSelectionHistory(current.selectedPathsByTool[tool] ?? []),
            selectedPaths,
          ),
        },
      }))
    },
    resetSelectedPaths,
    undoSelection(tool) {
      replace((current) => {
        const history = undoKisakiSelectionHistory(
          current.selectionHistoriesByTool[tool] ?? createKisakiSelectionHistory(current.selectedPathsByTool[tool] ?? []),
        )
        return {
          ...current,
          selectedPathsByTool: { ...current.selectedPathsByTool, [tool]: history.present },
          selectionHistoriesByTool: { ...current.selectionHistoriesByTool, [tool]: history },
        }
      })
    },
    redoSelection(tool) {
      replace((current) => {
        const history = redoKisakiSelectionHistory(
          current.selectionHistoriesByTool[tool] ?? createKisakiSelectionHistory(current.selectedPathsByTool[tool] ?? []),
        )
        return {
          ...current,
          selectedPathsByTool: { ...current.selectedPathsByTool, [tool]: history.present },
          selectionHistoriesByTool: { ...current.selectionHistoriesByTool, [tool]: history },
        }
      })
    },
    addActivityLog,
    clearActivityLog() {
      replace((current) => ({ ...current, activityLog: [] }))
      port.persist({ activityLog: [] })
    },
    openImageComparison(groups, path) {
      replace((current) => ({ ...current, imageComparison: openKisakiImageComparison(current.imageComparison, groups, path) }))
    },
    closeImageComparison() {
      replace((current) => ({ ...current, imageComparison: closeKisakiImageComparison(current.imageComparison) }))
    },
    setImageComparisonMode(mode) {
      const state = replace((current) => ({ ...current, imageComparison: setKisakiImageComparisonMode(current.imageComparison, mode) }))
      port.persist({ imageComparison: kisakiImageComparisonPreferences(state.imageComparison) })
    },
    setImageComparisonColorCoding(colorCoding) {
      const state = replace((current) => ({ ...current, imageComparison: setKisakiImageComparisonColorCoding(current.imageComparison, colorCoding) }))
      port.persist({ imageComparison: kisakiImageComparisonPreferences(state.imageComparison) })
    },
    setImageComparisonTarget(groups, path) {
      replace((current) => ({ ...current, imageComparison: setKisakiImageComparisonTarget(current.imageComparison, groups, path) }))
    },
    setImageComparisonSwipe(swipePercent) {
      replace((current) => ({ ...current, imageComparison: setKisakiImageComparisonSwipe(current.imageComparison, swipePercent) }))
    },
    setImageComparisonOpacity(onionOpacity) {
      replace((current) => ({ ...current, imageComparison: setKisakiImageComparisonOpacity(current.imageComparison, onionOpacity) }))
    },
    async executeScan(tool, input, messages) {
      if (getState().running) return
      if (!input.includedDirectories?.length) {
        fail(tool, "system", messages.noRoots)
        return
      }
      if (!port.run) {
        fail(tool, "system", messages.noRuntime)
        return
      }
      const cacheRegeneration = nextKisakiCacheRegenerationState(getState().cacheRegeneration, tool)
      if (cacheRegeneration) {
        replace((current) => ({ ...current, cacheRegeneration }))
        port.persist({ cacheRegeneration })
        addActivityLog(tool, { kind: "system", level: "warning", message: messages.cacheRegeneration })
      }
      replace((current) => ({ ...current, running: true }))
      resetSelectedPaths(tool)
      port.persist({ phase: "running", progress: 0, progressText: messages.starting, result: null })
      addActivityLog(tool, { kind: "scan", level: "info", message: messages.starting, progress: 0 })
      try {
        const response = await port.run("kisaki", input, (event) => {
          if (event.type === "progress") {
            port.persist({ progress: event.progress ?? 0, progressText: event.message })
          }
          addActivityLog(tool, {
            kind: event.type === "progress" ? "progress" : "system",
            level: "info",
            message: event.message,
            progress: event.progress,
          })
        })
        if (response.data) {
          replace((current) => ({
            ...current,
            resultsByTool: { ...current.resultsByTool, [tool]: response.data! },
            panel: "results",
          }))
        }
        const stopped = response.data?.stopped === true
        port.persist({
          phase: stopped ? "stopped" : response.success ? "completed" : "error",
          progress: response.success || stopped ? 100 : 0,
          progressText: response.message,
          result: response.data ?? null,
        })
        addActivityLog(tool, {
          kind: "scan",
          level: stopped ? "warning" : response.success ? "success" : "error",
          message: response.message,
          progress: response.success || stopped ? 100 : undefined,
        })
      } catch (error) {
        fail(tool, "scan", errorMessage(error))
      } finally {
        replace((current) => ({ ...current, running: false }))
      }
    },
    async cancelScan(tool, messages) {
      if (!getState().running || !port.cancel) return
      port.persist({ progressText: messages.stopping })
      addActivityLog(tool, { kind: "system", level: "warning", message: messages.stopping })
      await port.cancel()
    },
    async executeOperation(tool, action, input, messages) {
      if (getState().running || !port.run || !input.selectedPaths?.length) return
      const description = messages.description(action, input.selectedPaths.length)
      replace((current) => ({ ...current, running: true }))
      port.persist({ progressText: description })
      addActivityLog(tool, { kind: "operation", level: "info", action, message: description })
      try {
        const response = await port.run("kisaki", input)
        port.persist({
          progressText: response.message,
          operation: response.data ?? null,
          phase: response.success ? "completed" : "error",
        })
        addActivityLog(tool, {
          kind: "operation",
          level: response.success ? "success" : "error",
          action,
          message: response.message,
          affectedCount: response.data?.affectedCount,
          errorCount: response.data?.errorCount,
        })
        if (response.success && input.dryRun === false && action !== "save") {
          resetSelectedPaths(tool)
        }
      } catch (error) {
        fail(tool, "operation", errorMessage(error), action)
      } finally {
        replace((current) => ({ ...current, running: false }))
      }
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
