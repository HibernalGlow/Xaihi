// @vitest-environment happy-dom
import { useEffect, useState, type ReactNode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { NeoViewKeepAliveProvider, NeoViewKeepAliveSlot, NEO_VIEW_KEEP_ALIVE_DATA_KEY } from "./NeoViewKeepAlive"

const mountCounts = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }))

afterEach(() => {
  cleanup()
  mountCounts.mounted = 0
  mountCounts.unmounted = 0
  useWorkspaceStore.setState({ activeWorkspaceId: "default", components: [] })
})

describe("NeoViewKeepAliveProvider", () => {
  test("keeps the same Reader subtree mounted while switching workspace views", async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: "keep-alive-test",
      components: [{ id: "neo-1", moduleId: "neoview", state: "docked", workspaceId: "keep-alive-test" }],
    })

    function StatefulNode() {
      const [value, setValue] = useState("before-switch")
      useEffect(() => {
        mountCounts.mounted += 1
        return () => {
          mountCounts.unmounted += 1
        }
      }, [])
      return <input aria-label="reader-state" value={value} onChange={(event) => setValue(event.target.value)} />
    }

    function View({ active }: { active: boolean }) {
      return (
        <NeoViewKeepAliveProvider renderNode={() => <StatefulNode />}>
          {active ? <NeoViewKeepAliveSlot compId="neo-1" /> : <div data-testid="other-view" />}
        </NeoViewKeepAliveProvider>
      )
    }

    const view = render(<View active />)
    const readerState = await screen.findByLabelText("reader-state") as HTMLInputElement
    fireEvent.change(readerState, { target: { value: "after-switch" } })
    expect(readerState.value).toBe("after-switch")

    view.rerender(<View active={false} />)
    await waitFor(() => expect(mountCounts.mounted).toBe(1))
    expect(mountCounts.unmounted).toBe(0)
    expect((document.querySelector('[data-neoview-keepalive-root="true"] input') as HTMLInputElement | null)?.value).toBe("after-switch")

    view.rerender(<View active />)
    expect((await screen.findByLabelText("reader-state") as HTMLInputElement).value).toBe("after-switch")
    expect(mountCounts.mounted).toBe(1)
    expect(mountCounts.unmounted).toBe(0)
  })

  test("removes a retained Reader when its workspace component is deleted", async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: "keep-alive-test",
      components: [{ id: "neo-1", moduleId: "neoview", state: "docked", workspaceId: "keep-alive-test" }],
    })

    function StatefulNode() {
      useEffect(() => {
        mountCounts.mounted += 1
        return () => {
          mountCounts.unmounted += 1
        }
      }, [])
      return <div data-testid="reader-node" />
    }

    const renderNode = (_compId: string): ReactNode => <StatefulNode />
    render(
      <NeoViewKeepAliveProvider renderNode={renderNode}>
        <NeoViewKeepAliveSlot compId="neo-1" />
      </NeoViewKeepAliveProvider>,
    )

    await screen.findByTestId("reader-node")
    useWorkspaceStore.setState({ components: [] })
    await waitFor(() => expect(mountCounts.unmounted).toBe(1))
    expect(document.querySelector('[data-neoview-keepalive-host="neo-1"]')).toBeNull()
  })

  test("releases the retained Reader when its switch-memory toggle is disabled", async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: "keep-alive-test",
      components: [{ id: "neo-1", moduleId: "neoview", state: "docked", workspaceId: "keep-alive-test" }],
    })

    function StatefulNode() {
      useEffect(() => {
        mountCounts.mounted += 1
        return () => {
          mountCounts.unmounted += 1
        }
      }, [])
      return <div data-testid="reader-node" />
    }

    render(
      <NeoViewKeepAliveProvider renderNode={() => <StatefulNode />}>
        <NeoViewKeepAliveSlot compId="neo-1" />
      </NeoViewKeepAliveProvider>,
    )
    await screen.findByTestId("reader-node")

    useWorkspaceStore.setState({
      components: [{ id: "neo-1", moduleId: "neoview", state: "docked", workspaceId: "keep-alive-test", data: { [NEO_VIEW_KEEP_ALIVE_DATA_KEY]: false } }],
    })
    await waitFor(() => expect(mountCounts.unmounted).toBe(1))
    expect(document.querySelector('[data-neoview-keepalive-host="neo-1"]')).toBeNull()
  })
})
