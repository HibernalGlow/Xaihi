import { describe, expect, it, vi } from "vitest"

import { createTauriRuntime, detectTauriRuntime, resolveNativeDrop } from "./tauri"

/**
 * The adapter is the only place the Tauri command *names* and *argument shapes* are written down, and a
 * misspelled command fails silently at runtime (the WebView just sees a rejected promise). So the names
 * are asserted here against the handler list in `crates/xiranite-desktop/src/main.rs`.
 */
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

function fakeTauri(invoke: Invoke = vi.fn(async () => ({ success: true, supported: true, message: "ok" }))) {
  return { webView: { __TAURI__: { core: { invoke }, event: {} } }, invoke }
}

describe("detectTauriRuntime", () => {
  it("is false in a plain browser document", () => {
    expect(detectTauriRuntime({})).toBe(false)
    expect(detectTauriRuntime(undefined)).toBe(false)
  })

  it("is true when the host injected the global", () => {
    expect(detectTauriRuntime(fakeTauri().webView)).toBe(true)
  })
})

describe("Tauri window adapter", () => {
  it("keeps the HTTP-backed surfaces from the web adapter and overrides only kind and windows", () => {
    const { webView } = fakeTauri()
    const runtime = createTauriRuntime(webView)

    expect(runtime.kind).toBe("tauri")
    expect(typeof runtime.fs.exists).toBe("function")
    expect(typeof runtime.storage.get).toBe("function")
    expect(typeof runtime.nodeRunner.runNode).toBe("function")
  })

  /// The argument key is part of the contract: Tauri matches `input` to the Rust parameter by name.
  it("calls the commands the host registers, with the argument keys it declares", async () => {
    const { webView, invoke } = fakeTauri()
    const windows = createTauriRuntime(webView).windows

    await windows.getCapabilities()
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_capabilities", undefined)

    await windows.openComponent({ componentId: "cmp-7", moduleId: "node:trename" })
    expect(invoke).toHaveBeenLastCalledWith("xiranite_open_component_window", {
      input: { componentId: "cmp-7", moduleId: "node:trename" },
    })

    await windows.controlMain("minimize")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_control", { id: "main", action: "minimize" })

    await windows.controlComponent("component-cmp-7", "close")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_control", { id: "component-cmp-7", action: "close" })

    await windows.focus("component-cmp-7")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_focus", { id: "component-cmp-7" })

    await windows.setFrame({ x: 40, y: 60, width: 500, height: 400 }, "component-cmp-7")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_set_frame", {
      frame: { x: 40, y: 60, width: 500, height: 400 },
      id: "component-cmp-7",
    })

    await windows.startDragging("component-cmp-7")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_start_dragging", { id: "component-cmp-7" })
  })

  /// An absent id means the main window on the host side; the empty string is how the adapter says it.
  it("sends the main-window convention for optional ids", async () => {
    const { webView, invoke } = fakeTauri()
    const windows = createTauriRuntime(webView).windows

    await windows.getFrame()
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_get_frame", { id: "" })
    await windows.openDevTools()
    expect(invoke).toHaveBeenLastCalledWith("xiranite_window_open_devtools", { id: "" })
  })

  it("reports no frame for a host that answers null", async () => {
    const { webView, invoke } = fakeTauri(vi.fn(async (): Promise<unknown> => null))
    expect(await createTauriRuntime(webView).windows.getFrame("main")).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it("degrades to a no-op subscription when the event API is missing", async () => {
    const runtime = createTauriRuntime({ __TAURI__: { core: { invoke: vi.fn() } } })
    const unsubscribe = await runtime.windows.subscribeFrameChanges(() => {})
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe("Tauri tray adapter", () => {
  it("answers the tray commands the host registers", async () => {
    const { webView, invoke } = fakeTauri()
    const trays = createTauriRuntime(webView).trays

    await trays.getCapabilities()
    expect(invoke).toHaveBeenLastCalledWith("xiranite_tray_capabilities", undefined)

    await trays.setMainEnabled(true)
    expect(invoke).toHaveBeenLastCalledWith("xiranite_tray_set_main_enabled", { enabled: true })
  })

  /// The host deserializes `iconDataUrl`, not `icon`: renaming it here would silently drop every node icon.
  it("sends the spec shape tray.rs deserializes, with nested items kept", async () => {
    const { webView, invoke } = fakeTauri()
    await createTauriRuntime(webView).trays.sync([
      {
        id: "node.trename.t1",
        kind: "standalone",
        tooltip: "Trename",
        icon: "data:image/png;base64,AAAA",
        items: [
          { id: "pause", label: "暂停" },
          { id: "grp", label: "分组", children: [{ id: "s", type: "separator", label: "" }] },
        ],
      },
    ])

    expect(invoke).toHaveBeenLastCalledWith("xiranite_tray_sync", {
      specs: [
        {
          id: "node.trename.t1",
          kind: "standalone",
          tooltip: "Trename",
          iconDataUrl: "data:image/png;base64,AAAA",
          items: [
            { id: "pause", label: "暂停" },
            { id: "grp", label: "分组", children: [{ id: "s", label: "", type: "separator" }] },
          ],
        },
      ],
    })
  })

  it("omits the icon key entirely when the spec carries none", async () => {
    const { webView, invoke } = fakeTauri()
    await createTauriRuntime(webView).trays.sync([{ id: "xiranite.main", kind: "main", tooltip: "Xiranite", items: [] }])
    expect(invoke).toHaveBeenLastCalledWith("xiranite_tray_sync", {
      specs: [{ id: "xiranite.main", kind: "main", tooltip: "Xiranite", items: [] }],
    })
  })
})

/**
 * `useLocalFileDrop` stamps this attribute on its target (`targetProps` in
 * `src/nodes/shared/useLocalFileDrop.tsx`); the adapter's selector has to name the same one, so the
 * literal is written down here rather than imported, and drift shows up as a red test.
 */
const DROP_ATTR = "data-local-file-drop-target"

/**
 * A DOM that answers `elementFromPoint` from a table of *logical* points. The table is keyed by logical
 * coordinates on purpose: a test that keyed by the payload's physical coordinates could not tell a
 * division from a pass-through.
 */
function stubDocument(hits: ReadonlyArray<{ x: number; y: number; targetId?: string }>) {
  const queried: Array<[number, number]> = []
  const selectors: string[] = []
  const document = {
    elementFromPoint(x: number, y: number) {
      queried.push([x, y])
      const hit = hits.find((entry) => entry.x === x && entry.y === y)
      if (!hit) return null
      return {
        closest(selector: string) {
          selectors.push(selector)
          if (!hit.targetId) return null
          return { getAttribute: (name: string) => (name === DROP_ATTR ? hit.targetId : null) }
        },
      }
    },
  }
  return { document: document as unknown as Pick<Document, "elementFromPoint">, queried, selectors }
}

describe("resolveNativeDrop", () => {
  it("hits the element under the logical point, not the physical one", () => {
    const { document, queried } = stubDocument([{ x: 400, y: 300, targetId: "local-file-drop-a" }])
    const event = resolveNativeDrop({ paths: ["/tmp/a.txt"], position: { x: 800, y: 600 } }, document, 2)

    expect(queried).toEqual([[400, 300]])
    expect(event).toEqual({ files: ["/tmp/a.txt"], targetId: "local-file-drop-a" })
  })

  /// Control for the case above: the same payload on a scale of 1 lands on nothing, so no target is attributed.
  it("attributes nothing when the point falls outside every target", () => {
    const { document, queried } = stubDocument([{ x: 400, y: 300, targetId: "local-file-drop-a" }])
    expect(resolveNativeDrop({ paths: ["/tmp/a.txt"], position: { x: 800, y: 600 } }, document, 1)).toEqual({ files: ["/tmp/a.txt"] })
    expect(queried).toEqual([[800, 600]])
  })

  it("looks up the closest marked ancestor, which is what makes a drop on a child still count", () => {
    const { document, selectors } = stubDocument([{ x: 10, y: 20, targetId: "local-file-drop-7" }])
    expect(resolveNativeDrop({ paths: ["/x"], position: { x: 10, y: 20 } }, document)?.targetId).toBe("local-file-drop-7")
    expect(selectors).toEqual([`[${DROP_ATTR}]`])
  })

  it("keeps the paths when the point is over an unmarked element, so the host can report or stage", () => {
    const { document } = stubDocument([{ x: 1, y: 2 }])
    expect(resolveNativeDrop({ paths: ["/x"], position: { x: 1, y: 2 } }, document)).toEqual({ files: ["/x"] })
  })

  it("skips the hit test entirely when the event carries no position", () => {
    const { document, queried } = stubDocument([{ x: 8, y: 8, targetId: "t" }])
    expect(resolveNativeDrop({ paths: ["/x"] }, document)).toEqual({ files: ["/x"] })
    expect(queried).toEqual([])
  })

  it("treats a zero or non-finite device pixel ratio as 1 rather than dividing by it", () => {
    const { document, queried } = stubDocument([{ x: 30, y: 40, targetId: "t" }])
    resolveNativeDrop({ paths: ["/x"], position: { x: 30, y: 40 } }, document, 0)
    resolveNativeDrop({ paths: ["/x"], position: { x: 30, y: 40 } }, document, Number.NaN)
    expect(queried).toEqual([[30, 40], [30, 40]])
  })

  it("answers undefined for a payload with no usable path, so nothing is dispatched", () => {
    expect(resolveNativeDrop({}, undefined)).toBeUndefined()
    expect(resolveNativeDrop({ paths: [] }, undefined)).toBeUndefined()
    expect(resolveNativeDrop({ paths: [""] }, undefined)).toBeUndefined()
    expect(resolveNativeDrop({ paths: [null as unknown as string, "/real"] }, undefined)).toEqual({ files: ["/real"] })
  })
})

interface DropHost {
  webView: unknown
  listen: ReturnType<typeof vi.fn>
  listeners: Array<{ event: string; handler: (message: { payload?: unknown }) => void }>
  released: string[]
  queried: Array<[number, number]>
}

function fakeDropHost(devicePixelRatio = 1): DropHost {
  const listeners: DropHost["listeners"] = []
  const released: string[] = []
  const queried: Array<[number, number]> = []
  const listen = vi.fn(async (event: string, handler: (message: { payload?: unknown }) => void) => {
    listeners.push({ event, handler })
    return async () => {
      released.push(event)
    }
  })
  // A DOM with one target covering the logical 100x100 square, so the hit test resolves for real.
  const document = {
    elementFromPoint(x: number, y: number) {
      queried.push([x, y])
      if (x > 100 || y > 100) return null
      return { closest: () => ({ getAttribute: (name: string) => (name === DROP_ATTR ? "local-file-drop-boxed" : null) }) }
    },
  }
  return {
    webView: {
      __TAURI__: { core: { invoke: vi.fn(async () => undefined) }, event: { listen } },
      devicePixelRatio,
      document,
    },
    listen,
    listeners,
    released,
    queried,
  }
}

describe("Tauri file-drop adapter", () => {
  /// One native event per drop, however many targets are mounted: a listener per target multiplies IPC.
  it("shares a single tauri://drag-drop listener between subscribers and fans the event out", async () => {
    const host = fakeDropHost()
    const drops = createTauriRuntime(host.webView).fileDrops
    const first = vi.fn()
    const second = vi.fn()

    await drops.subscribe(first)
    await drops.subscribe(second)

    expect(host.listen).toHaveBeenCalledTimes(1)
    expect(host.listeners[0]?.event).toBe("tauri://drag-drop")

    host.listeners[0]?.handler({ payload: { paths: ["/tmp/a.txt"], position: { x: 2, y: 2 } } })
    expect(first).toHaveBeenCalledWith({ files: ["/tmp/a.txt"], targetId: "local-file-drop-boxed" })
    expect(second).toHaveBeenCalledWith({ files: ["/tmp/a.txt"], targetId: "local-file-drop-boxed" })
  })

  it("releases the native listener once the last subscriber leaves, and listens again for the next one", async () => {
    const host = fakeDropHost()
    const drops = createTauriRuntime(host.webView).fileDrops
    const unsubscribeFirst = await drops.subscribe(vi.fn())
    const unsubscribeSecond = await drops.subscribe(vi.fn())

    unsubscribeFirst()
    expect(host.released).toEqual([])

    unsubscribeSecond()
    expect(host.released).toEqual(["tauri://drag-drop"])

    await drops.subscribe(vi.fn())
    expect(host.listen).toHaveBeenCalledTimes(2)
  })

  it("drops an empty payload instead of handing an empty file list to every target", async () => {
    const host = fakeDropHost()
    const handler = vi.fn()
    await createTauriRuntime(host.webView).fileDrops.subscribe(handler)

    host.listeners[0]?.handler({ payload: {} })
    host.listeners[0]?.handler({ payload: { paths: [] } })
    expect(handler).not.toHaveBeenCalled()
  })

  /// The ratio comes from the window the adapter was built with, not from a global the test could fake.
  it("divides by the pixel ratio read off its own window", async () => {
    const host = fakeDropHost(2)
    const handler = vi.fn()
    await createTauriRuntime(host.webView).fileDrops.subscribe(handler)

    host.listeners[0]?.handler({ payload: { paths: ["/a"], position: { x: 120, y: 40 } } })
    expect(host.queried).toEqual([[60, 20]])
    expect(handler).toHaveBeenCalledWith({ files: ["/a"], targetId: "local-file-drop-boxed" })

    host.listeners[0]?.handler({ payload: { paths: ["/b"], position: { x: 400, y: 40 } } })
    expect(handler).toHaveBeenLastCalledWith({ files: ["/b"] })
  })

  it("degrades to a no-op subscription when the event API is missing", async () => {
    const runtime = createTauriRuntime({ __TAURI__: { core: { invoke: vi.fn() } } })
    const unsubscribe = await runtime.fileDrops.subscribe(vi.fn())
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe("Tauri shell adapter", () => {
  /// `shell.rs` names its argument `options`; a renamed key deserializes as the defaults, i.e. a silent wrong dialog.
  it("sends the picker request under the options key and reads paths back off each entry", async () => {
    const invoke = vi.fn(async () => [{ path: "/a.zip" }, { path: "/b.7z" }, { unexpected: true }, { path: "" }])
    const runtime = createTauriRuntime({ __TAURI__: { core: { invoke }, event: {} } })

    expect(
      await runtime.shell.pickPaths({ kind: "files", multiple: true, title: "选择归档", extensions: ["zip", "7z"] }),
    ).toEqual(["/a.zip", "/b.7z"])
    expect(invoke).toHaveBeenLastCalledWith("xiranite_dialog_pick", {
      options: { kind: "files", multiple: true, title: "选择归档", extensions: ["zip", "7z"] },
    })
  })

  it("reads a cancelled dialog as an empty list, not an error", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => [])
    const runtime = createTauriRuntime({ __TAURI__: { core: { invoke }, event: {} } })
    expect(await runtime.shell.pickPaths({ kind: "directory", multiple: false })).toEqual([])
    expect(invoke).toHaveBeenLastCalledWith("xiranite_dialog_pick", { options: { kind: "directory", multiple: false } })
  })

  it("answers open and reveal with the path key the host commands declare", async () => {
    const { webView, invoke } = fakeTauri()
    const shell = createTauriRuntime(webView).shell

    await shell.openPath("/tmp/report.pdf")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_shell_open_path", { path: "/tmp/report.pdf" })

    await shell.revealPath("/tmp/report.pdf")
    expect(invoke).toHaveBeenLastCalledWith("xiranite_shell_reveal_path", { path: "/tmp/report.pdf" })
  })

  /// A cancelled dialog is `[]` from the host; a rejected command is a real failure and must not become [].
  it("propagates a rejected command as an error", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => Promise.reject(new Error("dialog kind must be files or directory")))
    const shell = createTauriRuntime({ __TAURI__: { core: { invoke }, event: {} } }).shell

    await expect(shell.pickPaths({ kind: "files" })).rejects.toThrow("dialog kind must be files or directory")
    await expect(shell.openPath("")).rejects.toThrow("dialog kind must be files or directory")
    await expect(shell.revealPath("/tmp")).rejects.toThrow("dialog kind must be files or directory")
  })

  it("keeps the browser-face picker available on the tauri runtime contract", () => {
    const runtime = createTauriRuntime(fakeTauri().webView)
    expect(typeof runtime.shell.pickPaths).toBe("function")
    expect(typeof runtime.fileDrops.subscribe).toBe("function")
  })
})
