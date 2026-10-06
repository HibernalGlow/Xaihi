/**
 * Node-scoped configuration API shared by the shell and the node UI seam.
 *
 * `@xiranite/api/client` already speaks the `/config/nodes/...` protocol; what lives here is the two
 * read-modify-write behaviours both `src/backend/configRpcClient.ts` and `src/nodes/shared/api.ts` need, so
 * the merge semantics of a node config patch cannot drift between the two callers.
 */
import { getConfigApiClient } from "./xiraniteApiClient"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const nodeConfigApi = {
  get<T = unknown>(nodeId: string) {
    return getConfigApiClient().getNodeConfig<T>(nodeId)
  },

  /** Shallow-merges the patch over the persisted config; a non-record patch replaces it wholesale. */
  async save<T = unknown>(nodeId: string, config: T): Promise<void> {
    const current = await getConfigApiClient().getNodeConfig<Record<string, unknown>>(nodeId)
    const nextConfig = isRecord(current.config) && isRecord(config)
      ? { ...current.config, ...config }
      : config
    await getConfigApiClient().updateNodeConfig(nodeId, nextConfig)
  },

  async getUi<T = unknown>(nodeId: string): Promise<{ config: T | undefined; path: string }> {
    const result = await getConfigApiClient().getNodeConfig<Record<string, unknown>>(nodeId)
    const uiConfig = isRecord(result.config?.ui) ? result.config.ui as T : undefined
    return { config: uiConfig, path: result.path }
  },

  /** `undefined` values clear a UI key instead of persisting `null`, matching the TOML writer. */
  async saveUi<T = unknown>(nodeId: string, config: T): Promise<void> {
    const current = await getConfigApiClient().getNodeConfig<Record<string, unknown>>(nodeId)
    const currentNodeConfig = isRecord(current.config) ? current.config : {}
    const currentUi = isRecord(currentNodeConfig.ui) ? currentNodeConfig.ui : {}
    const nextUi = { ...currentUi }
    if (isRecord(config)) {
      for (const [key, value] of Object.entries(config)) {
        if (value === undefined) delete nextUi[key]
        else nextUi[key] = value
      }
    }
    await nodeConfigApi.save(nodeId, { ...currentNodeConfig, ui: nextUi })
  },

  versions(nodeId: string, options?: { limit?: number }) {
    return getConfigApiClient().getNodeConfigVersions(nodeId, options)
  },

  inspect(nodeId: string, revision: string) {
    return getConfigApiClient().inspectNodeConfigVersion(nodeId, revision)
  },

  restore<T = unknown>(nodeId: string, revision: string) {
    return getConfigApiClient().restoreNodeConfigVersion<T>(nodeId, revision)
  },

  exportConfig(nodeId: string, format?: "json" | "toml") {
    return getConfigApiClient().exportNodeConfig(nodeId, format)
  },

  importConfig<T = unknown>(nodeId: string, content: string, format?: "auto" | "json" | "toml") {
    return getConfigApiClient().importNodeConfig<T>(nodeId, content, format)
  },

  createBackup(nodeId: string, label?: string) {
    return getConfigApiClient().createNodeConfigBackup(nodeId, label)
  },

  historyStatus() {
    return getConfigApiClient().getConfigHistoryRepositoryStatus()
  },

  setHistoryRemote(url: string | null) {
    return getConfigApiClient().setConfigHistoryRemote(url)
  },

  syncHistory(direction: "pull" | "push") {
    return getConfigApiClient().syncConfigHistory(direction)
  },

  async openFile(): Promise<string> {
    const result = await getConfigApiClient().openConfigFile()
    return result.path
  },
}
