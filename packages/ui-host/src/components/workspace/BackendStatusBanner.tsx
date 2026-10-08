import { Server, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useDocumentBridge } from "@/document/bridge-context"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { Button } from "@/components/ui/button"

/**
 * 宿主连接横幅。
 *
 * 它过去报告的是 Xiranite 那个独立的本地后端（`useLocalBackendStatus()` 的 REST 健康检查）：
 * 在本仓那个后端不存在，于是永远落进 `missing-config`，**每打开一次工作台就常驻一条红色报错**，
 * 要使用者去设 `window.__XIRANITE_BACKEND__`。2026-10-07 使用者拍了口径"不再使用 rest 架构通信，
 * 一切都走 DSH 插件标准"，那个全局量连同它背后整条通路一起作废（`document/main.tsx` 里那段兜底
 * 已删）——留着这条横幅等于把已经改掉的事在界面上说反，而"让使用者去配一个本仓不存在的东西"
 * 比不报更坏。
 *
 * 现在它读的是**这一份文档的桥**（`document/bridge-context.tsx`），只有两条读法：
 * - 有桥 ⇒ 不显示。接通是常态；"桥在、握手还没落地"只是几百毫秒的过渡，不该为它闪一条红横幅。
 * - 没桥 ⇒ 一条说真话的退化：这份文档不在宿主里，要问对面的那几组能力（配置 / 状态持久 / 环境）
 *   暂时不可用。这正是 ADR-0011 决定 4 要的那条可见退化。
 *
 * `Retry` 与 `Copy diagnostics` 一并去掉：没有可重试的握手（桥要么在这份文档里、要么不在），
 * 而诊断那一条读的是已作废的 REST 状态（`formatLocalBackendDiagnostics`）。留着的按钮开的是
 * 工作台**自己的**设置面，与"后端"无关。
 */
export function BackendStatusBanner() {
  const { t } = useTranslation()
  const bridge = useDocumentBridge()
  const workspaceActions = useWorkspaceActions()

  if (bridge !== null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-shrink-0 items-center gap-3 border-b border-destructive/25 bg-destructive/8 px-4 py-2 text-xs text-destructive"
    >
      <Server className="h-3.5 w-3.5 flex-shrink-0" />
      <p className="min-w-0 flex-1 truncate">{t("settings:backendBanner.noHost")}</p>
      <div className="xiranite-app-region-no-drag flex flex-shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => workspaceActions.setOverlay("settings")}
        >
          <Settings className="h-3 w-3" />
          {t("settings:backendBanner.openRuntime")}
        </Button>
      </div>
    </div>
  )
}
