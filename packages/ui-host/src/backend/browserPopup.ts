export function browserPopupSessionKey(componentId: string): string {
  return `xaihi:browser-popup:${componentId}`
}

export function createBrowserPopupToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function isOwnedBrowserPopup(
  opener: { location: { origin: string }; sessionStorage: { getItem(key: string): string | null } } | null,
  origin: string,
  componentId: string | null | undefined,
  popupToken: string | null | undefined,
): boolean {
  if (!opener || !componentId || !popupToken || opener.location.origin !== origin) return false
  return opener.sessionStorage.getItem(browserPopupSessionKey(componentId)) === popupToken
}
