import type {
  SourceThumbnailClient,
  SourceThumbnailRegistrationItem,
} from "@xiranite/api/client"
import { useCallback, useEffect, useRef, useState } from "react"

let contextSequence = 0

export interface SourceThumbnailRequest extends SourceThumbnailRegistrationItem {
  id: string
}

export interface SourceThumbnailsState {
  urls: ReadonlyMap<string, string>
  urlSets: ReadonlyMap<string, readonly string[]>
  loading: boolean
  refresh(id: string): Promise<void>
}

export function useSourceThumbnails(
  client: SourceThumbnailClient | undefined,
  owner: string,
  items: readonly SourceThumbnailRequest[],
): SourceThumbnailsState {
  const leaseRef = useRef<ThumbnailLease | undefined>(undefined)
  const issuedRefreshesRef = useRef(new Map<string, number>())
  const refreshSequenceRef = useRef(new Map<string, number>())
  const refreshWaitersRef = useRef(new Map<string, RefreshWaiter[]>())
  const [refreshRequests, setRefreshRequests] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [urlState, setUrlState] = useState<ThumbnailUrlState>(() => ({ owner, urls: new Map() }))
  const [loading, setLoading] = useState(false)

  useEffect(() => () => {
    releaseLease(leaseRef, client, owner)
    rejectRefreshWaiters(refreshWaitersRef.current, new DOMException("Thumbnail owner unmounted", "AbortError"))
  }, [client, owner])

  useEffect(() => {
    if (!client) {
      releaseLease(leaseRef)
      setUrlState((current) => current.owner === owner && !current.urls.size ? current : { owner, urls: new Map() })
      setLoading(false)
      return
    }
    if (!items.length) {
      releaseLease(leaseRef)
      setLoading(false)
      return
    }
    let lease = leaseRef.current
    if (!lease || lease.client !== client || lease.owner !== owner) {
      releaseLease(leaseRef)
      lease = { client, owner, contextId: `${owner}:${++contextSequence}`, generation: 0 }
      leaseRef.current = lease
    }
    const controller = new AbortController()
    const generation = ++lease.generation
    const { contextId } = lease
    setLoading(true)
    const requestedRefreshes = new Map<string, number>()
    const registrationItems = items.map((item) => {
      const requested = refreshRequests.get(item.id) ?? 0
      const issued = issuedRefreshesRef.current.get(item.id) ?? 0
      if (requested <= issued) return item
      issuedRefreshesRef.current.set(item.id, requested)
      requestedRefreshes.set(item.id, requested)
      return { ...item, refresh: true }
    })
    void client.register(contextId, generation, registrationItems, controller.signal).then((batch) => {
      if (controller.signal.aborted || batch.generation !== generation || leaseRef.current !== lease || lease.generation !== generation) {
        settleRefreshWaiters(refreshWaitersRef.current, requestedRefreshes, new DOMException("Thumbnail refresh became stale", "AbortError"))
        return
      }
      setUrlState({
        owner,
        urls: new Map(batch.items.map((item) => [item.id, item.thumbnailUrl])),
        urlSets: new Map(batch.items.map((item) => [item.id, item.thumbnailUrls?.length ? item.thumbnailUrls : [item.thumbnailUrl]])),
      })
      settleRefreshWaiters(refreshWaitersRef.current, requestedRefreshes)
    }).catch((error) => {
      settleRefreshWaiters(refreshWaitersRef.current, requestedRefreshes, error)
      if (!controller.signal.aborted && leaseRef.current === lease && lease.generation === generation) {
        setUrlState({ owner, urls: new Map() })
      }
    }).finally(() => {
      if (!controller.signal.aborted && leaseRef.current === lease && lease.generation === generation) setLoading(false)
    })
    return () => controller.abort()
  }, [client, items, owner, refreshRequests])

  const refresh = useCallback((id: string) => {
    if (!id) return Promise.reject(new TypeError("Thumbnail id is required."))
    const version = (refreshSequenceRef.current.get(id) ?? 0) + 1
    refreshSequenceRef.current.set(id, version)
    const promise = new Promise<void>((resolve, reject) => {
      const waiters = refreshWaitersRef.current.get(id) ?? []
      waiters.push({ version, resolve, reject })
      refreshWaitersRef.current.set(id, waiters)
    })
    setRefreshRequests(new Map(refreshSequenceRef.current))
    return promise
  }, [])

  return {
    urls: urlState.owner === owner ? urlState.urls : EMPTY_URLS,
    urlSets: urlState.owner === owner ? urlState.urlSets ?? EMPTY_URL_SETS : EMPTY_URL_SETS,
    loading,
    refresh,
  }
}

interface ThumbnailLease {
  client: SourceThumbnailClient
  owner: string
  contextId: string
  generation: number
}

interface ThumbnailUrlState {
  owner: string
  urls: ReadonlyMap<string, string>
  urlSets?: ReadonlyMap<string, readonly string[]>
}

interface RefreshWaiter {
  version: number
  resolve(): void
  reject(error: unknown): void
}

const EMPTY_URLS: ReadonlyMap<string, string> = new Map()
const EMPTY_URL_SETS: ReadonlyMap<string, readonly string[]> = new Map()

function settleRefreshWaiters(waitersById: Map<string, RefreshWaiter[]>, versions: ReadonlyMap<string, number>, error?: unknown): void {
  for (const [id, version] of versions) {
    const waiters = waitersById.get(id)
    if (!waiters) continue
    const pending: RefreshWaiter[] = []
    for (const waiter of waiters) {
      if (waiter.version > version) pending.push(waiter)
      else if (error === undefined) waiter.resolve()
      else waiter.reject(error)
    }
    if (pending.length) waitersById.set(id, pending)
    else waitersById.delete(id)
  }
}

function rejectRefreshWaiters(waitersById: Map<string, RefreshWaiter[]>, error: unknown): void {
  for (const waiters of waitersById.values()) for (const waiter of waiters) waiter.reject(error)
  waitersById.clear()
}

function releaseLease(
  leaseRef: { current: ThumbnailLease | undefined },
  expectedClient?: SourceThumbnailClient,
  expectedOwner?: string,
): void {
  const lease = leaseRef.current
  if (!lease || (expectedClient && lease.client !== expectedClient) || (expectedOwner && lease.owner !== expectedOwner)) return
  leaseRef.current = undefined
  void lease.client.releaseContext(lease.contextId).catch(() => undefined)
}
