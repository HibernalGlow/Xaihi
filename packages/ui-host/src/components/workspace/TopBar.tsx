import { useEffect, useState, type ComponentType, type MouseEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { getRuntime } from "@/backend/client"
import { getRuntimeConnectionInfo } from "@/backend/runtimeConnectionInfo"
import { countHazardAffectedNodes, disableAllNodeDryRuns } from "@/lib/hazardMode"
import { cn } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { activeNodeOperationCount, useNodeOperations } from "@/store/nodeOperations"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useTheme } from "@/components/use-theme"
import { getActiveCustomTheme, resolveThemeScheme, THEME_PRESET_OPTIONS } from "@/lib/appearance"
import type { AppDesignThemeId } from "@/lib/design-theme/contract"
import { DESIGN_THEME_ENTRIES } from "@/lib/design-theme/registry"
import type { ViewMode, CardLayout, AppCustomTheme } from "@/types/workspace"
import { AppMenuRoot, AppMenuRow, type AppMenuPage } from "@/components/workspace/AppMenuRoot"
import {
  Settings, Grid, SplitSquareVertical, AlignJustify, Target,
  Gauge, LayoutDashboard, Workflow, Share2, ChevronDown, Check,
  Sun, Moon, Monitor, Palette,
  LayoutTemplate,
  ArrowLeft, ShieldAlert, Flame,
} from "lucide-react"
import { WindowControlIcon } from "./WindowControlIcon"
import { captionBandInlinePx } from "./captionBand"
import { syncActionContext, type ActionContext } from "@/actions"
import { ActionPieMenu } from "@/components/workspace/ActionPieMenu"
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
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const TITLEBAR_NO_DRAG_SELECTOR = [
  ".xiranite-app-region-no-drag",
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[role='button']",
].join(",")

function isNoDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(TITLEBAR_NO_DRAG_SELECTOR)
}

/** 泳道模式图标 — 与 Lane 内部用同一个 SVG，画泳道外框 + lane 矩形。 */
function LaneModeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 15 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.75 0.75H2.75C1.64543 0.75 0.75 1.64543 0.75 2.75V6.75C0.75 7.85457 1.64543 8.75 2.75 8.75H11.75C12.8546 8.75 13.75 7.85457 13.75 6.75V2.75C13.75 1.64543 12.8546 0.75 11.75 0.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="0.75" y="0.75" width="5" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

const VIEW_OPTIONS: { key: ViewMode; labelKey: string; hintKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "cards",    labelKey: "topbar:viewMode.cards",    hintKey: "topbar:viewMode.cardsHint",    icon: LayoutDashboard },
  { key: "dockview", labelKey: "topbar:viewMode.dockview", hintKey: "topbar:viewMode.dockviewHint", icon: Share2 },
  { key: "flow",     labelKey: "topbar:viewMode.flow",     hintKey: "topbar:viewMode.flowHint",     icon: Workflow },
  { key: "lane",     labelKey: "topbar:viewMode.lane",     hintKey: "topbar:viewMode.laneHint",     icon: LaneModeIcon },
  { key: "bento",    labelKey: "topbar:viewMode.bento",    hintKey: "topbar:viewMode.bentoHint",    icon: LayoutTemplate },
]

const CARD_LAYOUT_OPTIONS: { key: CardLayout; labelKey: string; hintKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "grid",  labelKey: "topbar:cardLayout.grid",  hintKey: "topbar:cardLayout.gridHint",  icon: Grid },
  { key: "stack", labelKey: "topbar:cardLayout.stack", hintKey: "topbar:cardLayout.stackHint", icon: AlignJustify },
  { key: "split", labelKey: "topbar:cardLayout.split", hintKey: "topbar:cardLayout.splitHint", icon: SplitSquareVertical },
  { key: "focus", labelKey: "topbar:cardLayout.focus", hintKey: "topbar:cardLayout.focusHint", icon: Target },
]

const THEME_PRESETS = THEME_PRESET_OPTIONS
function CustomThemeSwatch({ theme }: { theme: AppCustomTheme }) {
  const colors = theme.cssVars.light
  const swatches = [colors.background, colors.primary, colors.secondary, colors.accent].filter(Boolean)
  return (
    <span className="grid h-4 w-4 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-border/60">
      {swatches.slice(0, 4).map((color, index) => (
        <span key={`${theme.name}-${index}`} style={{ background: color }} />
      ))}
    </span>
  )
}

type ColorMode = "system" | "light" | "dark"
const COLOR_MODES: { key: ColorMode; labelKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "system", labelKey: "topbar:theme.system", icon: Monitor },
  { key: "light",  labelKey: "topbar:theme.light",  icon: Sun },
  { key: "dark",   labelKey: "topbar:theme.dark",   icon: Moon },
]

export function TopBar() {
  const state = useWorkspaceShallowSelector((workspace) => ({
    viewMode: workspace.viewMode,
    cardLayout: workspace.cardLayout,
    theme: workspace.theme,
    themeSelections: workspace.themeSelections,
    customThemes: workspace.customThemes,
    designTheme: workspace.designTheme,
    components: workspace.components,
    hazardMode: workspace.hazardMode,
  }))
  const workspaceActions = useWorkspaceActions()
  const { t } = useTranslation()
  const { theme: colorMode, setTheme: setColorMode } = useTheme()
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [appMenuPage, setAppMenuPage] = useState<AppMenuPage>("root")
  const [hazardConfirmOpen, setHazardConfirmOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const runtimeInfo = getRuntimeConnectionInfo()
  const activeOperations = useNodeOperations((store) => activeNodeOperationCount(store.operations))
  // 动作上下文由渲染器推进注册表：动作自己不认识 store，只读这份快照（ADR-0081）。
  const actionContext: ActionContext = {
    viewMode: state.viewMode,
    activeOperationCount: activeOperations,
    devRuntimeActive: runtimeInfo.frontendSource === "vite-dev",
  }
  useEffect(() => {
    syncActionContext(actionContext)
  }, [actionContext.viewMode, actionContext.activeOperationCount, actionContext.devRuntimeActive])
  const { capabilities, controlMain, controlMainPending } = useWindowControls()
  const canControlMainWindow = capabilities?.nativeWindowControls === true
  // The host says who paints the caption buttons. On macOS it is the OS: `tauri.macos.conf.json` keeps a
  // transparent Overlay title bar, so AppKit draws the traffic lights over this bar's left edge and the app
  // must neither add its own set nor let content sit underneath them.
  const systemOwnsCaption = capabilities?.captionOwner === "system"
  const showWindowControls = canControlMainWindow && !systemOwnsCaption

  const activeScheme = resolveThemeScheme((colorMode ?? "system") as ColorMode, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? document.documentElement.classList.contains("dark"))
  const activeSelection = state.themeSelections[activeScheme]
  const activePresetKey = activeSelection.kind === "preset" ? activeSelection.name : state.theme
  const activeCustomTheme = activeSelection.kind === "custom" ? getActiveCustomTheme(state.customThemes, activeSelection.name) : null
  const activePreset = THEME_PRESETS.find(p => p.key === activePresetKey) ?? THEME_PRESETS[0]
  const activeThemeLabel = activeCustomTheme?.name ?? t(activePreset.labelKey)
  const activeThemeColors = activeCustomTheme
    ? [
      (activeScheme === "dark" ? activeCustomTheme.cssVars.dark : activeCustomTheme.cssVars.light)?.background ?? activeCustomTheme.cssVars.light.background,
      (activeScheme === "dark" ? activeCustomTheme.cssVars.dark : activeCustomTheme.cssVars.light)?.primary ?? activeCustomTheme.cssVars.light.primary,
      (activeScheme === "dark" ? activeCustomTheme.cssVars.dark : activeCustomTheme.cssVars.light)?.secondary ?? activeCustomTheme.cssVars.light.secondary,
      (activeScheme === "dark" ? activeCustomTheme.cssVars.dark : activeCustomTheme.cssVars.light)?.accent ?? activeCustomTheme.cssVars.light.accent,
    ].filter(Boolean)
    : activePreset.palette

  function selectCustomThemeName(value: string) {
    workspaceActions.setThemeSelection(activeScheme, value === "none" ? { kind: "preset", name: state.theme } : { kind: "custom", name: value })
  }

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
    setWsMenuOpen(false)
    if (canControlMainWindow) {
      void controlMainWindow("close")
      return
    }
    window.close()
  }

  async function openDevTools() {
    setWsMenuOpen(false)
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
    setWsMenuOpen(false)
  }

  return (
    <header
      onDoubleClick={handleTitleBarDoubleClick}
      data-topbar-caption={systemOwnsCaption ? "system" : "renderer"}
      // With the OS owning the buttons their band replaces this bar's leading padding; the trailing 1rem
      // still comes from `px-4`. In pure web or without inset, no extra padding is reserved.
      style={systemOwnsCaption && capabilities?.captionInset ? { paddingLeft: captionBandInlinePx(capabilities.captionInset) } : undefined}
      className={cn(
        "xiranite-app-region-drag",
        "xiranite-topbar",
        "relative z-[1500] flex h-12 min-w-0 flex-shrink-0 select-none items-center gap-3 overflow-visible border-b border-border bg-background px-4",
      )}
    >
      {/* ── 品牌 + 工作区切换入口 ── */}
      <Popover
        open={wsMenuOpen}
        onOpenChange={(open) => {
          setWsMenuOpen(open)
          if (open) setAppMenuPage("root")
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="xiranite-app-region-no-drag h-10 shrink-0 gap-2 px-2 text-left hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm font-bold leading-none tracking-tight text-primary">{t("common:appName")}</span>
              <span className="mt-0.5 block font-mono text-[9px] leading-none text-muted-foreground/60">{t("common:version", { version: "0.5.0" })}</span>
            </span>
            <ChevronDown className={cn("text-muted-foreground/60 transition-transform", wsMenuOpen && "rotate-180")} />
          </Button>
        </PopoverTrigger>

        {wsMenuOpen && (
          <PopoverContent align="start" sideOffset={8} className="xiranite-app-region-no-drag w-80 overflow-hidden p-0">
            {appMenuPage === "root" ? (
              <AppMenuRoot
                hazardMode={state.hazardMode}
                onExit={closeApp}
                onHazard={() => state.hazardMode ? workspaceActions.setHazardMode(false) : setHazardConfirmOpen(true)}
                onNavigate={setAppMenuPage}
                onOpenDashboard={() => {
                  workspaceActions.setViewMode("dashboard")
                  setWsMenuOpen(false)
                }}
                onOpenHistory={() => {
                  workspaceActions.setOverlay("history")
                  setWsMenuOpen(false)
                }}
                onOpenDeletions={() => {
                  workspaceActions.setOverlay("deletions")
                  setWsMenuOpen(false)
                }}
                onOpenOperations={() => {
                  workspaceActions.setOverlay("operations")
                  setWsMenuOpen(false)
                }}
                onOpenRegistry={() => {
                  workspaceActions.setOverlay("registry")
                  setWsMenuOpen(false)
                }}
                openDevToolsLabel={t("settings:webview2.openDevTools")}
                onOpenDevTools={openDevTools}
                onOpenSettings={() => {
                  workspaceActions.setOverlay("settings")
                  setWsMenuOpen(false)
                }}
              />
            ) : appMenuPage === "views" ? (
              <AppMenuViews
                onBack={() => setAppMenuPage("root")}
                onSelect={(viewMode) => {
                  workspaceActions.setViewMode(viewMode)
                  setWsMenuOpen(false)
                }}
                t={t}
                value={state.viewMode}
              />
            ) : appMenuPage === "layouts" ? (
              <AppMenuLayouts
                onBack={() => setAppMenuPage("root")}
                onSelect={(layout) => {
                  workspaceActions.setViewMode("cards")
                  workspaceActions.setCardLayout(layout)
                  setWsMenuOpen(false)
                }}
                t={t}
                value={state.cardLayout}
              />
            ) : null}
          </PopoverContent>
        )}
      </Popover>

      {state.hazardMode ? <HazardStatusBadge onDisable={() => workspaceActions.setHazardMode(false)} /> : null}

      <AlertDialog open={hazardConfirmOpen} onOpenChange={setHazardConfirmOpen}>
        <AlertDialogContent size="sm" className="border-foreground/20 bg-background/95 backdrop-blur-xl">
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

      {/* ── ViewMode 切换：cards / dockview / flow 三种主形态 ── */}
      <div className="xiranite-app-region-no-drag flex shrink-0 items-center border-l border-border/60 pl-3">
        <ToggleGroup
          type="single"
          value={state.viewMode}
          onValueChange={(value) => {
            if (value) workspaceActions.setViewMode(value as ViewMode)
          }}
          variant="outline"
          size="sm"
          className="rounded-md border border-border/60 bg-muted/20 p-0.5"
          spacing={1}
        >
          {VIEW_OPTIONS.map(({ key, labelKey, hintKey, icon: Icon }) => (
            <ToggleGroupItem
              key={key}
              value={key}
              data-view-mode={key}
              title={`${t(labelKey)}: ${t(hintKey)}`}
              aria-label={`${t(labelKey)}: ${t(hintKey)}`}
              className="size-7 px-0 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs"
            >
              <Icon className="size-3.5" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* ── Cards 子布局：仅 viewMode === "cards" 时显示 ── */}
      <AnimatePresence initial={false}>
        {state.viewMode === "cards" && (
          <motion.div
            className="xiranite-app-region-no-drag flex shrink-0 items-center border-l border-border/60 pl-3"
            initial={{ opacity: 0, width: 0, x: -6 }}
            animate={{ opacity: 1, width: "auto", x: 0 }}
            exit={{ opacity: 0, width: 0, x: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <ToggleGroup
              type="single"
              value={state.cardLayout}
              onValueChange={(value) => {
                if (value) workspaceActions.setCardLayout(value as CardLayout)
              }}
              variant="outline"
              size="sm"
              className="rounded-md border border-border/60 bg-muted/20 p-0.5"
              spacing={1}
            >
              {CARD_LAYOUT_OPTIONS.map(({ key, labelKey, hintKey, icon: Icon }) => (
                <ToggleGroupItem
                  key={key}
                  value={key}
                  data-card-layout={key}
                  title={`${t(labelKey)}: ${t(hintKey)}`}
                  aria-label={`${t(labelKey)}: ${t(hintKey)}`}
                  className="size-7 px-0 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs"
                >
                  <Icon className="size-3.5" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── 弹出层入口（取代侧栏）── */}
      <div className="xiranite-app-region-no-drag flex items-center gap-1">
        <ActionPieMenu context={actionContext} />
        {/* ── 主题快速切换下拉 ── */}
        <Popover open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              title={t("topbar:theme.label")}
              className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {activeThemeColors.length > 0 ? (
                <span className="grid h-4 w-4 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-border/60">
                  {activeThemeColors.slice(0, 4).map((color, index) => (
                    <span key={`topbar-theme-swatch-${index}`} style={{ background: color }} />
                  ))}
                </span>
              ) : (
                <Palette />
              )}
              <ChevronDown className={cn("transition-transform", themeMenuOpen && "rotate-180")} />
            </Button>
          </PopoverTrigger>

          {themeMenuOpen && (
            <PopoverContent align="end" sideOffset={8} className="xiranite-app-region-no-drag w-[min(92vw,22rem)] overflow-hidden p-0">
              <div className="border-b border-border/60 bg-muted/15 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-primary/30 bg-primary/10 text-primary">
                    <Palette className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{activeThemeLabel}</p>
                    <p className="mt-0.5 truncate text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {activeCustomTheme ? "Imported theme" : t(activePreset.subtitleKey)}
                    </p>
                  </div>
                  {activeThemeColors.length > 0 && (
                    <ThemeSwatchStrip colors={activeThemeColors} id={activeCustomTheme?.name ?? activePreset.key} />
                  )}
                </div>
              </div>

              <div className="grid gap-3 p-3">
                <div className="grid gap-1.5">
                  {/* 设计语言直接占原本「主题预设」的位置（用户 2026-10-07：统一，用同一个 select 切换）。
                      词表只有一份——条目来自 `DESIGN_THEME_ENTRIES`，不在这里再枚举一遍 id。 */}
                  <p className="text-[9px] font-mono tracking-widest text-muted-foreground">{t("settings:timeline.steps.designLanguage")}</p>
                  <Select
                    value={state.designTheme.id}
                    onValueChange={(value) => {
                      if (value) workspaceActions.setDesignTheme({ ...state.designTheme, id: value as AppDesignThemeId })
                    }}
                  >
                    <SelectTrigger className="w-full bg-background/65 font-mono text-xs" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectGroup>
                        {DESIGN_THEME_ENTRIES.map((option) => (
                          <SelectItem key={option.id} value={option.id} title={t(option.descriptionKey)}>
                            <span className="min-w-0 truncate">{t(option.labelKey)}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-mono tracking-widest text-muted-foreground">IMPORTED</p>
                    {activeCustomTheme && <Check className="h-3 w-3 text-primary" />}
                  </div>
                  {state.customThemes.length > 0 ? (
                    <Select value={activeCustomTheme?.name ?? "none"} onValueChange={selectCustomThemeName}>
                      <SelectTrigger className="w-full bg-background/65 font-mono text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectGroup>
                          <SelectItem value="none">
                            <span className="min-w-0 truncate">{t("settings:themeImport.disableImported", "Use preset only")}</span>
                          </SelectItem>
                          {state.customThemes.map((theme) => (
                            <SelectItem key={theme.name} value={theme.name}>
                              <CustomThemeSwatch theme={theme} />
                              <span className="min-w-0 truncate">{theme.name}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-sm border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                      {t("settings:themeImport.noActive", "No imported theme active")}
                    </div>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <p className="text-[9px] font-mono tracking-widest text-muted-foreground">{t("topbar:theme.colorMode")}</p>
                  <ToggleGroup
                    type="single"
                    value={colorMode}
                    onValueChange={(value) => {
                      if (value) setColorMode(value as ColorMode)
                    }}
                    variant="outline"
                    size="sm"
                    className="grid w-full grid-cols-3 gap-1"
                    spacing={1}
                  >
                    {COLOR_MODES.map(m => {
                      const Icon = m.icon
                      return (
                        <ToggleGroupItem
                          key={m.key}
                          value={m.key}
                          className="h-10 min-w-0 gap-1 px-1 font-mono text-[10px] text-muted-foreground data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                        >
                          <Icon className="size-3.5" />
                          <span className="truncate">{t(m.labelKey)}</span>
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                </div>
              </div>

              <Separator />
              <div className="p-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setThemeMenuOpen(false)
                    workspaceActions.setOverlay("settings")
                  }}
                  className="w-full justify-start font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  <Settings />
                  {t("topbar:theme.openSettings")}
                </Button>
              </div>
            </PopoverContent>
          )}
        </Popover>
      </div>

      {showWindowControls && (
        <div className="xiranite-app-region-no-drag flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-2">
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

function ThemeSwatchStrip({ colors, id }: { colors: string[]; id: string }) {
  return (
    <span className="flex h-6 w-20 shrink-0 overflow-hidden rounded-sm border border-border/50">
      {colors.slice(0, 4).map((color, index) => (
        <span key={`${id}-${index}`} className="min-w-0 flex-1" style={{ background: color }} />
      ))}
    </span>
  )
}

function HazardStatusBadge({ onDisable }: { onDisable: () => void }) {
  return (
    <button
      aria-label="关闭 Hazard On"
      className="xiranite-app-region-no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-foreground/25 bg-muted/55 px-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={onDisable}
      title="关闭 Hazard 提示（不会恢复节点预演）"
      type="button"
    >
      <ShieldAlert className="size-3" />
      <span>HAZARD ON</span>
      <span className="border-l border-foreground/20 pl-1.5 text-[9px] font-normal tracking-[0.08em] text-muted-foreground">LIVE</span>
    </button>
  )
}

function AppMenuViews({ onBack, onSelect, t, value }: {
  onBack: () => void
  onSelect: (view: ViewMode) => void
  t: (key: string) => string
  value: ViewMode
}) {
  return (
    <div className="p-1.5">
      <AppMenuBack label="面板" onBack={onBack} />
      <div className="grid gap-0.5 px-1 pb-1">
        {VIEW_OPTIONS.map(({ key, labelKey, icon: Icon }) => (
          <AppMenuRow key={key} active={value === key} icon={Icon} label={t(labelKey)} onSelect={() => onSelect(key)} />
        ))}
        <AppMenuRow active={value === "dashboard"} icon={Gauge} label={t("topbar:viewMode.dashboard")} onSelect={() => onSelect("dashboard")} />
      </div>
    </div>
  )
}

function AppMenuLayouts({ onBack, onSelect, t, value }: {
  onBack: () => void
  onSelect: (layout: CardLayout) => void
  t: (key: string) => string
  value: CardLayout
}) {
  return (
    <div className="p-1.5">
      <AppMenuBack label="布局" onBack={onBack} />
      <div className="grid gap-0.5 px-1 pb-1">
        {CARD_LAYOUT_OPTIONS.map(({ key, labelKey, icon: Icon }) => (
          <AppMenuRow key={key} active={value === key} icon={Icon} label={t(labelKey)} onSelect={() => onSelect(key)} />
        ))}
      </div>
    </div>
  )
}

function AppMenuBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      <span>{label}</span>
    </button>
  )
}
