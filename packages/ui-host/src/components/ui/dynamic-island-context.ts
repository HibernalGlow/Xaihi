import { createContext, useContext } from "react"

export type SizePresets = "minimalLeading" | "compact"

export type DynamicIslandPreset = {
  width: number
  aspectRatio: number
  borderRadius: number
}

export type DynamicIslandState = {
  size: SizePresets
  previousSize: SizePresets
}

export type DynamicIslandContextValue = {
  state: DynamicIslandState
  setSize: (size: SizePresets) => void
  presets: Record<SizePresets, DynamicIslandPreset>
}

export const DEFAULT_DYNAMIC_ISLAND_PRESETS: Record<SizePresets, DynamicIslandPreset> = {
  minimalLeading: {
    width: 52,
    aspectRatio: 44 / 52,
    borderRadius: 22,
  },
  compact: {
    width: 235,
    aspectRatio: 44 / 235,
    borderRadius: 22,
  },
}

export const DynamicIslandContext = createContext<DynamicIslandContextValue | undefined>(undefined)

export function useDynamicIslandSize(): DynamicIslandContextValue {
  const context = useContext(DynamicIslandContext)
  if (!context) {
    throw new Error("useDynamicIslandSize must be used within a DynamicIslandProvider")
  }
  return context
}
