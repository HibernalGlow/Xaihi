// @vitest-environment node
import { describe, expect, test } from "vitest"

import { urlInstallAllowed } from "./pluginRegistry"

/**
 * The gate that keeps `src/entrypoints/plugin-host.html` — which ships as a production build input —
 * from turning a query string into "load this remote in the host's realm".
 */
describe("urlInstallAllowed", () => {
  test("a dev build may install from a URL", () => {
    expect(urlInstallAllowed({ DEV: true })).toBe(true)
  })

  test("a production build may not", () => {
    expect(urlInstallAllowed({ DEV: false })).toBe(false)
  })

  test("an environment that does not say is treated as production", () => {
    // Default-deny: a missing flag must not open the install path. (The no-argument call reads the
    // real build's env, which Vitest sets to DEV=true, so it is deliberately not asserted here.)
    expect(urlInstallAllowed({})).toBe(false)
  })
})
