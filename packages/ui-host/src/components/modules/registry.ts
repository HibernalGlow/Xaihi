import type { ModuleDef } from "@/types/workspace"
import { getContributedModule } from "@/plugins/contributions"
import { PACKAGE_MODULES } from "./packageModules.generated"

export const MODULE_REGISTRY: ModuleDef[] = [
  ...PACKAGE_MODULES,
  {
    id: "settings",
    name: "SETTINGS",
    version: "v1.0.0",
    category: "SYSTEM",
    description: "Universal project settings: appearance, background, runtime, and local data configuration.",
    icon: "Settings",
  },
  {
    id: "module-registry",
    name: "MODULE REGISTRY",
    version: "v1.0.0",
    category: "SYSTEM",
    description: "Browse, search, and deploy all available modules into the workspace.",
    icon: "PackageOpen",
  },
  {
    id: "node-history",
    name: "RUN HISTORY",
    version: "v1.0.0",
    category: "META",
    description: "Runtime history of node, workspace, config, and system events with filtering.",
    icon: "History",
  },
  {
    id: "node-operations",
    name: "NODE OPERATIONS",
    version: "v1.0.0",
    category: "META",
    description: "Live backend node runs: active, recent, and finished operations with stream events.",
    icon: "Activity",
  },
]

/** Retired toy modules: not listed, not imported by ModuleRenderer, but still resolvable so
 *  workspace instances saved before the retirement can render their frame title. */
export const RETIRED_MODULE_DEFS: readonly ModuleDef[] = [
  {
    id: "scratch",
    name: "SCRATCH",
    version: "v1.2.0",
    category: "UTILITY",
    description: "Ephemeral text buffer. Temporary storage for quick notes, variables, or copy-paste ops.",
    icon: "FileText",
  },
  {
    id: "counter",
    name: "COUNTER",
    version: "v0.9.4",
    category: "STATE",
    description: "Incremental tracking node. Stateful integer tracking with broadcast capabilities.",
    icon: "Plus",
  },
  {
    id: "tasks",
    name: "TASKS",
    version: "v1.0.5",
    category: "ORGANIZE",
    description: "Linear objective tracker. Sequential list management for operator workflows.",
    icon: "CheckSquare",
  },
  {
    id: "clock",
    name: "CLOCK",
    version: "v2.2.1",
    category: "UTILITY",
    description: "Global/Local temporal reference. High-precision sync with central server time.",
    icon: "Clock",
  },
  {
    id: "calculator",
    name: "CALCULATOR",
    version: "v1.1.0",
    category: "UTILITY",
    description: "Arithmetic processing unit. Essential localized computation and conversion tool.",
    icon: "Calculator",
  },
]

export function getModule(id: string): ModuleDef | undefined {
  return MODULE_REGISTRY.find(m => m.id === id)
    ?? getContributedModule(id)
    ?? RETIRED_MODULE_DEFS.find(m => m.id === id)
}
