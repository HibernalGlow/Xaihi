export const MUSIC_VISUALIZER_STYLE_VALUES = [
  "None",
  "Waveform",
  "NewtonsCradle",
  "Miyagi",
  "DotWave",
  "Bouncy",
  "BouncyArc",
  "Cardio",
  "ChaoticOrbit",
  "DotPulse",
  "DotSpinner",
  "DotStream",
  "Grid",
  "Hatch",
  "Helix",
  "Hourglass",
  "Infinity",
  "Jelly",
  "JellyTriangle",
  "Leapfrog",
  "LineSpinner",
  "LineWobble",
  "Metronome",
  "Mirage",
  "Momentum",
  "Orbit",
  "Ping",
  "Pinwheel",
  "Pulsar",
  "Quantum",
  "Reuleaux",
  "Ring",
  "Ring2",
  "Ripples",
  "Spiral",
  "Square",
  "Squircle",
  "Superballs",
  "TailChase",
  "Tailspin",
  "Treadmill",
  "Trefoil",
  "Trio",
  "Wobble",
  "Zoomies",
] as const

export type MusicVisualizerStyle = (typeof MUSIC_VISUALIZER_STYLE_VALUES)[number]

export const DEFAULT_MUSIC_VISUALIZER_STYLE: MusicVisualizerStyle = "Waveform"

const MUSIC_VISUALIZER_STYLE_SET = new Set<string>(MUSIC_VISUALIZER_STYLE_VALUES)

export const MUSIC_VISUALIZER_STYLE_OPTIONS = MUSIC_VISUALIZER_STYLE_VALUES.map((value) => ({
  value,
  label: value === "None" ? "无波形" : formatMusicVisualizerStyleLabel(value),
}))

export function normalizeMusicVisualizerStyle(value: string | null | undefined): MusicVisualizerStyle {
  return value && MUSIC_VISUALIZER_STYLE_SET.has(value)
    ? value as MusicVisualizerStyle
    : DEFAULT_MUSIC_VISUALIZER_STYLE
}

export function getMusicVisualizerStyleLabel(style: MusicVisualizerStyle): string {
  return MUSIC_VISUALIZER_STYLE_OPTIONS.find((option) => option.value === style)?.label ?? style
}

function formatMusicVisualizerStyleLabel(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
}
