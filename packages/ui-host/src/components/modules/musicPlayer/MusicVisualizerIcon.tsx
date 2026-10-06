import type { ComponentType } from "react"
import {
  Bouncy,
  BouncyArc,
  Cardio,
  ChaoticOrbit,
  DotPulse,
  DotSpinner,
  DotStream,
  DotWave,
  Grid,
  Hatch,
  Helix,
  Hourglass,
  Infinity,
  Jelly,
  JellyTriangle,
  Leapfrog,
  LineSpinner,
  LineWobble,
  Metronome,
  Mirage,
  Miyagi,
  Momentum,
  NewtonsCradle,
  Orbit,
  Ping,
  Pinwheel,
  Pulsar,
  Quantum,
  Reuleaux,
  Ring,
  Ring2,
  Ripples,
  Spiral,
  Square,
  Squircle,
  Superballs,
  TailChase,
  Tailspin,
  Treadmill,
  Trefoil,
  Trio,
  Waveform,
  Wobble,
  Zoomies,
} from "ldrs/react"
import "ldrs/react/Bouncy.css"
import "ldrs/react/BouncyArc.css"
import "ldrs/react/Cardio.css"
import "ldrs/react/ChaoticOrbit.css"
import "ldrs/react/DotPulse.css"
import "ldrs/react/DotSpinner.css"
import "ldrs/react/DotStream.css"
import "ldrs/react/DotWave.css"
import "ldrs/react/Grid.css"
import "ldrs/react/Hatch.css"
import "ldrs/react/Helix.css"
import "ldrs/react/Hourglass.css"
import "ldrs/react/Infinity.css"
import "ldrs/react/Jelly.css"
import "ldrs/react/JellyTriangle.css"
import "ldrs/react/Leapfrog.css"
import "ldrs/react/LineSpinner.css"
import "ldrs/react/LineWobble.css"
import "ldrs/react/Metronome.css"
import "ldrs/react/Mirage.css"
import "ldrs/react/Miyagi.css"
import "ldrs/react/Momentum.css"
import "ldrs/react/NewtonsCradle.css"
import "ldrs/react/Orbit.css"
import "ldrs/react/Ping.css"
import "ldrs/react/Pinwheel.css"
import "ldrs/react/Pulsar.css"
import "ldrs/react/Quantum.css"
import "ldrs/react/Reuleaux.css"
import "ldrs/react/Ring.css"
import "ldrs/react/Ring2.css"
import "ldrs/react/Ripples.css"
import "ldrs/react/Spiral.css"
import "ldrs/react/Square.css"
import "ldrs/react/Squircle.css"
import "ldrs/react/Superballs.css"
import "ldrs/react/TailChase.css"
import "ldrs/react/Tailspin.css"
import "ldrs/react/Treadmill.css"
import "ldrs/react/Trefoil.css"
import "ldrs/react/Trio.css"
import "ldrs/react/Waveform.css"
import "ldrs/react/Wobble.css"
import "ldrs/react/Zoomies.css"
import type { MusicVisualizerStyle } from "./visualizerStyles"

interface LdrsCommonProps {
  size?: number | string
  color?: string
  speed?: number | string
  stroke?: number | string
  bgOpacity?: number | string
}

interface MusicVisualizerIconProps {
  compact?: boolean
  isPlaying: boolean
  style: MusicVisualizerStyle
}

const MUSIC_VISUALIZER_COMPONENTS: Record<Exclude<MusicVisualizerStyle, "None">, ComponentType<LdrsCommonProps>> = {
  Bouncy,
  BouncyArc,
  Cardio,
  ChaoticOrbit,
  DotPulse,
  DotSpinner,
  DotStream,
  DotWave,
  Grid,
  Hatch,
  Helix,
  Hourglass,
  Infinity,
  Jelly,
  JellyTriangle,
  Leapfrog,
  LineSpinner,
  LineWobble,
  Metronome,
  Mirage,
  Miyagi,
  Momentum,
  NewtonsCradle,
  Orbit,
  Ping,
  Pinwheel,
  Pulsar,
  Quantum,
  Reuleaux,
  Ring,
  Ring2,
  Ripples,
  Spiral,
  Square,
  Squircle,
  Superballs,
  TailChase,
  Tailspin,
  Treadmill,
  Trefoil,
  Trio,
  Waveform,
  Wobble,
  Zoomies,
}

const WIDE_VISUALIZER_STYLES = new Set<MusicVisualizerStyle>([
  "DotStream",
  "DotWave",
  "Leapfrog",
  "LineWobble",
  "Metronome",
  "Mirage",
  "Momentum",
  "NewtonsCradle",
  "Trio",
  "Treadmill",
  "Waveform",
  "Zoomies",
])

export function MusicVisualizerIcon({
  compact = false,
  isPlaying,
  style,
}: MusicVisualizerIconProps) {
  if (style === "None") return null
  const Visualizer = MUSIC_VISUALIZER_COMPONENTS[style]

  return (
    <Visualizer
      key={style}
      size={getVisualizerSize(style, compact)}
      color="currentColor"
      speed={isPlaying ? getVisualizerSpeed(style) : 0}
      {...getVisualizerExtraProps(style, compact)}
    />
  )
}

function getVisualizerSize(style: MusicVisualizerStyle, compact: boolean): number {
  if (style === "Waveform") return compact ? 18 : 21
  if (style === "NewtonsCradle") return compact ? 28 : 36
  if (style === "LineWobble") return compact ? 26 : 34
  if (WIDE_VISUALIZER_STYLES.has(style)) return compact ? 23 : 30
  return compact ? 16 : 20
}

function getVisualizerSpeed(style: MusicVisualizerStyle): number {
  if (style === "NewtonsCradle") return 1.45
  if (style === "Waveform") return 1.1
  if (style === "LineWobble" || style === "Zoomies") return 1.35
  return 1.2
}

function getVisualizerExtraProps(style: MusicVisualizerStyle, compact: boolean): Pick<LdrsCommonProps, "stroke" | "bgOpacity"> {
  if (style === "Waveform") return { stroke: compact ? 2.8 : 3.2 }
  if (style === "Miyagi") return { stroke: compact ? 2.4 : 3 }
  if (style === "LineWobble") return { stroke: compact ? 4 : 5, bgOpacity: 0.18 }
  return {}
}
