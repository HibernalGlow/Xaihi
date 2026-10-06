"use client"

import { useLayoutEffect, useRef, type ComponentProps } from "react"

import { syncNativeRangeProgress } from "@/lib/sliderSkin"
import { cn } from "@/lib/utils"

/**
 * Native range input that participates in the global slider skin
 * (`data-slider-style` + --slider-progress fill rail).
 *
 * Prefer this over raw <input type="range"> in NeoView so controlled value
 * updates keep the filled portion correct without losing change-event tests.
 */
export function RangeInput({
  className,
  onChange,
  onInput,
  value,
  defaultValue,
  min,
  max,
  dir,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const ref = useRef<HTMLInputElement>(null)
  const direction = dir === "rtl" ? "rtl" : dir === "ltr" ? "ltr" : undefined

  useLayoutEffect(() => {
    if (ref.current) syncNativeRangeProgress(ref.current)
  }, [value, defaultValue, min, max, direction])

  return (
    <input
      {...props}
      ref={ref}
      type="range"
      data-slot="range-input"
      data-slider-direction={direction}
      dir={direction}
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      className={cn("cursor-pointer accent-primary", className)}
      onChange={(event) => {
        syncNativeRangeProgress(event.currentTarget)
        onChange?.(event)
      }}
      onInput={(event) => {
        syncNativeRangeProgress(event.currentTarget)
        onInput?.(event)
      }}
    />
  )
}
