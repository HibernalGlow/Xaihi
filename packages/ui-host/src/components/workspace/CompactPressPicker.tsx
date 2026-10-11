import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { animate, spring, stagger } from 'animejs'
import { usePressDrag } from '@/hooks/usePressDrag'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import './compact-view-switch.css'

export type CompactPickerOption = {
  key: string; label: string; hint?: string
  icon?: ComponentType<{ className?: string }> | undefined
  disabled?: boolean; badge?: number; toggled?: boolean
}
type Selection = { main: number; child: number; level: 'main' | 'children' }
type Gesture = { x: number; y: number; main: number; moved: boolean }
const wrap = (value: number, length: number) => (value % length + length) % length

/** The topbar's shared picker. Commands preview with keys; view switches apply immediately. */
export function CompactPressPicker({ value, options, onSelect, loop = false, childOptions = [], childValue, childParent,
  triggerLabel, triggerIcon, badge = 0, title, childTitle, childHint, gestureHint, releaseHint, footer,
  behavior = 'switch', align = 'start', testId, optionAttribute = 'data-xaihi-picker-option', childAttribute = 'data-xaihi-picker-child',
}: {
  value: string; options: CompactPickerOption[]; onSelect(value: string, child?: string): void
  loop?: boolean; childOptions?: CompactPickerOption[]; childValue?: string; childParent?: string
  triggerLabel: string; triggerIcon?: ComponentType<{ className?: string }>; badge?: number
  title: string; childTitle?: string; childHint?: string; gestureHint: string; releaseHint: string; footer?: ReactNode
  behavior?: 'switch' | 'command'; align?: 'start' | 'end'; testId?: string; optionAttribute?: string; childAttribute?: string
}) {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const trigger = useRef<HTMLButtonElement>(null)
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const mainLane = useRef<HTMLDivElement>(null)
  const childLane = useRef<HTMLDivElement>(null)
  const mainHighlight = useRef<HTMLSpanElement>(null)
  const childHighlight = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Selection | null>(null)
  const previewRef = useRef<Selection | null>(null)
  const drag = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const cancelDrag = useRef<(() => void) | null>(null)
  const index = Math.max(0, options.findIndex((option) => option.key === value))
  const childIndex = Math.max(0, childOptions.findIndex((option) => option.key === childValue))
  const selection = preview ?? { main: index, child: childIndex, level: 'main' }
  const Icon = triggerIcon ?? options[index]?.icon
  const hasChildren = options[selection.main]?.key === childParent && childOptions.length > 0
  const resolveMain = (position: number) => loop ? wrap(position, options.length) : Math.min(options.length - 1, Math.max(0, position))
  const timing = { duration: reduceMotion ? 0 : 300, ease: reduceMotion ? 'linear' : spring({ stiffness: 420, damping: 34, mass: .7 }) }
  const clearPreview = () => { previewRef.current = null; setPreview(null) }
  const close = () => {
    cancelDrag.current?.(); cancelDrag.current = null; drag.current = null; clearPreview(); setOpen(false)
  }
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    if (!trigger.current) return
    const dots = trigger.current.querySelectorAll<HTMLElement>('[data-xaihi-view-dot]')
    if (!dots.length) return
    const animation = animate(dots, { width: (_, i) => i === index ? (options.length > 5 ? 4 : 6) : (options.length > 5 ? 2 : 3), opacity: (_, i) => i === index ? 1 : .35, ...timing })
    return () => { animation.cancel() }
  }, [index, options.length, reduceMotion])
  useLayoutEffect(() => {
    if (!open || !popup) return
    const entry = animate(popup, { opacity: [0, 1], translateY: [-5, 0], scale: [.97, 1], ...timing })
    const items = animate(popup.querySelectorAll('[data-xaihi-picker-main]'), { translateY: [5, 0], opacity: [0, 1], delay: reduceMotion ? 0 : stagger(18), ...timing })
    return () => { entry.cancel(); items.cancel() }
  }, [open, popup, reduceMotion])
  useLayoutEffect(() => {
    if (!open || !popup) return
    const mainButton = mainLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')[selection.main]
    const childButton = childLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')[selection.child]
    const animations: ReturnType<typeof animate>[] = []
    if (mainButton && mainHighlight.current) {
      animations.push(animate(mainHighlight.current, { translateX: mainButton.offsetLeft, translateY: mainButton.offsetTop, width: mainButton.offsetWidth, height: mainButton.offsetHeight, ...timing }))
      const lane = mainLane.current!
      const left = mainButton.offsetLeft, right = left + mainButton.offsetWidth
      if (left < lane.scrollLeft) lane.scrollTo({ left, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if (right > lane.scrollLeft + lane.clientWidth) lane.scrollTo({ left: right - lane.clientWidth, behavior: reduceMotion ? 'instant' : 'smooth' })
    }
    if (childButton && childHighlight.current) animations.push(animate(childHighlight.current, { translateY: childButton.offsetTop, height: childButton.offsetHeight, ...timing }))
    if (childLane.current) animations.push(animate(childLane.current, { height: hasChildren ? childLane.current.scrollHeight : 0, opacity: hasChildren ? 1 : 0, ...timing }))
    return () => { animations.forEach((animation) => animation.cancel()) }
  }, [open, popup, selection.main, selection.child, hasChildren, options.length, reduceMotion])
  const showPreview = (next: Selection) => { previewRef.current = next; setPreview(next); setOpen(true) }
  const commit = (next: Selection) => {
    const option = options[next.main]
    const child = option?.key === childParent ? childOptions[next.child] : undefined
    if (!option || option.disabled || child?.disabled) return
    onSelect(option.key, child?.key)
  }
  const bindDrag = usePressDrag(({ first, last, canceled, initial, xy, cancel }) => {
    if (!options.length) return
    if (first) {
      cancelDrag.current = cancel; suppressClick.current = false
      drag.current = { x: initial[0], y: initial[1], main: index, moved: false }
    }
    const start = drag.current
    if (!start) return
    if (Math.hypot(xy[0] - initial[0], xy[1] - initial[1]) >= 12) start.moved = true
    const previous = previewRef.current ?? { main: start.main, child: childIndex, level: 'main' as const }
    const rows = childLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')
    const rowTop = rows?.[0]?.getBoundingClientRect().top ?? initial[1] + 160
    const rowHeight = rows?.[0]?.getBoundingClientRect().height || 42
    const leavingChildren = previous.level === 'children' && xy[1] < rowTop - 12
    if (leavingChildren) { start.x = xy[0]; start.y = xy[1]; start.main = previous.main }
    const main = previous.level === 'children' && !leavingChildren
      ? previous.main : resolveMain(start.main + Math.round((xy[0] - start.x) / 56))
    const inChildren = !leavingChildren && childOptions.length > 0 && options[main]?.key === childParent &&
      (previous.level === 'children' || xy[1] - start.y > 32)
    const next: Selection = { main,
      child: inChildren ? Math.min(childOptions.length - 1, Math.max(0, Math.floor((xy[1] - rowTop) / rowHeight))) : childIndex,
      level: inChildren ? 'children' : 'main' }
    if (last || canceled) {
      suppressClick.current = true
      // A stationary long press opens the menu; it must never execute an action.
      if (!canceled && start.moved) commit(next)
      setOpen(!canceled && !start.moved)
      cancelDrag.current = null; drag.current = null; clearPreview()
    } else showPreview(next)
  })
  const chooseMain = (position: number) => {
    const next: Selection = { main: position, child: childIndex, level: 'main' }
    if (behavior === 'command') { showPreview(next); return }
    commit(next)
    if (options[position]?.key !== childParent) { setOpen(false); clearPreview() }
  }
  return <Popover open={open} onOpenChange={(value) => { if (!drag.current) { setOpen(value); if (!value) clearPreview() } }}>
    <PopoverTrigger asChild>
      <Button ref={trigger} variant="ghost" data-testid={testId} aria-label={triggerLabel} disabled={!options.length}
        title={`${triggerLabel}\n${gestureHint}`} className="xaihi-view-switch relative h-10 w-10 shrink-0 touch-none flex-col gap-1 rounded-xl p-0"
        {...bindDrag()}
        onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); chooseMain(resolveMain((behavior === 'command' ? selection.main : index) + (event.key === 'ArrowRight' ? 1 : -1)))
          }
          if (event.key === 'ArrowDown' && childOptions.length > 0 && value === childParent) { event.preventDefault(); setOpen(true) }
          if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); chooseMain(event.key === 'Home' ? 0 : options.length - 1) }
          if (behavior === 'command' && open && event.key === 'Enter') { event.preventDefault(); commit(selection); setOpen(false); clearPreview() }
          if (event.key === 'Escape') { event.preventDefault(); close() }
        }}>
        <span className="flex items-center justify-center">{Icon && <Icon className="size-[18px] text-primary" />}</span>
        <span aria-hidden="true" className={`flex h-1 items-center justify-center ${options.length > 5 ? 'gap-0.5' : 'gap-[3px]'}`}>
          {options.map((option, i) => <span key={option.key} data-xaihi-view-dot className="h-[3px] rounded-full bg-primary" style={{ width: i === index ? (options.length > 5 ? 4 : 6) : (options.length > 5 ? 2 : 3), opacity: i === index ? 1 : .35 }} />)}
        </span>
        {badge > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] leading-none text-destructive-foreground">{badge > 9 ? '9+' : badge}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align={align} sideOffset={7} className="xaihi-view-menu w-[min(94vw,23rem)] overflow-hidden rounded-2xl p-2"
      onEscapeKeyDown={close}
      onOpenAutoFocus={(event) => { if (drag.current || behavior === 'command') event.preventDefault() }}
      onPointerDownOutside={(event) => { if (drag.current) event.preventDefault() }}
      onInteractOutside={(event) => { if (drag.current) event.preventDefault() }}>
      <div ref={setPopup}>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>{title}</span><span>{preview ? releaseHint : gestureHint}</span></div>
        <div ref={mainLane} className="xaihi-picker-main-lane relative grid grid-flow-col auto-cols-[minmax(56px,1fr)] gap-1 overflow-x-auto" role="group" aria-label={title}>
          <span ref={mainHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-xl bg-primary/12 ring-1 ring-primary/20" />
          {options.map(({ key, label, hint, icon: OptionIcon, disabled, badge: itemBadge = 0, toggled }, i) => <button key={key} type="button" data-xaihi-picker-main {...{ [optionAttribute]: key }}
            aria-pressed={selection.main === i} title={hint ?? label} disabled={disabled}
            onClick={() => { commit({ main: i, child: childIndex, level: 'main' }); if (behavior === 'command' || key !== childParent) { setOpen(false); clearPreview() } }}
            className="relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            {OptionIcon && <OptionIcon className={`relative size-[18px] ${selection.main === i || toggled ? 'text-primary' : 'text-muted-foreground'}`} />}
            <span className="relative max-w-full truncate">{label}</span>
            {itemBadge > 0 && <span className="absolute right-1 top-1 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">{itemBadge > 9 ? '9+' : itemBadge}</span>}
          </button>)}
        </div>
        {childOptions.length > 0 && <div ref={childLane} aria-hidden={!hasChildren} style={{ height: 0 }} className="overflow-hidden">
          <div className="mt-2 border-t border-border/60 pt-2">
            <div className="px-2 pb-1 text-[10px] text-muted-foreground">{childTitle} · {childHint}</div>
            <div className="relative" role="group" aria-label={childTitle}>
              <span ref={childHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 w-full rounded-lg bg-accent" />
              {childOptions.map(({ key, label, hint, icon: ChildIcon, disabled }, i) => <button key={key} type="button" data-xaihi-picker-child {...{ [childAttribute]: key }}
                aria-pressed={selection.child === i} tabIndex={hasChildren ? 0 : -1} disabled={disabled} title={hint ?? label}
                onClick={() => { commit({ main: selection.main, child: i, level: 'children' }); setOpen(false); clearPreview() }}
                className="relative flex h-[42px] w-full items-center gap-3 rounded-lg px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {ChildIcon && <ChildIcon className={`relative size-[18px] ${selection.child === i ? 'text-primary' : 'text-muted-foreground'}`} />}
                <span className="relative">{label}</span>
                {selection.child === i && <span className="relative ml-auto size-1.5 rounded-full bg-primary" />}
              </button>)}
            </div>
          </div>
        </div>}
        {footer}
      </div>
    </PopoverContent>
  </Popover>
}
