/**
 * Stable preference keys for the node operation toolbar. A component may not
 * expose every action; unavailable actions are simply skipped at render time.
 */
export const CHROME_ACTION_PREFERENCE_KEYS = [
  "node-help",
  "collapse",
  "focus",
  "fullscreen",
  "float",
  "moveToView",
  "keepAliveOnViewSwitch",
  "hide",
] as const

export type ChromeActionPreferenceKey = typeof CHROME_ACTION_PREFERENCE_KEYS[number]
export const CHROME_ACTION_VISIBLE_COLUMN = "visible"
export const CHROME_ACTION_HIDDEN_COLUMN = "hidden"
export type ChromeActionKanbanColumns = Record<
  typeof CHROME_ACTION_VISIBLE_COLUMN | typeof CHROME_ACTION_HIDDEN_COLUMN,
  ChromeActionPreferenceKey[]
>

export const DEFAULT_CHROME_ACTION_ORDER: ChromeActionPreferenceKey[] = [...CHROME_ACTION_PREFERENCE_KEYS]

const PREFERENCE_KEYS = new Set<string>(CHROME_ACTION_PREFERENCE_KEYS)

export function normalizeChromeActionOrder(value: unknown): ChromeActionPreferenceKey[] {
  const configured = Array.isArray(value) ? value : []
  const seen = new Set<ChromeActionPreferenceKey>()
  const ordered: ChromeActionPreferenceKey[] = []

  for (const key of configured) {
    if (typeof key !== "string" || !PREFERENCE_KEYS.has(key)) continue
    const typedKey = key as ChromeActionPreferenceKey
    if (seen.has(typedKey)) continue
    seen.add(typedKey)
    ordered.push(typedKey)
  }

  for (const key of DEFAULT_CHROME_ACTION_ORDER) {
    if (!seen.has(key)) ordered.push(key)
  }

  return ordered
}

export function normalizeChromeHiddenActions(value: unknown): ChromeActionPreferenceKey[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<ChromeActionPreferenceKey>()
  for (const key of value) {
    if (typeof key !== "string" || !PREFERENCE_KEYS.has(key)) continue
    seen.add(key as ChromeActionPreferenceKey)
  }
  return CHROME_ACTION_PREFERENCE_KEYS.filter((key) => seen.has(key))
}

export function splitChromeActionKanbanColumns(
  order: readonly ChromeActionPreferenceKey[],
  hiddenActions: readonly ChromeActionPreferenceKey[],
): ChromeActionKanbanColumns {
  const hidden = new Set(normalizeChromeHiddenActions(hiddenActions))
  const normalizedOrder = normalizeChromeActionOrder(order)
  return {
    [CHROME_ACTION_VISIBLE_COLUMN]: normalizedOrder.filter((key) => !hidden.has(key)),
    [CHROME_ACTION_HIDDEN_COLUMN]: normalizedOrder.filter((key) => hidden.has(key)),
  }
}

export function mergeChromeActionKanbanColumns(columns: Partial<ChromeActionKanbanColumns>): {
  order: ChromeActionPreferenceKey[]
  hiddenActions: ChromeActionPreferenceKey[]
} {
  const hidden = columns[CHROME_ACTION_HIDDEN_COLUMN] ?? []
  return {
    order: normalizeChromeActionOrder([
      ...(columns[CHROME_ACTION_VISIBLE_COLUMN] ?? []),
      ...hidden,
    ]),
    hiddenActions: normalizeChromeHiddenActions(hidden),
  }
}

export function getChromeActionPreferenceKey(action: { key: string; preferenceKey?: ChromeActionPreferenceKey }): string {
  return action.preferenceKey ?? action.key
}

export function applyChromeActionPreferences<T extends { key: string; preferenceKey?: ChromeActionPreferenceKey }>(
  actions: readonly T[],
  order: readonly ChromeActionPreferenceKey[],
  hiddenActions: readonly ChromeActionPreferenceKey[],
): T[] {
  // An action's own key is free text; only `preferenceKey` is from the preference vocabulary. Both are looked
  // up by string here, the same way PREFERENCE_KEYS below is a Set<string> rather than a set of the union.
  const ranks = new Map<string, number>(normalizeChromeActionOrder(order).map((key, index) => [key, index]))
  const hidden = new Set<string>(normalizeChromeHiddenActions(hiddenActions))

  return actions
    .map((action, index) => ({ action, index, preferenceKey: getChromeActionPreferenceKey(action) }))
    .filter(({ preferenceKey }) => !hidden.has(preferenceKey))
    .sort((left, right) => {
      const leftRank = ranks.get(left.preferenceKey) ?? Number.MAX_SAFE_INTEGER
      const rightRank = ranks.get(right.preferenceKey) ?? Number.MAX_SAFE_INTEGER
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank
    })
    .map(({ action }) => action)
}
