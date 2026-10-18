import { useEffect, useState, type ComponentType, type MouseEvent, type Ref } from "react"
import { CompactViewSwitch } from "./CompactViewSwitch"
import { TrellisToolbarSlot } from "./TrellisToolbarSlot"
import { useTranslation } from "react-i18next"
import { getRuntime } from "@/backend/client"
import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { countHazardAffectedNodes, disableAllNodeDryRuns } from "@/lib/hazardMode"
import { cn } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { activeNodeOperationCount, useNodeOperations } from "@/store/nodeOperations"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useTheme } from "@/components/use-theme"
import { resolveThemeScheme } from "@/lib/appearance"
import type { ViewMode, CardLayout } from "@/types/workspace"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { AppCompactMenu } from "./AppCompactMenu"
import { ThemeCompactMenu } from "./ThemeCompactMenu"
import {
  Target, LayoutDashboard, Workflow,
  PanelsTopLeft, Columns3,
  ShieldAlert, Flame, Sparkles,
} from "lucide-react"
import { WindowControlIcon } from "./WindowControlIcon"
import { captionBandInlinePx } from "./captionBand"
import { syncActionContext, type ActionContext } from "@/actions"
import { ActionCompactMenu } from "@/components/workspace/ActionCompactMenu"
import { createLogger } from "@/lib/logger"

const logger = createLogger("window.controls")
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SlingButton } from "@/components/ui/sling-button"

const TITLEBAR_NO_DRAG_SELECTOR = [
  ".xaihi-app-region-no-drag",
  ".xiranite-app-region-no-drag",
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[role='button']",
].join(",")

export function isNoDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(TITLEBAR_NO_DRAG_SELECTOR)
}

export const VIEW_OPTIONS: { key: ViewMode; labelKey: string; hintKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "cards",    labelKey: "topbar:viewMode.cards",    hintKey: "topbar:viewMode.cardsHint",    icon: LayoutDashboard },
  { key: "flow",     labelKey: "topbar:viewMode.flow",     hintKey: "topbar:viewMode.flowHint",     icon: Workflow },
  { key: "lane",     labelKey: "topbar:viewMode.lane",     hintKey: "topbar:viewMode.laneHint",     icon: Columns3 },
]

export const CARD_LAYOUT_OPTIONS: { key: CardLayout; labelKey: string; hintKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "focus", labelKey: "topbar:cardLayout.focus", hintKey: "topbar:cardLayout.focusHint", icon: Target },
  { key: "trellis", labelKey: "topbar:cardLayout.trellis", hintKey: "topbar:cardLayout.trellisHint", icon: PanelsTopLeft },
]

export function TopBar() {
  const surface = useNodeSurface()
  const state = useWorkspaceShallowSelector((workspace) => ({
    viewMode: workspace.viewMode,
    dashboardOpen: workspace.overlay === "dashboard",
    cardLayout: workspace.cardLayout,
    defaultView: workspace.defaultView,
    trellisNavigation: workspace.trellisNavigation,
    uiPreferenceSave: workspace.uiPreferenceSave,
    viewSwitchLoop: workspace.viewSwitchLoop,
    theme: workspace.theme,
    themeSelections: workspace.themeSelections,
    customThemes: workspace.customThemes,
    designTheme: workspace.designTheme,
    uiFace: workspace.uiFace,
    components: workspace.components,
    hazardMode: workspace.hazardMode,
  }))
  const workspaceActions = useWorkspaceActions()
  const { t } = useTranslation()
  const { theme: colorMode, resolvedTheme, setTheme: setColorMode } = useTheme()
  const [hazardConfirmOpen, setHazardConfirmOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const runtimeInfo = getRuntimeConnectionInfo()
  const activeOperations = useNodeOperations((store) => activeNodeOperationCount(store.operations))
  // 动作上下文由渲染器推进注册表：动作自己不认识 store，只读这份快照（ADR-0081）。
  const actionContext: ActionContext = {
    viewMode: state.viewMode,
    dashboardOpen: state.dashboardOpen,
    activeOperationCount: activeOperations,
    devRuntimeActive: runtimeInfo.frontendSource === "vite-dev",
  }
  useEffect(() => {
    syncActionContext(actionContext)
  }, [actionContext.viewMode, actionContext.dashboardOpen, actionContext.activeOperationCount, actionContext.devRuntimeActive])
  const { capabilities, controlMain, controlMainPending } = useWindowControls()
  const canControlMainWindow = capabilities?.nativeWindowControls === true
  // The host says who paints the caption buttons. On macOS it is the OS: `tauri.macos.conf.json` keeps a
  // transparent Overlay title bar, so AppKit draws the traffic lights over this bar's left edge and the app
  // must neither add its own set nor let content sit underneath them.
  const systemOwnsCaption = capabilities?.captionOwner === "system"
  const showWindowControls = canControlMainWindow && !systemOwnsCaption

  const activeScheme = resolveThemeScheme((colorMode ?? "system") as "system" | "light" | "dark", resolvedTheme === "dark")
  const isMd3e = state.uiFace === "md3e"
  const isTightSurface = surface.density === "tight" || (surface.width > 0 && surface.width <= 380)
  const showDirectViewStrip =
    isMd3e &&
    state.viewMode !== "dashboard" &&
    !isTightSurface &&
    (surface.width === 0 || surface.width >= 560)

  async function controlMainWindow(action: "minimize" | "maximize" | "close") {
    const result = await controlMain(action)
    if (!result.success) logger.info("Window control failed", { action, message: result.message })
    if (result.success && result.state) setIsMaximized(result.state === "maximized")
  }

  function handleTitleBarDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!canControlMainWindow) return
    if (isNoDragTarget(event.target)) return

    event.preventDefault()
    void controlMainWindow("maximize")
  }

  function closeApp() {
    if (canControlMainWindow) {
      void controlMainWindow("close")
      return
    }
    window.close()
  }

  async function openDevTools() {
    try {
      const result = await (await getRuntime()).windows.openDevTools()
      if (!result.success) logger.info("Developer tools open failed", { message: result.message })
    } catch (error) {
      logger.info("Developer tools open failed", undefined, error)
    }
  }

  function enableHazardMode() {
    disableAllNodeDryRuns(state.components, workspaceActions.patchComponentData)
    workspaceActions.setHazardMode(true)
    setHazardConfirmOpen(false)
  }

  const hazardDialog = (
    <AlertDialog open={hazardConfirmOpen} onOpenChange={setHazardConfirmOpen}>
      <AlertDialogContent
        size="sm"
        className={cn(
          "border-foreground/20 bg-background/95 backdrop-blur-xl",
          isMd3e && "rounded-[28px] border-border/70 bg-popover shadow-lg",
        )}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-foreground/15 bg-muted/60 text-foreground"><ShieldAlert /></AlertDialogMedia>
          <AlertDialogTitle className="font-mono tracking-tight">Hazard On</AlertDialogTitle>
          <AlertDialogDescription>将关闭 {countHazardAffectedNodes(state.components)} 个节点的 dry run / 预演模式，并且此后所有危险执行不再二次确认。关闭 Hazard 提示不会自动恢复预演。</AlertDialogDescription>
        </AlertDialogHeader>
        {/* 上膛只有一次手势机会：tapSends 关掉，鼠标单击不生效，必须拉过阈值松手。
            键盘 Enter 仍可达（SlingButton 的 click 分支），不牺牲无障碍。 */}
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">向外拉满后松手上膛</span>
          <SlingButton
            tapSends={false}
            ariaLabel="上膛 Hazard"
            size={44}
            armAt={36}
            maxPull={120}
            onSend={enableHazardMode}
          >
            <Flame />
          </SlingButton>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (!isMd3e) {
    return (
      <header
        ref={surface.ref as unknown as Ref<HTMLElement>}
        onDoubleClick={handleTitleBarDoubleClick}
        data-topbar-face="legacy"
        data-topbar-surface-mode={surface.mode}
        data-topbar-surface-density={surface.density}
        data-topbar-caption={systemOwnsCaption ? "system" : "renderer"}
        style={systemOwnsCaption && capabilities?.captionInset ? { paddingLeft: captionBandInlinePx(capabilities.captionInset) } : undefined}
        className={cn(
          "xaihi-app-region-drag",
          "xaihi-topbar",
          "relative z-[1500] flex h-12 min-w-0 flex-shrink-0 select-none items-center gap-1.5 overflow-visible border-b border-border bg-background px-4",
          isTightSurface && "px-2 gap-1",
        )}
      >
        {/* ── 品牌 + 工作区切换入口 ── */}
        <div className="xaihi-app-region-no-drag shrink-0">
          <AppCompactMenu version="0.5.0" hazardMode={state.hazardMode} viewMode={state.viewMode} cardLayout={state.cardLayout}
            views={VIEW_OPTIONS} layouts={CARD_LAYOUT_OPTIONS} loop={state.viewSwitchLoop}
            onView={workspaceActions.setViewMode} onLayout={workspaceActions.setCardLayout}
            onSettings={() => workspaceActions.setOverlay("settings")}
            onRegistry={() => workspaceActions.setOverlay("registry")}
            onOperations={() => workspaceActions.setOverlay("operations")}
            onHistory={() => workspaceActions.setOverlay("history")}
            onDeletions={() => workspaceActions.setOverlay("deletions")}
            onDashboard={() => workspaceActions.setViewMode("dashboard")}
            onDevTools={openDevTools} onExit={closeApp}
            onHazard={() => state.hazardMode ? workspaceActions.setHazardMode(false) : setHazardConfirmOpen(true)} />
        </div>

        {state.hazardMode ? <HazardStatusBadge md3e={false} onDisable={() => workspaceActions.setHazardMode(false)} /> : null}

        {hazardDialog}

        <div className="xaihi-app-region-no-drag flex min-w-0 shrink items-center gap-1 border-l border-border/60 pl-1">
          {state.viewMode !== "dashboard" && <CompactViewSwitch viewMode={state.viewMode} cardLayout={state.cardLayout} views={VIEW_OPTIONS} layouts={CARD_LAYOUT_OPTIONS}
            loop={state.viewSwitchLoop} onLoopChange={workspaceActions.setViewSwitchLoop} defaultView={state.defaultView} navigation={state.trellisNavigation} saveStatus={state.uiPreferenceSave} onSetDefault={workspaceActions.setCurrentViewAsDefault}
            onView={workspaceActions.setViewMode} onLayout={workspaceActions.setCardLayout} />}
          {state.viewMode === "cards" && state.cardLayout === "trellis" && <TrellisToolbarSlot />}
        </div>

        <div className="flex-1" />

        {/* ── 弹出层入口（取代侧栏）── */}
        <div className="xaihi-app-region-no-drag flex shrink-0 items-center gap-1">
          <ActionCompactMenu context={actionContext} />
          <ThemeCompactMenu theme={state.theme} selections={state.themeSelections} customThemes={state.customThemes}
            designTheme={state.designTheme} scheme={activeScheme} colorMode={(colorMode ?? "system") as "system" | "light" | "dark"}
            loop={state.viewSwitchLoop} uiFace={state.uiFace}
            onColorMode={setColorMode} onSelection={workspaceActions.setThemeSelection}
            onDesignTheme={workspaceActions.setDesignTheme} onUiFace={workspaceActions.setUiFace}
            onSettings={() => workspaceActions.setOverlay("settings")} />
        </div>

        {showWindowControls && (
          <div className="xaihi-app-region-no-drag flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-2">
            <button
              title={t("common:minimize")}
              aria-label={t("common:minimize")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("minimize")}
              className="grid h-8 w-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <WindowControlIcon action="minimize" />
            </button>
            <button
              title={t("common:maximize")}
              aria-label={t("common:maximize")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("maximize")}
              className="grid h-8 w-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <WindowControlIcon action="maximize" maximized={isMaximized} />
            </button>
            <button
              title={t("common:close")}
              aria-label={t("common:close")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("close")}
              className="grid h-8 w-8 place-items-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <WindowControlIcon action="close" />
            </button>
          </div>
        )}
      </header>
    )
  }

  // ── MD3E 顶栏形态（ADR-0033 要求 2 & 6）：连接式胶囊岛分区、0.97 弹簧反馈、容器级 320px 响应式，动作语义 1:1 等价 ──
  return (
    <header
      ref={surface.ref as unknown as Ref<HTMLElement>}
      onDoubleClick={handleTitleBarDoubleClick}
      data-topbar-face="md3e"
      data-topbar-surface-mode={surface.mode}
      data-topbar-surface-density={surface.density}
      data-topbar-caption={systemOwnsCaption ? "system" : "renderer"}
      style={systemOwnsCaption && capabilities?.captionInset ? { paddingLeft: captionBandInlinePx(capabilities.captionInset) } : undefined}
      className={cn(
        "xaihi-app-region-drag",
        "xaihi-topbar",
        "@container/topbar relative z-[1500] flex min-w-0 flex-shrink-0 select-none items-center justify-between overflow-visible border-b border-border/50 bg-[var(--md-sys-color-surface-container,var(--background))] text-foreground transition-colors",
        isTightSurface ? "h-11 gap-1 px-2" : "h-13 gap-2 px-3.5",
      )}
    >
      {/* ── 分区 1（Leading Island）：品牌菜单 + Hazard 状态胶囊 ── */}
      <div
        data-topbar-partition="brand"
        className="xaihi-app-region-no-drag flex min-w-0 shrink-0 items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high,var(--muted))] p-1 shadow-2xs"
      >
        <AppCompactMenu version="0.5.0" hazardMode={state.hazardMode} viewMode={state.viewMode} cardLayout={state.cardLayout}
          views={VIEW_OPTIONS} layouts={CARD_LAYOUT_OPTIONS} loop={state.viewSwitchLoop}
          onView={workspaceActions.setViewMode} onLayout={workspaceActions.setCardLayout}
          onSettings={() => workspaceActions.setOverlay("settings")}
          onRegistry={() => workspaceActions.setOverlay("registry")}
          onOperations={() => workspaceActions.setOverlay("operations")}
          onHistory={() => workspaceActions.setOverlay("history")}
          onDeletions={() => workspaceActions.setOverlay("deletions")}
          onDashboard={() => workspaceActions.setViewMode("dashboard")}
          onDevTools={openDevTools} onExit={closeApp}
          onHazard={() => state.hazardMode ? workspaceActions.setHazardMode(false) : setHazardConfirmOpen(true)} />
        {state.hazardMode ? <HazardStatusBadge md3e onDisable={() => workspaceActions.setHazardMode(false)} /> : null}
      </div>

      {hazardDialog}

      {/* ── 分区 2（Center Connected Hub）：视图切换与 Trellis 工具槽（外 24 / 内 6 磁吸连接式分组） ── */}
      <div
        data-topbar-partition="navigation"
        className={cn(
          "xaihi-app-region-no-drag flex min-w-0 shrink items-center gap-1 rounded-[24px] bg-[var(--md-sys-color-surface-container-high,var(--muted))] px-1.5 py-0.5 shadow-2xs",
          isTightSurface && "px-1",
        )}
      >
        {state.viewMode !== "dashboard" && (
          <CompactViewSwitch
            viewMode={state.viewMode}
            cardLayout={state.cardLayout}
            views={VIEW_OPTIONS}
            layouts={CARD_LAYOUT_OPTIONS}
            loop={state.viewSwitchLoop}
            onLoopChange={workspaceActions.setViewSwitchLoop}
            defaultView={state.defaultView}
            navigation={state.trellisNavigation}
            saveStatus={state.uiPreferenceSave}
            onSetDefault={workspaceActions.setCurrentViewAsDefault}
            onView={workspaceActions.setViewMode}
            onLayout={workspaceActions.setCardLayout}
          />
        )}
        {showDirectViewStrip ? (
          <div
            role="group"
            aria-label={t("topbar:compactView.views")}
            data-topbar-md3e-view-strip
            className="flex items-center gap-0.5 border-l border-border/50 pl-1"
          >
            {VIEW_OPTIONS.map((option, index) => {
              const Icon = option.icon
              const active = state.viewMode === option.key
              const isFirst = index === 0
              const isLast = index === VIEW_OPTIONS.length - 1
              return (
                <button
                  key={option.key}
                  type="button"
                  data-topbar-md3e-view-pill={option.key}
                  aria-pressed={active}
                  title={t(option.labelKey)}
                  onClick={() => workspaceActions.setViewMode(option.key)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 px-2.5 text-[11px] font-medium transition-all duration-200 ease-[var(--md3-spring-spatial,cubic-bezier(0.2,0,0,1))] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
                    active
                      ? "rounded-full bg-[var(--md-sys-color-secondary-container,var(--secondary))] text-[var(--md-sys-color-on-secondary-container,var(--secondary-foreground))] shadow-2xs"
                      : cn(
                          "bg-background/45 text-muted-foreground hover:bg-background/80 hover:text-foreground",
                          isFirst ? "rounded-l-full rounded-r-[6px]" : isLast ? "rounded-l-[6px] rounded-r-full" : "rounded-[6px]",
                        ),
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{t(option.labelKey)}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        {state.viewMode === "cards" && state.cardLayout === "trellis" && <TrellisToolbarSlot />}
      </div>

      {/* ── 分区 3（Trailing Actions & Window Controls）：快捷形态徽章 + 动作/外观弹层 + 窗口控制 ── */}
      <div
        data-topbar-partition="actions"
        className="xaihi-app-region-no-drag flex shrink-0 items-center gap-1"
      >
        <div className="flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high,var(--muted))] p-1 shadow-2xs">
          {!isTightSurface ? (
            <button
              type="button"
              data-topbar-ui-face-toggle
              onClick={() => workspaceActions.setUiFace("legacy")}
              title="当前为 MD3E 界面形态，点击切回经典 Legacy 形态"
              aria-label="切换界面形态为经典模式"
              className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container,var(--accent))] px-2.5 text-[10px] font-semibold tracking-wide text-[var(--md-sys-color-on-tertiary-container,var(--accent-foreground))] transition-transform duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Sparkles className="size-3 shrink-0" />
              <span>MD3E</span>
            </button>
          ) : null}
          <ActionCompactMenu context={actionContext} />
          <ThemeCompactMenu
            theme={state.theme}
            selections={state.themeSelections}
            customThemes={state.customThemes}
            designTheme={state.designTheme}
            scheme={activeScheme}
            colorMode={(colorMode ?? "system") as "system" | "light" | "dark"}
            loop={state.viewSwitchLoop}
            uiFace={state.uiFace}
            onColorMode={setColorMode}
            onSelection={workspaceActions.setThemeSelection}
            onDesignTheme={workspaceActions.setDesignTheme}
            onUiFace={workspaceActions.setUiFace}
            onSettings={() => workspaceActions.setOverlay("settings")}
          />
        </div>

        {showWindowControls && (
          <div
            data-topbar-window-controls
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--md-sys-color-surface-container-highest,var(--muted))] p-1"
          >
            <button
              title={t("common:minimize")}
              aria-label={t("common:minimize")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("minimize")}
              className="grid size-7 place-items-center rounded-l-full rounded-r-[6px] text-muted-foreground transition-all active:scale-[0.94] hover:bg-background/70 hover:text-foreground"
            >
              <WindowControlIcon action="minimize" />
            </button>
            <button
              title={t("common:maximize")}
              aria-label={t("common:maximize")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("maximize")}
              className="grid size-7 place-items-center rounded-[6px] text-muted-foreground transition-all active:scale-[0.94] hover:bg-background/70 hover:text-foreground"
            >
              <WindowControlIcon action="maximize" maximized={isMaximized} />
            </button>
            <button
              title={t("common:close")}
              aria-label={t("common:close")}
              disabled={controlMainPending}
              onClick={() => controlMainWindow("close")}
              className="grid size-7 place-items-center rounded-l-[6px] rounded-r-full text-muted-foreground transition-all active:scale-[0.94] hover:bg-destructive/15 hover:text-destructive"
            >
              <WindowControlIcon action="close" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function HazardStatusBadge({ md3e, onDisable }: { md3e: boolean; onDisable: () => void }) {
  return (
    <button
      aria-label="关闭 Hazard On"
      className={cn(
        "xaihi-app-region-no-drag flex h-7 shrink-0 items-center gap-1.5 px-2.5 font-mono text-[10px] font-semibold tracking-[0.12em] transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        md3e
          ? "rounded-full border border-destructive/40 bg-destructive/15 text-destructive active:scale-[0.96] hover:bg-destructive/25"
          : "rounded-sm border border-foreground/25 bg-muted/55 text-foreground hover:bg-muted",
      )}
      onClick={onDisable}
      title="关闭 Hazard 提示（不会恢复节点预演）"
      type="button"
    >
      <ShieldAlert className="size-3" />
      <span>HAZARD ON</span>
      <span className="border-l border-current/20 pl-1.5 text-[9px] font-normal tracking-[0.08em] opacity-80">LIVE</span>
    </button>
  )
}
