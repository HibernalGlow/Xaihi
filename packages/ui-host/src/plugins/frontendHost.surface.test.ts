// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import type { NodeHostApi } from "@xiranite/contract"

import type { ComponentContribution, PluginComponentProps, PluginHostSurface } from "../../packages/plugin-sdk/src/index"
import type { FrontendContribution } from "./contributions"
import { projectHostForFrontendPlugin, resolveFrontendHostAccess } from "./frontendHost"
import { approveFrontendPluginCapabilities, resetFrontendPluginApprovals } from "./frontendGrants"
import type { XiraniteFrontendHost } from "./frontendHost"
import type { FrontendPluginSpec } from "./frontendRuntime"

/** The store is module-level like the install records, so each test must start from no approvals. */
beforeEach(() => {
  resetFrontendPluginApprovals()
})

/** The projection honours the approval artifact, so these agreement tests must approve before they project. */
function approve(plugin: FrontendPluginSpec): FrontendPluginSpec {
  approveFrontendPluginCapabilities(plugin.id, plugin.capabilities ?? [])
  return plugin
}

/**
 * The projection has two declarations of the same rule: `XiraniteFrontendHost` here (what the host
 * actually builds) and `PluginHostSurface` in `@xiranite/plugin-sdk` (what an out-of-repo author is
 * told they receive). Today they are the same construction; nothing kept them that way, and this file
 * is the thing that does — §10.3 第 3 条 is exactly this rule, and §11 already records two places where
 * a promise and a projection disagreed.
 *
 * The import is a relative path on purpose: the app must not add a runtime dependency on the SDK (the
 * host is not a plugin), and this only ever needs the types. It compiles into a test file, nothing into
 * the shipped bundle.
 */

type Assignability<From, To> = From extends To ? true : false

/** Compile-time drift check: both directions, or the two names mean different things. */
const hostImplementsSdkPromise: Assignability<XiraniteFrontendHost, PluginHostSurface> = true
const sdkPromiseIsNoWiderThanHost: Assignability<PluginHostSurface, XiraniteFrontendHost> = true

/**
 * The same discipline applied to contribution descriptors (§2.1's `[[contributions]]` rows).
 *
 * The first line flips if an SDK-declared contribution stops being something the host accepts; the
 * second is a compile error the moment the host drops the per-row expose it started consuming in
 * `4d71b252`. An SDK-only *addition* is not caught here — the host's validator refuses unknown fields
 * at install time, which is the right place for that direction.
 */
const sdkContributionIsHostCompatible: Assignability<ComponentContribution, FrontendContribution> = true
const hostContributionCarriesExpose: Assignability<FrontendContribution["module"], string | undefined> = true

function fullHost(overrides: Partial<Record<string, unknown>> = {}): NodeHostApi {
  return {
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "workspace", "config", "env", "runner", "clipboard", "downloads", "localFiles"],
      hasCapability: () => true,
    },
    state: { getData: () => ({}), patchData: () => undefined },
    workspace: { id: "ws" },
    config: { get: async () => ({ config: undefined, path: "x" }), save: async () => {} },
    env: { theme: "dark", platform: "web" },
    runner: { run: async () => undefined },
    clipboard: {},
    downloads: {},
    localFiles: {},
    ...overrides,
  } as unknown as NodeHostApi
}

function projectionKeys(host: NodeHostApi, spec: FrontendPluginSpec): string[] {
  // The helper is itself a projection call, so the approval has to be recorded before it reads.
  return Object.keys(projectHostForFrontendPlugin(host, approve(spec))).sort()
}

describe("the projection and the published SDK surface agree", () => {
  test("the type assertions above are the gate; this test keeps the file honest at runtime", () => {
    expect(hostImplementsSdkPromise).toBe(true)
    expect(sdkPromiseIsNoWiderThanHost).toBe(true)
  })

  test("the projected object carries exactly the granted namespaces, and nothing else", () => {
    const host = fullHost()
    const spec: FrontendPluginSpec = {
      id: "com.example.projection",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
      capabilities: ["state", "env"],
    }

    // Key *set* equality, not "these are defined": `runner: undefined` would pass a truthiness probe
    // and still be a namespace the plugin never got (§2.4: ungranted namespaces are absent, not stubs).
    expect(projectionKeys(host, spec)).toEqual(["contract", "env", "state"])

    const projection = projectHostForFrontendPlugin(host, approve(spec))
    expect("runner" in projection).toBe(false)
    expect("clipboard" in projection).toBe(false)
    expect("downloads" in projection).toBe(false)
    expect("localFiles" in projection).toBe(false)
    expect("workspace" in projection).toBe(false)
    expect("config" in projection).toBe(false)
  })

  test("a spec that declares nothing gets the contract namespace alone", () => {
    expect(projectionKeys(fullHost(), {
      id: "com.example.bare",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
    })).toEqual(["contract"])
  })

  test("contract.supportedCapabilities reports the grant, and is frozen so a plugin cannot rewrite it", () => {
    const host = fullHost()
    const spec: FrontendPluginSpec = {
      id: "com.example.readback",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
      capabilities: ["state", "runner", "env"],
    }
    const projection = projectHostForFrontendPlugin(host, approve(spec))

    // `runner` is declared but outside the ceiling: it must not appear in what the plugin is told exists.
    expect(projection.contract.supportedCapabilities).toEqual(["contract", "state", "env"])
    expect(resolveFrontendHostAccess(approve(spec)).refused).toEqual(["runner"])
    expect(projection.contract.hasCapability("runner")).toBe(false)

    expect(Object.isFrozen(projection)).toBe(true)
    expect(() => {
      (projection as { state?: unknown }).state = undefined
    }).toThrow()
  })

  test("the props a plugin component is written against are what the renderer passes", () => {
    // `PluginComponentProps` is the author-facing promise; the host passes this object at
    // `ModuleRenderer`. If either side renames `compId` or hands a wider host, this stops compiling.
    const host = fullHost()
    const spec: FrontendPluginSpec = {
      id: "com.example.props",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
      capabilities: ["state"],
    }
    const props: PluginComponentProps = { compId: "plugin-host", host: projectHostForFrontendPlugin(host, approve(spec)) }
    expect(Object.keys(props).sort()).toEqual(["compId", "host"])
    expect(props.host.contract.name).toBe("xiranite.node-host")
  })
})

describe("the published contribution type and the host's stay in step", () => {
  test("the compile-time assertions above are the real gate", () => {
    // This runtime line exists only so the two consts above are read; the evidence is that the file
    // fails to typecheck when either flips.
    expect([sdkContributionIsHostCompatible, hostContributionCarriesExpose]).toEqual([true, true])
  })
})
