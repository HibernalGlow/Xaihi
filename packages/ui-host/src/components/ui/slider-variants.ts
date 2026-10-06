/**
 * Global visual treatments for the shared Radix Slider primitive.
 *
 * Covers Magic Card parameter rails, settings density sliders, and every
 * other horizontal/vertical Slider in node surfaces. Appearance only.
 */
export const SLIDER_DISPLAY_STYLES = ["solid", "soft", "pill", "line", "minimal", "none"] as const

export type SliderDisplayStyle = (typeof SLIDER_DISPLAY_STYLES)[number]

export const DEFAULT_SLIDER_DISPLAY_STYLE: SliderDisplayStyle = "solid"
