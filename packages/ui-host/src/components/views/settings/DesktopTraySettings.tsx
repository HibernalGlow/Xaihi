import { useEffect, useState, useSyncExternalStore } from "react"
import { AppWindow } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Switch } from "@/components/ui/switch"
import {
  getMainTrayState,
  initializeDesktopTrays,
  setMainTrayEnabled,
  subscribeMainTrayState,
} from "@/desktop/tray/trayCoordinator"

import { SettingsStepCard } from "./primitives"

export function DesktopTraySettings() {
  const { t } = useTranslation()
  const state = useSyncExternalStore(subscribeMainTrayState, getMainTrayState, getMainTrayState)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void initializeDesktopTrays().catch(() => undefined)
  }, [])

  async function changeEnabled(enabled: boolean) {
    setSaving(true)
    try {
      await setMainTrayEnabled(enabled)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsStepCard
      id="desktop-tray"
      title={t("settings:desktopTray.title")}
      description={t("settings:desktopTray.description")}
      icon={AppWindow}
      delay={0.04}
    >
      <div className="flex items-center justify-between gap-4 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{t("settings:desktopTray.keepRunning")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {state.supported
              ? t("settings:desktopTray.keepRunningDescription")
              : t("settings:desktopTray.unsupported")}
          </p>
        </div>
        <Switch
          aria-label={t("settings:desktopTray.keepRunning")}
          checked={state.enabled}
          disabled={!state.supported || saving}
          onCheckedChange={changeEnabled}
        />
      </div>
    </SettingsStepCard>
  )
}
