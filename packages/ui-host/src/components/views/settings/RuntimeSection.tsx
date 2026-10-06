import { useEffect, useState } from "react"
import { Code2, Copy, ExternalLink, RefreshCcw, Server, Terminal } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  getNodeSourceHotReload,
  restartLocalBackend,
  setNodeSourceHotReload,
  type LocalBackendControlRestartResult,
} from "@/backend/localBackendControl"
import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Webview2ExperimentsPanel } from "@/components/views/Webview2ExperimentsPanel"
import { useLocalBackendStatus } from "@/hooks/useLocalBackendStatus"
import { cn } from "@/lib/utils"
import { RuntimeRow, SettingsStepCard } from "./primitives"
import { NODE_SOURCE_HOT_RELOAD_STORAGE_KEY } from "./themeMeta"
import { DesktopTraySettings } from "./DesktopTraySettings"
import { NodeMemoryProtectionSettings } from "./NodeMemoryProtectionSettings"

export function RuntimeSection() {
  const { t } = useTranslation()
  const runtimeInfo = getRuntimeConnectionInfo()
  const backendStatus = useLocalBackendStatus()
  const [copiedCommand, setCopiedCommand] = useState<"attach" | "start" | null>(null)
  const [backendRestarting, setBackendRestarting] = useState(false)
  const [backendRestartResult, setBackendRestartResult] = useState<LocalBackendControlRestartResult | null>(null)
  const [nodeSourceHotReload, setNodeSourceHotReloadState] = useState(false)
  const [nodeSourceHotReloadSupported, setNodeSourceHotReloadSupported] = useState(false)
  const [nodeSourceHotReloadSaving, setNodeSourceHotReloadSaving] = useState(false)

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

  useEffect(() => {
    if (backendStatus.data?.status !== "ready") return
    let cancelled = false
    void (async () => {
      try {
        const saved = window.localStorage.getItem(NODE_SOURCE_HOT_RELOAD_STORAGE_KEY)
        const requested = saved === null ? undefined : saved === "1"
        const next = requested === undefined
          ? await getNodeSourceHotReload()
          : await setNodeSourceHotReload(requested)
        if (cancelled) return
        setNodeSourceHotReloadSupported(next.supported)
        setNodeSourceHotReloadState(next.enabled)
      } catch {
        if (!cancelled) setNodeSourceHotReloadSupported(false)
      }
    })()
    return () => { cancelled = true }
  }, [backendStatus.data?.status, backendStatus.data?.config?.baseUrl])

  async function changeNodeSourceHotReload(enabled: boolean) {
    setNodeSourceHotReloadSaving(true)
    try {
      const next = await setNodeSourceHotReload(enabled)
      setNodeSourceHotReloadSupported(next.supported)
      setNodeSourceHotReloadState(next.enabled)
      window.localStorage.setItem(NODE_SOURCE_HOT_RELOAD_STORAGE_KEY, next.enabled ? "1" : "0")
    } finally {
      setNodeSourceHotReloadSaving(false)
    }
  }

  async function copyDevCommand(kind: "attach" | "start") {
    const command = kind === "attach" ? runtimeInfo.devAttachCommand : runtimeInfo.devStartCommand
    await navigator.clipboard.writeText(command)
    setCopiedCommand(kind)
    window.setTimeout(() => setCopiedCommand(null), 1200)
  }

  function openFrontendDevUrl() {
    if (!runtimeInfo.frontendDevUrl) return
    window.open(runtimeInfo.frontendDevUrl, "_blank", "noopener,noreferrer")
  }

  async function restartBackendFromSettings() {
    setBackendRestarting(true)
    setBackendRestartResult(null)
    try {
      const result = await restartLocalBackend()
      setBackendRestartResult(result)
      await backendStatus.refetch()
    } catch (error) {
      setBackendRestartResult({
        restarted: false,
        supported: false,
        source: "none",
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBackendRestarting(false)
    }
  }

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
            <RuntimeRow label={t("settings:developerRuntime.frontend")} value={runtimeInfo.frontendDevUrl ?? runtimeInfo.frontendOrigin} />
            <RuntimeRow label={t("settings:developerRuntime.backend")} value={runtimeInfo.backendUrl ?? t("common:unknown")} />
            <RuntimeRow
              label={t("settings:developerRuntime.token")}
              value={runtimeInfo.backendTokenConfigured
                ? t("settings:developerRuntime.configured")
                : t("settings:developerRuntime.notConfigured")}
            />
            <RuntimeRow label={t("settings:developerRuntime.status")} value={backendStatusLabel} />
          </div>

          {backendStatus.data?.error && backendStatus.data.status !== "ready" && (
            <div className="rounded-sm border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] leading-relaxed text-destructive">
              {backendStatus.data.error}
            </div>
          )}

          {backendRestartResult && (
            <div className={cn(
              "rounded-sm border px-3 py-2 text-[11px] leading-relaxed",
              backendRestartResult.restarted
                ? "border-primary/25 bg-primary/8 text-foreground"
                : "border-muted-foreground/25 bg-muted/20 text-muted-foreground",
            )}>
              {backendRestartResult.message}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
            <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("settings:developerRuntime.hotSwitchHint")}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-foreground">{t("settings:timeline.nodeHotReload")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t("settings:timeline.nodeHotReloadDesc")}
              </p>
            </div>
            <Switch
              aria-label={t("settings:timeline.nodeHotReload")}
              checked={nodeSourceHotReload}
              disabled={!nodeSourceHotReloadSupported || nodeSourceHotReloadSaving}
              onCheckedChange={changeNodeSourceHotReload}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => window.location.reload()}>
              <RefreshCcw className="size-3.5" />
              {t("settings:developerRuntime.reload")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={backendStatus.isFetching}
              onClick={() => backendStatus.refetch()}
            >
              <Server className="size-3.5" />
              {backendStatus.isFetching
                ? t("settings:developerRuntime.statusChecking")
                : t("settings:developerRuntime.refreshStatus")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={backendRestarting}
              onClick={restartBackendFromSettings}
            >
              <RefreshCcw className={cn("size-3.5", backendRestarting && "animate-spin")} />
              {backendRestarting
                ? t("settings:developerRuntime.restartingBackend")
                : t("settings:developerRuntime.restartBackend")}
            </Button>
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => copyDevCommand("attach")}>
              <Copy className="size-3.5" />
              {copiedCommand === "attach"
                ? t("settings:developerRuntime.copied")
                : t("settings:developerRuntime.copyAttach")}
            </Button>
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => copyDevCommand("start")}>
              <Terminal className="size-3.5" />
              {copiedCommand === "start"
                ? t("settings:developerRuntime.copied")
                : t("settings:developerRuntime.copyStart")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={!runtimeInfo.frontendDevUrl}
              onClick={openFrontendDevUrl}
            >
              <ExternalLink className="size-3.5" />
              {t("settings:developerRuntime.openFrontend")}
            </Button>
          </div>
        </div>
      </SettingsStepCard>

      <DesktopTraySettings />

      <NodeMemoryProtectionSettings available={backendStatusKind === "ready"} />

      <SettingsStepCard
        id="webview2"
        title={t("settings:webview2.title")}
        description={t("settings:webview2.description")}
        icon={Server}
        delay={0.06}
      >
        <div className="-m-1">
          <Webview2ExperimentsPanel available={backendStatusKind === "ready"} />
        </div>
      </SettingsStepCard>
    </div>
  )
}
