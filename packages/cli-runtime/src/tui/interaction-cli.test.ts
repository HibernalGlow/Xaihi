import { afterEach, describe, expect, test, vi } from "vitest"

import type { TerminalInteractionDefinition } from "../interaction.js"
import { createMemoryCliHost, explicitInteractionModes } from "../testing.js"
import { runInteractionCli } from "./index.js"

const definition: TerminalInteractionDefinition<{ action: string }, { success: boolean }> = {
  schema: {
    id: "demo", title: "Demo", description: "Demo", initialValues: { action: "status" },
    fields: [{ id: "action", label: "Action", kind: "text" }],
    toInput: () => ({ action: "status" }), preview: () => [], isDangerous: () => false,
    result: (result) => ({ success: result.success, message: "ok" }),
  },
  run: async () => ({ success: true }),
}

afterEach(() => { process.exitCode = 0 })

describe("shared interaction CLI dispatcher", () => {
  test("renders package-owned help only when explicitly requested", async () => {
    const adapters = createAdapters()
    const helpHost = createMemoryCliHost()
    await dispatch(["--help"], helpHost, adapters)
    expect(helpHost.stdoutText()).toContain("Demo shared help")
    expect(helpHost.stdoutText()).toContain("--demo  [boolean, 默认=true]")
    expect(adapters.runPipe).not.toHaveBeenCalled()

    await dispatch(["gd"], createMemoryCliHost({ tty: true }), adapters)
    expect(adapters.runGuide).toHaveBeenCalledWith(definition, expect.not.objectContaining({ help: expect.anything() }))
  })

  test.each(explicitInteractionModes)("rejects %s without a TTY", async (mode) => {
    const host = createMemoryCliHost()
    const adapters = createAdapters()
    await dispatch([mode], host, adapters)
    expect(process.exitCode).toBe(2)
    expect(host.stdoutText()).toBe("")
    expect(adapters.runUi).not.toHaveBeenCalled()
    expect(adapters.runGuide).not.toHaveBeenCalled()
  })

  test("routes configured defaults, aliases, explicit UI, and pipe centrally", async () => {
    const adapters = createAdapters()
    await dispatch([], createMemoryCliHost({ tty: true }), adapters, "gd")
    await dispatch(["guided"], createMemoryCliHost({ tty: true }), adapters)
    await dispatch(["ui", "--lang", "en"], createMemoryCliHost({ tty: true }), adapters)
    await dispatch(["status", "--json"], createMemoryCliHost(), adapters)
    expect(adapters.runGuide).toHaveBeenCalledTimes(2)
    expect(adapters.runUi).toHaveBeenCalledTimes(1)
    expect(adapters.runPipe).toHaveBeenCalledWith(["status", "--json"], expect.anything())
  })

  test("passes the resolved Nord preference into the settings controller", async () => {
    let current: unknown
    const adapters = createAdapters()
    const host = createMemoryCliHost({ tty: true })
    await runInteractionCli({
      args: [], host, cliName: "xdemo",
      loadContext: async () => ({ preferences: { mode: "ui", renderer: "opentui", language: "zh", theme: "nord" }, value: {} }),
      createDefinition: () => definition,
      runPipe: adapters.runPipe,
      runUi: adapters.runUi,
      runGuide: adapters.runGuide,
      createPreferences: (_value, values) => { current = values; return { nodeId: "demo", current: values, save: async () => undefined, restore: async () => values } },
    })
    expect(current).toEqual({ theme: "nord", defaultMode: "ui", language: "zh" })
  })
})

function createAdapters() {
  return { runUi: vi.fn(async () => undefined), runGuide: vi.fn(async () => undefined), runPipe: vi.fn(async () => undefined) }
}

async function dispatch(args: string[], host: ReturnType<typeof createMemoryCliHost>, adapters: ReturnType<typeof createAdapters>, mode: "ui" | "gd" | "pipe" = "ui") {
  await runInteractionCli({
    args, host, cliName: "xdemo",
    loadContext: async () => ({ preferences: { mode, renderer: "opentui", language: "zh", theme: "nord" }, value: {} }),
    createDefinition: () => definition,
    runPipe: adapters.runPipe,
    runUi: adapters.runUi,
    runGuide: adapters.runGuide,
    help: { title: "Demo", short: "Demo shared help", workflows: [], commands: [], fields: [{ name: "--demo", type: "boolean", description: "Demo option", defaultValue: "true" }] },
  })
}
