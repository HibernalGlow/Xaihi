import { createXiraniteWorkspaceClient } from "@xiranite/api/client"
import type {
  ComponentWindowSizeDTO,
  ComponentWindowSizeLookupDTO,
  ComponentWindowSizeUpdateDTO,
  WorkspaceSnapshotDTO,
} from "@xiranite/shared"
import { resolveLocalBackendConfig, type LocalBackendConfig } from "./localBackendConfig"

let workspaceClient: ReturnType<typeof createXiraniteWorkspaceClient> | null = null
let workspaceClientKey: string | null = null

export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshotDTO> {
  return getWorkspaceClient().loadSnapshot()
}

export async function persistWorkspaceSnapshot(snapshot: WorkspaceSnapshotDTO): Promise<void> {
  await getWorkspaceClient().persistSnapshot(snapshot)
}

export async function resolveComponentWindowSize(input: ComponentWindowSizeLookupDTO): Promise<ComponentWindowSizeDTO | null> {
  return getWorkspaceClient().resolveComponentWindowSize(input)
}

export async function persistComponentWindowSize(input: ComponentWindowSizeUpdateDTO): Promise<ComponentWindowSizeDTO> {
  return getWorkspaceClient().persistComponentWindowSize(input)
}

function getWorkspaceClient() {
  const config = resolveLocalBackendConfig()
  const key = workspaceClientCacheKey(config)
  if (workspaceClient && workspaceClientKey === key) return workspaceClient

  workspaceClient = createXiraniteWorkspaceClient(config.baseUrl, { token: config.token })
  workspaceClientKey = key
  return workspaceClient
}

function workspaceClientCacheKey(config: LocalBackendConfig): string {
  return `${config.baseUrl}\n${config.token ?? ""}`
}
