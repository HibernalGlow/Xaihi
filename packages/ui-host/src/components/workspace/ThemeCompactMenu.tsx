import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryStates, parseAsString } from 'nuqs'
import { Monitor, Sun, Moon, Palette, Paintbrush, Settings } from 'lucide-react'
import { getActiveCustomTheme, THEME_PRESET_OPTIONS } from '@/lib/appearance'
import { DESIGN_THEME_ENTRIES, colorAdaptationHintKey, designThemeById } from '@/lib/design-theme/registry'
import type { DesignThemeConfig } from '@/lib/design-theme/contract'
import type { AppTheme, AppThemeScheme, AppThemeSelections, AppThemeSelection, AppCustomTheme } from '@/types/workspace'
import { Button } from '@/components/ui/button'
import { CompactPressPicker, type CompactPickerOption } from './CompactPressPicker'

type ColorMode = 'system' | 'light' | 'dark'
const modes = [
  { key: 'system', icon: Monitor }, { key: 'light', icon: Sun }, { key: 'dark', icon: Moon },
] as const
function Swatch({ colors }: { colors: (string | undefined)[] }) {
  return <span aria-hidden="true" className="relative grid size-[18px] shrink-0 grid-cols-2 overflow-hidden rounded border border-border/60">
    {colors.slice(0, 4).map((color, index) => <span key={index} style={{ background: color }} />)}
  </span>
}

/** A presentation adapter over the same settings actions used by the appearance page. */
export function ThemeCompactMenu({ theme, selections, customThemes, designTheme, scheme, colorMode, loop,
  onColorMode, onSelection, onDesignTheme, onSettings,
}: {
  theme: AppTheme; selections: AppThemeSelections; customThemes: AppCustomTheme[]; designTheme: DesignThemeConfig
  scheme: AppThemeScheme; colorMode: ColorMode; loop: boolean
  onColorMode(value: ColorMode): void; onSelection(scheme: AppThemeScheme, value: AppThemeSelection): void
  onDesignTheme(value: DesignThemeConfig): void; onSettings(): void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState('design')
  const [, setRoute] = useQueryStates({ settings: parseAsString, settingsStep: parseAsString }, { history: 'replace', shallow: true })
  const selection = selections[scheme]
  const preset = THEME_PRESET_OPTIONS.find(item => item.key === (selection.kind === 'preset' ? selection.name : theme)) ?? THEME_PRESET_OPTIONS[0]!
  const custom = selection.kind === 'custom' ? getActiveCustomTheme(customThemes, selection.name) : null
  const design = designThemeById(designTheme.id)!
  const usesDesignPalette = designTheme.id !== 'native' && designTheme.dimensions.color
  const label = usesDesignPalette ? t(design.labelKey) : selection.kind === 'none' ? t('settings:colorTheme.defaultLabel') : custom?.name ?? t(preset.labelKey)
  const colorsOf = (item: AppCustomTheme) => {
    const colors = { ...item.cssVars.light, ...(scheme === 'dark' ? item.cssVars.dark : {}) }
    return [colors.background, colors.primary, colors.secondary, colors.accent]
  }
  const colors = usesDesignPalette || selection.kind === 'none'
    ? ['var(--background)', 'var(--card)', 'var(--primary)', 'var(--foreground)']
    : custom ? colorsOf(custom) : preset.palette
  const options: CompactPickerOption[] = [
    { key: 'design', label: t('settings:timeline.steps.designLanguage'), icon: Paintbrush, childrenTitle: t('settings:timeline.steps.designLanguage'),
      children: DESIGN_THEME_ENTRIES.map(entry => ({ key: entry.id, label: t(entry.labelKey), hint: t(entry.descriptionKey), toggled: entry.id === designTheme.id })) },
    { key: 'color', label: t('settings:colorTheme.label'), icon: Palette, hint: t(colorAdaptationHintKey(designTheme)), childrenTitle: t('settings:colorTheme.label'),
      children: [
        { key: 'default', label: t('settings:colorTheme.defaultLabel'), toggled: selection.kind === 'none', leading: <Swatch colors={['var(--background)', 'var(--card)', 'var(--primary)', 'var(--foreground)']} /> },
        { key: 'preset', label: t(preset.labelKey), toggled: selection.kind === 'preset', leading: <Swatch colors={preset.palette} /> },
        ...customThemes.map(item => ({ key: `custom:${item.name}`, label: item.name, hint: item.description, toggled: selection.kind === 'custom' && item.name === selection.name, leading: <Swatch colors={colorsOf(item)} /> })),
      ] },
    { key: 'mode', label: t('topbar:theme.colorMode'), icon: modes.find(mode => mode.key === colorMode)!.icon, childrenTitle: t('topbar:theme.colorMode'),
      children: modes.map(mode => ({ key: mode.key, label: t(`topbar:theme.${mode.key}`), icon: mode.icon, toggled: colorMode === mode.key })) },
  ]
  return <CompactPressPicker value={category} options={options} loop={loop} orientation="matrix" behavior="command" align="end" showIndicators={false}
    title={t('topbar:theme.label')} triggerLabel={`${t('topbar:theme.label')} · ${label}`} triggerIcon={Palette}
    gestureHint={t('topbar:theme.gesture')} releaseHint={t('topbar:compactView.releaseAction')}
    footer={<><div className="mt-2 flex items-start gap-2 border-t border-border/60 px-2 pt-2 text-[10px] text-muted-foreground"><Swatch colors={colors} /><span className="min-w-0"><span className="block truncate font-medium text-foreground">{label} · {t(`topbar:theme.${scheme}`)}</span><span className="block leading-relaxed">{t(colorAdaptationHintKey(designTheme))}</span></span></div><Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2 text-xs text-muted-foreground" onClick={() => { onSettings(); void setRoute({ settings: 'appearance', settingsStep: 'theme' }) }}><Settings className="size-[18px]" />{t('topbar:theme.openSettings')}</Button></>}
    testId="compact-theme-menu" optionAttribute="data-theme-category"
    onSelect={(main, child) => {
      setCategory(main)
      if (main === 'design' && child && DESIGN_THEME_ENTRIES.some(entry => entry.id === child)) onDesignTheme({ ...designTheme, id: child as DesignThemeConfig['id'] })
      else if (main === 'color' && child) {
        if (child === 'default') onSelection(scheme, { kind: 'none' })
        else if (child === 'preset') onSelection(scheme, { kind: 'preset', name: preset.key })
        else if (child.startsWith('custom:') && customThemes.some(item => `custom:${item.name}` === child)) onSelection(scheme, { kind: 'custom', name: child.slice(7) })
      } else if (main === 'mode' && modes.some(mode => mode.key === child)) onColorMode(child as ColorMode)
    }} />
}
