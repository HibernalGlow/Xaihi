/**
 * Global visual treatments for native scrollbars and the shared Radix ScrollArea.
 *
 * The preference is intentionally separate from local hide-on-purpose utilities
 * (toolbars, swimlanes). Local `hide-scrollbar` / `[data-scrollbar="hidden"]`
 * always win; this setting only chooses one visual language for visible bars.
 */
export const SCROLLBAR_DISPLAY_STYLES = ["thin", "soft", "solid", "rounded", "minimal", "none"] as const

export type ScrollbarDisplayStyle = (typeof SCROLLBAR_DISPLAY_STYLES)[number]

export const DEFAULT_SCROLLBAR_DISPLAY_STYLE: ScrollbarDisplayStyle = "soft"
