import { createContext, useContext, useEffect, useRef } from "react"
import type { ContextMenuContext, ContextMenuItemDef } from "./ContextMenuProvider"

export type ContextMenuBuilder = (ctx: ContextMenuContext) => ContextMenuItemDef[] | null

export interface ContextMenuAPI {
  register: (scope: string, builder: ContextMenuBuilder) => () => void
  show: (x: number, y: number, items: ContextMenuItemDef[]) => void
  confirm: (item: ContextMenuItemDef, returnFocus?: HTMLElement) => Promise<boolean>
}

export const ContextMenuBuilderContext = createContext<ContextMenuAPI | null>(null)

export function useContextMenuBuilder(scope: string, builder: ContextMenuBuilder) {
  const context = useContext(ContextMenuBuilderContext)
  const builderRef = useRef(builder)
  builderRef.current = builder

  useEffect(() => {
    if (!context) return
    return context.register(scope, (args) => builderRef.current(args))
  }, [context, scope])
}

export function useContextMenu(): ContextMenuAPI | null {
  return useContext(ContextMenuBuilderContext)
}
