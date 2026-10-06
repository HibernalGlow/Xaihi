import Fuse from "fuse.js"
import { WEBVIEW2_FLAG_CATALOG } from "@/config/webview2"
import {
  SETTINGS_STAGES,
  type SettingsSectionId,
  type SettingsStepId,
} from "./types"

export const SETTINGS_SECTION_IDS = SETTINGS_STAGES.map((stage) => stage.id) as readonly SettingsSectionId[]

export type SettingsSearchMatch =
  | {
    kind: "stage"
    sectionId: SettingsSectionId
    label: string
  }
  | {
    kind: "step"
    sectionId: SettingsSectionId
    stepId: SettingsStepId
    label: string
    stageLabel: string
  }
  | {
    kind: "field"
    fieldId: string
    sectionId: SettingsSectionId
    stepId: SettingsStepId
    label: string
    stageLabel: string
    stepLabel: string
  }

type SettingsSearchField = {
  id: string
  sectionId: SettingsSectionId
  stepId: SettingsStepId
  labelKey: string
  relatedKeys?: readonly string[]
  keywords?: readonly string[]
}

const field = (
  id: string,
  sectionId: SettingsSectionId,
  stepId: SettingsStepId,
  labelKey: string,
  relatedKeys?: readonly string[],
  keywords?: readonly string[],
): SettingsSearchField => ({ id, sectionId, stepId, labelKey, relatedKeys, keywords })

/**
 * Search records for every setting control. Keep this explicit rather than
 * crawling mounted DOM: inactive sections and conditional controls must remain
 * searchable, and this is the contract to update when a setting is added.
 */
export const SETTINGS_SEARCH_FIELDS: readonly SettingsSearchField[] = [
  field("theme-preset", "appearance", "theme", "settings:selectPreset", ["settings:activeTheme"], ["preset skin palette"]),
  field("color-mode", "appearance", "color", "settings:colorMode.label", ["settings:colorMode.system", "settings:colorMode.light", "settings:colorMode.dark"], ["system light dark"]),
  field("font", "appearance", "typography", "settings:font.label", ["settings:font.description"], ["typeface typography"]),
  field("language", "appearance", "typography", "settings:language.label", ["settings:language.description"], ["locale english chinese"]),
  field("vignette", "appearance", "atmosphere", "settings:atmospheric.vignette", ["settings:atmospheric.vignetteDesc"], ["canvas darkness"]),
  field("grain", "appearance", "atmosphere", "settings:atmospheric.grain", ["settings:atmospheric.silkFinish"], ["noise texture"]),
  field("action-glow", "appearance", "atmosphere", "settings:atmospheric.actionGlow", ["settings:atmospheric.actionGlowDesc"], ["button aura"]),
  field("card-elevation", "appearance", "atmosphere", "settings:atmospheric.cardElevation", ["settings:atmospheric.cardElevationDesc"], ["highlight surface"]),
  field("theme-import", "appearance", "theme-import", "settings:themeImport.label", ["settings:themeImport.description", "settings:themeImport.import", "settings:themeImport.selectTheme"], ["json custom theme"]),
  field("design-theme", "appearance", "design-language", "settings:designTheme.pickTheme", ["settings:designTheme.label", "settings:designTheme.md3.label", "settings:designTheme.mondrian.label", "settings:designTheme.wuling.label", "settings:designTheme.swiss.label", "settings:designTheme.lonestar.label", "settings:designTheme.native.label"], ["material you md3 design language advanced theme stijl mondrian 风格派 蒙德里安 wuling 武陵 jade industrial swiss international typographic sbb helvetica grotesque 瑞士 国际主义 字体排印 lonestar 孤星 cassette futurism arknights 明日方舟 chamfer cut corner orange"]),
  field("design-variant", "appearance", "design-language", "settings:designTheme.variant", ["settings:designTheme.variants.tonalSpot", "settings:designTheme.variants.vibrant", "settings:designTheme.variants.neutral", "settings:designTheme.variants.expressive"], ["scheme variant tonal spot vibrant neutral expressive fidelity content rainbow fruit salad monochrome"]),
  field("design-seed", "appearance", "design-language", "settings:designTheme.seed", ["settings:designTheme.seedSource", "settings:designTheme.sources.systemAccent", "settings:designTheme.sources.activeTheme"], ["source color seed wallpaper accent dynamic color"]),
  field("design-contrast", "appearance", "design-language", "settings:designTheme.contrast", ["settings:designTheme.contrastHint"], ["contrast level accessibility a11y"]),
  field("design-recipes", "appearance", "design-language", "settings:designTheme.pickTheme", ["settings:designTheme.swissRule", "settings:designTheme.upperLabels", "settings:designTheme.upperLabelsDesc", "settings:designTheme.monoFigures", "settings:designTheme.monoFiguresDesc", "settings:designTheme.rules.1", "settings:designTheme.rules.2", "settings:designTheme.rules.4"], ["rule weight hairline structural border uppercase labels monospace figures tabular 结构线 发丝线 大写 等宽 数字"]),
  field("design-dimensions", "appearance", "design-language", "settings:designTheme.dimensions", ["settings:designTheme.dims.shape.label", "settings:designTheme.dims.elevation.label", "settings:designTheme.dims.typography.label", "settings:designTheme.dims.motion.label", "settings:designTheme.dims.states.label", "settings:designTheme.dims.geometry.label", "settings:designTheme.shapeScale", "settings:designTheme.elevationShadows"], ["shape elevation typography motion state geometry radius shadow take over"]),

  field("startup-restore", "workspace", "startup-restore", "settings:workspace.startupRestore", ["settings:workspace.startupRestoreDesc"], ["restore reopen nodes startup"]),
  field("background-mode", "workspace", "background", "settings:background.mode", ["settings:background.modes.grid", "settings:background.modes.dot-grid", "settings:background.modes.image", "settings:background.modes.none"], ["canvas grid image solid"]),
  field("background-image", "workspace", "background", "settings:background.uploadImage", ["settings:background.chooseFile", "settings:background.imageUrl"], ["background url file upload"]),
  field("background-opacity", "workspace", "background", "settings:background.opacity", undefined, ["transparent transparency"]),
  field("background-blur", "workspace", "background", "settings:background.blur", undefined, ["blurred image"]),
  field("background-cover-top-bar", "workspace", "background", "settings:background.coverTopBar", ["settings:background.coverTopBarHint"], ["transparent titlebar"]),
  field("background-grain", "workspace", "background", "settings:atmospheric.silkFinish", ["settings:atmospheric.enabled", "settings:atmospheric.disabled"], ["noise texture"]),
  field("operation-bar-visible", "workspace", "chrome", "settings:chrome.visible", ["settings:chrome.visibleDesc"], ["toolbar hide show"]),
  field("operation-bar-position", "workspace", "chrome", "settings:chrome.position", ["settings:chrome.positionLeft", "settings:chrome.positionIsland", "settings:chrome.positionRight"], ["toolbar left center right"]),
  field("operation-bar-style", "workspace", "chrome", "settings:chrome.style", ["settings:chrome.styleDefault", "settings:chrome.styleTrafficLight"], ["toolbar macos traffic light"]),
  field("operation-bar-island", "workspace", "chrome", "settings:chrome.islandCustom", ["settings:chrome.islandScale", "settings:chrome.islandMotion", "settings:chrome.islandDelay", "settings:chrome.islandIdleOffset"], ["size motion delay offset"]),
  field("operation-bar-actions", "workspace", "chrome", "settings:chrome.actions", ["settings:chrome.actionsDesc", "settings:chrome.visibleActions", "settings:chrome.hiddenActions"], ["toolbar buttons reorder hide"]),
  field("floating-window-position", "workspace", "floating-window-caption", "settings:floatingWindowCaption.position", ["settings:floatingWindowCaption.positionLeft", "settings:floatingWindowCaption.positionCenter", "settings:floatingWindowCaption.positionRight"], ["window caption controls"]),
  field("floating-window-style", "workspace", "floating-window-caption", "settings:floatingWindowCaption.style", ["settings:floatingWindowCaption.styleWindows", "settings:floatingWindowCaption.styleCapsule", "settings:floatingWindowCaption.styleTrafficLight"], ["window caption controls"]),
  field("floating-window-auto-collapse", "workspace", "floating-window-caption", "settings:floatingWindowCaption.autoCollapse", ["settings:floatingWindowCaption.autoCollapseDesc"], ["capsule idle"]),
  field("alphabet-index-visible", "workspace", "alphabet", "settings:alphabetIndex.visible", ["settings:alphabetIndex.visibleDesc"], ["launcher node rail"]),
  field("alphabet-index-style", "workspace", "alphabet", "settings:alphabetIndex.style", ["settings:alphabetIndex.styles.glass", "settings:alphabetIndex.styles.solid", "settings:alphabetIndex.styles.minimal"], ["launcher"]),
  field("alphabet-index-opacity", "workspace", "alphabet", "settings:alphabetIndex.opacity", undefined, ["launcher transparency"]),
  field("alphabet-index-wave", "workspace", "alphabet", "settings:alphabetIndex.wave", undefined, ["launcher hover animation"]),

  field("swimlane-solo-on-focus", "view", "swimlane", "settings:view.swimlane.soloOnFocus", undefined, ["focus solo lane"]),
  field("swimlane-show-navigator", "view", "swimlane", "settings:view.swimlane.showNavigatorInSolo", undefined, ["solo lane navigation"]),
  field("swimlane-edge-reveal-delay", "view", "swimlane", "settings:view.swimlane.edgeRevealDelay", undefined, ["edge lane reveal delay milliseconds"]),
  field("swimlane-focus-on-hover", "view", "swimlane", "settings:view.swimlane.focusOnHover", undefined, ["hover focus lane"]),
  field("swimlane-focus-delay", "view", "swimlane", "settings:view.swimlane.focusDelay", undefined, ["hover focus delay milliseconds"]),
  field("tabs-style", "view", "components", "settings:view.componentDisplay.tabs.title", ["settings:view.componentDisplay.tabs.description"], ["tab preview history details"]),
  field("switches-style", "view", "components", "settings:view.componentDisplay.switches.title", ["settings:view.componentDisplay.switches.description"], ["toggle boolean"]),
  field("sliders-style", "view", "components", "settings:view.componentDisplay.sliders.title", ["settings:view.componentDisplay.sliders.description"], ["range parameter rail"]),
  field("scrollbars-style", "view", "components", "settings:view.componentDisplay.scrollbars.title", ["settings:view.componentDisplay.scrollbars.description"], ["overflow horizontal vertical"]),
  field("choice-controls-style", "view", "components", "settings:timeline.controlStyle", ["settings:timeline.choice.segmented", "settings:timeline.choice.pills", "settings:timeline.choice.tabs", "settings:timeline.choice.tiles"], ["radio select"]),
  field("field-title-style", "view", "components", "settings:timeline.fieldTitleStyle", ["settings:timeline.fieldTitle.stacked", "settings:timeline.fieldTitle.legend", "settings:timeline.fieldTitle.inline", "settings:timeline.fieldTitle.hidden"], ["form label"]),
  field("module-title-style", "view", "components", "settings:timeline.moduleTitleStyle", undefined, ["node module card header"]),
  field("module-panel-style", "view", "components", "settings:timeline.modulePanelStyle", undefined, ["node module card surface"]),
  field("resizable-handle-style", "view", "components", "settings:timeline.resizableHandle", undefined, ["resize grip dots line"]),
  field("card-click", "view", "card-interaction", "settings:view.clickAction", ["settings:view.action.none", "settings:view.action.focus", "settings:view.action.fullscreen"], ["single click"]),
  field("card-double-click", "view", "card-interaction", "settings:view.doubleClickAction", ["settings:view.action.none", "settings:view.action.focus", "settings:view.action.fullscreen"], ["double click"]),

  field("node-hot-reload", "runtime", "connection", "settings:timeline.nodeHotReload", ["settings:timeline.nodeHotReloadDesc"], ["source watch development"]),
  field("desktop-tray", "runtime", "desktop-tray", "settings:desktopTray.keepRunning", ["settings:desktopTray.keepRunningDescription"], ["notification area minimize close"]),
  field("node-memory-rss", "runtime", "memory-protection", "settings:memoryProtection.fields.rss.label", ["settings:memoryProtection.description"], ["rss memory limit node"]),
  field("node-memory-heap", "runtime", "memory-protection", "settings:memoryProtection.fields.heap.label", ["settings:memoryProtection.description"], ["heap memory limit node"]),
  field("node-memory-events", "runtime", "memory-protection", "settings:memoryProtection.fields.events.label", ["settings:memoryProtection.description"], ["event retention logs node"]),
  field("node-memory-sampling", "runtime", "memory-protection", "settings:memoryProtection.fields.interval.label", ["settings:memoryProtection.description"], ["sample interval node"]),
  ...WEBVIEW2_FLAG_CATALOG.features.map((flag) => field(`webview2-${flag.key}`, "runtime", "webview2", `settings:webview2.flags.${flag.key}.label`, [`settings:webview2.flags.${flag.key}.description`], [flag.id, "webview2 feature chromium"])),
  ...WEBVIEW2_FLAG_CATALOG.switches.map((flag) => field(`webview2-${flag.key}`, "runtime", "webview2", `settings:webview2.flags.${flag.key}.label`, [`settings:webview2.flags.${flag.key}.description`], [flag.id, "webview2 switch chromium"])),
]

/** Normalize URL/query values to a known settings section id, or null. */
export function parseSettingsSectionId(raw: string | null | undefined): SettingsSectionId | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(normalized)
    ? (normalized as SettingsSectionId)
    : null
}

/** Search translated stage, step, and field records with weighted fuzzy matching. */
export function filterSettingsMatches(
  query: string,
  translate: (key: string) => string,
): SettingsSearchMatch[] {
  if (!query.trim()) return []

  const stageLabels = new Map<SettingsSectionId, string>()
  const stepLabels = new Map<SettingsStepId, string>()
  const records: Array<{
    match: SettingsSearchMatch
    label: string
    description: string
    keywords: string
    id: string
  }> = []

  for (const stage of SETTINGS_STAGES) {
    const stageLabel = translate(stage.labelKey)
    stageLabels.set(stage.id, stageLabel)
    records.push({
      match: { kind: "stage", sectionId: stage.id, label: stageLabel },
      label: stageLabel,
      description: translate(stage.descriptionKey),
      keywords: stage.id,
      id: `stage:${stage.id}`,
    })

    for (const step of stage.steps) {
      const stepLabel = translate(step.labelKey)
      stepLabels.set(step.id, stepLabel)
      records.push({
        match: {
          kind: "step",
          sectionId: stage.id,
          stepId: step.id,
          label: stepLabel,
          stageLabel,
        },
        label: stepLabel,
        description: stageLabel,
        keywords: `${stage.id} ${step.id}`,
        id: `step:${step.id}`,
      })
    }
  }

  for (const setting of SETTINGS_SEARCH_FIELDS) {
    const stageLabel = stageLabels.get(setting.sectionId) ?? setting.sectionId
    const stepLabel = stepLabels.get(setting.stepId) ?? setting.stepId
    const label = translate(setting.labelKey)
    records.push({
      match: {
        kind: "field",
        fieldId: setting.id,
        sectionId: setting.sectionId,
        stepId: setting.stepId,
        label,
        stageLabel,
        stepLabel,
      },
      label,
      description: (setting.relatedKeys ?? []).map(translate).join(" "),
      keywords: [setting.id, setting.sectionId, setting.stepId, ...(setting.keywords ?? [])].join(" "),
      id: `field:${setting.id}`,
    })
  }

  return new Fuse(records, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: [
      { name: "label", weight: 0.5 },
      { name: "description", weight: 0.25 },
      { name: "keywords", weight: 0.2 },
      { name: "id", weight: 0.05 },
    ],
  })
    .search(query.trim())
    .slice(0, 50)
    .map((result) => result.item.match)
}

/** Scroll the settings content pane to a step card (`data-settings-step`). */
export function scrollToSettingsStep(
  root: ParentNode | null | undefined,
  stepId: SettingsStepId,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (!root) return false
  const target = root.querySelector<HTMLElement>(`[data-settings-step="${stepId}"]`)
  if (!target) return false
  target.scrollIntoView({ behavior, block: "start" })
  return true
}

/** Scroll the settings content pane to a timeline stage (`data-timeline-entry`). */
export function scrollToSettingsStage(
  root: ParentNode | null | undefined,
  sectionId: SettingsSectionId,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (!root) return false
  const target = root.querySelector<HTMLElement>(`[data-timeline-entry="${sectionId}"]`)
  if (!target) return false
  target.scrollIntoView({ behavior, block: "start" })
  return true
}

export function scrollToSettingsMatch(
  root: ParentNode | null | undefined,
  match: SettingsSearchMatch,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (match.kind === "step" || match.kind === "field") return scrollToSettingsStep(root, match.stepId, behavior)
  return scrollToSettingsStage(root, match.sectionId, behavior)
}
