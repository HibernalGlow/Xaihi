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
  ...props
}: ProgressProps) {
  return (
    <Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
      role="progressbar"
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "progress"}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </Root>
  )
}

export { Progress }
