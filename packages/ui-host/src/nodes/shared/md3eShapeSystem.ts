/**
 * Material 3 Expressive（MD3E）控件形状引擎、降级探针与每节点持久化缝（ADR-0033 / DESIGN.md）。
 *
 * 核心契约：
 * 1. **按控件类型适配**：
 *    - 图标按钮（`icon` / `icon-xs` / `icon-sm` / `icon-lg`）可取花瓣、多边形、曲边星等表达性形状；
 *    - 文字按钮（`default` / `xs` / `sm` / `lg`）始终保持适合文字的胶囊/圆角形态（按压向 squircle 形变），绝不裁切文字。
 * 2. **同类一致**：
 *    - 同一节点（`nodeId`）内相同语义角色（`Md3eButtonRole`）的图标按钮共享同一个形状。
 * 3. **启动时随机、会话内稳定**：
 *    - `random-on-startup` 只在应用冷启动（模块初始化）那一刻由会话种子 + `nodeId` 决定一次，
 *      重排、切换视图（cards/flow/lane）、组件卸载重建都不重抽；
 *    - 使用者可随时将当前随机组合"固定（Pin）"写回持久化配置。
 * 4. **降级铁律（ADR-0011 决定 4）与可读性下限（ADR-0033 待确认 #3）**：
 *    - 探测宿主 `CSS.supports("clip-path", ...)`、高对比度模式（`contrastLevel >= 1` / `forced-colors`）
 *      以及窄容器/极小尺寸（≤320px / `collapsed` / `icon-xs`）；
 *    - 不满足完整条件时自动退化到高可读性的 `circle` 或 `squircle`，并把退化状态与原因写进 DOM 属性与可读 UI，
 *      绝不崩溃、绝不静默、绝不伪造。
 * 5. **持久化落点 Seam（ADR-0033 待确认 #1）**：
 *    - 当前默认落进 `xaihi-core.nodeUi[nodeId].shapePolicy`（`NodeUiConfigStore`，与 `restoreOnStartup` 同格合并）；
 *    - 通过 `NodeShapePreferenceCarrier` 留出切往 `xaihi-<node>` 节点 `Config`（`NodeSettingsFace`）的适配缝。
 *
 * 出处说明：设计语言与交互契约参考 `cromaguy/Rhythm`（commit 6f26f963）、`matraic/m3e` 与 `lnkiai/m3e-canvas`，
 * 所有极坐标几何路径与 Web 能力均以 TypeScript 原生重写（MIT）。
 */

import type { NodeUiConfigStore } from "./NodeUiConfigContext"
import type { NodeSurfaceMode } from "./useNodeSurface"

export type Md3eExpressiveShapeId =
  | "circle"
  | "squircle"
  | "cookie-4"
  | "cookie-6"
  | "cookie-8"
  | "cookie-12"
  | "clover-4"
  | "flower-8"
  | "sunny-10"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "gem"
  | "arch"
  | "shield"
  | "pebble"

export type Md3eShapeComplexity = "canonical" | "moderate" | "complex"

export type Md3eButtonRole =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "toolbar"
  | "action"
  | "tab"
  | "command"

export const MD3E_BUTTON_ROLES: readonly Md3eButtonRole[] = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "danger",
  "toolbar",
] as const

export type Md3eShapePolicyMode = "fixed" | "random-on-startup"

export interface Md3eNodeShapePolicy {
  mode: Md3eShapePolicyMode
  fixedRoleShapes: Record<Md3eButtonRole, Md3eExpressiveShapeId>
}

export interface Md3eExpressiveShapeSpec {
  id: Md3eExpressiveShapeId
  name: string
  labelZh: string
  labelEn: string
  complexity: Md3eShapeComplexity
  inRandomPool: boolean
  /** 60 顶点百分比 polygon，响应式适配任意按钮尺寸且支持同顶点数 CSS 平滑形变。 */
  clipPath: string
  /** 按压态（`:active`）向 squircle 收敛的 60 顶点百分比 polygon。 */
  pressedClipPath: string
  /** 归一化到 0..100 的 SVG `<path d="..." />`，供预览与描边使用。 */
  svgPath: string
}

export type Md3eShapeDegradationReason =
  | "css-clip-path-unsupported"
  | "high-contrast-legibility-floor"
  | "compact-320-legibility-floor"
  | "xs-icon-legibility-floor"

export interface Md3eShapeCapabilityProbeInput {
  /** 宿主环境是否支持 CSS clip-path polygon；不传则自动调全局 CSS.supports 探测。 */
  cssClipPathSupported?: boolean
  /** 当前 MD3 对比度档位（-1 | 0 | 0.5 | 1）。 */
  contrastLevel?: number
  /** 系统是否开启 forced-colors 高对比模式。 */
  forcedColors?: boolean
  /** 当前容器宽度（px，来自 useNodeSurface）。 */
  surfaceWidth?: number
  /** 当前容器分档模式（来自 useNodeSurface）。 */
  surfaceMode?: NodeSurfaceMode
  /** 当前图标按钮尺寸档位。 */
  buttonSize?: string
}

export interface Md3eResolvedButtonShape {
  /** 策略原本请求的形状 ID。 */
  requestedId: Md3eExpressiveShapeId
  /** 经过降级与可读性下限裁定后实际生效的形状 ID。 */
  id: Md3eExpressiveShapeId
  shapeId?: Md3eExpressiveShapeId
  spec: Md3eExpressiveShapeSpec
  status: "active" | "degraded"
  degradedReason: Md3eShapeDegradationReason | null
  /** 是否允许在 DOM style 上写 clip-path（当宿主不支持 clip-path 时为 false，回落到 border-radius）。 */
  applyClipPath: boolean
}

const VERTEX_COUNT = 60

/**
 * 采样极坐标半径函数 r(theta) ∈ [0, 1]（中心为 (50, 50)，最大半径 48），
 * 同时产出 60 顶点 CSS `polygon(...)` 与闭合 SVG `path` 字符串。
 */
function buildPolarGeometry(radiusAtAngle: (theta: number) => number): {
  clipPath: string
  svgPath: string
} {
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < VERTEX_COUNT; i += 1) {
    // 从顶部 (-π/2) 开始顺时针采样，保证五边形/六边形/盾牌等顶点朝上对称
    const theta = -Math.PI / 2 + (i / VERTEX_COUNT) * Math.PI * 2
    const r = Math.max(0.25, Math.min(1, radiusAtAngle(theta))) * 48
    const x = Number((50 + r * Math.cos(theta)).toFixed(2))
    const y = Number((50 + r * Math.sin(theta)).toFixed(2))
    points.push({ x, y })
  }

  const clipPath = `polygon(${points.map((pt) => `${pt.x}% ${pt.y}%`).join(", ")})`
  const svgPath = points
    .map((pt, index) => `${index === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ") + " Z"

  return { clipPath, svgPath }
}

/** 圆角正多边形极坐标近似：sides 个角，roundness 控制圆润度（0..1）。 */
function roundedPolygonRadius(sides: number, roundness: number): (theta: number) => number {
  const sector = (Math.PI * 2) / sides
  return (theta: number) => {
    const normalized = ((theta + Math.PI / 2) % sector + sector) % sector - sector / 2
    const polyR = Math.cos(sector / 2) / Math.cos(normalized)
    // 在纯正多边形与单位圆之间按 roundness 插值并叠加柔和余弦瓣
    const blended = polyR * (1 - roundness) + 1 * roundness
    return Math.min(1, blended)
  }
}

/** 超椭圆（squircle）极坐标半径。 */
function superellipseRadius(exponent: number): (theta: number) => number {
  return (theta: number) => {
    const c = Math.abs(Math.cos(theta))
    const s = Math.abs(Math.sin(theta))
    const denom = Math.pow(Math.pow(c, exponent) + Math.pow(s, exponent), 1 / exponent)
    return denom > 0 ? Math.min(1, 0.92 / denom) : 1
  }
}

const PRESSED_SQUIRCLE_GEOMETRY = buildPolarGeometry(superellipseRadius(3.4))

function defineShape(
  id: Md3eExpressiveShapeId,
  labelZh: string,
  labelEn: string,
  complexity: Md3eShapeComplexity,
  inRandomPool: boolean,
  radiusFn: (theta: number) => number,
): Md3eExpressiveShapeSpec {
  const { clipPath, svgPath } = buildPolarGeometry(radiusFn)
  return {
    id,
    name: labelZh,
    labelZh,
    labelEn,
    complexity,
    inRandomPool,
    clipPath,
    pressedClipPath: PRESSED_SQUIRCLE_GEOMETRY.clipPath,
    svgPath,
  }
}

export const MD3E_EXPRESSIVE_SHAPES: readonly Md3eExpressiveShapeSpec[] = [
  defineShape("circle", "标准圆形", "Circle", "canonical", true, () => 1),
  defineShape("squircle", "超椭圆方圆", "Squircle", "canonical", true, superellipseRadius(3.8)),
  defineShape(
    "cookie-4",
    "四瓣曲奇",
    "4-Sided Cookie",
    "moderate",
    true,
    (theta) => 0.9 + 0.1 * Math.cos(4 * (theta + Math.PI / 4)),
  ),
  defineShape(
    "cookie-6",
    "六瓣曲奇",
    "6-Sided Cookie",
    "moderate",
    true,
    (theta) => 0.91 + 0.09 * Math.cos(6 * theta),
  ),
  defineShape(
    "cookie-8",
    "八瓣曲奇",
    "8-Sided Cookie",
    "moderate",
    true,
    (theta) => 0.92 + 0.08 * Math.cos(8 * theta),
  ),
  defineShape(
    "cookie-12",
    "十二瓣花章",
    "12-Sided Cookie",
    "complex",
    true,
    (theta) => 0.93 + 0.07 * Math.cos(12 * theta),
  ),
  defineShape(
    "clover-4",
    "四叶草",
    "4-Leaf Clover",
    "complex",
    true,
    (theta) => 0.84 + 0.16 * Math.abs(Math.cos(2 * (theta + Math.PI / 4))),
  ),
  defineShape(
    "flower-8",
    "八瓣花朵",
    "8-Petal Flower",
    "complex",
    true,
    (theta) => 0.86 + 0.14 * Math.abs(Math.cos(4 * theta)),
  ),
  defineShape(
    "sunny-10",
    "十芒暖阳",
    "10-Point Sunny",
    "complex",
    true,
    (theta) => 0.88 + 0.12 * Math.cos(10 * theta),
  ),
  defineShape("pentagon", "圆角五边形", "Rounded Pentagon", "moderate", true, roundedPolygonRadius(5, 0.32)),
  defineShape("hexagon", "圆角六边形", "Rounded Hexagon", "moderate", true, roundedPolygonRadius(6, 0.3)),
  defineShape("octagon", "圆角八边形", "Rounded Octagon", "moderate", true, roundedPolygonRadius(8, 0.28)),
  defineShape(
    "gem",
    "切角宝石",
    "Faceted Gem",
    "moderate",
    true,
    (theta) => 0.92 + 0.06 * Math.cos(4 * theta) - 0.03 * Math.cos(8 * theta),
  ),
  defineShape(
    "arch",
    "拱廊圆顶",
    "Expressive Arch",
    "moderate",
    true,
    (theta) => {
      const sin = Math.sin(theta)
      return sin < 0 ? 0.98 : Math.min(1, 0.92 + 0.08 * Math.pow(Math.abs(Math.cos(theta)), 1.5))
    },
  ),
  defineShape(
    "shield",
    "柔角徽盾",
    "Soft Shield",
    "moderate",
    true,
    (theta) => 0.91 - 0.05 * Math.sin(theta) + 0.06 * Math.cos(3 * (theta + Math.PI / 2)),
  ),
  defineShape(
    "pebble",
    "有机鹅卵石",
    "Organic Pebble",
    "moderate",
    true,
    (theta) => 0.92 + 0.05 * Math.cos(2 * theta - 0.5) + 0.03 * Math.sin(3 * theta),
  ),
] as const

const SHAPE_BY_ID = new Map<Md3eExpressiveShapeId, Md3eExpressiveShapeSpec>(
  MD3E_EXPRESSIVE_SHAPES.map((spec) => [spec.id, spec]),
)

export const MD3E_SHAPE_IDS: readonly Md3eExpressiveShapeId[] = MD3E_EXPRESSIVE_SHAPES.map((spec) => spec.id)

export const MD3E_RANDOM_SHAPE_POOL: readonly Md3eExpressiveShapeId[] = MD3E_EXPRESSIVE_SHAPES
  .filter((spec) => spec.inRandomPool)
  .map((spec) => spec.id)

export const DEFAULT_FIXED_ROLE_SHAPES: Record<Md3eButtonRole, Md3eExpressiveShapeId> = {
  primary: "cookie-4",
  secondary: "hexagon",
  outline: "squircle",
  ghost: "circle",
  danger: "octagon",
  toolbar: "cookie-6",
}

export const DEFAULT_NODE_SHAPE_POLICY: Md3eNodeShapePolicy = {
  mode: "random-on-startup",
  fixedRoleShapes: { ...DEFAULT_FIXED_ROLE_SHAPES },
}

export function isMd3eExpressiveShapeId(value: unknown): value is Md3eExpressiveShapeId {
  return typeof value === "string" && SHAPE_BY_ID.has(value as Md3eExpressiveShapeId)
}

export function getMd3eShapeSpec(id: Md3eExpressiveShapeId): Md3eExpressiveShapeSpec {
  return SHAPE_BY_ID.get(id) ?? SHAPE_BY_ID.get("circle")!
}

/**
 * 将 shadcn Button 的 `variant` 映射到同类一致的 `Md3eButtonRole`。
 * 同一节点内相同 role 的图标按钮共享同一个形状。
 */
export function mapVariantToMd3eButtonRole(variant: string | null | undefined): Md3eButtonRole {
  switch (variant) {
    case "default":
      return "primary"
    case "secondary":
      return "secondary"
    case "outline":
      return "outline"
    case "destructive":
      return "danger"
    case "ghost":
    case "link":
    default:
      return "ghost"
  }
}

export function isIconButtonSize(size: string | null | undefined): boolean {
  return size === "icon" || size === "icon-xs" || size === "icon-sm" || size === "icon-lg"
}

/**
 * 归一化每节点形状策略配置；缺字段或非法值回退默认，保证持久化边界安全。
 */
export function normalizeNodeShapePolicy(value: unknown): Md3eNodeShapePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      mode: DEFAULT_NODE_SHAPE_POLICY.mode,
      fixedRoleShapes: { ...DEFAULT_FIXED_ROLE_SHAPES },
    }
  }
  const record = value as Record<string, unknown>
  const mode: Md3eShapePolicyMode =
    record.mode === "fixed" || record.mode === "random-on-startup"
      ? record.mode
      : DEFAULT_NODE_SHAPE_POLICY.mode

  const fixedRecord =
    record.fixedRoleShapes && typeof record.fixedRoleShapes === "object" && !Array.isArray(record.fixedRoleShapes)
      ? (record.fixedRoleShapes as Record<string, unknown>)
      : {}

  const fixedRoleShapes = { ...DEFAULT_FIXED_ROLE_SHAPES }
  for (const role of MD3E_BUTTON_ROLES) {
    const candidate = fixedRecord[role]
    if (isMd3eExpressiveShapeId(candidate)) {
      fixedRoleShapes[role] = candidate
    }
  }

  return { mode, fixedRoleShapes }
}

/**
 * FNV-1a 32-bit 散列，结合启动种子与节点/角色名做确定性派生。
 */
function hashString(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * 应用冷启动那一刻生成一次的会话级随机种子。
 * 会话内恒定：重排、切视图、组件卸载重建都不会变。
 */
let sessionStartupSeed: number = (() => {
  const randomFloat = typeof Math.random === "function" ? Math.random() : 0.42
  return (Math.floor(randomFloat * 0x7fffffff) ^ 0x5a17e33d) >>> 0
})()

const sessionNodeRoleShapeCache = new Map<string, Record<Md3eButtonRole, Md3eExpressiveShapeId>>()

export function getSessionStartupSeed(): number {
  return sessionStartupSeed
}

/** 仅供测试或显式验证"新一轮冷启动"时重置会话种子。 */
export function resetSessionStartupSeedForTesting(nextSeed: number): void {
  sessionStartupSeed = nextSeed >>> 0
  sessionNodeRoleShapeCache.clear()
}

/**
 * 为指定节点计算本次应用启动会话内的稳定随机形状表（同节点内同类按钮一致，不同角色尽量去重）。
 */
export function resolveSessionRoleShapes(
  nodeId: string,
  seedOverride?: number,
): Record<Md3eButtonRole, Md3eExpressiveShapeId> {
  const normalizedNodeId = nodeId.trim() || "workspace"
  const activeSeed = seedOverride !== undefined ? (seedOverride >>> 0) : sessionStartupSeed
  const cacheKey = `${activeSeed}:${normalizedNodeId}`
  const cached = sessionNodeRoleShapeCache.get(cacheKey)
  if (cached) return cached

  const pool = MD3E_RANDOM_SHAPE_POOL
  const used = new Set<Md3eExpressiveShapeId>()
  const result = { ...DEFAULT_FIXED_ROLE_SHAPES }

  for (let roleIdx = 0; roleIdx < MD3E_BUTTON_ROLES.length; roleIdx += 1) {
    const role = MD3E_BUTTON_ROLES[roleIdx]!
    const baseHash = hashString(`${normalizedNodeId}::${role}::${roleIdx}`, activeSeed)
    let picked = pool[baseHash % pool.length] ?? "circle"
    // 同节点内不同按钮角色尽量挑不同形状，提升视觉辨识度且保持同类一致
    if (used.has(picked) && used.size < pool.length) {
      for (let step = 1; step < pool.length; step += 1) {
        const candidate = pool[(baseHash + step * 7) % pool.length]!
        if (!used.has(candidate)) {
          picked = candidate
          break
        }
      }
    }
    used.add(picked)
    result[role] = picked
  }

  sessionNodeRoleShapeCache.set(cacheKey, result)
  return result
}

/**
 * 探测宿主环境是否支持 CSS clip-path polygon。
 */
export function detectHostClipPathSupport(): boolean {
  try {
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      return CSS.supports("clip-path", "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)")
    }
    // 测试环境（如 happy-dom）可能未挂载全局 CSS.supports，但支持行内 style.clipPath 赋值
    if (typeof document !== "undefined" && document.documentElement?.style !== undefined) {
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 按降级铁律（ADR-0011 决定 4）与可读性下限（ADR-0033 待确认 #3）解析某个图标按钮最终生效的形状。
 *
 * 规则：
 * 1. 若宿主不支持 `clip-path: polygon(...)` ⇒ 退化为 `circle`，`applyClipPath: false`，
 *    `status: "degraded"`，`degradedReason: "css-clip-path-unsupported"`；
 * 2. 若处于高对比度模式（`contrastLevel >= 1` 或 `forcedColors: true`）且原形状为 `complex` ⇒
 *    退化为高可读性的 `squircle`，`status: "degraded"`，`degradedReason: "high-contrast-legibility-floor"`；
 * 3. 若容器极窄（`surfaceMode === "collapsed"` 或 `surfaceWidth <= 320`）且原形状为 `complex` ⇒
 *    退化为 `circle`，`status: "degraded"`，`degradedReason: "compact-320-legibility-floor"`；
 * 4. 若图标按钮为极小尺寸（`icon-xs`，24px）且原形状为 `complex` ⇒
 *    退化为 `squircle`，`status: "degraded"`，`degradedReason: "xs-icon-legibility-floor"`。
 */
export function resolveMd3eButtonShape(
  requestedId: Md3eExpressiveShapeId,
  probe: Md3eShapeCapabilityProbeInput = {},
): Md3eResolvedButtonShape {
  const requestedSpec = getMd3eShapeSpec(requestedId)
  const clipSupported = probe.cssClipPathSupported ?? detectHostClipPathSupport()

  if (!clipSupported) {
    const fallbackSpec = getMd3eShapeSpec("circle")
    return {
      requestedId,
      id: "circle",
      spec: fallbackSpec,
      status: "degraded",
      degradedReason: "css-clip-path-unsupported",
      applyClipPath: false,
    }
  }

  const isHighContrast = (probe.contrastLevel !== undefined && probe.contrastLevel >= 1) || probe.forcedColors === true
  if (isHighContrast && requestedSpec.complexity === "complex") {
    const fallbackSpec = getMd3eShapeSpec("squircle")
    return {
      requestedId,
      id: "squircle",
      spec: fallbackSpec,
      status: "degraded",
      degradedReason: "high-contrast-legibility-floor",
      applyClipPath: true,
    }
  }

  const isCompact320 =
    probe.surfaceMode === "collapsed" ||
    (probe.surfaceWidth !== undefined && probe.surfaceWidth > 0 && probe.surfaceWidth <= 320)
  if (isCompact320 && requestedSpec.complexity === "complex") {
    const fallbackSpec = getMd3eShapeSpec("circle")
    return {
      requestedId,
      id: "circle",
      spec: fallbackSpec,
      status: "degraded",
      degradedReason: "compact-320-legibility-floor",
      applyClipPath: true,
    }
  }

  if (probe.buttonSize === "icon-xs" && requestedSpec.complexity === "complex") {
    const fallbackSpec = getMd3eShapeSpec("squircle")
    return {
      requestedId,
      id: "squircle",
      spec: fallbackSpec,
      status: "degraded",
      degradedReason: "xs-icon-legibility-floor",
      applyClipPath: true,
    }
  }

  return {
    requestedId,
    id: requestedSpec.id,
    spec: requestedSpec,
    status: "active",
    degradedReason: null,
    applyClipPath: true,
  }
}

/**
 * ============================================================================
 * 形状策略持久化 Seam（ADR-0033 待确认第 1 条）
 * ============================================================================
 *
 * TODO(ADR-0033 待确认 #1):
 * 形状策略存进哪一格需待使用者最终拍板：
 * - 候选 A（当前默认实现）：`xaihi-core.nodeUi[nodeId]`（界面偏好格，经 `NodeUiConfigStore` 读写，
 *   与 `NodeConfigPopover.tsx:436` 的 `restoreOnStartup` 走同一格并做字段级无损合并）；
 * - 候选 B（备选 seam）：`xaihi-<node>` 的插件业务 `Config`（经 `NodeSettingsFace` 读写）。
 *
 * 消费侧一律只调下面的 `readNodeShapePolicy` / `writeNodeShapePolicy`，若将来拍板切往候选 B，
 * 只需替换此处读写实现，无需改动任何节点或按钮组件。
 */

const LOCAL_SHAPE_FALLBACK_PREFIX = "xaihi:node-ui:shape-policy:"

function readLocalFallbackPolicy(nodeId: string): Md3eNodeShapePolicy | undefined {
  try {
    if (typeof window === "undefined" || !window.localStorage) return undefined
    const raw = window.localStorage.getItem(`${LOCAL_SHAPE_FALLBACK_PREFIX}${nodeId}`)
    if (!raw) return undefined
    return normalizeNodeShapePolicy(JSON.parse(raw))
  } catch {
    return undefined
  }
}

function writeLocalFallbackPolicy(nodeId: string, policy: Md3eNodeShapePolicy): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    window.localStorage.setItem(`${LOCAL_SHAPE_FALLBACK_PREFIX}${nodeId}`, JSON.stringify(policy))
  } catch {
    // ignore storage errors
  }
}

export interface NodeShapePolicyReadResult {
  policy: Md3eNodeShapePolicy
  /** 标记数据来自 DSH settings 标准面还是无桥环境下的本地退化（ADR-0011 决定 4）。 */
  persistenceSource: "dsh-settings" | "local-fallback" | "default"
}

export async function readNodeShapePolicy(
  nodeId: string,
  store: NodeUiConfigStore | undefined,
): Promise<NodeShapePolicyReadResult> {
  const key = nodeId.trim() || "workspace"
  if (!store) {
    const local = readLocalFallbackPolicy(key)
    return {
      policy: local ?? normalizeNodeShapePolicy(undefined),
      persistenceSource: "local-fallback",
    }
  }

  const stored = await store.read(key)
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const record = stored as Record<string, unknown>
    if (record.shapePolicy !== undefined) {
      return {
        policy: normalizeNodeShapePolicy(record.shapePolicy),
        persistenceSource: "dsh-settings",
      }
    }
  }

  const legacyLocal = readLocalFallbackPolicy(key)
  if (legacyLocal) {
    return {
      policy: legacyLocal,
      persistenceSource: "dsh-settings",
    }
  }

  return {
    policy: normalizeNodeShapePolicy(undefined),
    persistenceSource: "dsh-settings",
  }
}

export async function writeNodeShapePolicy(
  nodeId: string,
  policy: Md3eNodeShapePolicy,
  store: NodeUiConfigStore | undefined,
): Promise<{ persistenceSource: "dsh-settings" | "local-fallback" }> {
  const key = nodeId.trim() || "workspace"
  const normalized = normalizeNodeShapePolicy(policy)
  if (!store) {
    writeLocalFallbackPolicy(key, normalized)
    return { persistenceSource: "local-fallback" }
  }

  // 读取同格已有偏好（例如 restoreOnStartup），只覆写 shapePolicy 子键，绝不抹掉同格其他字段
  let existingRecord: Record<string, unknown> = {}
  try {
    const current = await store.read(key)
    if (current && typeof current === "object" && !Array.isArray(current)) {
      existingRecord = { ...(current as Record<string, unknown>) }
    }
  } catch {
    existingRecord = {}
  }

  await store.write(key, {
    ...existingRecord,
    shapePolicy: normalized,
  })
  return { persistenceSource: "dsh-settings" }
}

export type Md3eTextButtonShapeId = "rounded" | "soft" | "capsule"
export type Md3eQuickPresetId = "default" | "friendly" | "cheerful" | "modern"

export const MD3E_PRIMARY_ICON_SHAPE_PRESETS = [
  { id: "circle" as const, name: "圆形", spec: MD3E_EXPRESSIVE_SHAPES[0]! },
  { id: "squircle" as const, name: "方圆", spec: MD3E_EXPRESSIVE_SHAPES[1]! },
  { id: "flower-8" as const, name: "波瓣", spec: MD3E_EXPRESSIVE_SHAPES[7]! },
  { id: "clover-4" as const, name: "四叶", spec: MD3E_EXPRESSIVE_SHAPES[6]! },
]

export const MD3E_TEXT_BUTTON_SHAPES = [
  { id: "rounded" as const, name: "圆角", radiusClass: "rounded-md" },
  { id: "soft" as const, name: "柔和", radiusClass: "rounded-xl" },
  { id: "capsule" as const, name: "胶囊", radiusClass: "rounded-full" },
]

export const MD3E_QUICK_PRESETS: Record<Md3eQuickPresetId, { name: string; roles: Record<string, Md3eExpressiveShapeId>; textShape: Md3eTextButtonShapeId }> = {
  default: {
    name: "标准",
    roles: { primary: "cookie-4", secondary: "hexagon", outline: "squircle", ghost: "circle", danger: "octagon", toolbar: "cookie-6" },
    textShape: "capsule",
  },
  friendly: {
    name: "亲和",
    roles: { primary: "clover-4", secondary: "cookie-8", outline: "squircle", ghost: "circle", danger: "shield", toolbar: "cookie-6" },
    textShape: "capsule",
  },
  cheerful: {
    name: "活跃",
    roles: { primary: "sunny-10", secondary: "flower-8", outline: "circle", ghost: "squircle", danger: "octagon", toolbar: "cookie-12" },
    textShape: "soft",
  },
  modern: {
    name: "现代",
    roles: { primary: "squircle", secondary: "hexagon", outline: "squircle", ghost: "squircle", danger: "gem", toolbar: "pentagon" },
    textShape: "rounded",
  },
}
