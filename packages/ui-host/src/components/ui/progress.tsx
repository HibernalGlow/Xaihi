import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

/**
 * Radix derives `ProgressProps` without `children`, but this component renders an
 * Indicator inside the Root — spelling the props out keeps that legal without a cast.
 */
type ProgressProps = Omit<React.ComponentPropsWithoutRef<"div">, "ref"> & {
  value?: number | null
  max?: number
  getProgress?: (value: number, max: number) => number
  label?: string
  variant?: "normal" | "wavy" | "gradient" | "segmented" | "dots"
  segments?: number
  showThumb?: boolean
  thumbStyle?: "circle" | "cookie" | "clover" | "star"
  tone?: "primary" | "secondary" | "tertiary" | "destructive"
}

/**
 * Radix types its primitives through `Primitive.div`, whose props omit `children`,
 * yet `Root` really does render them. Re-attach the child past that gap with a
 * narrow alias instead of `as any` — the Indicator must stay inside the Root element.
 */
const Root = ProgressPrimitive.Root as React.ComponentType<
  Omit<React.ComponentPropsWithoutRef<"div">, "ref"> & {
    value?: number | null
    max?: number
    getProgress?: (value: number, max: number) => number
  }
>

function Progress({
  className,
  value,
  label,
  variant = "normal",
  segments = 10,
  showThumb = false,
  thumbStyle = "circle",
  tone = "primary",
  max = 100,
  getProgress,
  ...props
}: ProgressProps) {
  const rawValue = value ?? 0
  const progress = getProgress ? getProgress(rawValue, max) : rawValue
  const percentage = Math.max(0, Math.min(100, (progress / max) * 100))
  const segmentCount = Math.max(1, Math.round(segments))
  const toneClass = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    tertiary: "bg-tertiary",
    destructive: "bg-destructive",
  }[tone]

  return (
    <Root
      data-slot="progress"
      data-variant={variant}
      data-tone={tone}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
      role="progressbar"
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? "progress"}
    >
      {variant === "wavy" ? (
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 32 10" preserveAspectRatio="none">
          <path d="M 0 8 Q 8 2, 16 8 T 32 8" fill="none" className={cn("stroke-current", tone === "destructive" ? "text-destructive" : "text-primary")} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : variant === "segmented" || variant === "dots" ? (
        <div className="flex h-full w-full items-center gap-0.5">
          {Array.from({ length: segmentCount }, (_, index) => {
            const active = ((index + 1) / segmentCount) * 100 <= percentage
            return (
              <span
                key={index}
                data-slot={variant === "segmented" ? "progress-segment" : "progress-dot"}
                data-active={active ? "true" : "false"}
                className={cn(
                  "transition-colors",
                  variant === "segmented" ? "h-full min-w-0 flex-1 rounded-sm" : "size-1.5 rounded-full",
                  active ? toneClass : "bg-muted-foreground/20",
                )}
              />
            )
          })}
        </div>
      ) : (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn("h-full w-full flex-1 transition-all", variant === "gradient" ? "bg-gradient-to-r from-primary via-secondary to-tertiary" : toneClass)}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      )}
      {showThumb ? (
        <span
          data-slot="progress-thumb"
          data-thumb-style={thumbStyle}
          className={cn("pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-foreground shadow-sm", thumbStyle === "circle" ? "rounded-full" : "rounded-[35%]")}
          style={{ left: `${percentage}%`, clipPath: thumbStyle === "cookie" ? "polygon(50% 0%, 66% 14%, 86% 10%, 90% 30%, 100% 50%, 86% 66%, 90% 86%, 66% 90%, 50% 100%, 34% 86%, 14% 90%, 10% 66%, 0% 50%, 14% 34%, 10% 14%, 34% 10%)" : undefined }}
        />
      ) : null}
    </Root>
  )
}

export { Progress }
