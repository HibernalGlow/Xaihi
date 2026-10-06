"use client"

/**
 * Aceternity Timeline — adapted for Xiranite design tokens and local scroll containers.
 * Source: https://ui.aceternity.com/components/timeline
 */
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface TimelineEntry {
  title: string
  content: ReactNode
  /** Optional short label shown in the sticky rail (defaults to title). */
  subtitle?: string
  id?: string
}

export interface TimelineProps {
  data: TimelineEntry[]
  title?: ReactNode
  description?: ReactNode
  className?: string
  /** Scrollable ancestor; defaults to nearest page scroll. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  /** Compact spacing for dense panels such as settings. */
  density?: "default" | "compact"
  onActiveIndexChange?: (index: number) => void
}

export function Timeline({
  data,
  title,
  description,
  className,
  scrollContainerRef,
  density = "default",
  onActiveIndexChange,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const measure = () => {
      setHeight(node.getBoundingClientRect().height)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [data.length])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: density === "compact" ? ["start 8%", "end 70%"] : ["start 10%", "end 50%"],
    ...(scrollContainerRef ? { container: scrollContainerRef } : {}),
  })

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height])
  const opacityTransform = useTransform(scrollYProgress, [0, 0.08], [0, 1])

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!onActiveIndexChange || data.length === 0) return
    const index = Math.min(data.length - 1, Math.max(0, Math.floor(value * data.length)))
    onActiveIndexChange(index)
  })

  const entryPad = density === "compact" ? "pt-6 md:pt-10 md:gap-8" : "pt-10 md:pt-40 md:gap-10"
  const stickyTop = density === "compact" ? "top-4" : "top-40"
  const titleClass =
    density === "compact"
      ? "hidden text-lg font-semibold text-muted-foreground md:block md:pl-16 md:text-2xl"
      : "hidden text-xl font-bold text-muted-foreground md:block md:pl-20 md:text-5xl"

  return (
    <div
      ref={containerRef}
      className={cn("w-full font-sans", className)}
      data-slot="timeline"
    >
      {(title || description) && (
        <div className={cn("mx-auto max-w-7xl px-4", density === "compact" ? "pb-4 pt-2" : "px-4 py-12 md:px-8 lg:px-10")}>
          {title ? (
            <div className={cn("mb-2 max-w-4xl text-foreground", density === "compact" ? "text-base font-semibold" : "mb-4 text-lg md:text-4xl")}>
              {title}
            </div>
          ) : null}
          {description ? (
            <p className={cn("max-w-xl text-muted-foreground", density === "compact" ? "text-[11px] leading-relaxed" : "text-sm md:text-base")}>
              {description}
            </p>
          ) : null}
        </div>
      )}

      <div ref={ref} className={cn("relative mx-auto max-w-7xl", density === "compact" ? "pb-8" : "pb-20")}>
        {data.map((item, index) => (
          <div
            key={item.id ?? `${item.title}-${index}`}
            id={item.id}
            data-timeline-entry={item.id ?? index}
            className={cn("flex justify-start", entryPad)}
          >
            <div
              className={cn(
                "sticky z-40 flex max-w-xs flex-col items-center self-start md:w-full md:flex-row lg:max-w-sm",
                stickyTop,
              )}
            >
              <div className="absolute left-3 flex size-10 items-center justify-center rounded-full bg-background md:left-3">
                <div className="size-3 rounded-full border border-border bg-muted p-1.5 ring-4 ring-background" />
              </div>
              <h3 className={titleClass}>{item.title}</h3>
            </div>

            <div className={cn("relative w-full pr-2", density === "compact" ? "pl-16 md:pl-4" : "pl-20 pr-4 md:pl-4")}>
              <h3 className={cn("mb-3 text-left font-semibold text-muted-foreground md:hidden", density === "compact" ? "text-base" : "mb-4 text-2xl font-bold")}>
                {item.title}
              </h3>
              {item.subtitle ? (
                <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground md:hidden">{item.subtitle}</p>
              ) : null}
              {item.content}
            </div>
          </div>
        ))}

        <div
          style={{ height: `${height}px` }}
          className={cn(
            "absolute top-0 left-8 w-[2px] overflow-hidden md:left-8",
            "bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-border to-transparent to-[99%]",
            "[mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)]",
          )}
        >
          <motion.div
            style={{ height: heightTransform, opacity: opacityTransform }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-primary via-primary/70 to-transparent from-[0%] via-[12%]"
          />
        </div>
      </div>
    </div>
  )
}
