import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { KisakiNodeConfig } from "./node-config"
import type { NodeComponentProps } from "@xiranite/contract"
import { applyKisakiDirectorySelection, applyKisakiGroupSelection, applyKisakiTextSelection, calculateKisakiSelectionStats, createDefaultKisakiSelectionAssistantConfig, invertKisakiSelection, selectAllKisakiEntries } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import { applyKisakiFilters, normalizeKisakiFilterState } from "@hibernalglow/xaihi-kisaki/filters"
import { normalizeKisakiCardLayout, type KisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout"
import { createDefaultKisakiFloatingPanel, normalizeKisakiFloatingPanel, type KisakiFloatingPanelState, type KisakiFloatingViewport } from "@hibernalglow/xaihi-kisaki/floating-panel"
import { createKisakiOperationInput } from "@hibernalglow/xaihi-kisaki/tool-options"
import { createKisakiWorkbench, type KisakiWorkbench, type KisakiWorkbenchPersistencePatch } from "@hibernalglow/xaihi-kisaki/workbench"
import { normalizeKisakiWorkspaceLayout, type KisakiWorkspaceLayout } from "@hibernalglow/xaihi-kisaki/workspace-layout"
import type { KisakiAction, KisakiInput, KisakiRuntimeInfo, KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
// `smartSelect` is a pure function over a scan-result document, so it lives in `selection-strategies.ts` and is
// reached through that subpath: a value import of `@hibernalglow/xaihi-kisaki/core` would evaluate the engine module
// here, which is the second execution host ADR-0074 §5 refuses. `core.ts` still re-exports it, so the
// published contract is unchanged.
import { smartSelect } from "@hibernalglow/xaihi-kisaki/selection-strategies"

import { KISAKI_STATE_VERSION, kisakiStateMigrationPatch, normalizeKisakiCardState } from "./state"
import type { KisakiCardState, KisakiSimilarImagesViewMode } from "./types"
import { useKisakiNodeConfig } from "./use-kisaki-node-config"
import { scanInput, type KisakiView } from "./views/model"

type Host = NodeComponentProps<KisakiCardState, Partial<KisakiNodeConfig>>["host"]

interface UseKisakiWorkbenchOptions {
  compId: string
  host: Host
  surface: { width: number; height: number; mode: string }
  t: KisakiView["t"]
  language: KisakiView["language"]
}

export function useKisakiWorkbench({ compId, host, surface, t, language }: UseKisakiWorkbenchOptions): KisakiView {
  const rawData = getData(host, compId)
  const data = normalizeKisakiCardState(rawData)
  const tool = data.tool ?? "duplicate-files"
  const applyCardStatePatch = useCallback((next: Partial<KisakiCardState>) => {
    if (host.state?.patchData) host.state.patchData(next)
    else host.patchData(compId, next)
  }, [compId, host])
  const persistNodeConfigPatch = useKisakiNodeConfig({ host, applyCardStatePatch })
  const patch = useCallback((next: Partial<KisakiCardState>) => {
    applyCardStatePatch(next)
    persistNodeConfigPatch(next)
  }, [applyCardStatePatch, persistNodeConfigPatch])
  const persistWorkbenchPatch = useCallback((next: KisakiWorkbenchPersistencePatch) => {
    const { cacheRegeneration, imageComparison, ...cardPatch } = next
    patch({
      ...cardPatch,
      ...(cacheRegeneration ? {
        czkawkaCacheSourceVersion: cacheRegeneration.sourceVersion,
          czkawkaCacheRegenerationNoticeSourceVersion: cacheRegeneration.noticeSourceVersion,
      } : {}),
      ...(imageComparison ? {
        imageComparisonMode: imageComparison.mode,
        imageComparisonColorCoding: imageComparison.colorCoding,
      } : {}),
    })
  }, [patch])

  useEffect(() => {
    const migration = kisakiStateMigrationPatch(rawData)
    if (migration) patch(migration)
  }, [patch, rawData])

  const workbenchRef = useRef<KisakiWorkbench | undefined>(undefined)
  if (!workbenchRef.current) {
    workbenchRef.current = createKisakiWorkbench({
      result: data.result,
      filterStatesByTool: data.filterStatesByTool,
      activityLog: data.activityLog,
      cacheRegeneration: {
        sourceVersion: data.czkawkaCacheSourceVersion,
        noticeSourceVersion: data.czkawkaCacheRegenerationNoticeSourceVersion,
      },
      imageComparison: {
        mode: data.imageComparisonMode,
        colorCoding: data.imageComparisonColorCoding,
      },
    }, { persist: persistWorkbenchPatch })
  }
  const workbench = workbenchRef.current
  workbench.updatePort({
    persist: persistWorkbenchPatch,
    run: host.runner?.run ?? host.actions?.run,
    cancel: host.runner?.cancelCurrent ?? host.actions?.cancelCurrent,
  })
  const subscribe = useCallback((listener: () => void) => workbench.subscribe(listener), [workbench])
  const state = useSyncExternalStore(subscribe, workbench.getState, workbench.getState)

  const [filterPresets, setFilterPresetsState] = useState(() => data.filterPresets ?? [])
  const [selectionConfig, setSelectionConfigState] = useState(() => data.selectionAssistantConfig ?? createDefaultKisakiSelectionAssistantConfig())
  const [selectionAssistantOpen, setSelectionAssistantOpenState] = useState(data.selectionAssistantOpen ?? false)
  const [cardLayout, setCardLayoutState] = useState<KisakiCardLayout>(() => normalizeKisakiCardLayout(data.cardLayout))
  const [workspaceLayout, setWorkspaceLayoutState] = useState<KisakiWorkspaceLayout>(() => normalizeKisakiWorkspaceLayout(data.workspaceLayout))
  const [previewPanelEnabledByTool, setPreviewPanelEnabledByTool] = useState<Partial<Record<KisakiTool, boolean>>>(() => data.previewPanelEnabledByTool ?? {})
  const [thumbnailEnabledByTool, setThumbnailEnabledByTool] = useState<Partial<Record<KisakiTool, boolean>>>(() => data.thumbnailEnabledByTool ?? {})
  const floatingViewport: KisakiFloatingViewport = {
    width: Math.max(320, surface.width || 1200),
    height: Math.max(240, surface.height || 760),
  }
  const [floatingAnalysisPanelState, setFloatingAnalysisPanelState] = useState<KisakiFloatingPanelState>(() => data.floatingAnalysisPanel ?? createDefaultKisakiFloatingPanel(floatingViewport))
  const [filterNow] = useState(Date.now)
  const [similarImagesViewMode, setSimilarImagesViewModeState] = useState<KisakiSimilarImagesViewMode>(() => data.similarImagesViewMode ?? "images")
  const [nativeCapabilities, setNativeCapabilities] = useState<ReadonlySet<string>>(() => new Set())

  // These values are rendered from local state, so copy their TOML-backed values
  // after the asynchronous node-config read updates the card state.
  useEffect(() => {
    setFilterPresetsState(data.filterPresets ?? [])
    setSelectionConfigState(data.selectionAssistantConfig ?? createDefaultKisakiSelectionAssistantConfig())
    setPreviewPanelEnabledByTool(data.previewPanelEnabledByTool ?? {})
    setThumbnailEnabledByTool(data.thumbnailEnabledByTool ?? {})
    setSimilarImagesViewModeState(data.similarImagesViewMode ?? "images")
  }, [
    data.filterPresets,
    data.previewPanelEnabledByTool,
    data.selectionAssistantConfig,
    data.similarImagesViewMode,
    data.thumbnailEnabledByTool,
  ])

  useEffect(() => {
    let active = true
    void host.runner?.getInfo?.<KisakiRuntimeInfo>("kisaki").then(
      (info) => { if (active) setNativeCapabilities(new Set(info.capabilities)) },
      () => { if (active) setNativeCapabilities(new Set()) },
    )
    return () => { active = false }
  }, [host.runner])

  const result = workbench.getResult(tool, data.result)
  const selectedPaths = workbench.getSelectedPaths(tool)
  const filterState = normalizeKisakiFilterState(workbench.getFilterState(tool) ?? data.filterStatesByTool?.[tool])
  const filterResult = applyKisakiFilters(result?.groups ?? [], selectedPaths, filterState, filterNow, tool)
  const selectionHistory = workbench.getSelectionHistory(tool)
  const selectionStats = calculateKisakiSelectionStats(filterResult.groups, selectedPaths)
  const compact = surface.mode === "compact" || surface.mode === "portrait" || surface.width < 760

  function setCardLayout(next: KisakiCardLayout) {
    setCardLayoutState(next)
    patch({ cardLayout: next })
  }

  function setWorkspaceLayout(next: KisakiWorkspaceLayout) {
    const normalized = normalizeKisakiWorkspaceLayout(next)
    setWorkspaceLayoutState(normalized)
    patch({ schemaVersion: KISAKI_STATE_VERSION, workspaceLayout: normalized })
  }

  function setPreviewPanelEnabled(enabled: boolean) {
    const next = { ...previewPanelEnabledByTool, [tool]: enabled }
    setPreviewPanelEnabledByTool(next)
    patch({ previewPanelEnabledByTool: next })
  }

  function setThumbnailEnabled(enabled: boolean) {
    const next = { ...thumbnailEnabledByTool, [tool]: enabled }
    setThumbnailEnabledByTool(next)
    patch({ thumbnailEnabledByTool: next })
  }

  function setSimilarImagesViewMode(mode: KisakiSimilarImagesViewMode) {
    setSimilarImagesViewModeState(mode)
    patch({ similarImagesViewMode: mode })
  }

  function setFloatingAnalysisPanel(next: KisakiFloatingPanelState) {
    const normalized = normalizeKisakiFloatingPanel(next, floatingViewport)
    setFloatingAnalysisPanelState(normalized)
    patch({ floatingAnalysisPanel: normalized })
  }

  function setFilterState(next: typeof filterState) {
    workbench.setFilterState(tool, next)
  }

  function setFilterText(value: string) {
    setFilterState({ ...filterState, text: { ...filterState.text, enabled: Boolean(value), pattern: value } })
  }

  function setFilterPresets(next: typeof filterPresets) {
    setFilterPresetsState(next)
    patch({ filterPresets: next })
  }

  function setSelectionConfig(next: typeof selectionConfig) {
    setSelectionConfigState(next)
    patch({ selectionAssistantConfig: next })
  }

  function setSelectionAssistantOpen(open: boolean) {
    setSelectionAssistantOpenState(open)
    patch({ selectionAssistantOpen: open })
  }

  function applySelectionRule(kind: "group" | "text" | "directory") {
    const mode = kind === "directory" && selectionConfig.directory.mode === "exclude-directory" ? "remove" : selectionConfig.applyMode
    const selection = kind === "group"
      ? applyKisakiGroupSelection(filterResult.groups, selectedPaths, selectionConfig.group, mode)
      : kind === "text"
        ? applyKisakiTextSelection(filterResult.groups, selectedPaths, selectionConfig.text, mode)
        : applyKisakiDirectorySelection(filterResult.groups, selectedPaths, selectionConfig.directory, mode)
    if (!selection.error) workbench.setSelectedPaths(tool, selection.paths)
    return selection
  }

  async function executeScan() {
    await workbench.executeScan(tool, scanInput(tool, data), {
      noRoots: t("errors.noRoots", "请至少添加一个包含目录。"),
      noRuntime: t("errors.noRuntime", "当前环境没有本地运行能力。"),
      cacheRegeneration: t("notices.cacheRegeneration", "Czkawka 12 将为本次扫描重新生成不兼容的缓存项。"),
      starting: t("progress.starting", "正在启动 Kisaki 扫描。"),
      stopping: t("progress.stopping", "正在请求停止 Kisaki 扫描..."),
    })
  }

  async function cancelScan() {
    await workbench.cancelScan(tool, { stopping: t("progress.stopping", "正在请求停止 Kisaki 扫描...") })
  }

  async function executeOperation(action: KisakiAction, overrides: Partial<KisakiInput> = {}) {
    const operationPaths = overrides.selectedPaths ?? selectedPaths
    const input = {
      ...createKisakiOperationInput(action as Exclude<KisakiAction, "scan">, { ...data, tool, selectedPaths: operationPaths }),
      ...overrides,
    }
    await workbench.executeOperation(tool, action, input, { description: (kind, count) => `${kind} ${count} item(s)...` })
  }

  return {
    data,
    tool,
    nativeCapabilities,
    result,
    filterState,
    filterResult,
    filterPresets,
    selectionConfig,
    selectionStats,
    selectionHistory,
    selectionAssistantOpen,
    activityLog: state.activityLog,
    cardLayout,
    workspaceLayout,
    similarImagesViewMode,
    imageComparison: state.imageComparison,
    previewPanelEnabled: previewPanelEnabledByTool[tool] ?? false,
    thumbnailEnabled: thumbnailEnabledByTool[tool] ?? true,
    floatingAnalysisPanel: normalizeKisakiFloatingPanel(floatingAnalysisPanelState, floatingViewport),
    floatingViewport,
    floatingAvailable: !compact,
    canResizeWorkspace: !compact,
    running: state.running,
    selectedPaths,
    filterText: filterState.text.pattern,
    panel: state.panel,
    t,
    language,
    getFileUrl: host.localFiles?.getUrl,
    pickFiles: host.localFiles?.pickFiles,
    pickDirectory: host.localFiles?.pickDirectory,
    pickDirectories: host.localFiles?.pickDirectories,
    copyText: host.clipboard?.writeText,
    copyFiles: host.clipboard?.writeFiles,
    openPath: host.localFiles?.openPath,
    revealPath: host.localFiles?.revealPath,
    patch,
    clearActivityLog: workbench.clearActivityLog,
    setCardLayout,
    setWorkspaceLayout,
    setSimilarImagesViewMode,
    openImageComparison: (path) => workbench.openImageComparison(result?.groups ?? [], path),
    closeImageComparison: () => workbench.closeImageComparison(),
    setImageComparisonMode: (mode) => workbench.setImageComparisonMode(mode),
    setImageComparisonColorCoding: (colorCoding) => workbench.setImageComparisonColorCoding(colorCoding),
    setImageComparisonTarget: (path) => workbench.setImageComparisonTarget(result?.groups ?? [], path),
    setImageComparisonSwipe: (swipePercent) => workbench.setImageComparisonSwipe(swipePercent),
    setImageComparisonOpacity: (onionOpacity) => workbench.setImageComparisonOpacity(onionOpacity),
    setPreviewPanelEnabled,
    setThumbnailEnabled,
    setFloatingAnalysisPanel,
    setPanel: workbench.setPanel,
    setSelectedPaths: (paths) => workbench.setSelectedPaths(tool, paths),
    setFilterState,
    setFilterPresets,
    setFilterText,
    setSelectionConfig,
    setSelectionAssistantOpen,
    applySelectionRule,
    undoSelection: () => workbench.undoSelection(tool),
    redoSelection: () => workbench.redoSelection(tool),
    invertSelection: () => workbench.setSelectedPaths(tool, invertKisakiSelection(filterResult.groups, selectedPaths)),
    selectAllVisible: () => workbench.setSelectedPaths(tool, selectAllKisakiEntries(filterResult.groups)),
    executeScan,
    cancelScan,
    executeOperation,
    applySmartSelection: (strategy) => result && workbench.setSelectedPaths(tool, smartSelect(result.groups, strategy)),
  }
}

function getData(host: Host, compId: string): KisakiCardState {
  return host.state?.getData?.() ?? host.getData<KisakiCardState>(compId) ?? {}
}
