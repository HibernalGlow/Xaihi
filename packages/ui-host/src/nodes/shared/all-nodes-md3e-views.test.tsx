// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render } from "@testing-library/react"
import type { NodeHostApi } from "@xiranite/contract"
import { useWorkspaceStore } from "@/store/workspaceStore"

import { Component as CleanfComponent } from "@/nodes/cleanf/Component"
import { Component as MigratefComponent } from "@/nodes/migratef/Component"
import { Component as DissolvefComponent } from "@/nodes/dissolvef/Component"
import { Component as MvzComponent } from "@/nodes/mvz/Component"
import { Component as ClassfComponent } from "@/nodes/classf/Component"
import { Component as ClassqComponent } from "@/nodes/classq/Component"
import { Component as CrashuComponent } from "@/nodes/crashu/Component"
import { Component as SameaComponent } from "@/nodes/samea/Component"
import { Component as NameuComponent } from "@/nodes/nameu/Component"
import { Component as TrenameComponent } from "@/nodes/trename/Component"
import { Component as LinedupComponent } from "@/nodes/linedup/Component"
import { Component as MarkuComponent } from "@/nodes/marku/Component"
import { Component as EnginevComponent } from "@/nodes/enginev/Component"
import { Component as GifuComponent } from "@/nodes/gifu/Component"
import { Component as RepackuComponent } from "@/nodes/repacku/Component"
import { Component as RecycleuComponent } from "@/nodes/recycleu/Component"
import { Component as SleeptComponent } from "@/nodes/sleept/Component"
import { Component as TimeuComponent } from "@/nodes/timeu/Component"
import { Component as BitvComponent } from "@/nodes/bitv/Component"
import { Component as FormatvComponent } from "@/nodes/formatv/Component"
import { Component as FindzComponent } from "@/nodes/findz/Component"
import { Component as KisakiComponent } from "@/nodes/kisaki/Component"
import { Component as ShellectComponent } from "@/nodes/shellect/Component"

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ uiFace: "legacy" })
  delete document.documentElement.dataset.uiFace
})

function createMockHost(): NodeHostApi<Record<string, unknown>, Record<string, unknown>> {
  const stateData: Record<string, unknown> = {}
  return {
    contract: {
      name: "xaihi.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "clipboard"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    state: {
      getData: () => stateData,
      patchData: (patch) => {
        Object.assign(stateData, patch)
      },
    },
    runner: {
      run: async () => ({ success: true, message: "OK" }),
    },
    actions: {
      run: async () => ({ success: true, message: "OK" }),
    },
    clipboard: {
      readText: async () => "",
      writeText: async () => undefined,
    },
    getData: <T,>() => stateData as T,
    patchData: (_compId, patch) => {
      Object.assign(stateData, patch)
    },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
}

const ALL_23_NODES = [
  // Priority 1: 18 Previously Untouched Nodes
  { id: "cleanf", Component: CleanfComponent },
  { id: "migratef", Component: MigratefComponent },
  { id: "dissolvef", Component: DissolvefComponent },
  { id: "mvz", Component: MvzComponent },
  { id: "classf", Component: ClassfComponent },
  { id: "classq", Component: ClassqComponent },
  { id: "crashu", Component: CrashuComponent },
  { id: "samea", Component: SameaComponent },
  { id: "nameu", Component: NameuComponent },
  { id: "trename", Component: TrenameComponent },
  { id: "linedup", Component: LinedupComponent },
  { id: "marku", Component: MarkuComponent },
  { id: "enginev", Component: EnginevComponent },
  { id: "gifu", Component: GifuComponent },
  { id: "repacku", Component: RepackuComponent },
  { id: "recycleu", Component: RecycleuComponent },
  { id: "sleept", Component: SleeptComponent },
  { id: "timeu", Component: TimeuComponent },
  // Priority 2: 5 Previously Touched Nodes (Rewritten to MD3E Spec)
  { id: "bitv", Component: BitvComponent },
  { id: "formatv", Component: FormatvComponent },
  { id: "findz", Component: FindzComponent },
  { id: "kisaki", Component: KisakiComponent },
  { id: "shellect", Component: ShellectComponent },
] as const

describe("23 节点双视图挂载（Legacy 保留 + 全新 MD3E 表现力视图）", () => {
  test.each(ALL_23_NODES)(
    "节点 $id 在 uiFace=md3e 下挂载全新 MD3E 视图，且与 uiFace=legacy 隔离",
    ({ id, Component }) => {
      const host = createMockHost()

      // 1. Legacy 模式挂载正常
      useWorkspaceStore.setState({ uiFace: "legacy" })
      const legacyRender = render(<Component compId={`${id}-legacy`} host={host as never} />)
      expect(legacyRender.container.firstElementChild).not.toBeNull()
      cleanup()

      // 2. MD3E 模式挂载独立新视图
      useWorkspaceStore.setState({ uiFace: "md3e" })
      const md3eRender = render(<Component compId={`${id}-md3e`} host={host as never} />)
      const md3eVariantNode = md3eRender.container.querySelector(
        '[data-ui-variant="md3e"], [data-node-ui="md3e"]',
      )
      expect(md3eVariantNode).not.toBeNull()
    },
  )
})
