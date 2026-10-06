import {
  createXiraniteFileDeletionClient,
  type FileDeletionExportFormat,
  type FileDeletionQuery,
} from "@xiranite/api/client"
import { resolveLocalBackendConfig, type LocalBackendConfig } from "./localBackendConfig"

let client: ReturnType<typeof createXiraniteFileDeletionClient> | null = null
let clientKey: string | null = null

export function listFileDeletions(query: FileDeletionQuery) {
  return getClient().list(query)
}

export function listFileDeletionNodes() {
  return getClient().listNodes()
}

export function restoreFileDeletion(id: string) {
  return getClient().restore(id)
}

export function downloadFileDeletionHistory(
  format: FileDeletionExportFormat,
  query: Omit<FileDeletionQuery, "cursor" | "limit"> = {},
): void {
  const anchor = document.createElement("a")
  anchor.href = getClient().exportUrl(format, query)
  anchor.download = ""
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function getClient() {
  const config = resolveLocalBackendConfig()
  const key = cacheKey(config)
  if (client && clientKey === key) return client
  client = createXiraniteFileDeletionClient(config.baseUrl, { token: config.token })
  clientKey = key
  return client
}

function cacheKey(config: LocalBackendConfig): string {
  return `${config.baseUrl}\n${config.token ?? ""}`
}
