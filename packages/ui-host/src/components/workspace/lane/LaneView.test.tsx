// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./Lane", () => ({
  Lane: ({ lane, components, active, solo, hideTitleForNavigator, onTitleHostChange, onClear, onResetNavigatorPosition }: { lane: { id: string; label: string }; components: Array<{ id: string }>; active: boolean; solo: boolean; hideTitleForNavigator?: boolean; onTitleHostChange?(node: HTMLElement | null): void; onClear?(): void; onResetNavigatorPosition?(): void }) => <section data-lane-id={lane.id} data-swimlane-active={active} data-swimlane-solo={solo}><header><span ref={onTitleHostChange} data-swimlane-navigator-title-slot={lane.id}>{hideTitleForNavigator ? null : <span data-lane-title>{lane.label}</span>}</span><button type="button" onClick={onClear}>Clear {lane.label}</button><button type="button" onClick={onResetNavigatorPosition}>Reset navigator from {lane.label}</button></header>{components.map((component) => <span key={component.id} data-component-id={component.id} />)}</section>,
}))

import { INITIAL_STATE } from "@/store/workspace/constants"
import { useSwimlaneSessionStore } from "@/store/swimlaneSessionStore"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { LaneView } from "./LaneView"

beforeEach(() => {
  useSwimlaneSessionStore.getState().clearSessions()
  useWorkspaceStore.setState({
    ...INITIAL_STATE,
    activeWorkspaceId: "lane-test",
    viewMode: "lane",
    workspaces: [{ id: "lane-test", label: "Test" }],
    lanes: [
      { id: "lane-a", workspaceId: "lane-test", label: "Alpha", widthRatio: 1, collapsed: false, cardOrder: [] },
      { id: "lane-b", workspaceId: "lane-test", label: "Beta", widthRatio: 1, collapsed: false, cardOrder: [] },
    ],
    components: [],
    laneWorkspacePreferences: {},
  })
})

afterEach(() => {
  cleanup()
  useSwimlaneSessionStore.getState().clearSessions()
  useWorkspaceStore.setState({ ...INITIAL_STATE })
})

describe("LaneView shared swimlane framework", () => {
  it("persists focus and restores the active lane in solo mode from the movable bar", () => {
    render(<LaneView />)

    fireEvent.click(screen.getByRole("button", { name: "Beta (0)" }))
    expect(useSwimlaneSessionStore.getState().sessions["workspace:lane-test"]?.activeLaneId).toBe("lane-b")

    const handle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })
    fireEvent.contextMenu(handle)
    fireEvent.click(screen.getByRole("menuitem", { name: "当前泳道独占视口" }))

    expect(useSwimlaneSessionStore.getState().sessions["workspace:lane-test"]?.soloLaneId).toBe("lane-b")
    expect(document.querySelector('[data-lane-id="lane-b"]')?.getAttribute("data-swimlane-solo")).toBe("true")
  })

  it("pins the shared bar to one lane by default and follows focus only when enabled", async () => {
    useWorkspaceStore.setState({
      laneWorkspacePreferences: {
        "lane-test": {
          focusOnHover: false,
          soloOnFocus: false,
          showNavigatorInSolo: true,
          focusDelayMs: 650,
          edgeRevealDelayMs: 250,
          barHandleStyle: "grip",
          barHandlePosition: "left",
          navigatorPositionX: 92,
          navigatorPositionY: 94,
          navigatorDock: "top",
          navigatorLaneId: "lane-a",
          navigatorFollowsFocus: false,
          autoFitToViewport: false,
        },
      },
    })
    render(<LaneView />)

    expect(useWorkspaceStore.getState().laneWorkspacePreferences["lane-test"]).toMatchObject({ navigatorDock: "top", navigatorLaneId: "lane-a", navigatorFollowsFocus: false })
    expect(document.querySelector('[data-lane-id="lane-a"] [data-swimlane-navigator-dock="top"]')).toBeTruthy()
    expect(document.querySelector('[data-lane-id="lane-a"] [data-lane-title]')).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Beta (0)" }))
    expect(document.querySelector('[data-lane-id="lane-a"] [data-swimlane-navigator-dock="top"]')).toBeTruthy()

    useWorkspaceStore.getState().patchLaneWorkspacePreferences("lane-test", { navigatorFollowsFocus: true })
    fireEvent.click(screen.getByRole("button", { name: "Alpha (0)" }))
    await waitFor(() => expect(document.querySelector('[data-lane-id="lane-a"] [data-swimlane-navigator-dock="top"]')).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Reset navigator from Beta" }))
    expect(useWorkspaceStore.getState().laneWorkspacePreferences["lane-test"]).toMatchObject({ navigatorDock: "floating", navigatorPositionX: 96, navigatorPositionY: 94 })
  })

  it("offers one-shot and persistent proportional viewport fitting", () => {
    render(<LaneView />)
    fireEvent.contextMenu(screen.getByRole("button", { name: "拖动或设置泳道切换栏" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "按当前比例填满视口" }))
    expect(useWorkspaceStore.getState().laneWorkspacePreferences["lane-test"]?.autoFitToViewport).not.toBe(true)

    fireEvent.contextMenu(screen.getByRole("button", { name: "拖动或设置泳道切换栏" }))
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "常驻按比例适应视口" }))
    expect(useWorkspaceStore.getState().laneWorkspacePreferences["lane-test"]?.autoFitToViewport).toBe(true)
  })

  it("applies shared focus-to-solo and solo navigator preferences", async () => {
    useWorkspaceStore.setState({
      laneWorkspacePreferences: {
        "lane-test": {
          ...useWorkspaceStore.getState().laneWorkspacePreferences["lane-test"],
          soloOnFocus: true,
          showNavigatorInSolo: true,
          focusOnHover: false,
          focusDelayMs: 650,
          edgeRevealDelayMs: 250,
          barHandleStyle: "grip",
          barHandlePosition: "left",
          navigatorPositionX: 92,
          navigatorPositionY: 94,
          navigatorDock: "floating",
          autoFitToViewport: false,
        },
      },
    })
    render(<LaneView />)

    fireEvent.click(screen.getByRole("button", { name: "Beta (0)" }))
    expect(useSwimlaneSessionStore.getState().sessions["workspace:lane-test"]?.soloLaneId).toBe("lane-b")
    expect(screen.getByRole("navigation", { name: "泳道快速切换" })).toBeTruthy()

    useWorkspaceStore.getState().patchLaneWorkspacePreferences("lane-test", { showNavigatorInSolo: false })
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "泳道快速切换" })).toBeNull())
  })

  it("restores independent focus and solo state when switching workspaces", async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: "workspace-a",
      workspaces: [{ id: "workspace-a", label: "A" }, { id: "workspace-b", label: "B" }],
      lanes: [
        { id: "lane-a", workspaceId: "workspace-a", label: "Alpha", widthRatio: 1, collapsed: false, cardOrder: [] },
        { id: "lane-b", workspaceId: "workspace-a", label: "Beta", widthRatio: 1, collapsed: false, cardOrder: [] },
        { id: "lane-c", workspaceId: "workspace-b", label: "Gamma", widthRatio: 1, collapsed: false, cardOrder: [] },
        { id: "lane-d", workspaceId: "workspace-b", label: "Delta", widthRatio: 1, collapsed: false, cardOrder: [] },
      ],
    })
    render(<LaneView />)

    fireEvent.click(screen.getByRole("button", { name: "Beta (0)" }))
    fireEvent.contextMenu(document.querySelector('[data-swimlane-bar-handle="true"]')!)
    fireEvent.click(screen.getAllByRole("menuitem")[0]!)

    useWorkspaceStore.setState({ activeWorkspaceId: "workspace-b" })
    fireEvent.click(await screen.findByRole("button", { name: "Delta (0)" }))
    expect(useSwimlaneSessionStore.getState().sessions["workspace:workspace-b"]?.activeLaneId).toBe("lane-d")

    useWorkspaceStore.setState({ activeWorkspaceId: "workspace-a" })
    await waitFor(() => expect(document.querySelector('[data-lane-id="lane-b"]')?.getAttribute("data-swimlane-active")).toBe("true"))
    expect(document.querySelector('[data-lane-id="lane-b"]')?.getAttribute("data-swimlane-solo")).toBe("true")
  })

  it("repairs orphaned components into the first real lane instead of rendering an unmanageable column", async () => {
    useWorkspaceStore.setState({
      components: [{ id: "orphan", moduleId: "example", state: "docked", workspaceId: "lane-test", laneId: "deleted-lane" }],
    })
    render(<LaneView />)

    await waitFor(() => expect(useWorkspaceStore.getState().components[0]?.laneId).toBe("lane-a"))
    expect(screen.queryByText("未归类")).toBeNull()
  })

  it("clears the current lane only from lane presentation", async () => {
    useWorkspaceStore.setState({
      components: [{ id: "card-a", moduleId: "example", state: "docked", workspaceId: "lane-test", laneId: "lane-a" }],
    })
    render(<LaneView />)

    fireEvent.click(screen.getByRole("button", { name: "Clear Alpha" }))
    await waitFor(() => expect(useWorkspaceStore.getState().components[0]?.hiddenIn).toMatchObject({ lane: true }))
    expect(useWorkspaceStore.getState().components[0]?.moduleId).toBe("example")
  })
})
