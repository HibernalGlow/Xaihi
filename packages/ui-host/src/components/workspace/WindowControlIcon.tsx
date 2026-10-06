import { Minus, Minimize2, Square, X } from "lucide-react"

/**
 * 窗口标题栏的四个字形。尺寸只有 `size-3.5` 一档：
 * 原来 maximize 的两个字形用 `size-3`，和 minimize/close 并排时会看出一大一小。
 */
export function WindowControlIcon({ action, maximized = false }: {
  action: "minimize" | "maximize" | "close"
  maximized?: boolean
}) {
  if (action === "minimize") return <Minus className="size-3.5" />
  if (action === "close") return <X className="size-3.5" />
  return maximized ? <Minimize2 className="size-3.5" /> : <Square className="size-3.5" />
}
