import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  Check,
  Cpu,
  Eye,
  LayoutGrid,
  Layers,
  Moon,
  Monitor,
  Palette,
  Pin,
  RefreshCcw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  Wand2,
  X,
   type LucideIcon,
} from "lucide-react"

import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTheme } from "@/components/use-theme"
import { useHostConnection } from "@/hooks/useHostConnection"
import { getActiveCustomTheme, resolveThemeScheme, THEME_PRESET_OPTIONS, type ThemeMode } from "@/lib/appearance"
import { FONT_PRESETS } from "@/lib/appearance-fonts"
import {
  DESIGN_APPLIED_ATTR,
  DESIGN_CONTRAST_ATTR,
  DESIGN_ROOT_ATTR,
  DESIGN_SEED_ATTR,
  DESIGN_SEED_SOURCE_ATTR,
  DESIGN_VARIANT_ATTR,
  MD3_CONTRAST_LEVELS,
  MD3_SCHEME_VARIANTS,
  MD3_SHAPE_SCALE_STEPS,
  type Md3ContrastLevel,
  type Md3SchemeVariant,
  type Md3SeedSource,
} from "@/lib/design-theme/contract"
import { DESIGN_THEME_ENTRIES } from "@/lib/design-theme/registry"
import { changeLanguage, getCurrentLanguage, type Language } from "@/i18n"
import { cn } from "@/lib/utils"
import {
  Md3eConnectedGroup,
  Md3eShapePreviewGlyph,
  Md3eShapeStatusReadback,
  Md3eWavyProgress,
  useMd3eShapeContext,
} from "@/nodes/shared/Md3eShapeContext"
import {
  MD3E_BUTTON_ROLES,
  MD3E_EXPRESSIVE_SHAPES,
  type Md3eButtonRole,
  type Md3eExpressiveShapeId,
} from "@/nodes/shared/md3eShapeSystem"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { AppFontPreset, CardClickAction, UiFace } from "@/types/workspace"
import { DesktopTraySettings } from "./DesktopTraySettings"
import { NodeMemoryProtectionSettings } from "./NodeMemoryProtectionSettings"
import type { SettingsNavVariant } from "./SettingsStageNav"
import type { SettingsSectionId, SettingsStepId } from "./types"

export type Md3ePurposeCategoryId =
  | "style-and-color"
  | "controls-and-shapes"
  | "layout-and-workspace"
  | "host-and-storage"

export interface Md3ePurposeCategoryDef {
  id: Md3ePurposeCategoryId
  title: string
  intentQuestion: string
  description: string
  scopeSummary: string
  icon: LucideIcon
  legacySectionId: SettingsSectionId
  keywords: readonly string[]
}

export const MD3E_PURPOSE_CATEGORIES: readonly Md3ePurposeCategoryDef[] = [
  {
    id: "style-and-color",
    title: "视觉风格与动态取色",
    intentQuestion: "我想让工作台长什么样、用什么配色？",
    description: "切换界面形态（Legacy / MD3E）、M3E 四维主题（9 种动态取色风格、4 档对比度、明暗方案、字体排版与背景氛围）。",
    scopeSummary: "全局工作台 · Token 级解耦",
    icon: Palette,
    legacySectionId: "appearance",
    keywords: [
      "界面形态", "ui face", "md3e", "legacy", "颜色", "配色", "取色", "seed", "variant", "expressive",
      "tonalSpot", "vibrant", "neutral", "fidelity", "content", "monochrome", "rainbow", "fruitSalad",
      "对比度", "contrast", "浅色", "深色", "light", "dark", "字体", "font", "语言", "language", "背景", "颗粒",
    ],
  },
  {
    id: "controls-and-shapes",
    title: "控件形态与交互手感",
    intentQuestion: "我想让按钮、开关与滑杆怎么变形和回弹？",
    description: "配置图标按钮表达性几何形状（启动随机 / 固定组合 / 同类一致）、文字胶囊形态、组件皮肤适配与标准 M3E 锁定。",
    scopeSummary: "单节点独立 (nodeUi) + 全局皮肤",
    icon: Wand2,
    legacySectionId: "view",
    keywords: [
      "控件形状", "随机图形", "shape", "按钮", "button", "icon", "花瓣", "曲奇", "cookie", "clover",
      "squircle", "固定", "启动随机", "同类一致", "皮肤", "forceCanonical", "tabs", "switch", "slider",
      "scrollbar", "choice", "弹簧", "回弹", "退化",
    ],
  },
  {
    id: "layout-and-workspace",
    title: "工作台布局与操控",
    intentQuestion: "我想怎么排布节点卡片、顶栏与安全护栏？",
    description: "管理启动恢复、视图循环切换、卡片单双击行为、节点浮动操作栏（灵动岛/红绿灯）、字母索引条与 Hazard 反悔时长。",
    scopeSummary: "全局工作台 · xaihi-core.appUi.ui",
    icon: Layers,
    legacySectionId: "workspace",
    keywords: [
      "布局", "视图", "操作栏", "chrome", "灵动岛", "island", "红绿灯", "字母索引", "alphabet",
      "卡片", "点击", "双击", "focus", "fullscreen", "侧栏", "overlay", "hazard", "反悔", "undo", "开机恢复",
    ],
  },
  {
    id: "host-and-storage",
    title: "宿主连接与存储诊断",
    intentQuestion: "我的设置保存在哪、宿主桥与内存保护状态如何？",
    description: "实时检视 DSH 设置面（xaihi-core）同步状态、DOM 主题变量回读、节点内存保护策略与桌面托盘。",
    scopeSummary: "DSH 宿主标准面 · ADR-0013",
    icon: Cpu,
    legacySectionId: "runtime",
    keywords: [
      "宿主", "连接", "bridge", "dsh", "存储", "storage", "xaihi-core", "appUi", "nodeUi",
      "内存保护", "memory", "托盘", "tray", "诊断", "token", "变量",
    ],
  },
] as const

export function mapLegacySectionToPurpose(section: SettingsSectionId | null | undefined): Md3ePurposeCategoryId {
  switch (section) {
    case "appearance":
      return "style-and-color"
    case "view":
      return "controls-and-shapes"
    case "workspace":
      return "layout-and-workspace"
    case "runtime":
    case "data":
      return "host-and-storage"
    default:
      return "style-and-color"
  }
}

export function mapStepToPurpose(step: SettingsStepId | null | undefined): Md3ePurposeCategoryId | null {
  if (!step) return null
  switch (step) {
    case "theme":
    case "design-language":
    case "color":
    case "typography":
    case "atmosphere":
    case "theme-import":
    case "background":
      return "style-and-color"
    case "components":
      return "controls-and-shapes"
    case "startup-restore":
    case "chrome":
    case "floating-window-caption":
    case "alphabet":
    case "swimlane":
    case "card-interaction":
      return "layout-and-workspace"
    case "connection":
    case "memory-protection":
    case "desktop-tray":
    case "webview2":
    case "storage":
      return "host-and-storage"
    default:
      return null
  }
}

const VARIANT_LABELS: Record<Md3SchemeVariant, { title: string; desc: string }> = {
  expressive: { title: "Expressive（表现力·默认）", desc: "高色度跳跃对比，突出 M3E 活力角色" },
  tonalSpot: { title: "Tonal Spot（温和色斑）", desc: "经典 Material You 平衡色阶" },
  vibrant: { title: "Vibrant（鲜明高饱和）", desc: "强调主色与次级容器的鲜亮层次" },
  neutral: { title: "Neutral（克制中性）", desc: "低饱和度专业工具面板质感" },
  fidelity: { title: "Fidelity（忠实源色）", desc: "精确保留取色种子的原始色相与明度" },
  content: { title: "Content（内容衍生）", desc: "贴合源色冷暖关系的内容级色阶" },
  monochrome: { title: "Monochrome（纯单色）", desc: "零色相纯明暗灰阶层级" },
  rainbow: { title: "Rainbow（多色相彩虹）", desc: "色相环宽跨度对比组合" },
  fruitSalad: { title: "Fruit Salad（撞色果盘）", desc: "活泼双色相碰撞组合" },
}

const CONTRAST_LABELS: Record<Md3ContrastLevel, string> = {
  [-1]: "柔和 (-1.0)",
  [0]: "标准 (0.0)",
  [0.5]: "中高 (+0.5)",
  [1]: "高对比 (+1.0)",
}

const ROLE_LABELS: Record<Md3eButtonRole, string> = {
  primary: "主要动作 (Primary)",
  secondary: "次要动作 (Secondary)",
  outline: "描边按钮 (Outline)",
  ghost: "幽灵按钮 (Ghost)",
  danger: "危险动作 (Danger)",
  toolbar: "节点工具栏 (Toolbar)",
}

interface SettingsChromeConfig {
  navVariant: SettingsNavVariant
  expandAll: boolean
  showSearch: boolean
  showSubtitle: boolean
  showStageMeta: boolean
  contentOnly: boolean
}

export function Md3eSettingsView({
  surface,
  chrome,
  initialSection,
  initialStep,
  onSyncLegacyRoute,
}: {
  surface: NodeSurface
  chrome: SettingsChromeConfig
  initialSection?: SettingsSectionId | null
  initialStep?: SettingsStepId | null
  onSyncLegacyRoute?: (section: SettingsSectionId, step: SettingsStepId | null) => void
}) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activePurpose, setActivePurpose] = useState<Md3ePurposeCategoryId>(() =>
    mapStepToPurpose(initialStep) ?? mapLegacySectionToPurpose(initialSection),
  )
  const [previewToggleChecked, setPreviewToggleChecked] = useState(true)
  const [previewSliderVal, setPreviewSliderVal] = useState(68)
  const [previewTab, setPreviewTab] = useState("expressive")

  useEffect(() => {
    const mapped = mapStepToPurpose(initialStep) ?? (initialSection ? mapLegacySectionToPurpose(initialSection) : null)
    if (mapped) setActivePurpose(mapped)
  }, [initialSection, initialStep])

  const state = useWorkspaceShallowSelector((s) => ({
    uiFace: (s as { uiFace?: UiFace }).uiFace ?? "md3e",
    theme: s.theme,
    themeSelections: s.themeSelections,
    customThemes: s.customThemes,
    fontPreset: s.fontPreset,
    designTheme: s.designTheme,
    uiPreferenceSave: s.uiPreferenceSave ?? { state: "local" as const },
    viewSwitchLoop: s.viewSwitchLoop ?? false,
    trellisMapPosition: s.trellisMapPosition ?? "toolbar",
    restoreWorkspaceComponents: s.restoreWorkspaceComponents ?? false,
    overlayMode: s.overlayMode ?? "floating",
    bgMode: s.bgMode,
    bgOpacity: s.bgOpacity,
    bgBlur: s.bgBlur,
    grainEnabled: s.grainEnabled,
    actionGlow: s.actionGlow,
    cardElevation: s.cardElevation,
    chromeVisible: s.chromeVisible,
    chromePosition: s.chromePosition,
    chromeStyle: s.chromeStyle,
    alphabetIndexVisible: s.alphabetIndexVisible,
    alphabetIndexStyle: s.alphabetIndexStyle,
    alphabetIndexHideEmpty: s.alphabetIndexHideEmpty ?? false,
    alphabetIndexDirectDeploySingle: s.alphabetIndexDirectDeploySingle ?? true,
    cardClickAction: s.cardClickAction,
    cardDoubleClickAction: s.cardDoubleClickAction,
    tabDisplayStyle: s.tabDisplayStyle,
    switchDisplayStyle: s.switchDisplayStyle,
    scrollbarDisplayStyle: s.scrollbarDisplayStyle,
    sliderDisplayStyle: s.sliderDisplayStyle,
    choiceControlStyle: s.choiceControlStyle,
    fieldTitleStyle: s.fieldTitleStyle,
    hazardMode: s.hazardMode ?? false,
    executeUndoWindowMs: s.executeUndoWindowMs ?? 1000,
    viewMode: s.viewMode ?? "cards",
    overlay: s.overlay ?? null,
  }))
  const actions = useWorkspaceActions()
  const { theme: colorMode, resolvedTheme, setTheme: setColorMode } = useTheme()
  const activeScheme = resolveThemeScheme(
    ((colorMode ?? "system") as ThemeMode),
    resolvedTheme === "dark",
  )
  const host = useHostConnection()
  const runtimeInfo = getRuntimeConnectionInfo()
  const shapeCtx = useMd3eShapeContext()
  const currentLang = getCurrentLanguage()

  // 宽屏 ≥ 600px 且处于 rail 分档时启用 35/65 主从双栏（参考 Rhythm SettingsScreen.kt:981-1081）
  const isWideMasterDetail =
    chrome.navVariant === "rail" && (surface.width === 0 || surface.width >= 600)
  const isCompact320 = surface.width > 0 && surface.width <= 360

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return MD3E_PURPOSE_CATEGORIES
    return MD3E_PURPOSE_CATEGORIES.filter(
      (cat) =>
        cat.title.toLowerCase().includes(q) ||
        cat.intentQuestion.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q) ||
        cat.keywords.some((kw) => kw.toLowerCase().includes(q)),
    )
  }, [searchQuery])

  const activeCategoryDef =
    MD3E_PURPOSE_CATEGORIES.find((item) => item.id === activePurpose) ?? MD3E_PURPOSE_CATEGORIES[0]!

  function selectPurpose(next: Md3ePurposeCategoryId) {
    setActivePurpose(next)
    setScrolled(false)
    scrollRef.current?.scrollTo({ top: 0 })
    const def = MD3E_PURPOSE_CATEGORIES.find((item) => item.id === next)
    if (def && onSyncLegacyRoute) {
      onSyncLegacyRoute(def.legacySectionId, null)
    }
  }

  function patchMd3(patch: Partial<typeof state.designTheme.md3>) {
    actions.setDesignTheme({
      ...state.designTheme,
      md3: {
        ...state.designTheme.md3,
        ...patch,
      },
    })
  }

  const domReadback = useMemo(() => {
    if (typeof document === "undefined") {
      return {
        uiFace: state.uiFace,
        design: state.designTheme.id,
        variant: state.designTheme.md3.variant,
        seed: state.designTheme.md3.seed,
        source: state.designTheme.md3.seedSource,
        contrast: String(state.designTheme.md3.contrastLevel),
        appliedVars: "0",
      }
    }
    const root = document.documentElement
    return {
      uiFace: root.getAttribute("data-ui-face") ?? state.uiFace,
      design: root.getAttribute(DESIGN_ROOT_ATTR) ?? state.designTheme.id,
      variant: root.getAttribute(DESIGN_VARIANT_ATTR) ?? state.designTheme.md3.variant,
      seed: root.getAttribute(DESIGN_SEED_ATTR) ?? state.designTheme.md3.seed,
      source: root.getAttribute(DESIGN_SEED_SOURCE_ATTR) ?? state.designTheme.md3.seedSource,
      contrast: root.getAttribute(DESIGN_CONTRAST_ATTR) ?? String(state.designTheme.md3.contrastLevel),
      appliedVars: root.getAttribute(DESIGN_APPLIED_ATTR) ?? "0",
    }
  }, [state.designTheme, state.uiFace])

  const currentSelection = state.themeSelections[activeScheme]
  const activeCustom =
    currentSelection?.kind === "custom"
      ? getActiveCustomTheme(state.customThemes, currentSelection.name)
      : null

  return (
    <div
      ref={surface.ref}
      data-settings-surface
      data-settings-face="md3e"
      data-settings-mode={surface.mode}
      data-settings-density={surface.density}
      data-settings-scrolled={scrolled ? "true" : "false"}
      data-settings-layout={isWideMasterDetail ? "master-detail-35-65" : "single-column"}
      className="@container/settings flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--md-sys-color-surface,var(--background))] text-foreground"
    >
      {/* ── 顶部可折叠 Expressive Header（解决痛点 1 查找与痛点 4 生效范围总览） ── */}
      {!chrome.contentOnly ? (
        <header
          data-settings-header
          className={cn(
            "shrink-0 border-b border-border/50 bg-[var(--md-sys-color-surface-container-low,var(--card))] transition-all duration-200 ease-[var(--md3-spring-spatial,cubic-bezier(0.2,0,0,1))]",
            scrolled ? "px-3 py-2" : isCompact320 ? "px-2.5 py-2" : "px-4 py-3.5",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary-container,var(--primary))] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--md-sys-color-on-primary-container,var(--primary-foreground))]">
                  <Sparkles className="size-3 shrink-0" />
                  <span>MD3E 设置工作台</span>
                </span>
                <span
                  data-settings-save-badge={state.uiPreferenceSave.state}
                  className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {state.uiPreferenceSave.state === "saved"
                    ? "已同步 DSH Settings"
                    : state.uiPreferenceSave.state === "pending"
                      ? "正在同步 DSH..."
                      : state.uiPreferenceSave.state === "error"
                        ? "DSH 写冲突/待重试"
                        : "DSH 桥就绪/本地缓存"}
                </span>
              </div>
              <h1
                data-settings-title
                className={cn(
                  "mt-1 truncate font-semibold tracking-tight text-foreground transition-all",
                  scrolled || isCompact320 ? "text-sm" : "text-lg",
                )}
              >
                {t("settings:title", "设置")} · {activeCategoryDef.title}
              </h1>
              {chrome.showSubtitle && !scrolled ? (
                <p data-settings-subtitle className="mt-0.5 truncate text-xs text-muted-foreground">
                  {activeCategoryDef.intentQuestion}
                </p>
              ) : null}
            </div>

            {/* ── 界面形态一键切换胶囊 + 投放卡片 ── */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="切换工作台界面形态"
                data-settings-ui-face-switcher
                className="flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-surface-container-highest,var(--muted))] p-0.5"
              >
                <button
                  type="button"
                  data-ui-face-option="legacy"
                  aria-pressed={state.uiFace === "legacy"}
                  onClick={() => actions.setUiFace?.("legacy")}
                  className={cn(
                    "rounded-l-full rounded-r-[6px] px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.96]",
                    state.uiFace === "legacy"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  经典 Legacy
                </button>
                <button
                  type="button"
                  data-ui-face-option="md3e"
                  aria-pressed={state.uiFace === "md3e"}
                  onClick={() => actions.setUiFace?.("md3e")}
                  className={cn(
                    "rounded-l-[6px] rounded-r-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.96]",
                    state.uiFace === "md3e"
                      ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))] shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  MD3E 形态
                </button>
              </div>

              {!isCompact320 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    actions.deployComponent("settings", state.viewMode)
                    if (state.overlay === "settings") actions.setOverlay(null)
                  }}
                  title={t("registry:deployToLayout")}
                >
                  <LayoutGrid className="size-3.5" />
                  <span>{t("registry:deployToLayout")}</span>
                </Button>
              ) : null}
            </div>
          </div>

          {/* ── 搜索过滤条与窄屏导航降级（chips / select） ── */}
          <div className="mt-2.5 flex min-w-0 flex-col gap-2">
            {chrome.showSearch ? (
              <div className="relative min-w-0 max-w-xl" data-settings-search>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="按目的、关键词搜索设置（如：配色、形状、对比度、灵动岛、nodeUi）..."
                  aria-label={t("settings:search.placeholder", "搜索设置")}
                  className="h-8 rounded-full border-border/60 bg-background/80 pl-8 pr-8 text-xs"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => setSearchQuery("")}
                    className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {!isWideMasterDetail ? (
              <CompactPurposeNav
                variant={chrome.navVariant === "select" ? "select" : "chips"}
                categories={filteredCategories.length > 0 ? filteredCategories : MD3E_PURPOSE_CATEGORIES}
                active={activePurpose}
                onSelect={selectPurpose}
              />
            ) : null}
          </div>
        </header>
      ) : (
        <div className="shrink-0 border-b border-border/50 px-2 py-1.5">
          <CompactPurposeNav
            variant="select"
            categories={MD3E_PURPOSE_CATEGORIES}
            active={activePurpose}
            onSelect={selectPurpose}
          />
        </div>
      )}

      {/* ── 主体区：宽屏 ≥ 600px 采用 35% / 65% 主从布局，窄屏单列自适应 ── */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          isWideMasterDetail
            ? "grid grid-cols-[minmax(220px,35%)_minmax(0,65%)]"
            : "flex flex-col",
        )}
      >
        {isWideMasterDetail ? (
          <aside
            aria-label="按目的分类导航与实时预览"
            data-settings-stage-nav
            data-settings-nav-variant="rail"
            data-settings-nav-expand={chrome.expandAll ? "all" : "active"}
            className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto border-r border-border/50 bg-[var(--md-sys-color-surface-container-low,var(--muted))]/40 p-3.5"
          >
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                按目的选择设置域
              </p>
              <Md3eConnectedGroup orientation="vertical">
                {(filteredCategories.length > 0 ? filteredCategories : MD3E_PURPOSE_CATEGORIES).map((category) => {
                  const Icon = category.icon
                  const isActive = category.id === activePurpose
                  return (
                    <button
                      key={category.id}
                      type="button"
                      data-settings-nav-stage={category.legacySectionId}
                      data-md3e-purpose-nav={category.id}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => selectPurpose(category.id)}
                      className={cn(
                        "flex w-full min-w-0 flex-col gap-1 px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        isActive
                          ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))] shadow-2xs"
                          : "bg-[var(--md-sys-color-surface-container,var(--card))] text-foreground hover:bg-[var(--md-sys-color-surface-container-high,var(--muted))]",
                      )}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="truncate text-xs font-semibold">{category.title}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 font-mono text-[9px] opacity-80">
                          {category.scopeSummary.split("·")[0]?.trim()}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-[11px] opacity-75">{category.intentQuestion}</p>
                    </button>
                  )
                })}
              </Md3eConnectedGroup>
            </div>

            {/* ── 痛点 3 解决方案：左侧粘性实时效果预览台（Live Interactive Preview Stage） ── */}
            <LiveEffectPreviewStage
              domReadback={domReadback}
              previewToggleChecked={previewToggleChecked}
              onToggleChange={setPreviewToggleChecked}
              previewSliderVal={previewSliderVal}
              onSliderChange={setPreviewSliderVal}
              previewTab={previewTab}
              onTabChange={setPreviewTab}
              compact={false}
            />
          </aside>
        ) : null}

        {/* ── 右侧详情区：连接式分组卡片（外 24 / 内 6 圆角，带明确生效范围徽章） ── */}
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const nextScrolled = event.currentTarget.scrollTop > 20
            setScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled))
          }}
          data-settings-scroll
          className={cn(
            "h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto",
            isCompact320 ? "p-2 space-y-2.5" : "p-4 space-y-4",
          )}
        >
          {/* 窄屏模式下在顶部提供紧凑版实时预览条 */}
          {!isWideMasterDetail && !chrome.contentOnly ? (
            <LiveEffectPreviewStage
              domReadback={domReadback}
              previewToggleChecked={previewToggleChecked}
              onToggleChange={setPreviewToggleChecked}
              previewSliderVal={previewSliderVal}
              onSliderChange={setPreviewSliderVal}
              previewTab={previewTab}
              onTabChange={setPreviewTab}
              compact
            />
          ) : null}

          <section
            data-settings-active-section={activeCategoryDef.legacySectionId}
            data-md3e-active-purpose={activePurpose}
            className="min-w-0 space-y-4"
          >
            {activePurpose === "style-and-color" ? (
              <div className="space-y-4" data-settings-step="theme">
                {/* 分组 1：界面形态与设计语言 */}
                <ConnectedSettingsSection
                  title="界面形态与设计语言（正交双维）"
                  subtitle="UI Face 决定工作台布局/设置信息架构/表达性控件族；设计语言与配色决定底层 Token，切回 Legacy 原样恢复完整旧版。"
                  scopeBadge="全局工作台 · xaihi-core.appUi.ui"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="工作台界面形态 (UI Face)"
                      description="默认 Legacy 不篡改出厂状态；切换 MD3E 启用连接式顶栏、目的分类设置与表达性形状引擎。"
                      scope="全局视觉面"
                    >
                      <div className="flex flex-wrap gap-1">
                        {(["legacy", "md3e"] as const).map((face) => (
                          <button
                            key={face}
                            type="button"
                            data-settings-face-btn={face}
                            aria-pressed={state.uiFace === face}
                            onClick={() => actions.setUiFace?.(face)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                              state.uiFace === face
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {face === "legacy" ? "经典工作台 (Legacy)" : "Material 3 Expressive (MD3E)"}
                          </button>
                        ))}
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="底层设计语言配方 (Design Recipe)"
                      description="在 Legacy 形态下直接生效；在 MD3E 形态下保留你的配方选择，切回 Legacy 时无缝还原。"
                      scope="正交保留"
                    >
                      <div className="flex flex-wrap gap-1">
                        {DESIGN_THEME_ENTRIES.map((entry) => {
                          const active = state.designTheme.id === entry.id
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              data-settings-recipe-btn={entry.id}
                              aria-pressed={active}
                              onClick={() => actions.setDesignTheme({ ...state.designTheme, id: entry.id })}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97]",
                                active
                                  ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))]"
                                  : "border border-border/60 bg-background/60 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {t(entry.labelKey, entry.id)}
                            </button>
                          )
                        })}
                      </div>
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>

                {/* 分组 2：动态取色与配色风格（9 Variant + 4 对比度 + 明暗） */}
                <ConnectedSettingsSection
                  title="动态取色与配色风格（与 MD3E 造型解耦）"
                  subtitle="由 @material/material-color-utilities 驱动：换颜色、换风格、换明暗只改语义色 Token，绝不锁死色板或把界面打回传统 MD3。"
                  scopeBadge="配色方案 · 实时计算"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="明暗外观模式 (Color Mode)"
                      description={`当前实际生效方案：${activeScheme === "dark" ? "深色 (Dark)" : "浅色 (Light)"}`}
                      scope="全局外观"
                    >
                      <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
                        {([
                          { key: "system", label: "跟随系统", icon: Monitor },
                          { key: "light", label: "浅色", icon: Sun },
                          { key: "dark", label: "深色", icon: Moon },
                        ] as const).map((item) => {
                          const Icon = item.icon
                          const active = (colorMode ?? "system") === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              data-settings-color-mode={item.key}
                              aria-pressed={active}
                              onClick={() => setColorMode(item.key)}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.96]",
                                active
                                  ? "bg-primary text-primary-foreground shadow-2xs"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Icon className="size-3.5" />
                              <span>{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title={`当前方案配色主题 (${activeScheme === "dark" ? "深色槽" : "浅色槽"})`}
                      description="选择内置武陵预设、已导入的自定义主题（如 symphonic-night / amethyst-haze）或使用 M3 基线默认色。"
                      scope={`${activeScheme} 独立槽`}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          data-settings-theme-selection="none"
                          aria-pressed={currentSelection?.kind === "none"}
                          onClick={() => actions.setThemeSelection(activeScheme, { kind: "none" })}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97]",
                            currentSelection?.kind === "none"
                              ? "bg-primary text-primary-foreground"
                              : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          M3 基线默认色
                        </button>
                        {THEME_PRESET_OPTIONS.map((preset) => {
                          const active = currentSelection?.kind === "preset" && currentSelection.name === preset.key
                          return (
                            <button
                              key={preset.key}
                              type="button"
                              data-settings-theme-selection={`preset:${preset.key}`}
                              aria-pressed={active}
                              onClick={() => actions.setThemeSelection(activeScheme, { kind: "preset", name: preset.key })}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97]",
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {t(preset.labelKey, preset.key)}
                            </button>
                          )
                        })}
                        {state.customThemes.map((custom) => {
                          const active = currentSelection?.kind === "custom" && currentSelection.name === custom.name
                          return (
                            <button
                              key={custom.name}
                              type="button"
                              data-settings-theme-selection={`custom:${custom.name}`}
                              aria-pressed={active}
                              onClick={() => actions.setThemeSelection(activeScheme, { kind: "custom", name: custom.name })}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97]",
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {custom.name}
                            </button>
                          )
                        })}
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="取色种子来源 (Seed Source) 与手动主色"
                      description="默认跟随当前激活配色主题（activeTheme），也可手动指定任意 #rrggbb 种子色或读取系统强调色。"
                      scope="MCU 动态引擎"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {(["activeTheme", "manual", "systemAccent"] as readonly Md3SeedSource[]).map((src) => {
                          const active = state.designTheme.md3.seedSource === src
                          const label =
                            src === "activeTheme"
                              ? "跟随当前主题"
                              : src === "manual"
                                ? "手动指定色值"
                                : "系统强调色"
                          return (
                            <button
                              key={src}
                              type="button"
                              data-settings-seed-source={src}
                              aria-pressed={active}
                              onClick={() => patchMd3({ seedSource: src })}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97]",
                                active
                                  ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))]"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {label}
                            </button>
                          )
                        })}
                        <label className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 text-xs">
                          <input
                            type="color"
                            aria-label="手动取色种子颜色"
                            data-settings-seed-input
                            value={state.designTheme.md3.seed}
                            onChange={(event) =>
                              patchMd3({ seed: event.currentTarget.value.toLowerCase(), seedSource: "manual" })
                            }
                            className="size-4 cursor-pointer border-0 bg-transparent p-0"
                          />
                          <span className="font-mono text-[11px]">{state.designTheme.md3.seed}</span>
                        </label>
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="配色风格变体 (9 种 Material 3 Scheme Variants)"
                      description="自由切换 Expressive / TonalSpot / Vibrant / Neutral / Monochrome 等 9 种算法色板，与 MD3E 布局造型完全解耦。"
                      scope="9 Variants"
                    >
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3" data-settings-variant-grid>
                        {MD3_SCHEME_VARIANTS.map((variant) => {
                          const active = state.designTheme.md3.variant === variant
                          const meta = VARIANT_LABELS[variant]
                          return (
                            <button
                              key={variant}
                              type="button"
                              data-settings-md3-variant={variant}
                              aria-pressed={active}
                              onClick={() => patchMd3({ variant })}
                              className={cn(
                                "flex flex-col items-start rounded-[14px] border p-2 text-left transition-all active:scale-[0.97]",
                                active
                                  ? "border-primary bg-[var(--md-sys-color-primary-container,var(--primary))]/25 text-foreground shadow-2xs"
                                  : "border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground",
                              )}
                            >
                              <span className="text-[11px] font-semibold text-foreground">{meta.title}</span>
                              <span className="mt-0.5 line-clamp-1 text-[10px] opacity-80">{meta.desc}</span>
                            </button>
                          )
                        })}
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="对比度档位 (4 档 Contrast Level)"
                      description="调节表面容器与前景文字的明度跨度；达到 +1.0 高对比时，复杂花瓣图标按钮自动触发可读性下限退化。"
                      scope="WCAG 无障碍"
                    >
                      <div className="flex flex-wrap gap-1.5" data-settings-contrast-group>
                        {MD3_CONTRAST_LEVELS.map((level) => {
                          const active = state.designTheme.md3.contrastLevel === level
                          return (
                            <button
                              key={level}
                              type="button"
                              data-settings-md3-contrast={String(level)}
                              aria-pressed={active}
                              onClick={() => patchMd3({ contrastLevel: level })}
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                                active
                                  ? "bg-primary text-primary-foreground shadow-2xs"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {CONTRAST_LABELS[level]}
                            </button>
                          )
                        })}
                      </div>
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>

                {/* 分组 3：排版、圆角阶梯与背景氛围 */}
                <ConnectedSettingsSection
                  title="字体排版、圆角缩放与画布氛围"
                  subtitle="遵循相对字号铁律（ADR-0080），按比例缩放 M3 圆角阶梯与工作区画布肌理。"
                  scopeBadge="全局工作台 · xaihi-core.appUi.ui"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="工作台字体预设与界面语言"
                      description="切换全站字体族与中英文界面文案。"
                      scope="排版与语言"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={state.fontPreset}
                          onValueChange={(val) => actions.setFontPreset(val as AppFontPreset)}
                        >
                          <SelectTrigger className="h-8 w-44 rounded-full text-xs" aria-label="选择字体预设">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {FONT_PRESETS.map((preset) => (
                                <SelectItem key={preset.key} value={preset.key}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-background/70 p-0.5">
                          {(["zh", "en"] as readonly Language[]).map((lang) => (
                            <button
                              key={lang}
                              type="button"
                              data-settings-lang={lang}
                              aria-pressed={currentLang === lang}
                              onClick={() => void changeLanguage(lang)}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                currentLang === lang
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {lang === "zh" ? "简体中文" : "English"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title={`M3 圆角阶梯缩放 (${state.designTheme.md3.shapeScale}x)`}
                      description="作用于 corner-extra-small 至 corner-extra-large，corner-full 胶囊保持不变量。"
                      scope="Shape Ladder"
                    >
                      <div className="flex flex-wrap gap-1">
                        {MD3_SHAPE_SCALE_STEPS.map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            data-settings-shape-scale={String(scale)}
                            aria-pressed={state.designTheme.md3.shapeScale === scale}
                            onClick={() => patchMd3({ shapeScale: scale })}
                            className={cn(
                              "rounded-full px-2.5 py-1 font-mono text-[11px] transition-all active:scale-[0.96]",
                              state.designTheme.md3.shapeScale === scale
                                ? "bg-primary text-primary-foreground"
                                : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {scale}x
                          </button>
                        ))}
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="画布背景肌理与表面高程阴影"
                      description="控制工作区网格/图片背景、M3 高程阴影及动作微光。"
                      scope="画布氛围"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {(["dot-grid", "grid", "image", "none"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            data-settings-bg-mode={mode}
                            aria-pressed={state.bgMode === mode}
                            onClick={() => actions.setBgMode(mode)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-medium",
                              state.bgMode === mode
                                ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))]"
                                : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {mode === "dot-grid" ? "点阵" : mode === "grid" ? "网格" : mode === "image" ? "壁纸图" : "纯色表面"}
                          </button>
                        ))}
                        <label className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs">
                          <span>M3 阴影</span>
                          <Switch
                            aria-label="M3 高程阴影"
                            checked={state.designTheme.md3.elevationShadows}
                            onCheckedChange={(checked) => patchMd3({ elevationShadows: checked })}
                          />
                        </label>
                      </div>
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>
              </div>
            ) : null}

            {activePurpose === "controls-and-shapes" ? (
              <div className="space-y-4" data-settings-step="components">
                {/* 分组 1：表达性控件形状引擎 */}
                <ConnectedSettingsSection
                  title="MD3E 表达性控件形状引擎（同类一致 · 按控件类型适配）"
                  subtitle="图标按钮可取花瓣、曲奇、多边形等表达性形态；文字按钮恒保胶囊/圆角不裁字。每个节点也可在各自配置中心独立保存固定或启动随机策略。"
                  scopeBadge="单节点独立 · xaihi-core.nodeUi[nodeId]"
                >
                  {shapeCtx ? (
                    <div className="space-y-3">
                      <Md3eShapeStatusReadback context={shapeCtx} />

                      <Md3eConnectedGroup orientation="vertical">
                        <SettingsRowItem
                          title={`当前作用域（${shapeCtx.nodeId}）形状策略`}
                          description="“启动时随机”在每次应用冷启动时抽取一次，会话内重排、切视图、组件重建均稳定不变；可随时将当前组合固定。"
                          scope={`xaihi-core.nodeUi[${shapeCtx.nodeId}]`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              data-settings-shape-mode="random-on-startup"
                              aria-pressed={shapeCtx.policy.mode === "random-on-startup"}
                              onClick={() => void shapeCtx.setPolicyMode("random-on-startup")}
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                                shapeCtx.policy.mode === "random-on-startup"
                                  ? "bg-primary text-primary-foreground shadow-2xs"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              启动时随机（会话内稳定）
                            </button>
                            <button
                              type="button"
                              data-settings-shape-mode="fixed"
                              aria-pressed={shapeCtx.policy.mode === "fixed"}
                              onClick={() => void shapeCtx.setPolicyMode("fixed")}
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97]",
                                shapeCtx.policy.mode === "fixed"
                                  ? "bg-primary text-primary-foreground shadow-2xs"
                                  : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              固定形状组合
                            </button>
                            {shapeCtx.policy.mode === "random-on-startup" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                data-settings-pin-shapes
                                onClick={() => void shapeCtx.pinCurrentShapes()}
                                className="h-7 gap-1 text-xs"
                              >
                                <Pin className="size-3.5" />
                                <span>固定当前随机组合</span>
                              </Button>
                            ) : null}
                          </div>
                        </SettingsRowItem>

                        {MD3E_BUTTON_ROLES.map((role) => {
                          const currentShapeId = shapeCtx.activeRoleShapes[role]
                          const resolved = shapeCtx.resolveIconButtonShape(role)
                          return (
                            <SettingsRowItem
                              key={role}
                              title={ROLE_LABELS[role]}
                              description={
                                resolved.status === "degraded"
                                  ? `请求形状：${currentShapeId} → 已安全退化为 ${resolved.id}`
                                  : `同一节点内所有 ${role} 图标按钮共享此形状（${resolved.spec.labelZh}）`
                              }
                              scope="同类一致"
                            >
                              <div className="flex flex-wrap items-center gap-1">
                                {MD3E_EXPRESSIVE_SHAPES.map((spec) => {
                                  const selected = currentShapeId === spec.id
                                  return (
                                    <button
                                      key={spec.id}
                                      type="button"
                                      data-settings-role-shape={`${role}:${spec.id}`}
                                      aria-pressed={selected}
                                      title={`${spec.labelZh} (${spec.labelEn})`}
                                      onClick={() => void shapeCtx.setRoleShape(role, spec.id as Md3eExpressiveShapeId)}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all active:scale-[0.95]",
                                        selected
                                          ? "bg-primary text-primary-foreground shadow-2xs"
                                          : "border border-border/50 bg-background/65 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                      )}
                                    >
                                      <Md3eShapePreviewGlyph shapeId={spec.id} className="size-3" />
                                      <span>{spec.labelZh}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </SettingsRowItem>
                          )
                        })}
                      </Md3eConnectedGroup>
                    </div>
                  ) : null}
                </ConnectedSettingsSection>

                {/* 分组 2：组件皮肤与 Force Canonical */}
                <ConnectedSettingsSection
                  title="组件皮肤族与标准 M3E 锁定 (Force Canonical)"
                  subtitle="默认将六类皮肤各自映射为合规的 M3E 表达形态；开启 Force Canonical 后跳过单独皮肤档位，全站锁定标准 M3E 规范。"
                  scopeBadge="全局工作台 · xaihi-core.appUi.ui"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="强制标准 M3E 形态 (md3.forceCanonical)"
                      description="开启后移除自定义组件皮肤属性，全站统一渲染标准 Material 3 Expressive 规范控件。"
                      scope="全局覆盖门"
                    >
                      <Switch
                        aria-label={t("settings:designTheme.forceCanonical", "强制标准 M3E 形态")}
                        checked={state.designTheme.md3.forceCanonical}
                        onCheckedChange={(checked) => patchMd3({ forceCanonical: checked })}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="标签页皮肤 (Tabs Style)"
                      description="underline 映射主导航指示条，pill 映射次级胶囊，surface 映射高容器分段。"
                      scope="data-tabs-style"
                    >
                      <SkinPillRow
                        options={["underline", "surface", "pill", "boxed", "quiet", "none"] as const}
                        value={state.tabDisplayStyle}
                        disabled={state.designTheme.md3.forceCanonical}
                        onChange={(val) => actions.setTabDisplayStyle(val)}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="开关皮肤 (Switch Style)"
                      description="支持 16→24→28dp 手柄按压形变。"
                      scope="data-switch-style"
                    >
                      <SkinPillRow
                        options={["filled", "outlined", "minimal", "none"] as const}
                        value={state.switchDisplayStyle}
                        disabled={state.designTheme.md3.forceCanonical}
                        onChange={(val) => actions.setSwitchDisplayStyle(val)}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="滑杆皮肤 (Slider Style)"
                      description="支持标准轨、16dp 厚胶囊轨与柔和色调轨。"
                      scope="data-slider-style"
                    >
                      <SkinPillRow
                        options={["solid", "pill", "soft", "line", "minimal", "none"] as const}
                        value={state.sliderDisplayStyle}
                        disabled={state.designTheme.md3.forceCanonical}
                        onChange={(val) => actions.setSliderDisplayStyle(val)}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="分段选择控件皮肤 (Choice Control Style)"
                      description="segmented 映射连接式描边组，pills 映射磁吸连接胶囊组。"
                      scope="data-choice-control-style"
                    >
                      <SkinPillRow
                        options={["segmented", "pills", "tabs", "tiles", "none"] as const}
                        value={state.choiceControlStyle}
                        disabled={state.designTheme.md3.forceCanonical}
                        onChange={(val) => actions.setChoiceControlStyle(val)}
                      />
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>
              </div>
            ) : null}

            {activePurpose === "layout-and-workspace" ? (
              <div className="space-y-4" data-settings-step="chrome">
                <ConnectedSettingsSection
                  title="工作区启动与视图导航"
                  subtitle="控制工作区节点实例恢复、顶栏紧凑切换器的循环边界与侧栏展现形式。"
                  scopeBadge="全局工作台 · xaihi-core.appUi.ui"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="启动时恢复工作区节点实例"
                      description="开启后在冷启动时从工作区快照恢复已投放的节点卡片。"
                      scope="启动行为"
                    >
                      <Switch
                        aria-label="启动时恢复工作区节点实例"
                        checked={state.restoreWorkspaceComponents}
                        onCheckedChange={(checked) => actions.setRestoreWorkspaceComponents(checked)}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="视图切换器首尾循环 (View Switch Loop)"
                      description="允许顶栏视图与动作选择器在左右边界处无缝回绕。"
                      scope="顶栏导航"
                    >
                      <Switch
                        aria-label="视图切换器首尾循环"
                        checked={state.viewSwitchLoop}
                        onCheckedChange={(checked) => actions.setViewSwitchLoop(checked)}
                      />
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="覆盖层面板模式 (Overlay Mode)"
                      description="决定设置、注册表与运行历史以悬浮窗还是推开式固定侧栏打开。"
                      scope="覆盖层"
                    >
                      <SkinPillRow
                        options={["floating", "docked"] as const}
                        value={state.overlayMode}
                        onChange={(val) => actions.setOverlayMode(val)}
                      />
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>

                <ConnectedSettingsSection
                  title="节点卡片操作栏与字母索引条"
                  subtitle="配置节点卡片标题栏位置、红绿灯/灵动岛样式、卡片点击行为与右侧字母快速投放轨。"
                  scopeBadge="全局工作台 · xaihi-core.appUi.ui"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="显示节点浮动操作栏 (Node Chrome)"
                      description="控制每个节点卡片右上/左上/灵动岛操作胶囊的显隐与位置。"
                      scope="卡片操作栏"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Switch
                          aria-label="显示节点浮动操作栏"
                          checked={state.chromeVisible}
                          onCheckedChange={(checked) => actions.setChromeVisible(checked)}
                        />
                        <SkinPillRow
                          options={["left", "island", "right"] as const}
                          value={state.chromePosition}
                          onChange={(val) => actions.setChromePosition(val)}
                        />
                        <SkinPillRow
                          options={["default", "traffic-light"] as const}
                          value={state.chromeStyle}
                          onChange={(val) => actions.setChromeStyle(val)}
                        />
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="卡片单击 / 双击交互动作"
                      description="配置在分形卡片视图下单击或双击卡片时触发聚焦或全屏。"
                      scope="卡片交互"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">单击：</span>
                        <SkinPillRow
                          options={["none", "focus", "fullscreen"] as readonly CardClickAction[]}
                          value={state.cardClickAction}
                          onChange={(val) => actions.setCardClickAction(val)}
                        />
                        <span className="text-muted-foreground">双击：</span>
                        <SkinPillRow
                          options={["none", "focus", "fullscreen"] as readonly CardClickAction[]}
                          value={state.cardDoubleClickAction}
                          onChange={(val) => actions.setCardDoubleClickAction(val)}
                        />
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="右侧字母索引快速投放轨 (Alphabet Rail)"
                      description="控制 A-Z 节点快速检索轨显隐、隐藏空字母与单节点字母一键直投。"
                      scope="快速投放"
                    >
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="inline-flex items-center gap-1.5">
                          <span>显示</span>
                          <Switch
                            aria-label="显示字母索引条"
                            checked={state.alphabetIndexVisible}
                            onCheckedChange={(checked) => actions.setAlphabetIndexVisible(checked)}
                          />
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <span>隐藏空字母</span>
                          <Switch
                            aria-label="隐藏空字母"
                            checked={state.alphabetIndexHideEmpty}
                            onCheckedChange={(checked) => actions.setAlphabetIndexHideEmpty(checked)}
                          />
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <span>单节点直投</span>
                          <Switch
                            aria-label="单节点字母直接点击部署"
                            checked={state.alphabetIndexDirectDeploySingle}
                            onCheckedChange={(checked) => actions.setAlphabetIndexDirectDeploySingle(checked)}
                          />
                        </label>
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title={`危险操作反悔倒计时窗口 (${state.executeUndoWindowMs} ms)`}
                      description="带倒计时的破坏性操作按钮在自动提交前允许撤回的窗口时长（200ms–10000ms）。"
                      scope="安全护栏"
                    >
                      <div className="w-48">
                        <Slider
                          aria-label="危险操作反悔倒计时窗口"
                          min={200}
                          max={5000}
                          step={200}
                          value={[state.executeUndoWindowMs]}
                          onValueChange={([next]) => {
                            if (typeof next === "number") actions.setExecuteUndoWindowMs(next)
                          }}
                        />
                      </div>
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>
              </div>
            ) : null}

            {activePurpose === "host-and-storage" ? (
              <div className="space-y-4" data-settings-step="connection">
                <ConnectedSettingsSection
                  title="DSH 标准配置面与宿主桥状态（ADR-0013）"
                  subtitle="所有工作台与节点配置统一走 DSH 插件标准设置面（xaihi-core），不自建配置文件。"
                  scopeBadge="DSH Settings · xaihi-core"
                >
                  <Md3eConnectedGroup orientation="vertical">
                    <SettingsRowItem
                      title="宿主桥握手与授权能力组"
                      description={`前端来源：${runtimeInfo.frontendOrigin} (${runtimeInfo.frontendSource})`}
                      scope="Bridge"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={host.ready ? "default" : "outline"} className="rounded-full font-mono text-[10px]">
                          {host.ready ? "BRIDGE READY" : host.detached ? "DETACHED" : "NEGOTIATING"}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {host.granted.length > 0 ? host.granted.join(", ") : "无额外授权组"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => window.dispatchEvent(new Event("xaihi-ui-preference-retry"))}
                        >
                          <RefreshCcw className="size-3" />
                          <span>重试同步</span>
                        </Button>
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="工作台与节点配置持久化落点"
                      description="工作台 UI 偏好落 xaihi-core.appUi.{ui,themes,bgImage}；每节点界面与形状策略落 xaihi-core.nodeUi[nodeId]。"
                      scope="ADR-0013"
                    >
                      <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                        <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-0.5">
                          xaihi-core.appUi.ui
                        </span>
                        <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-0.5">
                          xaihi-core.nodeUi[nodeId]
                        </span>
                        <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-0.5">
                          xaihi-core.nodeState
                        </span>
                      </div>
                    </SettingsRowItem>

                    <SettingsRowItem
                      title="DOM 主题与形态实时回读 (Readback)"
                      description="直接从 document.documentElement 读取当前已落盘的诊断属性与变量条数。"
                      scope="DOM 事实源"
                    >
                      <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                        <span className="rounded-md bg-muted px-2 py-0.5">face={domReadback.uiFace}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5">design={domReadback.design}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5">variant={domReadback.variant}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5">seed={domReadback.seed}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5">contrast={domReadback.contrast}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5">vars={domReadback.appliedVars}</span>
                      </div>
                    </SettingsRowItem>
                  </Md3eConnectedGroup>
                </ConnectedSettingsSection>

                <DesktopTraySettings />
                <NodeMemoryProtectionSettings available={host.ready} />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

function CompactPurposeNav({
  variant,
  categories,
  active,
  onSelect,
}: {
  variant: "chips" | "select"
  categories: readonly Md3ePurposeCategoryDef[]
  active: Md3ePurposeCategoryId
  onSelect: (id: Md3ePurposeCategoryId) => void
}) {
  if (variant === "select") {
    return (
      <div data-settings-stage-nav data-settings-nav-variant="select" className="w-full">
        <Select value={active} onValueChange={(val) => onSelect(val as Md3ePurposeCategoryId)}>
          <SelectTrigger className="h-8 w-full rounded-full text-xs" aria-label="选择设置分类">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <nav
      aria-label="设置目的分类"
      data-settings-stage-nav
      data-settings-nav-variant="chips"
      className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-[var(--md-sys-color-surface-container-high,var(--muted))] p-1"
    >
      {categories.map((cat) => {
        const Icon = cat.icon
        const isActive = cat.id === active
        return (
          <button
            key={cat.id}
            type="button"
            data-settings-nav-stage={cat.legacySectionId}
            data-md3e-purpose-nav={cat.id}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.96]",
              isActive
                ? "bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))] shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{cat.title}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ConnectedSettingsSection({
  title,
  subtitle,
  scopeBadge,
  children,
}: {
  title: string
  subtitle: string
  scopeBadge: string
  children: ReactNode
}) {
  return (
    <div
      data-md3e-settings-group
      className="min-w-0 space-y-2 rounded-[28px] border border-border/40 bg-[var(--md-sys-color-surface-container-low,var(--card))]/70 p-3 shadow-2xs"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 px-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        <span
          data-settings-scope={scopeBadge}
          className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-medium text-primary"
        >
          {scopeBadge}
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SettingsRowItem({
  title,
  description,
  scope,
  children,
}: {
  title: string
  description: string
  scope: string
  children: ReactNode
}) {
  return (
    <div
      data-md3e-settings-row
      className="flex min-w-0 flex-col justify-between gap-2.5 bg-[var(--md-sys-color-surface-container,var(--background))]/90 px-3.5 py-3 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {scope}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function SkinPillRow<T extends string>({
  options,
  value,
  disabled,
  onChange,
}: {
  options: readonly T[]
  value: T
  disabled?: boolean
  onChange: (next: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[11px] transition-all active:scale-[0.96] disabled:opacity-45",
              active
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function LiveEffectPreviewStage({
  domReadback,
  previewToggleChecked,
  onToggleChange,
  previewSliderVal,
  onSliderChange,
  previewTab,
  onTabChange,
  compact,
}: {
  domReadback: {
    uiFace: string
    design: string
    variant: string
    seed: string
    source: string
    contrast: string
    appliedVars: string
  }
  previewToggleChecked: boolean
  onToggleChange: (next: boolean) => void
  previewSliderVal: number
  onSliderChange: (next: number) => void
  previewTab: string
  onTabChange: (next: string) => void
  compact: boolean
}) {
  return (
    <div
      data-settings-live-preview={compact ? "compact" : "full"}
      className={cn(
        "min-w-0 rounded-[24px] border border-primary/25 bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] p-3 shadow-2xs",
        !compact && "mt-auto",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Eye className="size-3.5 shrink-0" />
          <span>实时效果预览台 (Live Stage)</span>
        </span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {domReadback.variant} · {domReadback.seed}
        </span>
      </div>

      {/* 表达性图标按钮（同类一致）与文字胶囊按钮实机可按预览 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="default" aria-label="预览主要图标按钮" title="主要图标按钮 (Primary)">
          <Sparkles className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="default" aria-label="预览同类一致主要图标按钮" title="同类主要图标按钮（形状一致）">
          <Check className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="预览次要图标按钮" title="次要图标按钮 (Secondary)">
          <Wand2 className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="预览描边图标按钮" title="描边图标按钮 (Outline)">
          <Sliders className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="destructive" aria-label="预览危险图标按钮" title="危险图标按钮 (Danger)">
          <ShieldAlert className="size-3.5" />
        </Button>
        <Button size="sm" variant="default">
          文字胶囊不裁切
        </Button>
      </div>

      {!compact ? (
        <div className="mt-3 space-y-2.5 border-t border-border/40 pt-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">M3E 开关与手柄形变</span>
            <Switch
              aria-label="预览 M3E 开关"
              checked={previewToggleChecked}
              onCheckedChange={onToggleChange}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>M3E 滑杆与波浪进度</span>
              <span className="font-mono">{previewSliderVal}%</span>
            </div>
            <Slider
              aria-label="预览 M3E 滑杆"
              min={0}
              max={100}
              value={[previewSliderVal]}
              onValueChange={([val]) => {
                if (typeof val === "number") onSliderChange(val)
              }}
            />
            <Md3eWavyProgress value={previewSliderVal} label="预览波浪进度" className="mt-1" />
          </div>
          <Tabs value={previewTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="expressive">Expressive</TabsTrigger>
              <TabsTrigger value="tonal">Tonal</TabsTrigger>
              <TabsTrigger value="canonical">Canonical</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
    </div>
  )
}
