import { useDrag } from '@use-gesture/react'

/** Shared press/drag lifecycle. The gesture engine owns capture, touch and cancellation. */
export function usePressDrag(onDrag: (gesture: {
  first: boolean; last: boolean; canceled: boolean; cancel(): void
  initial: [number, number]; xy: [number, number]
}) => void) {
  return useDrag(({ first, last, canceled, tap, initial, xy, event, cancel }) => {
    if (tap) return
    // Native cancellation ends the stream without use-gesture's explicit cancel() flag.
    onDrag({ first, last, canceled: canceled || event.type === 'pointercancel' || event.type === 'touchcancel', initial, xy, cancel })
  }, {
    delay: 180,
    threshold: 12,
    filterTaps: true,
    pointer: { capture: true },
    // Keep both axes available: a gesture can enter and leave child choices.
    preventDefault: true,
  })
}
