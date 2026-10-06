/**
 * UI 偏好 slice：主题、字体、视图、背景、液态玻璃、顶栏、字母索引、卡片行为等设置。
 *
 * 这里只承载"用户偏好"类状态，业务数据（components/lanes）由其他 slice 管理。
 * setTheme/setCustomThemes 等动作涉及多个字段的级联更新，注释中标明了原因。
 */
import { THEME_DESIGN_RECIPES } from "@/lib/appearance"
import { normalizeDesignThemeConfig } from "@/lib/design-theme/contract"
import type { SetWorkspaceStore, WorkspaceUiActions, WorkspaceUiPreferences } from "./types"
import { normalizeSwimlanePreferences } from "@/components/workspace/swimlane/model"
import { normalizeChromeActionOrder, normalizeChromeHiddenActions } from "@/components/workspace/chromeActionPreferences"
import { clampWheelPitch, clampWheelRadius } from "@/actions/wheelPreferences"

export function createUiSlice(set: SetWorkspaceStore): WorkspaceUiActions {
  return {
    /**
     * 切换到内置主题预设。
     *
     * 同时更新：
     *  - themeSelections（明暗都设为该预设）；
     *  - activeCustomThemeName 清空（预设与自定义互斥）；
     *  - fontPreset 只在没人显式动过它时跟随该主题的 design recipe。
     */
    setTheme: (theme) => set((state) => {
      const recipe = THEME_DESIGN_RECIPES[theme]
      // 判据不加一个「用户选过字体」的字段：当前值还等于上一个主题的配方值，
      // 就说明这份 fontPreset 是配方给的，可以被下一个主题带走；不相等就是用户自己挑的。
      const followsRecipe = state.fontPreset === THEME_DESIGN_RECIPES[state.theme].fontPreset
      return {
        theme,
        themeSelections: {
          light: { kind: "preset", name: theme },
          dark: { kind: "preset", name: theme },
        },
        activeCustomThemeName: null,
        ...(followsRecipe ? { fontPreset: recipe.fontPreset } : {}),
      }
    }, false, "SET_THEME"),
    /** 设置某个方案（light/dark）的主题选择：preset 时清空 custom，custom 时同步 activeCustomThemeName。 */
    setThemeSelection: (scheme, selection) => set((state) => ({
      themeSelections: { ...state.themeSelections, [scheme]: selection },
      ...(selection.kind === "preset" ? { theme: selection.name, activeCustomThemeName: null } : { activeCustomThemeName: selection.name }),
    }), false, "SET_THEME_SELECTION"),
    /** 从后端/持久化恢复 UI 偏好（仅覆盖传入字段，缺失字段保留默认）。 */
    hydrateUiPreferences: (preferences) => set(
      sanitizeUiPreferences(preferences),
      false,
      "HYDRATE_UI_PREFERENCES",
    ),
    /**
     * 替换自定义主题列表。
     *
     * 当某个 scheme 的选择指向已不存在的自定义主题时，回退到当前预设；
     * activeCustomThemeName 仅在仍存在时保留，否则置 null（不主动复活首个导入主题）。
     */
    setCustomThemes: (customThemes) => set((state) => ({
      customThemes,
      themeSelections: Object.fromEntries(Object.entries(state.themeSelections).map(([scheme, selection]) => [
        scheme,
        selection.kind === "custom" && !customThemes.some((theme) => theme.name === selection.name)
          ? { kind: "preset", name: state.theme }
          : selection,
      ])) as typeof state.themeSelections,
      // A preset explicitly clears the active custom theme. Do not revive the
      // first imported theme while rehydrating the list on startup.
      activeCustomThemeName: state.activeCustomThemeName && customThemes.some((theme) => theme.name === state.activeCustomThemeName)
        ? state.activeCustomThemeName
        : null,
    }), false, "SET_CUSTOM_THEMES"),
    /** 激活指定自定义主题（明暗都切到它）；传 null 则回退到当前预设。 */
    setActiveCustomThemeName: (activeCustomThemeName) => set((state) => ({
      activeCustomThemeName,
      themeSelections: activeCustomThemeName
        ? { light: { kind: "custom", name: activeCustomThemeName }, dark: { kind: "custom", name: activeCustomThemeName } }
        : { light: { kind: "preset", name: state.theme }, dark: { kind: "preset", name: state.theme } },
    }), false, "SET_ACTIVE_CUSTOM_THEME"),
    setFontPreset: (fontPreset) => set({ fontPreset }, false, "SET_FONT_PRESET"),
    /**
     * 替换高级主题（设计语言）配置。
     *
     * 整体替换而不是逐字段 patch：维度开关与 md3 参数必须一起来自同一个解析后的对象，
     * 拆成两个动作只会留下「id 已切但参数还是上一个主题」这种中间态。
     */
    // 唯一写入点，所以不变量也落在这里：任何调用方递进来的半成品（少字段、被手改、
    // 加字段之前的旧形状）都先过同一个解析器。不这么做，「切换配方」那条
    // `{...config, id}` 的展开就会把缺字段的状态原样带进 store 并持久化下去。
    setDesignTheme: (designTheme) => set({ designTheme: normalizeDesignThemeConfig(designTheme) }, false, "SET_DESIGN_THEME"),
    setViewMode: (mode) => set({ viewMode: mode }, false, "SET_VIEW_MODE"),
    setCardLayout: (layout) => set({ cardLayout: layout }, false, "SET_CARD_LAYOUT"),
    setOverlay: (overlay) => set({ overlay }, false, "SET_OVERLAY"),
    setOverlayMode: (overlayMode) => set({ overlayMode }, false, "SET_OVERLAY_MODE"),
    setOverlayWidth: (overlayWidth) => set({ overlayWidth }, false, "SET_OVERLAY_WIDTH"),
    setOverlayFloatingMetrics: (metrics) => set((state) => ({
      overlayFloatingMetrics: {
        ...state.overlayFloatingMetrics,
        ...metrics,
      },
    }), false, "SET_OVERLAY_FLOATING_METRICS"),
    setGrain: (enabled) => set({ grainEnabled: enabled }, false, "SET_GRAIN"),
    setVignette: (depth) => set({ vignetteDepth: depth }, false, "SET_VIGNETTE"),
    setGrainIntensity: (intensity) => set({ grainIntensity: intensity }, false, "SET_GRAIN_INTENSITY"),
    setActionGlow: (enabled) => set({ actionGlow: enabled }, false, "SET_ACTION_GLOW"),
    setCardElevation: (enabled) => set({ cardElevation: enabled }, false, "SET_CARD_ELEVATION"),
    setBgMode: (mode) => set({ bgMode: mode }, false, "SET_BG_MODE"),
    setBgImageUrl: (url) => set({ bgImageUrl: url }, false, "SET_BG_IMAGE_URL"),
    setBgOpacity: (opacity) => set({ bgOpacity: opacity }, false, "SET_BG_OPACITY"),
    setBgBlur: (blur) => set({ bgBlur: blur }, false, "SET_BG_BLUR"),
    setBgCoverTopBar: (cover) => set({ bgCoverTopBar: cover }, false, "SET_BG_COVER_TOP_BAR"),
    setLiquidGlassEnabled: (enabled) => set({ liquidGlassEnabled: enabled }, false, "SET_LIQUID_GLASS_ENABLED"),
    setLiquidGlassOpacity: (opacity) => set({ liquidGlassOpacity: opacity }, false, "SET_LIQUID_GLASS_OPACITY"),
    setLiquidGlassBlur: (blur) => set({ liquidGlassBlur: blur }, false, "SET_LIQUID_GLASS_BLUR"),
    setLiquidGlassDisplacement: (displacement) => set({ liquidGlassDisplacement: displacement }, false, "SET_LIQUID_GLASS_DISPLACEMENT"),
    setChromeVisible: (visible) => set({ chromeVisible: visible }, false, "SET_CHROME_VISIBLE"),
    setChromePosition: (position) => set({ chromePosition: position }, false, "SET_CHROME_POSITION"),
    setChromeStyle: (style) => set({ chromeStyle: style }, false, "SET_CHROME_STYLE"),
    setChromeIslandScale: (chromeIslandScale) => set({ chromeIslandScale }, false, "SET_CHROME_ISLAND_SCALE"),
    setChromeIslandMotion: (chromeIslandMotion) => set({ chromeIslandMotion }, false, "SET_CHROME_ISLAND_MOTION"),
    setChromeIslandDelay: (chromeIslandDelay) => set({ chromeIslandDelay }, false, "SET_CHROME_ISLAND_DELAY"),
    setChromeIslandIdleOffset: (chromeIslandIdleOffset) => set({ chromeIslandIdleOffset }, false, "SET_CHROME_ISLAND_IDLE_OFFSET"),
    setChromeActionOrder: (chromeActionOrder) => set({ chromeActionOrder: normalizeChromeActionOrder(chromeActionOrder) }, false, "SET_CHROME_ACTION_ORDER"),
    setChromeHiddenActions: (chromeHiddenActions) => set({ chromeHiddenActions: normalizeChromeHiddenActions(chromeHiddenActions) }, false, "SET_CHROME_HIDDEN_ACTIONS"),
    setChromeActionPreferences: (chromeActionOrder, chromeHiddenActions) => set({
      chromeActionOrder: normalizeChromeActionOrder(chromeActionOrder),
      chromeHiddenActions: normalizeChromeHiddenActions(chromeHiddenActions),
    }, false, "SET_CHROME_ACTION_PREFERENCES"),
    setWheelPreferences: (wheelActionOrder, wheelHiddenActions) => set({
      // 不在这里按注册表归一化：`@/actions` 的 builtins 反过来要读这个 store，归一化会构成加载环。
      // 未知 id 在 applyWheelLayout 里退化成「排在尾部 / 匹配不上」，设置界面下次保存时自然清掉。
      wheelActionOrder: [...wheelActionOrder],
      wheelHiddenActions: [...wheelHiddenActions],
    }, false, "SET_WHEEL_PREFERENCES"),
    setWheelGeometry: (wheelRadiusPx, wheelSectorPitchDeg) => set({
      wheelRadiusPx: clampWheelRadius(wheelRadiusPx),
      wheelSectorPitchDeg: clampWheelPitch(wheelSectorPitchDeg),
    }, false, "SET_WHEEL_GEOMETRY"),
    setFloatingWindowCaptionPosition: (floatingWindowCaptionPosition) => set({ floatingWindowCaptionPosition }, false, "SET_FLOATING_WINDOW_CAPTION_POSITION"),
    setFloatingWindowCaptionStyle: (floatingWindowCaptionStyle) => set({ floatingWindowCaptionStyle }, false, "SET_FLOATING_WINDOW_CAPTION_STYLE"),
    setFloatingWindowCaptionAutoCollapse: (floatingWindowCaptionAutoCollapse) => set({ floatingWindowCaptionAutoCollapse }, false, "SET_FLOATING_WINDOW_CAPTION_AUTO_COLLAPSE"),
    setAlphabetIndexVisible: (alphabetIndexVisible) => set({ alphabetIndexVisible }, false, "SET_ALPHABET_INDEX_VISIBLE"),
    setAlphabetIndexOpacity: (alphabetIndexOpacity) => set({ alphabetIndexOpacity }, false, "SET_ALPHABET_INDEX_OPACITY"),
    setAlphabetIndexStyle: (alphabetIndexStyle) => set({ alphabetIndexStyle }, false, "SET_ALPHABET_INDEX_STYLE"),
    setAlphabetIndexWaveIntensity: (alphabetIndexWaveIntensity) => set({ alphabetIndexWaveIntensity }, false, "SET_ALPHABET_INDEX_WAVE_INTENSITY"),
    setCardClickAction: (cardClickAction) => set({ cardClickAction }, false, "SET_CARD_CLICK_ACTION"),
    setCardDoubleClickAction: (cardDoubleClickAction) => set({ cardDoubleClickAction }, false, "SET_CARD_DOUBLE_CLICK_ACTION"),
    setTabDisplayStyle: (tabDisplayStyle) => set({ tabDisplayStyle }, false, "SET_TAB_DISPLAY_STYLE"),
    setSwitchDisplayStyle: (switchDisplayStyle) => set({ switchDisplayStyle }, false, "SET_SWITCH_DISPLAY_STYLE"),
    setScrollbarDisplayStyle: (scrollbarDisplayStyle) => set({ scrollbarDisplayStyle }, false, "SET_SCROLLBAR_DISPLAY_STYLE"),
    setSliderDisplayStyle: (sliderDisplayStyle) => set({ sliderDisplayStyle }, false, "SET_SLIDER_DISPLAY_STYLE"),
    setChoiceControlStyle: (choiceControlStyle) => set({ choiceControlStyle }, false, "SET_CHOICE_CONTROL_STYLE"),
    setFieldTitleStyle: (fieldTitleStyle) => set({ fieldTitleStyle }, false, "SET_FIELD_TITLE_STYLE"),
    setModuleTitleStyle: (moduleTitleStyle) => set({ moduleTitleStyle }, false, "SET_MODULE_TITLE_STYLE"),
    setModulePanelStyle: (modulePanelStyle) => set({ modulePanelStyle }, false, "SET_MODULE_PANEL_STYLE"),
    setResizableHandleStyle: (resizableHandleStyle) => set({ resizableHandleStyle }, false, "SET_RESIZABLE_HANDLE_STYLE"),
    setHazardMode: (hazardMode) => set({ hazardMode }, false, "SET_HAZARD_MODE"),
    setRestoreWorkspaceComponents: (restoreWorkspaceComponents) => set({ restoreWorkspaceComponents }, false, "SET_RESTORE_WORKSPACE_COMPONENTS"),
    patchLaneWorkspacePreferences: (workspaceId, patch) => set((state) => ({
      laneWorkspacePreferences: {
        ...state.laneWorkspacePreferences,
        [workspaceId]: normalizeSwimlanePreferences({ ...state.laneWorkspacePreferences[workspaceId], ...patch }),
      },
    }), false, "PATCH_LANE_WORKSPACE_PREFERENCES"),
  }
}

/**
 * 清洗 hydrate 时的 UI 偏好。
 *
 * - 过滤 undefined 字段，避免覆盖默认值；
 * - 若缺 themeSelections（旧版本数据），根据 activeCustomThemeName/theme 推导一份。
 */
function sanitizeUiPreferences(preferences: Partial<WorkspaceUiPreferences>): Partial<WorkspaceUiPreferences> {
  const sanitized = Object.fromEntries(
    Object.entries(preferences).filter(([, value]) => value !== undefined),
  ) as Partial<WorkspaceUiPreferences>
  if (!sanitized.themeSelections) {
    const selection = sanitized.activeCustomThemeName
      ? { kind: "custom" as const, name: sanitized.activeCustomThemeName }
      : { kind: "preset" as const, name: sanitized.theme ?? "wuling" }
    sanitized.themeSelections = { light: selection, dark: selection }
  }
  if (sanitized.laneWorkspacePreferences) {
    sanitized.laneWorkspacePreferences = Object.fromEntries(Object.entries(sanitized.laneWorkspacePreferences).map(([workspaceId, value]) => [workspaceId, normalizeSwimlanePreferences(value)]))
  }
  // 高级主题来自宿主持久化，字段可能缺半或被手改过；解析器认不出的部分一律回默认。
  if (sanitized.designTheme !== undefined) {
    sanitized.designTheme = normalizeDesignThemeConfig(sanitized.designTheme)
  }
  return sanitized
}
