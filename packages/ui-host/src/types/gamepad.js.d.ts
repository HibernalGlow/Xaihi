declare module "gamepad.js" {
  export interface GamepadButtonEventDetail {
    index: number
    button: number
    pressed: boolean
    value: number
    label?: string
    gamepad: Gamepad
  }

  export interface GamepadConnectionEventDetail {
    index: number
    gamepad?: Gamepad
    mapping?: string | null
  }

  export class GamepadListener {
    constructor(options?: { analog?: boolean; deadZone?: number; precision?: number; button?: { analog?: boolean; deadZone?: number; precision?: number } })
    on(type: "gamepad:connected" | "gamepad:disconnected", listener: (event: CustomEvent<GamepadConnectionEventDetail>) => void): void
    off(type: "gamepad:connected" | "gamepad:disconnected", listener: (event: CustomEvent<GamepadConnectionEventDetail>) => void): void
    on(type: "gamepad:button", listener: (event: CustomEvent<GamepadButtonEventDetail>) => void): void
    off(type: "gamepad:button", listener: (event: CustomEvent<GamepadButtonEventDetail>) => void): void
    start(): void
    stop(): void
  }
}
