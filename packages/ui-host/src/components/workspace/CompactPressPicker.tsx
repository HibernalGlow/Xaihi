import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { animate, spring, stagger } from 'animejs'
import { usePressDrag } from '@/hooks/usePressDrag'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import './compact-view-switch.css'

export type CompactPickerOption = {
  key: string; label: string; hint?: string
  icon?: ComponentType<{ className?: string }> | undefined
  leading?: ReactNode
  disabled?: boolean; badge?: number; toggled?: boolean; shortcut?: string; tone?: 'danger'; separatorBefore?: boolean; branchOnly?: boolean
  children?: CompactPickerOption[]; childrenTitle?: string
}
type Selection = { main: number; child: number; detail?: number; level: 'main' | 'children' | 'details' }
type Gesture = { x: number; y: number; main: number; moved: boolean; childX: number; childY: number; detailX: number; detailY: number }
const wrap = (value: number, length: number) => (value % length + length) % length

/** The topbar's shared picker. Commands preview with keys; view switches apply immediately. */
export function CompactPressPicker({ value, options, onSelect, loop = false, childOptions = [], childValue, childParent,
  triggerLabel, triggerIcon, badge = 0, title, childTitle, childHint, gestureHint, releaseHint, footer,
  showIndicators = true, nestedHint, orientation = 'horizontal', triggerContent, behavior = 'switch', align = 'start', testId, optionAttribute = 'data-xaihi-picker-option', childAttribute = 'data-xaihi-picker-child',
}: {
  value: string; options: CompactPickerOption[]; onSelect(value: string, child?: string, detail?: string): void
  loop?: boolean; childOptions?: CompactPickerOption[]; childValue?: string; childParent?: string
  triggerLabel: string; triggerIcon?: ComponentType<{ className?: string }>; badge?: number
  title: string; childTitle?: string; childHint?: string; gestureHint: string; releaseHint: string; footer?: ReactNode
  showIndicators?: boolean; nestedHint?: string; orientation?: 'horizontal' | 'vertical' | 'matrix'; triggerContent?: ReactNode; behavior?: 'switch' | 'command'; align?: 'start' | 'end'; testId?: string; optionAttribute?: string; childAttribute?: string
}) {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const trigger = useRef<HTMLButtonElement>(null)
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const mainLane = useRef<HTMLDivElement>(null)
  const childLane = useRef<HTMLDivElement>(null)
  const mainHighlight = useRef<HTMLSpanElement>(null)
  const detailLane = useRef<HTMLDivElement>(null)
  const detailHighlight = useRef<HTMLSpanElement>(null)
  const childHighlight = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Selection | null>(null)
  const previewRef = useRef<Selection | null>(null)
  const drag = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const cancelDrag = useRef<(() => void) | null>(null)
  const index = Math.max(0, options.findIndex((option) => option.key === value))
  const activeMain = preview?.main ?? index
  const children = options[activeMain]?.children ?? (options[activeMain]?.key === childParent ? childOptions : [])
  const preferredChild = (items: CompactPickerOption[]) => Math.max(0, items.findIndex(option => childValue ? option.key === childValue : option.toggled))
  const childIndex = preferredChild(children)
  const selection = preview ?? { main: index, child: childIndex, level: 'main' }
  const activeOption = options[selection.main]
  const isChildParent = activeOption?.key === childParent
  const hasActiveChildren = Boolean(activeOption?.children?.length)
  const activeChild = (isChildParent || (behavior === 'switch' && hasActiveChildren)) ? children[selection.child] : undefined
  const Icon = triggerIcon ?? activeChild?.icon ?? activeOption?.icon
  const hasChildren = children.length > 0
  const details = children[selection.child]?.children ?? []
  const vertical = orientation === 'vertical'
  const matrix = orientation === 'matrix'
  const expandedChildren = !matrix && hasChildren && (!vertical || selection.level !== 'main')
  const hasDetails = hasChildren && details.length > 0 && selection.level === 'details'
  const currentChildTitle = options[selection.main]?.childrenTitle ?? childTitle
  const resolveMain = (position: number) => loop ? wrap(position, options.length) : Math.min(options.length - 1, Math.max(0, position))
  const timing = { duration: reduceMotion ? 0 : 300, ease: reduceMotion ? 'linear' : spring({ stiffness: 420, damping: 34, mass: .7 }) }
  const clearPreview = () => { previewRef.current = null; setPreview(null) }
  const close = () => {
    const cancel = cancelDrag.current
    if (drag.current) suppressClick.current = true
    cancelDrag.current = null; drag.current = null; clearPreview(); setOpen(false)
    cancel?.()
  }
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); close()
    }
    // Pointer capture can leave focus outside the popover during a native drag.
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [open])
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
    const childButton = (matrix ? mainButton : childLane.current)?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')[selection.child]
    const detailButton = detailLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-detail]')[selection.detail ?? 0]
    const animations: ReturnType<typeof animate>[] = []
    if (mainButton && mainHighlight.current) {
      animations.push(animate(mainHighlight.current, { translateX: mainButton.offsetLeft, translateY: mainButton.offsetTop, width: mainButton.offsetWidth, height: mainButton.offsetHeight, ...timing }))
      const lane = mainLane.current!
      const left = mainButton.offsetLeft, right = left + mainButton.offsetWidth
      if ((vertical || matrix) && mainButton.offsetTop < lane.scrollTop) lane.scrollTo({ top: mainButton.offsetTop, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if ((vertical || matrix) && mainButton.offsetTop + mainButton.offsetHeight > lane.scrollTop + lane.clientHeight) lane.scrollTo({ top: mainButton.offsetTop + mainButton.offsetHeight - lane.clientHeight, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if (!vertical && !matrix && left < lane.scrollLeft) lane.scrollTo({ left, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if (!vertical && !matrix && right > lane.scrollLeft + lane.clientWidth) lane.scrollTo({ left: right - lane.clientWidth, behavior: reduceMotion ? 'instant' : 'smooth' })
    }
    if (childButton && childHighlight.current) animations.push(animate(childHighlight.current, { translateX: matrix ? childButton.offsetLeft : 0, translateY: childButton.offsetTop, width: matrix ? childButton.offsetWidth : '100%', height: childButton.offsetHeight, ...timing }))
    if (matrix && childButton) {
      const lane = childButton.parentElement!
      const left = childButton.offsetLeft, right = left + childButton.offsetWidth
      if (left < lane.scrollLeft) lane.scrollTo({ left, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if (right > lane.scrollLeft + lane.clientWidth) lane.scrollTo({ left: right - lane.clientWidth, behavior: reduceMotion ? 'instant' : 'smooth' })
    }
    if (detailButton && detailHighlight.current) animations.push(animate(detailHighlight.current, { translateY: detailButton.offsetTop, height: detailButton.offsetHeight, ...timing }))
    if (detailLane.current) animations.push(animate(detailLane.current, { opacity: hasDetails ? [0, 1] : 0, translateX: hasDetails ? [8, 0] : 8, ...timing }))
    for (const button of [childButton, detailButton]) {
      const lane = button?.parentElement
      if (!button || !lane || lane.scrollHeight <= lane.clientHeight) continue
      if (button.offsetTop < lane.scrollTop) lane.scrollTo({ top: button.offsetTop, behavior: reduceMotion ? 'instant' : 'smooth' })
      else if (button.offsetTop + button.offsetHeight > lane.scrollTop + lane.clientHeight) lane.scrollTo({ top: button.offsetTop + button.offsetHeight - lane.clientHeight, behavior: reduceMotion ? 'instant' : 'smooth' })
    }
    if (childLane.current) animations.push(animate(childLane.current, { height: expandedChildren ? childLane.current.scrollHeight : 0, opacity: expandedChildren ? 1 : 0, ...timing }))
    return () => { animations.forEach((animation) => animation.cancel()) }
  }, [open, popup, selection.main, selection.child, selection.detail, expandedChildren, hasDetails, options.length, reduceMotion, vertical, matrix])
  const showPreview = (next: Selection) => { previewRef.current = next; setPreview(next); setOpen(true) }
  const commit = (next: Selection) => {
    const option = options[next.main]
    const nextChildren = option?.children ?? (option?.key === childParent ? childOptions : [])
    const child = next.level !== 'main' || behavior === 'switch' ? nextChildren[next.child] : undefined
    const detail = next.level === 'details' ? child?.children?.[next.detail ?? 0] : undefined
    if (option?.branchOnly && next.level === 'main') return
    if (!option || option.disabled || child?.disabled || detail?.disabled) return
    onSelect(option.key, child?.key, detail?.key)
  }
  const bindDrag = usePressDrag(({ first, last, canceled, initial, xy, cancel }) => {
    if (!options.length) return
    if (first) {
      cancelDrag.current = cancel; suppressClick.current = false
      drag.current = { x: initial[0], y: initial[1], main: index, moved: false, childX: xy[0], childY: xy[1], detailX: xy[0], detailY: matrix ? childIndex : xy[1] }
    }
    const start = drag.current
    if (!start) return
    if (Math.hypot(xy[0] - initial[0], xy[1] - initial[1]) >= 12) start.moved = true
    const previous = previewRef.current ?? { main: start.main, child: childIndex, level: 'main' as const }
    let main = previous.main, child = childIndex, detail = 0, level: Selection['level'] = 'main'
    if (matrix) {
      const rows = mainLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')
      const bounds = mainLane.current?.getBoundingClientRect()
      const rowHeight = rows?.[0]?.getBoundingClientRect().height || 86
      main = resolveMain(start.main + Math.round((xy[1] - start.y) / (rowHeight + 4)))
      if (rows && bounds && xy[0] >= bounds.left && xy[0] <= bounds.right) {
        const hovered = [...rows].findIndex(row => { const rect = row.getBoundingClientRect(); return xy[1] >= rect.top && xy[1] <= rect.bottom })
        if (hovered >= 0) main = hovered
      }
      const nextChildren = options[main]?.children ?? []
      if (main !== previous.main) {
        start.main = main; start.y = xy[1]; start.childX = xy[0]; start.detailY = preferredChild(nextChildren)
      }
      const position = start.detailY + Math.round((xy[0] - start.childX) / 96)
      child = nextChildren.length ? (loop ? wrap(position, nextChildren.length) : Math.min(nextChildren.length - 1, Math.max(0, position))) : 0
      const chips = rows?.[main]?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')
      const lane = chips?.[0]?.parentElement?.getBoundingClientRect()
      if (chips && lane && Math.abs(xy[0] - start.childX) > 12 && xy[0] >= lane.left && xy[0] <= lane.right && xy[1] >= lane.top && xy[1] <= lane.bottom) {
        const hovered = [...chips].findIndex(chip => { const rect = chip.getBoundingClientRect(); return xy[0] >= rect.left && xy[0] <= rect.right })
        if (hovered >= 0) { child = hovered; start.childX = xy[0]; start.detailY = child }
      }
      level = 'children'
    } else if (vertical) {
      const mainBounds = mainLane.current?.getBoundingClientRect()
      const row = mainLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')[previous.main]
      const rowBounds = row?.getBoundingClientRect()
      const leaving = previous.level !== 'main' && (xy[0] < start.childX - 32 || (!!mainBounds && xy[0] < mainBounds.right - 12))
      if (leaving) { start.main = previous.main; start.x = xy[0]; start.y = xy[1] }
      if (previous.level === 'main' || leaving) {
        main = resolveMain(start.main + Math.round((xy[1] - start.y) / 42))
        if (mainBounds && xy[0] >= mainBounds.left && xy[0] <= mainBounds.right && xy[1] >= mainBounds.top && xy[1] <= mainBounds.bottom) {
          const buttons = mainLane.current!.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')
          const hovered = [...buttons].findIndex(button => { const rect = button.getBoundingClientRect(); return xy[1] >= rect.top && xy[1] <= rect.bottom })
          if (hovered >= 0) { main = hovered; start.main = main; start.x = xy[0]; start.y = xy[1] }
        }
      }
      const nextChildren = options[main]?.children ?? []
      if (!leaving && nextChildren.length && (previous.level !== 'main' || xy[0] - start.x > 40 || (!!rowBounds && xy[0] > rowBounds.right + 8))) {
        if (previous.level === 'main') { start.childX = xy[0]; start.childY = xy[1] }
        child = Math.min(nextChildren.length - 1, Math.max(0, previous.level === 'main' ? 0 : Math.round((xy[1] - start.childY) / 42)))
        const rows = childLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')
        const bounds = rows?.[0]?.parentElement?.getBoundingClientRect()
        if (previous.level !== 'details' && bounds && xy[0] >= bounds.left && xy[0] <= bounds.right && xy[1] >= bounds.top && xy[1] <= bounds.bottom) {
          const hovered = [...rows!].findIndex(button => { const rect = button.getBoundingClientRect(); return xy[1] >= rect.top && xy[1] <= rect.bottom })
          if (hovered >= 0) child = hovered
        }
        if (previous.level === 'details') child = previous.child
        else if (child !== previous.child) { start.childX = xy[0]; start.childY = xy[1] - child * 42 }
        const nextDetails = nextChildren[child]?.children ?? []
        const leavingDetails = previous.level === 'details' && xy[0] < start.detailX - 32
        const inDetails = !leavingDetails && nextDetails.length > 0 && (previous.level === 'details' || xy[0] - start.childX > 40)
        level = inDetails ? 'details' : 'children'
        if (inDetails) {
          if (previous.level !== 'details') { start.detailX = xy[0]; start.detailY = xy[1] }
          detail = Math.min(nextDetails.length - 1, Math.max(0, Math.round((xy[1] - start.detailY) / 42)))
        }
        if (leavingDetails) { start.childX = xy[0]; child = previous.child }
      }
    } else {
      const rows = childLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-child]')
      const rowTop = rows?.[0]?.getBoundingClientRect().top ?? initial[1] + 160
      const rowHeight = rows?.[0]?.getBoundingClientRect().height || 42
      const leavingChildren = previous.level !== 'main' && xy[1] < Math.min(rowTop - 12, start.childY - 24)
      if (leavingChildren) { start.x = xy[0]; start.y = xy[1]; start.main = previous.main }
      main = previous.level !== 'main' && !leavingChildren
        ? previous.main : resolveMain(start.main + Math.round((xy[0] - start.x) / 56))
      const mainBounds = mainLane.current?.getBoundingClientRect()
      if (previous.level === 'main' && mainBounds && xy[1] >= mainBounds.top && xy[1] <= mainBounds.bottom) {
        const buttons = mainLane.current!.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')
        const hovered = [...buttons].findIndex(button => { const bounds = button.getBoundingClientRect(); return xy[0] >= bounds.left && xy[0] <= bounds.right })
        if (hovered >= 0) { main = hovered; start.main = main; start.x = xy[0]; start.y = xy[1] }
      }
      const nextChildren = options[main]?.children ?? (options[main]?.key === childParent ? childOptions : [])
      const inChildren = !leavingChildren && nextChildren.length > 0 &&
        (previous.level !== 'main' || xy[1] - start.y > 32)
      if (inChildren) {
        if (previous.level === 'main') { start.childX = xy[0]; start.childY = xy[1] }
        child = previous.level === 'details' ? previous.child : Math.min(nextChildren.length - 1, Math.max(0, Math.floor((xy[1] - rowTop) / rowHeight)))
        if (previous.level !== 'details') start.childX = child !== previous.child ? xy[0] : Math.min(start.childX, xy[0])
        const nextDetails = nextChildren[child]?.children ?? []
        const leavingDetails = previous.level === 'details' && xy[0] < start.detailX - 32
        const inDetails = !leavingDetails && nextDetails.length > 0 && (previous.level === 'details' || xy[0] - start.childX > 40)
        level = inDetails ? 'details' : 'children'
        if (inDetails) {
          if (previous.level !== 'details') { start.detailX = xy[0]; start.detailY = xy[1] }
          detail = Math.min(nextDetails.length - 1, Math.max(0, Math.round((xy[1] - start.detailY) / 42)))
        }
        if (leavingDetails) { start.childX = xy[0]; child = previous.child }
      }
    }
    const next: Selection = { main, child, detail, level }
    if (last || canceled) {
      suppressClick.current = true
      // A stationary long press opens the menu; it must never execute an action.
      if (!canceled && start.moved) commit(next)
      cancelDrag.current = null; drag.current = null
      if (!canceled && start.moved && next.level === 'main' && options[next.main]?.branchOnly) showPreview({ ...next, level: 'children' })
      else { setOpen(!canceled && !start.moved); clearPreview() }
    } else showPreview(next)
  })
  const chooseMain = (position: number) => {
    const next: Selection = { main: position, child: childIndex, level: 'main' }
    if (behavior === 'command') { showPreview(next); return }
    commit(next)
    if (!options[position]?.children?.length && options[position]?.key !== childParent) { setOpen(false); clearPreview() }
  }
  return <Popover open={open} onOpenChange={(value) => { if (!drag.current) { setOpen(value); if (!value) clearPreview() } }}>
    <PopoverTrigger asChild>
      <Button ref={trigger} variant="ghost" data-testid={testId} aria-label={triggerLabel} disabled={!options.length}
        title={`${triggerLabel}\n${gestureHint}`} className={`${triggerContent ? 'xaihi-app-menu-trigger h-9 px-2.5 gap-2 font-mono' : 'xaihi-view-switch h-10 w-10 flex-col gap-1 p-0'} relative shrink-0 touch-none rounded-xl`}
        {...bindDrag()}
        onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
        onKeyDown={(event) => {
          if (event.key === (vertical ? 'ArrowUp' : 'ArrowLeft') || event.key === (vertical ? 'ArrowDown' : 'ArrowRight')) {
            event.preventDefault(); chooseMain(resolveMain((behavior === 'command' ? selection.main : index) + (event.key === (vertical ? 'ArrowDown' : 'ArrowRight') ? 1 : -1)))
          }
          if (event.key === (vertical ? 'ArrowRight' : 'ArrowDown') && hasChildren) { event.preventDefault(); showPreview({ ...selection, level: 'children' }) }
          if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); chooseMain(event.key === 'Home' ? 0 : options.length - 1) }
          if (behavior === 'command' && open && event.key === 'Enter') { event.preventDefault(); if (options[selection.main]?.branchOnly && selection.level === 'main') showPreview({ ...selection, level: 'children' }); else { commit(selection); close() } }
          if (event.key === 'Escape') { event.preventDefault(); close() }
        }}>
        <span className="flex items-center justify-center gap-2">{triggerContent ?? (Icon && <Icon className="size-[18px] text-primary" />)}</span>
        {showIndicators && <span aria-hidden="true" className={`flex h-1 items-center justify-center ${options.length > 5 ? 'gap-0.5' : 'gap-[3px]'}`}>
          {options.map((option, i) => <span key={option.key} data-xaihi-view-dot className="h-[3px] rounded-full bg-primary" style={{ width: i === index ? (options.length > 5 ? 4 : 6) : (options.length > 5 ? 2 : 3), opacity: i === index ? 1 : .35 }} />)}
        </span>}
        {badge > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] leading-none text-destructive-foreground">{badge > 9 ? '9+' : badge}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align={align} sideOffset={7} data-orientation={orientation} data-expanded={expandedChildren} className="xaihi-view-menu max-h-[calc(100dvh-5rem)] overflow-y-auto w-[min(94vw,23rem)] rounded-2xl p-2"
      onEscapeKeyDown={close}
      onOpenAutoFocus={(event) => { if (drag.current || behavior === 'command') event.preventDefault() }}
      onPointerDownOutside={(event) => { if (drag.current) event.preventDefault() }}
      onInteractOutside={(event) => { if (drag.current) event.preventDefault() }}>
      <div ref={setPopup}>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>{title}</span><span>{preview ? releaseHint : gestureHint}</span></div>
        {matrix ? <div ref={mainLane} className="xaihi-picker-matrix relative grid gap-1" onKeyDown={event => {
          let main = selection.main, child = selection.child
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault(); main = resolveMain(main + (event.key === 'ArrowDown' ? 1 : -1)); child = preferredChild(options[main]?.children ?? [])
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); const count = options[main]?.children?.length ?? 0
            const position = child + (event.key === 'ArrowRight' ? 1 : -1)
            child = count ? loop ? wrap(position, count) : Math.min(count - 1, Math.max(0, position)) : 0
          } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit({ ...selection, level: 'children' }); close(); return }
          else return
          showPreview({ main, child, level: 'children' })
          mainLane.current?.querySelectorAll<HTMLElement>('[data-xaihi-picker-main]')[main]?.querySelectorAll<HTMLButtonElement>('[data-xaihi-picker-child]')[child]?.focus()
        }}>
          <span ref={mainHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-xl bg-muted/50 ring-1 ring-border/70" />
          {options.map((option, main) => {
            const RowIcon = option.icon
            const focused = selection.main === main
            return <div key={option.key} data-xaihi-picker-main className="relative min-w-0 rounded-xl px-2 py-2">
              <button type="button" {...{ [optionAttribute]: option.key }} aria-pressed={focused} title={option.hint ?? option.label}
                onClick={() => showPreview({ main, child: preferredChild(option.children ?? []), level: 'children' })}
                className={`mb-1 flex items-center gap-2 rounded px-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${focused ? 'text-foreground' : 'text-muted-foreground'}`}>
                {RowIcon && <RowIcon className="size-[18px] shrink-0" />}<span>{option.label}</span>
              </button>
              <div role="group" aria-label={option.label} className="xaihi-picker-matrix-lane relative flex w-full gap-1 overflow-x-auto py-1">
                {focused && <span ref={childHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-lg bg-primary/12 ring-1 ring-primary/25" />}
                {option.children?.map((item, child) => {
                  const ItemIcon = item.icon
                  return <button key={item.key} type="button" data-xaihi-picker-child {...{ [childAttribute]: item.key }} data-xaihi-picker-selected={item.toggled}
                    aria-pressed={focused && selection.child === child} title={item.hint ?? item.label} disabled={option.disabled || item.disabled}
                    onFocus={() => { if (!drag.current) showPreview({ main, child, level: 'children' }) }}
                    onClick={() => { commit({ main, child, level: 'children' }); close() }}
                    className={`relative flex shrink-0 items-center gap-2 rounded-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${item.toggled ? 'text-primary' : 'text-muted-foreground'}`}>
                    {item.leading}{ItemIcon && <ItemIcon className="size-[18px]" />}<span className="truncate">{item.label}</span>{item.toggled && <span aria-hidden="true" className="ml-auto text-primary">✓</span>}
                  </button>
                })}
              </div>
            </div>
          })}
        </div> : <><div className={vertical && expandedChildren ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2' : undefined}>
        <div ref={mainLane} className={`xaihi-picker-main-lane relative grid gap-1 ${vertical ? 'max-h-[min(32rem,70dvh)] overflow-y-auto' : 'grid-flow-col auto-cols-[minmax(56px,1fr)] overflow-x-auto'}`} role="group" aria-label={title}
          onKeyDown={event => {
            if (!vertical || !(event.target instanceof HTMLButtonElement)) return
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const main = resolveMain(selection.main + (event.key === 'ArrowDown' ? 1 : -1)); showPreview({ main, child: 0, level: 'main' }); mainLane.current?.querySelectorAll<HTMLButtonElement>('[data-xaihi-picker-main]')[main]?.focus() }
            if (event.key === 'ArrowRight' && hasChildren) { event.preventDefault(); showPreview({ ...selection, child: 0, level: 'children' }); requestAnimationFrame(() => childLane.current?.querySelector<HTMLButtonElement>('button')?.focus()) }
          }}>

          <span ref={mainHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-xl bg-primary/12 ring-1 ring-primary/20" />
          {options.map(({ key, label, hint, icon: OptionIcon, disabled, badge: itemBadge = 0, toggled, shortcut, tone, separatorBefore }, i) => <button key={key} type="button" data-xaihi-picker-main {...{ [optionAttribute]: key }}
            aria-pressed={selection.main === i} aria-haspopup={options[i]?.children?.length ? "true" : undefined} title={hint ?? label} disabled={disabled}
            onClick={() => {
              if (options[i]?.children?.length) { showPreview({ main: i, child: 0, level: 'children' }); return }
              commit({ main: i, child: childIndex, level: 'main' })
              if (behavior === 'command' || key !== childParent) { setOpen(false); clearPreview() }
            }}
            className={`relative flex min-w-0 items-center gap-1.5 rounded-xl px-1 py-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${tone === 'danger' ? 'text-destructive' : ''} ${vertical && separatorBefore ? 'border-t border-border/60' : ''}`}>
            {OptionIcon && <OptionIcon className={`relative size-[18px] ${selection.main === i || toggled ? 'text-primary' : 'text-muted-foreground'}`} />}
            <span className="relative max-w-full truncate">{label}</span>
            {shortcut && <span className="relative ml-auto text-[10px] text-muted-foreground">{shortcut}</span>}
            {vertical && options[i]?.children?.length && <span aria-hidden="true" className="relative ml-auto text-muted-foreground">›</span>}
            {itemBadge > 0 && <span className="absolute right-1 top-1 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">{itemBadge > 9 ? '9+' : itemBadge}</span>}
          </button>)}
        </div>
        {hasChildren && <div ref={childLane} style={{ height: 0 }} className="overflow-hidden">
          <div className={vertical ? "border-l border-border/60 pl-2" : "mt-2 border-t border-border/60 pt-2"}>
            <div className="px-2 pb-1 text-[10px] text-muted-foreground">{currentChildTitle}{(details.length ? nestedHint : childHint) && <> · {details.length ? nestedHint : childHint}</>}</div>
            <div className={`grid gap-1 ${hasDetails ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="relative max-h-[min(18rem,45dvh)] overflow-y-auto" role="group" aria-label={currentChildTitle}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault(); showPreview({ ...selection, child: Math.min(children.length - 1, Math.max(0, selection.child + (event.key === 'ArrowDown' ? 1 : -1))), level: 'children' })
                  }
                  if (event.key === 'ArrowRight' && details.length) { event.preventDefault(); showPreview({ ...selection, detail: 0, level: 'details' }); requestAnimationFrame(() => detailLane.current?.querySelector<HTMLButtonElement>('button')?.focus()) }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); showPreview({ ...selection, level: 'main' }); (vertical ? mainLane.current?.querySelectorAll<HTMLButtonElement>('[data-xaihi-picker-main]')[selection.main] : trigger.current)?.focus() }
                  if (event.key === 'Enter') { event.preventDefault(); commit({ ...selection, level: 'children' }); close() }
                }}>
                <span ref={childHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 w-full rounded-lg bg-accent" />
                {children.map(({ key, label, hint, icon: ChildIcon, leading, disabled, toggled, children: subOptions }, i) => <button key={key} type="button" data-xaihi-picker-child {...{ [childAttribute]: key }}
                  aria-pressed={selection.child === i} data-xaihi-picker-selected={toggled} aria-haspopup={subOptions?.length ? 'true' : undefined} disabled={disabled} title={hint ?? label}
                  onClick={() => {
                    if (subOptions?.length) { showPreview({ ...selection, child: i, detail: 0, level: 'details' }); return }
                    commit({ main: selection.main, child: i, level: 'children' }); close()
                  }} className="relative flex h-[42px] w-full items-center gap-3 rounded-lg px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {leading}
                  {ChildIcon && <ChildIcon className={`relative size-[18px] ${(selection.child === i || toggled) ? 'text-primary' : 'text-muted-foreground'}`} />}
                  <span className="relative truncate">{label}</span>
                  {subOptions?.length ? <span aria-hidden="true" className="relative ml-auto text-muted-foreground">›</span> : toggled ? <span aria-hidden="true" className="relative ml-auto text-primary">✓</span> : selection.child === i && <span className="relative ml-auto size-1.5 rounded-full bg-primary" />}
                </button>)}
              </div>
              {hasDetails && <div ref={detailLane} className="relative max-h-[min(18rem,45dvh)] overflow-y-auto border-l border-border/60 pl-1" role="group" aria-label={children[selection.child]?.label}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); showPreview({ ...selection, detail: Math.min(details.length - 1, Math.max(0, (selection.detail ?? 0) + (event.key === 'ArrowDown' ? 1 : -1))) }) }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); showPreview({ ...selection, level: 'children' }); requestAnimationFrame(() => childLane.current?.querySelectorAll<HTMLButtonElement>('[data-xaihi-picker-child]')[selection.child]?.focus()) }
                  if (event.key === 'Enter') { event.preventDefault(); commit(selection); close() }
                }}>
                <span ref={detailHighlight} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 w-full rounded-lg bg-primary/12" />
                {details.map(({ key, label, disabled }, i) => <button key={key} type="button" data-xaihi-picker-detail={key} aria-pressed={(selection.detail ?? 0) === i} disabled={disabled}
                  onClick={() => { commit({ ...selection, detail: i, level: 'details' }); close() }}
                  className="relative flex h-[42px] w-full items-center rounded-lg px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="relative truncate">{label}</span></button>)}
              </div>}
            </div>
          </div>
        </div>}
        </div>
        </>}
        {footer}
      </div>
    </PopoverContent>
  </Popover>
}
