import catalogJson from "../../config/webview2-flags.json"
import type { Webview2Config } from "@xiranite/api/client"

export type Webview2FlagTier = "recommended" | "optional" | "experimental"

export interface Webview2FlagDefinition {
  id: string
  key: string
  default: boolean
  tier: Webview2FlagTier
}

export interface Webview2FlagCatalog {
  features: Webview2FlagDefinition[]
  switches: Webview2FlagDefinition[]
}

export const WEBVIEW2_FLAG_CATALOG = catalogJson as Webview2FlagCatalog

export const DEFAULT_WEBVIEW2_CONFIG: Webview2Config = {
  features: WEBVIEW2_FLAG_CATALOG.features.filter((flag) => flag.default).map((flag) => flag.id),
  switches: WEBVIEW2_FLAG_CATALOG.switches.filter((flag) => flag.default).map((flag) => flag.id),
}

export function normalizeWebview2Config(config: Webview2Config | undefined): Webview2Config {
  if (!config) {
    return {
      features: [...DEFAULT_WEBVIEW2_CONFIG.features],
      switches: [...DEFAULT_WEBVIEW2_CONFIG.switches],
    }
  }
  const supportedFeatures = new Set(WEBVIEW2_FLAG_CATALOG.features.map((flag) => flag.id))
  const supportedSwitches = new Set(WEBVIEW2_FLAG_CATALOG.switches.map((flag) => flag.id))
  return {
    features: [...new Set(config.features)].filter((id) => supportedFeatures.has(id)),
    switches: [...new Set(config.switches)].filter((id) => supportedSwitches.has(id)),
  }
}
