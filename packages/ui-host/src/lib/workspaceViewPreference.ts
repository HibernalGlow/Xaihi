import type { CardLayout, DefaultWorkspaceView, ViewMode } from '@/types/workspace'

export function normalizeCardLayout(value: unknown): CardLayout {
  return value === 'focus' ? 'focus' : 'trellis'
}

/** Retired layouts migrate to Cards; the dashboard remains a separate app entry. */
export function normalizeLayoutView(value: unknown): Exclude<ViewMode, 'dashboard'> {
  return value === 'flow' || value === 'lane' ? value : 'cards'
}

export function normalizeDefaultView(value: unknown): DefaultWorkspaceView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.viewMode === "dashboard") return null
  const viewMode = normalizeLayoutView(input.viewMode)
  if (viewMode !== 'cards') return { viewMode }
  const cardLayout = normalizeCardLayout(input.cardLayout)
  return cardLayout === 'focus'
    ? { viewMode, cardLayout }
    : { viewMode, cardLayout, navigation: input.navigation === 'free' ? 'free' : 'focus' }
}

export function currentDefaultView(viewMode: ViewMode, cardLayout: CardLayout, navigation: 'focus' | 'free' | null): DefaultWorkspaceView | null {
  if (viewMode === 'dashboard') return null
  return normalizeDefaultView({ viewMode, cardLayout, navigation })
}

export function startupView(defaultView: DefaultWorkspaceView | null) {
  return {
    viewMode: defaultView?.viewMode ?? 'cards',
    cardLayout: defaultView?.viewMode === 'cards' ? defaultView.cardLayout : 'trellis' as const,
    trellisNavigation: defaultView?.viewMode === 'cards' && defaultView.cardLayout === 'trellis' ? defaultView.navigation : null,
  }
}

export function normalizeTrellisMapPosition(value: unknown): 'toolbar' | 'bottom-left' | 'bottom-right' | 'hidden' {
  return value === 'bottom-left' || value === 'bottom-right' || value === 'hidden' ? value : 'toolbar'
}
