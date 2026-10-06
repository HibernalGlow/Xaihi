// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import type { NodeCapabilityId, NodeHostApi } from "@xiranite/contract"

import {
  GRANTABLE_FRONTEND_CAPABILITIES,
  projectHostForFrontendPlugin,
  resolveFrontendHostAccess,
  type XiraniteFrontendHost,
} from "./frontendHost"
import { approveFrontendPluginCapabilities, resetFrontendPluginApprovals } from "./frontendGrants"
import type { FrontendPluginSpec } from "./frontendRuntime"

const ALL_IDS: readonly NodeCapabilityId[] = [
  "contract",
  "state",
  "workspace",
  "runner",
  "clipboard",
  "downloads",
  "localFiles",
  "config",
  "env",
]

function makeHost(): NodeHostApi {
  const namespaces = Object.fromEntries(
    ALL_IDS.map((id) => [id, { id, marker: Symbol(id) }]),
  ) as Record<NodeCapabilityId, unknown>
  return {
    ...namespaces,
    // The deprecated top-level aliases an internal node may still use (§10.2 第 2 条): present here so
    // a leak would be caught rather than assumed absent.
    getData: () => undefined,
    patchData: () => {},
    listComponents: () => [],
    actions: {},
    downloadText: () => {},
  } as unknown as NodeHostApi
}

function spec(overrides: Partial<FrontendPluginSpec> = {}): FrontendPluginSpec {
  return {
    id: "com.example.test",
    entry: "http://127.0.0.1:4173/mf-manifest.json",
    entryType: "module",
    ...overrides,
  }
}

/**
 * Records the 授权 step for a declaration, so the tests below say what a *granted* plugin gets.
 *
 * This file used to run in the node realm because nothing here touched storage; the approval artifact
 * persists like the install records do, so it is happy-dom now, exactly like its store-touching
 * neighbours. Not calling `approve` is the new default-deny case: an in-ceiling `capabilities` entry no
 * longer grants itself (§10.1 第 3 条).
 */
function approve(plugin: FrontendPluginSpec): FrontendPluginSpec {
  approveFrontendPluginCapabilities(plugin.id, plugin.capabilities ?? [])
  return plugin
}

beforeEach(() => {
  resetFrontendPluginApprovals()
})

describe("resolveFrontendHostAccess", () => {
  test("grants nothing by default — 'not asked yet' must not become 'everything'", () => {
    const access = resolveFrontendHostAccess(spec())
    expect(access.granted).toEqual(["contract"])
    expect(access.trusted).toBe(false)
  })

  test("refuses declarations outside the ceiling instead of treating a declaration as a grant", () => {
    const access = resolveFrontendHostAccess(
      approve(spec({ capabilities: ["runner", "clipboard", "localFiles", "downloads"] })),
    )
    expect(access.granted).toEqual(["contract"])
    expect(access.refused).toEqual(["runner", "clipboard", "downloads", "localFiles"])
  })

  test("the ceiling itself excludes every namespace that reaches a whole-host surface", () => {
    // A falsification control for the two tests above: if someone widens the ceiling to the whole
    // vocabulary, the refusals above stop being evidence of anything.
    expect(GRANTABLE_FRONTEND_CAPABILITIES).not.toContain("runner")
    expect(GRANTABLE_FRONTEND_CAPABILITIES).not.toContain("localFiles")
    expect(GRANTABLE_FRONTEND_CAPABILITIES).not.toContain("clipboard")
    expect(GRANTABLE_FRONTEND_CAPABILITIES.length).toBeLessThan(ALL_IDS.length)
  })

  test("reports the same grant for the same set regardless of declaration order", () => {
    const a = resolveFrontendHostAccess(approve(spec({ capabilities: ["env", "state", "config"] })))
    const b = resolveFrontendHostAccess(approve(spec({ capabilities: ["config", "state", "env"] })))
    expect(a.granted).toEqual(b.granted)

    const refusedA = resolveFrontendHostAccess(approve(spec({ capabilities: ["runner", "clipboard"] })))
    const refusedB = resolveFrontendHostAccess(approve(spec({ capabilities: ["clipboard", "runner"] })))
    expect(refusedA.refused).toEqual(refusedB.refused)
    expect(refusedA.granted).toEqual(refusedB.granted)
  })

  test("trust=internal is the built-in-node case and gets the whole vocabulary", () => {
    const access = resolveFrontendHostAccess(spec({ trust: "internal" }))
    expect(access.trusted).toBe(true)
    expect(access.granted).toEqual(ALL_IDS)
  })
})

describe("projectHostForFrontendPlugin", () => {
  test("a plugin with no grant can see the contract and nothing else", () => {
    const host = makeHost()
    const projected = projectHostForFrontendPlugin(host, spec()) as XiraniteFrontendHost
    expect(projected.contract.supportedCapabilities).toEqual(["contract"])
    expect(projected.state).toBeUndefined()
    expect(projected.runner).toBeUndefined()
    expect("state" in projected).toBe(false)
  })

  test("every namespace answers hasCapability exactly as the projection provides it — no lying either way", () => {
    const host = makeHost()
    const projected = projectHostForFrontendPlugin(
      host,
      approve(spec({ capabilities: ["state", "config", "nonsense" as NodeCapabilityId] })),
    ) as XiraniteFrontendHost

    for (const id of ALL_IDS) {
      const present = id in projected
      expect([id, present, projected.contract.hasCapability(id)]).toEqual([
        id,
        projected.contract.supportedCapabilities.includes(id),
        projected.contract.hasCapability(id),
      ])
    }
    expect(projected.contract.hasCapability("runner")).toBe(false)
    expect(projected.config).toBe(host.config)
  })

  test("the deprecated aliases never cross the boundary", () => {
    const projected = projectHostForFrontendPlugin(makeHost(), approve(spec({ capabilities: ["state"] })))
    expect("getData" in projected).toBe(false)
    expect("actions" in projected).toBe(false)
    expect("downloadText" in projected).toBe(false)
  })

  test("granted namespaces are the host's own objects, not copies", () => {
    const host = makeHost()
    const projected = projectHostForFrontendPlugin(
      host,
      approve(spec({ capabilities: ["state", "workspace", "env"] })),
    ) as XiraniteFrontendHost
    expect(projected.state).toBe(host.state)
    expect(projected.workspace).toBe(host.workspace)
    expect(projected.env).toBe(host.env)
  })

  test("trusted and unbound modules keep the host object itself (same identity, same memoisation)", () => {
    const host = makeHost()
    expect(projectHostForFrontendPlugin(host, spec({ trust: "internal" }))).toBe(host)
    expect(projectHostForFrontendPlugin(host, undefined)).toBe(host)
  })

  test("projection is stable per host, and a new host instance produces a new projection", () => {
    const host = makeHost()
    const plugin = approve(spec({ capabilities: ["state"] }))
    const first = projectHostForFrontendPlugin(host, plugin)
    expect(projectHostForFrontendPlugin(host, approve(spec({ capabilities: ["state"] })))).toBe(first)

    // §10.2 第 3 条: the host changes identity with the theme, and the projection has to follow it —
    // a stale cached projection would pin the old theme.
    const replacement = makeHost()
    expect(projectHostForFrontendPlugin(replacement, plugin)).not.toBe(first)
    expect((projectHostForFrontendPlugin(replacement, plugin) as XiraniteFrontendHost).state).toBe(
      replacement.state,
    )
  })

  test("the projection is frozen", () => {
    const projected = projectHostForFrontendPlugin(makeHost(), approve(spec({ capabilities: ["state"] })))
    expect(Object.isFrozen(projected)).toBe(true)
  })
})
