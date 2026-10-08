export type KisakiCardPanelId = "source" | "analysis"
export type KisakiCardId = "source-settings" | "preview" | "analysis" | "logs" | "selection" | "operations"

export interface KisakiCardDefinition {
  id: KisakiCardId
  title: string
  defaultPanel: KisakiCardPanelId
  defaultHeight: number
  minHeight: number
  maxHeight: number
}

export interface KisakiCardConfig {
  id: KisakiCardId
  panel: KisakiCardPanelId
  visible: boolean
  collapsed: boolean
  height: number
  order: number
}

export interface KisakiCardLayout { version: 1; cards: KisakiCardConfig[] }

export const KISAKI_CARD_REGISTRY: readonly KisakiCardDefinition[] = [
  { id: "source-settings", title: "扫描设置", defaultPanel: "source", defaultHeight: 520, minHeight: 220, maxHeight: 900 },
  { id: "preview", title: "预览设置", defaultPanel: "analysis", defaultHeight: 100, minHeight: 72, maxHeight: 240 },
  { id: "analysis", title: "统计分析", defaultPanel: "analysis", defaultHeight: 430, minHeight: 220, maxHeight: 900 },
  { id: "logs", title: "活动日志", defaultPanel: "analysis", defaultHeight: 300, minHeight: 160, maxHeight: 720 },
  { id: "selection", title: "选择与规则", defaultPanel: "analysis", defaultHeight: 280, minHeight: 160, maxHeight: 640 },
  { id: "operations", title: "文件操作", defaultPanel: "analysis", defaultHeight: 360, minHeight: 220, maxHeight: 760 },
]

export function createDefaultKisakiCardLayout(): KisakiCardLayout {
  const panelCounts: Record<KisakiCardPanelId, number> = { source: 0, analysis: 0 }
  return { version: 1, cards: KISAKI_CARD_REGISTRY.map((definition) => ({ id: definition.id, panel: definition.defaultPanel, visible: true, collapsed: false, height: definition.defaultHeight, order: panelCounts[definition.defaultPanel]++ })) }
}

export function normalizeKisakiCardLayout(value: KisakiCardLayout | undefined): KisakiCardLayout {
  const defaults = createDefaultKisakiCardLayout()
  if (!value || value.version !== 1) return defaults
  const existing = new Map(value.cards.map((card) => [card.id, card]))
  const cards = defaults.cards.map((fallback) => {
    const card = existing.get(fallback.id)
    const definition = cardDefinition(fallback.id)
    return card ? { ...fallback, ...card, panel: card.panel === "source" || card.panel === "analysis" ? card.panel : fallback.panel, height: clamp(card.height, definition.minHeight, definition.maxHeight) } : fallback
  })
  return { version: 1, cards: normalizeOrders(cards) }
}

export function updateKisakiCard(layout: KisakiCardLayout, id: KisakiCardId, patch: Partial<Pick<KisakiCardConfig, "visible" | "collapsed" | "height">>): KisakiCardLayout {
  const definition = cardDefinition(id)
  return { ...layout, cards: layout.cards.map((card) => card.id === id ? { ...card, ...patch, height: clamp(patch.height ?? card.height, definition.minHeight, definition.maxHeight) } : card) }
}

export function moveKisakiCard(layout: KisakiCardLayout, id: KisakiCardId, panel: KisakiCardPanelId, targetIndex: number): KisakiCardLayout {
  const moving = layout.cards.find((card) => card.id === id)
  if (!moving) return layout
  const remaining = layout.cards.filter((card) => card.id !== id)
  const target = remaining.filter((card) => card.panel === panel).sort((a, b) => a.order - b.order)
  target.splice(clamp(targetIndex, 0, target.length), 0, { ...moving, panel })
  const untouched = remaining.filter((card) => card.panel !== panel)
  return { ...layout, cards: normalizeOrders([...untouched, ...target.map((card, order) => ({ ...card, order }))]) }
}

export function moveKisakiCardBy(layout: KisakiCardLayout, id: KisakiCardId, offset: number): KisakiCardLayout {
  const card = layout.cards.find((item) => item.id === id)
  if (!card) return layout
  return moveKisakiCard(layout, id, card.panel, card.order + offset)
}

export function cardsForPanel(layout: KisakiCardLayout, panel: KisakiCardPanelId): KisakiCardConfig[] {
  return layout.cards.filter((card) => card.panel === panel && card.visible).sort((a, b) => a.order - b.order)
}

function normalizeOrders(cards: KisakiCardConfig[]): KisakiCardConfig[] {
  const next = cards.map((card) => ({ ...card }))
  for (const panel of ["source", "analysis"] as const) next.filter((card) => card.panel === panel).sort((a, b) => a.order - b.order).forEach((card, order) => { card.order = order })
  return next
}
function cardDefinition(id: KisakiCardId): KisakiCardDefinition { return KISAKI_CARD_REGISTRY.find((item) => item.id === id)! }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)) }
