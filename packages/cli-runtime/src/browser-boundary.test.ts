import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

describe("browser-safe public entrypoints", () => {
  test("keeps the package root disconnected from terminal renderers", async () => {
    const source = await readFile(resolve(process.cwd(), "src/index.ts"), "utf8")

    expect(source).not.toContain("./tui/")
    expect(source).not.toContain("@opentui/")
    expect(source).not.toContain("runTerminalUi")
  })

  test("publishes pure modules separately from the terminal-only entrypoint", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      exports: Record<string, { default: string }>
    }

    expect(packageJson.exports["./i18n"]?.default).toBe("./dist/i18n.js")
    expect(packageJson.exports["./interaction"]?.default).toBe("./dist/interaction.js")
    expect(packageJson.exports["./terminal"]?.default).toBe("./dist/terminal.js")
  })
})
