import {
  Box,
  Columns2,
  FormInput,
  Grid,
  LayoutPanelTop,
  MousePointerClick,
  PanelTop,
  ScrollText,
  SlidersHorizontal,
  ToggleLeft,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ChoiceControlField } from "@/components/ui/choice-control"
import { Slider } from "@/components/ui/slider"
import {
  CHOICE_CONTROL_STYLES,
  FIELD_TITLE_STYLES,
  type ChoiceControlStyle,
  type FieldTitleStyle,
} from "@/components/ui/choice-control-variants"
import { ModulePanel } from "@/components/ui/module-panel"
import {
  MODULE_PANEL_STYLES,
  MODULE_TITLE_STYLES,
  RESIZABLE_HANDLE_STYLES,
  type ModulePanelStyle,
  type ModuleTitleStyle,
  type ResizableHandleStyle,
} from "@/components/ui/module-panel-variants"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_DISPLAY_STYLES, type TabDisplayStyle } from "@/components/ui/tabs-variants"
import { SWITCH_DISPLAY_STYLES, type SwitchDisplayStyle } from "@/components/ui/switch-variants"
import { SCROLLBAR_DISPLAY_STYLES, type ScrollbarDisplayStyle } from "@/components/ui/scrollbar-variants"
import { SLIDER_DISPLAY_STYLES, type SliderDisplayStyle } from "@/components/ui/slider-variants"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SwimlaneInteractionSettings } from "@/components/workspace/swimlane/SwimlaneInteractionSettings"
import { normalizeSwimlanePreferences } from "@/components/workspace/swimlane/model"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { ComponentSkinBlock, ComponentSkinPreview, PreferenceToggle, SettingsStepCard } from "./primitives"

export function ViewSection() {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const [sliderPreview, setSliderPreview] = useState({ radius: 62, intensity: 78, strength: 54 })
  const state = useWorkspaceShallowSelector((workspace) => ({
    activeWorkspaceId: workspace.activeWorkspaceId,
    laneWorkspacePreferences: workspace.laneWorkspacePreferences,
    cardClickAction: workspace.cardClickAction,
    cardDoubleClickAction: workspace.cardDoubleClickAction,
    tabDisplayStyle: workspace.tabDisplayStyle,
    switchDisplayStyle: workspace.switchDisplayStyle,
    scrollbarDisplayStyle: workspace.scrollbarDisplayStyle,
    sliderDisplayStyle: workspace.sliderDisplayStyle,
    choiceControlStyle: workspace.choiceControlStyle,
    fieldTitleStyle: workspace.fieldTitleStyle,
    moduleTitleStyle: workspace.moduleTitleStyle,
    modulePanelStyle: workspace.modulePanelStyle,
    resizableHandleStyle: workspace.resizableHandleStyle,
  }))
  const lanePreferences = normalizeSwimlanePreferences(state.laneWorkspacePreferences[state.activeWorkspaceId])

  return (
    <div className="min-w-0 space-y-3">
      <SettingsStepCard
        id="swimlane"
        title={t("settings:timeline.steps.swimlane")}
        description={t("settings:timeline.stepDesc.swimlane")}
        icon={Grid}
        delay={0.02}
      >
        <div className="space-y-3">
          <SwimlaneInteractionSettings
            value={{
              soloOnFocus: lanePreferences.soloOnFocus,
              showNavigatorInSolo: lanePreferences.showNavigatorInSolo,
              edgeRevealDelayMs: lanePreferences.edgeRevealDelayMs,
              focusOnHover: lanePreferences.focusOnHover,
              focusDelayMs: lanePreferences.focusDelayMs,
            }}
            labels={{
              soloOnFocus: t("settings:view.swimlane.soloOnFocus"),
              showNavigatorInSolo: t("settings:view.swimlane.showNavigatorInSolo"),
              edgeRevealDelay: t("settings:view.swimlane.edgeRevealDelay"),
              focusOnHover: t("settings:view.swimlane.focusOnHover"),
              focusDelay: t("settings:view.swimlane.focusDelay"),
            }}
            onChange={(patch) => workspaceActions.patchLaneWorkspacePreferences(state.activeWorkspaceId, patch)}
          />
          <label className="mt-1 flex min-h-11 items-center justify-between gap-4 rounded-md border border-border/70 px-3 py-2 text-sm">
            <span>固定栏跟随聚焦泳道</span>
            <Switch
              checked={lanePreferences.navigatorFollowsFocus}
              onCheckedChange={(navigatorFollowsFocus) =>
                workspaceActions.patchLaneWorkspacePreferences(state.activeWorkspaceId, {
                  navigatorFollowsFocus,
                  ...(navigatorFollowsFocus ? { navigatorLaneId: lanePreferences.activeLaneId } : {}),
                })
              }
            />
          </label>
        </div>
      </SettingsStepCard>

      <SettingsStepCard
        id="components"
        title={t("settings:view.componentDisplay.title", "Component skins")}
        description={t(
          "settings:view.componentDisplay.description",
          "Each block below skins one shared control family used across nodes. Appearance only — behavior and keyboard semantics stay the same.",
        )}
        icon={Box}
        delay={0.06}
      >
        <div className="min-w-0 space-y-3">
          <p className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {t(
              "settings:view.componentDisplay.guide",
              "Scan by number and component badge. Options sit under each header; live previews use the same primitives as node UIs.",
            )}
          </p>

          <ComponentSkinBlock
            index={1}
            icon={PanelTop}
            title={t("settings:view.componentDisplay.tabs.title", "Tabs")}
            target={t("settings:view.componentDisplay.tabs.target", "Tabs")}
            description={t(
              "settings:view.componentDisplay.tabs.description",
              "Node result rails, settings previews, and any shared Radix Tabs list.",
            )}
          >
            <ToggleGroup
              type="single"
              value={state.tabDisplayStyle}
              onValueChange={(value) => value && workspaceActions.setTabDisplayStyle(value as TabDisplayStyle)}
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-2 gap-1.5 @sm:grid-cols-6"
              spacing={2}
            >
              {TAB_DISPLAY_STYLES.map((style) => (
                <ToggleGroupItem key={style} value={style} className="min-w-0 px-2 text-[11px]">
                  {t(`settings:view.componentDisplay.styles.${style}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <ComponentSkinPreview
              label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              caption="Tabs · live"
            >
              <Tabs defaultValue="preview" className="gap-2">
                <TabsList className="max-w-full overflow-x-auto">
                  <TabsTrigger value="preview">{t("settings:view.componentDisplay.preview", "Preview")}</TabsTrigger>
                  <TabsTrigger value="history">{t("settings:view.componentDisplay.history", "History")}</TabsTrigger>
                  <TabsTrigger value="details">{t("settings:view.componentDisplay.details", "Details")}</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="px-1 text-xs text-muted-foreground">
                  {t("settings:view.componentDisplay.previewHint", "This is the same shared component used by node result tabs.")}
                </TabsContent>
                <TabsContent value="history" className="px-1 text-xs text-muted-foreground">
                  {t("settings:view.componentDisplay.historyHint", "Changing the display type never changes tab content or actions.")}
                </TabsContent>
                <TabsContent value="details" className="px-1 text-xs text-muted-foreground">
                  {t("settings:view.componentDisplay.detailsHint", "Other component preferences can be added here without changing node implementations.")}
                </TabsContent>
              </Tabs>
            </ComponentSkinPreview>
          </ComponentSkinBlock>

          <ComponentSkinBlock
            index={2}
            icon={ToggleLeft}
            title={t("settings:view.componentDisplay.switches.title", "Switches")}
            target={t("settings:view.componentDisplay.switches.target", "Switch")}
            description={t(
              "settings:view.componentDisplay.switches.description",
              "Boolean toggles in node cards, settings rows, and configuration panels.",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={state.switchDisplayStyle}
                onValueChange={(value) => value && workspaceActions.setSwitchDisplayStyle(value as SwitchDisplayStyle)}
                variant="outline"
                size="sm"
                spacing={2}
              >
                {SWITCH_DISPLAY_STYLES.map((style) => (
                  <ToggleGroupItem key={style} value={style} className="px-2 text-[11px]">
                    {t(`settings:view.componentDisplay.switches.styles.${style}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ComponentSkinPreview
                compact
                className="ml-auto"
                label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              >
                <span className="text-[11px] text-muted-foreground">
                  {t("settings:view.componentDisplay.switches.preview", "Off")}
                </span>
                <Switch
                  checked={false}
                  aria-label={t("settings:view.componentDisplay.switches.preview", "Off")}
                  onCheckedChange={() => undefined}
                />
                <Switch
                  checked
                  aria-label={t("settings:view.componentDisplay.switches.previewOn", "On")}
                  onCheckedChange={() => undefined}
                />
              </ComponentSkinPreview>
            </div>
          </ComponentSkinBlock>

          <ComponentSkinBlock
            index={3}
            icon={SlidersHorizontal}
            title={t("settings:view.componentDisplay.sliders.title", "Sliders")}
            target={t("settings:view.componentDisplay.sliders.target", "Slider")}
            description={t(
              "settings:view.componentDisplay.sliders.description",
              "Horizontal parameter rails such as Magic Card glow, density, and every shared Radix Slider.",
            )}
          >
            <ToggleGroup
              type="single"
              value={state.sliderDisplayStyle}
              onValueChange={(value) => value && workspaceActions.setSliderDisplayStyle(value as SliderDisplayStyle)}
              variant="outline"
              size="sm"
              className="grid w-full min-w-0 grid-cols-2 gap-1.5 @sm:grid-cols-6"
              spacing={2}
            >
              {SLIDER_DISPLAY_STYLES.map((style) => (
                <ToggleGroupItem key={style} value={style} className="min-w-0 px-2 text-[11px]">
                  {t(`settings:view.componentDisplay.sliders.styles.${style}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <ComponentSkinPreview
              label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              caption="Slider · Magic Card"
              bodyClassName="space-y-3"
            >
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "settings:view.componentDisplay.sliders.previewHint",
                  "Same control family as Magic Card parameter rails and settings density sliders.",
                )}
              </p>
              {(
                [
                  {
                    key: "radius" as const,
                    label: t("settings:view.componentDisplay.sliders.previewRadius", "Glow radius"),
                  },
                  {
                    key: "intensity" as const,
                    label: t("settings:view.componentDisplay.sliders.previewIntensity", "Glow intensity"),
                  },
                  {
                    key: "strength" as const,
                    label: t("settings:view.componentDisplay.sliders.previewStrength", "Primary strength"),
                  },
                ] as const
              ).map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-foreground/90">{row.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{sliderPreview[row.key]}</span>
                  </div>
                  <Slider
                    value={[sliderPreview[row.key]]}
                    min={0}
                    max={100}
                    step={1}
                    aria-label={row.label}
                    onValueChange={([next]) =>
                      setSliderPreview((current) => ({ ...current, [row.key]: next ?? current[row.key] }))
                    }
                  />
                </div>
              ))}
            </ComponentSkinPreview>
          </ComponentSkinBlock>

          <ComponentSkinBlock
            index={4}
            icon={ScrollText}
            title={t("settings:view.componentDisplay.scrollbars.title", "Scrollbars")}
            target={t("settings:view.componentDisplay.scrollbars.target", "Scrollbar")}
            description={t(
              "settings:view.componentDisplay.scrollbars.description",
              "Vertical rails and horizontal bottom strips for native overflow and ScrollArea across node panels.",
            )}
          >
            <ToggleGroup
              type="single"
              value={state.scrollbarDisplayStyle}
              onValueChange={(value) => value && workspaceActions.setScrollbarDisplayStyle(value as ScrollbarDisplayStyle)}
              variant="outline"
              size="sm"
              className="grid w-full min-w-0 grid-cols-2 gap-1.5 @sm:grid-cols-6"
              spacing={2}
            >
              {SCROLLBAR_DISPLAY_STYLES.map((style) => (
                <ToggleGroupItem key={style} value={style} className="min-w-0 px-2 text-[11px]">
                  {t(`settings:view.componentDisplay.scrollbars.styles.${style}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {/*
              Force both rails: the scrollport must be width-constrained (min-w-0 +
              max-w-full) so wide children create a horizontal strip instead of
              expanding the settings card.
            */}
            <ComponentSkinPreview
              label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              caption="Scrollbar · x/y"
              data-testid="scrollbar-style-preview"
              bodyClassName="space-y-2.5"
            >
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "settings:view.componentDisplay.scrollbars.previewHint",
                  "Top box: vertical + horizontal together. Bottom strip: horizontal rail only.",
                )}
              </p>

              <div className="box-border h-32 w-full min-w-0 max-w-full overflow-auto overscroll-contain rounded-sm border border-primary/20 bg-[color-mix(in_oklch,var(--background)_88%,var(--primary))] [overflow-x:scroll] [overflow-y:scroll]">
                <div className="grid h-52 w-[56rem] max-w-none gap-1.5 p-2 text-[11px] leading-5 text-muted-foreground">
                  {Array.from({ length: 12 }, (_, index) => (
                    <div
                      key={index}
                      className="flex h-6 w-full min-w-[54rem] items-center gap-2 whitespace-nowrap rounded-sm border border-primary/15 bg-background/75 px-2"
                    >
                      <span className="font-mono text-[10px] text-primary/70">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        {t(
                          "settings:view.componentDisplay.scrollbars.previewLine",
                          "Shared scrollbar line {{n}} — wide row for vertical rail and horizontal strip",
                          { n: index + 1 },
                        )}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-primary/55">
                        col-a · col-b · col-c · col-d · col-e · col-f · col-g · col-h · col-i · col-j
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 max-w-full">
                <p className="mb-1 font-mono text-[10px] tracking-wide text-primary/80">
                  {t("settings:view.componentDisplay.scrollbars.horizontalOnly", "Horizontal strip")}
                </p>
                <div className="box-border h-11 w-full min-w-0 max-w-full overflow-x-scroll overflow-y-hidden overscroll-x-contain rounded-sm border border-primary/20 bg-[color-mix(in_oklch,var(--background)_88%,var(--primary))]">
                  <div className="flex h-full w-[60rem] max-w-none items-center gap-2 px-2 text-[11px] whitespace-nowrap text-muted-foreground">
                    {Array.from({ length: 20 }, (_, index) => (
                      <span
                        key={index}
                        className="inline-flex shrink-0 items-center rounded-sm border border-primary/20 bg-background/80 px-2 py-1 font-mono text-[10px] text-foreground/80"
                      >
                        cell-{index + 1}
                      </span>
                    ))}
                    <span className="shrink-0 text-primary/80">
                      {t(
                        "settings:view.componentDisplay.scrollbars.horizontalHint",
                        "Drag this bottom rail — same style as wide node tables.",
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </ComponentSkinPreview>
          </ComponentSkinBlock>

          <ComponentSkinBlock
            index={5}
            icon={FormInput}
            title={t("settings:timeline.fieldsTitle")}
            target={t("settings:view.componentDisplay.fields.target", "Field / Choice")}
            description={t("settings:timeline.fieldsDesc")}
          >
            <PreferenceToggle
              label={t("settings:timeline.controlStyle")}
              value={state.choiceControlStyle}
              values={CHOICE_CONTROL_STYLES}
              labels={{
                segmented: t("settings:timeline.choice.segmented"),
                pills: t("settings:timeline.choice.pills"),
                tabs: t("settings:timeline.choice.tabs"),
                tiles: t("settings:timeline.choice.tiles"),
                none: t("settings:timeline.choice.none"),
              }}
              onChange={(value) => workspaceActions.setChoiceControlStyle(value as ChoiceControlStyle)}
            />
            <PreferenceToggle
              label={t("settings:timeline.fieldTitleStyle")}
              value={state.fieldTitleStyle}
              values={FIELD_TITLE_STYLES}
              labels={{
                stacked: t("settings:timeline.fieldTitle.stacked"),
                legend: t("settings:timeline.fieldTitle.legend"),
                inline: t("settings:timeline.fieldTitle.inline"),
                hidden: t("settings:timeline.fieldTitle.hidden"),
                none: t("settings:timeline.fieldTitle.none"),
              }}
              onChange={(value) => workspaceActions.setFieldTitleStyle(value as FieldTitleStyle)}
            />
            <ComponentSkinPreview
              label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              caption="Field / Choice · live"
            >
              <ChoiceControlField label={t("settings:timeline.compressionPreview")}>
                <ToggleGroup
                  aria-label={t("settings:timeline.compressionPreview")}
                  className="grid w-full grid-cols-2"
                  type="single"
                  value="lossless"
                  onValueChange={() => undefined}
                  size="sm"
                >
                  <ToggleGroupItem value="lossless">{t("settings:timeline.lossless")}</ToggleGroupItem>
                  <ToggleGroupItem value="lossy">{t("settings:timeline.lossy")}</ToggleGroupItem>
                </ToggleGroup>
              </ChoiceControlField>
            </ComponentSkinPreview>
          </ComponentSkinBlock>

          <ComponentSkinBlock
            index={6}
            icon={LayoutPanelTop}
            title={t("settings:timeline.modulePanelTitle")}
            target={t("settings:view.componentDisplay.modulePanel.target", "ModulePanel")}
            description={t("settings:timeline.modulePanelDesc")}
          >
            <PreferenceToggle
              label={t("settings:timeline.moduleTitleStyle")}
              value={state.moduleTitleStyle}
              values={MODULE_TITLE_STYLES}
              labels={{
                legend: t("settings:timeline.moduleTitle.legend"),
                inline: t("settings:timeline.moduleTitle.inline"),
                bar: t("settings:timeline.moduleTitle.bar"),
                minimal: t("settings:timeline.moduleTitle.minimal"),
              }}
              onChange={(value) => workspaceActions.setModuleTitleStyle(value as ModuleTitleStyle)}
            />
            <PreferenceToggle
              label={t("settings:timeline.modulePanelStyle")}
              value={state.modulePanelStyle}
              values={MODULE_PANEL_STYLES}
              labels={{
                soft: t("settings:timeline.modulePanel.soft"),
                solid: t("settings:timeline.modulePanel.solid"),
                outline: t("settings:timeline.modulePanel.outline"),
                flat: t("settings:timeline.modulePanel.flat"),
              }}
              onChange={(value) => workspaceActions.setModulePanelStyle(value as ModulePanelStyle)}
            />
            <PreferenceToggle
              label={t("settings:timeline.resizableHandle")}
              value={state.resizableHandleStyle}
              values={RESIZABLE_HANDLE_STYLES}
              labels={{
                grip: t("settings:timeline.handle.grip"),
                dots: t("settings:timeline.handle.dots"),
                line: t("settings:timeline.handle.line"),
                minimal: t("settings:timeline.handle.minimal"),
              }}
              onChange={(value) => workspaceActions.setResizableHandleStyle(value as ResizableHandleStyle)}
            />
            <ComponentSkinPreview
              label={t("settings:view.componentDisplay.livePreview", "Live preview")}
              caption="ModulePanel · live"
            >
              <ModulePanel title={t("settings:timeline.previewModule")} badge={t("settings:timeline.previewBadge")} icon={Columns2}>
                <p className="text-xs text-muted-foreground">{t("settings:timeline.previewModuleDesc")}</p>
              </ModulePanel>
            </ComponentSkinPreview>
          </ComponentSkinBlock>
        </div>
      </SettingsStepCard>

      <SettingsStepCard
        id="card-interaction"
        title={t("settings:view.cardInteraction")}
        description={t("settings:view.cardInteractionDesc")}
        icon={MousePointerClick}
        delay={0.1}
      >
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-medium">{t("settings:view.clickAction")}</div>
            <ToggleGroup
              type="single"
              value={state.cardClickAction}
              onValueChange={(v) => v && workspaceActions.setCardClickAction(v as "none" | "focus" | "fullscreen")}
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-3 gap-1"
            >
              <ToggleGroupItem value="none" className="text-xs">{t("settings:view.action.none")}</ToggleGroupItem>
              <ToggleGroupItem value="focus" className="text-xs">{t("settings:view.action.focus")}</ToggleGroupItem>
              <ToggleGroupItem value="fullscreen" className="text-xs">{t("settings:view.action.fullscreen")}</ToggleGroupItem>
            </ToggleGroup>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("settings:view.clickActionDesc")}</p>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium">{t("settings:view.doubleClickAction")}</div>
            <ToggleGroup
              type="single"
              value={state.cardDoubleClickAction}
              onValueChange={(v) => v && workspaceActions.setCardDoubleClickAction(v as "none" | "focus" | "fullscreen")}
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-3 gap-1"
            >
              <ToggleGroupItem value="none" className="text-xs">{t("settings:view.action.none")}</ToggleGroupItem>
              <ToggleGroupItem value="focus" className="text-xs">{t("settings:view.action.focus")}</ToggleGroupItem>
              <ToggleGroupItem value="fullscreen" className="text-xs">{t("settings:view.action.fullscreen")}</ToggleGroupItem>
            </ToggleGroup>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("settings:view.doubleClickActionDesc")}</p>
          </div>
        </div>
      </SettingsStepCard>
    </div>
  )
}
