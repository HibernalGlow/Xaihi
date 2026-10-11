import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutDocument } from '@danfessler/trellis'
import { requestTrellisLayout, trellisLayoutEndpoint, type TrellisLayoutRecord, type TrellisNavigation } from '@/backend/trellisLayouts'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { initialTrellisDocument } from './document'

interface SessionLayout { document: LayoutDocument; navigation: TrellisNavigation }
const sessions = new Map<string, SessionLayout>()
const unsaved = new Map<string, { layout: SessionLayout; revision: number }>()
/** Coalesced data writes with readable optimistic conflicts. No private config or localStorage. */
export function useTrellisLayout(workspaceId: string) {
  const requestedNavigation = useWorkspaceStore((s) => s.trellisNavigation)
  const endpoint = trellisLayoutEndpoint(workspaceId)
  const key = endpoint ?? workspaceId
  const [layout, setLayout] = useState<SessionLayout>(() => sessions.get(key) ?? { document: initialTrellisDocument([]), navigation: requestedNavigation ?? 'focus' })
  const [ready, setReady] = useState(!endpoint)
  const [status, setStatus] = useState<'session' | 'loading' | 'saved' | 'saving' | 'error' | 'conflict'>(endpoint ? 'loading' : 'session')
  const [reason, setReason] = useState<string | null>(null)
  const [conflict, setConflict] = useState<TrellisLayoutRecord | null>(null)
  const state = useRef({ key, endpoint, revision: unsaved.get(key)?.revision ?? 0, loadGeneration: 0, durable: false, loaded: !endpoint, blocked: false, alive: true,
    pending: (unsaved.get(key)?.layout ?? null) as SessionLayout | null, current: layout, timer: undefined as ReturnType<typeof setTimeout> | undefined,
    flight: false, writer: `Xaihi ${crypto.randomUUID().slice(0, 8)}` })
  const flush = useCallback(async () => {
    const s = state.current
    if (!s.endpoint || !s.loaded || s.blocked || s.flight || !s.pending) return
    const input = s.pending; s.pending = null; s.flight = true
    if (s.alive) setStatus('saving')
    try {
      const result = await requestTrellisLayout(s.endpoint, { ...input, expectedRevision: s.revision, writer: s.writer })
      s.durable = result.durable
      if (result.conflict && result.layout) {
        s.blocked = true; s.pending = s.current
        if (s.alive) { setConflict(result.layout); setStatus('conflict') }
      } else {
        s.revision = result.layout!.revision
        if (s.pending) unsaved.set(s.key, { layout: s.pending, revision: s.revision }); else unsaved.delete(s.key)
        if (s.alive) { setStatus(s.durable ? 'saved' : 'session'); setReason(result.reason) }
      }
    } catch (error) {
      s.pending ??= input; s.blocked = true
      if (s.alive) { setStatus('error'); setReason(String(error)) }
    } finally { s.flight = false }
    if (s.pending && !s.blocked) void flush()
  }, [])
  const change = useCallback((document: LayoutDocument, navigation?: TrellisNavigation) => {
    const s = state.current
    const next = { document, navigation: navigation ?? s.current.navigation }
    if (JSON.stringify(next) === JSON.stringify(s.current)) return
    useWorkspaceStore.getState().setTrellisNavigation(next.navigation)
    s.current = next; sessions.set(s.key, next); setLayout(next); s.pending = next
    if (s.endpoint) unsaved.set(s.key, { layout: next, revision: s.revision })
    clearTimeout(s.timer); s.timer = setTimeout(() => { void flush() }, 500)
  }, [flush])
  const load = useCallback(async () => {
    const s = state.current
    if (!s.endpoint) return
    const generation = ++s.loadGeneration
    try {
      const result = await requestTrellisLayout(s.endpoint)
      if (!s.alive || generation !== s.loadGeneration) return
      s.durable = result.durable; s.loaded = result.available !== false
      if (s.pending && result.layout && result.layout.revision !== s.revision) {
        s.blocked = true; setConflict(result.layout); setStatus('conflict')
      } else {
        s.revision = result.layout?.revision ?? 0; s.blocked = false
        if (!s.pending && result.layout) {
          const next = { document: result.layout.document, navigation: useWorkspaceStore.getState().trellisNavigation ?? result.layout.navigation }
          s.current = next; sessions.set(s.key, next); setLayout(next)
        }
        setStatus(result.durable ? 'saved' : 'session')
        if (s.pending) void flush()
      }
      if (!useWorkspaceStore.getState().trellisNavigation) useWorkspaceStore.getState().setTrellisNavigation(s.current.navigation)
      setReason(result.reason); setReady(true)
    } catch (error) {
      if (!s.alive || generation !== s.loadGeneration) return
      s.blocked = true; setReason(String(error)); setStatus('error'); setReady(true)
    }
  }, [flush])
  useEffect(() => {
    const s = state.current; s.alive = true
    void load()
    return () => { clearTimeout(s.timer); void flush(); s.alive = false; s.loadGeneration++ }
  }, [load, flush])
  useEffect(() => {
    if (ready && requestedNavigation && requestedNavigation !== state.current.current.navigation) change(state.current.current.document, requestedNavigation)
  }, [ready, requestedNavigation, change])
  const acceptRemote = useCallback(() => {
    if (!conflict) return
    const s = state.current; const next = { document: conflict.document, navigation: conflict.navigation }
    s.revision = conflict.revision; s.blocked = false; s.pending = null; s.current = next
    useWorkspaceStore.getState().setTrellisNavigation(next.navigation)
    sessions.set(s.key, next); unsaved.delete(s.key); setLayout(next); setConflict(null); setStatus(s.durable ? 'saved' : 'session')
  }, [conflict])
  const keepLocal = useCallback(() => {
    if (!conflict) return
    const s = state.current; s.revision = conflict.revision; s.blocked = false; s.pending = s.current
    setConflict(null); void flush()
  }, [conflict, flush])
  return { ...layout, ready, status, reason, conflict, change, acceptRemote, keepLocal, retry: load }
}
