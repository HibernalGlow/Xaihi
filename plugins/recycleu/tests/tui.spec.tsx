/* 终端面版式的回归用例：2026-10-08 使用者实拍的那一屏里，中间列的固定块被
 * 可滚动的预览区一起挤扁（四行指标叠成三行、进度条整条消失、按钮文字画在边框上）。
 * 判据是几何而不是像素：固定块拿不到自己的自然高度时，兄弟节点就会共用同一个 y。 */
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { beforeEach, describe, expect, test } from "vitest"

import type { TerminalInteractionDefinition } from "@hibernalglow/xaihi-cli-runtime/interaction"
import { createRecycleuInteractionSchema } from "../src/interaction.ts"
import type { RecycleuInput, RecycleuResult } from "../src/core.ts"
import { RecycleuTui } from "../src/Tui.tsx"

/** `cli.ts:66` 的那条守卫原文；终端面碰到它就该报错，但报错不许把版面挤坏。 */
const GUARD_MESSAGE = "recycleu: the terminal face must never reach the recycle bin"

interface LayoutNode {
  y: number
  height: number
  id?: string
}

/** opentui 只公开 `findDescendantById`，兄弟顺序那份是 protected；版式断言需要它，
 *  就在一处按结构类型取，别把整棵树的类型都放宽。 */
function childNodes(node: { readonly id?: string } | undefined): LayoutNode[] {
  if (!node) return []
  return ((node as unknown as { _childrenInLayoutOrder?: LayoutNode[] })._childrenInLayoutOrder) ?? []
}

function definition(behaviour: "throws" | "idle"): TerminalInteractionDefinition<RecycleuInput, RecycleuResult> {
  return {
    schema: createRecycleuInteractionSchema({ action: "start", interval: 5, maxCycles: 360 }, "zh"),
    async run(_input, onEvent) {
      if (behaviour === "idle") return new Promise<RecycleuResult>(() => undefined)
      onEvent({ type: "log", message: `Start auto-clean, interval 5s, 360 cycle(s).` })
      throw new Error(GUARD_MESSAGE)
    },
  }
}

async function renderWorkbench(behaviour: "throws" | "idle", size: { width: number; height: number }) {
  const setup = await testRender(
    <RecycleuTui definition={definition(behaviour)} language="zh" onExit={() => undefined} />,
    { ...size, useMouse: true },
  )
  return setup
}

async function clickById(setup: Awaited<ReturnType<typeof testRender>>, id: string): Promise<void> {
  const target = setup.renderer.root.findDescendantById(id)
  expect(target, `找不到可点击控件 ${id}`).toBeDefined()
  await act(async () => {
    await setup.mockMouse.click(target!.x + 1, target!.y + 1)
  })
  await act(async () => setup.flush())
}

function metricRows(setup: Awaited<ReturnType<typeof testRender>>): LayoutNode[] {
  const metrics = setup.renderer.root.findDescendantById("recycleu-metrics")
  expect(metrics, "找不到指标区 recycleu-metrics").toBeDefined()
  return childNodes(metrics ?? undefined)
}

describe("recycleu 终端面版式", () => {
  beforeEach(() => {
    process.env.NO_MOTION = "1"
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  test("四行指标各占一行，值不互相覆盖", async () => {
    const setup = await renderWorkbench("idle", { width: 154, height: 50 })
    try {
      await act(async () => setup.renderOnce())
      const frame = setup.captureCharFrame()
      const rows = metricRows(setup)

      expect(rows).toHaveLength(4)
      const ys = rows.map((row) => row.y)
      expect(ys).toEqual([...ys].sort((a, b) => a - b))
      expect(new Set(ys).size).toBe(4)
      expect(rows.every((row) => row.height >= 1)).toBe(true)

      // 截图里的现场：第二行的值「全部盘符」被第三行的「5s」盖掉右边两格。
      // 整帧是三列并排的终端行，跨列做包含判断会撞名（左列也有「清理间隔（秒）」
      // 和「全部盘符」），所以这条只用否定式。
      expect(frame).not.toContain("全部盘5s")
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("进度条与执行按钮拿到自己的高度，文字不落在边框上", async () => {
    const setup = await renderWorkbench("idle", { width: 154, height: 50 })
    try {
      await act(async () => setup.renderOnce())
      const frame = setup.captureCharFrame()

      expect(frame).toMatch(/░+ 0%/)

      const execute = setup.renderer.root.findDescendantById("execute")
      expect(execute).toBeDefined()
      expect(execute!.height).toBeGreaterThanOrEqual(3)
      const label = childNodes(execute ?? undefined)[0]
      expect(label).toBeDefined()
      // 边框占首末两行，正文必须严格落在中间。
      expect(label!.y).toBeGreaterThan(execute!.y)
      expect(label!.y + label!.height).toBeLessThan(execute!.y + execute!.height)
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("守卫报错回填状态栏后，长文案不再压住进度条和按钮", async () => {
    const setup = await renderWorkbench("throws", { width: 154, height: 50 })
    try {
      await act(async () => setup.renderOnce())
      await clickById(setup, "execute")
      await clickById(setup, "confirm-execute")
      await setup.waitFor(() => setup.captureCharFrame().includes("已完成"))

      const frame = setup.captureCharFrame()
      // 这条报错 60 列，比中间列宽，一定会折行，所以按折行后的首段比对。
      const head = "recycleu: the terminal face must never reach"
      expect(frame).toContain(head)

      const lines = frame.split("\n")
      const statusLine = lines.findIndex((line) => line.includes(head))
      const barLine = lines.findIndex((line) => /░+/.test(line))
      const buttonLine = lines.findIndex((line) => line.includes("确认后执行"))
      expect(statusLine).toBeGreaterThanOrEqual(0)
      expect(barLine).toBeGreaterThan(statusLine)
      expect(buttonLine).toBeGreaterThan(barLine)

      const execute = setup.renderer.root.findDescendantById("execute")
      expect(execute!.height).toBeGreaterThanOrEqual(3)
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })
})
