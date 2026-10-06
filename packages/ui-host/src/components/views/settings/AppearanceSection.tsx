import { useMemo, useState } from "react"
import { ExternalLink, Languages, Palette, Type, Upload, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useTheme } from "@/components/use-theme"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { changeLanguage, getCurrentLanguage, LANGUAGES, type Language } from "@/i18n"
import {
  getActiveCustomTheme,
  parseImportedThemeJson,
  resolveThemeScheme,
} from "@/lib/appearance"
import { FONT_PRESETS } from "@/lib/appearance-fonts"
import { cn } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { AppFontPreset, AppTheme } from "@/types/workspace"
import { SettingsStepCard } from "./primitives"
import { DesignThemeSection } from "./DesignThemeSection"
import {
  COLOR_MODES,
  CUSTOM_THEME_ACTIVE_VALUE,
  THEME_ICONS,
  THEME_SOURCE_KIND_LABEL_KEYS,
  THEMES,
} from "./themeMeta"
import type { ColorMode } from "./types"

export function AppearanceSection() {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const { theme: colorMode, setTheme: setColorMode } = useTheme()
  const currentLang = getCurrentLanguage()
  const state = useWorkspaceShallowSelector((workspace) => ({
    theme: workspace.theme,
    themeSelections: workspace.themeSelections,
    customThemes: workspace.customThemes,
    fontPreset: workspace.fontPreset,
    vignetteDepth: workspace.vignetteDepth,
    grainIntensity: workspace.grainIntensity,
    actionGlow: workspace.actionGlow,
    cardElevation: workspace.cardElevation,
  }))

  const [themeJson, setThemeJson] = useState("")
  const [themeImportError, setThemeImportError] = useState<string | null>(null)

  const activeScheme = resolveThemeScheme(
    (colorMode ?? "system") as ColorMode,
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? document.documentElement.classList.contains("dark"),
  )
  const activeSelection = state.themeSelections[activeScheme]
  const activePresetKey = activeSelection.kind === "preset" ? activeSelection.name : state.theme
  const active = THEMES.find((th) => th.key === activePresetKey) ?? THEMES[0]
  const ActiveThemeIcon = THEME_ICONS[active.key]
  const activeCustomTheme = activeSelection.kind === "custom"
    ? getActiveCustomTheme(state.customThemes, activeSelection.name)
    : null
  const activeCustomThemeSwatches = useMemo(() => {
    if (!activeCustomTheme) return []
    const colors = activeScheme === "dark"
      ? (activeCustomTheme.cssVars.dark ?? activeCustomTheme.cssVars.light)
      : activeCustomTheme.cssVars.light
    return [colors.background, colors.primary, colors.secondary, colors.accent].filter(Boolean)
  }, [activeCustomTheme, activeScheme])
  const activeCustomColors = activeCustomTheme
    ? (activeScheme === "dark"
      ? (activeCustomTheme.cssVars.dark ?? activeCustomTheme.cssVars.light)
      : activeCustomTheme.cssVars.light)
    : null
  const activeThemePalette = activeCustomTheme
    ? [
      activeCustomColors?.background,
      activeCustomColors?.primary,
      activeCustomColors?.border,
      activeCustomColors?.foreground,
    ].filter(Boolean)
    : active.palette
  const activeThemePaletteLabels = activeCustomTheme
    ? ["background", "primary", "border", "foreground"]
    : active.paletteLabelKeys.map((key) => t(key))
  const activeFont = FONT_PRESETS.find((preset) => preset.key === state.fontPreset) ?? FONT_PRESETS[0]

  function selectPreset(key: AppTheme) {
    workspaceActions.setThemeSelection(activeScheme, { kind: "preset", name: key })
  }

  function importThemeJson() {
    try {
      const imported = parseImportedThemeJson(themeJson)
      workspaceActions.setCustomThemes(imported)
      if (imported[0]) {
        workspaceActions.setThemeSelection(activeScheme, { kind: "custom", name: imported[0].name })
      }
      setThemeJson("")
      setThemeImportError(null)
    } catch (error) {
      setThemeImportError(
        error instanceof Error ? error.message : t("settings:themeImport.invalidJson", "Invalid theme JSON."),
      )
    }
  }

  function clearImportedTheme() {
    workspaceActions.setCustomThemes([])
    setThemeImportError(null)
  }

  function openExternalUrl(url?: string) {
    if (!url) return
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-3">
      <SettingsStepCard
        id="theme"
        title={t("settings:timeline.steps.theme")}
        description={t("settings:timeline.stepDesc.theme")}
        icon={Palette}
        delay={0.02}
      >
        <div className="space-y-4">
          <div className="rounded-sm border border-border/50 bg-muted/10 p-4">
            <div className="mb-3 flex items-start justify-between">
              <Badge variant="outline" className="border-primary/40 font-mono text-[9px] text-primary">
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary" />
                {t("settings:activeTheme", "ACTIVE THEME")}
              </Badge>
              {activeCustomTheme
                ? <Palette className="size-4 text-muted-foreground" />
                : <ActiveThemeIcon className="size-4 text-muted-foreground" />}
            </div>
            <h3 className="mb-2 truncate text-xl font-semibold text-foreground">
              {activeCustomTheme?.name ?? t(active.labelKey)}
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {activeCustomTheme?.description ?? t(active.descriptionKey)}
            </p>

            {!activeCustomTheme && (
              <div className="mb-4 rounded-sm border border-border/45 bg-muted/15 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-sm font-mono text-[9px] uppercase tracking-wider">
                    {t(THEME_SOURCE_KIND_LABEL_KEYS[active.source.kind])}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm font-mono text-[9px] text-muted-foreground">
                    {t("settings:themeSource.evidenceCount", { count: active.source.evidence.length })}
                  </Badge>
                  <div className="ml-auto flex items-center gap-1.5">
                    {(active.source.originalUrl ?? active.source.url) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-sm px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => openExternalUrl(active.source.originalUrl ?? active.source.url)}
                      >
                        <ExternalLink className="size-3" />
                        {t("settings:themeSource.source")}
                      </Button>
                    )}
                    {active.source.repositoryUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-sm px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => openExternalUrl(active.source.repositoryUrl)}
                      >
                        <ExternalLink className="size-3" />
                        {t("settings:themeSource.repo")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="mb-2 text-[10px] font-mono tracking-widest text-muted-foreground">
              {t("settings:texture.basePalette")}
            </p>
            <div className="flex overflow-hidden rounded-sm border border-border/40">
              {activeThemePalette.map((color, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1 pb-2 pt-3" style={{ background: color }}>
                  <div className="h-8 w-full" />
                  <span className="text-[9px] font-mono" style={{ color: i < 2 ? "oklch(0.7 0 0)" : "oklch(0.2 0 0)" }}>
                    {activeThemePaletteLabels[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-mono tracking-widest text-muted-foreground">{t("settings:selectPreset")}</p>
              <Badge variant="outline" className="shrink-0 rounded-sm font-mono text-[9px] text-muted-foreground">
                {THEMES.length}
              </Badge>
            </div>
            <Select
              value={activeCustomTheme ? CUSTOM_THEME_ACTIVE_VALUE : activePresetKey}
              onValueChange={(value) => {
                if (value !== CUSTOM_THEME_ACTIVE_VALUE) selectPreset(value as AppTheme)
              }}
            >
              <SelectTrigger className="w-full bg-background/60 font-mono text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  {activeCustomTheme && (
                    <SelectItem value={CUSTOM_THEME_ACTIVE_VALUE}>
                      <Palette className="text-primary" />
                      <span className="min-w-0 truncate">
                        {t("settings:themeImport.activeImported", "Imported theme active")}
                      </span>
                    </SelectItem>
                  )}
                  {THEMES.map((th) => {
                    const Icon = THEME_ICONS[th.key]
                    return (
                      <SelectItem key={th.key} value={th.key}>
                        <Icon className="text-muted-foreground" />
                        <span className="min-w-0 truncate">{t(th.labelKey)}</span>
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex min-w-0 items-center gap-3 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-sm border border-primary/30 bg-primary/10 text-primary">
                <ActiveThemeIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t(active.labelKey)}</p>
                <p className="truncate text-[10px] font-mono text-muted-foreground/70">{t(active.subtitleKey)}</p>
              </div>
              <div className="flex shrink-0 overflow-hidden rounded-sm border border-border/40">
                {active.palette.slice(0, 4).map((color, index) => (
                  <span key={`${active.key}-${index}`} className="size-5" style={{ background: color }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </SettingsStepCard>

      <DesignThemeSection />

      <SettingsStepCard
        id="color"
        title={t("settings:colorMode.label")}
        description={t("settings:colorMode.description")}
        icon={Palette}
        delay={0.06}
      >
        <ToggleGroup
          type="single"
          value={colorMode}
          onValueChange={(value) => {
            if (value) setColorMode(value as ColorMode)
          }}
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-3 gap-2"
          spacing={2}
        >
          {COLOR_MODES.map((m) => {
            const Icon = m.icon
            return (
              <ToggleGroupItem
                key={m.key}
                value={m.key}
                className="h-16 min-w-0 flex-col gap-1.5 px-2 text-muted-foreground data-[state=on]:border-primary/50 data-[state=on]:bg-primary/8 data-[state=on]:text-foreground"
              >
                <Icon className="size-4 data-[state=on]:text-primary" />
                <span className="truncate text-[11px] font-medium">{t(m.labelKey)}</span>
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </SettingsStepCard>

      <SettingsStepCard
        id="typography"
        title={t("settings:timeline.steps.typography")}
        description={t("settings:timeline.stepDesc.typography")}
        icon={Type}
        delay={0.1}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Type className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-mono tracking-widest text-muted-foreground">
                {t("settings:font.label", "FONT")}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "settings:font.description",
                "Switch the global UI font while preserving monospace surfaces and aestivus-compatible font variables.",
              )}
            </p>
            <Select
              value={state.fontPreset}
              onValueChange={(value) => workspaceActions.setFontPreset(value as AppFontPreset)}
            >
              <SelectTrigger className="w-full bg-background/60 font-mono text-xs" size="sm">
                <SelectValue placeholder={t("settings:font.label", "FONT")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  {FONT_PRESETS.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>
                      <Type className="text-muted-foreground" />
                      <span className="min-w-0 truncate">{preset.label}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
              <p className="text-xs font-medium text-foreground">{activeFont.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{activeFont.description}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70" style={{ fontFamily: activeFont.sans }}>
                Aa Bb Cc · 0123456789 · 界面预览
              </p>
            </div>
          </div>

          <Separator className="opacity-50" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-mono tracking-widest text-muted-foreground">{t("settings:language.label")}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("settings:language.description")}</p>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((l) => {
                const isActive = currentLang === l.key
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => changeLanguage(l.key as Language)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-sm border p-3 transition-all",
                      isActive
                        ? "border-primary/50 bg-primary/8"
                        : "border-border/40 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <span className={cn("text-sm font-medium", isActive ? "text-primary" : "text-foreground")}>
                      {l.nativeLabel}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">{l.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70">{t("settings:language.restartHint")}</p>
          </div>
        </div>
      </SettingsStepCard>

      <SettingsStepCard
        id="atmosphere"
        title={t("settings:atmospheric.title")}
        description={t("settings:timeline.stepDesc.atmosphere")}
        icon={Palette}
        delay={0.14}
      >
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-foreground">{t("settings:atmospheric.vignette")}</span>
              <span className="font-mono text-sm text-muted-foreground">{state.vignetteDepth}%</span>
            </div>
            <Slider
              value={[state.vignetteDepth]}
              onValueChange={([v]) => workspaceActions.setVignette(v)}
              min={0}
              max={100}
              step={1}
              className="mb-1"
            />
            <p className="text-[11px] text-muted-foreground">{t("settings:atmospheric.vignetteDesc")}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-foreground">{t("settings:atmospheric.grain")}</span>
              <span className="font-mono text-sm text-muted-foreground">{state.grainIntensity}%</span>
            </div>
            <Slider
              value={[state.grainIntensity]}
              onValueChange={([v]) => workspaceActions.setGrainIntensity(v)}
              min={0}
              max={100}
              step={1}
            />
          </div>

          <Separator className="opacity-50" />

          <div>
            <p className="mb-3 text-[10px] font-mono tracking-widest text-muted-foreground">
              {t("settings:atmospheric.ambient")}
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/40 bg-muted/50">
                  <div className="size-3.5 rounded-sm border border-current opacity-60" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{t("settings:atmospheric.actionGlow")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings:atmospheric.actionGlowDesc")}</p>
                </div>
                <Switch checked={state.actionGlow} onCheckedChange={(v) => workspaceActions.setActionGlow(v)} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/40 bg-muted/50">
                  <div className="size-3.5 rounded-sm border border-x border-b border-t-2 border-current opacity-60" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{t("settings:atmospheric.cardElevation")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings:atmospheric.cardElevationDesc")}</p>
                </div>
                <Switch checked={state.cardElevation} onCheckedChange={(v) => workspaceActions.setCardElevation(v)} />
              </div>
            </div>
          </div>
        </div>
      </SettingsStepCard>

      <SettingsStepCard
        id="theme-import"
        title={t("settings:themeImport.label", "IMPORT JSON")}
        description={t(
          "settings:themeImport.description",
          "Import a tweakcn/aestivus theme object or a theme.json array, then switch between imported themes from a compact library.",
        )}
        icon={Upload}
        advanced
        delay={0.18}
      >
        <div className="space-y-3">
          {activeCustomTheme && (
            <Badge variant="outline" className="max-w-[11rem] truncate font-mono text-[9px]" title={activeCustomTheme.name}>
              {activeCustomTheme.name}
            </Badge>
          )}
          <Textarea
            value={themeJson}
            onChange={(event) => {
              setThemeJson(event.target.value)
              if (themeImportError) setThemeImportError(null)
            }}
            spellCheck={false}
            placeholder='[{"name":"perpetuity","cssVars":{"light":{"background":"oklch(1 0 0)","primary":"oklch(0.5 0.12 250)"},"dark":{"background":"oklch(0.2 0 0)"}}}]'
            className="min-h-28 resize-y font-mono text-[11px] leading-relaxed"
            aria-invalid={Boolean(themeImportError)}
          />
          {themeImportError && (
            <p className="rounded-sm border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] leading-relaxed text-destructive">
              {themeImportError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" className="font-mono text-xs" disabled={!themeJson.trim()} onClick={importThemeJson}>
              <Upload className="size-3.5" />
              {t("settings:themeImport.import", "Import JSON")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={state.customThemes.length === 0}
              onClick={clearImportedTheme}
            >
              <X className="size-3.5" />
              {t("settings:themeImport.clear", "Clear imported themes")}
            </Button>
          </div>
          {state.customThemes.length > 0 && (
            <div className="rounded-sm border border-border/50 bg-muted/15 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {activeCustomTheme?.name ?? t("settings:themeImport.noActive", "No imported theme active")}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {t("settings:themeImport.count", {
                      count: state.customThemes.length,
                      defaultValue: "{{count}} imported themes",
                    })}
                  </p>
                </div>
                {activeCustomThemeSwatches.length > 0 && (
                  <div className="grid size-7 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-border/40">
                    {activeCustomThemeSwatches.slice(0, 4).map((color, index) => (
                      <span key={`${activeCustomTheme?.name}-${index}`} style={{ background: color }} />
                    ))}
                  </div>
                )}
              </div>
              <Select
                value={activeCustomTheme?.name ?? "none"}
                onValueChange={(value) =>
                  workspaceActions.setThemeSelection(
                    activeScheme,
                    value === "none" ? { kind: "preset", name: state.theme } : { kind: "custom", name: value },
                  )
                }
              >
                <SelectTrigger className="w-full bg-background/60 font-mono text-xs" size="sm">
                  <SelectValue placeholder={t("settings:themeImport.selectTheme", "Select imported theme")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectGroup>
                    <SelectItem value="none">{t("settings:themeImport.disableImported", "Use preset only")}</SelectItem>
                    {state.customThemes.map((theme) => (
                      <SelectItem key={theme.name} value={theme.name}>{theme.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {activeCustomTheme && (
                <p className="mt-2 truncate text-[10px] font-mono text-muted-foreground/70">
                  {activeCustomColors?.primary ?? activeCustomColors?.background ?? "custom cssVars"}
                </p>
              )}
            </div>
          )}
        </div>
      </SettingsStepCard>
    </div>
  )
}
