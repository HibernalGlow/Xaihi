import { useState, type ComponentProps, type ComponentType, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { BlurFade } from "@/components/ui/blur-fade"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RubberSegment } from "@/components/ui/rubber-segment"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { SettingsStepId } from "./types"

export function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 rounded-sm border border-border/40 bg-muted/15 px-3 py-2">
      <span className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-xs font-mono text-foreground" title={value}>{value}</span>
    </div>
  )
}

/**
 * 档位数决定等分列数：RubberSegment 的 equalSlots 让每档占 1/N，加一档不会掉出孤立末行
 * （2026-10-05 加「不接管」档时，写死 `grid-cols-4` 的表正是这样漏了一列）。
 */
export function PreferenceToggle({
  label,
  labels,
  onChange,
  value,
  values,
}: {
  label: string
  labels: Record<string, string>
  onChange: (value: string) => void
  value: string
  values: readonly string[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <RubberSegment
        aria-label={label}
        value={value}
        items={values.map(item => ({ value: item, label: labels[item] ?? item }))}
        onChange={onChange}
        size="sm"
        className="w-full [--rs-font:11px]"
      />
    </div>
  )
}

/**
 * Nested block inside the component-skins step.
 * Each block targets one shared control family so the long settings list stays scannable.
 */
export function ComponentSkinBlock({
  index,
  title,
  target,
  description,
  icon: Icon,
  children,
  className,
}: {
  index: number
  title: string
  /** Short label for the actual control being themed, e.g. "Tabs", "Switch". */
  target: string
  description?: string
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border/80 bg-background/55 shadow-[inset_0_1px_0_oklch(1_0_0/0.04)]",
        className,
      )}
      data-component-skin-block={target}
    >
      <header className="flex items-start gap-3 border-b border-border/60 bg-muted/30 px-3 py-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-xs font-semibold tabular-nums text-muted-foreground">
          {String(index).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {Icon ? (
              <span className="grid size-5 place-items-center rounded-sm bg-primary/10 text-primary">
                <Icon className="size-3" />
              </span>
            ) : null}
            <h4 className="text-sm font-semibold leading-none tracking-tight text-foreground">{title}</h4>
            <span className="rounded-full border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
              {target}
            </span>
          </div>
          {description ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  )
}

/**
 * Code-block style frame for live component previews.
 * Distinct primary-tinted canvas so options and previews never blend together.
 */
export function ComponentSkinPreview({
  label,
  caption,
  children,
  className,
  bodyClassName,
  compact = false,
  ...props
}: {
  label: string
  /** Optional mono path/caption on the right, e.g. "Tabs · live". */
  caption?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Inline chip layout for small previews (e.g. switches). */
  compact?: boolean
} & ComponentProps<"div">) {
  if (compact) {
    return (
      <div
        {...props}
        className={cn(
          "inline-flex min-w-0 items-center gap-2 rounded-md border border-primary/30 bg-[color-mix(in_oklch,var(--primary)_12%,var(--background))] px-2.5 py-1.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_8%,transparent)]",
          className,
        )}
        data-component-skin-preview="compact"
      >
        <span className="font-mono text-[10px] font-medium tracking-wide text-primary">
          {label}
        </span>
        <span className="h-3 w-px shrink-0 bg-primary/25" aria-hidden />
        {children}
      </div>
    )
  }

  return (
    <div
      {...props}
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-primary/30 bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_8%,transparent)]",
        className,
      )}
      data-component-skin-preview
    >
      <div className="flex items-center gap-2 border-b border-primary/20 bg-[color-mix(in_oklch,var(--primary)_16%,var(--background))] px-2.5 py-1.5">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="size-1.5 rounded-full bg-primary/55" />
          <span className="size-1.5 rounded-full bg-primary/35" />
          <span className="size-1.5 rounded-full bg-primary/20" />
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
          {label}
        </span>
        {caption ? (
          <span className="ml-auto truncate font-mono text-[10px] text-primary/70">{caption}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "min-w-0 bg-[color-mix(in_oklch,var(--primary)_6%,var(--card))] p-2.5",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function AlphabetIndexSlider({
  label,
  value,
  min,
  max,
  current,
  onValueChange,
}: {
  label: string
  value: string
  min: number
  max: number
  current: number
  onValueChange(value: number): void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Slider
        aria-label={label}
        value={[current]}
        onValueChange={([next]) => onValueChange(next)}
        min={min}
        max={max}
        step={1}
      />
    </div>
  )
}

/** Step card: light surface + optional BlurFade + advanced collapsible. Avoids MagicCard/BorderBeam per-card cost. */
export function SettingsStepCard({
  id,
  title,
  description,
  icon: Icon,
  actions,
  advanced,
  defaultOpen = true,
  children,
  className,
  delay = 0,
}: {
  id: SettingsStepId
  title: string
  description?: string
  icon?: ComponentType<{ className?: string }>
  actions?: ReactNode
  advanced?: boolean
  defaultOpen?: boolean
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen && !advanced)

  const body = (
    <div className={cn("min-w-0 overflow-hidden rounded-md border border-border/70 bg-card/80", className)}>
      {advanced ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 border-b border-border/50 px-4 py-3 text-left">
            <StepHeader icon={Icon} title={title} description={description} advanced actions={actions} advancedLabel={t("settings:timeline.advanced")} />
            <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="min-w-0 space-y-4 p-4">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
            <StepHeader icon={Icon} title={title} description={description} actions={actions} />
          </div>
          <div className="min-w-0 space-y-4 p-4">{children}</div>
        </>
      )}
    </div>
  )

  return (
    <div id={`settings-step-${id}`} data-settings-step={id} className="min-w-0 scroll-mt-4">
      {/* Short delay only; no continuous beam animations on every card. */}
      <BlurFade delay={Math.min(delay, 0.12)} offset={6} direction="up" inView={false}>
        {body}
      </BlurFade>
    </div>
  )
}

function StepHeader({
  icon: Icon,
  title,
  description,
  advanced,
  advancedLabel,
  actions,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  advanced?: boolean
  advancedLabel?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      {Icon ? (
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm border border-border/50 bg-muted/30">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {advanced ? (
            <span className="rounded-sm border border-border/60 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              {advancedLabel}
            </span>
          ) : null}
          {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        {description ? (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
