import { describe, expect, it } from "vitest"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

describe("LogX browser boundary", () => {
  it("keeps Node and OpenTUI imports out of the GUI entry graph", async () => {
    const root = join(process.cwd(), "src/nodes/logx")
    const source = await Promise.all(["entry.ts", "Component.tsx", "types.ts"].map((file) => readFile(join(root, file), "utf8")))
    expect(source.join("\n")).not.toMatch(/@xiranite\/logging\/node|@opentui\/|node:fs/)
  })
})
