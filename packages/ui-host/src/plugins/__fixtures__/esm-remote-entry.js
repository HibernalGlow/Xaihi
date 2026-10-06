/**
 * A hand-written Module Federation remote entry, used only by the runtime tests.
 *
 * Shape is the one the runtime expects from an ESM remote and the one measured in the WKWebView probe
 * (`docs/plugin-architecture.md` §14: importing a remote entry yields `keys=get,init`): the module
 * exports `init` and `get`. Nothing here is Xiranite's own loader — this is the *other side* of the
 * real `@module-federation/runtime` call path, so the test exercises registration → snapshot → load
 * rather than a stubbed seam.
 *
 * It counts its own calls so "fetched once" and "fetched twice" are observable instead of inferred
 * from the absence of an error.
 */

let initCount = 0
const requested = []

export function init() {
  initCount += 1
  return Promise.resolve()
}

export function get(module) {
  requested.push(module)
  // The container contract: `get` resolves to a **factory**, and the runtime calls it to obtain the
  // module namespace (measured here — returning the namespace directly dies with
  // `moduleFactory is not a function` in runtime-core's `module/index.ts`).
  return Promise.resolve(() => ({
    default: { marker: `fixture:${module}`, timesAskedForThisModule: requested.filter((name) => name === module).length },
  }))
}

export function stats() {
  return { initCount, requested: [...requested] }
}
