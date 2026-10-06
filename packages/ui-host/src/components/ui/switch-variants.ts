/** Visual treatments for the shared Radix Switch primitive. */
export const SWITCH_DISPLAY_STYLES = ["outlined", "filled", "minimal", "none"] as const

export type SwitchDisplayStyle = (typeof SWITCH_DISPLAY_STYLES)[number]
