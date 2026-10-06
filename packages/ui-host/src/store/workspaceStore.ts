/**
 * 工作区主 Store —— 整个 Xiranite 前端的全局状态中心。
 *
 * 该 store 聚合了 UI 偏好、视图模式、工作区结构、组件实例、泳道、覆盖层
 * 等所有状态，由 5 个 slice（ui/workspace/component/lane/backend）拼装而成。
 *
 * 持久化策略：
 * - 通过 zustand persist 中间件把 UI 偏好写入 localStorage（key:
 *   xiranite-workspace-ui），刷新页面时恢复
 * - 业务数据（workspaces/lanes/components）不写入 localStorage，而是由
 *   WorkspaceProvider 通过 useMutation 同步到后端 SQLite
 * - partialize 选择器只持久化 UI 偏好字段，业务数据由后端 hydrate
 *
 * 版本迁移：version=2 引入了 themeSelections（明暗方案独立选择），migrate
 * 函数把 v1 的单一 theme/activeCustomThemeName 字段升级为 light/dark 两个
 * 独立选择，避免老用户升级后主题设置丢失。
 *
 * 该文件还导出多个常用 hook（useWorkspaceSelector/useWorkspaceShallowSelector/
 * useWorkspaceVisibleComponents/useWorkspaceComponent/useWorkspaceComponentData）
 * 与两个 selector 工厂（selectWorkspaceState/selectWorkspaceActions），用于
 * 在不暴露完整 store 的情况下订阅子集，减少不必要的重渲染。
 */
import { create } from "zustand"
import { createJSONStorage, devtools, persist } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"
import type { ComponentInstance } from "@/types/workspace"
import { sanitizePersistedBackgroundImageUrl } from "@/lib/backgroundImage"
import { normalizeDesignThemeConfig } from "@/lib/design-theme/contract"
import { createWorkspaceActions } from "@/store/workspace/actions"
import { INITIAL_STATE } from "@/store/workspace/constants"
import type { WorkspaceActions, WorkspaceUiPreferences, WSState, WSStore } from "@/store/workspace/types"

/** 组件 data 字段缺失时的回退空对象（共享同一引用，避免每次渲染新建）。 */
const EMPTY_COMPONENT_DATA = {} as Record<string, unknown>

/**
 * 从完整 store 中挑选出需要持久化到 localStorage 的 UI 偏好字段。
 *
 * 注意 bgImageUrl 会经过 sanitizePersistedBackgroundImageUrl 处理：
 * base64 data URL 不写入 localStorage（体积过大），只保留 URL/path 字符串。
 * 完整的 base64 数据由后端 SQLite kv_store 表持久化。
 */
export function selectWorkspaceUiPreferences(state: WSStore): WorkspaceUiPreferences {
  return {
    theme: state.theme,
    themeSelections: state.themeSelections,
    customThemes: state.customThemes,
    activeCustomThemeName: state.activeCustomThemeName,
    fontPreset: state.fontPreset,
    designTheme: state.designTheme,
    cardLayout: state.cardLayout,
    overlayMode: state.overlayMode,
    overlayWidth: state.overlayWidth,
    overlayFloatingMetrics: state.overlayFloatingMetrics,
    grainEnabled: state.grainEnabled,
    vignetteDepth: state.vignetteDepth,
    grainIntensity: state.grainIntensity,
    actionGlow: state.actionGlow,
    cardElevation: state.cardElevation,
    bgMode: state.bgMode,
    bgImageUrl: sanitizePersistedBackgroundImageUrl(state.bgImageUrl),
    bgOpacity: state.bgOpacity,
    bgBlur: state.bgBlur,
    bgCoverTopBar: state.bgCoverTopBar,
    liquidGlassEnabled: state.liquidGlassEnabled,
    liquidGlassOpacity: state.liquidGlassOpacity,
    liquidGlassBlur: state.liquidGlassBlur,
    liquidGlassDisplacement: state.liquidGlassDisplacement,
    chromeVisible: state.chromeVisible,
    chromePosition: state.chromePosition,
    chromeStyle: state.chromeStyle,
    chromeIslandScale: state.chromeIslandScale,
    chromeIslandMotion: state.chromeIslandMotion,
    chromeIslandDelay: state.chromeIslandDelay,
    chromeIslandIdleOffset: state.chromeIslandIdleOffset,
    chromeActionOrder: state.chromeActionOrder,
    chromeHiddenActions: state.chromeHiddenActions,
    wheelActionOrder: state.wheelActionOrder,
    wheelHiddenActions: state.wheelHiddenActions,
    wheelRadiusPx: state.wheelRadiusPx,
    wheelSectorPitchDeg: state.wheelSectorPitchDeg,
    floatingWindowCaptionPosition: state.floatingWindowCaptionPosition,
    floatingWindowCaptionStyle: state.floatingWindowCaptionStyle,
    floatingWindowCaptionAutoCollapse: state.floatingWindowCaptionAutoCollapse,
    alphabetIndexVisible: state.alphabetIndexVisible,
    alphabetIndexOpacity: state.alphabetIndexOpacity,
    alphabetIndexStyle: state.alphabetIndexStyle,
    alphabetIndexWaveIntensity: state.alphabetIndexWaveIntensity,
    cardClickAction: state.cardClickAction,
    cardDoubleClickAction: state.cardDoubleClickAction,
    tabDisplayStyle: state.tabDisplayStyle,
    switchDisplayStyle: state.switchDisplayStyle,
    scrollbarDisplayStyle: state.scrollbarDisplayStyle,
    sliderDisplayStyle: state.sliderDisplayStyle,
    choiceControlStyle: state.choiceControlStyle,
    fieldTitleStyle: state.fieldTitleStyle,
    moduleTitleStyle: state.moduleTitleStyle,
    modulePanelStyle: state.modulePanelStyle,
    resizableHandleStyle: state.resizableHandleStyle,
    hazardMode: state.hazardMode,
    restoreWorkspaceComponents: state.restoreWorkspaceComponents,
    laneWorkspacePreferences: state.laneWorkspacePreferences,
  }
}

/**
 * persist 的 hydrate 合并点（单独导出以便直接测它）。
 *
 * 落盘的那份快照可能是「配方字段加进去之前」写的：`designTheme` 里没有 `mondrian` 就是这种形状，
 * 浅合并会把半成品原样带回 store，而读 `config.mondrian.accent` 的界面当场崩（2026-10-05 实机撞到的）。
 * `sanitizeUiPreferences` 那条清洗只覆盖「宿主 → store」这一路；localStorage 这一路是 zustand
 * 自己 hydrate 的，所以嵌套配置进 store 之前必须在这里也过同一个解析器。
 */
export function mergePersistedWorkspaceUi(persisted: unknown, current: WSStore): WSStore {
  const state = (persisted ?? {}) as Partial<WSState>
  const merged = { ...current, ...state }
  merged.designTheme = normalizeDesignThemeConfig(state.designTheme ?? current.designTheme)
  return merged
}

/**
 * 工作区主 store 实例。
 *
 * 中间件顺序：devtools → persist → store creator。
 * devtools 包裹在最外层，让 Redux DevTools 能看到 persist 重放的事件。
 */
export const useWorkspaceStore = create<WSStore>()(
  devtools(
    persist(
      (set) => ({
        ...INITIAL_STATE,
        ...createWorkspaceActions(set),
      }),
      {
        name: "xiranite-workspace-ui",
        version: 3,
        storage: createJSONStorage(() => localStorage),
        partialize: selectWorkspaceUiPreferences,
        merge: mergePersistedWorkspaceUi,
        // v1 → v2 迁移：把单一主题选择升级为 light/dark 双方案
        migrate: (persisted, version) => {
          const state = persisted as Partial<WSStore>
          const migrated = { ...state }
          if (version < 2 && !state.themeSelections) {
            const selection = state.activeCustomThemeName
              ? { kind: "custom" as const, name: state.activeCustomThemeName }
              : { kind: "preset" as const, name: state.theme ?? "wuling" }
            migrated.themeSelections = { light: selection, dark: selection }
          }
          if (version < 3 && state.floatingWindowCaptionStyle === "capsule") {
            migrated.floatingWindowCaptionStyle = "windows"
          }
          return migrated
        },
      },
    ),
    { name: "xiranite-workspace" },
  ),
)

/** 订阅 store 中的单个派生值（无浅比较，适合基础类型）。 */
export function useWorkspaceSelector<T>(selector: (state: WSState) => T): T {
  return useWorkspaceStore((store) => selector(store))
}

/** 订阅 store 中的对象/数组派生值（useShallow 浅比较，避免每次 set 都重渲染）。 */
export function useWorkspaceShallowSelector<T>(selector: (state: WSState) => T): T {
  return useWorkspaceStore(useShallow((store) => selector(store)))
}

/** 订阅当前激活工作区中的所有组件（已按 workspaceId 过滤）。 */
export function useWorkspaceVisibleComponents(): ComponentInstance[] {
  return useWorkspaceStore(useShallow((state) =>
    state.components.filter((component) => component.workspaceId === state.activeWorkspaceId),
  ))
}

/** 按 id 订阅单个组件实例（找不到返回 undefined）。 */
export function useWorkspaceComponent(compId: string): ComponentInstance | undefined {
  return useWorkspaceStore((state) => state.components.find((component) => component.id === compId))
}

/** 按 id 订阅单个组件的 data 字段（找不到时返回共享的空对象，避免 undefined）。 */
export function useWorkspaceComponentData<T extends object>(compId: string): T {
  return useWorkspaceStore((state) =>
    (state.components.find((component) => component.id === compId)?.data ?? EMPTY_COMPONENT_DATA) as T,
  )
}

/** 非 hook 形式获取当前 store 状态快照（用于事件处理器、定时器等非 React 上下文）。 */
export function getWorkspaceState(): WSState {
  return selectWorkspaceState(useWorkspaceStore.getState())
}

/** 订阅全部 actions（useShallow 浅比较，actions 引用稳定，不会触发重渲染）。 */
export function useWorkspaceActions(): WorkspaceActions {
  return useWorkspaceStore(useShallow(selectWorkspaceActions))
}

/**
 * 从完整 store 中挑选出 WSState（状态字段，不含 actions）。
 * 用于 getWorkspaceState 非 hook 调用与外部模块读取状态。
 */
function selectWorkspaceState(store: WSStore): WSState {
  return {
    theme: store.theme,
    themeSelections: store.themeSelections,
    customThemes: store.customThemes,
    activeCustomThemeName: store.activeCustomThemeName,
    fontPreset: store.fontPreset,
    designTheme: store.designTheme,
    viewMode: store.viewMode,
    cardLayout: store.cardLayout,
    workspaces: store.workspaces,
    activeWorkspaceId: store.activeWorkspaceId,
    components: store.components,
    lanes: store.lanes,
    focusedComponentId: store.focusedComponentId,
    fullscreenComponentId: store.fullscreenComponentId,
    selectedComponentIds: store.selectedComponentIds,
    zCounter: store.zCounter,
    overlay: store.overlay,
    overlayMode: store.overlayMode,
    overlayWidth: store.overlayWidth,
    overlayFloatingMetrics: store.overlayFloatingMetrics,
    grainEnabled: store.grainEnabled,
    vignetteDepth: store.vignetteDepth,
    grainIntensity: store.grainIntensity,
    actionGlow: store.actionGlow,
    cardElevation: store.cardElevation,
    backendReady: store.backendReady,
    bgMode: store.bgMode,
    bgImageUrl: store.bgImageUrl,
    bgOpacity: store.bgOpacity,
    bgBlur: store.bgBlur,
    bgCoverTopBar: store.bgCoverTopBar,
    liquidGlassEnabled: store.liquidGlassEnabled,
    liquidGlassOpacity: store.liquidGlassOpacity,
    liquidGlassBlur: store.liquidGlassBlur,
    liquidGlassDisplacement: store.liquidGlassDisplacement,
    chromeVisible: store.chromeVisible,
    chromePosition: store.chromePosition,
    chromeStyle: store.chromeStyle,
    chromeIslandScale: store.chromeIslandScale,
    chromeIslandMotion: store.chromeIslandMotion,
    chromeIslandDelay: store.chromeIslandDelay,
    chromeIslandIdleOffset: store.chromeIslandIdleOffset,
    chromeActionOrder: store.chromeActionOrder,
    chromeHiddenActions: store.chromeHiddenActions,
    wheelActionOrder: store.wheelActionOrder,
    wheelHiddenActions: store.wheelHiddenActions,
    wheelRadiusPx: store.wheelRadiusPx,
    wheelSectorPitchDeg: store.wheelSectorPitchDeg,
    floatingWindowCaptionPosition: store.floatingWindowCaptionPosition,
    floatingWindowCaptionStyle: store.floatingWindowCaptionStyle,
    floatingWindowCaptionAutoCollapse: store.floatingWindowCaptionAutoCollapse,
    cardClickAction: store.cardClickAction,
    cardDoubleClickAction: store.cardDoubleClickAction,
    tabDisplayStyle: store.tabDisplayStyle,
    switchDisplayStyle: store.switchDisplayStyle,
    scrollbarDisplayStyle: store.scrollbarDisplayStyle,
    sliderDisplayStyle: store.sliderDisplayStyle,
    choiceControlStyle: store.choiceControlStyle,
    fieldTitleStyle: store.fieldTitleStyle,
    moduleTitleStyle: store.moduleTitleStyle,
    modulePanelStyle: store.modulePanelStyle,
    resizableHandleStyle: store.resizableHandleStyle,
    hazardMode: store.hazardMode,
    restoreWorkspaceComponents: store.restoreWorkspaceComponents,
  }
}

/**
 * 从完整 store 中挑选出 WorkspaceActions（所有 action 方法）。
 * actions 由 createWorkspaceActions 一次性创建，引用稳定，订阅该选择器
 * 不会因 state 变化而触发重渲染。
 */
export function selectWorkspaceActions(store: WSStore): WorkspaceActions {
  return {
    setTheme: store.setTheme,
    setThemeSelection: store.setThemeSelection,
    hydrateUiPreferences: store.hydrateUiPreferences,
    setCustomThemes: store.setCustomThemes,
    setActiveCustomThemeName: store.setActiveCustomThemeName,
    setFontPreset: store.setFontPreset,
    setDesignTheme: store.setDesignTheme,
    setViewMode: store.setViewMode,
    setCardLayout: store.setCardLayout,
    setActiveWorkspace: store.setActiveWorkspace,
    addWorkspace: store.addWorkspace,
    removeWorkspace: store.removeWorkspace,
    renameWorkspace: store.renameWorkspace,
    setWorkspaceIcon: store.setWorkspaceIcon,
    setWorkspaceFlowCanvas: store.setWorkspaceFlowCanvas,
    setWorkspaceFlowCamera: store.setWorkspaceFlowCamera,
    deployComponent: store.deployComponent,
    ensureComponent: store.ensureComponent,
    removeComponent: store.removeComponent,
    removeComponentsByModule: store.removeComponentsByModule,
    setComponentState: store.setComponentState,
    setComponentPosition: store.setComponentPosition,
    moveComponent: store.moveComponent,
    setComponentFlowPos: store.setComponentFlowPos,
    setComponentFlowSize: store.setComponentFlowSize,
    setComponentBentoLayout: store.setComponentBentoLayout,
    setComponentLaneSize: store.setComponentLaneSize,
    setComponentData: store.setComponentData,
    patchComponentData: store.patchComponentData,
    updateComponent: store.updateComponent,
    setComponentDockPanel: store.setComponentDockPanel,
    setComponentVisibility: store.setComponentVisibility,
    toggleComponentVisibility: store.toggleComponentVisibility,
    setComponentTags: store.setComponentTags,
    focusComponent: store.focusComponent,
    setFullscreen: store.setFullscreen,
    raiseComponent: store.raiseComponent,
    toggleCollapse: store.toggleCollapse,
    duplicateComponent: store.duplicateComponent,
    setSelection: store.setSelection,
    toggleSelection: store.toggleSelection,
    addToSelection: store.addToSelection,
    clearSelection: store.clearSelection,
    removeComponents: store.removeComponents,
    duplicateComponents: store.duplicateComponents,
    toggleCollapseComponents: store.toggleCollapseComponents,
    setComponentsVisibility: store.setComponentsVisibility,
    setOverlay: store.setOverlay,
    setOverlayMode: store.setOverlayMode,
    setOverlayWidth: store.setOverlayWidth,
    setOverlayFloatingMetrics: store.setOverlayFloatingMetrics,
    setGrain: store.setGrain,
    setVignette: store.setVignette,
    setGrainIntensity: store.setGrainIntensity,
    setActionGlow: store.setActionGlow,
    setCardElevation: store.setCardElevation,
    setBgMode: store.setBgMode,
    setBgImageUrl: store.setBgImageUrl,
    setBgOpacity: store.setBgOpacity,
    setBgBlur: store.setBgBlur,
    setBgCoverTopBar: store.setBgCoverTopBar,
    setLiquidGlassEnabled: store.setLiquidGlassEnabled,
    setLiquidGlassOpacity: store.setLiquidGlassOpacity,
    setLiquidGlassBlur: store.setLiquidGlassBlur,
    setLiquidGlassDisplacement: store.setLiquidGlassDisplacement,
    setChromeVisible: store.setChromeVisible,
    setChromePosition: store.setChromePosition,
    setChromeStyle: store.setChromeStyle,
    setChromeIslandScale: store.setChromeIslandScale,
    setChromeIslandMotion: store.setChromeIslandMotion,
    setChromeIslandDelay: store.setChromeIslandDelay,
    setChromeIslandIdleOffset: store.setChromeIslandIdleOffset,
    setChromeActionOrder: store.setChromeActionOrder,
    setChromeHiddenActions: store.setChromeHiddenActions,
    setChromeActionPreferences: store.setChromeActionPreferences,
    setWheelPreferences: store.setWheelPreferences,
    setWheelGeometry: store.setWheelGeometry,
    setFloatingWindowCaptionPosition: store.setFloatingWindowCaptionPosition,
    setFloatingWindowCaptionStyle: store.setFloatingWindowCaptionStyle,
    setFloatingWindowCaptionAutoCollapse: store.setFloatingWindowCaptionAutoCollapse,
    setAlphabetIndexVisible: store.setAlphabetIndexVisible,
    setAlphabetIndexOpacity: store.setAlphabetIndexOpacity,
    setAlphabetIndexStyle: store.setAlphabetIndexStyle,
    setAlphabetIndexWaveIntensity: store.setAlphabetIndexWaveIntensity,
    setCardClickAction: store.setCardClickAction,
    setCardDoubleClickAction: store.setCardDoubleClickAction,
    setTabDisplayStyle: store.setTabDisplayStyle,
    setSwitchDisplayStyle: store.setSwitchDisplayStyle,
    setScrollbarDisplayStyle: store.setScrollbarDisplayStyle,
    setSliderDisplayStyle: store.setSliderDisplayStyle,
    setChoiceControlStyle: store.setChoiceControlStyle,
    setFieldTitleStyle: store.setFieldTitleStyle,
    setModuleTitleStyle: store.setModuleTitleStyle,
    setModulePanelStyle: store.setModulePanelStyle,
    setResizableHandleStyle: store.setResizableHandleStyle,
    setHazardMode: store.setHazardMode,
    setRestoreWorkspaceComponents: store.setRestoreWorkspaceComponents,
    patchLaneWorkspacePreferences: store.patchLaneWorkspacePreferences,
    addLane: store.addLane,
    removeLane: store.removeLane,
    renameLane: store.renameLane,
    setLaneWidthRatio: store.setLaneWidthRatio,
    toggleLaneCollapse: store.toggleLaneCollapse,
    toggleLaneVisibility: store.toggleLaneVisibility,
    reorderLane: store.reorderLane,
    setLaneCardOrder: store.setLaneCardOrder,
    setLaneBoardLayout: store.setLaneBoardLayout,
    moveComponentToLane: store.moveComponentToLane,
    setBackendReady: store.setBackendReady,
    hydrate: store.hydrate,
  }
}
