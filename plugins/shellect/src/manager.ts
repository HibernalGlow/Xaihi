export type ShellectPlatform = 'win32' | 'darwin' | 'linux'

export interface ShellectActionCatalogEntry {
  id: string
  nodeId: string
  title: string
  sourceTitle: string
  selection: 'directories' | 'files' | 'any'
  mutates: boolean
  registered: boolean
  supported: boolean
  enabled: boolean
  order: number
}

export interface ShellectManagerCatalog {
  platform: ShellectPlatform
  hostPlatform: ShellectPlatform
  title: string
  enabled: boolean
  namespace: string | null
  revision: number | null
  writable: boolean
  settingsReason: string
  policies: Record<string, unknown>
  actions: ShellectActionCatalogEntry[]
  nativeMenuState?: {
    status: string
    message: string
    actions?: Array<{ id: string; title: string }>
  }
}
