/**
 * 应用根组件。
 *
 * 通过 URL query 参数 `floatingComponent` 区分两种渲染模式：
 *  - 命中时：懒加载 {@link FloatingComponentWindow}，仅渲染单个浮窗组件（用于桌面端多窗口拆分）；
 *  - 否则：渲染完整 {@link WorkspaceLayout} 工作区。
 *
 * 顶层 Provider 顺序：WorkspaceProvider → ContextMenuProvider → AppConfigSync/WorkspaceAppearance → 内容。
 */
import { lazy, Suspense, useEffect } from "react"
import { WorkspaceProvider } from "@/store/workspaceContext"
import { WorkspaceAppearance } from "@/components/workspace/WorkspaceAppearance"
import { AppConfigSync } from "@/components/workspace/AppConfigSync"
import { ContextMenuProvider } from "@/components/context-menu"
import { parseAsString, useQueryStates } from "nuqs"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { DesktopTrayBridge } from "@/desktop/tray/DesktopTrayBridge"
import { WorkspaceWindowRestorer } from "@/components/workspace/WorkspaceWindowRestorer"
import { WorkspaceWindowFrameSync } from "@/components/workspace/WorkspaceWindowFrameSync"

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
 * - `windowId` / `moduleId` / `title` —— 浮窗的元信息回退值；
 * - `workspaceId` —— 组件尚未完成水合时使用的工作区归属。
 */
const floatingWindowParsers = {
  floatingComponent: parseAsString,
  windowId: parseAsString,
  moduleId: parseAsString,
  workspaceId: parseAsString,
  title: parseAsString,
}

export function App() {
  const [params] = useQueryStates(floatingWindowParsers)

  useEffect(() => {
    startupDebug("react:app-committed", { floatingComponent: params.floatingComponent })
  }, [params.floatingComponent])

  return (
    <WorkspaceProvider>
      <ContextMenuProvider>
        <AppConfigSync />
        <WorkspaceAppearance />
        {!params.floatingComponent && <DesktopTrayBridge />}
        {!params.floatingComponent && <WorkspaceWindowFrameSync />}
        <Suspense fallback={<div className="h-screen bg-background" />}>
          {params.floatingComponent ? (
            <FloatingComponentWindow
              compId={params.floatingComponent}
              windowId={params.windowId}
              moduleIdFallback={params.moduleId}
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
  )
}

export default App
