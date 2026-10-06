/**
 * Keep native <input type="range"> filled-rail progress in sync with the
 * shared slider skin tokens (--slider-progress used by index.css).
 *
 * NeoView still has many legacy range inputs (bottom bar, material, cards).
 * Bottom progress supports LTR/RTL via dir — CSS flips the fill gradient.
 * Radix Slider does not need this helper.
 */

function rangeProgressPercent(input: HTMLInputElement): number {
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const value = Number(input.value)
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || max === min) {
    return 0
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

/** Resolve whether the control reads right-to-left (NeoView page progress). */
export function resolveRangeDirection(input: HTMLInputElement): "ltr" | "rtl" {
  const explicit = input.getAttribute("dir") || input.dataset.sliderDirection
  if (explicit === "rtl" || explicit === "ltr") return explicit
  try {
    const computed = getComputedStyle(input).direction
    return computed === "rtl" ? "rtl" : "ltr"
  } catch {
    return "ltr"
  }
}

export function syncNativeRangeProgress(input: HTMLInputElement): void {
  if (input.type !== "range") return
  const direction = resolveRangeDirection(input)
  const progress = `${rangeProgressPercent(input)}%`

  // This function also runs from a MutationObserver that watches
  // data-slider-direction. Avoid writing identical values, otherwise every
  // observer delivery schedules another delivery indefinitely.
  if (input.dataset.sliderDirection !== direction) input.dataset.sliderDirection = direction
  if (input.style.getPropertyValue("--slider-progress") !== progress) {
    input.style.setProperty("--slider-progress", progress)
  }
  if (input.style.getPropertyValue("--slider-direction") !== direction) {
    input.style.setProperty("--slider-direction", direction)
  }
}

export function syncAllNativeRangeProgress(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(syncNativeRangeProgress)
}

/** Install document-level listeners once; returns disposer. */
export function installNativeRangeProgressSync(): () => void {
  if (typeof document === "undefined") return () => undefined

  const onInputLike = (event: Event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.type === "range") {
      syncNativeRangeProgress(target)
    }
  }

  const scan = () => syncAllNativeRangeProgress(document)

  document.addEventListener("input", onInputLike, true)
  document.addEventListener("change", onInputLike, true)

  // Cover React controlled updates that don't always re-fire input when props change.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLInputElement && mutation.target.type === "range") {
        syncNativeRangeProgress(mutation.target)
        continue
      }
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLInputElement && node.type === "range") {
            syncNativeRangeProgress(node)
            return
          }
          if (node instanceof Element) {
            node.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(syncNativeRangeProgress)
          }
        })
      }
    }
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["value", "min", "max", "dir", "data-slider-direction"],
  })

  scan()
  // One more pass after React paint for controlled ranges.
  const frame = window.requestAnimationFrame(scan)

  return () => {
    window.cancelAnimationFrame(frame)
    document.removeEventListener("input", onInputLike, true)
    document.removeEventListener("change", onInputLike, true)
    observer.disconnect()
  }
}
