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
import { useCallback, useLayoutEffect, useRef, useState, type Ref } from "react"

export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

export function useControllableState<T>(options: {
  value: T | undefined
  defaultValue: T
  onChange?: (value: T) => void
}) {
  const [uncontrolled, setUncontrolled] = useState(options.defaultValue)
  const isControlled = options.value !== undefined
  const value = isControlled ? (options.value as T) : uncontrolled
  const onChange = useLatest(options.onChange)

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next)
      if (!Object.is(next, value)) onChange.current?.(next)
    },
    [isControlled, value, onChange]
  )

  return [value, setValue] as const
}

export function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    const cleanups = refs.map((ref) => {
      if (typeof ref === "function") return ref(node)
      if (ref) ref.current = node
      return undefined
    })
    return () => {
      cleanups.forEach((cleanup, index) => {
        const ref = refs[index]
        if (typeof cleanup === "function") cleanup()
        else if (typeof ref === "function") ref(null)
        else if (ref) ref.current = null
      })
    }
  }
}

/** A stable callback ref that sets both refs. */
export function useComposedRefs<T>(
  a: Ref<T> | undefined,
  b: Ref<T> | undefined
) {
  return useCallback((node: T | null) => composeRefs(a, b)(node), [a, b])
}

/**
 * Calls the user handler. Returns true when the user prevented the default,
 * so the caller can skip its own handling.
 */
export function callHandler<E extends { defaultPrevented: boolean }>(
  handler: ((event: E) => void) | undefined,
  event: E
) {
  handler?.(event)
  return event.defaultPrevented
}

/** Calls the user handler first. The internal handler runs unless the user prevented it. */
export function composeHandlers<E extends { defaultPrevented: boolean }>(
  userHandler: ((event: E) => void) | undefined,
  ownHandler: (event: E) => void
) {
  return (event: E) => {
    userHandler?.(event)
    if (!event.defaultPrevented) ownHandler(event)
  }
}
