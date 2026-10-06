// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ComponentWindowFrameEvent } from "@/backend/runtime/runtime"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { WorkspaceWindowFrameSync } from "./WorkspaceWindowFrameSync"

const mocks = vi.hoisted(() => ({
  handler: undefined as ((event: ComponentWindowFrameEvent) => void) | undefined,
  persist: vi.fn(async () => ({ width: 1180, height: 760 })),
  unsubscribe: vi.fn(),
}))

vi.mock("@/backend/client", () => ({
  getBackend: async () => ({
    windows: {
      subscribeFrameChanges: async (handler: (event: ComponentWindowFrameEvent) => void) => {
        mocks.handler = handler
        return mocks.unsubscribe
      },
    },
  }),
}))

vi.mock("@/backend/workspaceRpcClient", () => ({
  persistComponentWindowSize: mocks.persist,
}))

beforeEach(() => {
  mocks.handler = undefined
  mocks.persist.mockClear()
  mocks.unsubscribe.mockClear()
  useWorkspaceStore.setState({
    activeWorkspaceId: "ws-alpha",
    components: [{
      id: "component-1",
      moduleId: "enginev",
      workspaceId: "ws-alpha",
      placement: "window",
      state: "floating",
    }],
  })
})

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ components: [] })
})

describe("WorkspaceWindowFrameSync", () => {
  test("updates the live component and persists the normal native size", async () => {
    const rendered = render(<WorkspaceWindowFrameSync />)
    await waitFor(() => expect(mocks.handler).toBeTypeOf("function"))

    act(() => mocks.handler?.({
      componentId: "component-1",
      moduleId: "enginev",
      workspaceId: "ws-alpha",
      width: 1180,
      height: 760,
    }))

    expect(useWorkspaceStore.getState().components[0]?.windowSize).toEqual({ width: 1180, height: 760 })
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledWith({
      componentId: "component-1",
      moduleId: "enginev",
      workspaceId: "ws-alpha",
      size: { width: 1180, height: 760 },
    }))

    rendered.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
