/**
 * Resolve a design token to a concrete colour string that canvas and hex-parsing
 * code can consume.
 *
 * Some ported components (reactbits' BorderGlow, GlareHover, SloshGauge) do not
 * pass colours to CSS — they `parseInt(hex.slice(0, 2), 16)` them or assign them
 * to `ctx.fillStyle`. A `var(--token)` string breaks both paths, so those
 * components read their defaults through here instead.
 *
 * The value is resolved through a detached probe element so the browser does the
 * oklch / color-mix math, then rasterised once through a 1px canvas to get exact
 * sRGB bytes. Results are cached; the cache is dropped whenever the host writes a
 * skin attribute on `<html>`, because that is how the theme layer signals change.
 */

const cache = new Map<string, string>()
let observer: MutationObserver | undefined

function invalidate(): void {
  cache.clear()
}

export function resetThemeColourCache(): void {
  invalidate()
}

function ensureInvalidation(): void {
  if (observer || typeof MutationObserver === "undefined") return
  observer = new MutationObserver(invalidate)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-accent", "class", "style"],
  })
}

/** The computed colour for `var(name)`, e.g. `oklab(0.7 0.1 -0.05)`. */
function computeToken(name: string): string | undefined {
  const probe = document.createElement("span")
  probe.style.color = `var(${name})`
  probe.style.display = "none"
  document.body.append(probe)
  try {
    const value = getComputedStyle(probe).color
    return value && value !== "" ? value : undefined
  } finally {
    probe.remove()
  }
}

let raster: CanvasRenderingContext2D | undefined

function rasterise(value: string): string | undefined {
  if (typeof document === "undefined") return undefined
  if (!raster) {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    raster = canvas.getContext("2d", { willReadFrequently: true }) ?? undefined
  }
  if (!raster) return undefined

  raster.clearRect(0, 0, 1, 1)
  raster.fillStyle = value
  raster.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = raster.getImageData(0, 0, 1, 1).data
  if (a === 0) return undefined
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * A `#rrggbb` string for the token, or `fallback` when the token is not declared
 * or resolves to nothing. Never throws, so a component can call it during render.
 */
export function themeColourHex(token: string, fallback = "#ffffff"): string {
  if (typeof document === "undefined") return fallback
  ensureInvalidation()

  const hit = cache.get(token)
  if (hit) return hit

  // An undeclared `var(--x)` does not yield an empty computed colour — the probe
  // just inherits its own default — so the declaration itself has to be checked.
  const declared = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const resolved = declared ? computeToken(token) : undefined
  const value = (resolved && rasterise(resolved)) || fallback
  cache.set(token, value)
  return value
}
