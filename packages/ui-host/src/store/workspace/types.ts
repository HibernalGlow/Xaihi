/**
 * 工作区 Store 的状态、动作与持久化偏好类型定义。
 *
 * Store 采用 slice 模式拆分：
 *  - {@link WSState} —— 状态形状（含 UI 偏好、工作区/泳道/组件实例、运行时状态）；
 *  - {@link WorkspaceActions} —— 由五个 slice 接口组合而成：
 *      UI / List（工作区） / Component / Lane / Backend；
 *  - {@link WorkspaceUiPreferences} —— 仅持久化到 localStorage 的 UI 偏好子集
 *    （业务数据如 components/lanes 不在此列，由后端 SQLite 持久化）。
 */
import type {
  AppTheme,
  AppThemeScheme,
  AppThemeSelection,
  AppThemeSelections,
  AppFontPreset,
  AppCustomTheme,
  CardClickAction,
  CardLayout,
  ComponentInstance,
  ComponentState,
  DeployComponentOptions,
  FlowCanvasCamera,
  FlowCanvasSnapshot,
  Lane,
  OverlayKind,
  OverlayMode,
  ViewMode,
  WorkspaceItem,
} from "@/types/workspace"
import type { ComponentDTO, LaneDTO, WorkspaceDTO } from "@xiranite/shared"
import type { TabDisplayStyle } from "@/components/ui/tabs-variants"
import type { SwitchDisplayStyle } from "@/components/ui/switch-variants"
import type { ScrollbarDisplayStyle } from "@/components/ui/scrollbar-variants"
import type { SliderDisplayStyle } from "@/components/ui/slider-variants"
import type { ChoiceControlStyle, FieldTitleStyle } from "@/components/ui/choice-control-variants"
import type { ModulePanelStyle, ModuleTitleStyle, ResizableHandleStyle } from "@/components/ui/module-panel-variants"
import type { SwimlaneWorkspacePreferences } from "@/components/workspace/swimlane/model"
import type { ChromeActionPreferenceKey } from "@/components/workspace/chromeActionPreferences"
import type { DesignThemeConfig } from "@/lib/design-theme/contract"

/** 工作区 Store 完整状态：UI 偏好 + 业务数据 + 运行时标志。 */
export interface WSState {
  /** 当前主题预设 key（仅作 fallback，真正选择以 themeSelections 为准）。 */
  theme: AppTheme
  /** 明暗两套主题选择，分别对应 light/dark。 */
  themeSelections: AppThemeSelections
  /** 用户导入的自定义主题列表。 */
  customThemes: AppCustomTheme[]
  /** 当前激活的自定义主题名（null 表示使用预设）。 */
  activeCustomThemeName: string | null
  /** 字体预设 key。 */
  fontPreset: AppFontPreset
  /**
   * 高级主题（设计语言）。与上面的颜色主题是两个维度：颜色主题决定一套 CSS 变量取值，
   * 高级主题决定整套设计语言（颜色角色 + 形状/层级/排版/动效/状态层/组件几何）。
   * 默认 `native` = 不接管，等价于本字段不存在。
   */
  designTheme: DesignThemeConfig
  /** 当前视图模式。 */
  viewMode: ViewMode
  /** cards 视图下的卡片布局方式。 */
  cardLayout: CardLayout
  /** 全部工作区列表。 */
  workspaces: WorkspaceItem[]
  /** 当前激活的工作区 id。 */
  activeWorkspaceId: string
  /** 全部组件实例（跨工作区）。 */
  components: ComponentInstance[]
  /** 全部泳道（跨工作区）。 */
  lanes: Lane[]
  /** 当前聚焦的组件 id（cards focus 布局用）。 */
  focusedComponentId: string | null
  /** 当前全屏的组件 id。 */
  fullscreenComponentId: string | null
  /** 当前多选选中的组件 id 列表。 */
  selectedComponentIds: string[]
  /** z-index 计数器，每次 raiseComponent 递增。 */
  zCounter: number
  /** 当前打开的侧栏覆盖层类型。 */
  overlay: OverlayKind
  /** 侧栏展现模式：docked（推开）/ floating（悬浮）。 */
  overlayMode: OverlayMode
  /** docked 模式下侧栏宽度（px）。 */
  overlayWidth: number
  /** floating 模式下侧栏的位置/尺寸比例（相对窗口）。 */
  overlayFloatingMetrics: OverlayFloatingMetrics
  /** 颗粒滤镜开关。 */
  grainEnabled: boolean
  /** 暗角深度。 */
  vignetteDepth: number
  /** 颗粒强度。 */
  grainIntensity: number
  /** 操作按钮发光效果开关。 */
  actionGlow: boolean
  /** 卡片 elevation 阴影开关。 */
  cardElevation: boolean
  /** 后端是否就绪（影响 persist 启用时机）。 */
  backendReady: boolean
  /** 背景模式：grid / dot-grid / image / none。 */
  bgMode: "grid" | "dot-grid" | "image" | "none"
  /** 背景图 URL（小 URL/path；base64 数据 URL 存 SQLite kv_store）。 */
  bgImageUrl: string
  /** 背景图不透明度（0-100）。 */
  bgOpacity: number
  /** 背景图模糊半径（px）。 */
  bgBlur: number
  /** 背景图是否覆盖顶栏。 */
  bgCoverTopBar: boolean
  /** 液态玻璃效果开关。 */
  liquidGlassEnabled: boolean
  /** 液态玻璃不透明度。 */
  liquidGlassOpacity: number
  /** 液态玻璃模糊半径。 */
  liquidGlassBlur: number
  /** 液态玻璃位移强度。 */
  liquidGlassDisplacement: number
  /** 顶栏窗口控件可见性。 */
  chromeVisible: boolean
  /** 顶栏位置：left / right / island（浮岛）。 */
  chromePosition: "left" | "right" | "island"
  /** 顶栏样式：default / traffic-light（macOS 风格）。 */
  chromeStyle: "default" | "traffic-light"
  /** island 模式下的缩放比例。 */
  chromeIslandScale: number
  /** island 模式下的运动幅度。 */
  chromeIslandMotion: number
  /** island 模式下的动画延迟。 */
  chromeIslandDelay: number
  /** island 模式下空闲状态的偏移量。 */
  chromeIslandIdleOffset: number
  chromeActionOrder: ChromeActionPreferenceKey[]
  chromeHiddenActions: ChromeActionPreferenceKey[]
  /** 右上角轮盘的扇区顺序与隐藏项；id 来自 `@/actions` 注册表，空数组表示按注册表原序。 */
  wheelActionOrder: string[]
  wheelHiddenActions: string[]
  /** 轮盘半径（格子离锚点多远，px）与每格角度间距（度）。两者互相独立，都由用户调。 */
  wheelRadiusPx: number
  wheelSectorPitchDeg: number
  /** 普通节点桌面独立窗口的控制组位置；NeoView 使用自己的窗口栏配置。 */
  floatingWindowCaptionPosition: "left" | "island" | "right"
  /** 普通节点桌面独立窗口的控制组样式。 */
  floatingWindowCaptionStyle: "windows" | "capsule" | "traffic-light"
  /** 胶囊窗口控制是否在空闲时自动收起。 */
  floatingWindowCaptionAutoCollapse: boolean
  /** 字母索引可见性。 */
  alphabetIndexVisible: boolean
  /** 字母索引不透明度。 */
  alphabetIndexOpacity: number
  /** 字母索引样式：glass / solid / minimal。 */
  alphabetIndexStyle: "glass" | "solid" | "minimal"
  /** 字母索引波浪强度。 */
  alphabetIndexWaveIntensity: number
  /** 卡片单击动作。 */
  cardClickAction: CardClickAction
  /** 卡片双击动作。 */
  cardDoubleClickAction: CardClickAction
  /** Tabs 显示样式。 */
  tabDisplayStyle: TabDisplayStyle
  /** Switch 显示样式。 */
  switchDisplayStyle: SwitchDisplayStyle
  /** Scrollbar 显示样式（原生 overflow + ScrollArea 共用）。 */
  scrollbarDisplayStyle: ScrollbarDisplayStyle
  /** Slider 滑条显示样式（Magic Card 参数轨、设置密度滑条等）。 */
  sliderDisplayStyle: SliderDisplayStyle
  /** Choice 控件样式（segmented/radio 等）。 */
  choiceControlStyle: ChoiceControlStyle
  /** 字段标题样式。 */
  fieldTitleStyle: FieldTitleStyle
  /** 模块标题样式。 */
  moduleTitleStyle: ModuleTitleStyle
  /** 模块面板样式。 */
  modulePanelStyle: ModulePanelStyle
  /** 可调把手样式。 */
  resizableHandleStyle: ResizableHandleStyle
  /** 危险模式（高对比警示色）。 */
  hazardMode: boolean
  /** 启动时是否从工作区快照恢复节点实例。 */
  restoreWorkspaceComponents: boolean
  /** 项目级 lane 视图按 workspace 保存的聚焦、独占与操作栏偏好。 */
  laneWorkspacePreferences: Record<string, SwimlaneWorkspacePreferences>
}

/** 组件 patch 字段，用于 updateComponent 的部分更新。 */
export type ComponentPatch = {
  data?: Record<string, unknown>
  tags?: string[]
  state?: ComponentState
  hiddenIn?: Partial<Record<ViewMode, boolean>>
}

/** floating 侧栏的位置/尺寸比例（相对窗口宽高）。 */
export interface OverlayFloatingMetrics {
  widthRatio: number
  heightRatio: number
  xRatio: number
  yRatio: number
}

/** UI 偏好相关动作（slice 1）。 */
export interface WorkspaceUiActions {
  setTheme(theme: AppTheme): void
  setThemeSelection(scheme: AppThemeScheme, selection: AppThemeSelection): void
  hydrateUiPreferences(preferences: Partial<WorkspaceUiPreferences>): void
  setCustomThemes(themes: AppCustomTheme[]): void
  setActiveCustomThemeName(name: string | null): void
  setFontPreset(fontPreset: AppFontPreset): void
  /** 整体替换高级主题配置（设计语言）；维度开关也由这里一次写全。 */
  setDesignTheme(designTheme: DesignThemeConfig): void
  setViewMode(mode: ViewMode): void
  setCardLayout(layout: CardLayout): void
  setOverlay(overlay: OverlayKind): void
  setOverlayMode(mode: OverlayMode): void
  setOverlayWidth(width: number): void
  setOverlayFloatingMetrics(metrics: Partial<OverlayFloatingMetrics>): void
  setGrain(enabled: boolean): void
  setVignette(depth: number): void
  setGrainIntensity(intensity: number): void
  setActionGlow(enabled: boolean): void
  setCardElevation(enabled: boolean): void
  setBgMode(mode: "grid" | "dot-grid" | "image" | "none"): void
  setBgImageUrl(url: string): void
  setBgOpacity(opacity: number): void
  setBgBlur(blur: number): void
  setBgCoverTopBar(cover: boolean): void
  setLiquidGlassEnabled(enabled: boolean): void
  setLiquidGlassOpacity(opacity: number): void
  setLiquidGlassBlur(blur: number): void
  setLiquidGlassDisplacement(displacement: number): void
  setChromeVisible(visible: boolean): void
  setChromePosition(position: "left" | "right" | "island"): void
  setChromeStyle(style: "default" | "traffic-light"): void
  setChromeIslandScale(scale: number): void
  setChromeIslandMotion(motion: number): void
  setChromeIslandDelay(delay: number): void
  setChromeIslandIdleOffset(offset: number): void
  setChromeActionOrder(order: ChromeActionPreferenceKey[]): void
  setChromeHiddenActions(actions: ChromeActionPreferenceKey[]): void
  setChromeActionPreferences(order: ChromeActionPreferenceKey[], hiddenActions: ChromeActionPreferenceKey[]): void
  setWheelPreferences(order: string[], hiddenActions: string[]): void
  setWheelGeometry(radiusPx: number, sectorPitchDeg: number): void
  setFloatingWindowCaptionPosition(position: WSState["floatingWindowCaptionPosition"]): void
  setFloatingWindowCaptionStyle(style: WSState["floatingWindowCaptionStyle"]): void
  setFloatingWindowCaptionAutoCollapse(autoCollapse: boolean): void
  setAlphabetIndexVisible(visible: boolean): void
  setAlphabetIndexOpacity(opacity: number): void
  setAlphabetIndexStyle(style: WSState["alphabetIndexStyle"]): void
  setAlphabetIndexWaveIntensity(intensity: number): void
  setCardClickAction(action: CardClickAction): void
  setCardDoubleClickAction(action: CardClickAction): void
  setTabDisplayStyle(style: TabDisplayStyle): void
  setSwitchDisplayStyle(style: SwitchDisplayStyle): void
  setScrollbarDisplayStyle(style: ScrollbarDisplayStyle): void
  setSliderDisplayStyle(style: SliderDisplayStyle): void
  setChoiceControlStyle(style: ChoiceControlStyle): void
  setFieldTitleStyle(style: FieldTitleStyle): void
  setModuleTitleStyle(style: ModuleTitleStyle): void
  setModulePanelStyle(style: ModulePanelStyle): void
  setResizableHandleStyle(style: ResizableHandleStyle): void
  setHazardMode(enabled: boolean): void
  setRestoreWorkspaceComponents(enabled: boolean): void
  patchLaneWorkspacePreferences(workspaceId: string, patch: Partial<SwimlaneWorkspacePreferences>): void
}

/** 工作区增删改动作（slice 2）。 */
export interface WorkspaceListActions {
  setActiveWorkspace(id: string): void
  addWorkspace(): void
  removeWorkspace(id: string): void
  renameWorkspace(id: string, label: string): void
  setWorkspaceIcon(id: string, icon: string | undefined): void
  setWorkspaceFlowCanvas(id: string, flowCanvas: FlowCanvasSnapshot | undefined): void
  setWorkspaceFlowCamera(id: string, flowCamera: FlowCanvasCamera | undefined): void
}

/** 组件实例增删改 + 多选 + 批量动作（slice 3）。 */
export interface WorkspaceComponentActions {
  deployComponent(moduleId: string, viewModeOrOptions?: ViewMode | DeployComponentOptions): void
  ensureComponent(component: ComponentInstance): void
  removeComponent(id: string): void
  removeComponentsByModule(moduleId: string): void
  setComponentState(id: string, state: ComponentState): void
  setComponentPosition(id: string, x: number, y: number): void
  moveComponent(id: string, x: number, y: number): void
  setComponentFlowPos(id: string, x: number, y: number): void
  setComponentFlowSize(id: string, width: number, height: number): void
  setComponentBentoLayout(id: string, layout: { x: number; y: number; w: number; h: number }): void
  setComponentLaneSize(id: string, size: { height: number }): void
  setComponentData(id: string, data: Record<string, unknown>): void
  patchComponentData(id: string, patch: Record<string, unknown>): void
  updateComponent(id: string, patch: ComponentPatch): void
  setComponentDockPanel(id: string, panelId: string): void
  setComponentVisibility(id: string, viewMode: ViewMode, visible: boolean): void
  toggleComponentVisibility(id: string, viewMode: ViewMode): void
  setComponentTags(id: string, tags: string[]): void
  focusComponent(id: string | null): void
  setFullscreen(id: string | null): void
  raiseComponent(id: string): void
  toggleCollapse(id: string): void
  duplicateComponent(id: string): void
  setSelection(ids: string[]): void
  toggleSelection(id: string): void
  addToSelection(ids: string[]): void
  clearSelection(): void
  removeComponents(ids: string[]): void
  duplicateComponents(ids: string[]): void
  toggleCollapseComponents(ids: string[]): void
  setComponentsVisibility(ids: string[], viewMode: ViewMode, visible: boolean): void
}

/** 泳道增删改 + 跨泳道移动动作（slice 4）。 */
export interface WorkspaceLaneActions {
  addLane(workspaceId?: string, label?: string): void
  removeLane(id: string): void
  renameLane(id: string, label: string): void
  setLaneWidthRatio(id: string, ratio: number): void
  toggleLaneCollapse(id: string): void
  toggleLaneVisibility(id: string): void
  reorderLane(fromId: string, toId: string): void
  setLaneCardOrder(id: string, cardOrder: string[]): void
  setLaneBoardLayout(workspaceId: string | undefined, laneOrder: string[], cardOrderByLane: Record<string, string[]>): void
  moveComponentToLane(componentId: string, toLaneId: string, targetCardId?: string | null, insertAfter?: boolean): void
}

/** 后端同步动作（slice 5）：标记就绪 + 从 DTO hydrate 整个 Store。 */
export interface WorkspaceBackendActions {
  setBackendReady(ready: boolean): void
  hydrate(workspaces: WorkspaceDTO[], lanes: LaneDTO[], components: ComponentDTO[]): void
}

/** 全部动作 = UI + List + Component + Lane + Backend。 */
export type WorkspaceActions =
  & WorkspaceUiActions
  & WorkspaceListActions
  & WorkspaceComponentActions
  & WorkspaceLaneActions
  & WorkspaceBackendActions

/** 完整 Store = 状态 + 全部动作。 */
export type WSStore = WSState & WorkspaceActions

/**
 * 持久化到 localStorage 的 UI 偏好子集。
 *
 * 注意：业务数据（workspaces/lanes/components）不在此列，由后端 SQLite
 * 通过 WorkspaceProvider 的 useMutation 持久化，避免本地与远端不一致。
 */
export type WorkspaceUiPreferences = Pick<
  WSState,
  | "theme"
  | "themeSelections"
  | "customThemes"
  | "activeCustomThemeName"
  | "fontPreset"
  | "designTheme"
  | "cardLayout"
  | "overlayMode"
  | "overlayWidth"
  | "overlayFloatingMetrics"
  | "grainEnabled"
  | "vignetteDepth"
  | "grainIntensity"
  | "actionGlow"
  | "cardElevation"
  | "bgMode"
  | "bgImageUrl"
  | "bgOpacity"
  | "bgBlur"
  | "bgCoverTopBar"
  | "liquidGlassEnabled"
  | "liquidGlassOpacity"
  | "liquidGlassBlur"
  | "liquidGlassDisplacement"
  | "chromeVisible"
  | "chromePosition"
  | "chromeStyle"
  | "chromeIslandScale"
  | "chromeIslandMotion"
  | "chromeIslandDelay"
  | "chromeIslandIdleOffset"
  | "chromeActionOrder"
  | "chromeHiddenActions"
  | "wheelActionOrder"
  | "wheelHiddenActions"
  | "wheelRadiusPx"
  | "wheelSectorPitchDeg"
  | "floatingWindowCaptionPosition"
  | "floatingWindowCaptionStyle"
  | "floatingWindowCaptionAutoCollapse"
  | "alphabetIndexVisible"
  | "alphabetIndexOpacity"
  | "alphabetIndexStyle"
  | "alphabetIndexWaveIntensity"
  | "cardClickAction"
  | "cardDoubleClickAction"
  | "tabDisplayStyle"
  | "switchDisplayStyle"
  | "scrollbarDisplayStyle"
  | "sliderDisplayStyle"
  | "choiceControlStyle"
  | "fieldTitleStyle"
  | "moduleTitleStyle"
  | "modulePanelStyle"
  | "resizableHandleStyle"
  | "hazardMode"
  | "restoreWorkspaceComponents"
  | "laneWorkspacePreferences"
>

/** Zustand 的 set 函数签名（带 action label 用于 devtools）。 */
export type SetWorkspaceStore = (
  partial: Partial<WSStore> | ((state: WSStore) => Partial<WSStore>),
  replace?: false,
  action?: string,
) => void

/**
 * Slice 内部使用的更新函数：自动带上 action label。
 *
 * 与 SetWorkspaceStore 的区别：强制要求 action 字符串，便于 Redux DevTools 调试。
 */
export type WorkspaceStoreUpdater = (action: string, updater: (state: WSStore) => Partial<WSStore>) => void
