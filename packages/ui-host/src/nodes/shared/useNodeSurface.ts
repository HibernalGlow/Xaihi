import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Ref } from "react"

export type NodeSurfaceMode = "collapsed" | "compact" | "portrait" | "regular" | "expanded" | "workspace"

export interface NodeSurface {
  /**
   * The node face can swap its root element when Legacy/MD3E changes. A callback
   * ref lets the measurement observer follow that replacement instead of keeping
   * the observer attached to the unmounted face.
   */
  ref: Ref<HTMLDivElement>
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
  const elementRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const frameRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const ref = useCallback((nextElement: HTMLDivElement | null) => {
    generationRef.current += 1
    const generation = generationRef.current

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    observerRef.current?.disconnect()
    observerRef.current = null
    elementRef.current = nextElement

    if (!nextElement) {
      // Keep the last measured size while a face swaps its root element. The
      // Legacy/MD3E branch replacement briefly calls the ref with null; writing
      // 0 here would force the new face back into collapsed mode and loop.
      return
    }

    const measure = () => {
      if (
        generationRef.current !== generation
        || elementRef.current !== nextElement
        || !nextElement.isConnected
      ) return

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        if (
          generationRef.current !== generation
          || elementRef.current !== nextElement
          || !nextElement.isConnected
        ) return

        const rect = nextElement.getBoundingClientRect()
        const nextSize = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
        setSize((previous) => (
          previous.width === nextSize.width && previous.height === nextSize.height
            ? previous
            : nextSize
        ))
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observerRef.current = observer
    observer.observe(nextElement)
  }, [])

  useLayoutEffect(() => () => {
    generationRef.current += 1
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    observerRef.current?.disconnect()
    observerRef.current = null
    elementRef.current = null
  }, [])

  const mode = useMemo<NodeSurfaceMode>(() => resolveNodeSurfaceMode(size), [size])
  const density = resolveNodeSurfaceDensity(mode)

  return { ref, width: size.width, height: size.height, mode, density }
}
