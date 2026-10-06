import type { AppNodeEntry, HeadlessNodePackage, NodeTrayDeclaration, NodeTrayMenuItem } from "@xiranite/contract"

import { getRuntime } from "@/backend/client"
import type { NativeTraySpec, RuntimeInterface, TrayActionEvent, TrayMenuItemSpec } from "@/backend/runtime/runtime"
import { createLogger } from "@/lib/logger"

const logger = createLogger("desktop.tray")

export const MAIN_TRAY_STORAGE_KEY = "xiranite:desktop:main-tray-enabled"

type PackageModuleEntry = AppNodeEntry | HeadlessNodePackage
type Listener = () => void

const declarations = new Map<string, readonly NodeTrayDeclaration[]>()
const actionHandlers = new Map<string, () => void | Promise<void>>()
const listeners = new Set<Listener>()

let runtime: RuntimeInterface | null = null
let supported = false
let mainEnabled = false
let initPromise: Promise<void> | null = null
let syncRevision = 0
let stateSnapshot: MainTrayState = { enabled: false, supported: false }

export interface MainTrayState {
  enabled: boolean
  supported: boolean
}

export function getMainTrayState(): MainTrayState {
  return stateSnapshot
}

export function subscribeMainTrayState(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function initializeDesktopTrays(): Promise<void> {
  if (initPromise) return initPromise
  const pending = (async () => {
    runtime = await getRuntime()
    const capabilities = await runtime.trays.getCapabilities()
    supported = capabilities.supported
    if (!supported) {
      emitState()
      return
    }

    const saved = await runtime.storage.get(MAIN_TRAY_STORAGE_KEY)
    mainEnabled = saved === "1"
    await runtime.trays.subscribe(handleTrayAction)
    await runtime.trays.setMainEnabled(mainEnabled)
    emitState()
    const next = buildNativeTraySpecs(declarations)
    replaceActionHandlers(next.actions)
    await runtime.trays.sync(next.specs)
  })()
  initPromise = pending.catch((error) => {
    initPromise = null
    throw error
  })
  return initPromise
}

export async function setMainTrayEnabled(enabled: boolean): Promise<void> {
  await initializeDesktopTrays()
  if (!runtime || !supported) return
  mainEnabled = enabled
  await runtime.storage.set(MAIN_TRAY_STORAGE_KEY, enabled ? "1" : "0")
  await runtime.trays.setMainEnabled(enabled)
  emitState()
}

export function registerNodeTrays(nodeId: string, entry: PackageModuleEntry): void {
  if (!("tray" in entry) || !entry.tray) return
  declarations.set(nodeId, Array.isArray(entry.tray) ? entry.tray : [entry.tray])
  void syncDesktopTrays().catch((error) => {
    logger.warn("Failed to register node tray", { nodeId }, error)
  })
}

export function buildNativeTraySpecs(
  nodeDeclarations: ReadonlyMap<string, readonly NodeTrayDeclaration[]>,
): { specs: NativeTraySpec[]; actions: Map<string, () => void | Promise<void>> } {
  const actions = new Map<string, () => void | Promise<void>>()
  const mainItems: TrayMenuItemSpec[] = []
  const standalone: NativeTraySpec[] = []

  for (const [nodeId, trays] of nodeDeclarations) {
    trays.forEach((declaration, index) => {
      const declarationId = declaration.id || `${declaration.scope}-${index}`
      const trayId = declaration.scope === "main" ? "xiranite.main" : `node.${nodeId}.${declarationId}`
      const itemPrefix = `node.${nodeId}.${declarationId}`
      const items = mapMenuItems(declaration.items ?? [], itemPrefix, declaration.onAction, actions, trayId)

      if (declaration.scope === "main") {
        mainItems.push({
          id: `${itemPrefix}.menu`,
          label: declaration.label || nodeId,
          children: items,
        })
      } else {
        standalone.push({
          id: trayId,
          kind: "standalone",
          tooltip: declaration.tooltip || declaration.label || nodeId,
          icon: declaration.icon,
          items,
        })
      }
    })
  }

  return {
    specs: [{ id: "xiranite.main", kind: "main", tooltip: "Xiranite", items: mainItems }, ...standalone],
    actions,
  }
}

async function syncDesktopTrays(): Promise<void> {
  const revision = ++syncRevision
  await initializeDesktopTrays()
  if (!runtime || !supported || revision !== syncRevision) return
  const next = buildNativeTraySpecs(declarations)
  replaceActionHandlers(next.actions)
  await runtime.trays.sync(next.specs)
}

function replaceActionHandlers(next: ReadonlyMap<string, () => void | Promise<void>>): void {
  actionHandlers.clear()
  next.forEach((handler, id) => actionHandlers.set(id, handler))
}

function mapMenuItems(
  items: readonly NodeTrayMenuItem[],
  prefix: string,
  onAction: NodeTrayDeclaration["onAction"],
  actions: Map<string, () => void | Promise<void>>,
  trayId: string,
): TrayMenuItemSpec[] {
  return items.map((item, index) => {
    if (item.type === "separator") {
      return { id: `${prefix}.separator-${index}`, label: "", type: "separator" }
    }
    const id = `${prefix}.${item.id}`
    if (onAction && !item.children?.length) actions.set(`${trayId}\n${id}`, () => onAction(item.id))
    return {
      id,
      label: item.label,
      type: item.type,
      enabled: item.enabled,
      checked: item.checked,
      children: item.children ? mapMenuItems(item.children, id, onAction, actions, trayId) : undefined,
    }
  })
}

function handleTrayAction(event: TrayActionEvent): void {
  void actionHandlers.get(`${event.trayId}\n${event.itemId}`)?.()
}

function emitState(): void {
  stateSnapshot = { enabled: mainEnabled, supported }
  listeners.forEach((listener) => listener())
}
