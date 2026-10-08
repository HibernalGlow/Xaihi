import type { KisakiTool } from "./core.js"

export const CZKAWKA_CACHE_SOURCE_VERSION = "12.0.0"

export interface KisakiCacheRegenerationState {
  sourceVersion?: string
  noticeSourceVersion?: string
}

const AFFECTED_TOOLS: readonly KisakiTool[] = [
  "duplicate-files",
  "similar-images",
  "similar-videos",
  "broken-files",
]

export function nextKisakiCacheRegenerationState(
  current: KisakiCacheRegenerationState,
  tool: KisakiTool,
): KisakiCacheRegenerationState | undefined {
  if (!AFFECTED_TOOLS.includes(tool)) return undefined
  if (
    current.sourceVersion === CZKAWKA_CACHE_SOURCE_VERSION
    && current.noticeSourceVersion === CZKAWKA_CACHE_SOURCE_VERSION
  ) return undefined
  return {
    sourceVersion: CZKAWKA_CACHE_SOURCE_VERSION,
    noticeSourceVersion: CZKAWKA_CACHE_SOURCE_VERSION,
  }
}
