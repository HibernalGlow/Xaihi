/**
 * 工作区 Store 的常量与初始状态。
 *
 * - VIEW_MODES / COMPONENT_VIEW_MODES 列出全部视图模式；
 *   dashboard 不承载组件实例，仅作为概览页，故 ComponentViewMode 排除它。
 * - INITIAL_STATE 是首次启动（无 localStorage、无后端快照）时的默认值，
 *   会被 persist 中间件与 hydrate() 覆盖。
 */
import type { ViewMode } from "@/types/workspace"
import type { WSState } from "./types"
import { NODE_ACTION_IDS } from "@/actions/nodeActionIds"
import { WHEEL_PITCH_DEFAULT_DEG, WHEEL_RADIUS_DEFAULT_PX } from "@/actions/wheelPreferences"
import { DEFAULT_DESIGN_THEME } from "@/lib/design-theme/contract"
import { MIGRATED_CUSTOM_THEMES } from "./migratedCustomThemes"

/** 组件可参与的视图模式（排除 dashboard，因为 dashboard 不承载组件实例）。 */
export type ComponentViewMode = Exclude<ViewMode, "dashboard">

export const VIEW_MODES: ViewMode[] = ["dashboard", "cards", "dockview", "flow", "lane", "bento"]
export const COMPONENT_VIEW_MODES: ComponentViewMode[] = ["cards", "dockview", "flow", "lane", "bento"]

/** Store 首次启动默认状态。 */
export const INITIAL_STATE: WSState = {
  theme: "wuling",
  // 明暗方案与激活主题对齐迁移配置 [app.ui.workspace].themeSelections / activeCustomThemeName：
  // 浅色 = symphonic-night，深色 = amethyst-haze（主题数据见 ./migratedCustomThemes）。
  themeSelections: {
    light: { kind: "custom", name: "symphonic-night" },
    dark: { kind: "custom", name: "amethyst-haze" },
  },
  customThemes: MIGRATED_CUSTOM_THEMES,
  activeCustomThemeName: "amethyst-haze",
  fontPreset: "aestivus",
  designTheme: DEFAULT_DESIGN_THEME,
  // 卡片布局 / 浮窗 / 背景颗粒等默认值对齐使用者从 Xiranite 迁移的配置
  // （2026-10-05 副本 [app.ui.workspace]；主题数据内联于 ./migratedCustomThemes.ts）。
  viewMode: "cards",
  cardLayout: "focus",
  // ADR-0019：多工作空间退役，工作空间塌缩成单例——恒为 ws-alpha 一条，
  // hydrate 时存量多空间快照也塌缩为第一条（级联丢弃其余）。
  workspaces: [
    { id: "ws-alpha", label: "topbar:workspace.defaults.alpha" },
  ],
  activeWorkspaceId: "ws-alpha",
  components: [],
  lanes: [],
  focusedComponentId: null,
  fullscreenComponentId: null,
  selectedComponentIds: [],
  zCounter: 1,
  overlay: null,
  overlayMode: "floating",
  overlayWidth: 530,
  overlayFloatingMetrics: {
    widthRatio: 0.9719551282051282,
    heightRatio: 1,
    xRatio: 0.2857142857142857,
    yRatio: 0,
  },
  grainEnabled: false,
  vignetteDepth: 0,
  grainIntensity: 0,
  actionGlow: false,
  cardElevation: false,
  backendReady: false,
  bgMode: "image",
  bgImageUrl: "",
  bgOpacity: 100,
  bgBlur: 0,
  bgCoverTopBar: false,
  liquidGlassEnabled: true,
  liquidGlassOpacity: 13,
  liquidGlassBlur: 0,
  liquidGlassDisplacement: 64,
  chromeVisible: true,
  chromePosition: "island",
  chromeStyle: "default",
  chromeIslandScale: 81,
  chromeIslandMotion: 120,
  chromeIslandDelay: 55,
  chromeIslandIdleOffset: -10,
  chromeActionOrder: ["collapse", "focus", "fullscreen", "moveToView", "hide", "float", "keepAliveOnViewSwitch", "node-help"],
  chromeHiddenActions: ["node-help"],
  wheelActionOrder: [],
  // 节点派生动作默认全部隐藏：模块表有 30 来项，露出来会把内建动作从 8 格里挤掉。
  // 用户在设置的「轮盘扇区」里把想要的节点拖进可见列即可。
  wheelHiddenActions: [...NODE_ACTION_IDS],
  wheelRadiusPx: WHEEL_RADIUS_DEFAULT_PX,
  wheelSectorPitchDeg: WHEEL_PITCH_DEFAULT_DEG,
  floatingWindowCaptionPosition: "right",
  floatingWindowCaptionStyle: "capsule",
  floatingWindowCaptionAutoCollapse: false,
  alphabetIndexVisible: true,
  alphabetIndexOpacity: 93,
  alphabetIndexStyle: "solid",
  alphabetIndexWaveIntensity: 69,
  cardClickAction: "focus",
  cardDoubleClickAction: "fullscreen",
  tabDisplayStyle: "pill",
  switchDisplayStyle: "outlined",
  scrollbarDisplayStyle: "minimal",
  sliderDisplayStyle: "minimal",
  choiceControlStyle: "tabs",
  fieldTitleStyle: "legend",
  moduleTitleStyle: "legend",
  modulePanelStyle: "soft",
  resizableHandleStyle: "grip",
  hazardMode: false,
  restoreWorkspaceComponents: false,
  laneWorkspacePreferences: {},
}
