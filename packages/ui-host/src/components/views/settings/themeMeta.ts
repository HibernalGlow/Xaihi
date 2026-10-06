import type { ComponentType } from "react"
import {
  Paintbrush,
  Sun,
} from "lucide-react"

import { THEME_PRESET_OPTIONS, type ThemePresetOption } from "@/lib/appearance"
import type { AppTheme } from "@/types/workspace"
import type { ColorMode, IconComponent } from "./types"
import { Monitor, Moon } from "lucide-react"

export const THEME_ICONS: Record<AppTheme, ComponentType<{ className?: string }>> = {
  wuling: Paintbrush,
}

export const THEMES: ThemePresetOption[] = THEME_PRESET_OPTIONS
export const CUSTOM_THEME_ACTIVE_VALUE = "__custom_theme_active__"
export const NODE_SOURCE_HOT_RELOAD_STORAGE_KEY = "xiranite.nodeSourceHotReload"

export const THEME_SOURCE_KIND_LABEL_KEYS: Record<ThemePresetOption["source"]["kind"], string> = {
  internal: "settings:themeSource.kindInternal",
  "one-page-love": "settings:themeSource.kindOnePageLove",
  awwwards: "settings:themeSource.kindAwwwards",
  "public-site": "settings:themeSource.kindPublicSite",
  "open-source": "settings:themeSource.kindOpenSource",
}

export const COLOR_MODES: {
  key: ColorMode
  labelKey: string
  descKey: string
  icon: IconComponent
}[] = [
  { key: "system", labelKey: "settings:colorMode.system", descKey: "settings:colorMode.systemDesc", icon: Monitor },
  { key: "light", labelKey: "settings:colorMode.light", descKey: "settings:colorMode.lightDesc", icon: Sun },
  { key: "dark", labelKey: "settings:colorMode.dark", descKey: "settings:colorMode.darkDesc", icon: Moon },
]
