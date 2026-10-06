import { useEffect, useState } from "react"
import type { ComponentType } from "react"
import { Briefcase, Folder, Home, Layers, Package, Star } from "lucide-react"

export interface WorkspaceIconProps {
  icon?: string
  className?: string
  size?: "sm" | "md"
}

const lucideIconRegistry: Record<string, ComponentType<{ className?: string }> | undefined> = {
  Briefcase,
  Folder,
  Home,
  Layers,
  Package,
  Star,
}

/**
 * WorkspaceIcon — 根据约定解析 icon 字符串并渲染。
 *
 * 支持格式：
 * - 无前缀（直接 emoji）：🌸
 * - "text:xxx"：渲染 1-2 字符
 * - "lucide:xxx"：渲染 lucide 图标
 * - "emoji:xxx"：渲染 emoji（与无前缀相同）
 */
export function WorkspaceIcon({ icon, className, size = "md" }: WorkspaceIconProps) {
  const dim = size === "sm" ? "h-4 w-4" : "h-6 w-6"
  const textDim = size === "sm" ? "text-xs" : "text-sm"

  if (!icon) return null

  // lucide:图标名
  if (icon.startsWith("lucide:")) {
    const name = icon.slice(7)
    const IconComp = lucideIconRegistry[toPascalCase(name)]
    if (IconComp) return <IconComp className={cn(dim, className)} />
    return <span className={cn(dim, "grid place-items-center", textDim, className)}>?</span>
  }

  // text:1-2字符
  if (icon.startsWith("text:")) {
    const text = icon.slice(5).slice(0, 2)
    return (
      <span className={cn(dim, "grid place-items-center font-mono", textDim, className)}>
        {text}
      </span>
    )
  }

  // emoji:xxx 或无前缀（直接 emoji）
  const emoji = icon.startsWith("emoji:") ? icon.slice(6) : icon
  return (
    <span className={cn(dim, "grid place-items-center", textDim, className)}>
      {emoji}
    </span>
  )
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ")
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("")
}

// ── Icon 设置弹窗 ─────────────────────────────────────────────

export interface IconPickerProps {
  currentIcon?: string
  onSet: (icon: string | undefined) => void
  onClose: () => void
}

const EMOJI_CHOICES = [
  "🌸", "🌿", "🔥", "💧", "⚡", "🌙", "☀️", "❄️",
  "📁", "📦", "🔧", "🎨", "🧪", "🚀", "🏠", "💾",
  "🎯", "🧩", "📊", "🖥️", "⭐", "🍀", "🪐", "🌊",
]

const TEXT_CHOICES = ["A", "WS", "α", "β", "γ", "Δ", "Ω", "★"]

export function IconPicker({ currentIcon, onSet, onClose }: IconPickerProps) {
  const [mode, setMode] = useState<"emoji" | "text">(
    currentIcon?.startsWith("text:") ? "text" : "emoji",
  )
  const [customText, setCustomText] = useState(
    currentIcon?.startsWith("text:") ? currentIcon.slice(5) : "",
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30" onClick={onClose}>
      <div
        className="w-80 rounded-md border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-xs font-mono text-muted-foreground tracking-widest">设置图标</p>
        </div>

        <div className="flex gap-1 border-b border-border/60 p-1">
          <button
            onClick={() => setMode("emoji")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-sm text-xs font-mono transition-colors",
              mode === "emoji" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            Emoji
          </button>
          <button
            onClick={() => setMode("text")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-sm text-xs font-mono transition-colors",
              mode === "text" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            Text
          </button>
        </div>

        <div className="p-3">
          {mode === "emoji" ? (
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onSet(emoji); onClose() }}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded border transition-all hover:bg-muted/60",
                    currentIcon === emoji ? "border-primary bg-primary/10" : "border-transparent",
                  )}
                >
                  <span className="text-base">{emoji}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-1">
                {TEXT_CHOICES.map((text) => (
                  <button
                    key={text}
                    onClick={() => { onSet(`text:${text}`); onClose() }}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded border font-mono text-sm transition-all hover:bg-muted/60",
                      currentIcon === `text:${text}` ? "border-primary bg-primary/10" : "border-transparent",
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value.slice(0, 2))}
                  placeholder="自定义 1-2 字符"
                  className="h-8 flex-1 rounded border border-border/60 bg-background px-2 text-xs font-mono"
                />
                <button
                  onClick={() => {
                    if (customText.trim()) {
                      onSet(`text:${customText.trim()}`)
                      onClose()
                    }
                  }}
                  className="h-8 rounded border border-border/60 px-3 text-xs font-mono hover:bg-muted/60"
                >
                  确定
                </button>
              </div>
            </div>
          )}
        </div>

        {currentIcon ? (
          <div className="border-t border-border/60 p-1">
            <button
              onClick={() => { onSet(undefined); onClose() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-mono text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              清除图标
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
