/**
 * The window behaviour a node asks for, resolved through the *same* entry seam the renderer uses.
 *
 * This file used to index `packageModules.generated.ts` directly, which made it a second reader of
 * the static table — the thing `docs/plugin-architecture.md` §1.1 says must not exist. The
 * consequence was silent: a module provided by a runtime-registered remote (a plugin, or 阶段二's
 * built-in-node-as-remote) resolved its *content* from the remote but its window behaviour from the
 * build table, so its `window.maximizeBehavior` was ignored and the floating window kept offering
 * plain maximise.
 */

import type { MainWindowAction } from "@/backend/runtime/runtime"
import { resolveEntryLoader, type PackageModuleEntry } from "@/plugins/dynamicEntries"

export function resolveNodeMaximizeAction(entry: PackageModuleEntry): MainWindowAction {
  return "window" in entry && entry.window?.maximizeBehavior === "fullscreen"
    ? "toggle-fullscreen"
    : "maximize"
}

export async function loadNodeMaximizeAction(moduleId: string): Promise<MainWindowAction> {
  const loader = resolveEntryLoader(moduleId)
  if (!loader) return "maximize"
  return resolveNodeMaximizeAction((await loader()).default)
}
