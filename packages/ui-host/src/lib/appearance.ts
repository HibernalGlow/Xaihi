/**
 * 主题外观系统 —— 17 个内置主题预设 + 自定义主题的完整定义与应用逻辑。
 *
 * 该模块是 Xiranite 视觉系统的核心，包含：
 * - 主题预设元数据（THEME_PRESET_OPTIONS）：内置主题的色板、来源、标签（2026-10-05 起只剩武陵）
 * - 设计配方（THEME_DESIGN_RECIPES）：每个主题对应的字体、背景模式、颗粒感等可调参数
 * - 风格画像（THEME_STYLE_PROFILES）：每个主题的密度、圆角、边框、动效等设计轴
 * - 应用函数（applyThemePreset/applyCustomTheme）：把选择写入 DOM
 * - 字体预设在隔壁模块（`@/lib/appearance-fonts`）：14 套字体组合与它的 DOM 落盘
 * - 自定义主题导入（parseImportedThemeJson）：解析 JSON 并规范化 CSS 变量
 * - Aestivus 镜像（mirrorAestivusThemeStorage）：同步主题到 Aestivus 兼容 localStorage
 *
 * 主题应用链路：用户选择 → store.setTheme → applyThemePreset 写 data 属性 +
 * applyCustomTheme 写 CSS 变量 → CSS 通过 data 属性与变量切换样式。
 */
import type { AppCustomTheme, AppFontPreset, AppTheme } from "@/types/workspace"

export type ThemePresetMode = "light" | "dark"

export type ThemeStyleFamily =
  | "spatial-product"
  | "tactical-console"
  | "jade-industrial"
  | "onlook-gradient"
  | "tori-terminal"
  | "conductor-agent-workbench"
  | "hilden-poster"
  | "aperture-cinematic-archive"
  | "noomo-3d-agency"
  | "excalidraw-sketch"
  | "astro-cosmic"
  | "svelte-editorial"
  | "bun-runtime"
  | "storybook-workshop"
  | "supabase-postgres"
  | "penpot-design-canvas"
  | "vite-dev-server"

export type ThemeDensity = "compact" | "balanced" | "comfortable"
export type ThemeRadiusProfile = "soft" | "technical" | "hard"
export type ThemeBorderTreatment = "subtle" | "outlined" | "brutalist"
export type ThemeMotionStyle = "soft" | "mechanical" | "cinematic"
export type ThemeSurfaceTreatment = "flat" | "tonal" | "glass" | "media-led"
export type ThemeDepthModel = "none" | "shadow" | "glow" | "layered"
export type ThemeNodeInteriorMode = "inherit" | "dense-controls" | "ledger-panels" | "agent-workbench" | "gallery-archive"

export interface ThemeStyleProfile {
  family: ThemeStyleFamily
  density: ThemeDensity
  radius: ThemeRadiusProfile
  border: ThemeBorderTreatment
  motion: ThemeMotionStyle
  surface: ThemeSurfaceTreatment
  depth: ThemeDepthModel
  nodeInterior: ThemeNodeInteriorMode
  referenceAxis: string[]
}

export interface ThemeDesignRecipe {
  /**
   * Store-applicable appearance settings only.
   * Higher-level website imitation axes live in THEME_STYLE_PROFILES.
   */
  fontPreset: AppFontPreset
  bgMode: "grid" | "dot-grid" | "image" | "none"
  bgOpacity?: number
  bgBlur?: number
  bgCoverTopBar?: boolean
  grainEnabled?: boolean
  vignetteDepth?: number
  grainIntensity?: number
  actionGlow?: boolean
  cardElevation?: boolean
  chromePosition?: "left" | "right" | "island"
  chromeStyle?: "default" | "traffic-light"
}

export type ThemeMode = "system" | "light" | "dark"

/**
 * 根据 ThemeMode（system/light/dark）与系统暗色偏好解析出实际的明暗方案。
 * system 模式跟随系统，light/dark 强制指定。
 */
export function resolveThemeScheme(mode: ThemeMode, systemDark: boolean): ThemePresetMode {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode
}

export type ThemeSourceKind = "internal" | "one-page-love" | "awwwards" | "public-site" | "open-source"

export interface ThemePresetSource {
  kind: ThemeSourceKind
  title: string
  url?: string
  originalUrl?: string
  repositoryUrl?: string
  evidence: string[]
  note?: string
}

export interface ThemePresetOption {
  key: AppTheme
  labelKey: string
  subtitleKey: string
  descriptionKey: string
  swatch: string
  palette: string[]
  paletteLabelKeys: string[]
  source: ThemePresetSource
}

export const AESTIVUS_THEME_NAME_BY_PRESET: Record<AppTheme, string> = {
  wuling: "Wuling"}

export const THEME_PRESET_DEFAULT_MODE: Record<AppTheme, ThemePresetMode> = {
  wuling: "light"}

export const THEME_DESIGN_RECIPES: Record<AppTheme, ThemeDesignRecipe> = {
  wuling: {
    fontPreset: "industrial",
    bgMode: "grid",
    bgCoverTopBar: false,
    grainEnabled: false,
    vignetteDepth: 0,
    grainIntensity: 0,
    actionGlow: false,
    cardElevation: false,
    chromePosition: "right",
    chromeStyle: "default",
  }}

export const THEME_STYLE_PROFILES: Record<AppTheme, ThemeStyleProfile> = {
  wuling: {
    family: "jade-industrial",
    density: "balanced",
    radius: "technical",
    border: "outlined",
    motion: "mechanical",
    surface: "tonal",
    depth: "none",
    nodeInterior: "ledger-panels",
    referenceAxis: ["jade industrial", "ledger tables", "hard outlined utility panels"],
  }}

const THEME_ROOT_CLASSES: Record<AppTheme, string> = {
  wuling: "theme-wuling",
}

/**
 * 预设的根类名只在这一张表里；组件不许自己拼 `theme-<name>`。
 *
 * 2026-10-05 删掉 16 套预设后，`WorkspaceLayout` 与 `FloatingComponentWindow` 里各有一份
 * 手抄的三元表达式，它们的 CSS 文件已经不存在而 `theme-endfield` 还在生产代码里活着——
 * 类名映射有第二份副本就会出现这种「删了一半」。
 */
export function presetThemeRootClass(theme: AppTheme): string {
  return THEME_ROOT_CLASSES[theme]
}

export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    key: "wuling",
    labelKey: "settings:themes.wuling.label",
    subtitleKey: "settings:themes.wuling.subtitle",
    descriptionKey: "settings:themes.wuling.description",
    swatch: "oklch(0.72 0.13 173)",
    palette: ["oklch(0.98 0.006 180)", "oklch(1 0 0)", "oklch(0.72 0.13 173)", "oklch(0.24 0.025 166)"],
    paletteLabelKeys: ["settings:texture.paletteLabels.bg", "settings:texture.paletteLabels.surface", "settings:texture.paletteLabels.jade", "settings:texture.paletteLabels.text"],
    source: {
      kind: "internal",
      title: "Wuling jade industrial direction",
      evidence: [],
      note: "Internal preset for hard-edged pale industrial surfaces.",
    },
  }]

let customThemeKeys = new Set<string>()

/**
 * 摘掉根上**任何**预设 class，而不是只清表里还认识的那些：2026-10-05 之后 16 套预设连文件一起
 * 没了，`THEME_ROOT_CLASSES` 里只剩武陵，靠名单清就会把 `theme-spatial` 这类退役标记留在 DOM 上。
 * 预设家族的形状是 `theme-<预设名>`，背景那几个开关用的是 `theme-bg-*`，所以负向断言排除它们。
 */
function removePresetClasses(root: HTMLElement): void {
  for (const name of [...root.classList]) {
    if (/^theme-(?!bg-)/.test(name)) root.classList.remove(name)
  }
}

/**
 * 把主题预设应用到 document root。
 *
 * 写入 data-app-theme 与 8 个风格画像 data 属性（family/density/radius/
 * border/motion/surface/depth/nodeInterior），并切换 THEME_ROOT_CLASSES
 * 中的根类名。CSS 通过这些 data 属性选择对应的样式集。
 */
export function applyThemePreset(theme: AppTheme): void {
  if (typeof document === "undefined") return

  const root = document.documentElement
  const profile = THEME_STYLE_PROFILES[theme]
  root.dataset.appTheme = theme
  root.dataset.themeFamily = profile.family
  root.dataset.themeDensity = profile.density
  root.dataset.themeRadius = profile.radius
  root.dataset.themeBorder = profile.border
  root.dataset.themeMotion = profile.motion
  root.dataset.themeSurface = profile.surface
  root.dataset.themeDepth = profile.depth
  root.dataset.themeNodeInterior = profile.nodeInterior
  removePresetClasses(root)
  root.classList.add(THEME_ROOT_CLASSES[theme])
}

/**
 * 应用自定义主题到 document root。
 *
 * 流程：
 * 1. 清理上一次 applyCustomTheme 写入的所有 CSS 变量（customThemeKeys 追踪）
 * 2. customTheme 为 null 时恢复内置主题（重新添加 THEME_ROOT_CLASSES）
 * 3. 否则根据 mode 选择 light/dark CSS 变量集，规范化后写入 root.style
 * 4. 调用 deriveCustomThemeVars 派生未显式提供的变量（secondary/muted/border 等）
 *
 * 自定义主题会覆盖内置主题的 CSS 变量，但 data-app-theme 属性仍保留，
 * 便于 CSS 中通过 [data-custom-theme="enabled"] 选择器做额外适配。
 */
export function applyCustomTheme(customTheme: AppCustomTheme | null, mode: ThemeMode): void {
  if (typeof document === "undefined") return

  const root = document.documentElement
  for (const key of customThemeKeys) {
    root.style.removeProperty(`--${key}`)
  }
  customThemeKeys = new Set()

  if (!customTheme) {
    root.removeAttribute("data-custom-theme")
    root.removeAttribute("data-custom-theme-name")
    root.removeAttribute("data-theme-visual-source")
    const appTheme = root.dataset.appTheme as AppTheme | undefined
    removePresetClasses(root)
    if (appTheme && THEME_ROOT_CLASSES[appTheme]) {
      root.classList.add(THEME_ROOT_CLASSES[appTheme])
    }
    return
  }

  const isDark = mode === "dark" || (mode === "system" && root.classList.contains("dark"))
  const selectedVars = isDark ? (customTheme.cssVars.dark ?? customTheme.cssVars.light) : customTheme.cssVars.light
  const cssVars = {
    ...(customTheme.cssVars.theme ?? {}),
    ...selectedVars,
  }
  const normalizedCssVars = Object.fromEntries(
    Object.entries(cssVars)
      .map(([key, value]) => {
        const cssVarName = normalizeCssVarName(key)
        return [cssVarName, normalizeCssVarValue(cssVarName, value)] as const
      })
      .filter((entry): entry is [string, string] => Boolean(entry[0])),
  )
  const derivedCssVars = deriveCustomThemeVars(normalizedCssVars)

  root.setAttribute("data-custom-theme", "enabled")
  root.setAttribute("data-theme-visual-source", "custom")
  root.dataset.customThemeName = customTheme.name
  removePresetClasses(root)
  for (const [cssVarName, value] of Object.entries({
    ...normalizedCssVars,
    ...derivedCssVars,
  })) {
    root.style.setProperty(`--${cssVarName}`, value)
    customThemeKeys.add(cssVarName)
  }
}

/**
 * 从用户提供的少量 CSS 变量派生出完整的变量集。
 *
 * 用户通常只提供 background/foreground/primary/card 等核心变量，
 * secondary/muted/accent/border 等衍生变量通过 color-mix 计算。
 * 同时派生 node-* 系列变量（node-surface-bg/node-panel-bg 等），
 * 保证自定义主题下节点卡片也有协调的配色。
 */
function deriveCustomThemeVars(cssVars: Record<string, string>): Record<string, string> {
  const background = cssVars.background ?? "var(--background)"
  const foreground = cssVars.foreground ?? "var(--foreground)"
  const card = cssVars.card ?? background
  const cardForeground = cssVars["card-foreground"] ?? foreground
  const primary = cssVars.primary ?? foreground
  const primaryForeground = cssVars["primary-foreground"] ?? background
  const secondary = cssVars.secondary ?? `color-mix(in oklch, ${primary} 10%, ${background})`
  const secondaryForeground = cssVars["secondary-foreground"] ?? foreground
  const muted = cssVars.muted ?? `color-mix(in oklch, ${card} 82%, ${background})`
  const mutedForeground = cssVars["muted-foreground"] ?? `color-mix(in oklch, ${foreground} 62%, ${background})`
  const accent = cssVars.accent ?? `color-mix(in oklch, ${primary} 18%, ${card})`
  const accentForeground = cssVars["accent-foreground"] ?? foreground
  const border = cssVars.border ?? `color-mix(in oklch, ${primary} 30%, ${background})`
  const input = cssVars.input ?? border
  const ring = cssVars.ring ?? primary
  const popover = cssVars.popover ?? `color-mix(in oklch, ${card} 94%, ${background})`
  const popoverForeground = cssVars["popover-foreground"] ?? cardForeground

  return {
    secondary,
    "secondary-foreground": secondaryForeground,
    muted,
    "muted-foreground": mutedForeground,
    accent,
    "accent-foreground": accentForeground,
    border,
    input,
    ring,
    popover,
    "popover-foreground": popoverForeground,
    sidebar: cssVars.sidebar ?? card,
    "sidebar-foreground": cssVars["sidebar-foreground"] ?? cardForeground,
    "sidebar-primary": cssVars["sidebar-primary"] ?? primary,
    "sidebar-primary-foreground": cssVars["sidebar-primary-foreground"] ?? primaryForeground,
    "sidebar-accent": cssVars["sidebar-accent"] ?? accent,
    "sidebar-accent-foreground": cssVars["sidebar-accent-foreground"] ?? accentForeground,
    "sidebar-border": cssVars["sidebar-border"] ?? border,
    "sidebar-ring": cssVars["sidebar-ring"] ?? ring,
    "ws-canvas": cssVars["ws-canvas"] ?? background,
    "ws-grid-color": cssVars["ws-grid-color"] ?? `color-mix(in oklch, ${primary} 24%, transparent)`,
    "ws-accent-glow": cssVars["ws-accent-glow"] ?? `color-mix(in oklch, ${primary} 24%, transparent)`,
    "ws-focused-overlay": cssVars["ws-focused-overlay"] ?? `color-mix(in oklch, ${background} 72%, transparent)`,
    "node-surface-bg": cssVars["node-surface-bg"] ?? card,
    "node-surface-fg": cssVars["node-surface-fg"] ?? cardForeground,
    "node-panel-bg": cssVars["node-panel-bg"] ?? `color-mix(in oklch, ${card} 88%, ${background})`,
    "node-panel-fg": cssVars["node-panel-fg"] ?? cardForeground,
    "node-panel-border": cssVars["node-panel-border"] ?? border,
    "node-panel-shadow": cssVars["node-panel-shadow"] ?? `0 18px 50px -36px color-mix(in oklch, ${foreground} 42%, transparent)`,
    "node-control-bg": cssVars["node-control-bg"] ?? `color-mix(in oklch, ${background} 76%, ${card})`,
    "node-control-bg-hover": cssVars["node-control-bg-hover"] ?? accent,
    "node-control-fg": cssVars["node-control-fg"] ?? foreground,
    "node-control-border": cssVars["node-control-border"] ?? input,
    "node-input-bg": cssVars["node-input-bg"] ?? `color-mix(in oklch, ${background} 84%, ${card})`,
    "node-code-bg": cssVars["node-code-bg"] ?? muted,
    "node-divider": cssVars["node-divider"] ?? `color-mix(in oklch, ${border} 76%, transparent)`,
    "node-media-frame-bg": cssVars["node-media-frame-bg"] ?? card,
    "node-media-frame-border": cssVars["node-media-frame-border"] ?? border,
    "node-media-caption-fg": cssVars["node-media-caption-fg"] ?? mutedForeground,
    "node-focus-ring": cssVars["node-focus-ring"] ?? ring,
    "node-chrome-bg": cssVars["node-chrome-bg"] ?? `color-mix(in oklch, ${primary} 16%, ${card})`,
    "node-chrome-fg": cssVars["node-chrome-fg"] ?? foreground,
    "node-chrome-border": cssVars["node-chrome-border"] ?? `color-mix(in oklch, ${primary} 44%, ${border})`,
    "node-chrome-accent": cssVars["node-chrome-accent"] ?? primary,
  }
}

/**
 * 解析导入的主题 JSON 字符串，返回去重后的 AppCustomTheme 数组。
 *
 * 支持多种 JSON 结构：
 * - 单个主题对象（含 cssVars 或 colors 字段）
 * - 主题数组
 * - 包含 items/themes/presets 字段的对象
 * - 以主题名为 key 的字典
 *
 * 至少需要 cssVars.light 或 colors.light，否则抛错。
 */
export function parseImportedThemeJson(jsonString: string): AppCustomTheme[] {
  const parsed = JSON.parse(jsonString) as unknown
  const themes = collectThemeRecords(parsed)

  if (themes.length > 0) return dedupeThemesByName(themes)

  throw new Error("Theme JSON must include cssVars.light or colors.light.")
}

function collectThemeRecords(value: unknown, fallbackName?: string): AppCustomTheme[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectThemeRecords(item))
  }

  const theme = parseThemeRecord(value, fallbackName)
  if (theme) return [theme]

  if (!isRecord(value)) return []

  for (const key of ["items", "themes", "presets"] as const) {
    if (Array.isArray(value[key])) {
      return collectThemeRecords(value[key])
    }
  }

  const themes: AppCustomTheme[] = []
  for (const [key, entryValue] of Object.entries(value)) {
    if (!isRecord(entryValue)) continue
    themes.push(...collectThemeRecords(entryValue, key))
  }
  return themes
}

function parseThemeRecord(value: unknown, fallbackName?: string): AppCustomTheme | null {
  if (!isRecord(value)) return null

  const explicitName = [value.name, value.label, value.title]
    .find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
  const name = explicitName?.trim() ?? fallbackName ?? "Imported"
  const description = typeof value.description === "string" ? value.description : undefined

  if (isRecord(value.cssVars)) {
    const light = stringRecord(value.cssVars.light)
    if (!light) return null

    return {
      name,
      description,
      cssVars: {
        theme: stringRecord(value.cssVars.theme) ?? undefined,
        light,
        dark: stringRecord(value.cssVars.dark) ?? undefined,
      },
    }
  }

  if (isRecord(value.colors)) {
    const light = stringRecord(value.colors.light)
    if (!light) return null

    return {
      name,
      description,
      cssVars: {
        light,
        dark: stringRecord(value.colors.dark) ?? undefined,
      },
    }
  }

  return null
}

/**
 * 把当前主题选择镜像到 Aestivus 兼容的 localStorage 键。
 *
 * Aestivus 是 Xiranite 的前身/兼容产品，通过共享 localStorage 键
 * （theme-name / theme-mode / custom-themes）实现两者主题同步。
 * 自定义主题会转换为 Aestivus 的 colors 格式（而非 cssVars）。
 */
export function mirrorAestivusThemeStorage(theme: AppTheme, mode: ThemeMode, customThemes: AppCustomTheme[] = [], activeTheme?: AppCustomTheme | null): void {
  if (typeof localStorage === "undefined") return

  localStorage.setItem("theme-name", activeTheme?.name ?? AESTIVUS_THEME_NAME_BY_PRESET[theme])
  localStorage.setItem("theme-mode", mode)

  if (customThemes.length > 0) {
    const aestivusThemes = customThemes.map((customTheme) => ({
      name: customTheme.name,
      description: customTheme.description ?? "Imported theme",
      colors: {
        light: customTheme.cssVars.light,
        dark: customTheme.cssVars.dark ?? customTheme.cssVars.light,
      },
    }))
    localStorage.setItem("custom-themes", JSON.stringify(aestivusThemes))
  } else {
    localStorage.removeItem("custom-themes")
  }
}

/** 按名称查找激活的自定义主题，找不到返回 null。 */
export function getActiveCustomTheme(customThemes: AppCustomTheme[], activeThemeName: string | null): AppCustomTheme | null {
  if (!activeThemeName) return null
  return customThemes.find((theme) => theme.name === activeThemeName) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null

  const entries = Object.entries(value)
    .map(([key, entryValue]) => {
      const cssVarName = normalizeCssVarName(key)
      return [cssVarName, typeof entryValue === "string" ? normalizeCssVarValue(cssVarName, entryValue) : entryValue] as const
    })
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string")
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function normalizeCssVarName(key: string): string {
  return key.trim().replace(/^--/, "")
}

function normalizeCssVarValue(key: string, value: string): string {
  const trimmed = value.trim()
  if (!isColorCssVar(key) || isCompleteCssColorValue(trimmed)) return trimmed

  if (/^-?\d*\.?\d+(?:deg|rad|turn)?\s+-?\d*\.?\d+%\s+-?\d*\.?\d+%(?:\s*\/\s*-?\d*\.?\d+%?)?$/i.test(trimmed)) {
    return `hsl(${trimmed})`
  }

  return trimmed
}

function isCompleteCssColorValue(value: string): boolean {
  return /^(?:transparent|currentColor|inherit|initial|unset|#[\da-f]{3,8}|(?:oklch|oklab|hsl|hsla|rgb|rgba|lab|lch|color|color-mix|light-dark|var)\()/i.test(value)
}

function isColorCssVar(key: string): boolean {
  return (
    key === "background" ||
    key === "foreground" ||
    key === "card" ||
    key === "card-foreground" ||
    key === "popover" ||
    key === "popover-foreground" ||
    key === "primary" ||
    key === "primary-foreground" ||
    key === "secondary" ||
    key === "secondary-foreground" ||
    key === "muted" ||
    key === "muted-foreground" ||
    key === "accent" ||
    key === "accent-foreground" ||
    key === "destructive" ||
    key === "destructive-foreground" ||
    key === "border" ||
    key === "input" ||
    key === "ring" ||
    key === "sidebar" ||
    key === "sidebar-foreground" ||
    key === "sidebar-primary" ||
    key === "sidebar-primary-foreground" ||
    key === "sidebar-accent" ||
    key === "sidebar-accent-foreground" ||
    key === "sidebar-border" ||
    key === "sidebar-ring" ||
    key.startsWith("chart-") ||
    key.startsWith("badge-") ||
    key.startsWith("ws-") ||
    key.startsWith("node-")
  )
}

function dedupeThemesByName(themes: AppCustomTheme[]): AppCustomTheme[] {
  const map = new Map<string, AppCustomTheme>()
  for (const theme of themes) {
    map.set(theme.name, theme)
  }
  return [...map.values()]
}
