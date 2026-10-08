import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { describe, expect, test } from "vitest"

import type { TerminalInteractionDefinition } from "@hibernalglow/xaihi-cli-runtime/interaction"
import { createRecycleuInteractionSchema } from "../src/interaction.ts"
import type { RecycleuInput, RecycleuResult } from "../src/core.ts"
import { RecycleuTui } from "../src/Tui.tsx"

function definition(): TerminalInteractionDefinition<RecycleuInput, RecycleuResult> {
  return {
    schema: createRecycleuInteractionSchema({ action: "start", interval: 5, maxCycles: 360 }, "zh"),
    run: async () => ({ success: true, message: "ok" }),
  }
}

describe("diagnostic", () => {
  test("dump frame", async () => {
    process.env.NO_MOTION = "1"
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      setup = await testRender(
        <RecycleuTui definition={definition()} language="zh" onExit={() => undefined} />,
        { width: 154, height: 50, useMouse: true },
      )
    })
    try {
      await act(async () => setup.renderOnce())
      const frame = setup.captureCharFrame()
      console.log(frame.split("\n").map((l, i) => String(i + 1).padStart(2, " ") + "|" + l).join("\n"))
      console.log("WIDTH_CHECK", frame.split("\n").map((l) => l.length).join(","))
      const lines: string[] = []
      function walk(node: any, depth: number): void {
        const content = node.content?.string ?? node.content?.toString?.()
        const label = typeof content === "string" ? JSON.stringify(content.slice(0, 20)) : ""
        lines.push(
          `${"  ".repeat(depth)}${String(node.constructor?.name ?? "?")}${node.id ? `#${node.id}` : ""} y=${node.y} h=${node.height} w=${node.width} ${label}`,
        )
        for (const child of node._childrenInLayoutOrder ?? []) walk(child, depth + 1)
      }
      walk(setup.renderer.root, 0)
      console.log(lines.join("\n"))
    } finally {
      await act(async () => setup.renderer.destroy())
    }
    expect(true).toBe(true)
  })
})
