// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

import { classifyPluginArtifacts, enumeratePluginArtifacts, type PluginArtifact } from "./frontendIntegrity"
import { previewFrontendPluginRecord } from "./pluginManifestInstall"

const entry = "https://plugins.example.com/mf-manifest.json"
const lazy = "https://plugins.example.com/assets/lazy-note-CVsYpTB_.js"
const css = "https://plugins.example.com/assets/panel-BRhDWC4u.css"
// Verbatim copy of a real build's metadata (`examples/plugins/frontend-only/dist/mf-manifest.json`),
// committed as a fixture so the shape under test is the shape Module Federation actually emits —
// hand-written JSON here would only prove my guess about it. It includes the one `async` entry the
// lazy-loading probe in the example plugin produced.
const metadata = JSON.parse(readFileSync(resolve(import.meta.dirname, "__fixtures__/mf-manifest.sample.json"), "utf8"))
const artifacts = classifyPluginArtifacts(entry, metadata)

describe("classifyPluginArtifacts", () => {
  test("the entry, the container file, and every chunk the metadata declares", () => {
    const urls = enumeratePluginArtifacts(entry, metadata)

    expect(urls).toContain(entry)
    expect(urls).toContain("https://plugins.example.com/remoteEntry.js")
    expect(urls).toContain(lazy)
    // Measured off the committed artifact: manifest + container + 7 JS sync chunks (shared across the
    // two exposes) + 1 async chunk + 1 stylesheet.
    expect(urls.length).toBe(12)
    expect(urls.filter((url) => !url.startsWith("https://plugins.example.com/"))).toEqual([])
  })

  test("only what the runtime itself fetches is marked enforceable", () => {
    const byUrl = new Map(artifacts.map((artifact) => [artifact.url, artifact.enforceable]))

    expect(artifacts.filter((artifact) => artifact.enforceable).length).toBe(10)
    // The stylesheet is in `css.sync`, i.e. the bucket a naive rule would call "preloaded, therefore
    // checked". Measured otherwise: the hook never sees it.
    const styles = artifacts.filter((artifact) => artifact.url.endsWith(".css"))
    expect(styles.length).toBeGreaterThan(0)
    expect(styles.every((artifact) => artifact.enforceable === false)).toBe(true)
    expect(byUrl.get(entry)).toBe(true)
    expect(byUrl.get("https://plugins.example.com/remoteEntry.js")).toBe(true)
    expect(byUrl.get("https://plugins.example.com/assets/vite-preload-helper-CWZBUsdZ.js")).toBe(true)
    // The async bucket: the container pulls it with a native import(), so a pin never gets consulted.
    // This is the measured negative result in §14, encoded as a shape the report cannot lose.
    expect(byUrl.get(lazy)).toBe(false)
    expect(artifacts.filter((artifact) => !artifact.enforceable).map((artifact) => artifact.url)).toEqual([lazy, css])
  })

  test("metadata that is not a manifest still yields the entry", () => {
    expect(enumeratePluginArtifacts(entry, undefined)).toEqual([entry])
    expect(enumeratePluginArtifacts(entry, "nonsense")).toEqual([entry])
    expect(enumeratePluginArtifacts("not-a-url", metadata)).toEqual(["not-a-url"])
  })

  test("a chunk appearing in both buckets counts as enforceable, once", () => {
    const both = {
      exposes: [{
        name: "entry",
        assets: { js: { sync: ["chunks/a.js"], async: ["chunks/a.js"] }, css: { sync: [], async: [] } },
      }],
    }

    const urls = classifyPluginArtifacts("https://plugins.example.com/mf-manifest.json", both)

    expect(urls.filter((artifact) => artifact.url.endsWith("chunks/a.js"))).toEqual([
      { url: "https://plugins.example.com/chunks/a.js", enforceable: true },
    ])  // filter+toEqual: membership of objects needs deep equality, not toContain
  })

  test("a container under a subdirectory keeps that directory", () => {
    const nested = {
      metaData: { remoteEntry: { name: "remoteEntry.js", path: "poc", type: "module" } },
      exposes: [{ name: "entry", assets: { js: { sync: ["chunks/a.js"], async: [] }, css: { sync: [], async: [] } } }],
    }

    const urls = classifyPluginArtifacts("https://plugins.example.com/dist/mf-manifest.json", nested)

    // `toContain` compares by identity, so object membership is matched explicitly here.
    expect(urls.find((a) => a.url === "https://plugins.example.com/dist/poc/remoteEntry.js")?.enforceable).toBe(true)
    expect(urls.find((a) => a.url === "https://plugins.example.com/dist/chunks/a.js")?.enforceable).toBe(true)
  })
})

describe("pin coverage over the classified set", () => {
  const pin = (letter: string) => `sha384-${letter.repeat(64)}`
  const previewWith = (integrity: Record<string, string>, listed: readonly PluginArtifact[] = artifacts) =>
    previewFrontendPluginRecord(
      { id: "com.example.coverage", entry, entryType: "module", integrity },
      { artifacts: listed },
    )

  test("it counts coverage over the enforceable set, not over everything", () => {
    const result = previewWith({ [entry]: pin("A"), "https://plugins.example.com/assets/gone-0.js": pin("B") })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    const preview = result.preview
    expect(preview.enumeratedArtifactCount).toBe(12)
    expect(preview.enforceableArtifactCount).toBe(10)
    expect(preview.unpinnedArtifacts).toHaveLength(9)  // 10 enforceable minus the one pinned entry
    expect(preview.unpinnedArtifacts).not.toContain(entry)
    // The async chunk and the stylesheet are reported as unreachable-by-pin whether or not they carry a
    // pin: listing them under `unpinnedArtifacts` only would imply "add a pin and you are covered",
    // which §14 measured false for both.
    expect(preview.unenforceableArtifacts).toEqual([lazy, css])
    expect(preview.pinsMatchingNothing).toEqual(["https://plugins.example.com/assets/gone-0.js"])
  })

  test("pinning the async chunk does not make it covered", () => {
    const all: Record<string, string> = {}
    for (const artifact of artifacts) all[artifact.url] = pin("C")

    const result = previewWith(all)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.unpinnedArtifacts).toEqual([])
    expect(result.preview.pinsMatchingNothing).toEqual([])
    // Every URL is pinned, including the two the hook never consults, and the report still refuses to
    // claim full-byte coverage.
    expect(result.preview.unenforceableArtifacts).toEqual([lazy, css])
  })

  test("without enumeration the lists are silent rather than clean", () => {
    const result = previewFrontendPluginRecord(
      { id: "com.example.coverage2", entry, entryType: "module", integrity: { [entry]: pin("A") } },
      {},
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.artifactsEnumerated).toBe(false)
    expect(result.preview.enumeratedArtifactCount).toBe(0)
    expect(result.preview.unpinnedArtifacts).toEqual([])
    expect(result.preview.unenforceableArtifacts).toEqual([])
  })
})

describe("the rollup of pins that buy nothing", () => {
  const pin = (letter: string) => `sha384-${letter.repeat(64)}`
  const previewWith = (integrity: Record<string, string>, allowedOrigins?: string[]) =>
    previewFrontendPluginRecord(
      { id: "com.example.rollup", entry, entryType: "module", integrity, ...(allowedOrigins ? { allowedOrigins } : {}) },
      { artifacts },
    )

  test("each cause is attributed to the right pin, and a healthy pin is not listed", () => {
    const result = previewWith({
      [entry]: pin("A"),                                                   // healthy: runtime fetches it, origin allowed
      "https://plugins.example.com/assets/gone-0.js": pin("B"),           // not in the build
      "https://other.example/pinned.js": pin("C"),                        // outside the allowlist
      [lazy]: pin("D"),                                                   // fetched by the container, not the runtime
    }, ["https://plugins.example.com"])

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.ineffectivePins).toEqual([
      { url: "https://other.example/pinned.js", reason: "origin-not-allowed" },
      { url: lazy, reason: "not-fetched-by-runtime" },
      { url: "https://plugins.example.com/assets/gone-0.js", reason: "no-such-artifact" },
    ])
  })

  test("the origin cause wins when a pin would qualify for two of them", () => {
    // Same URL is both outside the allowlist and never runtime-fetched. The loader checks origins before
    // consulting the pin table, so that is the cause a reader has to act on first.
    const result = previewWith({ [lazy]: pin("D") }, ["https://elsewhere.example"])

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.ineffectivePins).toEqual([{ url: lazy, reason: "origin-not-allowed" }])
  })

  test("it agrees with the origin clause it summarizes", () => {
    const result = previewWith({ "https://other.example/a.js": pin("A"), [entry]: pin("B") }, ["https://plugins.example.com"])

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.unreachablePins).toEqual(
      result.preview.ineffectivePins.filter((pin) => pin.reason === "origin-not-allowed").map((pin) => pin.url),
    )
  })

  test("without an enumeration only the origin cause is claimed", () => {
    const result = previewFrontendPluginRecord(
      {
        id: "com.example.rollup2",
        entry,
        entryType: "module",
        integrity: { "https://other.example/a.js": pin("A") },
        allowedOrigins: ["https://plugins.example.com"],
      },
      {},
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.ineffectivePins).toEqual([
      { url: "https://other.example/a.js", reason: "origin-not-allowed" },
    ])
  })
})
