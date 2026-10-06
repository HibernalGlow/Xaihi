import { useCallback, useMemo, useReducer, type ReactNode } from "react"
import { motion, useWillChange, type Transition } from "motion/react"
import {
  DEFAULT_DYNAMIC_ISLAND_PRESETS,
  DynamicIslandContext,
  useDynamicIslandSize,
  type DynamicIslandPreset,
  type DynamicIslandState,
  type SizePresets,
} from "@/components/ui/dynamic-island-context"
import { cn } from "@/lib/utils"

type IslandAction = {
  type: "SET_SIZE"
  size: SizePresets
}

function islandReducer(state: DynamicIslandState, action: IslandAction): DynamicIslandState {
  if (action.size === state.size) return state
  return {
    size: action.size,
    previousSize: state.size,
  }
}

export function DynamicIslandProvider({
  children,
  initialSize = "minimalLeading",
  presets: customPresets,
}: {
  children: ReactNode
  initialSize?: SizePresets
  presets?: Partial<Record<SizePresets, DynamicIslandPreset>>
}) {
  const [state, dispatch] = useReducer(islandReducer, {
    size: initialSize,
    previousSize: initialSize,
  })
  const presets = useMemo(() => ({ ...DEFAULT_DYNAMIC_ISLAND_PRESETS, ...customPresets }), [customPresets])
  const setSize = useCallback((size: SizePresets) => dispatch({ type: "SET_SIZE", size }), [])
  const value = useMemo(() => ({ state, setSize, presets }), [presets, setSize, state])

  return (
    <DynamicIslandContext.Provider value={value}>
      {children}
    </DynamicIslandContext.Provider>
  )
}

export function DynamicIsland({
  children,
  className,
  id,
  transition,
}: {
  children: ReactNode
  className?: string
  id: string
  transition?: Transition
}) {
  const willChange = useWillChange()
  const { presets, state } = useDynamicIslandSize()
  const currentSize = presets[state.size]
  const width = currentSize.width
  const height = currentSize.aspectRatio * width

  return (
    <motion.div
      id={id}
      animate={{
        width,
        height,
        borderRadius: currentSize.borderRadius,
      }}
      transition={transition ?? { type: "spring", stiffness: 520, damping: 38, mass: 0.48 }}
      style={{ willChange }}
      className={cn("mx-auto flex items-center justify-center overflow-hidden", className)}
    >
      {children}
    </motion.div>
  )
}

export function DynamicContainer({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const willChange = useWillChange()

  return (
    <motion.div
      layout
      style={{ willChange }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
