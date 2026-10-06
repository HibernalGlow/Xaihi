import { createXiraniteRuntimeHistoryClient } from "@xiranite/api/client"
import type {
  RuntimeHistoryClearQueryDTO,
  RuntimeHistoryClearResultDTO,
  RuntimeHistoryItemDTO,
  RuntimeHistoryListDTO,
  RuntimeHistoryQueryDTO,
} from "@xiranite/shared"
import { resolveLocalBackendConfig, type LocalBackendConfig } from "./localBackendConfig"

let historyClient: ReturnType<typeof createXiraniteRuntimeHistoryClient> | null = null
let historyClientKey: string | null = null

export async function listRuntimeHistory(
  query: RuntimeHistoryQueryDTO,
): Promise<RuntimeHistoryListDTO> {
  return getHistoryClient().list(query)
}

export async function getRuntimeHistory(
  id: string,
): Promise<RuntimeHistoryItemDTO> {
  return getHistoryClient().get(id)
}

export async function deleteRuntimeHistory(id: string): Promise<void> {
  await getHistoryClient().delete(id)
}

export async function clearRuntimeHistory(
  query: RuntimeHistoryClearQueryDTO,
): Promise<RuntimeHistoryClearResultDTO> {
  return getHistoryClient().clear(query)
}

function getHistoryClient() {
  const config = resolveLocalBackendConfig()
  const key = historyClientCacheKey(config)
  if (historyClient && historyClientKey === key) return historyClient

  historyClient = createXiraniteRuntimeHistoryClient(config.baseUrl, { token: config.token })
  historyClientKey = key
  return historyClient
}

function historyClientCacheKey(config: LocalBackendConfig): string {
  return `${config.baseUrl}\n${config.token ?? ""}`
}
