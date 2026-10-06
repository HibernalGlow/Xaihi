import type { XiraniteConfigClient } from "@xiranite/api/client"
import type { Webview2Config } from "@xiranite/api/client"
import { nodeConfigApi } from "@/lib/nodeConfigApi"
import { getConfigApiClient } from "@/lib/xiraniteApiClient"

/**
 * The node-scoped config surface is shared with the node UI seam (`src/nodes/shared/api.ts`) through
 * `src/lib/nodeConfigApi.ts`, so the read-modify-write semantics of a config patch have exactly one owner.
 * What stays here is the shell's own naming plus the app-wide sections (themes, background, WebView2) that no
 * node may reach for.
 */
export function getConfigClient(): XiraniteConfigClient {
  return getConfigApiClient()
}

export async function getNodeConfigFromBackend<T = unknown>(
  nodeId: string,
): Promise<{ config: T | undefined; path: string }> {
  return nodeConfigApi.get<T>(nodeId)
}

export async function saveNodeConfigToBackend<T = unknown>(
  nodeId: string,
  config: T,
): Promise<void> {
  await nodeConfigApi.save(nodeId, config)
}

export async function getNodePresetsFromBackend<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string) {
  return getConfigClient().getNodePresets<TValues>(nodeId)
}

export async function createNodePresetOnBackend<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, input: { name: string; values: TValues }) {
  return getConfigClient().createNodePreset(nodeId, input)
}

export async function updateNodePresetOnBackend<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, presetId: string, input: { name?: string; values?: TValues }) {
  return getConfigClient().updateNodePreset(nodeId, presetId, input)
}

export async function deleteNodePresetOnBackend(nodeId: string, presetId: string) {
  return getConfigClient().deleteNodePreset(nodeId, presetId)
}

export async function getNodeConfigVersionsFromBackend(nodeId: string, options?: { limit?: number }) {
  return nodeConfigApi.versions(nodeId, options)
}

export async function inspectNodeConfigVersionFromBackend(nodeId: string, revision: string) {
  return nodeConfigApi.inspect(nodeId, revision)
}

export async function restoreNodeConfigVersionOnBackend<T = unknown>(nodeId: string, revision: string) {
  return nodeConfigApi.restore<T>(nodeId, revision)
}

export async function exportNodeConfigFromBackend(nodeId: string, format?: "json" | "toml") {
  return nodeConfigApi.exportConfig(nodeId, format)
}

export async function importNodeConfigOnBackend<T = unknown>(nodeId: string, content: string, format?: "auto" | "json" | "toml") {
  return nodeConfigApi.importConfig<T>(nodeId, content, format)
}

export async function createNodeConfigBackupOnBackend(nodeId: string, label?: string) {
  return nodeConfigApi.createBackup(nodeId, label)
}

export async function getConfigHistoryRepositoryFromBackend() {
  return nodeConfigApi.historyStatus()
}

export async function setConfigHistoryRemoteOnBackend(url: string | null) {
  return nodeConfigApi.setHistoryRemote(url)
}

export async function syncConfigHistoryOnBackend(direction: "pull" | "push") {
  return nodeConfigApi.syncHistory(direction)
}

export async function getNodeUiConfigFromBackend<T = unknown>(
  nodeId: string,
): Promise<{ config: T | undefined; path: string }> {
  return nodeConfigApi.getUi<T>(nodeId)
}

export async function saveNodeUiConfigToBackend<T = unknown>(
  nodeId: string,
  config: T,
): Promise<void> {
  await nodeConfigApi.saveUi(nodeId, config)
}

export async function getAppConfigFromBackend<T = unknown>(
  section: string,
): Promise<{ config: T | undefined; path: string }> {
  return getConfigClient().getAppConfig<T>(section)
}

export async function saveAppConfigToBackend<T = unknown>(
  section: string,
  config: T,
): Promise<void> {
  await getConfigClient().updateAppConfig<T>(section, config)
}

export async function getWebview2ConfigFromBackend(): Promise<{ config: Webview2Config | undefined; path: string }> {
  return getConfigClient().getWebview2Config()
}

export async function saveWebview2ConfigToBackend(config: Webview2Config): Promise<{ config: Webview2Config; path: string }> {
  return getConfigClient().updateWebview2Config(config)
}

export async function getCustomThemesFromBackend<T = unknown>(): Promise<{ themes: T[]; path: string }> {
  return getConfigClient().getCustomThemes() as Promise<{ themes: T[]; path: string }>
}

export async function saveCustomThemesToBackend<T = unknown>(themes: T[]): Promise<void> {
  await getConfigClient().saveCustomThemes(themes)
}

export async function getBackgroundImageFromBackend(): Promise<{ url: string | null; path: string }> {
  return getConfigClient().getBackgroundImage()
}

export async function saveBackgroundImageToBackend(url: string | null): Promise<void> {
  await getConfigClient().saveBackgroundImage(url)
}

export async function getConfigFilePath(): Promise<string> {
  return getConfigClient().getConfigPath()
}

export async function openConfigFileWithBackend(): Promise<string> {
  return nodeConfigApi.openFile()
}
