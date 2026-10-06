import type {
  ComponentWindowFrameEvent,
  MainWindowAction,
  OpenComponentWindowInput,
  WindowCapabilities,
  WindowCommandResult,
  WindowFrame,
} from "../runtime/runtime"
import type { Service, ServiceContext } from "./index"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class WindowService implements Service<"windows"> {
  readonly name = "windows"
  private readonly ctx: ServiceContext

  constructor(ctx: ServiceContext) {
    this.ctx = ctx
  }

  async getCapabilities(): Promise<WindowCapabilities> {
    try {
      return await this.ctx.runtime.windows.getCapabilities()
    } catch (error) {
      return {
        supported: false,
        nativeWindowControls: false,
        frameless: false,
        // Nothing answered, so nothing is known about the OS title bar; `renderer` is the answer that
        // keeps this app's own chrome logic, and `nativeWindowControls: false` already hides it.
        captionOwner: "renderer",
        componentWindows: "unsupported",
        message: errorMessage(error),
      }
    }
  }

  async controlMain(action: MainWindowAction): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.controlMain(action)
    } catch (error) {
      return {
        success: false,
        supported: false,
        message: errorMessage(error),
      }
    }
  }

  async controlComponent(id: string, action: MainWindowAction): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.controlComponent(id, action)
    } catch (error) {
      return {
        success: false,
        supported: false,
        id,
        message: errorMessage(error),
      }
    }
  }

  async openComponent(input: OpenComponentWindowInput): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.openComponent(input)
    } catch (error) {
      return {
        success: false,
        supported: false,
        message: errorMessage(error),
      }
    }
  }

  async focus(id: string): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.focus(id)
    } catch (error) {
      return {
        success: false,
        supported: false,
        id,
        message: errorMessage(error),
      }
    }
  }

  async close(id: string): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.close(id)
    } catch (error) {
      return {
        success: false,
        supported: false,
        id,
        message: errorMessage(error),
      }
    }
  }

  async openDevTools(id?: string): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.openDevTools(id)
    } catch (error) {
      return {
        success: false,
        supported: false,
        id,
        message: errorMessage(error),
      }
    }
  }

  async getFrame(id?: string): Promise<WindowFrame | null> {
    try {
      return await this.ctx.runtime.windows.getFrame(id)
    } catch {
      return null
    }
  }

  async setFrame(frame: WindowFrame, id?: string): Promise<WindowCommandResult> {
    try {
      return await this.ctx.runtime.windows.setFrame(frame, id)
    } catch (error) {
      return {
        success: false,
        supported: false,
        id,
        message: errorMessage(error),
      }
    }
  }

  async subscribeFrameChanges(handler: (event: ComponentWindowFrameEvent) => void): Promise<() => void> {
    try {
      return await this.ctx.runtime.windows.subscribeFrameChanges(handler)
    } catch {
      return () => undefined
    }
  }
}
