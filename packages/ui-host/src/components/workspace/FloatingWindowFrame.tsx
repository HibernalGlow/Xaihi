import {
  createContext,
  useContext,
  useLayoutEffect,
  type MouseEvent,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import type { MainWindowAction } from "@/backend/runtime/runtime"
import { cn } from "@/lib/utils"
import { NodeChromeActionButton, NodeChromeExpandablePill } from "./NodeChromePrimitives"
import { WindowControlIcon } from "./WindowControlIcon"

interface FloatingWindowFrameValue {
  captionAppearance?: {
    position: "left" | "right" | "island"
    style: "windows" | "capsule" | "traffic-light"
    autoCollapse: boolean
  }
  /** `"system"` means the OS title bar already draws these buttons, so no DOM cluster is rendered. */
  captionOwner?: "system" | "renderer"
  /** Leading padding that keeps this window's title bar out of the OS traffic lights. */
  captionBandInlinePx?: string
  isMaximized: boolean
  pending: boolean
  control: (action: MainWindowAction) => void
  handleTitlebarDoubleClick: (event: MouseEvent<HTMLElement>) => void
  registerIntegratedTitlebar: () => () => void
}

const FloatingWindowFrameContext = createContext<FloatingWindowFrameValue | null>(null)

export function FloatingWindowFrameProvider({ children, value }: {
  children: ReactNode
  value: FloatingWindowFrameValue
}) {
  return (
    <FloatingWindowFrameContext.Provider value={value}>
      {children}
    </FloatingWindowFrameContext.Provider>
  )
}

export function useFloatingWindowFrame() {
  return useContext(FloatingWindowFrameContext)
}

/** Keeps fallback chrome disabled while an auto-hidden title bar owns it. */
export function FloatingWindowTitlebarReservation() {
  const frame = useFloatingWindowFrame()

  useLayoutEffect(() => {
    if (!frame) return
    return frame.registerIntegratedTitlebar()
  }, [frame])

  return null
}

/**
 * Adapts an existing node header to the frameless host window chrome.
 *
 * In the normal workspace this is a transparent wrapper, so node cards keep
 * their existing layout. Inside a floating window it turns the header into
 * the draggable title bar and appends the shared window controls.
 */
export function FloatingWindowNodeHeader({ children, className }: {
  children: ReactNode
  className?: string
}) {
  const frame = useFloatingWindowFrame()

  if (!frame) return <>{children}</>

  return (
    <div
      data-floating-window-titlebar="true"
      onDoubleClick={frame.handleTitlebarDoubleClick}
      // When the OS owns the caption it draws the traffic lights over this strip's leading edge.
      style={frame.captionOwner === "system" ? { paddingLeft: frame.captionBandInlinePx } : undefined}
      className={cn("xiranite-app-region-drag flex min-w-0 flex-1 self-stretch select-none items-stretch", className)}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {children}
      </div>
      <FloatingWindowCaptionControls integrated />
    </div>
  )
}

export function FloatingWindowCaptionControls({
  appearance,
  className,
  integrated = false,
  density = "default",
}: {
  appearance?: {
    position: "left" | "right" | "island"
    style: "windows" | "capsule" | "traffic-light"
    autoCollapse: boolean
  }
  className?: string
  integrated?: boolean
  density?: "default" | "compact"
}) {
  const frame = useFloatingWindowFrame()
  const { t } = useTranslation()

  useLayoutEffect(() => {
    if (!frame || !integrated) return
    return frame.registerIntegratedTitlebar()
  }, [frame, integrated])

  if (!frame) return null

  // The host reports the OS owns these buttons (macOS Overlay), so drawing a second set would land on top
  // of the traffic lights. The band itself is reserved by CSS off `data-floating-window-caption="system"`.
  if (frame.captionOwner === "system") return null

  const resolvedAppearance = appearance ?? frame.captionAppearance
  if (!resolvedAppearance) {
    const buttonClass = cn(
      "grid place-items-center text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
      density === "compact" ? "min-h-7 w-8" : "min-h-9 w-11",
    )

    return (
      <div
        data-testid={integrated ? "floating-window-integrated-controls" : "floating-window-fallback-controls"}
        data-window-caption-density={density}
        data-window-caption-style="native"
        className={cn("xiranite-app-region-no-drag flex shrink-0 self-stretch items-stretch", className)}
      >
        <button data-window-caption-button data-window-control-action="minimize" type="button" title={t("common:minimize")} aria-label={t("common:minimize")} disabled={frame.pending} onClick={() => frame.control("minimize")} className={buttonClass}>
          <WindowControlIcon action="minimize" />
        </button>
        <button data-window-caption-button data-window-control-action="maximize" type="button" title={t("common:maximize")} aria-label={t("common:maximize")} aria-pressed={frame.isMaximized} disabled={frame.pending} onClick={() => frame.control("maximize")} className={buttonClass}>
          <WindowControlIcon action="maximize" maximized={frame.isMaximized} />
        </button>
        <button data-window-caption-button data-window-control-action="close" data-window-caption-tone="close" type="button" title={t("common:closeWindow")} aria-label={t("common:closeWindow")} disabled={frame.pending} onClick={() => frame.control("close")} className={cn(buttonClass, "hover:bg-[#c42b1c] hover:text-white")}>
          <WindowControlIcon action="close" />
        </button>
      </div>
    )
  }

  const captionStyle = resolvedAppearance.style
  const trafficLight = captionStyle === "traffic-light"
  const capsule = captionStyle === "capsule"
  const positionClass = resolvedAppearance?.position === "left"
    ? "left-1.5"
    : resolvedAppearance?.position === "island"
      ? "left-1/2 -translate-x-1/2"
      : resolvedAppearance
        ? "right-1.5"
        : undefined
  const actions: Array<{ action: "minimize" | "maximize" | "close"; label: string; maximized?: boolean }> = [
    { action: "minimize", label: t("common:minimize") },
    { action: "maximize", label: t("common:maximize"), maximized: frame.isMaximized },
    { action: "close", label: t("common:closeWindow") },
  ]
  if (trafficLight) actions.unshift(actions.pop()!)

  if (capsule) {
    return (
      <NodeChromeExpandablePill
        autoCollapse={resolvedAppearance.autoCollapse}
        data-testid={integrated ? "floating-window-integrated-controls" : "floating-window-fallback-controls"}
        data-window-caption-density={density}
        data-window-caption-position={resolvedAppearance.position}
        data-window-caption-style={captionStyle}
        className={cn(
          "xiranite-app-region-no-drag fixed top-1 z-50",
          positionClass,
          className,
        )}
      >
        {actions.map(({ action, label, maximized }) => (
          <NodeChromeActionButton
            key={action}
            data-window-caption-button
            data-window-control-action={action}
            data-window-caption-tone={action === "close" ? "close" : undefined}
            title={label}
            aria-label={label}
            aria-pressed={action === "maximize" ? frame.isMaximized : undefined}
            disabled={frame.pending}
            onClick={() => frame.control(action)}
            danger={action === "close"}
            className="size-5 rounded-full [&_svg]:size-3"
          >
            <WindowControlIcon action={action} maximized={maximized} />
          </NodeChromeActionButton>
        ))}
      </NodeChromeExpandablePill>
    )
  }

  return (
    <div
      data-testid={integrated ? "floating-window-integrated-controls" : "floating-window-fallback-controls"}
      data-window-caption-density={density}
      data-window-caption-position={resolvedAppearance?.position ?? "inline"}
      data-window-caption-style={captionStyle}
      data-window-caption-visibility="always"
      className={cn(
        "xiranite-app-region-no-drag group/caption flex shrink-0 items-center",
        "fixed top-1.5 z-50 h-7 bg-transparent",
        trafficLight && "gap-1.5 px-1.5",
        positionClass,
        className,
      )}
    >
      {actions.map(({ action, label, maximized }) => (
        <button
          key={action}
          data-window-caption-button
          data-window-control-action={action}
          data-window-caption-tone={action === "close" ? "close" : undefined}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={action === "maximize" ? frame.isMaximized : undefined}
          disabled={frame.pending}
          onClick={() => frame.control(action)}
          className={cn(
            "grid place-items-center transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
            trafficLight
              ? "size-3.5 rounded-full [&_svg]:size-2.5"
              : "h-7 w-8 rounded-none text-foreground/70 hover:bg-muted/70 hover:text-foreground",
            trafficLight && action === "close" && "bg-red-500/80 text-white hover:bg-red-500",
            trafficLight && action === "minimize" && "bg-yellow-500/80 text-black hover:bg-yellow-500",
            trafficLight && action === "maximize" && "bg-emerald-500/80 text-black hover:bg-emerald-500",
            captionStyle === "windows" && action === "close" && "hover:bg-[#c42b1c] hover:text-white",
          )}
        >
          <span className={cn(trafficLight && "opacity-0 transition-opacity group-hover/caption:opacity-100 group-focus-within/caption:opacity-100")}>
            <WindowControlIcon action={action} maximized={maximized} />
          </span>
        </button>
      ))}
    </div>
  )
}
