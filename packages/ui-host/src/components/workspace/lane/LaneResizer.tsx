import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface Props {
  onResizeStart?: () => void
  onResize?: (deltaRatio: number) => void
  onResizeEnd?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void
  className?: string
  label?: string
  onReset?: () => void
  edge?: "start" | "end"
}

export function LaneResizer({ onResizeStart, onResize, onResizeEnd, onPointerEnter, onPointerLeave, className, label, onReset, edge }: Props) {
  const { t } = useTranslation()
  const startXRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)
  const onResizeRef = useRef(onResize)
  const onResizeEndRef = useRef(onResizeEnd)
  const cleanupSessionRef = useRef<(() => void) | undefined>(undefined)
  onResizeRef.current = onResize
  onResizeEndRef.current = onResizeEnd

  function finishResize(commit = true) {
    const pointerId = pointerIdRef.current
    if (pointerId === null) return
    pointerIdRef.current = null
    cleanupSessionRef.current?.()
    cleanupSessionRef.current = undefined
    try {
      if (handleRef.current?.hasPointerCapture(pointerId)) handleRef.current.releasePointerCapture(pointerId)
    } catch {
      // The browser may already have released capture during cancellation.
    }
    if (commit) onResizeEndRef.current?.()
  }

  useEffect(() => () => finishResize(), [])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()

    finishResize(false)
    onResizeStart?.()

    startXRef.current = event.clientX
    pointerIdRef.current = event.pointerId
    try {
      handleRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }

    const handleMove = (moveEvent: PointerEvent) => {
      if (pointerIdRef.current !== moveEvent.pointerId) return
      const delta = moveEvent.clientX - startXRef.current
      startXRef.current = moveEvent.clientX
      onResizeRef.current?.(delta / 320)
    }

    const handleUp = (upEvent: PointerEvent) => {
      if (pointerIdRef.current !== upEvent.pointerId) return
      finishResize()
    }

    const handleBlur = () => finishResize()
    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove, true)
      window.removeEventListener("pointerup", handleUp, true)
      window.removeEventListener("pointercancel", handleUp, true)
      window.removeEventListener("blur", handleBlur)
    }
    cleanupSessionRef.current = cleanup

    window.addEventListener("pointermove", handleMove, { capture: true })
    window.addEventListener("pointerup", handleUp, { capture: true })
    window.addEventListener("pointercancel", handleUp, { capture: true })
    window.addEventListener("blur", handleBlur)
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={label ?? t("common:resizeLane")}
      data-lane-resizer-edge={edge}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={handlePointerDown}
      onLostPointerCapture={() => finishResize()}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
        if (!direction) return
        event.preventDefault()
        onResize?.(direction * (event.shiftKey ? 0.1 : 0.025))
        onResizeEnd?.()
      }}
      tabIndex={0}
      className={cn(
        "lane-resizer w-1 cursor-ew-resize border-0 bg-transparent outline-none shadow-none",
        className,
      )}
    />
  )
}
