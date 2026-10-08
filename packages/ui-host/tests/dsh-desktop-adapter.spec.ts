import { describe, expect, it, vi } from "vitest"
import { createDshDesktopRuntime, detectDshDesktopRuntime } from "../src/backend/adapters/dshDesktop"

function fakeDshDesktop(overrides = {}) {
  const open = vi.fn(async () => ({ windowId: 42, alreadyOpen: false }))
  const getCapabilities = vi.fn(async () => ({
    supported: true as const,
    nativeWindowControls: true,
    frameless: false,
    captionOwner: "system" as const,
    captionInset: { x: 16, y: 18 },
    componentWindows: "native" as const,
    message: "Xaihi desktop shell: native component windows",
  }))
  const controlMain = vi.fn(async (action: string) => ({
    success: true,
    supported: true,
    message: `Applied ${action}`,
    state: "normal" as const,
  }))
  const controlComponent = vi.fn(async (windowId: number, action: string) => ({
    success: true,
    supported: true,
    windowId,
    message: `Applied ${action}`,
    state: "normal" as const,
  }))
  const focus = vi.fn(async (windowId: number) => ({ windowId }))
  const close = vi.fn(async (windowId: number) => ({ windowId }))
  const getBounds = vi.fn(async (_windowId: number) => ({ x: 100, y: 120, width: 800, height: 600 }))
  const setBounds = vi.fn(async (_windowId: number, bounds: { x: number; y: number; width: number; height: number }) => bounds)
  const openDevTools = vi.fn(async (windowId?: number) => ({ success: true, supported: true, windowId, message: "DevTools opened" }))
  const startDragging = vi.fn(async (windowId?: number) => ({ success: false, supported: false, windowId, message: "System framed" }))
  const subscribeFrameChanges = vi.fn((_cb: (bounds: { windowId: number; x: number; y: number; width: number; height: number }) => void) => vi.fn())

  const xaihiWindow = {
    open,
    getCapabilities,
    controlMain,
    controlComponent,
    focus,
    close,
    getBounds,
    setBounds,
    openDevTools,
    startDragging,
    subscribeFrameChanges,
    ...overrides,
  }

  const scope = {
    dshDesktop: {
      protocolVersion: 1,
      xaihiWindow,
    },
  }

  return {
    scope,
    xaihiWindow,
    open,
    getCapabilities,
    controlMain,
    controlComponent,
    focus,
    close,
    getBounds,
    setBounds,
    subscribeFrameChanges,
  }
}

describe("detectDshDesktopRuntime", () => {
  it("returns false for undefined or plain browser window", () => {
    expect(detectDshDesktopRuntime(undefined)).toBe(false)
    expect(detectDshDesktopRuntime({})).toBe(false)
  })

  it("returns true when dshDesktop is on scope", () => {
    expect(detectDshDesktopRuntime({ dshDesktop: {} })).toBe(true)
  })
})

describe("DshDesktopWindowRuntime on patched shell", () => {
  it("forwards getCapabilities to xaihiWindow", async () => {
    const { scope, getCapabilities } = fakeDshDesktop()
    const runtime = createDshDesktopRuntime(scope)
    expect(runtime.kind).toBe("electron")

    const caps = await runtime.windows.getCapabilities()
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    expect(caps.captionOwner).toBe("system")
    expect(caps.componentWindows).toBe("native")
  })

  it("opens native secondary window and tracks windowId mapping", async () => {
    const { scope, open, controlComponent, focus, close, getBounds, setBounds } = fakeDshDesktop()
    const runtime = createDshDesktopRuntime(scope)

    const openResult = await runtime.windows.openComponent({
      componentId: "comp-findz-1",
      moduleId: "findz",
      width: 700,
      height: 500,
    })

    expect(open).toHaveBeenCalledWith("findz", { width: 700, height: 500 })
    expect(openResult.success).toBe(true)
    expect(openResult.supported).toBe(true)

    // Now actions using componentId map to windowId 42
    await runtime.windows.controlComponent("comp-findz-1", "maximize")
    expect(controlComponent).toHaveBeenCalledWith(42, "maximize")

    await runtime.windows.focus("comp-findz-1")
    expect(focus).toHaveBeenCalledWith(42)

    await runtime.windows.getFrame("comp-findz-1")
    expect(getBounds).toHaveBeenCalledWith(42)

    await runtime.windows.setFrame({ x: 50, y: 50, width: 800, height: 600 }, "comp-findz-1")
    expect(setBounds).toHaveBeenCalledWith(42, { x: 50, y: 50, width: 800, height: 600 })

    await runtime.windows.close("comp-findz-1")
    expect(close).toHaveBeenCalledWith(42)
  })

  it("controls main window via controlMain", async () => {
    const { scope, controlMain } = fakeDshDesktop()
    const runtime = createDshDesktopRuntime(scope)

    const result = await runtime.windows.controlMain("minimize")
    expect(controlMain).toHaveBeenCalledWith("minimize")
    expect(result.success).toBe(true)
  })

  it("maps windowId in frame change events back to componentId", async () => {
    let capturedCallback: ((bounds: { windowId: number; x: number; y: number; width: number; height: number }) => void) | undefined
    const { scope } = fakeDshDesktop({
      subscribeFrameChanges: (cb: typeof capturedCallback) => {
        capturedCallback = cb
        return vi.fn()
      },
    })
    const runtime = createDshDesktopRuntime(scope)

    await runtime.windows.openComponent({
      componentId: "comp-sleept-1",
      moduleId: "sleept",
      workspaceId: "ws-1",
    })

    const handler = vi.fn()
    await runtime.windows.subscribeFrameChanges(handler)

    expect(capturedCallback).toBeDefined()
    capturedCallback!({ windowId: 42, x: 10, y: 20, width: 400, height: 300 })

    expect(handler).toHaveBeenCalledWith({
      componentId: "comp-sleept-1",
      moduleId: "sleept",
      workspaceId: "ws-1",
      x: 10,
      y: 20,
      width: 400,
      height: 300,
    })
  })
})

describe("DshDesktopWindowRuntime on stock shell (graceful degradation)", () => {
  it("reports unsupported and stock-shell degradation without crashing", async () => {
    const scope = { dshDesktop: { protocolVersion: 1 } }
    const runtime = createDshDesktopRuntime(scope)

    const caps = await runtime.windows.getCapabilities()
    expect(caps.supported).toBe(false)
    expect(caps.componentWindows).toBe("unsupported")
    expect(caps.message).toContain("stock-shell")

    const openResult = await runtime.windows.openComponent({
      componentId: "cmp-1",
      moduleId: "findz",
    })
    expect(openResult.supported).toBe(false)
    expect(openResult.success).toBe(false)

    const controlResult = await runtime.windows.controlMain("maximize")
    expect(controlResult.supported).toBe(false)
  })
})
