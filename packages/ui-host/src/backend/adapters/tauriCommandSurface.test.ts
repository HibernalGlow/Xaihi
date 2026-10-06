import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * The desktop IPC surface has no compile-time link: `adapters/tauri.ts` writes command names as string
 * literals and `main.rs` registers functions, so a name that exists in only one of them fails at runtime
 * as a rejected invoke the WebView just swallows. The frontend unit tests pin the literals the adapter
 * sends; this pins that the host actually registered them, and that the host registers nothing the
 * frontend stopped calling.
 */

// Vitest runs with the repository root as its working directory, which is the anchor both sides share.
const repoRoot = process.cwd()

/** The `tauri::generate_handler![...]` list — the only set of commands the host will answer. */
function registeredCommands(mainRs: string): string[] {
  const start = mainRs.indexOf("generate_handler![")
  if (start < 0) return []
  const body = mainRs.slice(start + "generate_handler![".length, mainRs.indexOf("]", start))
  return body
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^xiranite_[a-z0-9_]+$/.test(entry))
}

/** Every `"xiranite_…"` string literal a frontend module passes to `invoke`. */
function invokedCommands(source: string): string[] {
  return [...source.matchAll(/"(xiranite_[a-z0-9_]+)"/g)].map((match) => match[1]!)
}

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

const adapter = read("src/backend/adapters/tauri.ts")
const channel = read("src/backend/tauriChannel.ts")
const host = read("crates/xiranite-desktop/src/main.rs")

const registered = new Set(registeredCommands(host))
const invoked = new Set([...invokedCommands(adapter), ...invokedCommands(channel)])

describe("desktop IPC command surface", () => {
  test("the host registers every command the WebView invokes", () => {
    expect([...invoked].filter((command) => !registered.has(command))).toEqual([])
  })

  test("the host registers no command the WebView stopped calling", () => {
    expect([...registered].filter((command) => !invoked.has(command))).toEqual([])
  })

  /// A surface gauge that reads nothing is indistinguishable from a clean one, so the sample size is asserted.
  test("both sides of the seam are non-empty", () => {
    expect(registered.size).toBeGreaterThanOrEqual(16)
    expect(invoked.size).toBeGreaterThanOrEqual(16)
  })

  /// Falsification: the same extraction on a fixture carrying one bad name per direction must name it.
  test("the differ reports a violation instead of going quiet", () => {
    const fixtureHost = ".invoke_handler(tauri::generate_handler![\n xiranite_bootstrap,\n xiranite_window_gone,\n]);"
    const fixtureAdapter = 'await invoke("xiranite_bootstrap");\nawait invoke("xiranite_dialog_missing");'
    const hostCommands = new Set(registeredCommands(fixtureHost))
    const adapterCommands = new Set(invokedCommands(fixtureAdapter))

    expect([...adapterCommands].filter((command) => !hostCommands.has(command))).toEqual(["xiranite_dialog_missing"])
    expect([...hostCommands].filter((command) => !adapterCommands.has(command))).toEqual(["xiranite_window_gone"])
  })
})
