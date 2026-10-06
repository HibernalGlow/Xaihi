/**
 * 组件表面状态（Surface Status）模块。
 *
 * 把节点运行操作（NodeOperation）和组件 data 中的状态字段统一抽象为
 * ComponentSurfaceStatus，供卡片 chrome 上的进度条 / 状态徽标使用。
 *
 * 状态来源优先级：
 * 1. operation（后端流式推送的运行事件）—— 最权威
 * 2. component-data（浏览器内组件自管理的 data.phase / data.progress）—— fallback
 * 3. none —— 无运行状态，显示 idle
 *
 * 提供 hook 形式（useComponentSurfaceStatus / useComponentSurfaceStatusMap）
 * 与纯函数形式（getComponentSurfaceStatus），前者供 React 组件订阅，
 * 后者供非 React 上下文或批量场景使用。
 */
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ComponentInstance } from "@/types/workspace"
import { useNodeOperations, type TrackedNodeOperation } from "@/store/nodeOperations"

export type ComponentSurfacePhase =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled"

export interface ComponentSurfaceStatus {
  phase: ComponentSurfacePhase
  /** 0-100 进度值，null 表示无进度信息。 */
  progress: number | null
  label?: string
  message?: string
  updatedAt?: number
  operationId?: string
  /** 状态来源，用于调试与 UI 区分显示策略。 */
  source: "operation" | "component-data" | "none"
}

/** 空闲状态的常量引用（避免每次返回新对象触发 rerender）。 */
const IDLE_STATUS: ComponentSurfaceStatus = {
  phase: "idle",
  progress: null,
  source: "none",
}

/** 终态保留窗口：completed/error/cancelled 在 60 秒内仍显示状态，之后回退 idle。 */
const RECENT_TERMINAL_MS = 60_000

/**
 * 把节点 operation phase（"queued" | "running" | "completed" | "error" | "cancelled"）
 * 映射到 ComponentSurfacePhase。二者目前同名，单独写出来为了未来语义漂移时只改一处。
 */
function mapOperationPhase(phase: TrackedNodeOperation["phase"]): ComponentSurfacePhase {
  return phase as ComponentSurfacePhase
}

function fromOperation(operation: TrackedNodeOperation): ComponentSurfaceStatus {
  const phase = mapOperationPhase(operation.phase)
  return {
    phase,
    progress: operation.lastProgress ?? null,
    message: operation.lastMessage,
    updatedAt: operation.updatedAt,
    operationId: operation.operationId,
    source: "operation",
  }
}

/**
 * 从 component.data 中读取节点控制器写入的 phase / progress / progressText。
 * 这是浏览器内组件自管理运行状态时的 fallback 路径。
 */
function fromComponentData(data: Record<string, unknown> | undefined): ComponentSurfaceStatus {
  if (!data) return IDLE_STATUS
  const rawPhase = data.phase
  const phase = normalizePhase(typeof rawPhase === "string" ? rawPhase : undefined)
  if (phase === "idle" && data.progress === undefined) return IDLE_STATUS

  const rawProgress = data.progress
  const progress = typeof rawProgress === "number" && Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : null

  const rawText = data.progressText
  const message = typeof rawText === "string" && rawText.length > 0 ? rawText : undefined

  return {
    phase,
    progress,
    message,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
    source: "component-data",
  }
}

function normalizePhase(value: string | undefined): ComponentSurfacePhase {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "error":
    case "cancelled":
      return value
    case "success":
    case "done":
      return "completed"
    case "fail":
    case "failed":
      return "error"
    default:
      return "idle"
  }
}

/**
 * 选择最能代表该组件当前状态的 operation：
 * 优先取正在运行/排队中且 componentId 匹配的；否则取最近结束的。
 */
function findBestOperationForComponent(
  component: ComponentInstance,
  operations: TrackedNodeOperation[],
  now: number,
): TrackedNodeOperation | undefined {
  if (operations.length === 0) return undefined

  const byComponent = operations.filter(
    (operation) =>
      operation.componentId === component.id
      && (now - operation.updatedAt) < RECENT_TERMINAL_MS * 4,
  )

  const active = byComponent.find((operation) =>
    operation.phase === "running" || operation.phase === "queued",
  )
  if (active) return active

  // 最近结束的（completed/error/cancelled），仅在最近窗口内才有意义
  return byComponent
    .filter((operation) => operation.finishedAt !== undefined && now - operation.finishedAt < RECENT_TERMINAL_MS)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]
}

export function getComponentSurfaceStatus(args: {
  component: ComponentInstance
  operations: TrackedNodeOperation[]
  now?: number
}): ComponentSurfaceStatus {
  const { component, operations } = args
  const now = args.now ?? Date.now()

  const operation = findBestOperationForComponent(component, operations, now)
  if (operation) return fromOperation(operation)

  return fromComponentData(component.data)
}

/**
 * 给一组组件派生 status map，订阅一次 useNodeOperations。
 * 供 CardView / BentoView 等批量场景使用，避免每个卡片单独订阅。
 */
export function useComponentSurfaceStatusMap(
  components: ComponentInstance[],
): Record<string, ComponentSurfaceStatus> {
  // 仅订阅 operations 数组的引用，避免每个 progress 事件触发全量 rerender
  const operations = useNodeOperations(useShallow((store) => store.operations))

  return useMemo(() => {
    const now = Date.now()
    const out: Record<string, ComponentSurfaceStatus> = {}
    for (const component of components) {
      out[component.id] = getComponentSurfaceStatus({ component, operations, now })
    }
    return out
  }, [components, operations])
}

/**
 * 单个组件场景的 hook。内部仍走 useNodeOperations，但 selector 返回与该组件相关的
 * operation 子集，避免无关 operation 变化引起 rerender。
 */
export function useComponentSurfaceStatus(component: ComponentInstance): ComponentSurfaceStatus {
  const componentId = component.id
  const operations = useNodeOperations(
    useShallow((store) =>
      store.operations.filter(
        (operation) =>
          operation.componentId === componentId
          || operation.nodeId === component.moduleId,
      ),
    ),
  )

  return useMemo(
    () => getComponentSurfaceStatus({ component, operations, now: Date.now() }),
    [component, operations],
  )
}

/**
 * 是否应该在 chrome 上渲染进度条。
 * - idle 且无 message → 不渲染
 * - 终态且超过窗口 → 不渲染
 */
export function shouldShowSurfaceStatus(status: ComponentSurfaceStatus, now: number = Date.now()): boolean {
  if (status.phase === "running" || status.phase === "queued") return true
  if (status.phase === "error") return true
  if (status.phase === "completed" || status.phase === "cancelled") {
    if (status.updatedAt === undefined) return true
    return now - status.updatedAt < RECENT_TERMINAL_MS
  }
  return false
}
