import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { presetThemeRootClass } from "@/lib/appearance"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { useWorkspaceActions, useWorkspaceComponent, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { useWindowControls } from "@/hooks/useWindowControls"
import { FloatingWindowCaptionControls, FloatingWindowFrameProvider } from "./FloatingWindowFrame"
import { captionBandInlinePx } from "./captionBand"
import { loadNodeMaximizeAction } from "@/components/modules/nodeWindowPreferences"
import type { MainWindowAction } from "@/backend/runtime/runtime"
import type { ComponentInstance } from "@/types/workspace"
import { createLogger } from "@/lib/logger"

const logger = createLogger("window.floating")

interface Props {
  compId: string
  windowId?: string | null
  moduleIdFallback?: string | null
  workspaceIdFallback?: string | null
  titleFallback?: string | null
}

export function FloatingComponentWindow({ compId, windowId, moduleIdFallback, workspaceIdFallback }: Props) {
  const { t } = useTranslation()
  const comp = useWorkspaceComponent(compId)
  const { activeCustomThemeName, activeWorkspaceId, floatingWindowCaptionAutoCollapse, floatingWindowCaptionPosition, floatingWindowCaptionStyle, theme, zCounter } = useWorkspaceShallowSelector((state) => ({
    activeCustomThemeName: state.activeCustomThemeName,
    activeWorkspaceId: state.activeWorkspaceId,
    floatingWindowCaptionAutoCollapse: state.floatingWindowCaptionAutoCollapse,
    floatingWindowCaptionPosition: state.floatingWindowCaptionPosition,
    floatingWindowCaptionStyle: state.floatingWindowCaptionStyle,
    theme: state.theme,
    zCounter: state.zCounter,
  }))
  const workspaceActions = useWorkspaceActions()
  const [isMaximized, setIsMaximized] = useState(false)
  const [maximizeAction, setMaximizeAction] = useState<MainWindowAction>("maximize")
  const [integratedTitlebars, setIntegratedTitlebars] = useState(0)
  const { capabilities, controlComponent, controlComponentPending, closeComponent } = useWindowControls()
  const moduleId = comp?.moduleId ?? moduleIdFallback ?? ""
  const showNativeWindowChrome = capabilities?.nativeWindowControls === true
  // `"system"` is the macOS Overlay flavor: AppKit draws the traffic lights on this window too, so the
  // frame renders no DOM cluster and the title bar only has to keep the band clear.
  const captionOwner = capabilities?.captionOwner ?? "renderer"

  useEffect(() => {
    let cancelled = false
    setMaximizeAction("maximize")
    if (!moduleId) return

    void loadNodeMaximizeAction(moduleId)
      .then((action) => {
        if (!cancelled) setMaximizeAction(action)
      })
      .catch((error) => {
        logger.error("Failed to load window preferences", { moduleId }, error)
      })

    return () => {
      cancelled = true
    }
  }, [moduleId])

  const themeClass = activeCustomThemeName ? "" : presetThemeRootClass(theme)

  useEffect(() => {
    if (!moduleId || comp) return

    const now = Date.now()
    const fallbackComponent: ComponentInstance = {
      id: compId,
      moduleId,
      state: "floating",
      placement: "window",
      position: { x: 20, y: 20 },
      size: { w: 460, h: 380 },
      z: zCounter + 1,
      collapsed: false,
      workspaceId: workspaceIdFallback ?? activeWorkspaceId,
      flowPosition: { x: 100, y: 100 },
      flowSize: { width: 384, height: 320 },
      dockPanel: "default",
      createdAt: now,
      updatedAt: now,
    }

    workspaceActions.ensureComponent(fallbackComponent)
  }, [activeWorkspaceId, comp, compId, moduleId, workspaceActions, workspaceIdFallback, zCounter])

  const controlWindow = useCallback(async (action: MainWindowAction) => {
    const targetWindowId = windowId ?? compId
    try {
      const result = await controlComponent(targetWindowId, action)
      if (result.success && result.state) {
        setIsMaximized(result.state === "maximized" || result.state === "fullscreen")
      }
      if (result.success) return
    } catch {
      // Browser fallback windows may not be tracked by the backend.
    }

    if (action !== "close") return

    try {
      const result = await closeComponent(targetWindowId)
      if (result.success) return
    } catch {
      // Browser fallback windows may not be tracked by the backend.
    }

    window.close()
  }, [closeComponent, compId, controlComponent, windowId])

  const handleTitleBarDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest(".xiranite-app-region-no-drag")) return

    event.preventDefault()
    void controlWindow(maximizeAction)
  }, [controlWindow, maximizeAction])

  const registerIntegratedTitlebar = useCallback(() => {
    setIntegratedTitlebars((count) => count + 1)
    return () => setIntegratedTitlebars((count) => Math.max(0, count - 1))
  }, [])

  const frame = useMemo(() => ({
    captionAppearance: {
      position: floatingWindowCaptionPosition,
      style: floatingWindowCaptionStyle,
      autoCollapse: floatingWindowCaptionAutoCollapse,
    },
    captionOwner,
    captionBandInlinePx: captionBandInlinePx(capabilities?.captionInset),
    isMaximized,
    pending: controlComponentPending,
    control: (action: MainWindowAction) => void controlWindow(action === "maximize" ? maximizeAction : action),
    handleTitlebarDoubleClick: handleTitleBarDoubleClick,
    registerIntegratedTitlebar,
  }), [captionOwner, capabilities?.captionInset, controlComponentPending, controlWindow, floatingWindowCaptionAutoCollapse, floatingWindowCaptionPosition, floatingWindowCaptionStyle, handleTitleBarDoubleClick, isMaximized, maximizeAction, registerIntegratedTitlebar])

  const content = (
    <div
      data-floating-window-caption={captionOwner}
      data-floating-window-caption-position={floatingWindowCaptionPosition}
      data-floating-window-caption-style={floatingWindowCaptionStyle}
      className={cn("xiranite-floating-window relative flex h-screen flex-col overflow-hidden bg-background text-foreground", themeClass)}
    >
      <main className="min-h-0 flex-1 overflow-hidden">
        {moduleId ? (
          <ModuleRenderer moduleId={moduleId} compId={compId} />
        ) : (
          <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
            {t("view:floating.missingTarget")}
          </div>
        )}
      </main>
      {showNativeWindowChrome && integratedTitlebars === 0 ? (
        <FloatingWindowCaptionControls />
      ) : null}
    </div>
  )

  const framedContent = showNativeWindowChrome
    ? <FloatingWindowFrameProvider value={frame}>{content}</FloatingWindowFrameProvider>
    : content

  return framedContent
}
