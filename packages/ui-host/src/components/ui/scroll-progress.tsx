"use client"

/**
 * Magic UI Scroll Progress — adapted to support a local scroll container.
 * Source: https://magicui.design/docs/components/scroll-progress
 */
import { motion, useScroll, type MotionProps } from "motion/react"
import type { RefObject } from "react"

import { cn } from "@/lib/utils"

interface ScrollProgressProps extends Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> {
  ref?: React.Ref<HTMLDivElement>
  /** When set, progress tracks this element instead of the document. */
  containerRef?: RefObject<HTMLElement | null>
  className?: string
}

export function ScrollProgress({
  className,
  ref,
  containerRef,
  ...props
}: ScrollProgressProps) {
  const { scrollYProgress } = useScroll(
    containerRef ? { container: containerRef } : undefined,
  )

  return (
    <motion.div
      ref={ref}
      className={cn(
        "pointer-events-none z-50 h-px origin-left bg-linear-to-r from-[#A97CF8] via-[#F38CB8] to-[#FDCC92]",
        className,
      )}
      style={{ scaleX: scrollYProgress }}
      {...props}
    />
  )
}
