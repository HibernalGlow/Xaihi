import { useEffect, useRef, useState, type ReactNode } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { useTranslation } from "react-i18next"
import { LayoutGrid, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollProgress } from "@/components/ui/scroll-progress"
import { cn } from "@/lib/utils"
import { Md3eShapeProvider } from "@/nodes/shared/Md3eShapeContext"
import { useNodeSurface, type NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { UiFace, ViewMode, OverlayKind } from "@/types/workspace"
import { AppearanceSection } from "./AppearanceSection"
import { DataSection } from "./DataSection"
import { Md3eSettingsView } from "./Md3eSettingsView"
import { RuntimeSection } from "./RuntimeSection"
import { SettingsSearch } from "./SettingsSearch"
import { SettingsStageNav, type SettingsNavVariant } from "./SettingsStageNav"
import {
  parseSettingsSectionId,
  parseSettingsStepId,
  scrollToSettingsStep,
  type SettingsSearchMatch,
} from "./settingsNavigation"
import {
  SETTINGS_STAGES,
  stageById,
  type SettingsSectionId,
  type SettingsStepId,
} from "./types"
import { ViewSection } from "./ViewSection"
import { WorkspaceSection } from "./WorkspaceSection"

/** Only one stage mounts at a time — multi-stage trees are the main lag source. */
const SECTION_CONTENT: Record<SettingsSectionId, () => ReactNode> = {
  appearance: () => <AppearanceSection />,
  workspace: () => <WorkspaceSection />,
  view: () => <ViewSection />,
  runtime: () => <RuntimeSection />,
  data: () => <DataSection />,
}

/** Map shared node surface modes to settings chrome density (same thresholds as node cards). */
export function resolveSettingsChrome(mode: NodeSurfaceMode, height: number): {
  navVariant: SettingsNavVariant
  expandAll: boolean
  showSearch: boolean
  showSubtitle: boolean
  showStageMeta: boolean
  contentOnly: boolean
} {
  if (mode === "collapsed" || (height > 0 && height < 160)) {
    return {
      navVariant: "select",
      expandAll: false,
      showSearch: false,
      showSubtitle: false,
      showStageMeta: false,
      contentOnly: height > 0 && height < 120,
    }
  }
  if (mode === "compact" || mode === "portrait") {
    return {
      navVariant: "chips",
      expandAll: false,
      showSearch: mode === "portrait" || height >= 280,
      showSubtitle: false,
      showStageMeta: false,
      contentOnly: false,
    }
  }
  if (mode === "regular") {
    return {
      navVariant: "rail",
      expandAll: height >= 520,
      showSearch: true,
      showSubtitle: height >= 400,
      showStageMeta: true,
      contentOnly: false,
    }
  }
  // expanded / workspace
  return {
    navVariant: "rail",
    expandAll: true,
    showSearch: true,
    showSubtitle: true,
    showStageMeta: true,
    contentOnly: false,
  }
}

export function ThemeSettings() {
  const { t } = useTranslation()
  const surface = useNodeSurface()
  const contentRef = useRef<HTMLDivElement>(null)
  const [settingsParam, setSettingsParam] = useQueryState("settings", parseAsString)
  const shellState = useWorkspaceShallowSelector((state) => ({
    viewMode: ((state as { viewMode?: ViewMode }).viewMode ?? "cards") as ViewMode,
    overlay: ((state as { overlay?: OverlayKind }).overlay ?? null) as OverlayKind,
    uiFace: ((state as { uiFace?: UiFace }).uiFace ?? "legacy") as UiFace,
  }))
  const workspaceActions = useWorkspaceActions()

  const [stepParam, setStepParam] = useQueryState("settingsStep", parseAsString)
  const deepLinkSection = parseSettingsSectionId(settingsParam)
  const deepLinkStep = parseSettingsStepId(deepLinkSection, stepParam)
  const [section, setSection] = useState<SettingsSectionId>(deepLinkSection ?? "appearance")
  const [activeStep, setActiveStep] = useState<SettingsStepId | null>(
    () => stageById(deepLinkSection ?? "appearance").steps[0]?.id ?? null,
  )
  const [pendingStep, setPendingStep] = useState<SettingsStepId | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const stage = stageById(section)
  const stageIndex = SETTINGS_STAGES.findIndex((item) => item.id === section)
  const chrome = resolveSettingsChrome(surface.mode, surface.height)
  const roomy = surface.density === "roomy"
  const sideRail = chrome.navVariant === "rail"

  useEffect(() => {
    if (!deepLinkSection) return
    setSection(deepLinkSection)
    setActiveStep(deepLinkStep ?? stageById(deepLinkSection).steps[0]?.id ?? null)
    setPendingStep(deepLinkStep)
  }, [deepLinkSection, deepLinkStep])

  useEffect(() => {
    if (!pendingStep) return
    let cancelled = false
    let attempts = 0

    const tryScroll = () => {
      if (cancelled) return
      const ok = scrollToSettingsStep(contentRef.current, pendingStep, "smooth")
      if (ok) {
        setActiveStep(pendingStep)
        setPendingStep(null)
        return
      }
      attempts += 1
      if (attempts < 16) window.requestAnimationFrame(tryScroll)
      else setPendingStep(null)
    }

    const frame = window.requestAnimationFrame(tryScroll)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [section, pendingStep])

  function selectSection(next: SettingsSectionId) {
    setSection(next)
    setActiveStep(stageById(next).steps[0]?.id ?? null)
    setPendingStep(null)
    setScrolled(false)
    contentRef.current?.scrollTo({ top: 0 })
    void setSettingsParam(next)
    void setStepParam(null)
  }

  function selectStep(nextSection: SettingsSectionId, step: SettingsStepId) {
    void setStepParam(step)
    if (nextSection !== section) {
      setSection(nextSection)
      setPendingStep(step)
      void setSettingsParam(nextSection)
      return
    }
    setActiveStep(step)
    scrollToSettingsStep(contentRef.current, step, "smooth")
  }

  function handleSearchSelect(match: SettingsSearchMatch) {
    if (match.kind === "stage") {
      selectSection(match.sectionId)
      return
    }
    selectStep(match.sectionId, match.stepId)
  }

  if (shellState.uiFace === "md3e") {
    return (
      <Md3eShapeProvider
        nodeId="workspace"
        enabled
        surfaceWidth={surface.width}
        surfaceMode={surface.mode}
      >
        <Md3eSettingsView
          surface={surface}
          chrome={chrome}
          initialSection={deepLinkSection}
          initialStep={deepLinkStep}
          onSyncLegacyRoute={(nextSection, nextStep) => {
            setSection(nextSection)
            setActiveStep(nextStep ?? stageById(nextSection).steps[0]?.id ?? null)
            void setSettingsParam(nextSection)
            void setStepParam(nextStep)
          }}
        />
      </Md3eShapeProvider>
    )
  }

  return (
    <div
      ref={surface.ref}
      data-settings-surface
      data-settings-face="legacy"
      data-settings-mode={surface.mode}
      data-settings-density={surface.density}
      data-settings-scrolled={scrolled ? "true" : "false"}
      className="@container/settings flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      {/* Header adapts like node chrome: tight cards drop subtitle / search. */}
      {!chrome.contentOnly ? (
        <div
          data-settings-header
          className={cn(
            "shrink-0 border-b border-border/60",
            roomy ? (scrolled ? "px-4 py-2" : "px-4 py-3") : "px-3 py-2",
          )}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 data-settings-title className={cn("truncate font-semibold text-foreground", roomy ? "text-sm" : "text-xs")}>
                  {t("settings:title")}
                </h1>
                {chrome.showSubtitle ? (
                  <p data-settings-subtitle className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t("settings:headerSubtitle")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  data-settings-ui-face-switcher
                  data-ui-face-option="md3e"
                  onClick={() => workspaceActions.setUiFace?.("md3e")}
                  title="切换到 Material 3 Expressive (MD3E) 界面形态"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <Sparkles className="size-3.5" />
                  <span>切换 MD3E 形态</span>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    workspaceActions.deployComponent("settings", shellState.viewMode)
                    if (shellState.overlay === "settings") workspaceActions.setOverlay(null)
                  }}
                  title={t("registry:deployToLayout")}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {t("registry:deployToLayout")}
                </Button>
                {chrome.showStageMeta ? (
                  <div className="hidden rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-right sm:block">
                    <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                      {t("settings:timeline.railTitle")}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-foreground">
                      {t(stage.labelKey)}
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        {String(Math.max(stageIndex, 0) + 1).padStart(2, "0")}/
                        {String(SETTINGS_STAGES.length).padStart(2, "0")}
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {chrome.showSearch ? (
              <SettingsSearch onSelect={handleSearchSelect} className="max-w-md" />
            ) : null}
            {!sideRail ? (
              <SettingsStageNav
                section={section}
                activeStep={activeStep}
                onSectionChange={selectSection}
                onStepSelect={selectStep}
                variant={chrome.navVariant}
                expandAll={chrome.expandAll}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-b border-border/60 px-2 py-1.5">
          <SettingsStageNav
            section={section}
            activeStep={activeStep}
            onSectionChange={selectSection}
            onStepSelect={selectStep}
            variant="select"
            expandAll={false}
          />
        </div>
      )}

      <div className={cn("flex min-h-0 flex-1", sideRail ? "flex-row" : "flex-col")}>
        {sideRail ? (
          <SettingsStageNav
            section={section}
            activeStep={activeStep}
            onSectionChange={selectSection}
            onStepSelect={selectStep}
            variant="rail"
            expandAll={chrome.expandAll}
          />
        ) : null}

        <div className="relative min-h-0 min-w-0 flex-1">
          <ScrollProgress containerRef={contentRef} className="absolute inset-x-0 top-0 h-0.5" />
          <div
            ref={contentRef}
            onScroll={(event) => {
              const nextScrolled = event.currentTarget.scrollTop > 24
              setScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled))
            }}
            className={cn(
              "h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto",
              roomy ? "p-4" : chrome.navVariant === "select" ? "p-2" : "p-3",
            )}
            data-settings-scroll
          >
            <section
              data-timeline-entry={section}
              data-settings-active-section={section}
              className="min-w-0 space-y-3"
            >
              {!chrome.contentOnly ? (
                <header className="mb-1 px-0.5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                    {String(Math.max(stageIndex, 0) + 1).padStart(2, "0")} · {t(stage.labelKey)}
                  </p>
                  {chrome.showSubtitle || sideRail ? (
                    <>
                      <h2 className="mt-1 text-base font-semibold text-foreground">{t(stage.labelKey)}</h2>
                      {chrome.showSubtitle ? (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {t(stage.descriptionKey)}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </header>
              ) : null}
              <div key={section}>{SECTION_CONTENT[section]()}</div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
