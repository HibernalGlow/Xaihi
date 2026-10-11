import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'

export function ViewSwitchLoopToggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange(enabled: boolean): void }) {
  const { t } = useTranslation()
  return <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 border-t border-border/60 px-2 py-2">
    <span><span className="block text-xs">{t('topbar:compactView.loop')}</span><span className="block text-[10px] text-muted-foreground">{t('topbar:compactView.loopHint')}</span></span>
    <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} aria-label={t('topbar:compactView.loop')} />
  </label>
}
