/* @jsxImportSource @opentui/react */
import { testRender } from "@opentui/react/test-utils"
import { describe, expect, test } from "bun:test"
import { act } from "react"
import type { WorkspaceSnapshotDTO } from "@xiranite/shared"
import { XiraniteTui } from "./Tui.js"

describe("Xiranite fullscreen terminal workspace", () => {
  test("deploys and resizes a node with mouse controls through the shared snapshot", async () => {
    let saved: WorkspaceSnapshotDTO | undefined
    const initial: WorkspaceSnapshotDTO = { workspaces: [{ id: "ws", label: "主工作区", createdAt: 1, updatedAt: 1 }], lanes: [], components: [] }
    const taskQueue = { available: false, list: async () => [], pause: async () => {}, resume: async () => {}, cancel: async () => {}, run: async () => ({}) }
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => { setup = await testRender(<XiraniteTui nodes={[{ id: "sleept", packageName: "@xiranite/node-sleept", bin: "xsleept", description: "系统计时器" }]} workspace={{ available: true, load: async () => initial, save: async (snapshot) => { saved = snapshot } }} taskQueue={taskQueue} onOpenNode={() => undefined} onExit={() => undefined} />, { width: 130, height: 36, useMouse: true }) })
    const click = async (id: string) => {
      const target = setup.renderer.root.findDescendantById(id)
      expect(target).toBeDefined()
      await act(async () => setup.mockMouse.click(target!.x + 1, target!.y + Math.max(0, Math.floor(target!.height / 2))))
      await act(async () => setup.flush())
    }
    try {
      await act(async () => setup.renderOnce())
      await setup.waitFor(() => setup.renderer.root.findDescendantById("library-sleept") !== undefined)
      await click("library-sleept")
      await setup.waitFor(() => saved?.components.length === 1)
      const componentId = saved!.components[0]!.id
      await click(`deployed-${componentId}`)
      await click("width-plus")
      await setup.waitFor(() => saved?.components[0]?.bentoLayout?.w === 5)
      expect(setup.renderer.root.findDescendantById("global-queue")).toBeDefined()
    } finally { await act(async () => setup.renderer.destroy()) }
  })
})
