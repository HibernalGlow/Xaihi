import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"
import { useWorkspaceSelector } from "@/store/workspaceStore"
import { resetSessionStartupSeedForTesting } from "./md3eShapeSystem"
import { useNodeRuntimeId } from "./NodeRuntimeContext"
import { useNodeUiConfig, type NodeUiConfigStore } from "./NodeUiConfigContext"
import type { NodeSurfaceMode } from "./useNodeSurface"
import {
  DEFAULT_NODE_SHAPE_POLICY,
  detectHostClipPathSupport,
  getMd3eShapeSpec,
  MD3E_EXPRESSIVE_SHAPES,
  MD3E_BUTTON_ROLES,
  readNodeShapePolicy,
  resolveMd3eButtonShape,
  resolveSessionRoleShapes,
  writeNodeShapePolicy,
  type Md3eButtonRole,
  type Md3eExpressiveShapeId,
  type Md3eNodeShapePolicy,
  type Md3eResolvedButtonShape,
  type Md3eShapeCapabilityProbeInput,
  type Md3eShapeDegradationReason,
  type Md3eShapePolicyMode,
} from "./md3eShapeSystem"

export interface Md3eShapeContextValue {
  /** 当前工作台或节点是否启用 MD3E 表达性控件形态。 */
  enabled: boolean
  /** 所属节点 ID（工作台级默认为 `"workspace"`）。 */
  nodeId: string
  /** 当前节点的持久化形状策略（固定 | 启动随机）。 */
  policy: Md3eNodeShapePolicy
  /** 当前会话内各语义按钮角色实际对应的目标形状（未降级前）。 */
  activeRoleShapes: Record<Md3eButtonRole, Md3eExpressiveShapeId>
  /** 持久化载体状态：DSH 标准面 (`xaihi-core.nodeUi[nodeId]`) 或无桥本地退化（ADR-0011 决定 4）。 */
  persistenceSource: "dsh-settings" | "local-fallback" | "default"
  /** 是否已完成首次持久化读取。 */
  loaded: boolean
  /** 是否正在写入持久化载体。 */
  saving: boolean
  /** 最近一次持久化错误（若发生冲突或写失败，按可读状态暴露）。 */
  saveError: string | null
  /** 宿主与环境能力探针状态。 */
  probe: Required<Pick<Md3eShapeCapabilityProbeInput, "cssClipPathSupported" | "contrastLevel" | "forcedColors">> & {
    surfaceWidth?: number
    surfaceMode?: NodeSurfaceMode
  }
  /** 解析指定按钮角色与尺寸下的最终形状（含降级状态与原因）。 */
  resolveIconButtonShape: (role: Md3eButtonRole, buttonSize?: string) => Md3eResolvedButtonShape
  /** 切换形状策略模式（fixed | random-on-startup）并持久化到该节点的配置格。 */
  setPolicyMode: (mode: Md3eShapePolicyMode) => Promise<void>
  /** 将当前会话内正在使用的形状组合固定（Pin）到该节点的配置格。 */
  pinCurrentShapes: () => Promise<void>
  /** 单独修改某一个按钮角色的固定形状并切换为 fixed 模式。 */
  setRoleShape: (role: Md3eButtonRole, shapeId: Md3eExpressiveShapeId) => Promise<void>
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
  /** 显式指定节点 ID；不传则自动从 `useNodeRuntimeId()` 读取，再缺省为 `"workspace"`。 */
  nodeId?: string
  /** 显式覆盖是否启用 MD3E 形状引擎；不传则跟随 `:root[data-ui-face="md3e"]`。 */
  enabled?: boolean
  /** 显式注入 `NodeUiConfigStore`（测试或独立面板可覆盖 context）。 */
  store?: NodeUiConfigStore
  /** 容器当前宽度（px，来自 `useNodeSurface`），用于 320px 可读性下限判定。 */
  surfaceWidth?: number
  /** 容器当前分档模式（来自 `useNodeSurface`），用于 collapsed 可读性下限判定。 */
  surfaceMode?: NodeSurfaceMode
  /** 探针覆盖项（供单测与阳性对照注入 `cssClipPathSupported: false` 等）。 */
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

  const storeUiFace = useWorkspaceSelector((state) => (state as { uiFace?: string }).uiFace)
  const [domEnabled, setDomEnabled] = useState<boolean>(() => readDomUiFaceEnabled())
  const [domContrast, setDomContrast] = useState<number>(() => readDomContrastLevel())
  const [forcedColors, setForcedColors] = useState<boolean>(() => readForcedColors())
  const [policy, setPolicy] = useState<Md3eNodeShapePolicy>(DEFAULT_NODE_SHAPE_POLICY)
  const [persistenceSource, setPersistenceSource] = useState<"dsh-settings" | "local-fallback" | "default">(
    store ? "dsh-settings" : "local-fallback",
  )
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return
    const syncFromDom = () => {
      setDomEnabled(readDomUiFaceEnabled())
      setDomContrast(readDomContrastLevel())
    }
    syncFromDom()
    const observer = new MutationObserver(syncFromDom)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-face", "data-md3-contrast"],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    try {
      const mq = window.matchMedia("(forced-colors: active)")
      const onChange = (event: MediaQueryListEvent) => setForcedColors(event.matches)
      mq.addEventListener?.("change", onChange)
      return () => mq.removeEventListener?.("change", onChange)
    } catch {
      return undefined
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setSaveError(null)

    async function load() {
      try {
        const result = await readNodeShapePolicy(effectiveNodeId, store)
        if (cancelled) return
        setPolicy(result.policy)
        setPersistenceSource(result.persistenceSource)
      } catch (error) {
        if (cancelled) return
        setSaveError(error instanceof Error ? error.message : String(error))
        setPersistenceSource(store ? "dsh-settings" : "local-fallback")
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [effectiveNodeId, store])

  const sessionRandomShapes = useMemo(
    () => resolveSessionRoleShapes(effectiveNodeId),
    [effectiveNodeId],
  )

  const activeRoleShapes = useMemo<Record<Md3eButtonRole, Md3eExpressiveShapeId>>(() => {
    if (policy.mode === "fixed") {
      return policy.fixedRoleShapes
    }
    return sessionRandomShapes
  }, [policy.fixedRoleShapes, policy.mode, sessionRandomShapes])

  const cssClipPathSupported = useMemo(
    () => probeOverride?.cssClipPathSupported ?? detectHostClipPathSupport(),
    [probeOverride?.cssClipPathSupported],
  )
  const effectiveContrast = probeOverride?.contrastLevel ?? domContrast
  const effectiveForcedColors = probeOverride?.forcedColors ?? forcedColors
  const effectiveSurfaceWidth = probeOverride?.surfaceWidth ?? surfaceWidth
  const effectiveSurfaceMode = probeOverride?.surfaceMode ?? surfaceMode

  const persistPolicy = useCallback(
    async (nextPolicy: Md3eNodeShapePolicy) => {
      const previous = policy
      setPolicy(nextPolicy)
      setSaving(true)
      setSaveError(null)
      try {
        const res = await writeNodeShapePolicy(effectiveNodeId, nextPolicy, store)
        setPersistenceSource(res.persistenceSource)
      } catch (error) {
        setPolicy(previous)
        setSaveError(error instanceof Error ? error.message : String(error))
      } finally {
        setSaving(false)
      }
    },
    [effectiveNodeId, policy, store],
  )

  const setPolicyMode = useCallback(
    async (mode: Md3eShapePolicyMode) => {
      if (mode === policy.mode) return
      await persistPolicy({
        ...policy,
        mode,
      })
    },
    [persistPolicy, policy],
  )

  const pinCurrentShapes = useCallback(async () => {
    await persistPolicy({
      mode: "fixed",
      fixedRoleShapes: { ...activeRoleShapes },
    })
  }, [activeRoleShapes, persistPolicy])

  const setRoleShape = useCallback(
    async (role: Md3eButtonRole, shapeId: Md3eExpressiveShapeId) => {
      await persistPolicy({
        mode: "fixed",
        fixedRoleShapes: {
          ...activeRoleShapes,
          [role]: shapeId,
        },
      })
    },
    [activeRoleShapes, persistPolicy],
  )

  const resolveIconButtonShape = useCallback(
    (role: Md3eButtonRole, buttonSize?: string): Md3eResolvedButtonShape => {
      const fallbackRole = (role === "action" ? "outline" : role === "command" ? "primary" : role === "tab" ? "secondary" : role) as Md3eButtonRole
      const requestedId = activeRoleShapes[role] ?? activeRoleShapes[fallbackRole] ?? "cookie-4"
      return resolveMd3eButtonShape(requestedId, {
        cssClipPathSupported,
        contrastLevel: effectiveContrast,
        forcedColors: effectiveForcedColors,
        surfaceWidth: effectiveSurfaceWidth,
        surfaceMode: effectiveSurfaceMode,
        buttonSize: probeOverride?.buttonSize ?? buttonSize,
      })
    },
    [
      activeRoleShapes,
      cssClipPathSupported,
      effectiveContrast,
      effectiveForcedColors,
      effectiveSurfaceMode,
      effectiveSurfaceWidth,
      probeOverride?.buttonSize,
    ],
  )

  const enabled = propEnabled ?? (storeUiFace === "md3e" || domEnabled)

  const value = useMemo<Md3eShapeContextValue>(
    () => ({
      enabled,
      nodeId: effectiveNodeId,
      policy,
      activeRoleShapes,
      persistenceSource,
      loaded,
      saving,
      saveError,
      probe: {
        cssClipPathSupported,
        contrastLevel: effectiveContrast,
        forcedColors: effectiveForcedColors,
        surfaceWidth: effectiveSurfaceWidth,
        surfaceMode: effectiveSurfaceMode,
      },
      resolveIconButtonShape,
      setPolicyMode,
      pinCurrentShapes,
      setRoleShape,
    }),
    [
      activeRoleShapes,
      cssClipPathSupported,
      effectiveContrast,
      effectiveForcedColors,
      effectiveNodeId,
      effectiveSurfaceMode,
      effectiveSurfaceWidth,
      enabled,
      loaded,
      persistenceSource,
      pinCurrentShapes,
      policy,
      resolveIconButtonShape,
      saveError,
      saving,
      setPolicyMode,
      setRoleShape,
    ],
  )

  return <Md3eShapeContext.Provider value={value}>{children}</Md3eShapeContext.Provider>
}

export function useMd3eShapeContext(): Md3eShapeContextValue | null {
  return useContext(Md3eShapeContext)
}

/**
 * 渲染表达性形状的 SVG 缩略预览（用于设置页与节点配置弹层）。
 */
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

const DEGRADATION_REASON_LABELS: Record<Md3eShapeDegradationReason, string> = {
  "css-clip-path-unsupported": "宿主环境不支持 CSS clip-path: polygon()，已退化为标准圆角按钮",
  "high-contrast-legibility-floor": "高对比度 / 强制颜色模式开启，复杂花瓣形状已退化为高可读性方圆（Squircle）",
  "compact-320-legibility-floor": "当前容器处于 ≤320px / 折叠紧凑分档，复杂异形已退化为标准圆形以防裁切",
  "xs-icon-legibility-floor": "极小图标按钮（24px）触发可读性下限，复杂异形已退化为方圆（Squircle）",
}

export function describeShapeDegradation(reason: Md3eShapeDegradationReason | null): string | null {
  if (!reason) return null
  return DEGRADATION_REASON_LABELS[reason] ?? reason
}

/**
 * 降级铁律（ADR-0011 决定 4）的可读回状态条：
 * 当宿主缺乏 `clip-path`、触发高对比/320px 可读性下限、或未接桥退回本地存储时，
 * 在界面上显式呈现退化原因，绝不静默或伪造成功。
 */
export function Md3eShapeStatusReadback({
  context,
  className,
}: {
  context: Md3eShapeContextValue
  className?: string
}) {
  const degradedReasons = useMemo(() => {
    const reasons = new Set<Md3eShapeDegradationReason>()
    for (const role of MD3E_BUTTON_ROLES) {
      const resolved = context.resolveIconButtonShape(role)
      if (resolved.status === "degraded" && resolved.degradedReason) {
        reasons.add(resolved.degradedReason)
      }
    }
    return [...reasons]
  }, [context])

  const isDegraded = degradedReasons.length > 0 || context.persistenceSource === "local-fallback"

  return (
    <div
      role="status"
      data-md3e-shape-readback
      data-md3e-shape-status={degradedReasons.length > 0 ? "degraded" : "active"}
      data-md3e-shape-persistence={context.persistenceSource}
      className={cn(
        "rounded-[14px] border px-3 py-2 text-[11px] leading-relaxed",
        isDegraded
          ? "border-amber-500/40 bg-amber-500/10 text-foreground"
          : "border-border/60 bg-muted/25 text-muted-foreground",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {degradedReasons.length > 0
            ? "表达性形状已触发安全退化"
            : "MD3E 表达性形状引擎运行正常"}
        </span>
        <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px]">
          {context.persistenceSource === "dsh-settings"
            ? `DSH Settings · xaihi-core.nodeUi[${context.nodeId}]`
            : `本地退化存储 · local-fallback (${context.nodeId})`}
        </span>
      </div>
      {degradedReasons.map((reason) => (
        <p key={reason} data-md3e-degraded-reason={reason} className="mt-1 text-[10px] text-muted-foreground">
          • {describeShapeDegradation(reason)}
        </p>
      ))}
      {context.persistenceSource === "local-fallback" ? (
        <p data-md3e-degraded-reason="persistence-local-fallback" className="mt-1 text-[10px] text-muted-foreground">
          • 当前未连接宿主配置桥（NodeUiConfigStore 缺席），形状偏好暂存本机浏览器，不伪造远端同步状态。
        </p>
      ) : null}
      {context.saveError ? (
        <p data-md3e-save-error className="mt-1 text-[10px] text-destructive">
          • 保存冲突/错误：{context.saveError}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 连接式分组容器（参考 Rhythm `Material3SettingsGroup.kt:316-328` 与 `lnkiai/m3e-canvas` 磁吸连接组）：
 * 外侧圆角 24px（horizontal 时为胶囊圆角），内部相邻接缝圆角柔化为 6px，间距 2px。
 */
export function Md3eConnectedGroup({
  children,
  orientation = "vertical",
  className,
  ...props
}: ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal"
}) {
  const validChildren = Children.toArray(children).filter(isValidElement)
  const count = validChildren.length

  return (
    <div
      data-slot="md3e-connected-group"
      data-orientation={orientation}
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-0.5" : "flex-row items-center gap-0.5",
        className,
      )}
      {...props}
    >
      {validChildren.map((child, index) => {
        const isFirst = index === 0
        const isLast = index === count - 1
        const radiusClass =
          count === 1
            ? orientation === "vertical"
              ? "rounded-[24px]"
              : "rounded-full"
            : orientation === "vertical"
              ? isFirst
                ? "rounded-t-[24px] rounded-b-[6px]"
                : isLast
                  ? "rounded-t-[6px] rounded-b-[24px]"
                  : "rounded-[6px]"
              : isFirst
                ? "rounded-l-full rounded-r-[6px]"
                : isLast
                  ? "rounded-l-[6px] rounded-r-full"
                  : "rounded-[6px]"

        return (
          <div
            key={child.key ?? index}
            data-md3e-connected-item={index}
            className={cn(
              "min-w-0 transition-transform duration-150 ease-[var(--md3-spring-spatial,cubic-bezier(0.2,0,0,1))] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              radiusClass,
            )}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}

/**
 * MD3E 波浪形进度指示器（参考 `matraic/m3e` 与 `lnkiai/m3e-canvas` Wavy Linear Progress）：
 * 在 `prefers-reduced-motion: reduce` 下自动退化为平直进度条。
 */
export function Md3eWavyProgress({
  value = 50,
  className,
  label = "进度",
}: {
  value?: number
  className?: string
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      data-slot="md3e-wavy-progress"
      className={cn("relative flex h-3 w-full items-center gap-1 overflow-hidden", className)}
    >
      <div
        style={{ width: `${clamped}%` }}
        className="h-full min-w-[8px] overflow-hidden rounded-full transition-[width] duration-200"
      >
        <svg
          viewBox="0 0 120 12"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="h-full w-full text-primary"
        >
          <path
            d="M 0 6 Q 7.5 1, 15 6 T 30 6 T 45 6 T 60 6 T 75 6 T 90 6 T 105 6 T 120 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="h-1.5 flex-1 rounded-full bg-secondary/40" />
    </div>
  )
}

export function Md3eNodeSurface({
  nodeId,
  surface,
  className,
  style,
  children,
  ...props
}: {
  nodeId: string
  surface?: any
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  [key: string]: any
}) {
  return (
    <Md3eShapeProvider
      nodeId={nodeId}
      enabled
      surfaceWidth={surface?.width}
      surfaceMode={surface?.mode}
    >
      <div
        ref={surface?.ref}
        data-slot="md3e-node-surface"
        data-node-ui="md3e"
        data-node-id={nodeId}
        data-node-surface={nodeId}
        data-ui-variant="md3e"
        data-surface-mode={surface?.mode}
        data-surface-density={surface?.density}
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden overscroll-contain rounded-[28px] text-foreground",
          className
        )}
        style={{
          container: `node ${nodeId} / size`,
          overscrollBehavior: "contain",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    </Md3eShapeProvider>
  )
}

export function Md3eNodeShapePolicyPanel({
  nodeId,
  compact = false,
  className,
}: {
  nodeId: string
  compact?: boolean
  className?: string
}) {
  const ctx = useMd3eShapeContext()
  if (!ctx) return null
  const { policy, activeRoleShapes, setPolicyMode, pinCurrentShapes, setRoleShape } = ctx
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2.5 p-2", className)}
      data-md3e-shape-mode={policy.mode}
      data-testid={`shape-policy-panel-${nodeId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-xs font-semibold">节点按钮形状策略 ({nodeId})</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {policy.mode === "random-on-startup" ? "启动时抽取，会话内保持一致" : "当前组合已固定"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="形状策略">
          <button
            type="button"
            aria-pressed={policy.mode === "random-on-startup"}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              policy.mode === "random-on-startup"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
            onClick={() => void setPolicyMode("random-on-startup")}
          >
            启动随机
          </button>
          <button
            type="button"
            aria-pressed={policy.mode === "fixed"}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              policy.mode === "fixed"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
            onClick={() => void pinCurrentShapes()}
          >
            固定当前
          </button>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-1.5 @[360px]:grid-cols-3">
        {MD3E_BUTTON_ROLES.map((role) => {
          const shapeId = activeRoleShapes[role] ?? "circle"
          const spec = getMd3eShapeSpec(shapeId)
          return (
            <div
              key={role}
              className="flex min-w-0 items-center gap-1.5 rounded-[14px] border border-border/50 bg-muted/20 px-2 py-1.5 text-[10px]"
            >
              <Md3eShapePreviewGlyph shapeId={shapeId} className="size-3.5 text-primary" />
              <div className="min-w-0 flex-1 truncate">
                <div className="font-mono text-[9px] uppercase text-muted-foreground">{role}</div>
                <div className="truncate font-medium text-foreground">{spec.labelZh}</div>
              </div>
              <select
                aria-label={`${role} 图标按钮形状`}
                className="h-7 max-w-20 min-w-0 rounded-full border border-border/60 bg-background px-2 text-[10px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={shapeId}
                onChange={(event) => {
                  const next = MD3E_EXPRESSIVE_SHAPES.find((shape) => shape.id === event.currentTarget.value)
                  if (next) void setRoleShape(role, next.id)
                }}
              >
                {MD3E_EXPRESSIVE_SHAPES.map((shape) => (
                  <option key={shape.id} value={shape.id}>{shape.labelZh}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
