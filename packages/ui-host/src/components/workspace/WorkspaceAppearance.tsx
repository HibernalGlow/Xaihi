import { useCallback, useEffect, useState } from "react"
import { applyCustomTheme, applyThemePreset, getActiveCustomTheme, mirrorAestivusThemeStorage, resolveThemeScheme, type ThemeMode } from "@/lib/appearance"
import type { AppCustomTheme } from "@/types/workspace"
import { applyFontPreset } from "@/lib/appearance-fonts"
import { installNativeRangeProgressSync, syncAllNativeRangeProgress } from "@/lib/sliderSkin"
import { applyDesignTheme, clearDesignTheme } from "@/lib/design-theme/apply"
import { readRootColorVar, readSystemAccentColor } from "@/lib/design-theme/domColor"
import { useTheme } from "@/components/use-theme"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"

/**
 * 外观落盘的唯一入口。两件事必须在这里、按固定顺序发生：
 *  1. 颜色主题（预设 + 用户导入的自定义主题）写自己的 CSS 变量；
 *  2. 高级主题（设计语言）再写它那份——它默认接管颜色，所以顺序反过来就会被颜色主题盖掉。
 * 两个维度都是往 `documentElement.style` 写同名变量（inline 优先级最高、后写赢），
 * 因此它们不能在两个组件里靠「挂载顺序」间接排序，必须在这一个 effect 链里显式排序。
 */
/**
 * `useTheme()` 在没有 ThemeProvider 的挂载点里返回 `undefined`，而
 * `resolveThemeScheme(undefined, …)` 会把 undefined 原样吐回来，于是
 * `themeSelections[undefined]` 是 undefined——崩在主题选择上而不是崩在颜色上，
 * 排查起来最费时间。兜底成 `system`，与 next-themes 自己的 defaultTheme 一致。
 */
function toThemeMode(colorMode: string | undefined): ThemeMode {
  return colorMode === "light" || colorMode === "dark" || colorMode === "system" ? colorMode : "system"
}

/**
 * 把自定义配色主题的 `cssVars` 摊成 `--primary` 这样的 CSS 变量名 -> 原样字符串。
 *
 * 这是「直接映射」的输入：只有这里出现过的槽算「主题自己声明的」，
 * 其余槽由高级主题按 seed 派生补齐（用户 2026-10-05 选的 (iii)）。
 */
function themeVarsAsCssNames(theme: AppCustomTheme | null, isDark: boolean): Record<string, string> | null {
  if (!theme) return null
  // 与 applyCustomTheme 同一套取法：共享层 + 明暗层，暗色缺失时回落亮色。
  const schemeVars = isDark
    ? (theme.cssVars.dark ?? theme.cssVars.light)
    : theme.cssVars.light
  const merged = { ...normalizeThemeVars(theme.cssVars.theme), ...normalizeThemeVars(schemeVars) }
  return Object.keys(merged).length > 0 ? merged : null
}

function normalizeThemeVars(vars: Record<string, string> | undefined): Record<string, string> {
  if (!vars) return {}
  // 存储里既可能写 `primary` 也可能写 `--primary`（导入路径两种都见过），统一到 `--x`。
  return Object.fromEntries(Object.entries(vars)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([key, value]) => [key.startsWith("--") ? key : `--${key}`, value.trim()]))
}

export function WorkspaceAppearance() {
  const { theme: colorMode } = useTheme()
  const appearance = useWorkspaceShallowSelector((state) => ({
    theme: state.theme,
    themeSelections: state.themeSelections,
    customThemes: state.customThemes,
    fontPreset: state.fontPreset,
    designTheme: state.designTheme,
    tabDisplayStyle: state.tabDisplayStyle,
    switchDisplayStyle: state.switchDisplayStyle,
    scrollbarDisplayStyle: state.scrollbarDisplayStyle,
    sliderDisplayStyle: state.sliderDisplayStyle,
    choiceControlStyle: state.choiceControlStyle,
    fieldTitleStyle: state.fieldTitleStyle,
    moduleTitleStyle: state.moduleTitleStyle,
    modulePanelStyle: state.modulePanelStyle,
    resizableHandleStyle: state.resizableHandleStyle,
  }))
/**
 * 组件皮肤属性写盘：「不接管」必须写成**属性缺失**，不能写成一个值。
 *
 * 皮肤那批规则的选择器是 `:root[data-choice-control-style] [data-slot=…]` 这种**只判存在**的形式，
 * 所以 `="none"` 照样命中——「不接管」的界面其实还挂着皮肤声明。而高级主题的让位门是
 * `:not([data-choice-control-style])`，属性只要在场它就永远不生效。两边会同时以为对方在管这个控件，
 * 结果是那个控件谁都不管（2026-10-05 实测过分段控件正是这样）。
 */
function setSkinAttribute(name: "tabsStyle" | "switchStyle" | "scrollbarStyle" | "sliderStyle" | "choiceControlStyle" | "fieldTitleStyle", value: string): void {
  const root = document.documentElement
  if (value === "none") delete root.dataset[name]
  else root.dataset[name] = value
}

  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? document.documentElement.classList.contains("dark"))

  useEffect(() => {
    applyFontPreset(appearance.fontPreset)
  }, [appearance.fontPreset])

  useEffect(() => {
    setSkinAttribute("tabsStyle", appearance.tabDisplayStyle)
  }, [appearance.tabDisplayStyle])

  useEffect(() => {
    setSkinAttribute("switchStyle", appearance.switchDisplayStyle)
  }, [appearance.switchDisplayStyle])

  useEffect(() => {
    setSkinAttribute("scrollbarStyle", appearance.scrollbarDisplayStyle)
  }, [appearance.scrollbarDisplayStyle])

  useEffect(() => {
    setSkinAttribute("sliderStyle", appearance.sliderDisplayStyle)
    // Re-sync native range fill rails after skin tokens change.
    syncAllNativeRangeProgress(document)
  }, [appearance.sliderDisplayStyle])

  useEffect(() => installNativeRangeProgressSync(), [])

  useEffect(() => {
    setSkinAttribute("choiceControlStyle", appearance.choiceControlStyle)
    setSkinAttribute("fieldTitleStyle", appearance.fieldTitleStyle)
    delete document.documentElement.dataset.choiceControlLabelStyle
  }, [appearance.fieldTitleStyle, appearance.choiceControlStyle])

  useEffect(() => {
    document.documentElement.dataset.moduleTitleStyle = appearance.moduleTitleStyle
    document.documentElement.dataset.modulePanelStyle = appearance.modulePanelStyle
    document.documentElement.dataset.resizableHandleStyle = appearance.resizableHandleStyle
  }, [appearance.moduleTitleStyle, appearance.modulePanelStyle, appearance.resizableHandleStyle])

  useEffect(() => {
    const root = document.documentElement
    delete root.dataset.liquidGlass
    root.removeAttribute("rt-liquid-glass")
    root.removeAttribute("rt-liquid-glass-disable-firefox")
    root.removeAttribute("rt-liquid-glass-transition-ms")
    root.removeAttribute("rt-liquid-glass-base-bg")
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)")
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mediaQuery?.addEventListener("change", handleChange)
    return () => mediaQuery?.removeEventListener("change", handleChange)
  }, [])

  /**
   * 颜色主题落盘。抽成带依赖的回调是因为高级主题撤走自己那批变量之后，
   * 自定义主题的 inline 变量需要有人原地重写回来（inline 变量被覆盖过就没有旧值可回了）。
   */
  const applyColorTheme = useCallback(() => {
    const mode = toThemeMode(colorMode)
    const scheme = resolveThemeScheme(mode, systemDark)
    const selection = appearance.themeSelections[scheme]
    const preset = selection.kind === "preset" ? selection.name : appearance.theme
    const activeCustomTheme = selection.kind === "custom" ? getActiveCustomTheme(appearance.customThemes, selection.name) : null
    applyThemePreset(preset)
    applyCustomTheme(activeCustomTheme, scheme)
    mirrorAestivusThemeStorage(preset, mode, appearance.customThemes, activeCustomTheme)
    return scheme
  }, [appearance.theme, appearance.themeSelections, appearance.customThemes, colorMode, systemDark])

  useEffect(() => {
    applyColorTheme()
  }, [applyColorTheme])

  useEffect(() => {
    const scheme = resolveThemeScheme(toThemeMode(colorMode), systemDark)
    const config = appearance.designTheme
    // 「配色主题自己声明了哪些槽」要从 store 拿，不能读 :root 计算值：
    // 计算值里永远混着基线与预设的类规则，会让逐槽合并退化成「全部透传」。
    const selection = appearance.themeSelections[scheme]
    const declaredThemeVars = selection.kind === "custom"
      ? themeVarsAsCssNames(getActiveCustomTheme(appearance.customThemes, selection.name), scheme === "dark")
      : null
    // 「跟随当前主题的主动色」这条取色路径要在颜色主题写完之后才读得到真值。
    // 取色是**三条配方共用的能力**（md3 / 武陵 / 孤星），所以这里按 id 分流而不是只认 md3：
    // 上一版硬编码只喂 md3，于是武陵面板上「跟随当前配色主题」那一档永远读到 null、
    // 永远走 fallback —— 一个看着能选、实际不通的开关，DOM 上的 seed-fallback="true" 就是它的证词。
    const wantsActiveSeed = (config.id === "md3" && config.md3.seedSource === "activeTheme")
      || (config.id === "wuling" && config.wuling.seedSource === "activeTheme")
      || (config.id === "lonestar" && config.lonestar.seedSource === "activeTheme")
    const wantsSystemAccent = config.id === "md3" && config.md3.seedSource === "systemAccent"
    applyDesignTheme(config, {
      scheme,
      themeColorVars: declaredThemeVars,
      activeThemeSeed: wantsActiveSeed ? readRootColorVar("--primary") : null,
      systemAccentAvailable: wantsSystemAccent ? readSystemAccentColor() !== null : true,
    }, applyColorTheme)
  }, [appearance.designTheme, applyColorTheme, colorMode, systemDark])

  // 只在真正卸载时清理；重跑靠 applyDesignTheme 自己的「先撤再写」。
  // 若在依赖变化时也清理，被我们覆盖过的自定义主题 inline 值就永久丢了。
  useEffect(() => () => clearDesignTheme(), [])

  return null
}
