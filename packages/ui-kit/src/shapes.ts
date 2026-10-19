/**
 * Material 3 Expressive shape catalog for consumers that do not depend on the
 * Xaihi host. Shape is an independent axis: callers choose a shape and a
 * semantic tone separately.
 */

export type XMd3eShapeId =
  | 'rounded-square'
  | 'circle'
  | 'slanted'
  | 'arch'
  | 'semi-circle'
  | 'oval'
  | 'pill'
  | 'triangle'
  | 'inverted-triangle'
  | 'fan'
  | 'diamond'
  | 'hexagon'
  | 'pentagon'
  | 'gem'
  | 'sunny'
  | 'very-sunny'
  | 'cookie-6'
  | 'cookie-8'
  | 'cookie-12'
  | 'clover-4'
  | 'clover-leaf'
  | 'burst'
  | 'sunburst'
  | 'bloom'
  | 'soft-bloom'
  | 'flower'
  | 'puff'
  | 'playful-diamond'
  | 'ghost'
  | 'pinwheel'
  | 'pixel-triangle'
  | 'bow'
  | 'heart'
  | 'pebble'
  | 'shield'
  | 'octagon'

export interface XMd3eShapeSpec {
  id: XMd3eShapeId
  label: string
  clipPath?: string
  borderRadius?: string
  pressedClipPath?: string
  pressedBorderRadius?: string
  /** Optional expanded phase geometry. CSS scale/rotation is the fallback. */
  expandedClipPath?: string
  expandedBorderRadius?: string
}

const polygon = (points: string): string => `polygon(${points})`

function derivePolygonPhase(clipPath: string | undefined, scale: number): string | undefined {
  if (clipPath === undefined || !clipPath.startsWith('polygon(') || !clipPath.endsWith(')')) return undefined
  const body = clipPath.slice('polygon('.length, -1)
  const points = body.split(',').map((point) => point.trim())
  if (points.length < 3) return undefined
  const transformed = points.map((point) => {
    const match = point.match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/u)
    if (match === null) return point
    const x = Math.max(0, Math.min(100, 50 + (Number(match[1]) - 50) * scale))
    const y = Math.max(0, Math.min(100, 50 + (Number(match[2]) - 50) * scale))
    return `${x}% ${y}%`
  })
  return polygon(transformed.join(', '))
}

const RAW_XMD3E_SHAPES: readonly XMd3eShapeSpec[] = [
  { id: 'rounded-square', label: 'Rounded square', borderRadius: '24% 18% 28% 16% / 20% 24% 18% 28%', pressedBorderRadius: '38% 16% 18% 30% / 28% 18% 30% 20%' },
  { id: 'circle', label: 'Circle', borderRadius: '50%', pressedBorderRadius: '42% 58% 48% 52% / 58% 42% 52% 48%' },
  { id: 'slanted', label: 'Slanted', clipPath: polygon('18% 6%, 94% 6%, 82% 94%, 6% 94%') },
  { id: 'arch', label: 'Arch', clipPath: 'path("M 8 96 L 8 50 C 8 24 26 6 50 6 C 74 6 92 24 92 50 L 92 96 Z")' },
  { id: 'semi-circle', label: 'Semi circle', clipPath: 'path("M 4 96 L 4 50 A 46 46 0 0 1 96 50 L 96 96 Z")' },
  { id: 'oval', label: 'Oval', borderRadius: '50% / 36%' },
  { id: 'pill', label: 'Pill', borderRadius: '999px' },
  { id: 'triangle', label: 'Triangle', clipPath: polygon('50% 4%, 96% 94%, 4% 94%') },
  { id: 'inverted-triangle', label: 'Inverted triangle', clipPath: polygon('4% 6%, 96% 6%, 50% 96%') },
  { id: 'fan', label: 'Fan', clipPath: 'path("M 8 92 A 46 46 0 0 1 92 92 L 70 92 A 24 24 0 0 0 30 92 Z")' },
  { id: 'diamond', label: 'Diamond', clipPath: polygon('50% 2%, 98% 50%, 50% 98%, 2% 50%') },
  { id: 'hexagon', label: 'Hexagon', clipPath: polygon('25% 4%, 75% 4%, 98% 50%, 75% 96%, 25% 96%, 2% 50%') },
  { id: 'pentagon', label: 'Pentagon', clipPath: polygon('50% 4%, 96% 36%, 78% 96%, 22% 96%, 4% 36%') },
  { id: 'gem', label: 'Gem', clipPath: polygon('22% 4%, 78% 4%, 98% 50%, 50% 98%, 2% 50%'), pressedClipPath: polygon('28% 10%, 72% 10%, 90% 50%, 50% 90%, 10% 50%') },
  { id: 'sunny', label: 'Sunny', clipPath: polygon('50% 0%, 58% 16%, 74% 6%, 76% 24%, 96% 18%, 86% 36%, 100% 50%, 86% 64%, 96% 82%, 76% 76%, 74% 94%, 58% 84%, 50% 100%, 42% 84%, 26% 94%, 24% 76%, 4% 82%, 14% 64%, 0% 50%, 14% 36%, 4% 18%, 24% 24%, 26% 6%, 42% 16%'), pressedClipPath: polygon('50% 8%, 58% 20%, 72% 14%, 74% 28%, 90% 24%, 82% 40%, 94% 50%, 82% 60%, 90% 76%, 74% 72%, 72% 86%, 58% 80%, 50% 92%, 42% 80%, 28% 86%, 26% 72%, 10% 76%, 18% 60%, 6% 50%, 18% 40%, 10% 24%, 26% 28%, 28% 14%, 42% 20%') },
  { id: 'very-sunny', label: 'Very sunny', clipPath: polygon('50% 0%, 55% 12%, 65% 2%, 68% 16%, 80% 8%, 78% 24%, 94% 20%, 84% 34%, 100% 40%, 84% 50%, 100% 60%, 84% 66%, 94% 80%, 78% 76%, 80% 92%, 68% 84%, 65% 98%, 55% 88%, 50% 100%, 45% 88%, 35% 98%, 32% 84%, 20% 92%, 22% 76%, 6% 80%, 16% 66%, 0% 60%, 16% 50%, 0% 40%, 16% 34%, 6% 20%, 22% 24%, 20% 8%, 32% 16%, 35% 2%, 45% 12%') },
  { id: 'cookie-6', label: 'Cookie 6', clipPath: polygon('50% 4%, 66% 14%, 84% 10%, 86% 28%, 98% 44%, 84% 56%, 86% 74%, 66% 86%, 50% 96%, 34% 86%, 14% 74%, 16% 56%, 2% 44%, 14% 28%, 16% 10%, 34% 14%') },
  { id: 'cookie-8', label: 'Cookie 8', clipPath: polygon('50% 2%, 62% 12%, 78% 6%, 82% 22%, 98% 28%, 88% 44%, 98% 58%, 82% 66%, 78% 84%, 62% 78%, 50% 98%, 38% 78%, 22% 84%, 18% 66%, 2% 58%, 12% 44%, 2% 28%, 18% 22%, 22% 6%, 38% 12%'), pressedClipPath: polygon('50% 8%, 60% 18%, 74% 14%, 78% 28%, 90% 34%, 82% 46%, 90% 58%, 78% 66%, 74% 80%, 60% 76%, 50% 90%, 40% 76%, 26% 80%, 22% 66%, 10% 58%, 18% 46%, 10% 34%, 22% 28%, 26% 14%, 40% 18%') },
  { id: 'cookie-12', label: 'Cookie 12', clipPath: polygon('50% 0%, 57% 12%, 68% 4%, 70% 17%, 84% 12%, 80% 25%, 96% 24%, 86% 36%, 100% 44%, 86% 52%, 96% 64%, 80% 63%, 84% 76%, 70% 71%, 68% 84%, 57% 76%, 50% 100%, 43% 76%, 32% 84%, 30% 71%, 16% 76%, 20% 63%, 4% 64%, 14% 52%, 0% 44%, 14% 36%, 4% 24%, 20% 25%, 16% 12%, 30% 17%, 32% 4%, 43% 12%') },
  { id: 'clover-4', label: 'Clover 4', clipPath: 'path("M 50 50 C 22 50 8 40 12 22 C 16 6 34 8 50 28 C 66 8 84 6 88 22 C 92 40 78 50 50 50 C 78 50 92 60 88 78 C 84 94 66 92 50 72 C 34 92 16 94 12 78 C 8 60 22 50 50 50 Z")' },
  { id: 'clover-leaf', label: 'Clover leaf', clipPath: 'path("M 50 6 C 72 6 86 18 78 38 C 98 30 104 48 88 60 C 98 80 78 92 62 76 C 58 98 36 98 34 76 C 12 92 -2 72 14 58 C -4 42 10 24 30 34 C 24 12 34 6 50 6 Z")' },
  { id: 'burst', label: 'Burst', clipPath: polygon('50% 0%, 58% 18%, 72% 4%, 74% 24%, 94% 14%, 84% 34%, 100% 50%, 84% 66%, 94% 86%, 74% 76%, 72% 96%, 58% 82%, 50% 100%, 42% 82%, 28% 96%, 26% 76%, 6% 86%, 16% 66%, 0% 50%, 16% 34%, 6% 14%, 26% 24%, 28% 4%, 42% 18%') },
  { id: 'sunburst', label: 'Sunburst', clipPath: polygon('50% 0%, 54% 22%, 63% 4%, 65% 24%, 78% 8%, 73% 28%, 94% 20%, 80% 36%, 100% 50%, 80% 54%, 94% 80%, 73% 72%, 78% 92%, 65% 76%, 63% 96%, 54% 78%, 50% 100%, 46% 78%, 37% 96%, 35% 76%, 22% 92%, 27% 72%, 6% 80%, 20% 54%, 0% 50%, 20% 36%, 6% 20%, 27% 28%, 22% 8%, 35% 24%, 37% 4%, 46% 22%') },
  { id: 'bloom', label: 'Bloom', clipPath: 'path("M 50 50 C 20 42 18 18 34 12 C 42 8 48 20 50 32 C 52 20 58 8 66 12 C 82 18 80 42 50 50 C 80 58 82 82 66 88 C 58 92 52 80 50 68 C 48 80 42 92 34 88 C 18 82 20 58 50 50 Z")' },
  { id: 'soft-bloom', label: 'Soft bloom', borderRadius: '50% 32% 52% 44% / 42% 58% 44% 56%' },
  { id: 'flower', label: 'Flower', clipPath: 'path("M 50 30 C 40 2 20 2 16 18 C 12 32 26 40 30 50 C 2 40 2 60 18 66 C 32 72 40 58 50 54 C 40 82 60 82 66 66 C 72 52 58 42 54 50 C 82 60 82 40 66 34 C 52 28 42 42 50 30 Z")' },
  { id: 'puff', label: 'Puff', borderRadius: '42% 58% 36% 64% / 58% 38% 62% 42%' },
  { id: 'playful-diamond', label: 'Playful diamond', clipPath: polygon('48% 2%, 68% 18%, 98% 32%, 78% 54%, 82% 94%, 50% 76%, 18% 96%, 22% 56%, 2% 34%, 34% 18%') },
  { id: 'ghost', label: 'Ghost', clipPath: 'path("M 16 94 L 16 38 C 16 18 30 6 50 6 C 70 6 84 18 84 38 L 84 94 L 68 82 L 50 94 L 32 82 Z")' },
  { id: 'pinwheel', label: 'Pinwheel', clipPath: polygon('50% 4%, 62% 38%, 96% 28%, 64% 50%, 94% 78%, 56% 62%, 38% 96%, 42% 60%, 4% 74%, 36% 50%, 8% 22%, 44% 38%') },
  { id: 'pixel-triangle', label: 'Pixel triangle', clipPath: polygon('36% 4%, 64% 4%, 64% 24%, 82% 24%, 82% 48%, 98% 48%, 98% 96%, 2% 96%, 2% 48%, 18% 48%, 18% 24%, 36% 24%') },
  { id: 'bow', label: 'Bow', clipPath: 'path("M 50 50 C 34 18 10 6 8 22 C 6 38 28 50 50 50 C 28 50 6 62 8 78 C 10 94 34 82 50 50 C 66 82 90 94 92 78 C 94 62 72 50 50 50 C 72 50 94 38 92 22 C 90 6 66 18 50 50 Z")' },
  { id: 'heart', label: 'Heart', clipPath: 'path("M 50 90 C 40 80 8 62 8 34 C 8 12 34 4 50 26 C 66 4 92 12 92 34 C 92 62 60 80 50 90 Z")' },
  { id: 'pebble', label: 'Pebble', borderRadius: '58% 42% 56% 44% / 42% 54% 46% 58%' },
  { id: 'shield', label: 'Shield', clipPath: 'path("M 10 10 L 90 10 L 90 56 C 90 78 50 96 50 96 C 50 96 10 78 10 56 Z")' },
  { id: 'octagon', label: 'Octagon', clipPath: polygon('28% 4%, 72% 4%, 96% 28%, 96% 72%, 72% 96%, 28% 96%, 4% 72%, 4% 28%') },
]

/** Every catalog entry has a readable three-phase contract. */
export const XMD3E_SHAPES: readonly XMd3eShapeSpec[] = RAW_XMD3E_SHAPES.map((shape) => ({
  ...shape,
  ...(shape.pressedClipPath ?? derivePolygonPhase(shape.clipPath, 0.9) ?? shape.clipPath ? { pressedClipPath: shape.pressedClipPath ?? derivePolygonPhase(shape.clipPath, 0.9) ?? shape.clipPath } : {}),
  ...(shape.pressedBorderRadius ?? shape.borderRadius ? { pressedBorderRadius: shape.pressedBorderRadius ?? shape.borderRadius } : {}),
  ...(shape.expandedClipPath ?? derivePolygonPhase(shape.clipPath, 1.04) ?? shape.clipPath ? { expandedClipPath: shape.expandedClipPath ?? derivePolygonPhase(shape.clipPath, 1.04) ?? shape.clipPath } : {}),
  ...(shape.expandedBorderRadius ?? shape.borderRadius ? { expandedBorderRadius: shape.expandedBorderRadius ?? shape.borderRadius } : {}),
}))

export function getXMd3eShape(shape: string | undefined): XMd3eShapeSpec {
  return XMD3E_SHAPES.find((item) => item.id === shape) ?? XMD3E_SHAPES[0]!
}

export type XMd3eShapePhase = 'idle' | 'pressed' | 'expanded'

export interface XMd3eResolvedShapePhase {
  clipPath?: string | undefined
  borderRadius?: string | undefined
}

/** Resolve the geometry for a readable, serializable shape phase. */
export function getXMd3eShapePhase(shape: XMd3eShapeSpec, phase: XMd3eShapePhase): XMd3eResolvedShapePhase {
  if (phase === 'expanded') {
    return {
      clipPath: shape.expandedClipPath ?? shape.clipPath,
      borderRadius: shape.expandedBorderRadius ?? shape.borderRadius,
    }
  }
  if (phase === 'pressed') {
    return {
      clipPath: shape.pressedClipPath ?? shape.clipPath,
      borderRadius: shape.pressedBorderRadius ?? shape.borderRadius,
    }
  }
  return { clipPath: shape.clipPath, borderRadius: shape.borderRadius }
}
