import { afterEach, describe, expect, it, vi } from "vitest"
import {
  defaultViewUrl,
  parseRecoveryAttempt,
  readRecoveryLevel,
  reloadAtDefaultView,
  reloadWithWorkspaceReset,
  serializeRecoveryAttempt,
} from "@/lib/renderRecovery"
import { useSwimlaneSessionStore } from "@/store/swimlaneSessionStore"
import { useWorkspaceStore } from "@/store/workspaceStore"

const RECOVERY_KEY = "xiranite.render-recovery"
const WORKSPACE_UI_KEY = "xiranite-workspace-ui"
const SWIMLANE_SESSION_KEY = "xiranite-swimlane-session"

afterEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("defaultViewUrl", () => {
  it("drops every parameter that pins the crashed view back onto the next boot", () => {
    const cleaned = defaultViewUrl(
      "http://127.0.0.1:1420/?view=dockview&workspace=ws-beta&settings=runtime"
      + "&floatingComponent=c-1&windowId=w-1&moduleId=findz&workspaceId=ws-beta&title=Findz",
    )

    expect(cleaned).toBe("http://127.0.0.1:1420/")
  })

  it("keeps parameters it does not own and the hash", () => {
    const cleaned = defaultViewUrl("http://127.0.0.1:1420/?view=lane&log=debug#anchor")

    expect(cleaned).toBe("http://127.0.0.1:1420/?log=debug#anchor")
  })

  it("positive control: a url that never carried a view parameter is left alone", () => {
    expect(defaultViewUrl("http://127.0.0.1:1420/?log=debug")).toBe("http://127.0.0.1:1420/?log=debug")
  })
})

describe("recovery attempt marker", () => {
  it("round-trips the level through its serialized form", () => {
    expect(parseRecoveryAttempt(serializeRecoveryAttempt(1, 1_000), 1_000)).toBe(1)
    expect(parseRecoveryAttempt(serializeRecoveryAttempt(2, 1_000), 1_000)).toBe(2)
  })

  it("forgets the attempt once the app has clearly been up longer than the startup window", () => {
    const marker = serializeRecoveryAttempt(1, 0)

    expect(parseRecoveryAttempt(marker, 29_000)).toBe(1)
    expect(parseRecoveryAttempt(marker, 31_000)).toBe(0)
  })

  it("treats a missing or corrupt marker as no attempt rather than throwing", () => {
    expect(parseRecoveryAttempt(null, 1_000)).toBe(0)
    expect(parseRecoveryAttempt("nonsense", 1_000)).toBe(0)
    expect(parseRecoveryAttempt("3:1000", 1_000)).toBe(0)
    expect(parseRecoveryAttempt("1:not-a-number", 1_000)).toBe(0)
  })

  it("reads back what reloadAtDefaultView wrote before navigating", () => {
    window.history.replaceState({}, "", "?view=bento&log=debug")
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {})

    reloadAtDefaultView(5_000)

    expect(window.sessionStorage.getItem(RECOVERY_KEY)).toBe("1:5000")
    expect(readRecoveryLevel(5_000)).toBe(1)
    const navigatedTo = replace.mock.calls[0]?.[0]
    expect(navigatedTo).toEqual(expect.stringContaining(`${window.location.origin}/?log=debug`))
    expect(navigatedTo).not.toContain("view=")
  })
})

describe("reloadWithWorkspaceReset", () => {
  it("writes the reset into localStorage before navigating, so the next boot cannot read the old value", () => {
    useWorkspaceStore.getState().setRestoreWorkspaceComponents(true)
    useSwimlaneSessionStore.getState().patchSession("ws-alpha/findz", { soloLaneId: "lane-2" })
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_UI_KEY) ?? "{}").state.restoreWorkspaceComponents).toBe(true)

    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {})
    reloadWithWorkspaceReset(7_000)

    expect(replace).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(window.localStorage.getItem(WORKSPACE_UI_KEY))).state.restoreWorkspaceComponents).toBe(false)
    expect(JSON.parse(String(window.localStorage.getItem(SWIMLANE_SESSION_KEY))).state.sessions).toEqual({})
    expect(window.sessionStorage.getItem(RECOVERY_KEY)).toBe("2:7000")
  })

  it("leaves the appearance preferences the user configured alone", () => {
    useWorkspaceStore.getState().setRestoreWorkspaceComponents(true)
    useWorkspaceStore.setState({ hazardMode: true })

    vi.spyOn(window.location, "replace").mockImplementation(() => {})
    reloadWithWorkspaceReset(7_000)

    const persisted = JSON.parse(String(window.localStorage.getItem(WORKSPACE_UI_KEY))).state
    expect(persisted.hazardMode).toBe(true)
  })
})
