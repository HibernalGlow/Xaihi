/**
 * Vendored from PieMenu — joaopmarques/pie-menu, distributed as the shadcn registry
 * item `@jpmarques/pie-menu` (https://piemenu.jpmarqu.es/r/pie-menu.json), MIT licensed.
 * Fetched 2026-10-06. Third-party surface is react / react-dom / radix-ui only, all of
 * which this repo already carries, so this adds no dependency.
 *
 * Kept byte-identical to upstream on purpose: the pie geometry (centered wedges,
 * disabled-item aiming, measured extents + viewport clamping) is the reason it is used
 * instead of the repo's own first attempt. Any local change here must be recorded below.
 *
 * Departures from upstream: none.
 */
"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import { Slot } from "radix-ui"
import { createPortal } from "react-dom"

import {
  aimFromVector,
  aimStyle,
  createAimStore,
  IDLE_AIM,
  useAimStore,
  type AimStore,
} from "./aim"
import {
  clampCenter,
  degToRad,
  fitScale,
  itemTranslate,
  layoutItems,
  menuExtents,
  nearestIndex,
  radToDeg,
  scaleExtents,
  shortestRotation,
  stepIndex,
  vectorAngle,
  wedgeIndex,
  type ItemLayout,
  type Point,
} from "./geometry"
import {
  callHandler,
  composeHandlers,
  useComposedRefs,
  useControllableState,
  useLatest,
} from "./hooks"
import { usePresence, type PresenceStatus } from "./use-presence"

export type { Aim } from "./aim"
export type { PresenceStatus } from "./use-presence"

const LONG_PRESS_MS = 450
const LONG_PRESS_TOLERANCE = 10
const TYPEAHEAD_RESET_MS = 600

/* -------------------------------------------------------------------------------------------------
 * Root
 * -----------------------------------------------------------------------------------------------*/

type OpenSource = "pointer" | "keyboard"

interface OpenRequest {
  key: number
  point: Point
  source: OpenSource
  /** The pointer that opened the menu is still down, so a release can select. */
  pressed: boolean
  /** Only this pointer can end the press. Undefined accepts any pointer. */
  pointerId?: number
}

interface RootContextValue {
  open: boolean
  request: OpenRequest | null
  openAt: (request: Omit<OpenRequest, "key">) => void
  close: () => void
  isOpen: () => boolean
  triggerRef: RefObject<HTMLElement | null>
  triggerId: string
  contentId: string
}

const RootContext = createContext<RootContextValue | null>(null)

function useRootContext(consumer: string) {
  const context = useContext(RootContext)
  if (!context) throw new Error(`<${consumer}> must be used inside <PieMenu>.`)
  return context
}

export interface PieMenuProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

export function Root({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: PieMenuProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [request, setRequest] = useState<OpenRequest | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  // Mirrors `open` without waiting for a render, so two events in one frame cannot open twice.
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  }, [open])
  const keyRef = useRef(0)
  const triggerId = useId()
  const contentId = useId()

  const openAt = useCallback(
    (next: Omit<OpenRequest, "key">) => {
      openRef.current = true
      keyRef.current += 1
      setRequest({ ...next, key: keyRef.current })
      setOpen(true)
    },
    [setOpen]
  )

  const close = useCallback(() => {
    openRef.current = false
    setOpen(false)
  }, [setOpen])

  const value = useMemo<RootContextValue>(
    () => ({
      open,
      request,
      openAt,
      close,
      isOpen: () => openRef.current,
      triggerRef,
      triggerId,
      contentId,
    }),
    [open, request, openAt, close, triggerId, contentId]
  )

  return <RootContext.Provider value={value}>{children}</RootContext.Provider>
}

/* -------------------------------------------------------------------------------------------------
 * Trigger
 * -----------------------------------------------------------------------------------------------*/

export interface PieMenuTriggerProps extends ComponentProps<"button"> {
  asChild?: boolean
  /**
   * - `press`: primary press opens the menu at the pointer. Drag and release to select.
   *   Enter and Space open it from the keyboard.
   * - `contextmenu`: right click or long press opens the menu. Enter and Space open it
   *   when the trigger itself has focus, so keys typed in a child input are left alone.
   *
   * In both modes, the ContextMenu key and Shift+F10 open the menu from the keyboard.
   */
  openOn?: "press" | "contextmenu"
}

export function Trigger({
  asChild = false,
  openOn = "press",
  disabled,
  ref,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onKeyDown,
  ...props
}: PieMenuTriggerProps) {
  const context = useRootContext("PieMenuTrigger")
  const longPress = useRef<{
    timer: number
    pointerId: number
    x: number
    y: number
  } | null>(null)

  const cancelLongPress = useCallback(() => {
    if (!longPress.current) return
    window.clearTimeout(longPress.current.timer)
    longPress.current = null
  }, [])

  useEffect(() => cancelLongPress, [cancelLongPress])

  const composedRef = useComposedRefs(ref, context.triggerRef)
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      type={asChild ? undefined : "button"}
      aria-haspopup="menu"
      aria-expanded={context.open}
      aria-controls={context.open ? context.contentId : undefined}
      data-state={context.open ? "open" : "closed"}
      data-open-on={openOn}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      {...props}
      id={props.id ?? context.triggerId}
      ref={composedRef}
      onPointerDown={(event) => {
        if (callHandler(onPointerDown, event) || disabled || context.isOpen())
          return
        const { clientX: x, clientY: y, pointerId } = event

        if (openOn === "press") {
          // Ctrl + click is a context click on macOS.
          if (
            event.pointerType === "mouse" &&
            (event.button !== 0 || event.ctrlKey)
          )
            return
          event.preventDefault()
          context.openAt({
            point: { x, y },
            source: "pointer",
            pressed: true,
            pointerId,
          })
          return
        }

        if (event.pointerType === "mouse") return
        cancelLongPress()
        longPress.current = {
          pointerId,
          x,
          y,
          timer: window.setTimeout(() => {
            longPress.current = null
            context.openAt({
              point: { x, y },
              source: "pointer",
              pressed: true,
              pointerId,
            })
          }, LONG_PRESS_MS),
        }
      }}
      onPointerMove={(event) => {
        if (callHandler(onPointerMove, event)) return
        const pending = longPress.current
        if (!pending || pending.pointerId !== event.pointerId) return
        if (
          Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >
          LONG_PRESS_TOLERANCE
        )
          cancelLongPress()
      }}
      onPointerUp={(event) => {
        if (!callHandler(onPointerUp, event)) cancelLongPress()
      }}
      onPointerCancel={(event) => {
        if (!callHandler(onPointerCancel, event)) cancelLongPress()
      }}
      onContextMenu={(event) => {
        if (callHandler(onContextMenu, event)) return
        if (context.isOpen()) {
          event.preventDefault()
          return
        }
        if (openOn !== "contextmenu" || disabled) return
        event.preventDefault()
        cancelLongPress()
        context.openAt({
          point: { x: event.clientX, y: event.clientY },
          source: "pointer",
          // macOS fires this on press, Windows on release.
          pressed: event.buttons !== 0,
        })
      }}
      onKeyDown={(event) => {
        if (callHandler(onKeyDown, event) || disabled) return
        const menuKey =
          event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")
        const onTrigger =
          openOn === "press" || event.target === event.currentTarget
        const activate =
          onTrigger && (event.key === "Enter" || event.key === " ")
        if (!menuKey && !activate) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        context.openAt({
          point: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
          source: "keyboard",
          pressed: false,
        })
      }}
    />
  )
}

/* -------------------------------------------------------------------------------------------------
 * Content
 * -----------------------------------------------------------------------------------------------*/

interface ItemRecord {
  id: string
  element: HTMLElement
  disabled: boolean
  textValue: string
  onSelect: RefObject<((event: Event) => void) | undefined>
  onHighlight: RefObject<(() => void) | undefined>
}

interface ContentContextValue {
  register: (record: ItemRecord) => () => void
  layoutById: ReadonlyMap<string, ItemLayout>
  highlightedId: string | null
  selectedId: string | null
  /** Degrees, or null when nothing is highlighted. */
  highlightedAngle: number | null
  aimStore: AimStore
}

const ContentContext = createContext<ContentContextValue | null>(null)

function useContentContext(consumer: string) {
  const context = useContext(ContentContext)
  if (!context)
    throw new Error(`<${consumer}> must be used inside <PieMenuContent>.`)
  return context
}

export interface PieMenuContentProps extends ComponentProps<"div"> {
  /** Distance from the center to each item anchor, in px. */
  radius?: number
  /** Radius of the center area that selects nothing, in px. */
  deadZone?: number
  /** Direction of the first item, in degrees clockwise from 12 o'clock. */
  startAngle?: number
  /** Minimum space between the menu and the viewport edges, in px. */
  collisionPadding?: number
  /** Move focus back to the trigger when the menu closes. */
  returnFocus?: boolean
  /** Call `event.preventDefault()` to keep the menu open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  /** Portal target. Defaults to `document.body`. */
  container?: Element | null
  /** Props for the full-screen layer that captures pointer input while the menu is open. */
  overlayProps?: ComponentProps<"div">
}

export function Content({ container, ...props }: PieMenuContentProps) {
  const root = useRootContext("PieMenuContent")
  const menuRef = useRef<HTMLDivElement | null>(null)
  const { mounted, status } = usePresence(root.open, menuRef)

  if (!mounted || typeof document === "undefined") return null
  const request = root.request ?? requestFromTrigger(root.triggerRef.current)

  return createPortal(
    <ContentImpl
      key={request.key}
      {...props}
      request={request}
      status={status}
      menuRef={menuRef}
    />,
    container ?? document.body
  )
}

interface Gesture {
  /** `drag`: the opening press is still down. `sticky`: the menu waits for a click or a key. */
  mode: "drag" | "sticky"
  origin: Point
  pointerId?: number
  leftDeadZone: boolean
  pressed: boolean
}

interface ContentImplProps extends Omit<PieMenuContentProps, "container"> {
  request: OpenRequest
  status: PresenceStatus
  menuRef: RefObject<HTMLDivElement | null>
}

function ContentImpl({
  request,
  status,
  menuRef,
  radius = 96,
  deadZone = 20,
  startAngle = 0,
  collisionPadding = 8,
  returnFocus = true,
  onEscapeKeyDown,
  overlayProps,
  ref,
  style,
  children,
  ...menuProps
}: ContentImplProps) {
  const root = useRootContext("PieMenuContent")
  const startRadians = degToRad(startAngle)

  const [items, setItems] = useState<ItemRecord[]>([])
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fit, setFit] = useState({ center: request.point, scale: 1 })
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const highlightedRef = useRef<string | null>(null)
  const lastInput = useRef<OpenSource>(request.source)
  const gesture = useRef<Gesture>({
    mode: request.pressed ? "drag" : "sticky",
    origin: request.point,
    pointerId: request.pointerId,
    leftDeadZone: false,
    pressed: false,
  })

  const [aimStore] = useState(createAimStore)

  // Mirror the aim into CSS variables on the menu element, with no React render.
  useLayoutEffect(
    () =>
      aimStore.subscribe(() => {
        const menu = menuRef.current
        if (!menu) return
        for (const [name, value] of Object.entries(aimStyle(aimStore.get())))
          menu.style.setProperty(name, value)
      }),
    [aimStore, menuRef]
  )

  const layouts = useMemo(
    () => layoutItems(items.length, radius, startRadians),
    [items.length, radius, startRadians]
  )
  const layoutById = useMemo(
    () => new Map(items.map((item, index) => [item.id, layouts[index]!])),
    [items, layouts]
  )

  const itemsRef = useLatest(items)
  const layoutsRef = useLatest(layouts)
  const fitRef = useLatest(fit)
  const onEscapeKeyDownRef = useLatest(onEscapeKeyDown)

  const register = useCallback((record: ItemRecord) => {
    setItems((current) =>
      sortByDocumentPosition([
        ...current.filter((item) => item.id !== record.id),
        record,
      ])
    )
    return () =>
      setItems((current) => current.filter((item) => item.id !== record.id))
  }, [])

  /** Pointer highlights come with a pointer aim. Keyboard highlights aim at the item. */
  const highlight = useCallback(
    (id: string | null, source: OpenSource) => {
      lastInput.current = source
      const index = itemsRef.current.findIndex((item) => item.id === id)
      if (highlightedRef.current !== id) {
        highlightedRef.current = id
        setHighlightedId(id)
        itemsRef.current[index]?.onHighlight.current?.()
      }
      const target =
        index === -1 ? menuRef.current : itemsRef.current[index]!.element
      if (target && document.activeElement !== target) focus(target, source)
      if (source === "keyboard") {
        const layout = layoutsRef.current[index]
        aimStore.set(
          layout ? aimFromVector(layout.sin, -layout.cos, 1) : IDLE_AIM
        )
      }
    },
    [aimStore, itemsRef, layoutsRef, menuRef]
  )

  const select = useCallback(
    (id: string, originalEvent: Event) => {
      const item = itemsRef.current.find((record) => record.id === id)
      if (!item || item.disabled) return
      const event = new CustomEvent("piemenu.select", {
        cancelable: true,
        detail: { originalEvent },
      })
      item.onSelect.current?.(event)
      if (event.defaultPrevented) {
        gesture.current = {
          ...gesture.current,
          mode: "sticky",
          pointerId: undefined,
          pressed: false,
        }
        return
      }
      setSelectedId(id)
      root.close()
    },
    [itemsRef, root]
  )

  // Keep the whole menu inside the viewport: shrink it when it is too big, then move it.
  // This runs before paint, so the menu never jumps.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const sizes = items.map(({ element }) => ({
      width: element.offsetWidth,
      height: element.offsetHeight,
    }))
    const centerElement = menu.querySelector<HTMLElement>(
      "[data-pie-menu-center]"
    )
    const centerSize = centerElement
      ? { width: centerElement.offsetWidth, height: centerElement.offsetHeight }
      : undefined
    const html = document.documentElement
    const viewport = {
      width: html.clientWidth || window.innerWidth,
      height: html.clientHeight || window.innerHeight,
    }
    const extents = menuExtents(layouts, sizes, centerSize)
    const scale = fitScale(extents, viewport, collisionPadding)
    const center = clampCenter(
      request.point,
      scaleExtents(extents, scale),
      viewport,
      collisionPadding
    )
    setFit((current) =>
      current.scale === scale &&
      current.center.x === center.x &&
      current.center.y === center.y
        ? current
        : { center, scale }
    )
  }, [items, layouts, request.point, collisionPadding, menuRef])

  // Initial focus: the first item for keyboard users, the menu itself for pointer users.
  const focusedOnOpen = useRef(false)
  useLayoutEffect(() => {
    if (focusedOnOpen.current) return
    const first = items.find((item) => !item.disabled)
    if (request.source === "keyboard" && first) {
      focusedOnOpen.current = true
      highlight(first.id, "keyboard")
    } else if (request.source === "pointer" || items.length > 0) {
      focusedOnOpen.current = true
      if (menuRef.current) focus(menuRef.current, request.source)
    }
  }, [items, request.source, highlight, menuRef])

  // Give focus back to the trigger on close, unless something else took it.
  useEffect(() => {
    if (root.open || !returnFocus) return
    const active = document.activeElement
    const trigger = root.triggerRef.current
    if (
      trigger &&
      (!active || active === document.body || menuRef.current?.contains(active))
    ) {
      focus(trigger, lastInput.current)
    }
  }, [root.open, root.triggerRef, returnFocus, menuRef])

  // Pointer input. Listeners sit on the window in the capture phase, so a drag works
  // even when the pointer leaves the overlay, and the press that opened the menu is not seen twice.
  useEffect(() => {
    if (!root.open) return

    const track = (event: PointerEvent) => {
      const current = gesture.current
      const reference =
        current.mode === "drag" ? current.origin : fitRef.current.center
      const dx = event.clientX - reference.x
      const dy = event.clientY - reference.y
      const distance = Math.hypot(dx, dy)
      if (distance > deadZone) current.leftDeadZone = true
      aimStore.set(aimFromVector(dx, dy, radius * fitRef.current.scale))

      const records = itemsRef.current
      const hovered =
        event.target instanceof Element
          ? event.target.closest("[data-pie-menu-item]")
          : null
      const hoveredItem = hovered
        ? records.find((item) => item.element === hovered)
        : undefined
      // The dead zone never highlights. This matters on open: items start stacked at the
      // center, right under the pointer, so the element under it can be an item.
      let next: ItemRecord | undefined
      if (distance > deadZone) {
        next =
          hoveredItem ??
          records[wedgeIndex(vectorAngle(dx, dy), records.length, startRadians)]
      }
      highlight(next && !next.disabled ? next.id : null, "pointer")
      return distance
    }

    const commit = (event: PointerEvent) => {
      const id = highlightedRef.current
      if (id) select(id, event)
      else root.close()
    }

    const ownsPointer = (event: PointerEvent) =>
      gesture.current.pointerId === undefined ||
      gesture.current.pointerId === event.pointerId

    const onPointerMove = (event: PointerEvent) => {
      if (gesture.current.mode === "drag" && !ownsPointer(event)) return
      track(event)
    }

    const onPointerDown = (event: PointerEvent) => {
      const current = gesture.current
      if (current.mode !== "sticky") return
      event.preventDefault()
      current.pressed = true
      current.pointerId = event.pointerId
      track(event)
    }

    const onPointerUp = (event: PointerEvent) => {
      const current = gesture.current
      if (!ownsPointer(event)) return
      if (current.mode === "drag") {
        // A fast flick can release before any move event arrives.
        track(event)
        // A click that stays in the center leaves the menu open for a second click.
        if (current.leftDeadZone) commit(event)
        else
          gesture.current = { ...current, mode: "sticky", pointerId: undefined }
        return
      }
      if (!current.pressed) return
      current.pressed = false
      current.pointerId = undefined
      // A click in the center cancels, the same as the Escape key.
      if (track(event) <= deadZone) root.close()
      else commit(event)
    }

    const close = () => root.close()
    const options = { capture: true }
    window.addEventListener("pointermove", onPointerMove, options)
    window.addEventListener("pointerdown", onPointerDown, options)
    window.addEventListener("pointerup", onPointerUp, options)
    window.addEventListener("pointercancel", close, options)
    window.addEventListener("resize", close)
    window.addEventListener("blur", close)
    return () => {
      window.removeEventListener("pointermove", onPointerMove, options)
      window.removeEventListener("pointerdown", onPointerDown, options)
      window.removeEventListener("pointerup", onPointerUp, options)
      window.removeEventListener("pointercancel", close, options)
      window.removeEventListener("resize", close)
      window.removeEventListener("blur", close)
    }
  }, [
    root,
    deadZone,
    radius,
    startRadians,
    aimStore,
    highlight,
    select,
    itemsRef,
    fitRef,
  ])

  // Keyboard input. Arrow keys pick by direction and combine for diagonals (Up + Right = north-east).
  useEffect(() => {
    if (!root.open) return
    const arrows = new Set<string>()
    let typeahead = ""
    let typeaheadTimer = 0

    const onKeyDown = (event: KeyboardEvent) => {
      lastInput.current = "keyboard"
      const records = itemsRef.current
      const enabled = records.map((item) => !item.disabled)
      const current = records.findIndex(
        (item) => item.id === highlightedRef.current
      )
      const go = (index: number) => {
        const item = records[index]
        if (item) highlight(item.id, "keyboard")
      }

      if (event.key === "Escape") {
        onEscapeKeyDownRef.current?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        root.close()
      } else if (event.key in ARROW_VECTORS) {
        event.preventDefault()
        arrows.add(event.key)
        const vector = [...arrows].reduce(
          (sum, key) => ({
            x: sum.x + ARROW_VECTORS[key]!.x,
            y: sum.y + ARROW_VECTORS[key]!.y,
          }),
          { x: 0, y: 0 }
        )
        if (vector.x === 0 && vector.y === 0) return
        const angles = layoutsRef.current.map((layout) => layout.angle)
        go(nearestIndex(vectorAngle(vector.x, vector.y), angles, enabled))
      } else if (event.key === "Tab") {
        event.preventDefault()
        const step = event.shiftKey ? -1 : 1
        go(
          stepIndex(
            current === -1 ? (step === 1 ? -1 : 0) : current,
            step,
            enabled
          )
        )
      } else if (event.key === "Home") {
        event.preventDefault()
        go(stepIndex(-1, 1, enabled))
      } else if (event.key === "End") {
        event.preventDefault()
        go(stepIndex(0, -1, enabled))
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        // A held key from the trigger must not select at once.
        if (event.repeat || !highlightedRef.current) return
        select(highlightedRef.current, event)
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        window.clearTimeout(typeaheadTimer)
        typeaheadTimer = window.setTimeout(
          () => (typeahead = ""),
          TYPEAHEAD_RESET_MS
        )
        typeahead += event.key.toLowerCase()
        const start =
          typeahead.length === 1 ? current + 1 : Math.max(current, 0)
        for (let offset = 0; offset < records.length; offset++) {
          const index = (start + offset) % records.length
          const item = records[index]!
          if (
            !item.disabled &&
            item.textValue.toLowerCase().startsWith(typeahead)
          )
            return go(index)
        }
      }
    }

    const onKeyUp = (event: KeyboardEvent) => arrows.delete(event.key)
    const onBlur = () => arrows.clear()
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("blur", onBlur)
    return () => {
      window.clearTimeout(typeaheadTimer)
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", onBlur)
    }
  }, [root, highlight, select, itemsRef, layoutsRef, onEscapeKeyDownRef])

  // The menu is modal: the page under it must not scroll.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const prevent = (event: Event) => event.preventDefault()
    overlay.addEventListener("wheel", prevent, { passive: false })
    return () => overlay.removeEventListener("wheel", prevent)
  }, [])

  const highlightedLayout = highlightedId
    ? layoutById.get(highlightedId)
    : undefined
  const overlayComposedRef = useComposedRefs(overlayProps?.ref, overlayRef)
  const menuComposedRef = useComposedRefs(ref, menuRef)

  const contentContext = useMemo<ContentContextValue>(
    () => ({
      register,
      layoutById,
      highlightedId,
      selectedId,
      highlightedAngle: highlightedLayout
        ? radToDeg(highlightedLayout.angle)
        : null,
      aimStore,
    }),
    [
      register,
      layoutById,
      highlightedId,
      selectedId,
      highlightedLayout,
      aimStore,
    ]
  )

  return (
    <div
      {...overlayProps}
      ref={overlayComposedRef}
      role="presentation"
      data-pie-menu-overlay=""
      data-state={root.open ? "open" : "closed"}
      style={{
        position: "fixed",
        inset: 0,
        touchAction: "none",
        pointerEvents: status === "ending" ? "none" : undefined,
        ...overlayProps?.style,
      }}
      onContextMenu={composeHandlers(overlayProps?.onContextMenu, (event) =>
        event.preventDefault()
      )}
    >
      <div
        aria-labelledby={menuProps["aria-label"] ? undefined : root.triggerId}
        {...menuProps}
        ref={menuComposedRef}
        id={root.contentId}
        role="menu"
        tabIndex={-1}
        data-state={root.open ? "open" : "closed"}
        data-starting-style={status === "starting" ? "" : undefined}
        data-entering={status === "entering" ? "" : undefined}
        data-ending-style={status === "ending" ? "" : undefined}
        data-highlighting={highlightedId ? "" : undefined}
        style={
          {
            position: "fixed",
            left: fit.center.x,
            top: fit.center.y,
            width: 0,
            height: 0,
            scale: fit.scale === 1 ? undefined : String(fit.scale),
            "--pie-radius": `${radius}px`,
            "--pie-dead-zone": `${deadZone}px`,
            ...style,
          } as CSSProperties
        }
      >
        <ContentContext.Provider value={contentContext}>{children}</ContentContext.Provider>
      </div>
    </div>
  )
}

const ARROW_VECTORS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

/**
 * Script focus shows a focus ring in some browsers even after a click.
 * Pointer users get no ring, keyboard users do.
 */
function focus(element: HTMLElement, source: OpenSource) {
  element.focus({
    preventScroll: true,
    focusVisible: source === "keyboard",
  } as FocusOptions)
}

function requestFromTrigger(trigger: HTMLElement | null): OpenRequest {
  const rect = trigger?.getBoundingClientRect()
  const point = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  return { key: 0, point, source: "keyboard", pressed: false }
}

function sortByDocumentPosition(records: ItemRecord[]) {
  return records.sort((a, b) =>
    a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  )
}

/* -------------------------------------------------------------------------------------------------
 * Item
 * -----------------------------------------------------------------------------------------------*/

export interface PieMenuItemProps extends Omit<
  ComponentProps<"div">,
  "onSelect"
> {
  disabled?: boolean
  /** Text for typeahead. Defaults to the text content of the item. */
  textValue?: string
  /** Call `event.preventDefault()` to keep the menu open. */
  onSelect?: (event: Event) => void
  /** Runs when the item becomes the highlighted item, by pointer or by keyboard. */
  onHighlight?: () => void
}

export function Item({
  disabled = false,
  textValue,
  onSelect,
  onHighlight,
  ref,
  style,
  ...props
}: PieMenuItemProps) {
  const context = useContentContext("PieMenuItem")
  const id = useId()
  const elementRef = useRef<HTMLDivElement | null>(null)
  const onSelectRef = useLatest(onSelect)
  const onHighlightRef = useLatest(onHighlight)
  const { register } = context

  // An item can mount while the menu is open. It gets its own first frame in the
  // start state, so it can transition in like the items that opened with the menu.
  const [starting, setStarting] = useState(true)
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setStarting(false))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    return register({
      id,
      element,
      disabled,
      textValue: textValue ?? element.textContent?.trim() ?? "",
      onSelect: onSelectRef,
      onHighlight: onHighlightRef,
    })
  }, [register, id, disabled, textValue, onSelectRef, onHighlightRef])

  const composedRef = useComposedRefs(ref, elementRef)
  const layout = context.layoutById.get(id)

  return (
    <div
      {...props}
      ref={composedRef}
      id={id}
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-pie-menu-item=""
      data-disabled={disabled ? "" : undefined}
      data-highlighted={context.highlightedId === id ? "" : undefined}
      data-selected={context.selectedId === id ? "" : undefined}
      data-starting-style={starting ? "" : undefined}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        ...(layout && itemStyle(layout)),
        ...style,
      }}
    />
  )
}

function itemStyle(layout: ItemLayout) {
  return {
    "--pie-item-index": layout.index,
    "--pie-item-angle": `${radToDeg(layout.angle)}deg`,
    "--pie-item-x": `${layout.x}px`,
    "--pie-item-y": `${layout.y}px`,
    "--pie-item-sin": layout.sin,
    "--pie-item-cos": layout.cos,
    "--pie-item-translate": itemTranslate(layout),
  } as CSSProperties
}

/* -------------------------------------------------------------------------------------------------
 * Center and Indicator
 * -----------------------------------------------------------------------------------------------*/

/** Content at the center of the menu, such as an avatar. It is decorative by default. */
export function Center({ style, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      {...props}
      data-pie-menu-center=""
      style={{ position: "absolute", left: 0, top: 0, ...style }}
    />
  )
}

/**
 * Turns toward the highlighted item. It always takes the short way around,
 * so a move from 350° to 10° turns 20°, not 340°.
 */
export function Indicator({ style, ...props }: ComponentProps<"div">) {
  const { highlightedAngle } = useContentContext("PieMenuIndicator")
  const [rotation, setRotation] = useState(highlightedAngle ?? 0)
  if (highlightedAngle !== null) {
    const target = shortestRotation(rotation, highlightedAngle)
    if (Math.abs(target - rotation) > 0.01) setRotation(target)
  }

  return (
    <div
      aria-hidden
      {...props}
      data-pie-menu-indicator=""
      data-visible={highlightedAngle !== null ? "" : undefined}
      style={
        {
          position: "absolute",
          left: 0,
          top: 0,
          "--pie-indicator-rotate": `${rotation}deg`,
          ...style,
        } as CSSProperties
      }
    />
  )
}

/* -------------------------------------------------------------------------------------------------
 * Hooks
 * -----------------------------------------------------------------------------------------------*/

/**
 * The live aim inside `<PieMenuContent>`. It re-renders on every pointer move.
 * For styles, prefer the `--pie-aim-*` CSS variables: they update without a render.
 */
export function usePieMenuAim() {
  return useAimStore(useContentContext("usePieMenuAim").aimStore)
}
