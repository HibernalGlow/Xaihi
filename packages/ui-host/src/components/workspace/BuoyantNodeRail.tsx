import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Magnet } from "@/components/ui/magnet"
import { cn } from "@/lib/utils"

const CAPSULE_WIDTH = 112
const FLOAT_SPRING = { type: "spring", stiffness: 210, damping: 23, mass: 0.85 } as const
const SINK_SPRING = { type: "spring", stiffness: 170, damping: 26, mass: 1.05 } as const

type BuoyantNodeRailProps = ComponentProps<"section"> & {
  expanded: boolean
  announcement: string
  widthRatio: number
  surfaceClassName: string
  children: ReactNode
  onExpand: () => void
}

/** The workspace's existing alphabetical launcher, with a compact resting surface. */
export function BuoyantNodeRail({
  expanded,
  announcement,
  widthRatio,
  surfaceClassName,
  children,
  onExpand,
  ...props
}: BuoyantNodeRailProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const viewportRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [availableWidth, setAvailableWidth] = useState(CAPSULE_WIDTH)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setAvailableWidth(Math.max(0, viewport.clientWidth - 16))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Hover leaves focus in the canvas. Keyboard entry transfers it to a visible letter.
    if (!expanded || document.activeElement !== triggerRef.current || !triggerRef.current?.matches(":focus-visible")) return
    viewportRef.current?.querySelector<HTMLButtonElement>('[data-letter-index][aria-selected="true"]')?.focus()
  }, [expanded])

  const expandedWidth = Math.min(availableWidth, Math.max(CAPSULE_WIDTH, Math.min(760, availableWidth) * widthRatio))
  const transition = reduceMotion ? { duration: 0 } : expanded ? FLOAT_SPRING : SINK_SPRING

  return (
    <section
      {...props}
      ref={viewportRef}
      className="xaihi-ui-copy pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center"
      data-expanded={expanded}
      data-reduced-motion={reduceMotion === true}
    >
      <motion.div
        initial={false}
        animate={{
          width: expanded ? expandedWidth : Math.min(CAPSULE_WIDTH, availableWidth),
          height: expanded ? 34 : 26,
          y: expanded && !reduceMotion ? -10 : 0,
        }}
        transition={transition}
        className={cn("pointer-events-auto relative rounded-full border", surfaceClassName)}
        data-testid="alphabet-node-surface"
        style={{ transformOrigin: "50% 100%" }}
      >
        {expanded && <div className="pointer-events-auto absolute inset-x-0 top-full h-3" aria-hidden="true" />}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-primary/35 to-transparent"
          initial={false}
          animate={{ opacity: expanded ? 0.85 : 0.3, scaleX: expanded ? 1 : 0.55 }}
          transition={transition}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: expanded ? 0 : 1, y: expanded && !reduceMotion ? 5 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12, delay: expanded || reduceMotion ? 0 : 0.12 }}
          style={{ pointerEvents: expanded ? "none" : "auto" }}
          aria-hidden={expanded}
          {...(expanded ? { inert: true } : {})}
        >
          <Magnet padding={10} magnetStrength={18} disabled={expanded || reduceMotion === true}
            wrapperClassName="h-full w-full" innerClassName="h-full w-full">
            <button
              ref={triggerRef}
              type="button"
              className="flex h-full w-full items-center justify-center gap-1.5 rounded-full text-[10px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              tabIndex={expanded ? -1 : 0}
              aria-label={t("common:alphabetLauncher.expand")}
              aria-expanded={expanded}
              aria-controls="alphabet-node-letters"
              onFocus={onExpand}
              onClick={onExpand}
              data-testid="alphabet-node-capsule"
            >
              <svg className="size-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 3 10 6-10 6L2 9Z" />
                <path d="m2 13 10 6 10-6M2 17l10 6 10-6" />
              </svg>
              <span>{t("common:alphabetLauncher.nodes")}</span>
              <span className="font-mono text-[9px] tracking-wide opacity-60" aria-hidden="true">A–Z</span>
            </button>
          </Magnet>
        </motion.div>
        <motion.div
          id="alphabet-node-letters"
          className="absolute inset-0 flex items-center overflow-hidden rounded-full"
          initial={false}
          animate={{ opacity: expanded ? 1 : 0, y: expanded || reduceMotion ? 0 : 6 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, delay: expanded && !reduceMotion ? 0.1 : 0 }}
          style={{ pointerEvents: expanded ? "auto" : "none" }}
          aria-hidden={!expanded}
          {...(!expanded ? { inert: true } : {})}
        >
          {children}
        </motion.div>
      </motion.div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </section>
  )
}
