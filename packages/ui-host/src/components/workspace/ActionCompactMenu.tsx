import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelsTopLeft } from 'lucide-react'
import { executeAction, getActionIcon, resolveActionLabel, useActionViews, type ActionContext } from '@/actions'
import { parseAsString, useQueryStates } from 'nuqs'
import { SETTINGS_STAGES } from '@/components/views/settings/types'
import { applyWheelLayout, WHEEL_MAX_SECTORS } from '@/actions/wheelPreferences'
import { useWorkspaceActions, useWorkspaceShallowSelector } from '@/store/workspaceStore'
import { CompactPressPicker } from './CompactPressPicker'
import { ViewSwitchLoopToggle } from './ViewSwitchLoopToggle'

/** Keeps the action registry and existing order/visibility preferences behind the shared picker. */
export function ActionCompactMenu({ context }: { context: ActionContext }) {
  const { t } = useTranslation()
  const views = useActionViews()
  const actions = useWorkspaceActions()
  const [, setSettingsRoute] = useQueryStates({ settings: parseAsString, settingsStep: parseAsString }, { history: 'replace', shallow: true })
  const [lastAction, setLastAction] = useState<string | null>(null)
  const preferences = useWorkspaceShallowSelector(workspace => ({
    order: workspace.wheelActionOrder,
    hiddenActions: workspace.wheelHiddenActions,
    loop: workspace.viewSwitchLoop,
  }))
  const visible = useMemo(() => applyWheelLayout(views.filter(view => view.presentation === 'command'), preferences, WHEEL_MAX_SECTORS), [views, preferences])
  const current = visible.find(view => view.toggled)?.id ?? visible.find(view => view.id === lastAction)?.id ?? visible[0]?.id ?? ''
  return <CompactPressPicker value={current}
    options={visible.map(view => ({ key: view.id, label: t(resolveActionLabel(view.labelKey, context)), icon: getActionIcon(view.id), disabled: !view.enabled, badge: view.badge, toggled: view.toggled,
      ...(view.id === 'workspace.settings' ? { childrenTitle: t('overlay:settings'), children: SETTINGS_STAGES.map(stage => ({
        key: stage.id, label: t(stage.labelKey), icon: stage.icon,
        children: stage.steps.map(step => ({ key: step.id, label: t(step.labelKey) })),
      })) } : {}),
    }))}
    onSelect={(id, section, step) => {
      if (!executeAction(id)) return
      setLastAction(id)
      if (id === 'workspace.settings') void setSettingsRoute({ settings: section ?? 'appearance', settingsStep: step ?? null })
    }}
    behavior="command" align="end" loop={preferences.loop}
    showIndicators={false} triggerIcon={PanelsTopLeft} nestedHint={t("topbar:compactView.settingsNested")} triggerLabel={t('common:moreActions')} title={t('common:moreActions')}
    testId="compact-action-switch" optionAttribute="data-action-id"
    badge={visible.reduce((sum, view) => sum + view.badge, 0)}
    gestureHint={t('topbar:compactView.gesture')} releaseHint={t('topbar:compactView.releaseAction')}
    footer={<ViewSwitchLoopToggle checked={preferences.loop} onCheckedChange={actions.setViewSwitchLoop} />}
  />
}
