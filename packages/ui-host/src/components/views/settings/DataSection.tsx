import { Database, HardDrive } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useHostConnection } from "@/hooks/useHostConnection"
import { RuntimeRow, SettingsStepCard } from "./primitives"

/**
 * 数据设置段。
 *
 * 过去这一段报告 Xiranite REST 后端的地址、token 与"由 Local Backend 管理"的数据库路径。
 * 那条通路整块作废（2026-10-07 使用者口径："不再使用 rest 架构通信，一切都走这个 DSH
 * 插件标准来"），所以这里只报告两件真事：桥接通没有、配置与快照落在宿主插件的哪个格。
 */
export function DataSection() {
  const { t } = useTranslation()
  const host = useHostConnection()
  const bridgeStatusLabel = host.ready
    ? t("settings:data.bridgeReady")
    : host.detached
      ? t("settings:data.bridgeDetached")
      : t("settings:data.bridgeNegotiating")

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
          <RuntimeRow label={t("settings:data.bridgeStatus")} value={bridgeStatusLabel} />
          <RuntimeRow label={t("settings:data.configHome")} value={t("settings:data.configHomeValue")} />
          <RuntimeRow label={t("settings:data.snapshotHome")} value={t("settings:data.snapshotHomeValue")} />
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
