/**
 * 应用根组件。
 *
 * 通过 URL query 参数 `floatingComponent` 区分两种渲染模式：
 *  - 命中时：懒加载 {@link FloatingComponentWindow}，仅渲染单个浮窗组件（用于桌面端多窗口拆分）；
 *  - 否则：渲染完整 {@link WorkspaceLayout} 工作区。
 *
 * 顶层 Provider 顺序：WorkspaceProvider → ContextMenuProvider → AppConfigSync/WorkspaceAppearance → 内容。
 */
import { lazy, Suspense, useEffect, useMemo } from "react"
import { ThemeProvider } from "next-themes"
import { WorkspaceProvider } from "@/store/workspaceContext"
import { WorkspaceAppearance } from "@/components/workspace/WorkspaceAppearance"
import { AppConfigSync } from "@/components/workspace/AppConfigSync"
import { ContextMenuProvider } from "@/components/context-menu"
import { parseAsString, useQueryStates } from "nuqs"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { DesktopTrayBridge } from "@/desktop/tray/DesktopTrayBridge"
import { WorkspaceWindowRestorer } from "@/components/workspace/WorkspaceWindowRestorer"
import { WorkspaceWindowFrameSync } from "@/components/workspace/WorkspaceWindowFrameSync"
import { isOwnedBrowserPopup } from "@/backend/browserPopup"

const WorkspaceLayout = lazy(() =>
  startupDebugAsync("lazy:workspace-layout", () => import("@/components/workspace/WorkspaceLayout")).then((module) => ({
    default: module.WorkspaceLayout,
  })),
)

const FloatingComponentWindow = lazy(() =>
  startupDebugAsync("lazy:floating-component-window", () => import("@/components/workspace/FloatingComponentWindow")).then((module) => ({
    default: module.FloatingComponentWindow,
  })),
)

/**
 * nuqs URL 参数解析器：用于识别当前窗口是否为"浮窗组件"模式。
 * - `floatingComponent` —— 组件实例 id，存在即进入浮窗模式；
 * - `node` —— 目标节点 id（如 sleept / xaihi-sleept），原生桌面端多窗口子窗参数；
 * - `windowId` / `moduleId` / `title` —— 浮窗的元信息回退值；
 * - `workspaceId` —— 组件尚未完成水合时使用的工作区归属。
 */
const floatingWindowParsers = {
  floatingComponent: parseAsString,
  node: parseAsString,
  windowId: parseAsString,
  moduleId: parseAsString,
  workspaceId: parseAsString,
  title: parseAsString,
  popupToken: parseAsString,
}

function hasNativeXaihiWindow(): boolean {
  if (typeof window === "undefined") return false
  const desktop = (window as Window & {
    dshDesktop?: { xaihiWindow?: { open?: unknown } }
  }).dshDesktop
  return typeof desktop?.xaihiWindow?.open === "function"
}

export function shouldRenderFloatingWindow(
  input: { floatingComponent?: string | null; targetModuleId?: string | null },
  nativeShell: boolean,
  browserPopupOwned = false,
): boolean {
  return Boolean(
    (input.floatingComponent && (nativeShell || browserPopupOwned))
    || (nativeShell && input.targetModuleId),
  )
}

export function shouldDiscardStaleWindowAddress(
  input: { floatingComponent?: string | null; node?: string | null; moduleId?: string | null },
  nativeShell: boolean,
): boolean {
  return !nativeShell && Boolean(input.floatingComponent || input.node || input.moduleId)
}

function hasBrowserPopupOwner(componentId?: string | null, popupToken?: string | null): boolean {
  if (typeof window === "undefined") return false
  try {
    return isOwnedBrowserPopup(window.opener, window.location.origin, componentId, popupToken)
  } catch {
    return false
  }
}

function clearFloatingWindowQuery(): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  for (const key of ["floatingComponent", "node", "windowId", "moduleId", "workspaceId", "title", "popupToken"]) {
    url.searchParams.delete(key)
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

export function App() {
  const [params] = useQueryStates(floatingWindowParsers)

  // 综合识别独立窗口目标：
  // 1. URL 中的 node / floatingComponent / moduleId
  // 2. window.__XAIHI_UI__ 中的 node 启动配置
  // 3. window.location.search 原生查询参数（防御初始水合时序）
  const { isFloating, activeCompId, activeModuleId, activeWindowId } = useMemo(() => {
    let rawNode = params.node
    if (!rawNode && typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        rawNode = urlParams.get("node")
      } catch {
        // ignore
      }
    }
    if (!rawNode && typeof globalThis !== "undefined") {
      const boot = (globalThis as unknown as { __XAIHI_UI__?: { node?: string } }).__XAIHI_UI__
      if (boot?.node) rawNode = boot.node
    }

    const normalizedNode = rawNode ? rawNode.trim().replace(/^xaihi-/, "") : null
    const targetModuleId = params.moduleId || normalizedNode || null
    const nativeShell = hasNativeXaihiWindow()
    const browserPopupOwned = Boolean(
      params.floatingComponent && hasBrowserPopupOwner(params.floatingComponent, params.popupToken),
    )
    // `node` is the native desktop child-window address. A browser can reopen a
    // stale `?node=...` URL from its previous session, but it must remain on the
    // workbench instead of turning that tab into a Shellect (or other node) popup.
    // Explicit browser popups carry `floatingComponent` and a live same-origin opener;
    // a browser-restored popup has neither and falls back to the workbench.
    const isFloatingMode = shouldRenderFloatingWindow(
      { floatingComponent: params.floatingComponent, targetModuleId },
      nativeShell,
      browserPopupOwned,
    )

    const compId = params.floatingComponent || (params.windowId ?? (targetModuleId ? `window-${targetModuleId}` : "unknown"))
    const windowId = params.windowId ?? compId

    return {
      isFloating: isFloatingMode,
      activeCompId: compId,
      activeModuleId: targetModuleId,
      activeWindowId: windowId,
    }
  }, [params])

  useEffect(() => {
    const nativeShell = hasNativeXaihiWindow()
    if (
      !shouldDiscardStaleWindowAddress(params, nativeShell)
      || isFloating
      || hasBrowserPopupOwner(params.floatingComponent, params.popupToken)
    ) return
    // A browser can restore a previously opened component or desktop node window
    // without its original shell/opener. Close it when possible and clear its address.
    try {
      window.close()
      if (window.closed) return
    } catch {
      // Browsers ignore close() for ordinary tabs; continue with URL cleanup.
    }
    clearFloatingWindowQuery()
  }, [isFloating, params.floatingComponent, params.moduleId, params.node, params.popupToken])

  useEffect(() => {
    startupDebug("react:app-committed", {
      floatingComponent: activeCompId,
      isFloating,
      activeModuleId,
    })
  }, [activeCompId, isFloating, activeModuleId])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <WorkspaceProvider>
        <ContextMenuProvider>
          <AppConfigSync />
          <WorkspaceAppearance />
          {!isFloating && <DesktopTrayBridge />}
          {!isFloating && <WorkspaceWindowFrameSync />}
          <Suspense fallback={<div className="h-screen bg-background" />}>
            {isFloating ? (
              <FloatingComponentWindow
                compId={activeCompId}
                windowId={activeWindowId}
                moduleIdFallback={activeModuleId}
                workspaceIdFallback={params.workspaceId}
                titleFallback={params.title}
              />
            ) : (
              <>
                <WorkspaceWindowRestorer />
                <WorkspaceLayout />
              </>
            )}
          </Suspense>
        </ContextMenuProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  )
}

export default App
