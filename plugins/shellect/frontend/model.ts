import { useCallback, useEffect, useState } from 'react'
import type { ShellectActionCatalogEntry, ShellectManagerCatalog, ShellectPlatform } from '../src/manager.ts'
import type { ShellectCall, ShellectManagerModel, ShellectManagerProps } from './types.ts'

export const SHELLECT_PLATFORMS: Array<{ id: ShellectPlatform; label: string }> = [
  { id: 'darwin', label: 'macOS' },
  { id: 'win32', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
]

export function isShellectCatalog(value: unknown): value is ShellectManagerCatalog {
  return Boolean(value && typeof value === 'object' && 'actions' in value && Array.isArray((value as { actions?: unknown }).actions))
}

function catalogDrafts(catalog: ShellectManagerCatalog): Record<string, string> {
  return Object.fromEntries(catalog.actions.map((item) => [item.id, item.title]))
}

function catalogOrders(catalog: ShellectManagerCatalog): Record<string, number> {
  return Object.fromEntries(catalog.actions.map((item) => [item.id, item.order]))
}

function conflictMessage(expected: number, data: { actualRevision?: number | null; catalog?: ShellectManagerCatalog }): string {
  return `原版本 ${expected}，当前版本 ${data.actualRevision ?? data.catalog?.revision ?? '?'}`
}

export function useShellectManagerModel({ call, subscribe }: {
  call: ShellectManagerProps['call']
  subscribe?: ShellectManagerProps['subscribe'] | undefined
}): ShellectManagerModel {
  const [platform, setPlatform] = useState<ShellectPlatform>('darwin')
  const [catalog, setCatalog] = useState<ShellectManagerCatalog | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const applyCatalog = useCallback((next: ShellectManagerCatalog) => {
    setCatalog(next)
    setDrafts(catalogDrafts(next))
    setOrders(catalogOrders(next))
  }, [])

  const load = useCallback(async (nextPlatform = platform) => {
    setBusy('catalog')
    const response = await call({ action: 'catalog', platform: nextPlatform })
    if (!response.success || !isShellectCatalog(response.data)) {
      setError(response.message ?? 'Shellect catalog unavailable')
      setBusy(null)
      return
    }
    applyCatalog(response.data)
    setError('')
    setConflict('')
    setBusy(null)
  }, [applyCatalog, call, platform])

  useEffect(() => {
    void load()
  }, [call])

  useEffect(() => {
    if (!subscribe) return undefined
    return subscribe((namespace) => {
      if (!catalog?.namespace || namespace === catalog.namespace) void load()
    })
  }, [catalog?.namespace, load, subscribe])

  const configure = useCallback(async (input: Parameters<ShellectCall>[0], expected: number): Promise<void> => {
    const response = await call({ ...input, expectedRevision: expected })
    const data = response.data
    if (data && !isShellectCatalog(data) && 'status' in data && data.status === 'conflict') {
      if (data.catalog) applyCatalog(data.catalog)
      setConflict(conflictMessage(expected, data))
      setBusy(null)
      return
    }
    if (!response.success) setError(response.message ?? 'Shellect settings update failed')
    else if (data && !isShellectCatalog(data) && data.catalog) applyCatalog(data.catalog)
    setBusy(null)
  }, [applyCatalog, call])

  const saveTitle = useCallback(async (item: ShellectActionCatalogEntry) => {
    if (!catalog?.writable || catalog.revision === null || !item.registered) return
    setBusy(`title:${item.id}`)
    await configure({ action: 'configure', platform, id: item.id, title: drafts[item.id] ?? item.title }, catalog.revision)
  }, [catalog, configure, drafts, platform])

  const saveOrder = useCallback(async (item: ShellectActionCatalogEntry) => {
    if (!catalog?.writable || catalog.revision === null || !item.registered) return
    setBusy(`order:${item.id}`)
    await configure({ action: 'configure', platform, id: item.id, order: orders[item.id] ?? item.order }, catalog.revision)
  }, [catalog, configure, orders, platform])

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    if (!catalog?.writable || catalog.revision === null) return
    setBusy('enabled')
    await configure({ action: 'configure', platform, enabled }, catalog.revision)
  }, [catalog, configure, platform])

  const toggleAction = useCallback(async (item: ShellectActionCatalogEntry) => {
    if (!catalog?.writable || catalog.revision === null || !item.registered) return
    setBusy(`action:${item.id}`)
    await configure({ action: 'configure', platform, id: item.id, enabled: !item.enabled }, catalog.revision)
  }, [catalog, configure, platform])

  return {
    platform,
    catalog,
    actions: catalog?.actions ?? [],
    drafts,
    orders,
    error,
    conflict,
    busy,
    setPlatform,
    load,
    saveTitle,
    saveOrder,
    toggleEnabled,
    toggleAction,
    setDraft: (id, value) => setDrafts((current) => ({ ...current, [id]: value })),
    setOrder: (id, value) => setOrders((current) => ({ ...current, [id]: value })),
  }
}
