/**
 * WorkspaceProvider —— 工作区数据的"查询-持久化"循环控制器。
 *
 * 该 Provider 不渲染任何 UI，只负责：
 * 1. 通过 useQuery 从后端拉取 workspace/lane/component 快照，首次加载时调用
 *    store.hydrate 灌入 Zustand store
 * 2. 监听 store 中 workspaces/lanes/components 的变化，500ms 防抖后通过
 *    useMutation 持久化回后端（避免高频写入）
 * 3. 维护 backendReady 标志，根据后端状态变化与查询错误实时同步
 * 4. 在 DEV 模式下挂载 window.xqa QA Controller，供 Playwright/UI 测试驱动
 *
 * 关键设计：locallyPersistedSnapshotRef 用于打破"persist onSuccess → setQueryData
 * → useQuery data 变化 → 再次 hydrate"的循环。本地 persist 成功后回写到
 * query cache 的快照不能再次触发 hydrate，否则会覆盖持久化请求在途期间
 * 发生的 node 状态更新。
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useShallow } from "zustand/react/shallow"
import type { AppTheme, CardLayout, ComponentInstance, Lane, ViewMode, WorkspaceItem } from "@/types/workspace"
import type { SwitchDisplayStyle } from "@/components/ui/switch-variants"
import type { TabDisplayStyle } from "@/components/ui/tabs-variants"
import { loadWorkspaceSnapshot as loadWorkspaceSnapshotRpc, persistWorkspaceSnapshot as persistWorkspaceSnapshotRpc } from "@/backend/workspaceRpcClient"
import { localBackendConnectionKey, type LocalBackendConfig } from "@/backend/localBackendConfig"
import { useLocalBackendStatus } from "@/hooks/useLocalBackendStatus"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { WSStore } from "@/store/workspace/types"
import type { ComponentDTO, LaneDTO, WorkspaceDTO, WorkspaceSnapshotDTO } from "@xiranite/shared"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { createLogger } from "@/lib/logger"

const logger = createLogger("workspace")

type WorkspaceSnapshot = WorkspaceSnapshotDTO

const WORKSPACE_SNAPSHOT_QUERY_KEY = ["workspace", "snapshot"] as const
const QA_VIEW_MODES = new Set<ViewMode>(["dashboard", "cards", "dockview", "flow", "lane", "bento"])
const QA_CARD_LAYOUTS = new Set<CardLayout>(["grid", "stack", "split", "focus"])

function workspaceSnapshotQueryKey(config: LocalBackendConfig | undefined) {
  if (!config) return [...WORKSPACE_SNAPSHOT_QUERY_KEY, "unconfigured"] as const
  return [
    ...WORKSPACE_SNAPSHOT_QUERY_KEY,
    config.baseUrl,
    config.token ? "token:set" : "token:none",
    config.instanceId ?? "instance:unknown",
  ] as const
}

export function BackendConnectionBoundary({ config, children }: { config?: LocalBackendConfig, children: ReactNode }) {
  const connectionKey = localBackendConnectionKey(config)
  const previousConnectionKeyRef = useRef<string | undefined>(undefined)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!connectionKey) return
    const previousConnectionKey = previousConnectionKeyRef.current
    previousConnectionKeyRef.current = connectionKey
    if (previousConnectionKey && previousConnectionKey !== connectionKey) {
      setGeneration((current) => current + 1)
    }
  }, [connectionKey])

  return <Fragment key={generation}>{children}</Fragment>
}

/**
 * Components are intentionally excluded while automatic restore is disabled.
 * Their payload can be large, but it cannot affect the live store in that
 * mode, so it must not trigger another hydration pass.
 */
export function workspaceSnapshotHydrationKey(snapshot: WorkspaceSnapshot, restoreComponents = false): string {
  return JSON.stringify(restoreComponents
    ? snapshot
    : { workspaces: snapshot.workspaces, lanes: snapshot.lanes })
}

function toWorkspaceDTO(workspace: WorkspaceItem, now: number): WorkspaceDTO {
  return {
    id: workspace.id,
    label: workspace.label,
    icon: workspace.icon,
    flowCanvas: workspace.flowCanvas,
    flowCamera: workspace.flowCamera,
    createdAt: workspace.createdAt ?? now,
    updatedAt: workspace.updatedAt ?? now,
  }
}

function toLaneDTO(lane: Lane, now: number): LaneDTO {
  return {
    id: lane.id,
    label: lane.label,
    workspaceId: lane.workspaceId,
    widthRatio: lane.widthRatio,
    collapsed: lane.collapsed,
    hidden: lane.hidden,
    cardOrder: lane.cardOrder,
    createdAt: lane.createdAt ?? now,
    updatedAt: lane.updatedAt ?? now,
  }
}

function toComponentDTO(component: ComponentInstance, now: number): ComponentDTO {
  return {
    id: component.id,
    moduleId: component.moduleId,
    workspaceId: component.workspaceId,
    placement: component.placement ?? (component.state === "floating" ? "window" : "workspace"),
    windowSize: component.windowSize,
    data: component.data,
    flowPosition: component.flowPosition,
    flowSize: component.flowSize,
    bentoLayout: component.bentoLayout,
    laneSize: component.laneSize,
    dockPanel: component.dockPanel,
    laneId: component.laneId,
    hiddenIn: component.hiddenIn,
    tags: component.tags,
    z: component.z,
    collapsed: component.collapsed,
    createdAt: component.createdAt ?? now,
    updatedAt: component.updatedAt ?? now,
  }
}

async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return startupDebugAsync("workspace:load-snapshot", loadWorkspaceSnapshotRpc)
}

async function persistWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  await persistWorkspaceSnapshotRpc(snapshot)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const locallyPersistedSnapshotRef = useRef<WorkspaceSnapshot | undefined>(undefined)
  const lastHydratedSnapshotKeyRef = useRef<string | undefined>(undefined)
  const skipHydrationPersistRef = useRef(false)
  /** Last SQLite component rows. Kept so skip-restore mode never writes an empty list. */
  const snapshotComponentsRef = useRef<ComponentDTO[]>([])
  const localBackendStatus = useLocalBackendStatus()
  const localBackendReady = localBackendStatus.data?.status === "ready"
  const workspaceQueryKey = workspaceSnapshotQueryKey(localBackendStatus.data?.config)
  const hydrate = useWorkspaceStore((state) => state.hydrate)
  const setBackendReady = useWorkspaceStore((state) => state.setBackendReady)
  const backendReady = useWorkspaceStore((state) => state.backendReady)
  const restoreWorkspaceComponents = useWorkspaceStore((state) => state.restoreWorkspaceComponents)
  const restoreComponentsForSessionRef = useRef(false)
  if (restoreWorkspaceComponents) restoreComponentsForSessionRef.current = true
  const restoreComponents = restoreComponentsForSessionRef.current
  const { workspaces, lanes, components } = useWorkspaceStore(
    useShallow((state) => ({
      workspaces: state.workspaces,
      lanes: state.lanes,
      components: state.components,
    })),
  )

  startupDebug("react:workspace-provider-render", {
    backendStatus: localBackendStatus.data?.status ?? "pending",
    backendReady,
    workspaces: workspaces.length,
    lanes: lanes.length,
    components: components.length,
    restoreComponents,
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    return installWorkspaceQaController()
  }, [])

  const workspaceQuery = useQuery({
    queryKey: workspaceQueryKey,
    queryFn: loadWorkspaceSnapshot,
    enabled: localBackendReady,
    staleTime: 5_000,
    retry: 1,
    placeholderData: keepPreviousData,
  })

  const { mutate: persistWorkspace } = useMutation({
    mutationFn: persistWorkspaceSnapshot,
    scope: { id: "workspace-persist" },
    onSuccess: (_result, snapshot) => {
      queryClient.setQueryData(workspaceQueryKey, snapshot)
      locallyPersistedSnapshotRef.current = queryClient.getQueryData<WorkspaceSnapshot>(workspaceQueryKey)
      lastHydratedSnapshotKeyRef.current = workspaceSnapshotHydrationKey(snapshot, restoreComponents)
      if (restoreComponents) {
        snapshotComponentsRef.current = snapshot.components
      }
    },
    onError: (error) => {
      logger.error("Workspace persist failed", error)
    },
  })

  useEffect(() => {
    if (!workspaceQuery.data) return
    // The Zustand store is the live source of truth after initial hydration.
    // Updating the query cache after a successful local persist must not feed
    // that (potentially older) snapshot back into the store and overwrite node
    // updates that happened while the request was in flight.
    if (workspaceQuery.data === locallyPersistedSnapshotRef.current) return

    snapshotComponentsRef.current = workspaceQuery.data.components
    const componentsToHydrate = restoreComponents ? workspaceQuery.data.components : []
    const hydrationKey = workspaceSnapshotHydrationKey(workspaceQuery.data, restoreComponents)
    if (hydrationKey === lastHydratedSnapshotKeyRef.current) return
    lastHydratedSnapshotKeyRef.current = hydrationKey

    startupDebug("workspace:hydrate-store:begin", {
      workspaces: workspaceQuery.data.workspaces.length,
      lanes: workspaceQuery.data.lanes.length,
      components: workspaceQuery.data.components.length,
      restoringComponents: componentsToHydrate.length,
      restoreComponents,
    })
    if (!restoreComponents && workspaceQuery.data.components.length > 0) {
      logger.info(
        `[workspace] component restore disabled — skipped ${workspaceQuery.data.components.length} instance(s) (SQLite rows kept)`,
      )
    }
    // Hydration changes the live store, which would otherwise schedule a full
    // snapshot PUT 500ms later. In skip-restore mode that PUT serializes every
    // retained component row despite mounting none of them.
    skipHydrationPersistRef.current = true
    hydrate(workspaceQuery.data.workspaces, workspaceQuery.data.lanes, componentsToHydrate)
    setBackendReady(true)
    startupDebug("workspace:hydrate-store:end")
  }, [hydrate, restoreComponents, setBackendReady, workspaceQuery.data])

  useEffect(() => {
    if (backendReady && (!localBackendReady || workspaceQuery.isError || (workspaceQuery.isPending && !workspaceQuery.data))) {
      setBackendReady(false)
    }
  }, [backendReady, localBackendReady, setBackendReady, workspaceQuery.data, workspaceQuery.isError, workspaceQuery.isPending])

  useEffect(() => {
    if (!workspaceQuery.error) return

    logger.error("Workspace hydrate failed", workspaceQuery.error)
    if (backendReady) setBackendReady(false)
  }, [backendReady, setBackendReady, workspaceQuery.error])

  useEffect(() => {
    if (!backendReady || !localBackendReady) return undefined

    if (skipHydrationPersistRef.current) {
      skipHydrationPersistRef.current = false
      startupDebug("workspace:persist:skip-hydration")
      return undefined
    }

    const timer = setTimeout(() => {
      const now = Date.now()
      // While restore is off, never rewrite component rows from the live store
      // (which starts empty). Keep the last SQLite snapshot so NeoView instances
      // remain available once restore is re-enabled.
      const nextComponents = restoreComponents
        ? components.map((component) => toComponentDTO(component, now))
        : snapshotComponentsRef.current
      persistWorkspace({
        workspaces: workspaces.map((workspace) => toWorkspaceDTO(workspace, now)),
        lanes: lanes.map((lane) => toLaneDTO(lane, now)),
        components: nextComponents,
      })
    }, 500)

    return () => {
      clearTimeout(timer)
    }
  }, [workspaces, lanes, components, backendReady, localBackendReady, persistWorkspace, restoreComponents])

  const content = useMemo(() => children, [children])
  return <BackendConnectionBoundary config={localBackendStatus.data?.config}>{content}</BackendConnectionBoundary>
}

/**
 * ============================================================================
 * QA Controller —— 仅在 DEV 模式挂载的测试驱动工具
 * ============================================================================
 *
 * 通过 window.xqa 暴露一系列便捷方法，让 Playwright/UI 测试能以编程方式
 * 操控工作区：切换视图、部署/聚焦/全屏组件、调整尺寸、应用预设 surface 等。
 *
 * 该控制器不参与生产环境运行，installWorkspaceQaController 在 import.meta.env.DEV
 * 为 false 时直接返回 undefined，且控制器实例仅在 useEffect 中创建并清理。
 *
 * 常用 API：
 *   - xqa.state() / xqa.components()          获取工作区与组件摘要
 *   - xqa.find(query)                         按 id/moduleId 模糊查找组件
 *   - xqa.view(mode)                          切换视图模式
 *   - xqa.stage(moduleIdOrQuery, options)     部署/复用组件并一键应用配置
 *   - xqa.resize(query, surfaceOrOptions)     应用 surface 预设或自定义尺寸
 *   - xqa.deploy(moduleId, mode)              在指定视图部署新组件
 *   - xqa.fullscreen(query) / xqa.focus(query)  全屏 / 聚焦指定组件
 *   - xqa.bento(query, layout)                设置 bento 视图的网格位置
 *   - xqa.flowSize(query, size)               设置 flow 视图的尺寸
 *   - xqa.show(query, mode) / xqa.hideView(mode, keepIds)  显示/隐藏组件
 *   - xqa.dock(query?)                        切换到 dockview 并停靠
 *   - xqa.cardLayout(layout)                  设置 cards 视图的布局
 */
interface XiraniteQaController {
  help: () => string[]
  state: () => ReturnType<typeof summarizeWorkspaceState>
  components: () => ReturnType<typeof summarizeWorkspaceComponents>
  find: (query: string) => ComponentInstance | undefined
  view: (mode: ViewMode) => ReturnType<typeof summarizeWorkspaceState>
  cardLayout: (layout: CardLayout) => ReturnType<typeof summarizeWorkspaceState>
  focus: (query: string) => ReturnType<typeof summarizeWorkspaceState>
  fullscreen: (query: string) => ReturnType<typeof summarizeWorkspaceState>
  dock: (query?: string) => ReturnType<typeof summarizeWorkspaceState>
  bento: (query: string, layout: Partial<{ x: number; y: number; w: number; h: number }>) => ReturnType<typeof summarizeWorkspaceState>
  flowSize: (query: string, size: Partial<{ width: number; height: number }>) => ReturnType<typeof summarizeWorkspaceState>
  show: (query: string, mode?: ViewMode) => ReturnType<typeof summarizeWorkspaceState>
  hideView: (mode: ViewMode, keepIds?: string[]) => ReturnType<typeof summarizeWorkspaceState>
  deploy: (moduleId: string, mode?: ViewMode) => ReturnType<typeof summarizeWorkspaceState>
  resize: (
    query: string,
    surfaceOrOptions?: QaSurfacePreset | QaResizeOptions,
    mode?: ViewMode,
  ) => QaCommandResult
  stage: (moduleIdOrQuery: string, options?: QaStageOptions) => QaCommandResult
}

declare global {
  interface Window {
    __xiraniteQA?: XiraniteQaController
    xqa?: XiraniteQaController
  }
}

type QaSurfacePreset = "collapsed" | "compact" | "portrait" | "regular" | "expanded" | "workspace"

interface QaResizeOptions {
  view?: ViewMode
  surface?: QaSurfacePreset
  cardLayout?: CardLayout
  collapsed?: boolean
  focus?: boolean
  fullscreen?: boolean
  flow?: Partial<{ x: number; y: number; width: number; height: number }>
  bento?: Partial<{ x: number; y: number; w: number; h: number }>
}

interface QaStageOptions extends QaResizeOptions {
  fresh?: boolean
  dockPanel?: string
  tags?: string[]
  data?: Record<string, unknown>
  theme?: AppTheme
  tabDisplayStyle?: TabDisplayStyle
  switchDisplayStyle?: SwitchDisplayStyle
}

type QaComponentSummary = ReturnType<typeof summarizeWorkspaceComponents>[number]
type QaCommandResult = ReturnType<typeof summarizeWorkspaceState> & {
  selected?: QaComponentSummary
}

const QA_SURFACE_PRESETS: Record<QaSurfacePreset, {
  flow: { width: number; height: number }
  bento: { w: number; h: number }
  cardLayout: CardLayout
  collapsed: boolean
  focus: boolean
  fullscreen: boolean
}> = {
  collapsed: {
    flow: { width: 260, height: 120 },
    bento: { w: 3, h: 2 },
    cardLayout: "grid",
    collapsed: true,
    focus: false,
    fullscreen: false,
  },
  compact: {
    flow: { width: 360, height: 260 },
    bento: { w: 4, h: 3 },
    cardLayout: "grid",
    collapsed: false,
    focus: false,
    fullscreen: false,
  },
  portrait: {
    flow: { width: 390, height: 720 },
    bento: { w: 3, h: 10 },
    cardLayout: "grid",
    collapsed: false,
    focus: false,
    fullscreen: false,
  },
  regular: {
    flow: { width: 560, height: 420 },
    bento: { w: 6, h: 4 },
    cardLayout: "grid",
    collapsed: false,
    focus: false,
    fullscreen: false,
  },
  expanded: {
    flow: { width: 860, height: 560 },
    bento: { w: 8, h: 6 },
    cardLayout: "focus",
    collapsed: false,
    focus: true,
    fullscreen: false,
  },
  workspace: {
    flow: { width: 1120, height: 720 },
    bento: { w: 12, h: 8 },
    cardLayout: "focus",
    collapsed: false,
    focus: false,
    fullscreen: true,
  },
}

/**
 * 在 window 上挂载 QA Controller，返回清理函数。
 *
 * 控制器同时挂载到 __xiraniteQA（正式名）与 xqa（简写）两个全局变量，
 * 便于测试脚本选择更短的写法。控制器的每个方法都返回 summarizeWorkspaceState
 * 摘要，方便测试断言当前状态。
 */
function installWorkspaceQaController(): () => void {
  const controller: XiraniteQaController = {
    help: () => [
      "window.xqa.view('dashboard' | 'cards' | 'dockview' | 'flow' | 'lane' | 'bento')",
      "window.xqa.stage('repacku', { view: 'bento', surface: 'expanded', fresh: true })",
      "window.xqa.resize('repacku', 'compact', 'flow')",
      "window.xqa.bento('repacku', { x: 0, y: 0, w: 8, h: 6 })",
      "window.xqa.flowSize('repacku', { width: 720, height: 520 })",
      "window.xqa.hideView('bento', ['comp-id-to-keep'])",
      "window.xqa.fullscreen('repacku') / window.xqa.focus('repacku')",
    ],
    state: () => summarizeWorkspaceState(useWorkspaceStore.getState()),
    components: () => summarizeWorkspaceComponents(useWorkspaceStore.getState()),
    find: (query) => findQaComponent(useWorkspaceStore.getState(), query),
    view: (mode) => {
      assertQaViewMode(mode)
      useWorkspaceStore.getState().setViewMode(mode)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    cardLayout: (layout) => {
      assertQaCardLayout(layout)
      const store = useWorkspaceStore.getState()
      store.setViewMode("cards")
      store.setCardLayout(layout)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    focus: (query) => {
      const component = requireQaComponent(query)
      const store = useWorkspaceStore.getState()
      store.setViewMode("cards")
      store.setCardLayout("focus")
      store.setFullscreen(null)
      store.focusComponent(component.id)
      store.setComponentVisibility(component.id, "cards", true)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    fullscreen: (query) => {
      const component = requireQaComponent(query)
      const store = useWorkspaceStore.getState()
      store.setViewMode("cards")
      store.setComponentVisibility(component.id, "cards", true)
      store.setFullscreen(component.id)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    dock: (query) => {
      const store = useWorkspaceStore.getState()
      if (query) {
        const component = requireQaComponent(query)
        store.setComponentState(component.id, "docked")
      }
      store.setFullscreen(null)
      store.focusComponent(null)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    bento: (query, layout) => {
      const component = requireQaComponent(query)
      const current = component.bentoLayout ?? { x: 0, y: 0, w: 4, h: 4 }
      const store = useWorkspaceStore.getState()
      store.setViewMode("bento")
      store.setComponentVisibility(component.id, "bento", true)
      store.setComponentBentoLayout(component.id, { ...current, ...layout })
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    flowSize: (query, size) => {
      const component = requireQaComponent(query)
      const current = component.flowSize ?? { width: 384, height: 320 }
      const store = useWorkspaceStore.getState()
      store.setViewMode("flow")
      store.setComponentVisibility(component.id, "flow", true)
      store.setComponentFlowSize(component.id, size.width ?? current.width, size.height ?? current.height)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    show: (query, mode) => {
      const component = requireQaComponent(query)
      const targetMode = mode ?? useWorkspaceStore.getState().viewMode
      assertQaViewMode(targetMode)
      const store = useWorkspaceStore.getState()
      store.setComponentVisibility(component.id, targetMode, true)
      store.setViewMode(targetMode)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    hideView: (mode, keepIds = []) => {
      assertQaViewMode(mode)
      const store = useWorkspaceStore.getState()
      const keep = new Set(keepIds)
      for (const component of store.components) {
        if (component.workspaceId === store.activeWorkspaceId && !keep.has(component.id)) {
          store.setComponentVisibility(component.id, mode, false)
        }
      }
      store.setViewMode(mode)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    deploy: (moduleId, mode = useWorkspaceStore.getState().viewMode) => {
      assertQaViewMode(mode)
      const store = useWorkspaceStore.getState()
      store.deployComponent(moduleId, { viewMode: mode })
      store.setViewMode(mode)
      return summarizeWorkspaceState(useWorkspaceStore.getState())
    },
    resize: (query, surfaceOrOptions, mode) => {
      const options = normalizeQaResizeOptions(surfaceOrOptions, mode)
      return stageQaComponent(query, { ...options, fresh: false })
    },
    stage: (moduleIdOrQuery, options = {}) => stageQaComponent(moduleIdOrQuery, options),
  }

  window.__xiraniteQA = controller
  window.xqa = controller
  logger.info("QA controller ready", controller.state())

  return () => {
    if (window.__xiraniteQA === controller) delete window.__xiraniteQA
    if (window.xqa === controller) delete window.xqa
  }
}

/** 生成工作区状态摘要（视图模式、布局、激活工作区、focus/fullscreen 等）。 */
function summarizeWorkspaceState(store: WSStore) {
  return {
    viewMode: store.viewMode,
    cardLayout: store.cardLayout,
    activeWorkspaceId: store.activeWorkspaceId,
    backendReady: store.backendReady,
    overlay: store.overlay,
    focusedComponentId: store.focusedComponentId,
    fullscreenComponentId: store.fullscreenComponentId,
    components: summarizeWorkspaceComponents(store),
  }
}

/** 生成当前工作区所有组件的摘要（仅包含测试断言关心的字段）。 */
function summarizeWorkspaceComponents(store: WSStore) {
  return store.components
    .filter((component) => component.workspaceId === store.activeWorkspaceId)
    .map((component) => ({
      id: component.id,
      moduleId: component.moduleId,
      state: component.state,
      collapsed: component.collapsed,
      hiddenIn: component.hiddenIn,
      flowPosition: component.flowPosition,
      flowSize: component.flowSize,
      bentoLayout: component.bentoLayout,
      laneSize: component.laneSize,
      dockPanel: component.dockPanel,
      laneId: component.laneId,
    }))
}

/**
 * QA 核心：根据 moduleId 或查询字符串部署/复用组件并应用 stage 选项。
 *
 * 流程：
 * 1. options.fresh 为 true 时先删除所有匹配的现有组件，再重新部署
 * 2. 否则尝试 findQaComponent，找不到才 deploy
 * 3. 调用 applyQaStage 把 view/surface/flow/bento/collapsed/focus/fullscreen
 *    等选项应用到组件上
 * 4. 返回带 selected 字段的结果，便于测试断言目标组件的最终状态
 */
function stageQaComponent(moduleIdOrQuery: string, options: QaStageOptions = {}): QaCommandResult {
  const targetView = options.view ?? useWorkspaceStore.getState().viewMode
  assertQaViewMode(targetView)
  if (options.cardLayout) assertQaCardLayout(options.cardLayout)
  if (options.surface) assertQaSurfacePreset(options.surface)

  let component = options.fresh
    ? deployFreshQaComponent(moduleIdOrQuery, targetView, options)
    : findQaComponent(useWorkspaceStore.getState(), moduleIdOrQuery)

  if (!component) {
    component = deployQaComponent(moduleIdOrQuery, targetView, options)
  }

  applyQaStage(component.id, targetView, options)

  const store = useWorkspaceStore.getState()
  return {
    ...summarizeWorkspaceState(store),
    selected: summarizeWorkspaceComponents(store).find((item) => item.id === component.id),
  }
}

/** fresh 模式：先删除所有匹配的现有组件，再调用 deployQaComponent 重新部署。 */
function deployFreshQaComponent(moduleId: string, view: ViewMode, options: QaStageOptions): ComponentInstance {
  const normalized = normalizeQaQuery(moduleId)
  const store = useWorkspaceStore.getState()
  const existingIds = store.components
    .filter((component) =>
      component.workspaceId === store.activeWorkspaceId
      && (component.moduleId.toLowerCase() === normalized || component.id.toLowerCase() === normalized)
    )
    .map((component) => component.id)

  for (const id of existingIds) {
    useWorkspaceStore.getState().removeComponent(id)
  }

  return deployQaComponent(moduleId, view, options)
}

/** 调用 store.deployComponent 部署新组件，并从 store 中找出新创建的实例返回。 */
function deployQaComponent(moduleId: string, view: ViewMode, options: QaStageOptions): ComponentInstance {
  const store = useWorkspaceStore.getState()
  const beforeIds = new Set(store.components.map((component) => component.id))
  store.deployComponent(moduleId, {
    viewMode: view,
    flowPosition: options.flow && (options.flow.x !== undefined || options.flow.y !== undefined)
      ? {
        x: options.flow.x ?? 100,
        y: options.flow.y ?? 100,
      }
      : undefined,
    bentoLayout: options.bento
      ? {
        x: options.bento.x ?? 0,
        y: options.bento.y ?? 0,
        w: options.bento.w ?? QA_SURFACE_PRESETS[options.surface ?? "regular"].bento.w,
        h: options.bento.h ?? QA_SURFACE_PRESETS[options.surface ?? "regular"].bento.h,
      }
      : undefined,
    dockPanel: options.dockPanel,
    tags: options.tags,
  })

  const nextStore = useWorkspaceStore.getState()
  const created = [...nextStore.components]
    .reverse()
    .find((component) =>
      component.workspaceId === nextStore.activeWorkspaceId
      && component.moduleId === moduleId
      && !beforeIds.has(component.id)
    )

  if (!created) throw new Error(`Xiranite QA failed to deploy component: ${moduleId}`)
  return created
}

/**
 * 把 stage 选项应用到指定组件：切换视图、设置可见性、写入 data、
 * 根据 view 模式应用 cardLayout/dock/flow/bento 布局，最后处理
 * collapsed/focus/fullscreen 三个独立开关。
 */
function applyQaStage(componentId: string, view: ViewMode, options: QaStageOptions): void {
  const surface = options.surface ? QA_SURFACE_PRESETS[options.surface] : undefined
  const store = useWorkspaceStore.getState()
  if (options.theme) store.setTheme(options.theme)
  if (options.tabDisplayStyle) store.setTabDisplayStyle(options.tabDisplayStyle)
  if (options.switchDisplayStyle) store.setSwitchDisplayStyle(options.switchDisplayStyle)
  store.setViewMode(view)
  store.setComponentVisibility(componentId, view, true)
  if (options.data) store.setComponentData(componentId, options.data)

  if (view === "cards") {
    const cardLayout = options.cardLayout ?? surface?.cardLayout
    if (cardLayout) store.setCardLayout(cardLayout)
  }

  if (view === "dockview") {
    store.setComponentState(componentId, "docked")
    if (options.dockPanel) store.setComponentDockPanel(componentId, options.dockPanel)
  }

  if (view === "flow") {
    const current = requireQaComponent(componentId)
    const currentSize = current.flowSize ?? { width: 384, height: 320 }
    const currentPosition = current.flowPosition ?? { x: 100, y: 100 }
    const width = options.flow?.width ?? surface?.flow.width ?? currentSize.width
    const height = options.flow?.height ?? surface?.flow.height ?? currentSize.height
    const x = options.flow?.x ?? currentPosition.x
    const y = options.flow?.y ?? currentPosition.y
    store.setComponentFlowPos(componentId, x, y)
    store.setComponentFlowSize(componentId, width, height)
  }

  if (view === "bento") {
    const current = requireQaComponent(componentId)
    const currentLayout = current.bentoLayout ?? { x: 0, y: 0, w: 4, h: 4 }
    store.setComponentBentoLayout(componentId, {
      x: options.bento?.x ?? currentLayout.x,
      y: options.bento?.y ?? currentLayout.y,
      w: options.bento?.w ?? surface?.bento.w ?? currentLayout.w,
      h: options.bento?.h ?? surface?.bento.h ?? currentLayout.h,
    })
  }

  const collapsed = options.collapsed ?? surface?.collapsed
  if (collapsed !== undefined) setQaComponentCollapsed(componentId, collapsed)

  const fullscreen = options.fullscreen ?? surface?.fullscreen
  const focus = options.focus ?? surface?.focus
  if (fullscreen) {
    store.setViewMode("cards")
    store.setComponentVisibility(componentId, "cards", true)
    store.setFullscreen(componentId)
  } else if (focus) {
    store.setViewMode("cards")
    store.setComponentVisibility(componentId, "cards", true)
    store.setCardLayout(options.cardLayout ?? "focus")
    store.setFullscreen(null)
    store.focusComponent(componentId)
  } else if (fullscreen === false && useWorkspaceStore.getState().fullscreenComponentId === componentId) {
    store.setFullscreen(null)
  }
}

/** 仅在 collapsed 状态确实需要切换时才调用 toggleCollapse，避免无意义更新。 */
function setQaComponentCollapsed(componentId: string, collapsed: boolean): void {
  const component = requireQaComponent(componentId)
  if (Boolean(component.collapsed) !== collapsed) {
    useWorkspaceStore.getState().toggleCollapse(componentId)
  }
}

/**
 * 把 resize 方法的重载参数归一化为 QaResizeOptions。
 *
 * resize 支持两种调用形式：
 *   - resize(query, 'compact', 'flow')           surface 字符串 + 可选 mode
 *   - resize(query, { surface: 'compact', ... })  options 对象
 * 该函数负责把前者转换为后者。
 */
function normalizeQaResizeOptions(
  surfaceOrOptions?: QaSurfacePreset | QaResizeOptions,
  mode?: ViewMode,
): QaResizeOptions {
  if (!surfaceOrOptions) return mode ? { view: mode } : {}
  if (typeof surfaceOrOptions === "string") {
    assertQaSurfacePreset(surfaceOrOptions)
    return { surface: surfaceOrOptions, view: mode }
  }
  if (surfaceOrOptions.surface) assertQaSurfacePreset(surfaceOrOptions.surface)
  return mode ? { ...surfaceOrOptions, view: mode } : surfaceOrOptions
}

/** 查找组件，找不到抛错（用于必须存在组件的 QA 操作）。 */
function requireQaComponent(query: string): ComponentInstance {
  const component = findQaComponent(useWorkspaceStore.getState(), query)
  if (!component) throw new Error(`Xiranite QA component not found: ${query}`)
  return component
}

/**
 * 在当前工作区按 id/moduleId 查找组件（不区分大小写，支持包含匹配）。
 * 优先精确匹配，找不到再做包含匹配，便于测试用简写引用组件。
 */
function findQaComponent(store: WSStore, query: string): ComponentInstance | undefined {
  const normalized = normalizeQaQuery(query)
  return store.components.find((component) =>
    component.workspaceId === store.activeWorkspaceId
    && (
      component.id.toLowerCase() === normalized
      || component.moduleId.toLowerCase() === normalized
      || component.id.toLowerCase().includes(normalized)
      || component.moduleId.toLowerCase().includes(normalized)
    ),
  )
}

function normalizeQaQuery(query: string): string {
  return query.trim().toLowerCase()
}

function assertQaViewMode(mode: ViewMode): void {
  if (!QA_VIEW_MODES.has(mode)) throw new Error(`Invalid Xiranite view mode: ${mode}`)
}

function assertQaCardLayout(layout: CardLayout): void {
  if (!QA_CARD_LAYOUTS.has(layout)) throw new Error(`Invalid Xiranite card layout: ${layout}`)
}

function assertQaSurfacePreset(surface: QaSurfacePreset): void {
  if (!(surface in QA_SURFACE_PRESETS)) throw new Error(`Invalid Xiranite QA surface preset: ${surface}`)
}
