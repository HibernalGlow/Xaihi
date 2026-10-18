export type Md3eExpressiveShapeId =
  | "circle"
  | "square"
  | "squircle"
  | "rounded"
  | "sunny-10"
  | "clover-4"
  | "flower-8"
  | "cookie-6"
  | "cookie-8"
  | "cookie-12"
  | "gem"
  | "pentagon"
  | "arch"
  | "cookie-4"
  | "hexagon"
  | "octagon"
  | "shield"
  | "pebble"

export type Md3eButtonRole = "primary" | "secondary" | "toolbar" | "danger" | "action" | "tab"
export type Md3eTextButtonShapeId = "rounded" | "soft" | "capsule"
export type Md3eShapePolicyMode = "fixed" | "random-on-startup"
export type Md3eQuickPresetId = "default" | "friendly" | "cheerful" | "modern"
export type Md3eShapeDegradationReason =
  | "css-clip-path-unsupported"
  | "high-contrast-legibility-floor"
  | "compact-320-legibility-floor"
  | "xs-icon-legibility-floor"

export interface Md3eExpressiveShapeSpec {
  id: Md3eExpressiveShapeId
  name: string
  svgPath: string
  clipPath?: string
}

export interface Md3eResolvedButtonShape {
  shapeId: Md3eExpressiveShapeId
  /** Stable aliases used by the MD3E host seam and DOM readback. */
  id: Md3eExpressiveShapeId
  requestedId: Md3eExpressiveShapeId
  status: "active" | "degraded"
  degradedReason: Md3eShapeDegradationReason | null
  applyClipPath: boolean
  spec: Md3eExpressiveShapeSpec
}

export interface Md3eNodeShapePolicy {
  mode: Md3eShapePolicyMode
  roleShapes: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  /** Persisted spelling used by the DSH nodeUi document. */
  fixedRoleShapes?: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  textShape: Md3eTextButtonShapeId
}

export interface Md3eShapeCapabilityProbeInput {
  cssClipPathSupported?: boolean
  contrastLevel?: number
  forcedColors?: boolean
}

export const MD3E_BUTTON_ROLES: readonly Md3eButtonRole[] = [
  "primary",
  "secondary",
  "toolbar",
  "danger",
  "action",
  "tab",
]

export function isIconButtonSize(size: string | null | undefined): boolean {
  return size === "icon" || size === "icon-sm" || size === "icon-xs"
}

export function mapVariantToMd3eButtonRole(variant: string | null | undefined): Md3eButtonRole {
  switch (variant) {
    case "secondary":
      return "secondary"
    case "outline":
      return "action"
    case "destructive":
      return "danger"
    case "ghost":
      return "toolbar"
    default:
      return "primary"
  }
}

function generatePolarPetalPath(petals: number, rMin: number, rMax: number): string {
  const points: [number, number][] = []
  const steps = petals * 6
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI - Math.PI / 2
    const r = rMin + (rMax - rMin) * (0.5 + 0.5 * Math.cos(petals * theta))
    const x = Math.round((50 + r * Math.cos(theta)) * 100) / 100
    const y = Math.round((50 + r * Math.sin(theta)) * 100) / 100
    points.push([x, y])
  }
  return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ") + " Z"
}

export const MD3E_EXPRESSIVE_SHAPES: readonly Md3eExpressiveShapeSpec[] = [
  {
    id: "circle",
    name: "圆形",
    svgPath: "M 50, 0 A 50, 50 0 1, 0 50, 100 A 50, 50 0 1, 0 50, 0 Z",
  },
  {
    id: "squircle",
    name: "方圆",
    svgPath: "M 50 2 C 78 2 98 22 98 50 C 98 78 78 98 50 98 C 22 98 2 78 2 50 C 2 22 22 2 50 2 Z",
  },
  {
    id: "clover-4",
    name: "四叶草",
    svgPath: "M 50 14.48 L 53.98 12.09 L 58.44 10.29 L 63.24 9.24 L 68.22 9.08 L 73.16 9.88 L 77.85 11.66 L 82.07 14.38 L 85.62 17.93 L 88.34 22.15 L 90.12 26.84 L 90.92 31.78 L 90.76 36.76 L 89.71 41.56 L 87.91 46.02 L 85.52 50 L 87.91 53.98 L 89.71 58.44 L 90.76 63.24 L 90.92 68.22 L 90.12 73.16 L 88.34 77.85 L 85.62 82.07 L 82.07 85.62 L 77.85 88.34 L 73.16 90.12 L 68.22 90.92 L 63.24 90.76 L 58.44 89.71 L 53.98 87.91 L 50 85.52 L 46.02 87.91 L 41.56 89.71 L 36.76 90.76 L 31.78 90.92 L 26.84 90.12 L 22.15 88.34 L 17.93 85.62 L 14.38 82.07 L 11.66 77.85 L 9.88 73.16 L 9.08 68.22 L 9.24 63.24 L 10.29 58.44 L 12.09 53.98 L 14.48 50 L 12.09 46.02 L 10.29 41.56 L 9.24 36.76 L 9.08 31.78 L 9.88 26.84 L 11.66 22.15 L 14.38 17.93 L 17.93 14.38 L 22.15 11.66 L 26.84 9.88 L 31.78 9.08 L 36.76 9.24 L 41.56 10.29 L 46.02 12.09 Z",
  },
  {
    id: "flower-8",
    name: "八瓣花",
    svgPath: generatePolarPetalPath(8, 38, 48),
  },
  {
    id: "sunny-10",
    name: "太阳轮",
    svgPath: "M 50 20.24 L 53.59 15.87 L 59.03 7.51 L 64.83 4.35 L 67.67 10.32 L 67.16 20.28 L 67.49 25.92 L 72.96 24.5 L 82.28 20.93 L 88.83 21.79 L 87.62 28.28 L 81.35 36.04 L 78.3 40.8 L 83.57 42.86 L 93.2 45.46 L 98 50 L 93.2 54.54 L 83.57 57.14 L 78.3 59.2 L 81.35 63.96 L 87.62 71.72 L 88.83 78.21 L 82.28 79.07 L 72.96 75.5 L 67.49 74.08 L 67.16 79.72 L 67.67 89.68 L 64.83 95.65 L 59.03 92.49 L 53.59 84.13 L 50 79.76 L 46.41 84.13 L 40.97 92.49 L 35.17 95.65 L 32.33 89.68 L 32.84 79.72 L 32.51 74.08 L 27.04 75.5 L 17.72 79.07 L 11.17 78.21 L 12.38 71.72 L 18.65 63.96 L 21.7 59.2 L 16.43 57.14 L 6.8 54.54 L 2 50 L 6.8 45.46 L 16.43 42.86 L 21.7 40.8 L 18.65 36.04 L 12.38 28.28 L 11.17 21.79 L 17.72 20.93 L 27.04 24.5 L 32.51 25.92 L 32.84 20.28 L 32.33 10.32 L 35.17 4.35 L 40.97 7.51 L 46.41 15.87 Z",
  },
  {
    id: "cookie-6",
    name: "六瓣曲奇",
    svgPath: generatePolarPetalPath(6, 36, 48),
  },
  {
    id: "cookie-8",
    name: "八瓣曲奇",
    svgPath: generatePolarPetalPath(8, 36, 48),
  },
  {
    id: "cookie-12",
    name: "十二瓣曲奇",
    svgPath: generatePolarPetalPath(12, 40, 48),
  },
  {
    id: "gem",
    name: "宝石",
    svgPath: "M 25 6 L 75 6 L 96 50 L 50 96 L 4 50 Z",
  },
  {
    id: "pentagon",
    name: "五边形",
    svgPath: "M 50 4 L 94 36 L 77 88 L 23 88 L 6 36 Z",
  },
  {
    id: "arch",
    name: "拱券",
    svgPath: "M 10 94 L 10 50 C 10 28 28 10 50 10 C 72 10 90 28 90 50 L 90 94 Z",
  },
  {
    id: "cookie-4",
    name: "四瓣曲奇",
    svgPath: generatePolarPetalPath(4, 34, 48),
  },
  {
    id: "hexagon",
    name: "六边形",
    svgPath: "M 50 4 L 92 27 L 92 73 L 50 96 L 8 73 L 8 27 Z",
  },
  {
    id: "octagon",
    name: "八边形",
    svgPath: "M 32 4 L 68 4 L 96 32 L 96 68 L 68 96 L 32 96 L 4 68 L 4 32 Z",
  },
  {
    id: "shield",
    name: "盾徽",
    svgPath: "M 12 12 L 88 12 L 88 56 C 88 78 50 94 50 94 C 50 94 12 78 12 56 Z",
  },
  {
    id: "pebble",
    name: "鹅卵石",
    svgPath: "M 30 6 C 65 2 96 25 94 58 C 92 85 68 98 40 94 C 15 90 4 68 8 40 C 12 18 18 8 30 6 Z",
  },
  {
    id: "square",
    name: "方块",
    svgPath: "M 8 8 L 92 8 L 92 92 L 8 92 Z",
  },
  {
    id: "rounded",
    name: "圆角方块",
    svgPath: "M 24 6 L 76 6 C 88 6 94 12 94 24 L 94 76 C 94 88 88 94 76 94 L 24 94 C 12 94 6 88 6 76 L 6 24 C 6 12 12 6 24 6 Z",
  },
]

export const MD3E_PRIMARY_ICON_SHAPE_PRESETS = [
  { id: "circle", name: "圆形", spec: MD3E_EXPRESSIVE_SHAPES[0] },
  { id: "squircle", name: "方圆", spec: MD3E_EXPRESSIVE_SHAPES[1] },
  { id: "flower-8", name: "波瓣", spec: MD3E_EXPRESSIVE_SHAPES[3] },
  { id: "clover-4", name: "四叶", spec: MD3E_EXPRESSIVE_SHAPES[2] },
]

export const MD3E_TEXT_BUTTON_SHAPES = [
  { id: "rounded", name: "圆角", radiusClass: "rounded-md" },
  { id: "soft", name: "柔和", radiusClass: "rounded-xl" },
  { id: "capsule", name: "胶囊", radiusClass: "rounded-full" },
]

export const MD3E_QUICK_PRESETS: Record<Md3eQuickPresetId, { name: string; roles: Record<Md3eButtonRole, Md3eExpressiveShapeId>; textShape: Md3eTextButtonShapeId }> = {
  default: {
    name: "标准",
    roles: { primary: "circle", secondary: "squircle", toolbar: "circle", danger: "octagon", action: "squircle", tab: "squircle" },
    textShape: "capsule",
  },
  friendly: {
    name: "亲和",
    roles: { primary: "clover-4", secondary: "cookie-8", toolbar: "squircle", danger: "shield", action: "cookie-6", tab: "squircle" },
    textShape: "capsule",
  },
  cheerful: {
    name: "活跃",
    roles: { primary: "sunny-10", secondary: "flower-8", toolbar: "circle", danger: "octagon", action: "cookie-12", tab: "rounded" },
    textShape: "soft",
  },
  modern: {
    name: "现代",
    roles: { primary: "squircle", secondary: "hexagon", toolbar: "squircle", danger: "gem", action: "pentagon", tab: "rounded" },
    textShape: "rounded",
  },
}

export function getMd3eShapeSpec(shapeId: string): Md3eExpressiveShapeSpec {
  const spec = MD3E_EXPRESSIVE_SHAPES.find((s) => s.id === shapeId) ?? MD3E_EXPRESSIVE_SHAPES[0]
  const polygon = "polygon(50% 0%, 84% 14%, 100% 50%, 84% 86%, 50% 100%, 16% 86%, 0% 50%, 16% 14%)"
  return { ...spec, clipPath: polygon }
}

const memoryPolicyStore = new Map<string, Md3eNodeShapePolicy>()

let sessionStartupSeed = Date.now()
const sessionRoleShapeCache = new Map<string, Record<Md3eButtonRole, Md3eExpressiveShapeId>>()

export function getSessionStartupSeed(): number {
  return sessionStartupSeed
}

export function resetSessionStartupSeedForTesting(seed: number): void {
  sessionStartupSeed = seed
  sessionRoleShapeCache.clear()
}

function hashSeed(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function sessionShapesForNode(nodeId: string): Record<Md3eButtonRole, Md3eExpressiveShapeId> {
  const existing = sessionRoleShapeCache.get(nodeId)
  if (existing) return existing
  const pool = MD3E_EXPRESSIVE_SHAPES.map((shape) => shape.id)
  const roles = Object.fromEntries(
    MD3E_BUTTON_ROLES.map((role, index) => [role, pool[hashSeed(`${sessionStartupSeed}:${nodeId}:${role}`) % pool.length] ?? "circle"]),
  ) as Record<Md3eButtonRole, Md3eExpressiveShapeId>
  sessionRoleShapeCache.set(nodeId, roles)
  return roles
}

type NodeUiConfigStoreLike = {
  read: (nodeId: string) => Promise<unknown>
  write: (nodeId: string, value: unknown) => Promise<void>
}

function normalizePolicy(policy: Partial<Md3eNodeShapePolicy> & { fixedRoleShapes?: Record<Md3eButtonRole, Md3eExpressiveShapeId> }): Md3eNodeShapePolicy {
  const roleShapes = policy.roleShapes ?? policy.fixedRoleShapes ?? { ...MD3E_QUICK_PRESETS.default.roles }
  return {
    mode: policy.mode === "random-on-startup" ? "random-on-startup" : "fixed",
    roleShapes,
    fixedRoleShapes: policy.fixedRoleShapes ?? roleShapes,
    textShape: policy.textShape ?? "capsule",
  }
}

export function readNodeShapePolicy(nodeId: string): Md3eNodeShapePolicy
export function readNodeShapePolicy(nodeId: string, store: NodeUiConfigStoreLike): Promise<{
  persistenceSource: "dsh-settings" | "local-fallback" | "default"
  policy: Md3eNodeShapePolicy
}>
export function readNodeShapePolicy(nodeId: string, store?: NodeUiConfigStoreLike): Md3eNodeShapePolicy | Promise<{
  persistenceSource: "dsh-settings" | "local-fallback" | "default"
  policy: Md3eNodeShapePolicy
}> {
  if (store) {
    return store.read(nodeId).then((raw) => {
      const document = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
      const stored = document.shapePolicy && typeof document.shapePolicy === "object" ? document.shapePolicy as Partial<Md3eNodeShapePolicy> & { fixedRoleShapes?: Record<Md3eButtonRole, Md3eExpressiveShapeId> } : {}
      const policy = normalizePolicy(stored)
      memoryPolicyStore.set(nodeId, policy)
      return { persistenceSource: "dsh-settings" as const, policy }
    })
  }
  const existing = memoryPolicyStore.get(nodeId)
  if (existing) return existing
  const fallback = normalizePolicy({})
  memoryPolicyStore.set(nodeId, fallback)
  return fallback
}

export async function writeNodeShapePolicy(nodeId: string, policy: Md3eNodeShapePolicy, store?: NodeUiConfigStoreLike): Promise<void> {
  const normalized = normalizePolicy(policy)
  memoryPolicyStore.set(nodeId, normalized)
  if (!store) return
  const current = await store.read(nodeId)
  const document = current && typeof current === "object" ? current as Record<string, unknown> : {}
  await store.write(nodeId, {
    ...document,
    shapePolicy: {
      mode: normalized.mode,
      fixedRoleShapes: normalized.roleShapes,
    },
  })
}

export function resolveSessionRoleShapes(policy: Md3eNodeShapePolicy): Record<Md3eButtonRole, Md3eExpressiveShapeId>
export function resolveSessionRoleShapes(nodeId: string): Record<Md3eButtonRole, Md3eExpressiveShapeId>
export function resolveSessionRoleShapes(policyOrNodeId: Md3eNodeShapePolicy | string): Record<Md3eButtonRole, Md3eExpressiveShapeId> {
  if (typeof policyOrNodeId === "string") return sessionShapesForNode(policyOrNodeId)
  if (policyOrNodeId.mode === "random-on-startup" && !policyOrNodeId.roleShapes) return sessionShapesForNode("workspace")
  return policyOrNodeId.roleShapes ?? policyOrNodeId.fixedRoleShapes ?? MD3E_QUICK_PRESETS.default.roles
}

function resolveShapeId(
  requestedId: Md3eExpressiveShapeId,
  probe?: Md3eShapeCapabilityProbeInput & { surfaceWidth?: number; surfaceMode?: string; buttonSize?: string },
  size?: string,
): Md3eResolvedButtonShape {
  const requestedSpec = getMd3eShapeSpec(requestedId)
  const buttonSize = size ?? probe?.buttonSize
  const degraded = (id: Md3eExpressiveShapeId, reason: Md3eShapeDegradationReason): Md3eResolvedButtonShape => ({
    shapeId: id,
    id,
    requestedId,
    status: "degraded",
    degradedReason: reason,
    applyClipPath: false,
    spec: getMd3eShapeSpec(id),
  })

  if (probe?.cssClipPathSupported === false) {
    return degraded("circle", "css-clip-path-unsupported")
  }

  if ((probe?.contrastLevel ?? 0) > 0 || probe?.forcedColors) {
    return degraded("squircle", "high-contrast-legibility-floor")
  }

  if (probe?.surfaceWidth && probe.surfaceWidth <= 320) {
    return degraded("circle", "compact-320-legibility-floor")
  }

  if (buttonSize === "xs" || buttonSize === "icon-xs") {
    return degraded("squircle", "xs-icon-legibility-floor")
  }

  return {
    shapeId: requestedId,
    id: requestedId,
    requestedId,
    status: "active",
    degradedReason: null,
    applyClipPath: true,
    spec: requestedSpec,
  }
}

export function resolveMd3eButtonShape(
  shapeId: Md3eExpressiveShapeId,
  probe?: Md3eShapeCapabilityProbeInput & { surfaceWidth?: number; surfaceMode?: string; buttonSize?: string },
): Md3eResolvedButtonShape
export function resolveMd3eButtonShape(
  role: Md3eButtonRole,
  activeShapes: Record<Md3eButtonRole, Md3eExpressiveShapeId>,
  probe?: Md3eShapeCapabilityProbeInput & { surfaceWidth?: number; surfaceMode?: string; buttonSize?: string },
  size?: string,
): Md3eResolvedButtonShape
export function resolveMd3eButtonShape(
  roleOrShape: Md3eButtonRole | Md3eExpressiveShapeId,
  activeShapesOrProbe?: Record<Md3eButtonRole, Md3eExpressiveShapeId> | (Md3eShapeCapabilityProbeInput & { surfaceWidth?: number; surfaceMode?: string; buttonSize?: string }),
  probe?: Md3eShapeCapabilityProbeInput & { surfaceWidth?: number; surfaceMode?: string; buttonSize?: string },
  size?: string,
): Md3eResolvedButtonShape {
  if (typeof activeShapesOrProbe === "object" && activeShapesOrProbe && "cssClipPathSupported" in activeShapesOrProbe) {
    return resolveShapeId(roleOrShape as Md3eExpressiveShapeId, activeShapesOrProbe, activeShapesOrProbe.buttonSize)
  }
  const activeShapes = activeShapesOrProbe as Record<Md3eButtonRole, Md3eExpressiveShapeId> | undefined
  return resolveShapeId(activeShapes?.[roleOrShape as Md3eButtonRole] ?? "circle", probe, size)
}
