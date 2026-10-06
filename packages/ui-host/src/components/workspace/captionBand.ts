import type { WindowCapabilities } from "@/backend/runtime/runtime"

/**
 * Measured on AppKit (macOS 27, arm64) for a titled window with a transparent, full-size-content
 * titlebar: each button frame is 14×14 and the close → miniaturize → zoom origins step by 23pt, so the
 * group spans `inset + 2 × 23 + 14` = inset + 60pt. 8pt of clearance follows before app content starts.
 */
const CAPTION_TRAFFIC_LIGHT_GROUP = 2 * 23 + 14
const CAPTION_TRAFFIC_LIGHT_CLEARANCE = 8

/** The inset `tauri.macos.conf.json` configures, for a host that reports no inset at all. */
const FALLBACK_INSET_X = 16

/**
 * How much of the top edge belongs to the OS traffic lights. Both chrome that has to stay out of the way
 * (`TopBar`, a floating window's node title bar) pads its leading edge by this, so the number is derived in
 * exactly one place — from the inset the host reads out of the same config AppKit is given.
 */
export function captionBandInlinePx(inset: WindowCapabilities["captionInset"]): string {
  return `${(inset?.x ?? FALLBACK_INSET_X) + CAPTION_TRAFFIC_LIGHT_GROUP + CAPTION_TRAFFIC_LIGHT_CLEARANCE}px`
}
