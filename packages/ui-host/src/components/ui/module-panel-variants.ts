export const MODULE_TITLE_STYLES = ["legend", "inline", "bar", "minimal"] as const
export const MODULE_PANEL_STYLES = ["soft", "solid", "outline", "flat"] as const
export const RESIZABLE_HANDLE_STYLES = ["grip", "dots", "line", "minimal"] as const

export type ModuleTitleStyle = (typeof MODULE_TITLE_STYLES)[number]
export type ModulePanelStyle = (typeof MODULE_PANEL_STYLES)[number]
export type ResizableHandleStyle = (typeof RESIZABLE_HANDLE_STYLES)[number]
