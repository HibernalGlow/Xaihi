import type { CSSProperties, MouseEventHandler, PointerEventHandler } from "react"
import { cn } from "@/lib/utils"

export function AppleResizeHandle({
  className,
  interactive,
  onPointerDown,
  onMouseDown,
  outside,
  style,
}: {
  className?: string
  interactive?: boolean
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onMouseDown?: MouseEventHandler<HTMLDivElement>
  outside?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "xiranite-apple-resize-handle absolute bottom-1.5 right-1.5 z-30 size-9",
        outside && "-bottom-5 -right-5",
        interactive ? "pointer-events-auto cursor-nwse-resize touch-none" : "pointer-events-none",
        className,
      )}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      style={style}
    >
      <svg
        className="h-full w-full drop-shadow-[0_1px_2px_oklch(0_0_0/0.35)]"
        viewBox="0 0 44 44"
        fill="none"
      >
        <path
          d="M9 34 C20.5 32 31.5 20.5 34 9"
          stroke="oklch(1 0 0 / 0.9)"
          strokeLinecap="round"
          strokeWidth="5"
        />
        <path
          d="M9 34 C20.5 32 31.5 20.5 34 9"
          stroke="oklch(0 0 0 / 0.18)"
          strokeLinecap="round"
          strokeWidth="1"
        />
      </svg>
    </div>
  )
}
