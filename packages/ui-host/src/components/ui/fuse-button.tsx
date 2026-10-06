"use client"

/**
 * Vendored from React Bits "Fuse Button" (src/ts-tailwind/Micro/FuseButton), MIT.
 * Three deliberate departures from upstream, all load-bearing in this repo:
 * - Sizing is expressed in `em` multiples, never absolute px, so the user font
 *   preset owns the actual size (ADR-0080 外观语言：字号只能乘相对量).
 * - Colors default to theme tokens; this repo ships seven swappable themes, so
 *   upstream's hardcoded hex defaults would freeze one theme's palette.
 * - The undo/done glyphs are injectable props (lucide), because the app has no
 *   Hugeicons dependency and upstream hardcodes two of the three icons inline.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from "react"
import { Undo2 } from "lucide-react"

import { cn } from "@/lib/utils"

export type FusePosition = "outline" | "bottom" | "top"
export type FuseCommitOn = "press" | "fuseEnd"
export type FuseSettle = "reset" | "stay"
export type FusePhase = "idle" | "armed" | "settled"
export type FuseSize = "sm" | "md" | "lg"

/** Relative multipliers — the resulting geometry scales with inherited font-size. */
const SCALE: Record<FuseSize, number> = { sm: 0.88, md: 1, lg: 1.14 }

const LINE: Keyframe[] = [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }]
const OUTLINE: Keyframe[] = [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }]

export interface FuseButtonProps {
  label?: ReactNode
  undoLabel?: ReactNode
  doneLabel?: ReactNode
  icon?: ReactNode
  undoIcon?: ReactNode
  doneIcon?: ReactNode
  color?: string
  background?: string
  fuseColor?: string
  size?: FuseSize
  radius?: string
  undoWindow?: number
  fuse?: FusePosition
  fuseThickness?: string
  crossfadeMs?: number
  commitOn?: FuseCommitOn
  pauseOnHover?: boolean
  settle?: FuseSettle
  disabled?: boolean
  /** 图标态（label 为空）时这两个是唯一的无障碍名来源 */
  idleAriaLabel?: string
  undoAriaLabel?: string
  /** 包装层（TooltipTrigger asChild 等）需要锚到根元素 */
  ref?: Ref<HTMLSpanElement>
  className?: string
  type?: "button" | "submit" | "reset"
  onCommit?: (reason: FuseCommitOn) => void
  onUndo?: () => void
  onFuseEnd?: () => void
  onPhaseChange?: (phase: FusePhase) => void
}

interface Latest {
  onCommit?: (reason: FuseCommitOn) => void
  onUndo?: () => void
  onFuseEnd?: () => void
  onPhaseChange?: (phase: FusePhase) => void
  commitOn: FuseCommitOn
  settle: FuseSettle
}

export function FuseButton({
  label,
  undoLabel = "撤销",
  doneLabel = "已执行",
  icon,
  undoIcon = <Undo2 />,
  doneIcon,
  color = "var(--primary-foreground)",
  background = "var(--destructive)",
  fuseColor = "var(--primary)",
  size = "md",
  radius = "var(--radius)",
  undoWindow = 4000,
  fuse = "outline",
  fuseThickness = "0.11em",
  crossfadeMs = 200,
  commitOn = "fuseEnd",
  pauseOnHover = true,
  settle = "reset",
  disabled = false,
  idleAriaLabel,
  undoAriaLabel,
  className = "",
  type = "button",
  onCommit,
  onUndo,
  onFuseEnd,
  onPhaseChange,
  ref,
}: FuseButtonProps) {
  const [phase, setPhase] = useState<FusePhase>("idle")
  const [instant, setInstant] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const idleRef = useRef<HTMLButtonElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const lineRef = useRef<HTMLElement>(null)
  const rimRef = useRef<SVGRectElement>(null)
  const anim = useRef<Animation | null>(null)
  const pause = useRef({ hover: false, hidden: false, canHoverPause: false })
  const lastInput = useRef<"pointer" | "keyboard">("pointer")
  const windowRef = useRef(undoWindow)
  const latest = useRef<Latest>({ commitOn, settle })
  latest.current = { onCommit, onUndo, onFuseEnd, onPhaseChange, commitOn, settle }
  const statusId = useId()
  const scale = SCALE[size] ?? SCALE.md

  const go = (next: FusePhase) => {
    setInstant(lastInput.current === "keyboard")
    setPhase(next)
    latest.current.onPhaseChange?.(next)
  }

  const syncPlayState = () => {
    const a = anim.current
    if (!a) return
    const { hover, hidden } = pause.current
    if (hover || hidden) {
      if (a.playState === "running") a.pause()
    } else if (a.playState === "paused") {
      a.play()
    }
  }

  const light = (from = 0) => {
    const el = fuse === "outline" ? rimRef.current : lineRef.current
    if (!el) return
    anim.current?.cancel()
    // 引信靠 Web Animations 驱动，而 happy-dom / 老 WebView 可能根本没有
    // element.animate。没有它时倒计时必须继续走，否则「烧完才提交」在这类环境
    // 里变成永不提交 —— 宁可丢掉视觉，不能丢掉语义。
    if (typeof el.animate !== "function") {
      const remaining = Math.max(0, windowRef.current - from)
      const timer = setTimeout(() => {
        const l = latest.current
        l.onFuseEnd?.()
        if (l.commitOn === "fuseEnd") l.onCommit?.("fuseEnd")
        lastInput.current = "pointer"
        go(l.settle === "stay" ? "settled" : "idle")
      }, remaining)
      anim.current = {
        cancel: () => clearTimeout(timer),
        pause: () => clearTimeout(timer),
        play: () => undefined,
        playState: "running",
        currentTime: from,
        onfinish: null,
      } as unknown as Animation
      return
    }
    const a = el.animate(fuse === "outline" ? OUTLINE : LINE, {
      duration: windowRef.current,
      easing: "linear",
      fill: "forwards",
    })
    if (from) a.currentTime = from
    a.onfinish = () => {
      const l = latest.current
      l.onFuseEnd?.()
      if (l.commitOn === "fuseEnd") l.onCommit?.("fuseEnd")
      lastInput.current = "pointer"
      go(l.settle === "stay" ? "settled" : "idle")
    }
    anim.current = a
    syncPlayState()
  }

  const arm = () => {
    if (disabled || phase !== "idle") return
    windowRef.current = undoWindow
    light()
    pause.current.canHoverPause = false
    pause.current.hover = false
    if (commitOn === "press") onCommit?.("press")
    go("armed")
  }

  const undo = () => {
    if (phase !== "armed") return
    const a = anim.current
    if (a) {
      a.onfinish = null
      a.pause()
    }
    onUndo?.()
    go("idle")
  }

  useEffect(() => {
    const inside = rootRef.current?.contains(document.activeElement)
    if (phase === "armed") undoRef.current?.focus({ preventScroll: true })
    else if (inside) (phase === "idle" ? idleRef.current : rootRef.current)?.focus({ preventScroll: true })
  }, [phase])

  useEffect(() => {
    const onVisibility = () => {
      pause.current.hidden = document.hidden
      syncPlayState()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      anim.current?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const a = anim.current
    if (!a || phase !== "armed") return
    light(Number(a.currentTime) || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuse])

  useEffect(() => {
    if (pauseOnHover) return
    pause.current.hover = false
    syncPlayState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseOnHover])

  const release = () => {
    if (rootRef.current) delete rootRef.current.dataset.pressed
  }

  const glyph = (node: ReactNode) => (
    <span
      className="inline-flex h-[1em] w-[1em] shrink-0 [&>svg]:h-full [&>svg]:w-full"
      aria-hidden="true"
    >
      {node}
    </span>
  )

  const faceClass = "relative [grid-area:1/1] inline-flex h-full w-full min-w-0 items-center justify-center gap-[0.5em] m-0 border-0 bg-transparent px-[1.15em] whitespace-nowrap [color:inherit] [font:inherit] [letter-spacing:inherit] invisible opacity-0 [filter:blur(2px)] [transition:opacity_var(--fb-fade)_ease,filter_var(--fb-fade)_ease,visibility_0s_linear_var(--fb-fade),background-color_160ms_ease] motion-reduce:[filter:none] motion-reduce:[transition:opacity_var(--fb-fade)_ease,visibility_0s_linear_var(--fb-fade)] group-data-[instant]:[transition-duration:0s] focus-visible:outline-none"
  // 三张脸的可见性变体必须是字面量：oxide 扫描器按源文本取候选，模板字符串里
  // 插值出来的 `group-data-[phase=${target}]:visible` 不会进候选集，于是三张脸
  // 全停在 faceClass 的 invisible/opacity-0 —— 真浏览器里这是一个点不动的空盒子
  // （happy-dom 不套样式表，测不出来）。
  const FACE_IDLE = "group-data-[phase=idle]:visible group-data-[phase=idle]:opacity-100 group-data-[phase=idle]:[filter:blur(0)] group-data-[phase=idle]:[transition-delay:0s]"
  const FACE_ARMED = "group-data-[phase=armed]:visible group-data-[phase=armed]:opacity-100 group-data-[phase=armed]:[filter:blur(0)] group-data-[phase=armed]:[transition-delay:0s]"
  const FACE_SETTLED = "group-data-[phase=settled]:visible group-data-[phase=settled]:opacity-100 group-data-[phase=settled]:[filter:blur(0)] group-data-[phase=settled]:[transition-delay:0s]"

  return (
    <span
      ref={(el) => {
        rootRef.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) (ref as RefObject<HTMLSpanElement | null>).current = el
      }}
      tabIndex={-1}
      data-phase={phase}
      data-fuse={fuse}
      data-instant={instant ? "" : undefined}
      aria-disabled={phase === "settled" || undefined}
      className={cn(
        "group relative inline-grid h-[2.6em] grid-cols-[minmax(0,1fr)] isolate touch-manipulation select-none overflow-hidden rounded-[var(--fb-radius)] font-medium leading-none tracking-[0.01em] outline-none [font-family:inherit] [font-size:calc(1em*var(--fb-scale))] [background:var(--fb-bg)] [color:var(--fb-ink)] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] [transition:transform_160ms_var(--fb-ease-out)] data-[pressed]:[transform:scale(0.97)] motion-reduce:data-[pressed]:[transform:none] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:[outline-color:color-mix(in_srgb,var(--fb-ink)_60%,transparent)] data-[phase=idle]:has-[.fb-idle:disabled]:opacity-[0.55] contrast-more:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--fb-ink)_40%,transparent)]",
        className,
      )}
      style={
        {
          "--fb-ink": color,
          "--fb-bg": background,
          "--fb-fuse": fuseColor,
          "--fb-fuse-h": fuseThickness,
          "--fb-radius": radius,
          "--fb-fade": `${crossfadeMs}ms`,
          "--fb-scale": scale,
          "--fb-ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
        } as CSSProperties
      }
      onPointerDown={(e) => {
        lastInput.current = "pointer"
        const pressable = phase === "armed" || (phase === "idle" && !disabled)
        if (e.button === 0 && pressable && rootRef.current) rootRef.current.dataset.pressed = ""
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerEnter={(e) => {
        if (pauseOnHover && e.pointerType === "mouse" && pause.current.canHoverPause) {
          pause.current.hover = true
          syncPlayState()
        }
      }}
      onPointerLeave={(e) => {
        release()
        if (e.pointerType !== "mouse") return
        pause.current.canHoverPause = true
        pause.current.hover = false
        syncPlayState()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") lastInput.current = "keyboard"
        if (e.key === "Escape" && phase === "armed") {
          e.preventDefault()
          lastInput.current = "keyboard"
          undo()
        }
      }}
    >
      <button
        ref={idleRef}
        type={type}
        className={cn("fb-idle", faceClass, FACE_IDLE, "cursor-pointer disabled:cursor-default [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:[background:color-mix(in_srgb,var(--fb-ink)_7%,transparent)]")}
        disabled={disabled}
        aria-label={idleAriaLabel}
        inert={phase !== "idle"}
        onClick={arm}
      >
        {icon ? glyph(icon) : null}
        {label}
      </button>
      <button
        ref={undoRef}
        type="button"
        className={cn(faceClass, FACE_ARMED, "cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:hover:[background:color-mix(in_srgb,var(--fb-ink)_7%,transparent)]")}
        aria-describedby={statusId}
        aria-label={undoAriaLabel}
        aria-keyshortcuts="Escape"
        inert={phase !== "armed"}
        onClick={undo}
      >
        <span className="inline-flex shrink-0 [transform:rotate(-70deg)] [transition:transform_var(--fb-fade)_var(--fb-ease-out)] group-data-[phase=armed]:[transform:rotate(0deg)] motion-reduce:transition-none motion-reduce:[transform:none]">
          {glyph(undoIcon)}
        </span>
        {undoLabel}
        {fuse !== "outline" ? (
          <i
            ref={lineRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--fb-fuse-h)] origin-left [background:var(--fb-fuse)] [box-shadow:0_0_6px_color-mix(in_srgb,var(--fb-fuse)_55%,transparent)] group-data-[fuse=top]:top-0 group-data-[fuse=top]:bottom-auto forced-colors:[background:Highlight]"
            aria-hidden="true"
          />
        ) : null}
      </button>
      <span className={cn(faceClass, FACE_SETTLED, "cursor-default")} inert={phase !== "settled"}>
        {doneIcon ? glyph(doneIcon) : null}
        {doneLabel}
      </span>
      {fuse === "outline" ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible opacity-0 [filter:drop-shadow(0_0_3px_color-mix(in_srgb,var(--fb-fuse)_60%,transparent))] [transition:opacity_var(--fb-fade)_ease] group-data-[phase=armed]:opacity-100 group-data-[instant]:[transition-duration:0s]"
          aria-hidden="true"
        >
          <rect
            ref={rimRef}
            pathLength="1"
            className="fill-none [x:calc(var(--fb-fuse-h)/2)] [y:calc(var(--fb-fuse-h)/2)] [width:calc(100%-var(--fb-fuse-h))] [height:calc(100%-var(--fb-fuse-h))] [rx:max(0px,calc(var(--fb-radius)-var(--fb-fuse-h)/2))] [stroke:var(--fb-fuse)] [stroke-width:var(--fb-fuse-h)] [stroke-linecap:round] [stroke-dasharray:1] forced-colors:[stroke:Highlight]"
          />
        </svg>
      ) : null}
      <span className="sr-only" id={statusId} role="status" aria-live="polite">
        {phase === "idle" ? "" : doneLabel}
      </span>
    </span>
  )
}
