/**
 * 卡片权重评估模块。
 *
 * 根据组件的运行状态、聚焦状态、z 值、折叠状态等派生一个权重分数，
 * 映射到 hero / large / normal / compact 四级权重。用于 grid / stack
 * 视图模式下的卡片摆放顺序：重要卡片先摆放，获得更优位置。
 *
 * 评分规则见 getCardWeight 函数的 JSDoc。
 */
import type { ComponentInstance } from "@/types/workspace"
import type { ComponentSurfaceStatus } from "@/lib/componentSurfaceStatus"

export type CardWeight = "hero" | "large" | "normal" | "compact"

export interface CardWeightMeta {
  weight: CardWeight
  /** 评分总和，用于调试与同权重内的微调。 */
  score: number
  /** 评分原因列表，用于 UI 展示与调试。 */
  reasons: string[]
}

/** "最近完成"窗口：刚完成的卡片在 8 秒内仍保留较高权重。 */
const RECENT_COMPLETED_MS = 8_000

/**
 * 根据组件状态、运行状态、聚焦/折叠状态派生卡片权重。
 *
 * 评分规则（文档 Part 2 → Weight Rules）：
 * - focused: +100
 * - error:   +90
 * - running: +80
 * - queued:  +50
 * - state==="focused": +40
 * - recent completed: +35
 * - 高 z（最近被 raise）: +10..20
 * - collapsed: 强制 compact
 *
 * 映射:
 * - score >= 100: hero
 * - score >= 70:  large
 * - score >= 25:  normal
 * - collapsed / 低分: compact
 */
export function getCardWeight(args: {
  component: ComponentInstance
  status: ComponentSurfaceStatus
  focusedComponentId: string | null
  now?: number
}): CardWeightMeta {
  const { component, status, focusedComponentId } = args
  const now = args.now ?? Date.now()

  if (component.collapsed) {
    return { weight: "compact", score: 0, reasons: ["collapsed"] }
  }

  let score = 0
  const reasons: string[] = []

  if (focusedComponentId === component.id) {
    score += 100
    reasons.push("focused")
  }

  if (status.phase === "error") {
    score += 90
    reasons.push("error")
  } else if (status.phase === "running") {
    score += 80
    reasons.push("running")
  } else if (status.phase === "queued") {
    score += 50
    reasons.push("queued")
  } else if (status.phase === "completed") {
    const updatedAt = status.updatedAt ?? 0
    if (now - updatedAt < RECENT_COMPLETED_MS) {
      score += 35
      reasons.push("recent-completed")
    }
  }

  if (component.state === "focused") {
    score += 40
    reasons.push("state-focused")
  }

  // 最近被 raise 的组件（z 较高）轻微加分
  const z = component.z ?? 1
  if (z >= 50) {
    score += 20
    reasons.push("z-high")
  } else if (z >= 10) {
    score += 10
    reasons.push("z-raised")
  }

  const weight: CardWeight =
    score >= 100 ? "hero" : score >= 70 ? "large" : score >= 25 ? "normal" : "compact"

  return { weight, score, reasons }
}

/**
 * 按权重排序，hero/large 在前，idle 在后。
 * 用于 grid/stack 模式让重要卡片先被摆放。
 * 同权重内保持插入顺序（依赖 ES2019+ sort 稳定性），
 * 避免 raiseComponent 改 z 触发位置跳动。
 */
export function sortByWeightDesc(
  components: ComponentInstance[],
  weights: Record<string, CardWeightMeta>,
): ComponentInstance[] {
  const weightRank: Record<CardWeight, number> = { hero: 0, large: 1, normal: 2, compact: 3 }
  return [...components].sort((a, b) => {
    const wa = weights[a.id]?.weight ?? "normal"
    const wb = weights[b.id]?.weight ?? "normal"
    if (wa !== wb) return weightRank[wa] - weightRank[wb]
    // 同权重保持原始顺序：z 仅用于视觉叠层，不参与布局排序
    return 0
  })
}
