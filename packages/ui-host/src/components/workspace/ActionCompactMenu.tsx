import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ellipsis } from 'lucide-react'
import { executeAction, getActionIcon, resolveActionLabel, useActionViews, type ActionContext } from '@/actions'
import { applyWheelLayout, WHEEL_MAX_SECTORS } from '@/actions/wheelPreferences'
import { useWorkspaceActions, useWorkspaceShallowSelector } from '@/store/workspaceStore'
import { CompactPressPicker } from './CompactPressPicker'
import { ViewSwitchLoopToggle } from './ViewSwitchLoopToggle'

/** Keeps the action registry and existing order/visibility preferences behind the shared picker. */
export function ActionCompactMenu({ context }: { context: ActionContext }) {
  const { t } = useTranslation()
  const views = useActionViews()
  const actions = useWorkspaceActions()
  const [lastAction, setLastAction] = useState<string | null>(null)
  const preferences = useWorkspaceShallowSelector(workspace => ({
    order: workspace.wheelActionOrder,
    hiddenActions: workspace.wheelHiddenActions,
    loop: workspace.viewSwitchLoop,
  }))
  const visible = useMemo(() => applyWheelLayout(views.filter(view => view.presentation === 'command'), preferences, WHEEL_MAX_SECTORS), [views, preferences])
  const current = visible.find(view => view.toggled)?.id ?? visible.find(view => view.id === lastAction)?.id ?? visible[0]?.id ?? ''
  return <CompactPressPicker value={current}
    options={visible.map(view => ({ key: view.id, label: t(resolveActionLabel(view.labelKey, context)), icon: getActionIcon(view.id), disabled: !view.enabled, badge: view.badge, toggled: view.toggled }))}
    onSelect={id => { if (executeAction(id)) setLastAction(id) }}
    behavior="command" align="end" loop={preferences.loop}
    triggerIcon={Ellipsis} triggerLabel={t('common:moreActions')} title={t('common:moreActions')}
    testId="compact-action-switch" optionAttribute="data-action-id"
    badge={visible.reduce((sum, view) => sum + view.badge, 0)}
    gestureHint={t('topbar:compactView.gesture')} releaseHint={t('topbar:compactView.releaseAction')}
    footer={<ViewSwitchLoopToggle checked={preferences.loop} onCheckedChange={actions.setViewSwitchLoop} />}
  />
}
