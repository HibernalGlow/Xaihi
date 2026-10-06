import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { ChromeActionPreferenceKey } from "./chromeActionPreferences"

export interface ChromeAppearance {
  visible: boolean
  position: "left" | "right" | "island"
  style: "default" | "traffic-light"
  islandScale: number
  islandMotion: number
  islandDelay: number
  islandIdleOffset: number
  actionOrder: ChromeActionPreferenceKey[]
  hiddenActions: ChromeActionPreferenceKey[]
}

export function useChromeAppearance(): ChromeAppearance {
  return useWorkspaceShallowSelector((store) => ({
    visible: store.chromeVisible,
    position: store.chromePosition,
    style: store.chromeStyle,
    islandScale: store.chromeIslandScale,
    islandMotion: store.chromeIslandMotion,
    islandDelay: store.chromeIslandDelay,
    islandIdleOffset: store.chromeIslandIdleOffset,
    actionOrder: store.chromeActionOrder,
    hiddenActions: store.chromeHiddenActions,
  }))
}
