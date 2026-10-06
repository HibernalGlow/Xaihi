import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"

export type NodeSurfaceMode = "collapsed" | "compact" | "portrait" | "regular" | "expanded" | "workspace"

export interface NodeSurface {
  ref: RefObject<HTMLDivElement | null>
  width: number
  height: number
  mode: NodeSurfaceMode
  density: "tight" | "normal" | "roomy"
}

export function resolveNodeSurfaceMode(size: { width: number; height: number }): NodeSurfaceMode {
  if (size.width >= 1040 && size.height >= 680) return "workspace"
  if (size.width >= 860 && size.height >= 520) return "expanded"
  if (size.width >= 260 && size.width < 600 && size.height >= Math.max(360, size.width * 1.15)) return "portrait"
  if (size.width >= 520 && size.height >= 360) return "regular"
  if (size.width >= 220 && size.height >= 96) return "compact"
  return "collapsed"
}

export function resolveNodeSurfaceDensity(mode: NodeSurfaceMode): NodeSurface["density"] {
  return mode === "collapsed" || mode === "compact" || mode === "portrait"
    ? "tight"
    : mode === "workspace" || mode === "expanded"
      ? "roomy"
      : "normal"
}

export function useNodeSurface(): NodeSurface {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    let rafId = 0

    const measure = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        setSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  const mode = useMemo<NodeSurfaceMode>(() => resolveNodeSurfaceMode(size), [size])
  const density = resolveNodeSurfaceDensity(mode)

  return { ref, width: size.width, height: size.height, mode, density }
}
