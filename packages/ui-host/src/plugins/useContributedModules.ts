/**
 * The React adapter over `contributions.ts` — the only place in the plugin layer that imports React.
 *
 * Kept separate so the contribution rules stay framework-free and testable without a renderer
 * (`AGENTS`: 纯 TS 核心 + 框架薄适配).
 */

import { useSyncExternalStore } from "react"

import { contributedModules, subscribeModuleContributions } from "./contributions"

/** Modules contributed by installed frontend plugins, re-rendering the consumer when they change. */
export function useContributedModules() {
  return useSyncExternalStore(subscribeModuleContributions, contributedModules, contributedModules)
}
