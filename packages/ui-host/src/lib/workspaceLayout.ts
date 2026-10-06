/**
 * 工作区卡片布局引擎（纯函数）。
 *
 * 根据工作区状态（组件列表、布局类型、聚焦/全屏 id、画布尺寸）计算每个组件的目标几何位置，
 * 返回 `Record<componentId, ComputedLayout>`。CardView 直接消费该结果应用 transform/尺寸样式，
 * 因此本模块不含任何副作用与 React 依赖，便于单元测试与 SSR。
 *
 * 支持的布局算法：
 * 1. fullscreen — 单组件全屏，其余隐藏（最高优先级，覆盖其他布局）；
 * 2. grid — 多列网格，hero 卡片跨 2 列突出显示；
 * 3. stack — 阶梯式叠放扑克牌；
 * 4. split — 左右两栏，活跃/大型卡片在左，普通/紧凑在右；
 * 5. focus — 主面板 + 右侧缩略图带，主面板显示 hero 卡片。
 *
 * 当提供 `cardWeights` 时，组件先按权重排序再布局，使运行/报错/聚焦的卡片更靠前/更大。
 * 注：free 自由布局因无法持久化位置，已删除。
 */
import type { ComponentInstance, ComputedLayout, CardLayout } from "@/types/workspace"
import type { CardWeightMeta } from "@/lib/cardWeight"
import { sortByWeightDesc } from "@/lib/cardWeight"

/** 卡片之间的间距（px）。 */
const GAP = 16
/** 画布内边距（px）。 */
const PAD = 16
/** 折叠状态下卡片的标题栏高度（px）。 */
const HEADER_H = 40
/** focus 布局右侧缩略图带的宽度（px）。 */
const STRIP_W = 220
/** 单个面板最小宽度（px），用于防止画布过小时几何为负。 */
const MIN_PANEL_W = 320
/** 单个面板最小高度（px）。 */
const MIN_PANEL_H = 240

export interface LayoutContext {
  components: ComponentInstance[]
  layout: CardLayout
  focusedId: string | null
  fullscreenId: string | null
  W: number
  H: number
  /** 可选：由 CardView 派生的权重 map。提供时，grid/stack/split/focus 会按权重排序并放大 hero/large 卡片。 */
  cardWeights?: Record<string, CardWeightMeta>
}

/**
 * Pure layout engine — given workspace state + canvas size, returns the target
 * geometry for every component. free 模式已删除（无法持久化的 bug）。
 *
 * 4 种布局：grid / stack / split / focus
 */
export function computeLayout({
  components,
  layout,
  focusedId,
  fullscreenId,
  W,
  H,
  cardWeights,
}: LayoutContext): Record<string, ComputedLayout> {
  const out: Record<string, ComputedLayout> = {}
  const innerW = Math.max(MIN_PANEL_W, W - PAD * 2)
  const innerH = Math.max(MIN_PANEL_H, H - PAD * 2)
  const collapsedH = HEADER_H

  // 当提供权重时，按权重排序后再布局，让运行/报错/聚焦的卡片更靠前/更大
  const ordered = cardWeights
    ? sortByWeightDesc(components, cardWeights)
    : components

  const base = (
    comp: ComponentInstance,
    state: ComputedLayout["state"],
    r: { x: number; y: number; w: number; h: number },
    extra?: Partial<ComputedLayout>,
  ): ComputedLayout => ({
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    scale: 1,
    opacity: 1,
    z: comp.z ?? 1,
    state,
    interactive: true,
    ...extra,
  })

  // 1. Fullscreen wins over everything
  if (fullscreenId) {
    ordered.forEach(comp => {
      if (comp.id === fullscreenId) {
        out[comp.id] = base(comp, "fullscreen", { x: PAD, y: PAD, w: innerW, h: innerH }, { z: 1000 })
      } else {
        out[comp.id] = base(
          comp,
          "docked",
          { x: PAD, y: PAD, w: 400, h: 300 },
          { opacity: 0, scale: 0.9, interactive: false, z: 0 },
        )
      }
    })
    return out
  }

  // 2. Grid: auto-tile into 1/2/3 columns based on count
  if (layout === "grid") {
    const n = ordered.length || 1
    // hero 卡片在多列时跨 2 列，使其更醒目
    const heroId = cardWeights
      ? (Object.entries(cardWeights).find(([, meta]) => meta.weight === "hero")?.[0] ?? null)
      : null
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3
    const rows = Math.ceil(n / cols)
    const cw = (innerW - GAP * (cols - 1)) / cols
    const ch = (innerH - GAP * (rows - 1)) / rows
    let placed = 0
    ordered.forEach((comp) => {
      const collapsed = comp.collapsed
      const isHero = comp.id === heroId && cols >= 2 && !collapsed
      const span = isHero ? 2 : 1
      const c = placed % cols
      // hero 跨两列：若起列 + span 超出 cols，推到下一行
      if (c + span > cols) {
        placed += cols - c
      }
      const c2 = placed % cols
      const r2 = Math.floor(placed / cols)
      const w = isHero ? cw * span + GAP : cw
      out[comp.id] = base(comp, collapsed ? "compact" : (isHero ? "focused" : "docked"), {
        x: PAD + c2 * (cw + GAP),
        y: PAD + r2 * (ch + GAP),
        w,
        h: collapsed ? collapsedH : ch,
      }, isHero ? { z: 50 } : undefined)
      placed += span
    })
    return out
  }

  // 3. Stack: cascading overlap deck of cards
  if (layout === "stack") {
    const cardW = Math.min(620, innerW - 80)
    const cardH = Math.min(440, innerH - 120)
    const step = 32
    ordered.forEach((comp, i) => {
      const collapsed = comp.collapsed
      out[comp.id] = base(
        comp,
        collapsed ? "compact" : "docked",
        { x: PAD + i * step, y: PAD + i * step, w: cardW, h: collapsed ? collapsedH : cardH },
        { z: i + 1 },
      )
    })
    return out
  }

  // 4. Split: two columns, items distributed left/right
  if (layout === "split") {
    // hero/large 放左侧（活跃侧），normal/compact 放右侧
    const cols = 2
    const cw = (innerW - GAP) / cols
    const leftCol = cardWeights
      ? ordered.filter((comp) => {
          const w = cardWeights[comp.id]?.weight
          return w === "hero" || w === "large" || w === "normal"
        })
      : ordered.filter((_, j) => j % cols === 0)
    const rightCol = cardWeights
      ? ordered.filter((comp) => !leftCol.includes(comp))
      : ordered.filter((_, j) => j % cols === 1)
    // 若两侧都空（全 hero），回退均分
    if (leftCol.length === 0 && rightCol.length === 0) return out
    if (leftCol.length === 0) {
      leftCol.push(...rightCol.splice(0, Math.ceil(rightCol.length / 2)))
    } else if (rightCol.length === 0 && leftCol.length > 1) {
      rightCol.push(...leftCol.splice(Math.ceil(leftCol.length / 2)))
    }

    function placeColumn(comps: ComponentInstance[], colIndex: number) {
      const ch = comps.length > 0 ? (innerH - GAP * (comps.length - 1)) / comps.length : innerH
      comps.forEach((comp, i) => {
        const collapsed = comp.collapsed
        out[comp.id] = base(comp, collapsed ? "compact" : "docked", {
          x: PAD + colIndex * (cw + GAP),
          y: PAD + i * (ch + GAP),
          w: cw,
          h: collapsed ? collapsedH : ch,
        })
      })
    }
    placeColumn(leftCol, 0)
    placeColumn(rightCol, 1)
    return out
  }

  // 5. Focus: one hero panel, the rest as a thumbnail strip on the right
  // 优先取 focusedId；否则取权重最高的组件
  const heroId = focusedId
    ?? (cardWeights
      ? (Object.entries(cardWeights)
          .sort((a, b) => b[1].score - a[1].score)[0]?.[0] ?? null)
      : null)
    ?? ordered[0]?.id
    ?? null
  const others = ordered.filter(comp => comp.id !== heroId)
  const stripW = others.length ? STRIP_W : 0
  const heroW = innerW - (stripW ? stripW + GAP : 0)

  ordered.forEach(comp => {
    if (comp.id === heroId) {
      out[comp.id] = base(
        comp,
        "focused",
        { x: PAD, y: PAD, w: heroW, h: innerH },
        { z: 500 },
      )
    }
  })

  const thumbH = others.length ? (innerH - GAP * (others.length - 1)) / others.length : 0
  others.forEach((comp, i) => {
    out[comp.id] = base(
      comp,
      "compact",
      { x: PAD + heroW + GAP, y: PAD + i * (thumbH + GAP), w: stripW, h: thumbH },
      { opacity: 0.92, z: comp.z ?? 1 },
    )
  })

  return out
}
