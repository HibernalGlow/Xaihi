import { createWebRuntime } from "./web"
import type {
  ComponentWindowFrameEvent,
  MainWindowAction,
  OpenComponentWindowInput,
  RuntimeInterface,
  WindowCapabilities,
  WindowCommandResult,
  WindowFrame,
  WindowRuntime,
} from "../runtime/runtime"

interface DshXaihiWindowApi {
  open?(node: string, options?: { documentPath?: string; width?: number; height?: number }): Promise<{ readonly windowId: number; readonly alreadyOpen: boolean }>
  getCapabilities?(): Promise<WindowCapabilities>
  controlMain?(action: MainWindowAction): Promise<WindowCommandResult>
  controlComponent?(windowId: number, action: MainWindowAction): Promise<WindowCommandResult>
  openDevTools?(windowId?: number): Promise<WindowCommandResult>
  startDragging?(windowId?: number): Promise<WindowCommandResult>
  focus?(windowId: number): Promise<{ readonly windowId: number }>
  close?(windowId: number): Promise<{ readonly windowId: number }>
  getBounds?(windowId: number): Promise<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }>
  setBounds?(windowId: number, bounds: { x: number; y: number; width: number; height: number }): Promise<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }>
  subscribeFrameChanges?(callback: (bounds: { readonly windowId: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => void): () => void
}

interface DshDesktopSurface {
  dshDesktop?: {
    protocolVersion?: number
    xaihiWindow?: DshXaihiWindowApi
  }
}

export class DshDesktopWindowRuntime implements WindowRuntime {
  private readonly componentToWindowId = new Map<string, number>()
  private readonly windowIdToComponent = new Map<number, { componentId: string; moduleId: string; workspaceId?: string }>()

  constructor(private readonly scope: unknown = typeof window !== "undefined" ? window : undefined) {}

  private getWindowApi(): DshXaihiWindowApi | undefined {
    const surface = (this.scope ?? (typeof window !== "undefined" ? window : undefined)) as DshDesktopSurface | undefined
    return surface?.dshDesktop?.xaihiWindow
  }

  private resolveWindowId(id: string): number | undefined {
    if (/^\d+$/.test(id)) return Number(id)
    return this.componentToWindowId.get(id)
  }

  async getCapabilities(): Promise<WindowCapabilities> {
    const windowApi = this.getWindowApi()
    if (windowApi?.getCapabilities && typeof windowApi.getCapabilities === "function") {
      return await windowApi.getCapabilities()
    }
    return {
      supported: false,
      nativeWindowControls: false,
      frameless: false,
      captionOwner: "renderer",
      componentWindows: "unsupported",
      message: "Official DSH Desktop does not provide Xaihi window capabilities (stock-shell).",
    }
  }

  async controlMain(action: MainWindowAction): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.controlMain || typeof windowApi.controlMain !== "function") {
      return {
        success: false,
        supported: false,
        message: "Native window controls are not available in this shell.",
      }
    }
    const result = await windowApi.controlMain(action)
    return {
      success: result.success,
      supported: result.supported,
      id: result.id,
      message: result.message,
      state: result.state,
    }
  }

  async controlComponent(id: string, action: MainWindowAction): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.controlComponent || typeof windowApi.controlComponent !== "function") {
      return {
        success: false,
        supported: false,
        id,
        message: "Native component window controls are not available in this shell.",
      }
    }
    const windowId = this.resolveWindowId(id)
    if (windowId === undefined) {
      return {
        success: false,
        supported: true,
        id,
        message: `Unknown component window: ${id}`,
      }
    }
    const result = await windowApi.controlComponent(windowId, action)
    return {
      success: result.success,
      supported: result.supported,
      id,
      message: result.message,
      state: result.state,
    }
  }

  async openComponent(input: OpenComponentWindowInput): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.open || typeof windowApi.open !== "function") {
      return {
        success: false,
        supported: false,
        id: input.componentId,
        message: "DSH Desktop stock-shell cannot open native secondary windows.",
      }
    }

    const node = input.moduleId || input.componentId
    const options = {
      width: input.width,
      height: input.height,
    }

    try {
      const result = await windowApi.open(node, options)
      this.componentToWindowId.set(input.componentId, result.windowId)
      this.windowIdToComponent.set(result.windowId, {
        componentId: input.componentId,
        moduleId: input.moduleId,
        workspaceId: input.workspaceId,
      })
      return {
        success: true,
        supported: true,
        id: input.componentId,
        message: result.alreadyOpen
          ? `Focused existing window for node ${node} (windowId ${result.windowId})`
          : `Opened native secondary window for node ${node} (windowId ${result.windowId})`,
      }
    } catch (error: unknown) {
      return {
        success: false,
        supported: true,
        id: input.componentId,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async focus(id: string): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.focus || typeof windowApi.focus !== "function") {
      return { success: false, supported: false, id, message: "Focus is not supported" }
    }
    const windowId = this.resolveWindowId(id)
    if (windowId === undefined) {
      return { success: false, supported: true, id, message: `Unknown window: ${id}` }
    }
    await windowApi.focus(windowId)
    return { success: true, supported: true, id, message: `Focused window ${windowId}` }
  }

  async close(id: string): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.close || typeof windowApi.close !== "function") {
      return { success: false, supported: false, id, message: "Close is not supported" }
    }
    const windowId = this.resolveWindowId(id)
    if (windowId === undefined) {
      return { success: false, supported: true, id, message: `Unknown window: ${id}` }
    }
    await windowApi.close(windowId)
    this.componentToWindowId.delete(id)
    this.windowIdToComponent.delete(windowId)
    return { success: true, supported: true, id, message: `Closed window ${windowId}` }
  }

  async openDevTools(id?: string): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.openDevTools || typeof windowApi.openDevTools !== "function") {
      return { success: false, supported: false, id, message: "openDevTools is not supported" }
    }
    const windowId = id ? this.resolveWindowId(id) : undefined
    const result = await windowApi.openDevTools(windowId)
    return {
      success: result.success,
      supported: result.supported,
      id,
      message: result.message,
    }
  }

  async getFrame(id?: string): Promise<WindowFrame | null> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.getBounds || typeof windowApi.getBounds !== "function") return null
    const windowId = id ? this.resolveWindowId(id) : undefined
    if (windowId === undefined) return null
    return await windowApi.getBounds(windowId)
  }

  async setFrame(frame: WindowFrame, id?: string): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.setBounds || typeof windowApi.setBounds !== "function") {
      return { success: false, supported: false, id, message: "setBounds is not supported" }
    }
    const windowId = id ? this.resolveWindowId(id) : undefined
    if (windowId === undefined) {
      return { success: false, supported: true, id, message: `Unknown window: ${id}` }
    }
    await windowApi.setBounds(windowId, frame)
    return { success: true, supported: true, id, message: `Set frame for window ${windowId}` }
  }

  async startDragging(id?: string): Promise<WindowCommandResult> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.startDragging || typeof windowApi.startDragging !== "function") {
      return { success: false, supported: false, id, message: "startDragging is not supported" }
    }
    const windowId = id ? this.resolveWindowId(id) : undefined
    const result = await windowApi.startDragging(windowId)
    return {
      success: result.success,
      supported: result.supported,
      id,
      message: result.message,
    }
  }

  async subscribeFrameChanges(handler: (event: ComponentWindowFrameEvent) => void): Promise<() => void> {
    const windowApi = this.getWindowApi()
    if (!windowApi?.subscribeFrameChanges || typeof windowApi.subscribeFrameChanges !== "function") {
      return () => {}
    }
    const unlisten = windowApi.subscribeFrameChanges((bounds) => {
      const meta = this.windowIdToComponent.get(bounds.windowId)
      handler({
        componentId: meta?.componentId ?? String(bounds.windowId),
        moduleId: meta?.moduleId ?? "",
        workspaceId: meta?.workspaceId,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
    })
    return () => {
      unlisten?.()
    }
  }
}

export function detectDshDesktopRuntime(scope: unknown = typeof window !== "undefined" ? window : undefined): boolean {
  if (!scope || typeof scope !== "object") return false
  const surface = scope as DshDesktopSurface
  return typeof surface.dshDesktop === "object" && surface.dshDesktop !== null
}

export function createDshDesktopRuntime(scope: unknown = typeof window !== "undefined" ? window : undefined): RuntimeInterface {
  const web = createWebRuntime()
  return {
    ...web,
    kind: "electron",
    windows: new DshDesktopWindowRuntime(scope),
  }
}
