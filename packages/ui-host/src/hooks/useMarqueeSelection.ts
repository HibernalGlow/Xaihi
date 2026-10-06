import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface UseMarqueeSelectionOptions {
  /** 容器 ref，marquee 坐标基于此容器 */
  containerRef: React.RefObject<HTMLElement | null>
  /** 从 DOM 元素提取 component id，返回 null 表示该元素不可选 */
  getComponentId: (element: HTMLElement) => string | null
  /** 框选完成后回调，传入命中的 component ids */
  onSelect: (ids: string[]) => void
  /** 是否启用框选（如检查 ctrl 键状态） */
  enabled: boolean
}

/**
 * 可复用的 Ctrl + 左键拖动框选 hook。
 * 在容器上绑定返回的 onPointerDown，当 enabled 且按住 Ctrl/Cmd 时启动 marquee。
 * 拖动期间实时检测与 `[data-component-id]` 元素的矩形相交。
 */
export function useMarqueeSelection({
  containerRef,
  getComponentId,
  onSelect,
  enabled,
}: UseMarqueeSelectionOptions) {
  const [rect, setRect] = useState<MarqueeRect | null>(null)
  const draggingRef = useRef(false)
  const originRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      // 仅左键 + Ctrl/Cmd 触发
      if (event.button !== 0) return
      if (!(event.ctrlKey || event.metaKey)) return
      const container = containerRef.current
      if (!container) return

      event.preventDefault()
      event.stopPropagation()

      const containerRect = container.getBoundingClientRect()
      const origin = {
        x: event.clientX - containerRect.left + container.scrollLeft,
        y: event.clientY - containerRect.top + container.scrollTop,
      }
      originRef.current = origin
      draggingRef.current = true
      setRect({ x: origin.x, y: origin.y, width: 0, height: 0 })

      // 设置指针捕获
      try {
        container.setPointerCapture(event.pointerId)
      } catch {
        // 指针捕获可能失败，忽略
      }
    },
    [containerRef, enabled],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const current = {
        x: event.clientX - containerRect.left + container.scrollLeft,
        y: event.clientY - containerRect.top + container.scrollTop,
      }
      const origin = originRef.current
      const x = Math.min(origin.x, current.x)
      const y = Math.min(origin.y, current.y)
      const width = Math.abs(current.x - origin.x)
      const height = Math.abs(current.y - origin.y)
      setRect({ x, y, width, height })
    },
    [containerRef],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false

      const container = containerRef.current
      if (container) {
        try {
          container.releasePointerCapture(event.pointerId)
        } catch {
          // 释放指针捕获可能失败，忽略
        }
      }

      const currentRect = rect
      setRect(null)

      if (!container || !currentRect || (currentRect.width < 4 && currentRect.height < 4)) {
        return
      }

      // 命中检测：遍历容器内所有 data-component-id 元素
      const marqueeScreenRect = {
        left: currentRect.x - container.scrollLeft + container.getBoundingClientRect().left,
        top: currentRect.y - container.scrollTop + container.getBoundingClientRect().top,
        right: currentRect.x + currentRect.width - container.scrollLeft + container.getBoundingClientRect().left,
        bottom: currentRect.y + currentRect.height - container.scrollTop + container.getBoundingClientRect().top,
      }

      const candidates = container.querySelectorAll<HTMLElement>("[data-component-id]")
      const hitIds: string[] = []
      for (const el of candidates) {
        const id = getComponentId(el)
        if (!id) continue
        const r = el.getBoundingClientRect()
        // 矩形相交检测
        if (
          r.left < marqueeScreenRect.right &&
          r.right > marqueeScreenRect.left &&
          r.top < marqueeScreenRect.bottom &&
          r.bottom > marqueeScreenRect.top
        ) {
          hitIds.push(id)
        }
      }

      onSelect(hitIds)
    },
    [containerRef, getComponentId, onSelect, rect],
  )

  return {
    rect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
