import { describe, expect, test } from "vitest"

import {
  classifyPluginArtifacts,
  describePinCoverage,
  enumeratePluginArtifacts,
  isResourceOriginAllowed,
} from "./pinCoverage.js"

const entry = "https://plugins.example.com/mf-manifest.json"
const lazy = "https://plugins.example.com/assets/lazy-note-x.js"
const meta = {
  metaData: { remoteEntry: { name: "remoteEntry.js", path: "", type: "module" } },
  exposes: [
    {
      name: "entry",
      assets: { js: { sync: ["assets/entry.js"], async: [] }, css: { sync: [], async: [] } },
    },
    {
      name: "panel",
      assets: { js: { sync: ["assets/panel.js"], async: [lazy.slice("https://plugins.example.com/".length)] }, css: { sync: ["assets/panel.css"], async: [] } },
    },
  ],
  shared: [],
}

describe("classifyPluginArtifacts", () => {
  test("resolves siblings against the entry directory and classifies by measured reachability", () => {
    const urls = enumeratePluginArtifacts(entry, meta)

    expect(urls).toEqual([
      entry,
      "https://plugins.example.com/remoteEntry.js",
      "https://plugins.example.com/assets/entry.js",
      "https://plugins.example.com/assets/panel.js",
      lazy,
      "https://plugins.example.com/assets/panel.css",
    ])
  })

  test("only JS the runtime itself fetches is enforceable", () => {
    const byUrl = new Map(classifyPluginArtifacts(entry, meta).map((artifact) => [artifact.url, artifact.enforceable]))

    expect(byUrl.get(entry)).toBe(true)
    expect(byUrl.get("https://plugins.example.com/assets/panel.js")).toBe(true)
    // Both of these were measured running unimpeded after their bytes were changed server-side, even
    // though each carried a valid pin: `docs/plugin-architecture.md` §14.
    expect(byUrl.get(lazy)).toBe(false)
    expect(byUrl.get("https://plugins.example.com/assets/panel.css")).toBe(false)
  })

  test("an unparsable entry yields the entry alone rather than an invented denominator", () => {
    expect(classifyPluginArtifacts("not-a-url", meta)).toEqual([{ url: "not-a-url", enforceable: true }])
    expect(enumeratePluginArtifacts(entry, null)).toEqual([entry])
  })
})

describe("describePinCoverage", () => {
  const pin = (letter: string) => `sha384-${letter.repeat(64)}`

  test("causes are grouped in the order the loader notices them", () => {
    const coverage = describePinCoverage({
      integrity: {
        [entry]: pin("A"),
        "https://plugins.example.com/assets/gone.js": pin("B"),
        "https://other.example/x.js": pin("C"),
        [lazy]: pin("D"),
      },
      allowedOrigins: ["https://plugins.example.com"],
      artifacts: classifyPluginArtifacts(entry, meta),
    })

    expect(coverage.ineffectivePins).toEqual([
      { url: "https://other.example/x.js", reason: "origin-not-allowed" },
      { url: lazy, reason: "not-fetched-by-runtime" },
      { url: "https://plugins.example.com/assets/gone.js", reason: "no-such-artifact" },
    ])
    // Four of the six artifacts are enforceable and only the entry carries a pin, so the other three are
    // the honest "these bytes go in unchecked" list — the number a distributor has to act on.
    expect(coverage.unpinnedArtifacts).toEqual([
      "https://plugins.example.com/remoteEntry.js",
      "https://plugins.example.com/assets/entry.js",
      "https://plugins.example.com/assets/panel.js",
    ])
    expect(coverage.enforceableArtifactCount).toBe(4)
    // A pin can satisfy more than one cause and is reported once, under the first.
    expect(coverage.ineffectivePins.filter((pin) => pin.url === "https://other.example/x.js")).toHaveLength(1)
  })

  test("a pin that cannot be consulted is still listed when the allowlist would have refused it first", () => {
    const coverage = describePinCoverage({
      integrity: { [lazy]: pin("A") },
      allowedOrigins: ["https://elsewhere.example"],
      artifacts: classifyPluginArtifacts(entry, meta),
    })

    expect(coverage.ineffectivePins).toEqual([{ url: lazy, reason: "origin-not-allowed" }])
    expect(coverage.unreachablePins).toEqual([lazy])
  })

  test("without an enumeration only the origin cause is claimed", () => {
    const coverage = describePinCoverage({
      integrity: { "https://other.example/x.js": pin("A"), "https://plugins.example.com/whatever.js": pin("B") },
      allowedOrigins: ["https://plugins.example.com"],
      artifacts: undefined,
    })

    expect(coverage.enumerated).toBe(false)
    expect(coverage.ineffectivePins).toEqual([{ url: "https://other.example/x.js", reason: "origin-not-allowed" }])
    expect(coverage.pinsMatchingNothing).toEqual([])
    expect(coverage.unenforceableArtifacts).toEqual([])
  })

  test("an empty allowlist restricts nothing and a malformed key is refused", () => {
    expect(isResourceOriginAllowed([], entry)).toBe(true)
    expect(isResourceOriginAllowed(["https://plugins.example.com"], "not a url")).toBe(false)
    expect(isResourceOriginAllowed(["https://plugins.example.com"], entry)).toBe(true)
  })
})
