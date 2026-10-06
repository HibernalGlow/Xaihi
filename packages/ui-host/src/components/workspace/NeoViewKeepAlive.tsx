import { createPortal } from "react-dom"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWorkspaceVisibleComponents } from "@/store/workspaceStore"

type RenderPersistentNode = (compId: string) => ReactNode
export const NEO_VIEW_KEEP_ALIVE_DATA_KEY = "keepAliveOnViewSwitch"

export function isNeoViewKeepAliveEnabled(data: Record<string, unknown> | undefined): boolean {
  return data?.[NEO_VIEW_KEEP_ALIVE_DATA_KEY] !== false
}

interface NeoViewKeepAliveContextValue {
  isEnabled(compId: string): boolean
  registerSlot(compId: string, target: HTMLElement | null): void
  unregisterSlot(compId: string, target: HTMLElement): void
}

const NeoViewKeepAliveContext = createContext<NeoViewKeepAliveContextValue | null>(null)

interface NeoViewKeepAliveProviderProps {
  children: ReactNode
  renderNode: RenderPersistentNode
}

interface KeepAliveEntry {
  host: HTMLDivElement
  target: HTMLElement | null
}

/**
 * Keeps NeoView's in-memory reader session alive while workspace views replace
 * their layout tree. The host element is moved between view slots; the React
 * subtree is never moved to a different portal container.
 */
export function NeoViewKeepAliveProvider({ children, renderNode }: NeoViewKeepAliveProviderProps) {
  const visibleComponents = useWorkspaceVisibleComponents()
  const enabledIds = useMemo(
    () => new Set(visibleComponents
      .filter((component) => component.moduleId === "neoview" && isNeoViewKeepAliveEnabled(component.data))
      .map((component) => component.id)),
    [visibleComponents],
  )
  const [retainedIds, setRetainedIds] = useState<ReadonlySet<string>>(() => new Set())
  const entriesRef = useRef(new Map<string, KeepAliveEntry>())
  const fallbackRootRef = useRef<HTMLDivElement | null>(null)

  const getEntry = useCallback((compId: string): KeepAliveEntry | undefined => {
    if (typeof document === "undefined") return undefined
    const existing = entriesRef.current.get(compId)
    if (existing) return existing

    const host = document.createElement("div")
    host.dataset.neoviewKeepAliveHost = compId
    host.className = "h-full min-h-0 w-full"
    const entry = { host, target: null }
    entriesRef.current.set(compId, entry)
    return entry
  }, [])

  const registerSlot = useCallback((compId: string, target: HTMLElement | null) => {
    if (!target) return
    const entry = getEntry(compId)
    if (!entry) return
    entry.target = target
    if (entry.host.parentElement !== target) target.appendChild(entry.host)
    setRetainedIds((current) => current.has(compId) ? current : new Set([...current, compId]))
  }, [getEntry])

  const unregisterSlot = useCallback((compId: string, target: HTMLElement) => {
    const entry = entriesRef.current.get(compId)
    if (!entry || entry.target !== target) return
    entry.target = null
    const fallbackRoot = fallbackRootRef.current
    if (fallbackRoot && entry.host.parentElement !== fallbackRoot) fallbackRoot.appendChild(entry.host)
  }, [])

  const contextValue = useMemo(() => ({
    isEnabled: (compId: string) => enabledIds.has(compId),
    registerSlot,
    unregisterSlot,
  }), [enabledIds, registerSlot, unregisterSlot])

  useEffect(() => {
    const liveIds = new Set(visibleComponents
      .filter((component) => component.moduleId === "neoview" && isNeoViewKeepAliveEnabled(component.data))
      .map((component) => component.id))
    const staleIds = [...entriesRef.current.keys()].filter((compId) => !liveIds.has(compId))
    if (staleIds.length === 0) return

    for (const compId of staleIds) {
      entriesRef.current.get(compId)?.host.remove()
      entriesRef.current.delete(compId)
    }
    setRetainedIds((current) => {
      const next = new Set([...current].filter((compId) => liveIds.has(compId)))
      return next.size === current.size ? current : next
    })
  }, [visibleComponents])

  useEffect(() => () => {
    for (const entry of entriesRef.current.values()) entry.host.remove()
    entriesRef.current.clear()
  }, [])

  return (
    <NeoViewKeepAliveContext.Provider value={contextValue}>
      {children}
      <div ref={fallbackRootRef} hidden data-neoview-keepalive-root="true" />
      {[...retainedIds].filter((compId) => enabledIds.has(compId)).map((compId) => {
        const entry = getEntry(compId)
        return entry ? <NeoViewKeepAliveNode key={compId} host={entry.host} renderNode={renderNode} compId={compId} /> : null
      })}
    </NeoViewKeepAliveContext.Provider>
  )
}

function NeoViewKeepAliveNode({ host, renderNode, compId }: { host: HTMLDivElement; renderNode: RenderPersistentNode; compId: string }) {
  return createPortal(renderNode(compId), host)
}

export function NeoViewKeepAliveSlot({ compId }: { compId: string }) {
  const context = useContext(NeoViewKeepAliveContext)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const registerSlot = context?.registerSlot
  const unregisterSlot = context?.unregisterSlot

  useLayoutEffect(() => {
    if (!registerSlot || !unregisterSlot) return undefined
    const target = slotRef.current
    registerSlot(compId, target)
    return () => {
      if (target) unregisterSlot(compId, target)
    }
  }, [compId, registerSlot, unregisterSlot])

  return <div ref={slotRef} className="h-full min-h-0 w-full" data-neoview-keepalive-slot={compId} />
}

export function useNeoViewKeepAliveContext(): NeoViewKeepAliveContextValue | null {
  return useContext(NeoViewKeepAliveContext)
}
