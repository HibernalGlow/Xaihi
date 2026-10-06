import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  SETTINGS_STAGES,
  stageById,
  type SettingsSectionId,
  type SettingsStepId,
} from "./types"

export type SettingsNavVariant = "rail" | "chips" | "select"

/**
 * Stage / sub-step navigation shared by overlay and settings node card.
 * Layout is driven by node surface mode (via parent), not ad-hoc breakpoints alone.
 */
export function SettingsStageNav({
  section,
  activeStep,
  onSectionChange,
  onStepSelect,
  variant = "rail",
  expandAll = false,
  className,
}: {
  section: SettingsSectionId
  activeStep: SettingsStepId | null
  onSectionChange(section: SettingsSectionId): void
  onStepSelect(section: SettingsSectionId, step: SettingsStepId): void
  variant?: SettingsNavVariant
  /** When true (tall regular+/workspace), every stage keeps sub-steps visible. */
  expandAll?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const activeIndex = SETTINGS_STAGES.findIndex((stage) => stage.id === section)
  const stage = stageById(section)

  if (variant === "select") {
    return (
      <div
        data-settings-stage-nav
        data-settings-nav-variant="select"
        data-settings-nav-expand={expandAll ? "all" : "active"}
        className={cn("grid gap-2", className)}
      >
        <Select value={section} onValueChange={(value) => onSectionChange(value as SettingsSectionId)}>
          <SelectTrigger className="w-full bg-background/60 font-mono text-xs" size="sm" aria-label={t("settings:timeline.navLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SETTINGS_STAGES.map((item, index) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate">{t(item.labelKey)}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={activeStep ?? stage.steps[0]?.id}
          onValueChange={(value) => onStepSelect(section, value as SettingsStepId)}
        >
          <SelectTrigger className="w-full bg-background/60 font-mono text-xs" size="sm" aria-label={t("settings:timeline.stepsLabel", "Sub-section")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {stage.steps.map((step) => (
                <SelectItem key={step.id} value={step.id}>
                  <span className="truncate">{t(step.labelKey)}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (variant === "chips") {
    // Single panel: primary stage segment + nested sub-step strip (not two loose pill rows).
    return (
      <nav
        aria-label={t("settings:timeline.navLabel")}
        data-settings-stage-nav
        data-settings-nav-variant="chips"
        data-settings-nav-expand={expandAll ? "all" : "active"}
        className={cn(
          "min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card/60 shadow-xs",
          className,
        )}
      >
        <div
          className="flex gap-0.5 overflow-x-auto bg-muted/35 p-1"
        >
          {SETTINGS_STAGES.map((item, index) => {
            const Icon = item.icon
            const isActive = item.id === section
            return (
              <button
                key={item.id}
                type="button"
                                data-settings-nav-stage={item.id}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full text-[11px] font-mono leading-none",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <Icon className={cn("size-3 shrink-0", isActive ? "text-primary" : "opacity-70")} />
                <span className="truncate text-[11px] font-medium">{t(item.labelKey)}</span>
                {isActive ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-primary"
                  />
                ) : null}
              </button>
            )
          })}
        </div>

        <div
          className="flex items-stretch gap-0 border-t border-border/60 bg-background/40"
          data-settings-nav-steps-mobile
        >
          <div className="flex shrink-0 items-center gap-1.5 border-r border-border/50 px-2.5 py-1.5">
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
              {t("settings:timeline.stepsLabel")}
            </span>
            <span className="hidden max-w-[5.5rem] truncate text-[11px] text-muted-foreground/80 sm:inline">
              {t(stage.labelKey)}
            </span>
          </div>
          <div
            className="flex min-w-0 flex-1 gap-0 overflow-x-auto"
          >
            {stage.steps.map((step) => {
              const stepActive = activeStep === step.id
              return (
                <button
                  key={step.id}
                  type="button"
                                    data-settings-nav-step={step.id}
                  data-settings-nav-step-stage={section}
                  aria-current={stepActive ? "true" : undefined}
                  onClick={() => onStepSelect(section, step.id)}
                  className={cn(
                    "relative shrink-0 rounded-sm px-3 py-2 text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    stepActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span className="truncate">{t(step.labelKey)}</span>
                    {step.advanced ? (
                      <span className="text-[11px] font-mono uppercase tracking-wider opacity-50">
                        {t("settings:timeline.advShort")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                      stepActive ? "bg-primary" : "bg-transparent",
                    )}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </nav>
    )
  }

  // rail — side timeline list used in regular / expanded / workspace
  return (
    <nav
      aria-label={t("settings:timeline.navLabel")}
      data-settings-stage-nav
      data-settings-nav-variant="rail"
      data-settings-nav-expand={expandAll ? "all" : "active"}
      className={cn(
        "flex h-full min-h-0 w-52 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-muted/10 p-3",
        className,
      )}
    >
      <p className="mb-2 px-1 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        {t("settings:timeline.railTitle")}
      </p>

      <ol className="flex flex-col gap-0">
        {SETTINGS_STAGES.map((item, index) => {
          const Icon = item.icon
          const isActive = item.id === section
          const isPast = index < activeIndex
          const isLast = index === SETTINGS_STAGES.length - 1
          const showSteps = expandAll || isActive

          return (
            <li key={item.id} className="relative flex min-w-0 flex-col">
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-8 bottom-0 left-[15px] w-px",
                    isPast || isActive ? "bg-primary/45" : "bg-border/70",
                  )}
                />
              ) : null}

              <button
                type="button"
                data-settings-nav-stage={item.id}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "relative z-[1] flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-mono",
                    isActive
                      ? "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground"
                      : isPast
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {isPast && !isActive ? <Check aria-hidden className="size-3" /> : String(index + 1)}
                </span>
                <Icon className="size-3.5 shrink-0 opacity-90" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{t(item.labelKey)}</span>
              </button>

              {showSteps ? (
                <ol className="mt-1 space-y-0.5 pb-2 pl-4" data-settings-nav-steps={item.id}>
                  {item.steps.map((step) => {
                    const stepActive = isActive && activeStep === step.id
                    return (
                      <li key={step.id} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-1/2 -left-[9px] size-1.5 -translate-y-1/2 rounded-full border bg-background",
                            stepActive ? "border-primary" : "border-primary/40",
                          )}
                        />
                        <button
                          type="button"
                          data-settings-nav-step={step.id}
                          data-settings-nav-step-stage={item.id}
                          aria-current={stepActive ? "true" : undefined}
                          onClick={() => onStepSelect(item.id, step.id)}
                          className={cn(
                            "w-full rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            stepActive
                              ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border/60"
                              : isActive
                                ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                : "text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{t(step.labelKey)}</span>
                            {step.advanced ? (
                              <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider opacity-60">
                                {t("settings:timeline.advShort")}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
