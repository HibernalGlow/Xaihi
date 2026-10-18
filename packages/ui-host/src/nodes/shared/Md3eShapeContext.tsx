import * as React from "react"
import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode, type Ref } from "react"
import { Lock, RefreshCw, RotateCcw, Shuffle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { NodeSurface, NodeSurfaceMode } from "./useNodeSurface"
import { useNodeRuntimeId } from "./NodeRuntimeContext"
import { useNodeUiConfig, type NodeUiConfigStore } from "./NodeUiConfigContext"
import {
  getMd3eShapeSpec,
  MD3E_BUTTON_ROLES,
  MD3E_EXPRESSIVE_SHAPES,
  MD3E_PRIMARY_ICON_SHAPE_PRESETS,
  MD3E_QUICK_PRESETS,
  MD3E_TEXT_BUTTON_SHAPES,
  readNodeShapePolicy,
  resolveMd3eButtonShape,
  resolveSessionRoleShapes,
  writeNodeShapePolicy,
  type Md3eButtonRole,
  type Md3eExpressiveShapeId,
  type Md3eNodeShapePolicy,
  type Md3eQuickPresetId,
  type Md3eResolvedButtonShape,
  type Md3eShapeCapabilityProbeInput,
  type Md3eShapeDegradationReason,
  type Md3eShapePolicyMode,
  type Md3eTextButtonShapeId,
} from "./md3eShapeSystem"

type PolicyListener = (nodeId: string, policy: Md3eNodeShapePolicy) => void
const policyListeners = new Set<PolicyListener>()

export function notifyNodeShapePolicyChanged(nodeId: string, policy: Md3eNodeShapePolicy): void {
  for (const listener of [...policyListeners]) {
    listener(nodeId, policy)
  }
}

export function subscribeNodeShapePolicy(listener: PolicyListener): () => void {
  policyListeners.add(listener)
  return () => {
    policyListeners.delete(listener)
  }
}

export interface Md3eShapeContextValue {
  enabled: boolean
  nodeId: string
  policy: Md3eNodeShapePolicy
  activeRoleShapes: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  activeTextButtonShape: Md3eTextButtonShapeId
  persistenceSource: "dsh-settings" | "local-fallback" | "default"
  loaded: boolean
  saving: boolean
  saveError: string | null
  probe: Required<Pick<Md3eShapeCapabilityProbeInput, "cssClipPathSupported" | "contrastLevel" | "forcedColors">> & {
    surfaceWidth?: number
    surfaceMode?: NodeSurfaceMode
  }
  resolveIconButtonShape: (role: Md3eButtonRole, buttonSize?: string) => Md3eResolvedButtonShape
  setPolicyMode: (mode: Md3eShapePolicyMode) => Promise<void>
  pinCurrentShapes: () => Promise<void>
  setRoleShape: (role: Md3eButtonRole, shapeId: Md3eExpressiveShapeId) => Promise<void>
  setTextButtonShape: (shapeId: Md3eTextButtonShapeId) => Promise<void>
  applyQuickPreset: (presetId: Md3eQuickPresetId) => Promise<void>
  randomizeAllShapes: () => Promise<void>
}

const Md3eShapeContext = createContext<Md3eShapeContextValue | null>(null)

function readDomUiFaceEnabled(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.getAttribute("data-ui-face") === "md3e"
}

function readDomContrastLevel(): number {
  if (typeof document === "undefined") return 0
  const raw = document.documentElement.getAttribute("data-md3-contrast")
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function readForcedColors(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  try {
    return window.matchMedia("(forced-colors: active)").matches
  } catch {
    return false
  }
}

export interface Md3eShapeProviderProps {
  children: ReactNode
  nodeId?: string
  enabled?: boolean
  store?: NodeUiConfigStore
  surfaceWidth?: number
  surfaceMode?: NodeSurfaceMode
  probeOverride?: Partial<Md3eShapeCapabilityProbeInput>
}

export function Md3eShapeProvider({
  children,
  nodeId: propNodeId,
  enabled: propEnabled,
  store: propStore,
  surfaceWidth,
  surfaceMode,
  probeOverride,
}: Md3eShapeProviderProps) {
  const runtimeNodeId = useNodeRuntimeId()
  const contextStore = useNodeUiConfig()
  const store = propStore ?? contextStore
  const effectiveNodeId = (propNodeId ?? runtimeNodeId ?? "workspace").trim() || "workspace"

  const [domEnabled, setDomEnabled] = useState<boolean>(() => readDomUiFaceEnabled())
  const [domContrast, setDomContrast] = useState<number>(() => readDomContrastLevel())
  const [domForcedColors, setDomForcedColors] = useState<boolean>(() => readForcedColors())

  useEffect(() => {
    if (typeof document === "undefined") return
    const observer = new MutationObserver(() => {
      setDomEnabled(readDomUiFaceEnabled())
      setDomContrast(readDomContrastLevel())
      setDomForcedColors(readForcedColors())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-face", "data-md3-contrast"],
    })
    return () => observer.disconnect()
  }, [])

  const [policy, setPolicy] = useState<Md3eNodeShapePolicy>(() => readNodeShapePolicy(effectiveNodeId))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const activeRoleShapes = useMemo(() => resolveSessionRoleShapes(policy), [policy])
  const activeTextButtonShape = policy.textShape ?? "capsule"

  const probe = useMemo(
    () => ({
      cssClipPathSupported: probeOverride?.cssClipPathSupported ?? true,
      contrastLevel: probeOverride?.contrastLevel ?? domContrast,
      forcedColors: probeOverride?.forcedColors ?? domForcedColors,
      surfaceWidth,
      surfaceMode,
    }),
    [domContrast, domForcedColors, probeOverride, surfaceMode, surfaceWidth],
  )

  const resolveIconButtonShapeCb = (role: Md3eButtonRole, buttonSize?: string) =>
    resolveMd3eButtonShape(role, activeRoleShapes, probe, buttonSize)

  const setPolicyMode = async (mode: Md3eShapePolicyMode) => {
    const next: Md3eNodeShapePolicy = { ...policy, mode }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const pinCurrentShapes = async () => {
    const next: Md3eNodeShapePolicy = { ...policy, mode: "fixed", roleShapes: activeRoleShapes }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const setRoleShape = async (role: Md3eButtonRole, shapeId: Md3eExpressiveShapeId) => {
    const next: Md3eNodeShapePolicy = {
      ...policy,
      mode: "fixed",
      roleShapes: { ...activeRoleShapes, [role]: shapeId },
    }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const setTextButtonShape = async (textShape: Md3eTextButtonShapeId) => {
    const next: Md3eNodeShapePolicy = { ...policy, mode: "fixed", textShape }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const applyQuickPreset = async (presetId: Md3eQuickPresetId) => {
    const preset = MD3E_QUICK_PRESETS[presetId] ?? MD3E_QUICK_PRESETS.default
    const next: Md3eNodeShapePolicy = {
      mode: "fixed",
      roleShapes: { ...preset.roles },
      textShape: preset.textShape,
    }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const randomizeAllShapes = async () => {
    const pool = MD3E_EXPRESSIVE_SHAPES.map((s) => s.id)
    const randomRole = () => pool[Math.floor(Math.random() * pool.length)]!
    const next: Md3eNodeShapePolicy = {
      mode: "fixed",
      roleShapes: {
        primary: randomRole(),
        secondary: randomRole(),
        toolbar: randomRole(),
        danger: randomRole(),
        action: randomRole(),
        tab: randomRole(),
      },
      textShape: activeTextButtonShape,
    }
    setPolicy(next)
    await writeNodeShapePolicy(effectiveNodeId, next)
    notifyNodeShapePolicyChanged(effectiveNodeId, next)
  }

  const isEnabled = propEnabled ?? domEnabled

  const value = useMemo<Md3eShapeContextValue>(
    () => ({
      enabled: isEnabled,
      nodeId: effectiveNodeId,
      policy,
      activeRoleShapes,
      activeTextButtonShape,
      persistenceSource: "dsh-settings",
      loaded: true,
      saving,
      saveError,
      probe,
      resolveIconButtonShape: resolveIconButtonShapeCb,
      setPolicyMode,
      pinCurrentShapes,
      setRoleShape,
      setTextButtonShape,
      applyQuickPreset,
      randomizeAllShapes,
    }),
    [isEnabled, effectiveNodeId, policy, activeRoleShapes, activeTextButtonShape, saving, saveError, probe],
  )

  return <Md3eShapeContext.Provider value={value}>{children}</Md3eShapeContext.Provider>
}

export function useMd3eShapeContext(): Md3eShapeContextValue | null {
  return useContext(Md3eShapeContext)
}

const MD3E_NODE_SURFACE_CSS = `
[data-node-ui="md3e"],
:root[data-ui-face="md3e"] .xiranite-node-surface {
  --md3e-surface-lowest: var(--md-sys-color-surface-container-lowest, color-mix(in oklab, var(--card) 96%, var(--background)));
  --md3e-surface-low: var(--md-sys-color-surface-container-low, color-mix(in oklab, var(--card) 92%, var(--muted) 8%));
  --md3e-surface: var(--md-sys-color-surface-container, color-mix(in oklab, var(--card) 82%, var(--muted) 18%));
  --md3e-surface-high: var(--md-sys-color-surface-container-high, color-mix(in oklab, var(--card) 66%, var(--muted) 34%));
  --md3e-surface-highest: var(--md-sys-color-surface-container-highest, color-mix(in oklab, var(--card) 48%, var(--muted) 52%));
  --md3e-primary-container: color-mix(in oklab, var(--md-sys-color-secondary-container, var(--secondary)) 72%, var(--md-sys-color-surface-container-high, var(--muted)));
  --md3e-on-primary-container: var(--md-sys-color-on-secondary-container, var(--foreground));
  --md3e-secondary-container: var(--md-sys-color-secondary-container, color-mix(in oklab, var(--secondary) 72%, var(--primary) 14%));
  --md3e-on-secondary-container: var(--md-sys-color-on-secondary-container, var(--secondary-foreground));
  --md3e-tertiary-container: color-mix(in oklab, var(--md-sys-color-secondary-container, var(--secondary)) 52%, var(--md-sys-color-surface-container-highest, var(--muted)));
  --md3e-on-tertiary-container: var(--md-sys-color-on-secondary-container, var(--foreground));
  --md3e-spring: cubic-bezier(0.22, 1.4, 0.36, 1);
  background-color: var(--md3e-surface-low);
  background-image:
    radial-gradient(circle at 8% 0%, color-mix(in oklab, var(--md3e-secondary-container) 28%, transparent) 0%, transparent 45%),
    radial-gradient(circle at 92% 100%, color-mix(in oklab, var(--md3e-surface-high) 35%, transparent) 0%, transparent 48%);
  container-type: inline-size;
  min-width: 0;
  min-height: 0;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-node-hero"] {
  flex: 0 0 auto !important;
  height: auto !important;
  min-width: 0;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-header-banner"] {
  border-radius: 24px !important;
  border: none !important;
  background-color: var(--md3e-surface) !important;
  background-image: linear-gradient(
    135deg,
    color-mix(in oklab, var(--md3e-secondary-container) 34%, var(--md3e-surface)) 0%,
    var(--md3e-surface) 100%
  ) !important;
  box-shadow: 0 4px 16px -10px color-mix(in oklab, var(--md-sys-color-shadow, #000) 14%, transparent) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-patch-backdrop"] {
  border-radius: 20px 24px 12px 22px;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-stat-tile"] {
  border-radius: 16px 20px 10px 18px;
  background-color: color-mix(in oklab, var(--md3e-surface-high) 82%, var(--md3e-surface));
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-bento-stat-grid"] {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)) !important;
  gap: 8px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-workbench-grid"] {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 12px !important;
  min-height: 0;
  flex: 1 1 0%;
}

@container (min-width: 620px) {
  :is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-workbench-grid"] {
    grid-template-columns: minmax(270px, 340px) minmax(0, 1fr) !important;
    grid-template-rows: minmax(0, 1fr) !important;
  }
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-connected-group"] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 22px;
  overflow: hidden;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-connected-group"] > * {
  border-radius: 6px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-connected-group"] > *:first-child {
  border-top-left-radius: 20px !important;
  border-top-right-radius: 20px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-connected-group"] > *:last-child {
  border-bottom-left-radius: 20px !important;
  border-bottom-right-radius: 20px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-hero-action-bar"] {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  background-color: var(--md3e-surface-high);
  padding: 5px;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-hero-action-bar"] > [data-slot="button"]:first-child,
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-hero-action-bar"] > [data-phase]:first-child {
  flex: 1 1 0%;
  height: 40px !important;
  border-radius: 9999px !important;
  font-weight: 800 !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"] {
  height: 30px !important;
  width: 52px !important;
  border-radius: 9999px !important;
  padding: 3px !important;
  transition: background-color 200ms ease, border-color 200ms ease, transform 180ms var(--md3e-spring) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"][data-state="checked"] {
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
  border-color: var(--md-sys-color-primary, var(--primary)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"][data-state="unchecked"] {
  background-color: var(--md3e-surface-highest) !important;
  border: 2px solid var(--md-sys-color-outline, color-mix(in oklab, var(--foreground) 28%, transparent)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch-thumb"] {
  border-radius: 9999px !important;
  transition:
    transform 220ms var(--md3e-spring),
    width 200ms var(--md3e-spring),
    height 200ms var(--md3e-spring),
    border-radius 200ms var(--md3e-spring) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"][data-state="checked"] [data-slot="switch-thumb"] {
  width: 22px !important;
  height: 22px !important;
  border-radius: 9px !important;
  background-color: var(--md-sys-color-on-primary, var(--primary-foreground)) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"] [data-slot="switch-thumb"]::after {
  display: none !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="switch"]:active [data-slot="switch-thumb"] {
  width: 26px !important;
  border-radius: 6px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="slider-track"] {
  height: 18px !important;
  border-radius: 9999px !important;
  background-color: var(--md3e-secondary-container) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="slider-range"] {
  border-radius: 9999px 6px 6px 9999px !important;
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="slider-thumb"] {
  width: 7px !important;
  height: 28px !important;
  border-radius: 9999px !important;
  border: none !important;
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
  box-shadow: 0 0 0 3px var(--md3e-surface, var(--card)), 0 2px 8px color-mix(in oklab, var(--md-sys-color-primary, var(--primary)) 40%, transparent) !important;
  transition: transform 180ms var(--md3e-spring), width 180ms ease !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="slider-thumb"]:active {
  width: 5px !important;
  transform: scaleY(1.14) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="tabs-list"] {
  border-radius: 9999px !important;
  background-color: var(--md3e-surface-high) !important;
  border: none !important;
  padding: 3px !important;
  gap: 3px !important;
  height: auto !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="tabs-trigger"] {
  border-radius: 10px !important;
  border: none !important;
  padding: 5px 12px !important;
  font-weight: 700 !important;
  color: var(--muted-foreground) !important;
  transition:
    border-radius 220ms var(--md3e-spring),
    background-color 180ms ease,
    color 180ms ease,
    transform 160ms var(--md3e-spring) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="tabs-trigger"]::after {
  display: none !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="tabs-trigger"][data-state="active"] {
  border-radius: 9999px !important;
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
  color: var(--md-sys-color-on-primary, var(--primary-foreground)) !important;
  box-shadow: 0 2px 10px color-mix(in oklab, var(--md-sys-color-primary, var(--primary)) 32%, transparent) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="tabs-trigger"]:active {
  transform: scale(0.95) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="input"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="textarea"] {
  border-radius: 16px !important;
  border-color: color-mix(in oklab, var(--md-sys-color-outline-variant, var(--border)) 45%, transparent) !important;
  background-color: var(--md3e-surface-lowest) !important;
  transition: border-color 180ms ease, box-shadow 180ms ease, border-radius 180ms var(--md3e-spring) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="select-trigger"] {
  width: 100% !important;
  height: 38px !important;
  border-radius: 9999px !important;
  border: none !important;
  padding: 0 14px !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  background-color: var(--md3e-surface-lowest) !important;
  color: var(--foreground) !important;
  box-shadow: 0 1px 3px color-mix(in oklab, var(--md-sys-color-shadow, #000) 8%, transparent) !important;
  transition:
    transform 180ms var(--md3e-spring),
    border-radius 200ms var(--md3e-spring),
    background-color 160ms ease,
    box-shadow 180ms ease !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="select-trigger"]:hover {
  background-color: color-mix(in oklab, var(--md3e-secondary-container) 38%, var(--md3e-surface-lowest)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="select-trigger"][data-state="open"] {
  border-radius: 14px !important;
  background-color: color-mix(in oklab, var(--md3e-secondary-container) 55%, var(--md3e-surface-lowest)) !important;
  box-shadow: 0 0 0 2px var(--md-sys-color-primary, var(--primary)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="select-trigger"] svg {
  transition: transform 220ms var(--md3e-spring) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="select-trigger"][data-state="open"] svg {
  transform: rotate(180deg) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="input"]:focus-visible,
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="textarea"]:focus-visible {
  border-radius: 12px !important;
  border-color: var(--md-sys-color-primary, var(--primary)) !important;
}

/* M3E Expressive Popup / Select / Dropdown / Popover (Portals on document.body) */
@keyframes md3ePopupSpringIn {
  0% {
    opacity: 0;
    transform: scale(0.86) translateY(var(--md3e-popup-slide-y, -10px)) translateX(var(--md3e-popup-slide-x, 0px));
  }
  62% {
    opacity: 1;
    transform: scale(1.026) translateY(0px) translateX(0px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0px) translateX(0px);
  }
}

@keyframes md3ePopupSpringOut {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0px);
  }
  100% {
    opacity: 0;
    transform: scale(0.93) translateY(var(--md3e-popup-exit-y, -4px));
  }
}

[data-slot="select-content"],
[data-slot="dropdown-menu-content"],
[data-slot="popover-content"] {
  --md3e-popup-slide-y: -10px;
  --md3e-popup-exit-y: -4px;
  border-radius: 22px 26px 18px 24px !important;
  border: none !important;
  background-color: var(--md-sys-color-surface-container-high, var(--popover)) !important;
  color: var(--md-sys-color-on-surface, var(--popover-foreground)) !important;
  padding: 6px !important;
  box-shadow:
    0 20px 44px -12px color-mix(in oklab, var(--md-sys-color-shadow, #000) 28%, transparent),
    0 4px 14px 0 color-mix(in oklab, var(--md-sys-color-shadow, #000) 14%, transparent),
    inset 0 0 0 1px color-mix(in oklab, var(--md-sys-color-outline-variant, var(--border)) 42%, transparent) !important;
  transform-origin: var(
    --radix-select-content-transform-origin,
    var(--radix-dropdown-menu-content-transform-origin, var(--radix-popover-content-transform-origin, top center))
  ) !important;
  will-change: transform, opacity;
}

[data-slot="select-content"][data-side="top"],
[data-slot="dropdown-menu-content"][data-side="top"],
[data-slot="popover-content"][data-side="top"] {
  --md3e-popup-slide-y: 10px;
  --md3e-popup-exit-y: 4px;
}

[data-slot="select-content"][data-state="open"],
[data-slot="dropdown-menu-content"][data-state="open"],
[data-slot="popover-content"][data-state="open"] {
  animation: md3ePopupSpringIn 320ms cubic-bezier(0.22, 1.4, 0.36, 1) forwards !important;
}

[data-slot="select-content"][data-state="closed"],
[data-slot="dropdown-menu-content"][data-state="closed"],
[data-slot="popover-content"][data-state="closed"] {
  animation: md3ePopupSpringOut 150ms cubic-bezier(0.4, 0, 1, 1) forwards !important;
}

[data-slot="select-viewport"] {
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
  padding: 2px !important;
}

[data-slot="select-item"],
[data-slot="dropdown-menu-item"] {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  border-radius: 14px !important;
  padding: 9px 38px 9px 14px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--md-sys-color-on-surface, var(--foreground)) !important;
  background-color: color-mix(in oklab, var(--md-sys-color-surface-container, var(--card)) 55%, transparent) !important;
  transition:
    border-radius 200ms cubic-bezier(0.22, 1.4, 0.36, 1),
    transform 180ms cubic-bezier(0.22, 1.4, 0.36, 1),
    background-color 140ms ease,
    color 140ms ease !important;
}

[data-slot="select-item"]:is([data-highlighted], :hover, :focus),
[data-slot="dropdown-menu-item"]:is([data-highlighted], :hover, :focus) {
  border-radius: 18px !important;
  background-color: color-mix(
    in oklab,
    var(--md-sys-color-secondary-container, var(--secondary)) 72%,
    var(--md-sys-color-surface-container-highest, var(--muted))
  ) !important;
  color: var(--md-sys-color-on-secondary-container, var(--foreground)) !important;
  transform: scale(1.015) !important;
}

[data-slot="select-item"]:active,
[data-slot="dropdown-menu-item"]:active {
  border-radius: 10px !important;
  transform: scale(0.96) !important;
}

[data-slot="select-item"][data-state="checked"] {
  border-radius: 9999px !important;
  font-weight: 800 !important;
  background-color: var(--md-sys-color-secondary-container, var(--secondary)) !important;
  color: var(--md-sys-color-on-secondary-container, var(--foreground)) !important;
}

[data-slot="select-item"][data-state="checked"] [data-slot="select-item-indicator"] {
  right: 8px !important;
  width: 20px !important;
  height: 20px !important;
  border-radius: 9999px !important;
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
  color: var(--md-sys-color-on-primary, var(--primary-foreground)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="card"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="module-panel"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-section-card"] {
  border-radius: 24px !important;
  border: none !important;
  background-color: var(--md3e-surface) !important;
  box-shadow: 0 4px 16px -10px color-mix(in oklab, var(--md-sys-color-shadow, #000) 12%, transparent) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="card-header"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="module-panel-header"] {
  border-radius: 20px 20px 10px 10px !important;
  border-bottom: none !important;
  background-color: color-mix(in oklab, var(--md3e-secondary-container) 36%, var(--md3e-surface-high)) !important;
  margin: 4px 4px 0 4px !important;
  padding: 10px 14px !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="field"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="item"] {
  border-radius: 14px !important;
  border: none !important;
  background-color: color-mix(in oklab, var(--md3e-surface-high) 65%, var(--md3e-surface)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="badge"] {
  border-radius: 9999px !important;
  font-weight: 700 !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="progress"] {
  height: 10px !important;
  border-radius: 9999px !important;
  background-color: var(--md3e-secondary-container) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="progress-indicator"] {
  border-radius: 9999px !important;
  background-color: var(--md-sys-color-primary, var(--primary)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="table-container"] {
  border-radius: 22px !important;
  border: none !important;
  background-color: var(--md3e-surface-lowest) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-kisaki-header="full"],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-kisaki-header="compact"] {
  border-radius: 22px !important;
  border: none !important;
  background-color: var(--md3e-surface) !important;
  padding: 10px 12px !important;
  box-shadow: 0 4px 14px -10px color-mix(in oklab, var(--md-sys-color-shadow, #000) 12%, transparent) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-czkawka-lane-id],
:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-card-id] {
  border-radius: 22px !important;
  border-color: transparent !important;
  background-color: var(--md3e-surface) !important;
  min-width: 0 !important;
  overflow-x: hidden !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-czkawka-lane-id="analysis"] [data-slot="md3e-bento-stat-grid"] {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-stepper-slider"] > label {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
`

export function ensureMd3eNodeStylesInjected() {
  if (typeof document === "undefined") return
  const existing = document.getElementById("xaihi-md3e-node-surface-styles")
  if (existing) {
    if (existing.textContent !== MD3E_NODE_SURFACE_CSS) {
      existing.textContent = MD3E_NODE_SURFACE_CSS
    }
    if (document.head.lastElementChild !== existing) {
      document.head.appendChild(existing)
    }
    return
  }
  const style = document.createElement("style")
  style.id = "xaihi-md3e-node-surface-styles"
  style.textContent = MD3E_NODE_SURFACE_CSS
  document.head.appendChild(style)
}

export function Md3eNodeSurface({
  nodeId,
  surface,
  enabled = true,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  nodeId: string
  surface: NodeSurface
  enabled?: boolean
}) {
  useEffect(() => {
    ensureMd3eNodeStylesInjected()
  }, [])

  return (
    <Md3eShapeProvider
      nodeId={nodeId}
      enabled={enabled}
      surfaceWidth={surface.width}
      surfaceMode={surface.mode}
    >
      <div
        ref={surface.ref as unknown as Ref<HTMLDivElement>}
        data-slot="md3e-node-surface"
        data-node-ui="md3e"
        data-node-id={nodeId}
        data-surface-mode={surface.mode}
        data-surface-density={surface.density}
        {...props}
        style={{
          containerName: `node ${nodeId}`,
          containerType: "size",
          ...props.style,
        }}
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden overscroll-contain rounded-[24px] text-foreground",
          className,
        )}
      >
        {children}
      </div>
    </Md3eShapeProvider>
  )
}

export function Md3eShapePreviewGlyph({
  shapeId,
  className,
}: {
  shapeId: Md3eExpressiveShapeId
  className?: string
}) {
  const spec = getMd3eShapeSpec(shapeId)
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-md3e-shape-glyph={shapeId}
      className={cn("size-4 shrink-0 fill-current", className)}
    >
      <path d={spec.svgPath} />
    </svg>
  )
}

export function Md3eConnectedGroup(props: ComponentProps<"div">) {
  const { children, className, ...rest } = props
  const items = React.Children.toArray(children)
  return (
    <div
      data-slot="md3e-connected-group"
      className={cn("flex flex-col gap-1 rounded-[20px] overflow-hidden", className)}
      {...rest}
    >
      {items.map((child, index) => {
        if (!React.isValidElement(child)) return child
        const itemClass =
          items.length === 1
            ? "rounded-[24px]"
            : index === 0
              ? "rounded-t-[24px] rounded-b-[6px]"
              : index === items.length - 1
                ? "rounded-t-[6px] rounded-b-[24px]"
                : "rounded-[6px]"
        return React.cloneElement(child, {
          "data-md3e-connected-item": index,
          className: cn(itemClass, child.props.className),
        } as Partial<ComponentProps<"div">>)
      })}
    </div>
  )
}

export function Md3eWavyProgress(props: { value: number; active?: boolean; running?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, props.value))
  const isRunning = props.running ?? props.active ?? false
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-foreground/12", props.className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          isRunning ? "bg-primary animate-pulse" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Md3eNodeShapePolicyPanel({
  nodeId: propNodeId,
  compact = false,
  className,
}: {
  nodeId?: string
  compact?: boolean
  className?: string
}) {
  const parentCtx = useMd3eShapeContext()
  const runtimeNodeId = useNodeRuntimeId()
  const resolvedNodeId = (propNodeId ?? parentCtx?.nodeId ?? runtimeNodeId ?? "workspace").trim() || "workspace"

  if (!parentCtx || parentCtx.nodeId !== resolvedNodeId) {
    return (
      <Md3eShapeProvider nodeId={resolvedNodeId} enabled>
        <Md3eNodeShapePolicyPanelInner compact={compact} className={className} />
      </Md3eShapeProvider>
    )
  }

  return <Md3eNodeShapePolicyPanelInner compact={compact} className={className} />
}

function Md3eNodeShapePolicyPanelInner({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const ctx = useMd3eShapeContext()!
  const { nodeId, policy, activeRoleShapes, activeTextButtonShape, saving } = ctx
  const primaryIconShape = activeRoleShapes.primary ?? "circle"

  return (
    <section
      aria-label="控件与形状"
      data-node-shape-policy-card={nodeId}
      className={cn("space-y-3 rounded-[22px] bg-[var(--md3e-surface,var(--card))] p-3.5 text-xs", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold tracking-tight text-foreground">控件形状策略 · {nodeId}</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant={policy.mode === "fixed" ? "default" : "outline"}
          onClick={() => void ctx.setPolicyMode("fixed")}
        >
          <Lock className="size-3.5" />
          固定
        </Button>
        <Button
          size="sm"
          variant={policy.mode === "random-on-startup" ? "default" : "outline"}
          onClick={() => void ctx.setPolicyMode("random-on-startup")}
        >
          <Shuffle className="size-3.5" />
          启动随机
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MD3E_PRIMARY_ICON_SHAPE_PRESETS.map((spec) => (
          <Button
            key={spec.id}
            size="xs"
            variant={primaryIconShape === spec.id ? "default" : "secondary"}
            onClick={() => void ctx.setRoleShape("primary", spec.id as Md3eExpressiveShapeId)}
          >
            {spec.name}
          </Button>
        ))}
      </div>
    </section>
  )
}

/**
 * 形状能力的状态回读条。
 *
 * 设置页要能回答「界面上真的退化了吗」——不是读 store 里的期望值，而是把
 * 当前上下文里每个角色的**解析结果**当场算一遍，把 status 与退化原因写在
 * DOM 上（`data-md3e-shape-readback` / `data-md3e-shape-status` /
 * `data-md3e-degraded-reason`），测试与现场取证都读这几个属性。
 */
export function Md3eShapeStatusReadback({
  context,
  className,
}: {
  context: Md3eShapeContextValue
  className?: string
}) {
  const resolved = MD3E_BUTTON_ROLES.map((role) => ({ role, shape: context.resolveIconButtonShape(role) }))
  const degraded = resolved.filter((row) => row.shape.status === "degraded")
  const status = degraded.length > 0 ? "degraded" : "active"
  return (
    <div
      data-md3e-shape-readback
      data-md3e-shape-status={status}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[11px]",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">SHAPE</span>
      <span className="font-mono text-[10px] text-foreground">{status}</span>
      {degraded.length === 0 ? (
        <span className="text-muted-foreground">全部角色形状可用</span>
      ) : (
        degraded.map((row) => (
          <span
            key={row.role}
            data-md3e-degraded-reason={row.shape.degradedReason ?? "unknown"}
            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300"
          >
            {row.role} → {row.shape.shapeId}（{row.shape.degradedReason ?? "unknown"}）
          </span>
        ))
      )}
    </div>
  )
}
