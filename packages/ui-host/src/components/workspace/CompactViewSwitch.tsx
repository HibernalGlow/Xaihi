import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Pin } from 'lucide-react'
import { currentDefaultView } from '@/lib/workspaceViewPreference'
import type { CardLayout, DefaultWorkspaceView, ViewMode } from '@/types/workspace'
import { Button } from '@/components/ui/button'
import { CompactPressPicker } from './CompactPressPicker'
import { ViewSwitchLoopToggle } from './ViewSwitchLoopToggle'

type Option<T> = { key: T; labelKey: string; hintKey: string; icon: ComponentType<{ className?: string }> }

export function CompactViewSwitch({ viewMode, cardLayout, views, layouts, onView, onLayout, loop = false, onLoopChange, defaultView = null, navigation = null, onSetDefault, saveStatus = { state: "local" } }: {
  viewMode: ViewMode; cardLayout: CardLayout; views: Option<ViewMode>[]; layouts: Option<CardLayout>[]
  loop?: boolean; onLoopChange?(enabled: boolean): void
  onView(mode: ViewMode): void; onLayout(layout: CardLayout): void
  saveStatus?: { state: "local" | "pending" | "saved" | "error"; detail?: string };
  defaultView?: DefaultWorkspaceView | null; navigation?: "focus" | "free" | null; onSetDefault?(): void
}) {
  const { t } = useTranslation()
  const current = views.find(option => option.key === viewMode) ?? views[0]!
  const layout = layouts.find(option => option.key === cardLayout) ?? layouts[0]!
  const label = `${t(current.labelKey)}${viewMode === 'cards' ? ` · ${t(layout.labelKey)}` : ''}`
  const completeLabel = `${label}${viewMode === 'cards' && cardLayout === 'trellis' ? ` · ${t(`view:trellis.${navigation ?? 'focus'}`)}` : ''}`
  const isDefault = defaultView !== null && JSON.stringify(defaultView) === JSON.stringify(currentDefaultView(viewMode, cardLayout, navigation))
  return <CompactPressPicker value={viewMode} childValue={cardLayout} childParent="cards"
    options={views.map(option => ({ key: option.key, icon: option.icon, label: t(option.labelKey), hint: t(option.hintKey) }))}
    childOptions={layouts.map(option => ({ key: option.key, icon: option.icon, label: t(option.labelKey), hint: t(option.hintKey) }))}
    onSelect={(view, child) => { if (view === 'cards' && child) onLayout(child as CardLayout); onView(view as ViewMode) }}
    loop={loop} testId="compact-view-switch" optionAttribute="data-view-mode" childAttribute="data-card-layout"
    triggerLabel={t('topbar:compactView.current', { name: label })} title={t('topbar:compactView.views')}
    childTitle={t('topbar:compactView.layouts')} childHint={t('topbar:compactView.down')}
    gestureHint={t('topbar:compactView.gesture')} releaseHint={t('topbar:compactView.release')}
    footer={<>
      {onLoopChange && <ViewSwitchLoopToggle checked={loop} onCheckedChange={onLoopChange} />}
      {onSetDefault && <div className="mt-2 border-t border-border/60 pt-2">
        <Button variant="ghost" size="sm" className="h-auto w-full justify-start gap-2 rounded-lg px-2 py-2 text-left"
          disabled={isDefault && saveStatus.state !== "error"} aria-label={t('topbar:compactView.setDefault')} onClick={() => { onSetDefault(); if (saveStatus.state === "error") window.dispatchEvent(new Event("xaihi-ui-preference-retry")) }}>
          {isDefault ? <Check className="size-[18px] shrink-0 text-primary" /> : <Pin className="size-[18px] shrink-0" />}
          <span className="min-w-0"><span className="block text-xs">{t(isDefault ? 'topbar:compactView.isDefault' : 'topbar:compactView.setDefault')}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{completeLabel}</span></span>
        </Button>
        <p className="px-2 pb-1 text-[10px] text-muted-foreground" role="status">{saveStatus.state === 'local' ? t('topbar:compactView.defaultHint') : t(`topbar:compactView.save.${saveStatus.state}`)}{saveStatus.detail && <span className="block text-destructive">{saveStatus.detail}</span>}</p>
      </div>}
    </>}
  />
}
