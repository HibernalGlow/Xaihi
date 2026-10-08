import type { KisakiEntry, KisakiVideoOptimizerItem, KisakiVideoOptimizerMode } from "./core.js"

/** Builds an operation plan only from selected entries produced by the optimizer scan. */
export function createVideoOptimizationPlan(entries: readonly KisakiEntry[], selectedPaths: Iterable<string>, mode: KisakiVideoOptimizerMode): KisakiVideoOptimizerItem[] {
  const selected = new Set(selectedPaths)
  const items = new Map<string, KisakiVideoOptimizerItem>()
  for (const entry of entries) {
    if (!selected.has(entry.path) || !entry.codec) continue
    const cropRect = entry.videoCropRect
    if (mode === "crop" && !cropRect) continue
    items.set(entry.path, {
      path: entry.path,
      codec: entry.codec,
      ...(cropRect ? { cropRect: { ...cropRect } } : {}),
    })
  }
  return [...items.values()]
}
