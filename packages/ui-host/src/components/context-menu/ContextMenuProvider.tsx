import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ContextMenuBuilderContext,
  type ContextMenuAPI,
  type ContextMenuBuilder,
} from "./context"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button-variants"

// NOTE: The global context menu is rendered with DropdownMenu primitives instead of
// Radix ContextMenu because Radix ContextMenu.Root does not accept a controlled
// `open` prop — it only emits `onOpenChange`. The global builder needs to open the
// menu programmatically at arbitrary client coordinates, which requires controlled
// open + a fixed invisible anchor. DropdownMenu supports this. The shadcn
// `context-menu.tsx` is still installed for future localized menus via
// `<ScopedContextMenu>` (see ./ScopedContextMenu).

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type ContextMenuItemType =
  | "item"
  | "separator"
  | "label"
  | "group"
  | "checkbox"
  | "radio"
  | "submenu"
  /** Horizontal icon-only toolbar row (Neo-style compact actions). */
  | "icon-row"

export interface ContextMenuItemDef {
  /** Stable id, also used as React key when present. Falls back to index. */
  id?: string
  /** Item kind. Defaults to "item". When `children` is set, behaves as submenu. */
  type?: ContextMenuItemType
  /** Localized label (already translated by the builder). */
  label?: string
  /** Optional native tooltip when the visible label intentionally stays concise. */
  title?: string
  /** Leading icon node. Let the menu CSS handle svg sizing. */
  icon?: ReactNode
  /** Keyboard shortcut hint, e.g. "Ctrl+D". */
  shortcut?: string
  /** Disable the item. */
  disabled?: boolean
  /** When true, the item is skipped entirely (not rendered). */
  hidden?: boolean
  /** Render in destructive color. */
  destructive?: boolean
  /** Inset (aligns content with checkbox/radio items). */
  inset?: boolean
  /** Stable test id for queries. */
  testId?: string
  /** Keep the menu open after selecting this item. */
  keepOpen?: boolean
  /** Confirmation dialog before running `onSelect`. Useful for destructive actions. */
  confirm?: {
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    /** Render the confirm button in destructive style. Defaults to `destructive` flag. */
    destructive?: boolean
  }
  /** Click handler. Only for "item" type. */
  onSelect?: () => void | Promise<void>
  /** Checkbox state (for "checkbox" type). */
  checked?: boolean
  /** Called when checkbox state should change. Required for "checkbox" type. */
  onCheckedChange?: (checked: boolean) => void | Promise<void>
  /** Radio value (for "radio" type). */
  value?: string
  /** Radio group name (for "radio" type, items with same group share selection). */
  radioGroup?: string
  /** Current radio group value (for "radio" type, on the group's first item). */
  radioValue?: string
  /** Callback when radio changes. */
  onRadioChange?: (value: string) => void | Promise<void>
  /**
   * Nested items.
   * - `submenu` / default with children → nested menu
   * - `group` → logical group
   * - `icon-row` → horizontal icon-only buttons (label becomes aria-label/title)
   */
  children?: ContextMenuItemDef[]
}

export interface ContextMenuContext {
  /** The element carrying the data-context-menu attribute. */
  element: HTMLElement
  /** The original DOM event. */
  event: MouseEvent
  /** Sanitized dataset of the element (without the contextMenu key). */
  data: Record<string, string>
}

// ──────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────

interface OpenMenu {
  x: number
  y: number
  items: ContextMenuItemDef[]
  returnFocus?: HTMLElement
}

interface PendingConfirmation {
  item: ContextMenuItemDef
  returnFocus?: HTMLElement
  resolve(confirmed: boolean): void
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const buildersRef = useRef(new Map<string, ContextMenuBuilder[]>())
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null)
  // Confirm state lives at the provider level so the dialog persists even after
  // the menu unmounts (Radix may close the menu on item select in some envs).
  const [confirm, setConfirm] = useState<PendingConfirmation | null>(null)

  const show = useCallback((x: number, y: number, items: ContextMenuItemDef[]) => {
    if (items.length === 0) return
    setOpenMenu({ x, y, items })
  }, [])

  const register = useCallback((scope: string, builder: ContextMenuBuilder) => {
    const registrations = buildersRef.current.get(scope) ?? []
    registrations.push(builder)
    buildersRef.current.set(scope, registrations)
    return () => {
      const current = buildersRef.current.get(scope)
      if (!current) return
      const index = current.lastIndexOf(builder)
      if (index >= 0) current.splice(index, 1)
      if (!current.length) buildersRef.current.delete(scope)
    }
  }, [])

  // Global contextmenu listener: suppress native menu + collect builder items.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable = !!target && isEditableTarget(target)
      const path = e.composedPath()
      if (!isEditable && shouldDeferToTldrawContextMenu(path)) return

      // Always suppress native menu for non-editable targets.
      if (!isEditable) e.preventDefault()

      // For editable targets, let the native menu through and skip custom menu.
      if (isEditable) return

      const items: ContextMenuItemDef[] = []
      const seenScopes = new Set<string>()

      for (const el of path) {
        if (!(el instanceof HTMLElement)) continue
        // Nodes can opt out of host/workspace ancestor menus (focus, fullscreen, …)
        // by declaring data-context-menu-stop on their surface root. Inner scopes
        // already collected above this boundary still contribute.
        const stopAncestors = el.dataset.contextMenuStop != null
        const scope = el.dataset.contextMenu
        if (scope && !seenScopes.has(scope)) {
          seenScopes.add(scope)
          const builder = buildersRef.current.get(scope)?.at(-1)
          if (builder) {
            const data: Record<string, string> = {}
            for (const k in el.dataset) {
              if (k === "contextMenu" || k === "contextMenuStop") continue
              data[k] = el.dataset[k] as string
            }
            const built = builder({ element: el, event: e, data })
            if (built && built.length > 0) {
              items.push(...built, { type: "separator" })
            }
          }
        }
        if (stopAncestors) break
      }

      // Drop trailing separators.
      while (items.length > 0 && items[items.length - 1].type === "separator") {
        items.pop()
      }

      if (items.length === 0) return
      const targetRect = e.clientX === 0 && e.clientY === 0 ? target?.getBoundingClientRect() : undefined
      setOpenMenu({
        x: targetRect ? targetRect.left + targetRect.width / 2 : e.clientX,
        y: targetRect ? targetRect.top + targetRect.height / 2 : e.clientY,
        items,
        returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
      })
    }
    window.addEventListener("contextmenu", handler)
    return () => window.removeEventListener("contextmenu", handler)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return
      const target = event.target instanceof HTMLElement ? event.target : document.activeElement
      if (!(target instanceof HTMLElement) || isEditableTarget(target)) return
      event.preventDefault()
      target.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0,
      }))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const requestConfirmation = useCallback((item: ContextMenuItemDef, returnFocus?: HTMLElement) => {
    if (!item.confirm || item.disabled) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      setConfirm((current) => {
        current?.resolve(false)
        return { item, returnFocus, resolve }
      })
      setOpenMenu(null)
    })
  }, [])

  const api = useMemo<ContextMenuAPI>(() => ({ register, show, confirm: requestConfirmation }), [register, requestConfirmation, show])

  return (
    <ContextMenuBuilderContext.Provider value={api}>
      {children}
      {openMenu && (
        <MenuController
          coords={{ x: openMenu.x, y: openMenu.y }}
          items={openMenu.items}
          onClose={() => setOpenMenu(null)}
          onRequestConfirm={(item) => requestConfirmation(item, openMenu.returnFocus)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          item={confirm.item}
          onClose={() => {
            const returnFocus = confirm.returnFocus
            confirm.resolve(false)
            setConfirm(null)
            queueMicrotask(() => returnFocus?.isConnected && returnFocus.focus())
          }}
          onConfirm={() => {
            const returnFocus = confirm.returnFocus
            confirm.resolve(true)
            setConfirm(null)
            void confirm.item.onSelect?.()
            queueMicrotask(() => returnFocus?.isConnected && returnFocus.focus())
          }}
        />
      )}
    </ContextMenuBuilderContext.Provider>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Menu controller: drives the Radix ContextMenu in controlled mode.
// Uses an invisible 1x1 anchor positioned at the click coordinates.
// ──────────────────────────────────────────────────────────────────────────

function MenuController({
  coords,
  items,
  onClose,
  onRequestConfirm,
}: {
  coords: { x: number; y: number }
  items: ContextMenuItemDef[]
  onClose: () => void
  onRequestConfirm: (item: ContextMenuItemDef) => void
}) {
  const [open, setOpen] = useState(true)
  const anchorRef = useRef<HTMLSpanElement>(null)

  // Position the invisible anchor at the click point.
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.style.left = `${coords.x}px`
      anchorRef.current.style.top = `${coords.y}px`
    }
  }, [coords])

  const runItem = useCallback((item: ContextMenuItemDef) => {
    if (item.confirm) {
      // Defer to provider-level dialog so it survives menu unmount.
      onRequestConfirm(item)
      return
    }
    // keepOpen items: run handler but keep the menu open.
    void item.onSelect?.()
    if (!item.keepOpen) {
      setOpen(false)
      onClose()
    }
  }, [onClose, onRequestConfirm])

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClose()
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <span
          ref={anchorRef}
          aria-hidden
          data-context-menu-anchor="true"
          style={{
            position: "fixed",
            left: coords.x,
            top: coords.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
            opacity: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        alignOffset={0}
        className="z-[2000] w-max min-w-[11.5rem] max-w-[15rem]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <MenuItems items={items} runItem={runItem} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Confirm dialog
// ──────────────────────────────────────────────────────────────────────────

function ConfirmDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: ContextMenuItemDef
  onClose: () => void
  onConfirm: () => void
}) {
  const cfg = item.confirm!
  const destructive = cfg.destructive ?? item.destructive ?? false
  return (
    <AlertDialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <AlertDialogContent className="z-[2001]">
        <AlertDialogTitle>{cfg.title}</AlertDialogTitle>
        {cfg.description && <AlertDialogDescription>{cfg.description}</AlertDialogDescription>}
        <AlertDialogFooter>
          <AlertDialogCancel>{cfg.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={onConfirm}
          >
            {cfg.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Recursive item renderer
// ──────────────────────────────────────────────────────────────────────────

function MenuItems({
  items,
  runItem,
}: {
  items: ContextMenuItemDef[]
  runItem: (item: ContextMenuItemDef) => void
}) {
  // Drop hidden items, then collapse consecutive separators and trim leading/trailing.
  const normalized = useMemo(() => normalizeItems(items), [items])

  // Collect radio groups: first item with radioGroup defines the group's value + handler.
  const radioGroups = useMemo(() => {
    const map = new Map<string, { value: string; onRadioChange?: (v: string) => void | Promise<void> }>()
    for (const it of normalized) {
      if (it.type === "radio" && it.radioGroup && !map.has(it.radioGroup)) {
        map.set(it.radioGroup, {
          value: it.radioValue ?? "",
          onRadioChange: it.onRadioChange,
        })
      }
    }
    return map
  }, [normalized])

  // Track whether we are inside a ContextMenuRadioGroup to render groups once.
  // We group consecutive radio items with the same radioGroup into a single ContextMenuRadioGroup.
  return (
    <>
      {normalized.map((item, i) => {
        const key = item.id ?? `${item.type ?? "item"}-${i}`
        if (item.type === "separator") {
          return <DropdownMenuSeparator key={key} />
        }
        if (item.type === "label") {
          return (
            <DropdownMenuLabel
              key={key}
              inset={item.inset}
              title={item.label}
              className="max-w-full truncate font-normal text-muted-foreground"
            >
              {item.label}
            </DropdownMenuLabel>
          )
        }
        // Icon-only toolbar row (Neo-style compact actions).
        // Pack icons left — never stretch with justify-between, or a long footer
        // label will blow the row into a sparse strip across the whole menu width.
        if (item.type === "icon-row") {
          const icons = (item.children ?? []).filter((child) => !child.hidden)
          if (icons.length === 0) return null
          return (
            <DropdownMenuGroup key={key}>
              <div
                role="group"
                aria-label={item.label}
                data-context-menu-icon-row={item.id ?? "true"}
                className="flex w-full flex-row flex-wrap items-center justify-start gap-0.5 px-1 py-0.5"
              >
                {icons.map((child, ci) => {
                  const childKey = child.id ?? `${key}-icon-${ci}`
                  return (
                    <DropdownMenuItem
                      key={childKey}
                      disabled={child.disabled}
                      variant={child.destructive ? "destructive" : "default"}
                      className="size-7 shrink-0 justify-center gap-0 p-0"
                      aria-label={child.label}
                      title={child.label}
                      data-testid={child.testId}
                      onSelect={(e) => {
                        if (child.disabled) {
                          e.preventDefault()
                          return
                        }
                        if (child.keepOpen) e.preventDefault()
                        runItem(child)
                      }}
                    >
                      {child.icon}
                      <span className="sr-only">{child.label}</span>
                    </DropdownMenuItem>
                  )
                })}
              </div>
            </DropdownMenuGroup>
          )
        }
        // Submenu: explicit "submenu" type OR children present.
        if (item.type === "submenu" || (item.children && item.children.length > 0 && item.type !== "group")) {
          return (
            <DropdownMenuSub key={key}>
              <DropdownMenuSubTrigger
                inset={item.inset}
                disabled={item.disabled}
                className="min-w-0 max-w-full"
                title={item.title ?? item.label}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[2000] w-max min-w-[10rem] max-w-[15rem]">
                <MenuItems items={item.children ?? []} runItem={runItem} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        }
        if (item.type === "group") {
          return (
            <DropdownMenuGroup key={key}>
              <MenuItems items={item.children ?? []} runItem={runItem} />
            </DropdownMenuGroup>
          )
        }
        if (item.type === "checkbox") {
          const checked = !!item.checked
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={checked}
              disabled={item.disabled}
              data-testid={item.testId}
              onSelect={(e) => {
                if (item.disabled) {
                  e.preventDefault()
                  return
                }
                // Radix toggles internally; reflect via onCheckedChange.
                item.onCheckedChange?.(!checked)
                if (item.keepOpen) {
                  e.preventDefault()
                  return
                }
                // Default: close menu.
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuCheckboxItem>
          )
        }
        if (item.type === "radio" && item.radioGroup) {
          // Rendered inline below as part of a single RadioGroup block.
          return null
        }
        // Default item
        return (
          <DropdownMenuItem
            key={key}
            inset={item.inset}
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : "default"}
            data-testid={item.testId}
            title={item.title ?? item.label}
            onSelect={(e) => {
              if (item.disabled) {
                e.preventDefault()
                return
              }
              // keepOpen prevents the menu from closing after select.
              // confirm items delegate to a provider-level dialog; the menu
              // may close naturally because the dialog renders independently.
              if (item.keepOpen) {
                e.preventDefault()
              }
              runItem(item)
            }}
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        )
      })}

      {/* Render radio groups as a single block each, in encounter order. */}
      {Array.from(radioGroups.entries()).map(([group, cfg]) => {
        const groupItems = normalized.filter((it) => it.type === "radio" && it.radioGroup === group)
        if (groupItems.length === 0) return null
        return (
          <DropdownMenuRadioGroup
            key={`radio-${group}`}
            value={cfg.value}
            onValueChange={(v) => void cfg.onRadioChange?.(v)}
          >
            {groupItems.map((it, idx) => (
              <DropdownMenuRadioItem
                key={it.id ?? `radio-${group}-${idx}`}
                value={it.value ?? ""}
                disabled={it.disabled}
                data-testid={it.testId}
                onSelect={(e) => {
                  if (it.disabled) {
                    e.preventDefault()
                    return
                  }
                  // onRadioChange handled by onValueChange above.
                  if (it.keepOpen) e.preventDefault()
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )
      })}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isEditableTarget(target: HTMLElement): boolean {
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  const role = target.getAttribute("role")
  if (role === "textbox") return true
  return false
}

function shouldDeferToTldrawContextMenu(path: EventTarget[]): boolean {
  for (const el of path) {
    if (!(el instanceof HTMLElement)) continue
    const scope = el.dataset.contextMenu
    if (scope && scope !== "workspace-canvas") return false
    if (el.classList.contains("tl-container")) return true
  }
  return false
}

function normalizeItems(items: ContextMenuItemDef[]): ContextMenuItemDef[] {
  // Drop hidden items.
  const visible = items.filter((item) => !item.hidden)
  // Collapse consecutive separators.
  const out: ContextMenuItemDef[] = []
  for (const item of visible) {
    const isSep = item.type === "separator"
    if (isSep && out.length > 0 && out[out.length - 1].type === "separator") continue
    out.push(item)
  }
  // Trim leading / trailing separators.
  while (out.length > 0 && out[0].type === "separator") out.shift()
  while (out.length > 0 && out[out.length - 1].type === "separator") out.pop()
  return out
}
