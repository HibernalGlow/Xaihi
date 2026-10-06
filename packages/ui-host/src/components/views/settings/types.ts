import type { ComponentType } from "react"
import {
  Database,
  Grid,
  Image,
  Palette,
  Server,
  type LucideIcon,
} from "lucide-react"

/** Top-level settings stages shown on the timeline rail. */
export type SettingsSectionId = "appearance" | "workspace" | "view" | "runtime" | "data"

/** In-section step anchors — scroll targets within the active stage. */
export type SettingsStepId =
  | "startup-restore"
  | "theme"
  | "design-language"
  | "color"
  | "typography"
  | "atmosphere"
  | "theme-import"
  | "background"
  | "chrome"
  | "floating-window-caption"
  | "alphabet"
  | "swimlane"
  | "components"
  | "card-interaction"
  | "connection"
  | "memory-protection"
  | "desktop-tray"
  | "webview2"
  | "storage"

export type SettingsStepDef = {
  id: SettingsStepId
  labelKey: string
  /** When true, step content starts collapsed under an "advanced" disclosure. */
  advanced?: boolean
}

export type SettingsStageDef = {
  id: SettingsSectionId
  labelKey: string
  descriptionKey: string
  icon: LucideIcon
  steps: readonly SettingsStepDef[]
}

export const SETTINGS_STAGES: readonly SettingsStageDef[] = [
  {
    id: "appearance",
    labelKey: "settings:sections.appearance",
    descriptionKey: "settings:timeline.stageDesc.appearance",
    icon: Palette,
    steps: [
      { id: "theme", labelKey: "settings:timeline.steps.theme" },
      { id: "design-language", labelKey: "settings:timeline.steps.designLanguage" },
      { id: "color", labelKey: "settings:timeline.steps.color" },
      { id: "typography", labelKey: "settings:timeline.steps.typography" },
      { id: "atmosphere", labelKey: "settings:timeline.steps.atmosphere" },
      { id: "theme-import", labelKey: "settings:timeline.steps.themeImport", advanced: true },
    ],
  },
  {
    id: "workspace",
    labelKey: "settings:sections.workspace",
    descriptionKey: "settings:timeline.stageDesc.workspace",
    icon: Image,
    steps: [
      { id: "background", labelKey: "settings:timeline.steps.background" },
      { id: "chrome", labelKey: "settings:timeline.steps.chrome" },
      { id: "alphabet", labelKey: "settings:timeline.steps.alphabet" },
    ],
  },
  {
    id: "view",
    labelKey: "settings:sections.view",
    descriptionKey: "settings:timeline.stageDesc.view",
    icon: Grid,
    steps: [
      { id: "swimlane", labelKey: "settings:timeline.steps.swimlane" },
      { id: "components", labelKey: "settings:timeline.steps.components" },
      { id: "card-interaction", labelKey: "settings:timeline.steps.cardInteraction" },
    ],
  },
  {
    id: "runtime",
    labelKey: "settings:sections.runtime",
    descriptionKey: "settings:timeline.stageDesc.runtime",
    icon: Server,
    steps: [
      { id: "connection", labelKey: "settings:timeline.steps.connection" },
      { id: "memory-protection", labelKey: "settings:timeline.steps.memoryProtection" },
      { id: "webview2", labelKey: "settings:timeline.steps.webview2" },
    ],
  },
  {
    id: "data",
    labelKey: "settings:sections.data",
    descriptionKey: "settings:timeline.stageDesc.data",
    icon: Database,
    steps: [
      { id: "storage", labelKey: "settings:timeline.steps.storage" },
    ],
  },
] as const

export function stageById(id: SettingsSectionId): SettingsStageDef {
  return SETTINGS_STAGES.find((stage) => stage.id === id) ?? SETTINGS_STAGES[0]
}

export function stepIdsForSection(id: SettingsSectionId): SettingsStepId[] {
  return stageById(id).steps.map((step) => step.id)
}

export type ColorMode = "system" | "light" | "dark"

export type IconComponent = ComponentType<{ className?: string }>
