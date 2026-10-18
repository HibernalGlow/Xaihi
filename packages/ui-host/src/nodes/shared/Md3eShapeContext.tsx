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
  container: node / size;
  overscroll-behavior: contain;
  min-width: 0;
  min-height: 0;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-header-banner"] {
  border-radius: 20px !important;
  border: none !important;
  background-color: var(--md3e-surface) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-stat-tile"] {
  border-radius: 14px !important;
  background-color: color-mix(in oklab, var(--md3e-surface-high) 82%, var(--md3e-surface));
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-slot="md3e-section-card"] {
  border-radius: 20px !important;
  border: none !important;
  background-color: var(--md3e-surface) !important;
}

:is([data-node-ui="md3e"], :root[data-ui-face="md3e"] .xiranite-node-surface) [data-card-id] {
  border-radius: 20px !important;
  border-color: transparent !important;
  background-color: var(--md3e-surface) !important;
}
`

export function ensureMd3eNodeStylesInjected() {
  if (typeof document === "undefined") return
  const existing = document.getElementById("xaihi-md3e-node-surface-styles")
  if (existing) {
    if (existing.textContent !== MD3E_NODE_SURFACE_CSS) {
      existing.textContent = MD3E_NODE_SURFACE_CSS
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
  return (
    <div
      data-slot="md3e-connected-group"
      className={cn("flex flex-col gap-1 rounded-[20px] overflow-hidden", props.className)}
      {...props}
    />
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
