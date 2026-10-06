/**
 * 工作区核心类型定义。
 *
 * 涵盖视图模式、主题、字体、工作区/泳道/组件实例的持久化结构，
 * 以及部署组件时的可选参数和计算后的布局结果。
 * 这些类型同时被 store、components、hooks 多层引用，是前端架构的"事实契约"。
 */

/** 工作区视图模式：dashboard（仪表盘）/ cards（卡片堆叠）/ dockview（标签页）/ flow（自由画布）/ lane（泳道）/ bento（栅格）。 */
export type ViewMode = "dashboard" | "cards" | "dockview" | "flow" | "lane" | "bento"

/** 卡片在 cards 视图下的布局方式：grid（网格）/ stack（堆叠）/ split（分屏）/ focus（聚焦）。 */
export type CardLayout = "grid" | "stack" | "split" | "focus"

/** 卡片点击/双击触发的动作。 */
export type CardClickAction = "none" | "focus" | "fullscreen"

/** 侧栏覆盖层类型：registry（模块注册表）/ settings（设置）/ operations（操作历史）/ history（运行历史）。 */
export type OverlayKind = "registry" | "settings" | "operations" | "history" | "deletions" | null

/** 侧栏面板的展现模式：docked 为推开式固定侧栏，floating 为悬浮遮罩。 */
export type OverlayMode = "docked" | "floating"

/** React Flow 画布快照（tldraw/React Flow 序列化结构），具体形状由画布运行时维护。 */
export type FlowCanvasSnapshot = Record<string, unknown>

/** React Flow 画布相机（视口位移与缩放）。 */
export interface FlowCanvasCamera {
  x: number
  y: number
  z: number
}

/** 组件实例在视图中的展示状态。 */
export type ComponentState = "docked" | "floating" | "focused" | "fullscreen" | "compact"
export type ComponentPlacement = "workspace" | "window"

/** 内置主题预设 key（与 styles/themes/*.css 一一对应）。 */
/**
 * 内置主题预设。
 *
 * 2026-10-05 用户裁定：其余 16 套（spatial / endfield / onlook / tori / conductor / hilden /
 * aperture / noomo / excalidraw / astro / svelte / bun / storybook / supabase / penpot / vite）
 * 本来就是「想做成高级主题那个样子」的尝试，高级主题（设计语言）落地后它们整批出局，
 * 只留武陵（wuling）——它接下来要升格成一份高级主题配方，而不是继续当颜色预设。
 * 配色这件事由「配色主题 / 取色」那条平级路径负责，见 docs/advanced-design-theme-md3.md §10。
 */
export type AppTheme = "wuling"

/** 主题明暗方案。 */
export type AppThemeScheme = "light" | "dark"

/** 主题选择：preset（内置预设）或 custom（用户导入的自定义主题）。 */
export type AppThemeSelection =
  | { kind: "preset"; name: AppTheme }
  | { kind: "custom"; name: string }

/** 明暗两套主题选择，分别对应 light/dark 方案。 */
export type AppThemeSelections = Record<AppThemeScheme, AppThemeSelection>

/** 字体预设 key（与 src/lib/appearance-fonts.ts 的 FONT_PRESETS 对应）。 */
export type AppFontPreset = "xiranite" | "system" | "aestivus" | "industrial" | "display" | "editorial" | "poster" | "terminal" | "machina" | "sketch" | "workshop" | "canvas" | "serif" | "mono"

/** 用户导入的自定义主题。cssVars 同时支持 theme（共享变量）、light/dark（明暗方案）。 */
export interface AppCustomTheme {
  name: string
  description?: string
  cssVars: {
    theme?: Record<string, string>
    light: Record<string, string>
    dark?: Record<string, string>
  }
}

/** 工作区（顶层容器）持久化结构。 */
export interface WorkspaceItem {
  id: string
  label: string
  icon?: string
  flowCanvas?: FlowCanvasSnapshot
  flowCamera?: FlowCanvasCamera
  createdAt?: number
  updatedAt?: number
}

/** 泳道（lane 视图下的一列）持久化结构。 */
export interface Lane {
  id: string
  label: string
  workspaceId: string
  createdAt?: number
  updatedAt?: number
  /** Flex-grow width ratio. */
  widthRatio: number
  /** When collapsed, only the lane header is shown. */
  collapsed: boolean
  /** Lane-view specific visibility. */
  hidden?: boolean
  /** Card ordering inside this lane. */
  cardOrder?: string[]
}

/** 组件实例（一个 node 在工作区中的具体投放）持久化结构。 */
export interface ComponentInstance {
  id: string
  moduleId: string
  state: ComponentState
  /** Durable rendering owner. Runtime focus/fullscreen state is not persisted. */
  placement?: ComponentPlacement
  /** Last normal native-window size for this workspace component. */
  windowSize?: { width: number; height: number }
  createdAt?: number
  updatedAt?: number
  /** Legacy free-layout position retained for persisted data compatibility. */
  position?: { x: number; y: number }
  /** Legacy free-layout size retained for persisted data compatibility. */
  size?: { w: number; h: number }
  /** Stacking order. */
  z?: number
  /** When true the panel only renders its header. */
  collapsed?: boolean
  workspaceId: string
  /** Persisted module data shared by all view modes. */
  data?: Record<string, unknown>
  /** React Flow node position. */
  flowPosition?: { x: number; y: number }
  /** React Flow node size, produced by NodeResizer. */
  flowSize?: { width: number; height: number }
  /** GridStack-backed Bento layout in 12-column grid units. */
  bentoLayout?: { x: number; y: number; w: number; h: number }
  /** Lane-view card dimensions. */
  laneSize?: { height: number }
  /** Dockview tab area. */
  dockPanel?: string
  /** Owning lane id. */
  laneId?: string
  /**
   * Per-view visibility flags. Closing a tab in dock mode, for example, sets
   * hiddenIn.dockview without deleting the component from other view modes.
   */
  hiddenIn?: Partial<Record<ViewMode, boolean>>
  /** User-defined tags maintained by database-like modules. */
  tags?: string[]
}

/** 部署（添加）组件时可选的初始位置/视图/标签参数。 */
export interface DeployComponentOptions {
  viewMode?: ViewMode
  laneId?: string
  flowPosition?: { x: number; y: number }
  bentoLayout?: { x: number; y: number; w: number; h: number }
  position?: { x: number; y: number }
  dockPanel?: string
  tags?: string[]
}

/** 模块定义（来自 registry，描述一个可投放的 node）。 */
export interface ModuleDef {
  id: string
  name: string
  version: string
  category: string
  description: string
  icon: string
}

/** 视图布局计算结果（由布局引擎为每个组件实时计算）。 */
export interface ComputedLayout {
  x: number
  y: number
  w: number
  h: number
  scale: number
  opacity: number
  z: number
  state: ComponentState
  interactive: boolean
}
