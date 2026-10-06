// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import type { NodeCapabilityId, NodeHostApi } from "@xiranite/contract"

import {
  approveFrontendPluginCapabilities,
  frontendPluginApproval,
  reloadFrontendPluginApprovals,
  resetFrontendPluginApprovals,
  revokeFrontendPluginApproval,
  subscribeFrontendPluginApprovals,
} from "./frontendGrants"
import { GRANTABLE_FRONTEND_CAPABILITIES, projectHostForFrontendPlugin, resolveFrontendHostAccess } from "./frontendHost"
import type { FrontendPluginSpec } from "./frontendRuntime"

const GRANTS_KEY = "xiranite.frontendPluginApprovals"

function spec(overrides: Partial<FrontendPluginSpec> = {}): FrontendPluginSpec {
  return {
    id: "com.example.grants",
    entry: "http://127.0.0.1:4173/mf-manifest.json",
    entryType: "module",
    ...overrides,
  }
}

function makeHost(): NodeHostApi {
  const ids: NodeCapabilityId[] = [
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
  return {
    ...Object.fromEntries(ids.map((id) => [id, { id, marker: Symbol(id) }])),
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ids,
      hasCapability: () => true,
    },
  } as unknown as NodeHostApi
}

beforeEach(() => {
  resetFrontendPluginApprovals()
})

describe("approveFrontendPluginCapabilities", () => {
  test("the decision is the intersection, not the request", () => {
    const approval = approveFrontendPluginCapabilities("com.example.grants", ["state", "runner", "config"])

    expect(approval.granted).toEqual(["state", "config"])
    expect(approval.refused).toEqual(["runner"])
    // Vocabulary order, not declaration order: `runner` sits before `config` in the capability list,
    // which is exactly why the stored form is normalised — the same set must read identically forever.
    expect(approval.declared).toEqual(["state", "runner", "config"])
  })

  test("a spelling the host has no vocabulary for is refused verbatim", () => {
    // It must not be dropped and it must not be granted: "no such capability" is the answer the author
    // needs, and folding it away would make a typo look like a silent success.
    const approval = approveFrontendPluginCapabilities("com.example.grants", ["frobnicate" as NodeCapabilityId])

    expect(approval.granted).toEqual([])
    expect(approval.refused).toEqual(["frobnicate"])
  })

  test("the same set reports identically whatever order it was written in", () => {
    const a = approveFrontendPluginCapabilities("com.example.a", ["clipboard", "runner", "state", "env"])
    const b = approveFrontendPluginCapabilities("com.example.b", ["env", "state", "runner", "clipboard"])

    expect(a.granted).toEqual(b.granted)
    expect(a.refused).toEqual(b.refused)
  })

  test("nothing in the ceiling is granted by the act of declaring it", () => {
    // The old semantics: this assertion is the whole reason the artifact exists.
    approveFrontendPluginCapabilities("com.example.grants", ["state"])
    expect(GRANTABLE_FRONTEND_CAPABILITIES).toContain("state")

    const declaredOnly = resolveFrontendHostAccess(spec({ id: "com.example.other", capabilities: ["state"] }))
    expect(declaredOnly.granted).toEqual(["contract"])
    expect(declaredOnly.unapproved).toEqual(["state"])
  })
})

describe("resolveFrontendHostAccess against the recorded decision", () => {
  test("an approved declaration reaches the projection", () => {
    const plugin = spec({ capabilities: ["state", "config"] })
    approveFrontendPluginCapabilities(plugin.id, plugin.capabilities ?? [])

    const access = resolveFrontendHostAccess(plugin)
    expect(access.granted).toEqual(["contract", "state", "config"])
    expect(access.unapproved).toEqual([])
  })

  test("a declaration that grew after the approval is unapproved, not honoured", () => {
    const plugin = spec({ capabilities: ["state"] })
    approveFrontendPluginCapabilities(plugin.id, ["state"])

    // The update path: the plugin now asks for more than the host ever decided.
    const grown = { ...plugin, capabilities: ["state", "config"] as NodeCapabilityId[] }
    const access = resolveFrontendHostAccess(grown)
    expect(access.granted).toEqual(["contract", "state"])
    expect(access.unapproved).toEqual(["config"])
  })

  test("revoking takes namespaces away without uninstalling", () => {
    // This is what the spec field could never express: rewriting the declaration looked like the
    // plugin had never asked. Here the record and contributions stay; the grant disappears.
    const host = makeHost()
    const plugin = spec({ capabilities: ["state", "workspace"] })
    approveFrontendPluginCapabilities(plugin.id, plugin.capabilities ?? [])

    const before = projectHostForFrontendPlugin(host, plugin)
    expect("state" in before).toBe(true)

    expect(revokeFrontendPluginApproval(plugin.id)).toBe(true)

    const after = projectHostForFrontendPlugin(host, plugin)
    expect("state" in after).toBe(false)
    expect("workspace" in after).toBe(false)
    expect(after.contract.hasCapability("state")).toBe(false)
    // The fallback is `contract` alone, which is also the proof the memo key follows the decision:
    // a stale cached projection would still hand back `state`.
    expect(Object.keys(after)).toEqual(["contract"])
  })

  test("trust=internal bypasses the approval store, and only it does", () => {
    const trusted = resolveFrontendHostAccess(spec({ trust: "internal", capabilities: ["state"] }))
    expect(trusted.granted.length).toBeGreaterThan(1)
    expect(trusted.unapproved).toEqual([])

    const thirdParty = resolveFrontendHostAccess(spec({ capabilities: ["state"] }))
    expect(thirdParty.granted).toEqual(["contract"])
  })

  test("subscribers hear approval and revocation", () => {
    let hits = 0
    const unsubscribe = subscribeFrontendPluginApprovals(() => {
      hits += 1
    })

    approveFrontendPluginCapabilities("com.example.grants", ["state"])
    revokeFrontendPluginApproval("com.example.grants")
    unsubscribe()
    approveFrontendPluginCapabilities("com.example.grants", ["state"])

    expect(hits).toBe(2)
  })
})

describe("persistence", () => {
  test("a decision survives a reload", () => {
    approveFrontendPluginCapabilities("com.example.grants", ["state"])

    reloadFrontendPluginApprovals()

    expect(frontendPluginApproval("com.example.grants")?.granted).toEqual(["state"])
  })

  test("a stored grant outside today's ceiling is dropped, while a valid neighbour survives", () => {
    // Positive control in the same blob: if the reader simply rejected everything, the test above
    // would pass for the wrong reason. `runner` is the item a widened-then-narrowed ceiling leaves behind.
    globalThis.localStorage.setItem(
      GRANTS_KEY,
      JSON.stringify([
        { pluginId: "com.example.ok", declared: ["state"], granted: ["state"], refused: [], decidedAt: "2026-10-05T00:00:00.000Z" },
        { pluginId: "com.example.stale", declared: ["runner"], granted: ["runner"], refused: [], decidedAt: "2026-10-05T00:00:00.000Z" },
      ]),
    )

    reloadFrontendPluginApprovals()

    expect(frontendPluginApproval("com.example.ok")?.granted).toEqual(["state"])
    expect(frontendPluginApproval("com.example.stale")).toBeUndefined()
    expect(resolveFrontendHostAccess(spec({ id: "com.example.stale", capabilities: ["runner"] })).granted).toEqual(["contract"])
  })

  test("approving does not erase a decision an earlier session wrote", () => {
    // The lost-update this pins, measured live first: a page that approves without having read the
    // store persisted a map containing only its own entry.
    globalThis.localStorage.setItem(
      GRANTS_KEY,
      JSON.stringify([
        { pluginId: "a.one", declared: ["state"], granted: ["state"], refused: [], decidedAt: "2026-10-05T00:00:00.000Z" },
      ]),
    )

    approveFrontendPluginCapabilities("a.two", ["env"])

    expect(frontendPluginApproval("a.two")?.granted).toEqual(["env"])
    expect(frontendPluginApproval("a.one")?.granted).toEqual(["state"])
    expect(JSON.parse(globalThis.localStorage.getItem(GRANTS_KEY) ?? "[]").length).toBe(2)
  })

  test("a torn blob reads as no approvals rather than throwing", () => {
    globalThis.localStorage.setItem(GRANTS_KEY, "{ this is not json")

    reloadFrontendPluginApprovals()

    expect(frontendPluginApproval("com.example.grants")).toBeUndefined()
  })
})
