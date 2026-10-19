/**
 * Shellect 的跨包服务契约。SDK 会被内联进各插件，因此这里只放常量和类型，
 * 真正的注册表由 Shellect 插件通过 Cordis 服务提供。
 */

export const SHELLECT_SERVICE = 'xaihiShellect'
export const SHELLECT_ACTIONS_PATH = '/xaihi/shellect/actions'
export const SHELLECT_PLATFORMS = ['win32', 'darwin', 'linux'] as const

export type ShellectPlatform = (typeof SHELLECT_PLATFORMS)[number]
export type ShellectSelection = 'directories' | 'files' | 'any'
export type ShellectFieldType = 'boolean' | 'number' | 'select' | 'text'

export interface ShellectChoice {
  value: string
  label: string
}

export interface ShellectField {
  key: string
  label: string
  type: ShellectFieldType
  value?: boolean | number | string
  min?: number
  max?: number
  choices?: ShellectChoice[]
}

export interface ShellectActionResult<T = unknown> {
  success: boolean
  message: string
  data?: T
}

export interface ShellectAction {
  id: string
  nodeId?: string
  title: string
  selection: ShellectSelection
  mutates: boolean
  platforms?: ShellectPlatform[]
  fields?: ShellectField[] | (() => ShellectField[])
  preview: (paths: string[], values: Record<string, unknown>) => Promise<ShellectActionResult>
  execute: (paths: string[], values: Record<string, unknown>) => Promise<ShellectActionResult>
}

export interface ShellectService {
  register(action: ShellectAction): () => void
  catalog(platform?: ShellectPlatform): unknown
  list(platform?: ShellectPlatform): unknown[]
  prepare(id: string, paths: string[], platform?: ShellectPlatform, values?: Record<string, unknown>): Promise<unknown>
  execute(ticket: string): Promise<ShellectActionResult>
  onChange?(listener: () => void): () => void
}
