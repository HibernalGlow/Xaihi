import { lazy, Suspense } from "react"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { TopBar } from "./TopBar"
import { WorkspaceUrlState } from "./WorkspaceUrlState"
import { BackendStatusBanner } from "./BackendStatusBanner"
import { toBackgroundImageCssUrl } from "@/lib/backgroundImage"
import { presetThemeRootClass } from "@/lib/appearance"
import { cn } from "@/lib/utils"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"

// Keep default cards view and secondary chrome out of the first WorkspaceLayout
// transform. View-mode lazy loading already existed for dock/flow/lane/bento;
// cards/overlays were still eager and dominated first-open cost.
const CardView = lazy(() => startupDebugAsync("lazy:card-view", () => import("./CardView")).then((module) => ({ default: module.CardView })))
const OverlayHost = lazy(() => startupDebugAsync("lazy:overlay-host", () => import("./OverlayHost")).then((module) => ({ default: module.OverlayHost })))
const SelectionToolbar = lazy(() => import("./SelectionToolbar").then((module) => ({ default: module.SelectionToolbar })))
const AlphabetNodeRail = lazy(() => import("./AlphabetNodeRail").then((module) => ({ default: module.AlphabetNodeRail })))
const DefaultContextMenuItems = lazy(() =>
  import("@/components/context-menu/defaults").then((module) => ({ default: module.DefaultContextMenuItems })),
)
const DockviewView = lazy(() => import("./DockviewView").then((module) => ({ default: module.DockviewView })))
const FlowView = lazy(() => import("./FlowView").then((module) => ({ default: module.FlowView })))
const LaneView = lazy(() => import("./lane/LaneView").then((module) => ({ default: module.LaneView })))
const BentoView = lazy(() => import("./BentoView").then((module) => ({ default: module.BentoView })))
const UsageDashboard = lazy(() => import("@/components/views/UsageDashboard").then((module) => ({ default: module.UsageDashboard })))

export function WorkspaceLayout() {
  const chrome = useWorkspaceShallowSelector((state) => ({
    theme: state.theme,
    activeCustomThemeName: state.activeCustomThemeName,
    viewMode: state.viewMode,
    bgMode: state.bgMode,
    bgImageUrl: state.bgImageUrl,
    bgOpacity: state.bgOpacity,
    bgBlur: state.bgBlur,
    bgCoverTopBar: state.bgCoverTopBar,
  }))
  const themeClass = chrome.activeCustomThemeName ? "" : presetThemeRootClass(chrome.theme)
  const bgClass = `theme-bg-${chrome.bgMode || "dot-grid"}`
  const bgCoverClass = chrome.bgMode === "image" && chrome.bgCoverTopBar ? "theme-bg-cover-topbar" : ""

  startupDebug("react:workspace-layout-render", { viewMode: chrome.viewMode })

  const bgStyles = {
    "--ws-bg-image-url": chrome.bgImageUrl ? `url(${JSON.stringify(toBackgroundImageCssUrl(chrome.bgImageUrl))})` : "none",
    "--ws-bg-opacity": String((chrome.bgOpacity ?? 30) / 100),
    "--ws-bg-blur": `${chrome.bgBlur ?? 5}px`,
  } as React.CSSProperties

  return (
    <div
      className={cn("flex h-screen flex-col overflow-hidden bg-background text-foreground", themeClass, bgClass, bgCoverClass)}
      style={bgStyles}
    >
      <Suspense fallback={null}>
        <DefaultContextMenuItems />
      </Suspense>
      <WorkspaceUrlState />
      <TopBar />
      <BackendStatusBanner />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          key={chrome.viewMode}
          data-context-menu="workspace-canvas"
          className="flex min-h-0 min-w-0 flex-1 animate-in fade-in duration-150"
        >
          <Suspense fallback={<div className="min-h-0 flex-1 ws-canvas-bg" />}>
            {chrome.viewMode === "dashboard" && <UsageDashboard />}
            {chrome.viewMode === "cards" && <CardView />}
            {chrome.viewMode === "dockview" && <DockviewView />}
            {chrome.viewMode === "flow" && <FlowView />}
            {chrome.viewMode === "lane" && <LaneView />}
            {chrome.viewMode === "bento" && <BentoView />}
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <OverlayHost />
          <SelectionToolbar />
          <AlphabetNodeRail />
        </Suspense>
      </main>
    </div>
  )
}
