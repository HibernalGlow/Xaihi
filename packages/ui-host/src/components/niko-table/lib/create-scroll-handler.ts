/** Upstream Niko Table scroll handler omitted from the published registry item. */
import type { ScrollEvent } from "../core/data-table-virtualized-structure"

export function createScrollHandler({
  onScroll,
  onScrolledTop,
  onScrolledBottom,
  scrollThreshold = 50,
}: {
  onScroll?: (event: ScrollEvent) => void
  onScrolledTop?: () => void
  onScrolledBottom?: () => void
  scrollThreshold?: number
}): (event: Event) => void {
  let prevAtTop = false
  let prevAtBottom = false

  return (event: Event) => {
    const element = event.currentTarget as HTMLDivElement | null
    if (!element) return

    const { scrollHeight, scrollTop, clientHeight } = element
    const isTop = scrollTop === 0
    const isBottom = scrollHeight - scrollTop - clientHeight < scrollThreshold
    const percentage =
      scrollHeight - clientHeight > 0
        ? (scrollTop / (scrollHeight - clientHeight)) * 100
        : 0

    onScroll?.({
      scrollTop,
      scrollHeight,
      clientHeight,
      isTop,
      isBottom,
      percentage,
    })

    if (isTop && !prevAtTop) onScrolledTop?.()
    if (isBottom && !prevAtBottom) onScrolledBottom?.()
    prevAtTop = isTop
    prevAtBottom = isBottom
  }
}
