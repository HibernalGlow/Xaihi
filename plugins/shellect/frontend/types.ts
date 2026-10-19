import type { ShellectActionCatalogEntry, ShellectManagerCatalog, ShellectPlatform } from '../src/manager.ts'

export interface ShellectCallInput {
  action: 'catalog' | 'configure' | 'reset' | 'install_menu' | 'uninstall_menu' | 'sync_menu'
  platform?: ShellectPlatform
  id?: string
  title?: string
  enabled?: boolean
  order?: number
  expectedRevision?: number
}

export interface ShellectCallResult {
  success: boolean
  message?: string
  data?: ShellectManagerCatalog | {
    status?: string
    expectedRevision?: number
    actualRevision?: number | null
    catalog?: ShellectManagerCatalog
    message?: string
  }
}

export type ShellectCall = (input: ShellectCallInput) => Promise<ShellectCallResult>

export type ShellectUiFace = 'legacy' | 'md3e'

export interface ShellectManagerProps {
  call: ShellectCall
  subscribe?: (listener: (namespace: string, revision: number) => void) => () => void
  compact?: boolean
  uiFace?: ShellectUiFace
}

export interface ShellectManagerModel {
  platform: ShellectPlatform
  catalog: ShellectManagerCatalog | null
  actions: ShellectActionCatalogEntry[]
  drafts: Record<string, string>
  orders: Record<string, number>
  error: string
  conflict: string
  busy: string | null
  setPlatform: (platform: ShellectPlatform) => void
  load: (platform?: ShellectPlatform) => Promise<void>
  saveTitle: (item: ShellectActionCatalogEntry) => Promise<void>
  saveOrder: (item: ShellectActionCatalogEntry) => Promise<void>
  toggleEnabled: (enabled: boolean) => Promise<void>
  toggleAction: (item: ShellectActionCatalogEntry) => Promise<void>
  setDraft: (id: string, value: string) => void
  setOrder: (id: string, value: number) => void
}
