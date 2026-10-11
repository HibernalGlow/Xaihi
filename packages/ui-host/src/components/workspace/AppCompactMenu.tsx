import { useState, type ReactNode } from 'react'
import { Activity, BookOpen, ChevronDown, Database, History, LogOut, Plus, Settings, ShieldAlert, SplitSquareVertical, LayoutDashboard, Trash2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseAsString, useQueryStates } from 'nuqs'
import { SETTINGS_STAGES } from '@/components/views/settings/types'
import type { CardLayout, ViewMode } from '@/types/workspace'
import { CompactPressPicker, type CompactPickerOption } from './CompactPressPicker'

type MenuOption<T> = { key: T; labelKey: string; icon: CompactPickerOption['icon'] }

/** The existing application commands, presented through the shared vertical picker. */
export function AppCompactMenu({ version, hazardMode, viewMode, cardLayout, views, layouts, loop,
  onView, onLayout, onSettings, onRegistry, onOperations, onHistory, onDeletions, onDashboard, onDevTools, onHazard, onExit,
}: {
  version: string; hazardMode: boolean; viewMode: ViewMode; cardLayout: CardLayout; loop: boolean
  views: MenuOption<ViewMode>[]; layouts: MenuOption<CardLayout>[]
  onView(value: ViewMode): void; onLayout(value: CardLayout): void
  onSettings(): void; onRegistry(): void; onOperations(): void; onHistory(): void; onDeletions(): void
  onDashboard(): void; onDevTools(): void; onHazard(): void; onExit(): void
}) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('settings')
  const [, setSettingsRoute] = useQueryStates({ settings: parseAsString, settingsStep: parseAsString }, { history: 'replace', shallow: true })
  const settingsChildren = SETTINGS_STAGES.map(stage => ({ key: stage.id, label: t(stage.labelKey), icon: stage.icon,
    children: stage.steps.map(step => ({ key: step.id, label: t(step.labelKey) })),
  }))
  const commands: Record<string, () => void> = { registry: onRegistry, operations: onOperations, history: onHistory,
    deletions: onDeletions, dashboard: onDashboard, devtools: onDevTools, hazard: onHazard, exit: onExit }
  const options: CompactPickerOption[] = [
    { key: 'settings', label: t('overlay:settings'), icon: Settings, shortcut: 'Alt+P', childrenTitle: t('overlay:settings'), children: settingsChildren },
    { key: 'views', branchOnly: true, label: t('topbar:appMenu.panels'), icon: LayoutDashboard, childrenTitle: t('topbar:compactView.views'),
      children: views.map(option => ({ key: option.key, label: t(option.labelKey), icon: option.icon, toggled: option.key === viewMode })) },
    { key: 'layouts', branchOnly: true, label: t('topbar:appMenu.layouts'), icon: SplitSquareVertical, childrenTitle: t('topbar:compactView.layouts'),
      children: layouts.map(option => ({ key: option.key, label: t(option.labelKey), icon: option.icon, toggled: option.key === cardLayout })) },
    { key: 'registry', separatorBefore: true, label: t('overlay:registry'), icon: Plus },
    { key: 'operations', label: t('overlay:operations'), icon: Activity },
    { key: 'history', label: t('overlay:history'), icon: History, shortcut: 'Alt+H' },
    { key: 'deletions', label: t('overlay:deletions'), icon: Trash2 },
    { key: 'dashboard', label: t('topbar:viewMode.dashboard'), icon: Database },
    { key: 'runtime', separatorBefore: true, label: t('topbar:appMenu.runtime'), icon: BookOpen, childrenTitle: t('settings:sections.runtime'), children: settingsChildren.find(stage => stage.key === 'runtime')?.children },
    { key: 'devtools', label: t('settings:webview2.openDevTools'), icon: Wrench, shortcut: 'F12' },
    { key: 'hazard', label: hazardMode ? 'Hazard On' : 'Hazard', icon: ShieldAlert, shortcut: hazardMode ? 'ON' : 'ARM', tone: 'danger', toggled: hazardMode },
    { key: 'exit', separatorBefore: true, label: t('topbar:appMenu.exit'), icon: LogOut, tone: 'danger' },
  ]
  const triggerContent: ReactNode = <><span className="min-w-0 text-left"><span className="block text-sm font-semibold leading-none tracking-tight text-primary">{t('common:appName')}</span><span className="mt-1 block text-[9px] leading-none text-muted-foreground/60">v{version}</span></span><ChevronDown className="size-3.5 text-muted-foreground/60" /></>
  return <CompactPressPicker value={current} options={options} loop={loop} orientation="vertical" behavior="command"
    triggerLabel={t('topbar:appMenu.label')} title={t('topbar:appMenu.label')} triggerContent={triggerContent} showIndicators={false}
    gestureHint={t('topbar:appMenu.gesture')} releaseHint={t('topbar:compactView.releaseAction')} nestedHint={t('topbar:appMenu.nested')}
    testId="compact-app-menu" optionAttribute="data-app-command"
    onSelect={(command, child, detail) => {
      setCurrent(command)
      if (command === 'settings' || command === 'runtime') {
        onSettings()
        void setSettingsRoute({ settings: command === 'runtime' ? 'runtime' : child ?? 'appearance', settingsStep: command === 'runtime' ? child ?? null : detail ?? null })
      } else if (command === 'views') {
        if (child && views.some(option => option.key === child)) onView(child as ViewMode)
      } else if (command === 'layouts') {
        if (child && layouts.some(option => option.key === child)) { onView('cards'); onLayout(child as CardLayout) }
      } else commands[command]?.()
    }} />
}
