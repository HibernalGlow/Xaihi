import { Code2, RefreshCcw, Server } from "lucide-react"
import { useTranslation } from "react-i18next"

import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Webview2ExperimentsPanel } from "@/components/views/Webview2ExperimentsPanel"
import { useHostConnection } from "@/hooks/useHostConnection"
import { RuntimeRow, SettingsStepCard } from "./primitives"
import { DesktopTraySettings } from "./DesktopTraySettings"
import { NodeMemoryProtectionSettings } from "./NodeMemoryProtectionSettings"

/**
 * 开发运行时设置段。
 *
 * 过去这一段是 Xiranite REST 后端的驾驶舱：健康轮询（`useLocalBackendStatus`）、重启后端、
 * 节点源热重载开关、复制附着/一键命令。那条通路整块作废（2026-10-07 使用者口径：
 * "不再使用 rest 架构通信，一切都走这个 DSH 插件标准来"），所以只留仍然为真的两行
 * （宿主类型、前端来源），连接状态改读桥握手（`useHostConnection`，无轮询——握手是一次
 * 协商不是会崩的连接），内存保护与 Webview2 面板的 available 门也随之换成桥就绪。
 */
export function RuntimeSection() {
  const { t } = useTranslation()
  const runtimeInfo = getRuntimeConnectionInfo()
  const host = useHostConnection()
  const bridgeStatusLabel = host.ready
    ? t("settings:developerRuntime.bridgeReady")
    : host.detached
      ? t("settings:developerRuntime.bridgeDetached")
      : t("settings:developerRuntime.bridgeNegotiating")

  return (
    <div className="space-y-3">
      <SettingsStepCard
        id="connection"
        title={t("settings:developerRuntime.title")}
        description={t("settings:developerRuntime.description")}
        icon={Code2}
        delay={0.02}
        actions={
          <Badge variant={runtimeInfo.frontendSource === "vite-dev" ? "default" : "outline"} className="font-mono text-[9px]">
            {t(`settings:developerRuntime.frontendSource.${runtimeInfo.frontendSource}`)}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <RuntimeRow label={t("settings:developerRuntime.hostRuntime")} value={runtimeInfo.hostRuntime} />
            <RuntimeRow label={t("settings:developerRuntime.frontend")} value={runtimeInfo.frontendOrigin} />
            <RuntimeRow label={t("settings:developerRuntime.bridgeStatus")} value={bridgeStatusLabel} />
            <RuntimeRow
              label={t("settings:developerRuntime.bridgeGroups")}
              value={host.granted.length > 0 ? host.granted.join(", ") : t("settings:developerRuntime.bridgeGroupsNone")}
            />
          </div>

          <div className="flex items-start gap-2 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
            <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings:developerRuntime.bridgeHint")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => window.location.reload()}>
              <RefreshCcw className="size-3.5" />
              {t("settings:developerRuntime.reload")}
            </Button>
          </div>
        </div>
      </SettingsStepCard>

      <DesktopTraySettings />

      <NodeMemoryProtectionSettings available={host.ready} />

      <SettingsStepCard
        id="webview2"
        title={t("settings:webview2.title")}
        description={t("settings:webview2.description")}
        icon={Server}
        delay={0.06}
      >
        <div className="-m-1">
          <Webview2ExperimentsPanel />
        </div>
      </SettingsStepCard>
    </div>
  )
}
