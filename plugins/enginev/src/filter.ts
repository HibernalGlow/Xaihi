// Wallpaper filtering: the pure pass over entries the host has already enumerated.
//
// `filterWallpapers` used to live only in `core.ts`, so the GUI had exactly one way to reuse that filter —
// value-import `@xiranite/node-enginev/core`, which puts a second execution host in the face process
// (ADR-0074 §5). One implementation, not one file: the implementation moved here, `core.ts` imports it and
// re-exports the same name, so the host's QuickJS bundle and `./core.js` consumers still resolve a single
// definition. Same shape as classf's `blacklist.ts`.
//
// `clean` and `normalizeTags` moved with it because this outlet must not value-import `./core.js` — one
// runtime edge back into core would drag the whole engine graph into the GUI chunk and make the subpath
// pointless. `core.ts` now imports them from here, which keeps the dependency one-directional.
//
// Nothing here may enumerate disk or take an `EngineVRuntime`: enumeration is the host service's job
// (`scanWorkshop` / `readWallpaperFolder` in `core.ts`), and faces get entries through `/operations`.
import type { EngineVFilterOptions, EngineVWallpaper } from "./core.ts"

export function filterWallpapers(wallpapers: EngineVWallpaper[], filters: EngineVFilterOptions): EngineVWallpaper[] {
  const title = clean(filters.title).toLowerCase()
  const contentRating = clean(filters.contentRating ?? filters.contentrating)
  const type = clean(filters.type)
  const ratingSex = clean(filters.ratingSex ?? filters.ratingsex)
  const ratingViolence = clean(filters.ratingViolence ?? filters.ratingviolence)
  const tags = normalizeTags(filters.tags)
  return wallpapers.filter((wallpaper) => {
    if (title && !wallpaper.title.toLowerCase().includes(title)) return false
    if (contentRating && wallpaper.contentRating !== contentRating) return false
    if (type && wallpaper.wallpaperType !== type) return false
    if (ratingSex && wallpaper.ratingSex !== ratingSex) return false
    if (ratingViolence && wallpaper.ratingViolence !== ratingViolence) return false
    if (tags.length && !tags.some((tag) => wallpaper.tags.includes(tag))) return false
    return true
  })
}

/** Trim a configured value and drop one layer of surrounding quotes, the form both faces send. */
export function clean(value = ""): string {
  return value.trim().replace(/^["']|["']$/g, "")
}

/** Accept either a tag array or one separator-delimited string, as the filter field and the CLI both do. */
export function normalizeTags(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map(clean).filter(Boolean)
  if (typeof value === "string") return value.split(/[,;\s]+/).map(clean).filter(Boolean)
  return []
}
