/**
 * 工作台自身设置的同步器（无渲染）。
 *
 * 三段各一条通路，**都只走这一份文档的桥**（2026-10-07 使用者口径"不再使用 rest 架构通信，
 * 一切都走 DSH 插件标准"）：
 *
 * | 段 | 内容 | 落点 |
 * |---|---|---|
 * | `ui` | `AppUiConfig`（布局偏好 / 明暗 / 语言 / 迁移来源） | `xaihi-core.appUi.ui` |
 * | `themes` | 自定义主题表 | `xaihi-core.appUi.themes` |
 * | `bgImage` | 背景图 URL（data: 那种大对象由体积闸拦下） | `xaihi-core.appUi.bgImage` |
 *
 * 过去这三段打在 Xiranite 自己的 HTTP 后端上（`/config/app/*`、`/config/themes`、
 * `/config/bg-image`），而那份后端在本仓不存在：门（`useLocalBackendStatus()`）永远是
 * "没有配置"，于是**设置改了刷新就没了，界面上还一句话读不到**。今天门换成"桥接通了没有"
 * （`useBridgeReady`），落在 `src/backend/appConfigSections.ts` 那一条载体上。
 *
 * 每段的纪律原样保留：先加载 → `loadedRef` 置位 → 之后的变化才回写（防抖 600ms），
 * 迁移与补齐的写都**不许**吃掉已经落好的设置（各自 catch 并 warn）。
 *
 * @module xaihi-ui/components/workspace/AppConfigSync
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  APP_CONFIG_BG_IMAGE_SECTION,
  APP_CONFIG_THEMES_SECTION,
  APP_CONFIG_UI_SECTION,
  createBridgeAppConfigCarrier,
} from "@/backend/appConfigSections"
import { useBridgeReady, useDocumentBridge } from "@/document/bridge-context"
import { getActiveCustomTheme, mirrorAestivusThemeStorage, parseImportedThemeJson, type ThemeMode } from "@/lib/appearance"
import { FONT_PRESETS } from "@/lib/appearance-fonts"
import { normalizeDesignThemeConfig } from "@/lib/design-theme/contract"
import { normalizePersistedBackgroundImageUrl, sanitizePersistedBackgroundImageUrl, shrinkStoredBackgroundImageUrl } from "@/lib/backgroundImage"
import { useTheme } from "@/components/use-theme"
import { changeLanguage, getCurrentLanguage, type Language } from "@/i18n"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { OverlayFloatingMetrics, WorkspaceUiPreferences } from "@/store/workspace/types"
import type { AppCustomTheme, AppFontPreset, AppTheme, CardLayout } from "@/types/workspace"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { createLogger } from "@/lib/logger"
import { normalizeChromeActionOrder, normalizeChromeHiddenActions } from "./chromeActionPreferences"
import { clampWheelPitch, clampWheelRadius } from "@/actions/wheelPreferences"

const logger = createLogger("config.sync")

const APP_UI_CONFIG_VERSION = 4
const WORKSPACE_UI_STORAGE_KEY = "xiranite-workspace-ui"
const THEME_STORAGE_KEY = "theme"
const AESTIVUS_THEME_NAME_STORAGE_KEY = "theme-name"
const AESTIVUS_THEME_MODE_STORAGE_KEY = "theme-mode"
const AESTIVUS_CUSTOM_THEMES_STORAGE_KEY = "custom-themes"
const I18N_STORAGE_KEY = "i18n.lang"
const LEGACY_CONFIG_CHANGED_EVENT = "xiranite:legacy-config-changed"

interface AppUiConfig {
  version?: number
  workspace?: Partial<WorkspaceUiPreferences>
  appearance?: {
    colorMode?: ThemeMode
  }
  i18n?: {
    language?: Language
  }
  migratedFrom?: {
    localStorageKeys?: string[]
    at?: string
  }
}

type BrowserLegacyConfig = Pick<AppUiConfig, "migratedFrom"> & {
  workspace?: Partial<WorkspaceUiPreferences>
  appearance?: AppUiConfig["appearance"]
  i18n?: AppUiConfig["i18n"]
  hasWorkspaceStore?: boolean
}

// 2026-10-05：其余 16 套内置预设整批出局，只留武陵。持久化里读到退役的名字时，
// `isOneOf` 会把它整条丢掉，store 落回默认（也是武陵）——不会出现「选了个不存在的主题」的空洞。
const APP_THEMES = new Set<AppTheme>(["wuling"])
const FONT_PRESET_KEYS = new Set<AppFontPreset>(FONT_PRESETS.map((preset) => preset.key))
const CARD_LAYOUTS = new Set<CardLayout>(["grid", "stack", "split", "focus"])
const BG_MODES = new Set<WorkspaceUiPreferences["bgMode"]>(["grid", "dot-grid", "image", "none"])
const CHROME_POSITIONS = new Set<WorkspaceUiPreferences["chromePosition"]>(["left", "right", "island"])
const CHROME_STYLES = new Set<WorkspaceUiPreferences["chromeStyle"]>(["default", "traffic-light"])
const FLOATING_WINDOW_CAPTION_POSITIONS = new Set<WorkspaceUiPreferences["floatingWindowCaptionPosition"]>(["left", "island", "right"])
const FLOATING_WINDOW_CAPTION_STYLES = new Set<WorkspaceUiPreferences["floatingWindowCaptionStyle"]>(["windows", "capsule", "traffic-light"])
const ALPHABET_INDEX_STYLES = new Set<WorkspaceUiPreferences["alphabetIndexStyle"]>(["glass", "solid", "minimal"])
const MODULE_TITLE_STYLES = new Set<WorkspaceUiPreferences["moduleTitleStyle"]>(["legend", "inline", "bar", "minimal"])
const MODULE_PANEL_STYLES = new Set<WorkspaceUiPreferences["modulePanelStyle"]>(["soft", "solid", "outline", "flat"])
const RESIZABLE_HANDLE_STYLES = new Set<WorkspaceUiPreferences["resizableHandleStyle"]>(["grip", "dots", "line", "minimal"])
const CHOICE_CONTROL_STYLES = new Set<WorkspaceUiPreferences["choiceControlStyle"]>(["segmented", "pills", "tabs", "tiles", "none"])
const FIELD_TITLE_STYLES = new Set<WorkspaceUiPreferences["fieldTitleStyle"]>(["stacked", "legend", "inline", "hidden", "none"])
const CARD_CLICK_ACTIONS = new Set<WorkspaceUiPreferences["cardClickAction"]>(["none", "focus", "fullscreen"])
const TAB_DISPLAY_STYLES = new Set<WorkspaceUiPreferences["tabDisplayStyle"]>(["underline", "surface", "pill", "boxed", "quiet", "none"])
const SWITCH_DISPLAY_STYLES = new Set<WorkspaceUiPreferences["switchDisplayStyle"]>(["outlined", "filled", "minimal", "none"])
const SCROLLBAR_DISPLAY_STYLES = new Set<WorkspaceUiPreferences["scrollbarDisplayStyle"]>(["thin", "soft", "solid", "rounded", "minimal", "none"])
const SLIDER_DISPLAY_STYLES = new Set<WorkspaceUiPreferences["sliderDisplayStyle"]>(["solid", "soft", "pill", "line", "minimal", "none"])
const THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"])
const LANGUAGES = new Set<Language>(["en", "zh"])
const OVERLAY_MODES = new Set<WorkspaceUiPreferences["overlayMode"]>(["docked", "floating"])

export function AppConfigSync() {
  const bridge = useDocumentBridge()
  const bridgeReady = useBridgeReady(bridge)
  const workspaceActions = useWorkspaceActions()
  const workspace = useWorkspaceShallowSelector(selectWorkspaceUiPreferences)
  const { theme, setTheme } = useTheme()
  const { i18n } = useTranslation()
  const colorMode = isThemeMode(theme) ? theme : "system"
  const language = getCurrentLanguage()
  const loadedRef = useRef(false)
  const applyingRef = useRef(false)
  const lastSavedKeyRef = useRef("")
  const migratedFromRef = useRef<AppUiConfig["migratedFrom"] | undefined>(undefined)
  const themesLoadedRef = useRef(false)
  const themesApplyingRef = useRef(false)
  const lastSavedThemesKeyRef = useRef("")
  const bgImageLoadedRef = useRef(false)
  const bgImageApplyingRef = useRef(false)
  const lastSavedBgImageKeyRef = useRef("")
  const [legacyVersion, setLegacyVersion] = useState(0)
  const currentRef = useRef({ workspace, colorMode, language })
  const syncActionsRef = useRef({ workspaceActions, setTheme })

  currentRef.current = { workspace, colorMode, language }
  syncActionsRef.current = { workspaceActions, setTheme }

  /**
   * 这三段的对面只有一条桥，所以门就是"桥接通了没有"。
   *
   * 值过去是"后端地址指纹"（`localBackendConnectionKey`），后端换了就整段重载一遍；
   * 一条桥在文档的一生里只建一次，这个门能取的值因此就是"有 / 没有"。
   * 下面四处 effect 都拿它当门与依赖：`null` 时不读也不写，界面上那几段保持 store 里的现值。
   */
  const carrier = useMemo(
    () => (bridge === null || !bridgeReady ? null : createBridgeAppConfigCarrier(bridge)),
    [bridge, bridgeReady],
  )

  useEffect(() => {
    if (carrier === null) return
    // 收窄后取一份局部的：嵌在 effect 里的函数闭包读不到 `carrier` 上的收窄（CFA 不跨函数边界）。
    const host = carrier

    let cancelled = false
    loadedRef.current = false
    applyingRef.current = false
    lastSavedKeyRef.current = ""

    async function loadAppConfig() {
      try {
        startupDebug("config:app-ui:load:begin")
        if (cancelled) return
        const stored = await startupDebugAsync("config:app-ui:request", () => host.read(APP_CONFIG_UI_SECTION))
        if (cancelled) return

        const normalizedResponse = normalizeAppUiConfig(stored)
        if (isEmptyAppUiConfig(normalizedResponse)) {
          const legacy = readBrowserLegacyConfig()
          const workspace = legacy.hasWorkspaceStore
            ? currentRef.current.workspace
            : {
              ...currentRef.current.workspace,
              ...legacy.workspace,
            }
          const migrated = buildAppUiConfig(
            workspace,
            legacy.appearance?.colorMode ?? currentRef.current.colorMode,
            legacy.i18n?.language ?? currentRef.current.language,
            legacy,
            legacy.migratedFrom,
          )
          applyingRef.current = true
          startupDebug("config:app-ui:apply-migrated:begin")
          applyAppUiConfig(
            migrated,
            syncActionsRef.current.workspaceActions,
            syncActionsRef.current.setTheme,
          )
          startupDebug("config:app-ui:apply-migrated:end")
          migratedFromRef.current = migrated.migratedFrom
          lastSavedKeyRef.current = stableStringify(migrated)
          loadedRef.current = true
          queueMicrotask(() => {
            applyingRef.current = false
          })
          // 回写在应用之后，并且不许决定应用有没有发生过 —— 这也是那份 `void` 的理由：
          // 这次写只是把刚迁移出来的那份**顺手存回去**，界面上的设置已经生效了。
          // 一条写不回去的迁移（`config` 组没被授予、超预算、设置面缺席）只该在控制台留一句，
          // 不该把整份 app.ui（含 fontPreset）挡在 store 外面。
          void host.write(APP_CONFIG_UI_SECTION, migrated).catch((error) => {
            logger.warn("App UI migration save failed", error)
          })
          return
        }

        const existing = mergeMissingWorkspacePreferences(
          normalizedResponse,
          currentRef.current.workspace,
        )

        migratedFromRef.current = existing.migratedFrom
        // Older app.ui files did not contain every workspace preference. The
        // current Zustand store carries the legacy values, so backfill only
        // absent fields once and never replace a saved shared setting.
        const needsBackfillSave = stableStringify(existing) !== stableStringify(normalizedResponse)
        applyingRef.current = true
        startupDebug("config:app-ui:apply-existing:begin")
        applyAppUiConfig(
          existing,
          syncActionsRef.current.workspaceActions,
          syncActionsRef.current.setTheme,
        )
        startupDebug("config:app-ui:apply-existing:end")
        lastSavedKeyRef.current = stableStringify(buildAppUiConfig(
          {
            ...currentRef.current.workspace,
            ...existing.workspace,
          },
          existing.appearance?.colorMode ?? currentRef.current.colorMode,
          existing.i18n?.language ?? currentRef.current.language,
          readBrowserLegacyConfig(),
          migratedFromRef.current,
        ))
        loadedRef.current = true
        startupDebug("config:app-ui:load:end")
        queueMicrotask(() => {
          applyingRef.current = false
        })
        if (needsBackfillSave) {
          // 补齐缺失字段只是顺手把文件写全，它失败也不许吃掉上面已经落好的设置。
          void host.write(APP_CONFIG_UI_SECTION, existing).catch((error) => {
            logger.warn("App UI backfill save failed", error)
          })
        }
      } catch (error) {
        logger.warn("App UI sync failed", error)
      }
    }

    void loadAppConfig()

    return () => {
      cancelled = true
    }
  }, [carrier])

  // 自定义主题是同一格里的另一段（`xaihi-core.appUi.themes`），单独加载 / 单独回写
  useEffect(() => {
    if (carrier === null) return
    // 收窄后取一份局部的：嵌在 effect 里的函数闭包读不到 `carrier` 上的收窄（CFA 不跨函数边界）。
    const host = carrier

    let cancelled = false
    themesLoadedRef.current = false
    themesApplyingRef.current = false
    lastSavedThemesKeyRef.current = ""

    async function loadCustomThemes() {
      try {
        startupDebug("config:themes:load:begin")
        const stored = await startupDebugAsync("config:themes:request", () => host.read(APP_CONFIG_THEMES_SECTION))
        if (cancelled) return
        const themes = Array.isArray(stored) ? stored.filter(isCustomTheme) : []
        themesApplyingRef.current = true
        syncActionsRef.current.workspaceActions.setCustomThemes(themes)
        lastSavedThemesKeyRef.current = stableStringify(themes)
        themesLoadedRef.current = true
        startupDebug("config:themes:load:end", { count: themes.length })
        queueMicrotask(() => {
          themesApplyingRef.current = false
        })
      } catch (error) {
        logger.warn("Custom themes sync failed", error)
      }
    }

    void loadCustomThemes()

    return () => {
      cancelled = true
    }
  }, [carrier])

  // 自定义主题的回写（同上一段的落点；两段各自防抖，互不牵连）
  const customThemesKey = useMemo(
    () => stableStringify(workspace.customThemes),
    [workspace.customThemes],
  )

  useEffect(() => {
    if (carrier === null || !themesLoadedRef.current || themesApplyingRef.current) return
    const host = carrier
    if (customThemesKey === lastSavedThemesKeyRef.current) return

    const timer = window.setTimeout(() => {
      const themes = currentRef.current.workspace.customThemes
      const nextKey = stableStringify(themes)
      if (nextKey === lastSavedThemesKeyRef.current) return

      host.write(APP_CONFIG_THEMES_SECTION, themes)
        .then(() => {
          lastSavedThemesKeyRef.current = nextKey
        })
        .catch((error) => {
          logger.warn("Custom themes save failed", error)
        })
    }, 600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [carrier, customThemesKey])

  // 背景图是同一格里第三段（`xaihi-core.appUi.bgImage`）；data: URL 不写进 `ui` 那一段
  useEffect(() => {
    if (carrier === null) return
    // 收窄后取一份局部的：嵌在 effect 里的函数闭包读不到 `carrier` 上的收窄（CFA 不跨函数边界）。
    const host = carrier

    let cancelled = false
    bgImageLoadedRef.current = false
    bgImageApplyingRef.current = false
    lastSavedBgImageKeyRef.current = ""

    async function loadBgImage() {
      try {
        startupDebug("config:bg-image:load:begin")
        const stored = await startupDebugAsync("config:bg-image:request", () => host.read(APP_CONFIG_BG_IMAGE_SECTION))
        if (cancelled) return
        const storedUrl = typeof stored === "string" ? stored : ""
        if (storedUrl) {
          // 存的那一格可能放着一张未压缩的超大 data URL：原样灌进 store 与 CSS 就是爆内存那条路，
          // 先压回体积上限以内再应用，并把压缩结果写回去。
          const safeUrl = await startupDebugAsync("config:bg-image:shrink", () => shrinkStoredBackgroundImageUrl(storedUrl))
          if (cancelled) return
          bgImageApplyingRef.current = true
          syncActionsRef.current.workspaceActions.setBgImageUrl(safeUrl)
          lastSavedBgImageKeyRef.current = safeUrl
          queueMicrotask(() => {
            bgImageApplyingRef.current = false
          })
          if (safeUrl !== storedUrl) {
            await host.write(APP_CONFIG_BG_IMAGE_SECTION, safeUrl).catch((error) => {
              logger.warn("Background image shrink write-back failed", error)
            })
          }
        }
        startupDebug("config:bg-image:load:end", { hasImage: Boolean(storedUrl) })
      } catch (error) {
        logger.warn("Background image sync failed", error)
      } finally {
        bgImageLoadedRef.current = true
      }
    }

    void loadBgImage()

    return () => {
      cancelled = true
    }
  }, [carrier])

  // 背景图的回写（data: URL 那一支会被 `appConfigSections.ts` 的体积闸拦下，见那个文件的头注释）
  const bgImageUrl = workspace.bgImageUrl
  const isBgImageDataUrl = bgImageUrl.startsWith("data:")
  const bgImageSyncKey = isBgImageDataUrl ? bgImageUrl : ""

  useEffect(() => {
    if (carrier === null || !bgImageLoadedRef.current || bgImageApplyingRef.current) return
    const host = carrier
    if (bgImageSyncKey === lastSavedBgImageKeyRef.current) return

    const timer = window.setTimeout(() => {
      const currentUrl = currentRef.current.workspace.bgImageUrl
      const currentIsDataUrl = currentUrl.startsWith("data:")

      // data: URL → 存进这一格
      if (currentIsDataUrl) {
        if (currentUrl === lastSavedBgImageKeyRef.current) return
        host.write(APP_CONFIG_BG_IMAGE_SECTION, currentUrl)
          .then(() => {
            lastSavedBgImageKeyRef.current = currentUrl
          })
          .catch((error) => {
            logger.warn("Background image save failed", error)
          })
        return
      }

      // 非 data: URL → 清空这一格里旧的 data: URL
      if (lastSavedBgImageKeyRef.current) {
        host.write(APP_CONFIG_BG_IMAGE_SECTION, null)
          .then(() => {
            lastSavedBgImageKeyRef.current = ""
          })
          .catch((error) => {
            logger.warn("Background image clear failed", error)
          })
      }
    }, 600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [carrier, bgImageSyncKey, isBgImageDataUrl])

  useEffect(() => {
    const refreshLegacyConfig = () => {
      setLegacyVersion((version) => version + 1)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key) return
      if (isLegacyConfigStorageKey(event.key)) refreshLegacyConfig()
    }

    window.addEventListener(LEGACY_CONFIG_CHANGED_EVENT, refreshLegacyConfig)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(LEGACY_CONFIG_CHANGED_EVENT, refreshLegacyConfig)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const configKey = useMemo(
    () => stableStringify(buildAppUiConfig(
      workspace,
      colorMode,
      language,
      readBrowserLegacyConfig(),
      migratedFromRef.current,
    )),
    [workspace, colorMode, language, i18n.language, legacyVersion],
  )

  useEffect(() => {
    if (carrier === null || !loadedRef.current || applyingRef.current) return
    const host = carrier
    if (configKey === lastSavedKeyRef.current) return

    const timer = window.setTimeout(() => {
      const nextConfig = buildAppUiConfig(
        currentRef.current.workspace,
        currentRef.current.colorMode,
        currentRef.current.language,
        readBrowserLegacyConfig(),
        migratedFromRef.current,
      )
      const nextKey = stableStringify(nextConfig)
      if (nextKey === lastSavedKeyRef.current) return

      host.write(APP_CONFIG_UI_SECTION, nextConfig)
        .then(() => {
          lastSavedKeyRef.current = nextKey
        })
        .catch((error) => {
          logger.warn("App UI save failed", error)
        })
    }, 600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [carrier, configKey])

  return null
}

export function selectWorkspaceUiPreferences(state: WorkspaceUiPreferences): WorkspaceUiPreferences {
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
    moduleTitleStyle: state.moduleTitleStyle,
    modulePanelStyle: state.modulePanelStyle,
    resizableHandleStyle: state.resizableHandleStyle,
    restoreWorkspaceComponents: state.restoreWorkspaceComponents,
    choiceControlStyle: state.choiceControlStyle,
    fieldTitleStyle: state.fieldTitleStyle,
  }
}

function buildAppUiConfig(
  workspace: WorkspaceUiPreferences,
  colorMode: ThemeMode,
  language: Language,
  legacy: Pick<AppUiConfig, "migratedFrom">,
  migratedFrom?: AppUiConfig["migratedFrom"],
): AppUiConfig {
  return pruneUndefined({
    version: APP_UI_CONFIG_VERSION,
    workspace: sanitizeWorkspaceConfig(workspace),
    appearance: { colorMode },
    i18n: { language },
    migratedFrom,
  }) as AppUiConfig
}

function applyAppUiConfig(
  config: AppUiConfig,
  workspaceActions: ReturnType<typeof useWorkspaceActions>,
  setTheme: (theme: ThemeMode) => void,
) {
  if (config.workspace) {
    workspaceActions.hydrateUiPreferences(config.workspace)
  }
  if (config.appearance?.colorMode && isThemeMode(config.appearance.colorMode)) {
    setTheme(config.appearance.colorMode)
  }
  if (config.i18n?.language && config.i18n.language !== getCurrentLanguage()) {
    void changeLanguage(config.i18n.language)
  }
  writeBrowserLegacyConfig(config)
}

function normalizeAppUiConfig(value: unknown): AppUiConfig {
  if (!isRecord(value)) return {}
  return pruneUndefined({
    version: typeof value.version === "number" ? value.version : undefined,
    workspace: normalizeWorkspacePreferences(value.workspace),
    appearance: normalizeAppearanceConfig(value.appearance),
    i18n: normalizeI18nConfig(value.i18n),
    migratedFrom: isRecord(value.migratedFrom) ? value.migratedFrom : undefined,
  }) as AppUiConfig
}

function normalizeWorkspacePreferences(value: unknown): Partial<WorkspaceUiPreferences> | undefined {
  if (!isRecord(value)) return undefined
  const next: Partial<WorkspaceUiPreferences> = {}
  if (isOneOf(value.theme, APP_THEMES)) next.theme = value.theme
  {
    const light = normalizeThemeSelection(isRecord(value.themeSelections) ? value.themeSelections.light : undefined)
    const dark = normalizeThemeSelection(isRecord(value.themeSelections) ? value.themeSelections.dark : undefined)
    if (light && dark) next.themeSelections = { light, dark }
  }
  if (typeof value.activeCustomThemeName === "string" || value.activeCustomThemeName === null) next.activeCustomThemeName = value.activeCustomThemeName
  if (isOneOf(value.fontPreset, FONT_PRESET_KEYS)) next.fontPreset = value.fontPreset
  // 高级主题是嵌套表（TOML 里 [app.ui.workspace.designTheme.md3]）；整份过解析器，
  // 不接受半个对象——否则一个手抖的 seed 会把整套设计语言带成半开状态。
  if (isRecord(value.designTheme)) next.designTheme = normalizeDesignThemeConfig(value.designTheme)
  if (isOneOf(value.cardLayout, CARD_LAYOUTS)) next.cardLayout = value.cardLayout
  if (isOneOf(value.overlayMode, OVERLAY_MODES)) next.overlayMode = value.overlayMode
  if (typeof value.overlayWidth === "number") next.overlayWidth = value.overlayWidth
  {
    const overlayFloatingMetrics = normalizeOverlayFloatingMetrics(value.overlayFloatingMetrics)
    if (overlayFloatingMetrics) next.overlayFloatingMetrics = overlayFloatingMetrics
  }
  if (typeof value.grainEnabled === "boolean") next.grainEnabled = value.grainEnabled
  if (typeof value.vignetteDepth === "number") next.vignetteDepth = value.vignetteDepth
  if (typeof value.grainIntensity === "number") next.grainIntensity = value.grainIntensity
  if (typeof value.actionGlow === "boolean") next.actionGlow = value.actionGlow
  if (typeof value.cardElevation === "boolean") next.cardElevation = value.cardElevation
  if (isOneOf(value.bgMode, BG_MODES)) next.bgMode = value.bgMode
  if (typeof value.bgImageUrl === "string") {
    const bgImageUrl = normalizePersistedBackgroundImageUrl(value.bgImageUrl)
    // data: URL (base64) 存数据库，不从 TOML 加载
    if (bgImageUrl !== undefined && !bgImageUrl.startsWith("data:")) next.bgImageUrl = bgImageUrl
  }
  if (typeof value.bgOpacity === "number") next.bgOpacity = value.bgOpacity
  if (typeof value.bgBlur === "number") next.bgBlur = value.bgBlur
  if (typeof value.bgCoverTopBar === "boolean") next.bgCoverTopBar = value.bgCoverTopBar
  if (typeof value.liquidGlassEnabled === "boolean") next.liquidGlassEnabled = value.liquidGlassEnabled
  if (typeof value.liquidGlassOpacity === "number") next.liquidGlassOpacity = value.liquidGlassOpacity
  if (typeof value.liquidGlassBlur === "number") next.liquidGlassBlur = value.liquidGlassBlur
  if (typeof value.liquidGlassDisplacement === "number") next.liquidGlassDisplacement = value.liquidGlassDisplacement
  if (typeof value.chromeVisible === "boolean") next.chromeVisible = value.chromeVisible
  if (isOneOf(value.chromePosition, CHROME_POSITIONS)) next.chromePosition = value.chromePosition
  if (isOneOf(value.chromeStyle, CHROME_STYLES)) next.chromeStyle = value.chromeStyle
  if (typeof value.chromeIslandScale === "number") next.chromeIslandScale = value.chromeIslandScale
  if (typeof value.chromeIslandMotion === "number") next.chromeIslandMotion = value.chromeIslandMotion
  if (typeof value.chromeIslandDelay === "number") next.chromeIslandDelay = value.chromeIslandDelay
  if (typeof value.chromeIslandIdleOffset === "number") next.chromeIslandIdleOffset = value.chromeIslandIdleOffset
  if (Array.isArray(value.chromeActionOrder)) next.chromeActionOrder = normalizeChromeActionOrder(value.chromeActionOrder)
  if (Array.isArray(value.chromeHiddenActions)) next.chromeHiddenActions = normalizeChromeHiddenActions(value.chromeHiddenActions)
  // 轮盘偏好不按注册表归一化（这里拿不到注册表的 id 集合，且宿主回读发生在动作注册之前）；
  // 只做「字符串数组」这一层形状校验，未知 id 在 applyWheelLayout 里自然退化为排在尾部。
  if (Array.isArray(value.wheelActionOrder)) next.wheelActionOrder = value.wheelActionOrder.filter((entry): entry is string => typeof entry === "string")
  if (Array.isArray(value.wheelHiddenActions)) next.wheelHiddenActions = value.wheelHiddenActions.filter((entry): entry is string => typeof entry === "string")
  if (typeof value.wheelRadiusPx === "number") next.wheelRadiusPx = clampWheelRadius(value.wheelRadiusPx)
  if (typeof value.wheelSectorPitchDeg === "number") next.wheelSectorPitchDeg = clampWheelPitch(value.wheelSectorPitchDeg)
  if (isOneOf(value.floatingWindowCaptionPosition, FLOATING_WINDOW_CAPTION_POSITIONS)) next.floatingWindowCaptionPosition = value.floatingWindowCaptionPosition
  if (isOneOf(value.floatingWindowCaptionStyle, FLOATING_WINDOW_CAPTION_STYLES)) next.floatingWindowCaptionStyle = value.floatingWindowCaptionStyle
  if (typeof value.floatingWindowCaptionAutoCollapse === "boolean") next.floatingWindowCaptionAutoCollapse = value.floatingWindowCaptionAutoCollapse
  if (typeof value.alphabetIndexVisible === "boolean") next.alphabetIndexVisible = value.alphabetIndexVisible
  if (typeof value.alphabetIndexOpacity === "number") next.alphabetIndexOpacity = value.alphabetIndexOpacity
  if (isOneOf(value.alphabetIndexStyle, ALPHABET_INDEX_STYLES)) next.alphabetIndexStyle = value.alphabetIndexStyle
  if (typeof value.alphabetIndexWaveIntensity === "number") next.alphabetIndexWaveIntensity = value.alphabetIndexWaveIntensity
  if (isOneOf(value.cardClickAction, CARD_CLICK_ACTIONS)) next.cardClickAction = value.cardClickAction
  if (isOneOf(value.cardDoubleClickAction, CARD_CLICK_ACTIONS)) next.cardDoubleClickAction = value.cardDoubleClickAction
  if (isOneOf(value.tabDisplayStyle, TAB_DISPLAY_STYLES)) next.tabDisplayStyle = value.tabDisplayStyle
  if (isOneOf(value.switchDisplayStyle, SWITCH_DISPLAY_STYLES)) next.switchDisplayStyle = value.switchDisplayStyle
  if (isOneOf(value.scrollbarDisplayStyle, SCROLLBAR_DISPLAY_STYLES)) next.scrollbarDisplayStyle = value.scrollbarDisplayStyle
  if (isOneOf(value.sliderDisplayStyle, SLIDER_DISPLAY_STYLES)) next.sliderDisplayStyle = value.sliderDisplayStyle
  if (isOneOf(value.moduleTitleStyle, MODULE_TITLE_STYLES)) next.moduleTitleStyle = value.moduleTitleStyle
  if (isOneOf(value.modulePanelStyle, MODULE_PANEL_STYLES)) next.modulePanelStyle = value.modulePanelStyle
  if (isOneOf(value.resizableHandleStyle, RESIZABLE_HANDLE_STYLES)) next.resizableHandleStyle = value.resizableHandleStyle
  if (typeof value.restoreWorkspaceComponents === "boolean") next.restoreWorkspaceComponents = value.restoreWorkspaceComponents
  if (isOneOf(value.choiceControlStyle, CHOICE_CONTROL_STYLES)) next.choiceControlStyle = value.choiceControlStyle
  const fieldTitleStyle = value.fieldTitleStyle ?? value.choiceControlLabelStyle
  if (isOneOf(fieldTitleStyle, FIELD_TITLE_STYLES)) next.fieldTitleStyle = fieldTitleStyle
  return Object.keys(next).length ? next : undefined
}

function mergeMissingWorkspacePreferences(config: AppUiConfig, fallback: WorkspaceUiPreferences): AppUiConfig {
  const normalized = normalizeAppUiConfig(config)
  // v4（2026-10-07，Xiranite 配置迁移为默认值）一次性重定基：v3 及更早的快照里存的是
  // **旧代码默认**派生的值（chromePosition: "right"、island scale 90/110/45/-3 等），
  // 「只补缺」规则会让它们永远盖过迁移进 INITIAL_STATE 的新默认——表现为操作栏钉在
  // 右上角、灵动岛不生效。这里把旧 workspace 段整体丢弃，让迁移默认落地，随后照常
  // 回写成 v4；v3 的 capsule→windows 特例随整段丢弃被覆盖，不再单列。
  if ((normalized.version ?? 0) < 4) {
    return { version: APP_UI_CONFIG_VERSION, migratedFrom: normalized.migratedFrom }
  }
  const existing = normalized.workspace ?? {}
  const missing = Object.fromEntries(
    Object.entries(sanitizeWorkspaceConfig(fallback))
      .filter(([key]) => existing[key as keyof WorkspaceUiPreferences] === undefined),
  ) as Partial<WorkspaceUiPreferences>
  if (!Object.keys(missing).length && normalized.version === APP_UI_CONFIG_VERSION) return normalized
  return {
    ...normalized,
    version: APP_UI_CONFIG_VERSION,
    workspace: {
      ...missing,
      ...existing,
    },
  }
}

function normalizeAppearanceConfig(value: unknown): AppUiConfig["appearance"] {
  if (!isRecord(value)) return undefined
  return isThemeMode(value.colorMode) ? { colorMode: value.colorMode } : undefined
}

function normalizeThemeSelection(value: unknown): WorkspaceUiPreferences["themeSelections"]["light"] | undefined {
  if (!isRecord(value) || (value.kind !== "preset" && value.kind !== "custom") || typeof value.name !== "string") return undefined
  if (value.kind === "preset" && !isOneOf(value.name, APP_THEMES)) return undefined
  return { kind: value.kind, name: value.name } as WorkspaceUiPreferences["themeSelections"]["light"]
}

function sanitizeWorkspaceConfig(workspace: WorkspaceUiPreferences): WorkspaceUiPreferences {
  const { customThemes: _customThemes, ...rest } = workspace
  // data: URL (base64) 存数据库，不写 TOML
  const rawBgImageUrl = workspace.bgImageUrl.startsWith("data:") ? "" : workspace.bgImageUrl
  return {
    ...rest,
    bgImageUrl: sanitizePersistedBackgroundImageUrl(rawBgImageUrl),
  }
}

function normalizeI18nConfig(value: unknown): AppUiConfig["i18n"] {
  if (!isRecord(value)) return undefined
  return isOneOf(value.language, LANGUAGES) ? { language: value.language } : undefined
}

function normalizeOverlayFloatingMetrics(value: unknown): OverlayFloatingMetrics | undefined {
  if (!isRecord(value)) return undefined
  const widthRatio = finiteNumber(value.widthRatio)
  const heightRatio = finiteNumber(value.heightRatio)
  const xRatio = finiteNumber(value.xRatio)
  const yRatio = finiteNumber(value.yRatio)
  if (widthRatio === undefined || heightRatio === undefined || xRatio === undefined || yRatio === undefined) {
    return undefined
  }
  return {
    widthRatio: clampRatio(widthRatio),
    heightRatio: clampRatio(heightRatio),
    xRatio: clampRatio(xRatio),
    yRatio: clampRatio(yRatio),
  }
}

function readBrowserLegacyConfig(): BrowserLegacyConfig {
  if (typeof window === "undefined") return {}
  const keys: string[] = []
  const hasWorkspaceStore = window.localStorage.getItem(WORKSPACE_UI_STORAGE_KEY) !== null
  const appearance = normalizeAppearanceConfig({
    colorMode: readLocalStorageValue(THEME_STORAGE_KEY, keys) ?? readLocalStorageValue(AESTIVUS_THEME_MODE_STORAGE_KEY, keys),
  })
  const i18n = normalizeI18nConfig({
    language: readLocalStorageValue(I18N_STORAGE_KEY, keys),
  })
  const workspace = hasWorkspaceStore ? undefined : readAestivusThemeWorkspace(keys)

  for (const key of [
    WORKSPACE_UI_STORAGE_KEY,
    AESTIVUS_THEME_NAME_STORAGE_KEY,
  ]) {
    if (window.localStorage.getItem(key) !== null) keys.push(key)
  }

  return pruneUndefined({
    workspace,
    appearance,
    i18n,
    hasWorkspaceStore,
    migratedFrom: keys.length ? { localStorageKeys: [...new Set(keys)], at: new Date().toISOString() } : undefined,
  }) as BrowserLegacyConfig
}

function readAestivusThemeWorkspace(foundKeys: string[]): Partial<WorkspaceUiPreferences> | undefined {
  const themeName = readLocalStorageValue(AESTIVUS_THEME_NAME_STORAGE_KEY, foundKeys)
  const customThemeText = readLocalStorageValue(AESTIVUS_CUSTOM_THEMES_STORAGE_KEY, foundKeys)
  const workspace: Partial<WorkspaceUiPreferences> = {}

  const presetTheme = appThemeFromAestivusName(themeName)
  if (presetTheme) workspace.theme = presetTheme

  if (customThemeText) {
    try {
      const customThemes = parseImportedThemeJson(customThemeText)
      if (customThemes.length > 0) {
        workspace.customThemes = customThemes
        if (themeName && customThemes.some((theme) => theme.name === themeName)) {
          workspace.activeCustomThemeName = themeName
        }
      }
    } catch {
      // Ignore invalid legacy theme payloads; migratedFrom still records the source key.
    }
  }

  return Object.keys(workspace).length ? workspace : undefined
}

function appThemeFromAestivusName(name: string | null): AppTheme | undefined {
  // 只认武陵。退役预设的名字（Tori / Conductor / …）以前会映射到各自的主题，
  // 现在一律视为「读不出」，由调用方回落到默认——比按名字硬凑一个不存在的预设诚实。
  if (name === "Wuling") return "wuling"
  return undefined
}

function writeBrowserLegacyConfig(config: AppUiConfig) {
  if (typeof window === "undefined") return

  if (config.appearance?.colorMode) {
    window.localStorage.setItem(THEME_STORAGE_KEY, config.appearance.colorMode)
    window.localStorage.setItem(AESTIVUS_THEME_MODE_STORAGE_KEY, config.appearance.colorMode)
  }
  if (config.i18n?.language) {
    window.localStorage.setItem(I18N_STORAGE_KEY, config.i18n.language)
  }
  if (config.workspace) {
    const activeTheme = getActiveCustomTheme(config.workspace.customThemes ?? [], config.workspace.activeCustomThemeName ?? null)
    if (config.workspace.theme) {
      mirrorAestivusThemeStorage(
        config.workspace.theme,
        config.appearance?.colorMode ?? "system",
        config.workspace.customThemes ?? [],
        activeTheme,
      )
    }
  }
  dispatchLegacyConfigChanged()
}

function readLocalStorageValue(key: string, foundKeys: string[]): string | null {
  const value = window.localStorage.getItem(key)
  if (value !== null) foundKeys.push(key)
  return value
}

function isEmptyAppUiConfig(config: AppUiConfig): boolean {
  return !config.workspace && !config.appearance && !config.i18n
}

function isLegacyConfigStorageKey(key: string): boolean {
  return LEGACY_CONFIG_STORAGE_KEYS.has(key)
}

function isCustomTheme(value: unknown): value is AppCustomTheme {
  if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.cssVars)) return false
  return isRecord(value.cssVars.light)
}

function isThemeMode(value: unknown): value is ThemeMode {
  return isOneOf(value, THEME_MODES)
}

function isOneOf<T extends string>(value: unknown, set: Set<T>): value is T {
  return typeof value === "string" && set.has(value as T)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function clampRatio(value: number, min = 0): number {
  return Math.min(1, Math.max(min, value))
}

function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneUndefined)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefined(entryValue)]),
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value))
}

function dispatchLegacyConfigChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(LEGACY_CONFIG_CHANGED_EVENT))
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  )
}

const LEGACY_CONFIG_STORAGE_KEYS = new Set([
  WORKSPACE_UI_STORAGE_KEY,
  THEME_STORAGE_KEY,
  AESTIVUS_THEME_NAME_STORAGE_KEY,
  AESTIVUS_THEME_MODE_STORAGE_KEY,
  AESTIVUS_CUSTOM_THEMES_STORAGE_KEY,
  I18N_STORAGE_KEY,
])
