import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

/**
 * NodeHeroGlow — 节点 Hero 区顶部的装饰性渐变光晕。
 *
 * 统一 15 个节点里手抄的同一段 `bg-[radial-gradient(...),radial-gradient(...)]`：
 * 左侧主色 (primary) 光晕 + 右侧强调色光晕。渐变走行内 `backgroundImage`，
 * 因为两处 radial 的圆心、强度与透明停靠点按节点微调，需要参数化，
 * 而 Tailwind 的 JIT 只会为源码里出现的完整字面类名生成产物。
 *
 * 颜色仍用主题 token（`color-mix(in oklch, var(--primary) N%, transparent)` 与
 * `var(--chart-N)` / `var(--accent)`），不写死色值、不加新 keyframes。
 * 必须放在 `position: relative` 的父容器里（自身 absolute 贴满顶部）。
 */

/** 右侧光晕使用的主题色 token；默认 chart-4（多数节点的变体）。 */
export type NodeHeroGlowAccent = "chart-2" | "chart-3" | "chart-4" | "chart-5" | "accent"

/** 光晕高度：sm=h-28、md=h-32（默认）、lg=h-40。 */
export type NodeHeroGlowHeight = "sm" | "md" | "lg"

export interface NodeHeroGlowProps {
  /** 右侧 radial 用的主题色 token。默认 "chart-4"。 */
  accent?: NodeHeroGlowAccent
  /** 顶部光晕高度（映射 Tailwind h-28/h-32/h-40）。默认 "md"。 */
  height?: NodeHeroGlowHeight
  /** 左侧 primary radial 圆心 [x%, y%]。默认 [12, 0]。 */
  primaryAt?: readonly [number, number]
  /** 左侧 primary 强度百分比。默认 12。 */
  primaryStrength?: number
  /** 左侧 primary 透明停靠百分比。默认 36。 */
  primaryStop?: number
  /** 右侧 accent radial 圆心 [x%, y%]。默认 [88, 8]。 */
  accentAt?: readonly [number, number]
  /** 右侧 accent 强度百分比。默认 14。 */
  accentStrength?: number
  /** 右侧 accent 透明停靠百分比。默认 34。 */
  accentStop?: number
  className?: string
}

const ACCENT_VARS: Record<NodeHeroGlowAccent, string> = {
  "chart-2": "var(--chart-2)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
  "chart-5": "var(--chart-5)",
  accent: "var(--accent)",
}

// Tailwind 间距：h-28=7rem、h-32=8rem、h-40=10rem。
const HEIGHT_REM: Record<NodeHeroGlowHeight, string> = {
  sm: "7rem",
  md: "8rem",
  lg: "10rem",
}

export function NodeHeroGlow(props: NodeHeroGlowProps) {
  const {
    accent = "chart-4",
    height = "md",
    primaryAt = [12, 0],
    primaryStrength = 12,
    primaryStop = 36,
    accentAt = [88, 8],
    accentStrength = 14,
    accentStop = 34,
    className,
  } = props

  const style: CSSProperties = {
    height: HEIGHT_REM[height],
    backgroundImage:
      `radial-gradient(circle at ${primaryAt[0]}% ${primaryAt[1]}%, ` +
      `color-mix(in oklch, var(--primary) ${primaryStrength}%, transparent), ` +
      `transparent ${primaryStop}%), ` +
      `radial-gradient(circle at ${accentAt[0]}% ${accentAt[1]}%, ` +
      `color-mix(in oklch, ${ACCENT_VARS[accent]} ${accentStrength}%, transparent), ` +
      `transparent ${accentStop}%)`,
  }

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 top-0", className)}
      style={style}
    />
  )
}
