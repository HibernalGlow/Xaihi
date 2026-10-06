import { Database, HardDrive } from "lucide-react"
import { useTranslation } from "react-i18next"

import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { useLocalBackendStatus } from "@/hooks/useLocalBackendStatus"
import { RuntimeRow, SettingsStepCard } from "./primitives"

export function DataSection() {
  const { t } = useTranslation()
  const runtimeInfo = getRuntimeConnectionInfo()
  const backendStatus = useLocalBackendStatus()
  const backendStatusKind = backendStatus.data?.status ?? (backendStatus.isFetching ? "checking" : "unknown")
  const backendStatusLabel = backendStatusKind === "ready"
    ? t("settings:developerRuntime.statusReady")
    : backendStatusKind === "missing-config"
      ? t("settings:developerRuntime.statusMissingConfig")
      : backendStatusKind === "unreachable"
        ? t("settings:developerRuntime.statusUnreachable")
        : backendStatusKind === "checking"
          ? t("settings:developerRuntime.statusChecking")
          : t("common:unknown")

  return (
    <div className="space-y-3">
      <SettingsStepCard
        id="storage"
        title={t("settings:data.title")}
        description={t("settings:data.description")}
        icon={HardDrive}
        delay={0.02}
      >
        <div className="grid grid-cols-1 gap-2">
          <RuntimeRow label={t("settings:data.backendEndpoint")} value={runtimeInfo.backendUrl ?? t("common:unknown")} />
          <RuntimeRow label={t("settings:data.backendStatus")} value={backendStatusLabel} />
          <RuntimeRow
            label={t("settings:data.token")}
            value={runtimeInfo.backendTokenConfigured
              ? t("settings:developerRuntime.configured")
              : t("settings:developerRuntime.notConfigured")}
          />
          <RuntimeRow label={t("settings:data.databasePath")} value={t("settings:data.databasePathManaged")} />
        </div>

        <div className="mt-4 rounded-sm border border-border/60 bg-muted/15 p-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground">{t("settings:data.nextTitle")}</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("settings:data.nextDescription")}</p>
            </div>
          </div>
        </div>
      </SettingsStepCard>
    </div>
  )
}
