import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { ModuleDef } from '@/types/workspace'

type BeginModuleDrag = (module: ModuleDef, pointer: PointerEvent) => boolean
interface ModuleDragBridge {
  begin: BeginModuleDrag
  register(handler: BeginModuleDrag): () => void
}

const Context = createContext<ModuleDragBridge | null>(null)

/** Connect the alphabet launcher to the mounted Trellis workspace drag gesture. */
export function TrellisModuleDragHost({ children }: { children: ReactNode }) {
  const handler = useRef<BeginModuleDrag | null>(null)
  const bridge = useMemo<ModuleDragBridge>(() => ({
    begin: (module, pointer) => handler.current?.(module, pointer) ?? false,
    register: (next) => {
      handler.current = next
      return () => { if (handler.current === next) handler.current = null }
    },
  }), [])

  return <Context.Provider value={bridge}>{children}</Context.Provider>
}

export const useTrellisModuleDrag = () => useContext(Context)
