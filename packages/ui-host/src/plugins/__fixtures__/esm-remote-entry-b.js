/**
 * A second hand-written Module Federation remote entry, used only to prove a *source swap*.
 *
 * Byte-identical in shape to `esm-remote-entry.js` except for the marker prefix: two URLs whose
 * contents differ in a readable way is the minimum apparatus for asking "after an update re-registers
 * this id with a new entry URL, does `loadRemote` actually hand back the new source, or does the
 * runtime's module cache keep serving the old one?" A query-string variant of one fixture cannot ask
 * that, because both sides would print the same marker.
 *
 * See `frontendRuntime.swap.browser.test.ts` for the assertion this file exists for.
 */

let initCount = 0
const requested = []

export function init() {
  initCount += 1
  return Promise.resolve()
}

export function get(module) {
  requested.push(module)
  return Promise.resolve(() => ({
    default: { marker: `fixture-b:${module}`, timesAskedForThisModule: requested.filter((name) => name === module).length },
  }))
}

export function stats() {
  return { initCount, requested: [...requested] }
}
