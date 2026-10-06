/**
 * Hazard Mode（危险模式）—— 全局安全开关。
 *
 * 语义是「真执行 + 不追问」，两半缺一不可：
 *
 * 1. 强制关闭 dry-run / preview / previewMode，确保"试运行"绕不过去。
 *    这主要用于演示、生产环境或需要确保节点真正执行的场景。
 * 2. 短路危险执行的二次确认 —— 落点在 `src/nodes/shared/ExecuteButton.tsx`，
 *    不在本文件，因为确认是渲染期决策而这里是数据策略。
 *
 * 第 2 半是 2026-10-05 补上的，补之前这里是**单向**的：各节点的确认门条件写的都是
 * `!(data.dryRun ?? true)`，而第 1 半正好把 dryRun 打成 false，于是上膛 Hazard 会
 * 把确认框逐个点亮 —— 一个号称免确认的模式实际让操作更啰嗦。用户当时观察到的是
 * "对危险操作完全没影响"，真实情况比那更糟。
 *
 * 该模块维护两组 node id 集合：
 * - DRY_RUN_MODULE_IDS：使用 dryRun 字段控制试运行的节点
 * - PREVIEW_MODULE_IDS：使用 preview 字段控制预览的节点
 * - cleanf 节点单独处理（使用 previewMode 字段）
 *
 * 提供两层防护：
 * 1. disableAllNodeDryRuns：批量关闭已部署节点的 data 中的 dry-run 标志
 * 2. applyHazardRunPolicy：在节点真正执行前再次拦截，防止 UI 持有的旧快照绕过
 */
import type { ComponentInstance } from "@/types/workspace"

/** 使用 dryRun 字段控制试运行的节点集合。 */
const DRY_RUN_MODULE_IDS = new Set([
  "bandia", "bitv", "classf", "classq", "crashu", "enginev",
  "formatv", "gifu", "marku", "migratef",
  "mvz", "nameu", "rawfilter", "repacku", "simiu", "smartzip",
  "timeu", "trename",
])

/** 使用 preview 字段控制预览的节点集合。 */
const PREVIEW_MODULE_IDS = new Set(["dissolvef"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * 计算组件需要应用的"关闭试运行"补丁。
 *
 * 根据节点类型返回对应的字段补丁（{ dryRun: false } / { preview: false } /
 * { previewMode: false }）。如果组件已经处于关闭状态，返回 null 表示无需变更。
 */
export function getHazardDisablePatch(component: ComponentInstance): Record<string, false> | null {
  if (component.moduleId === "cleanf") {
    return component.data?.previewMode === false ? null : { previewMode: false }
  }

  if (PREVIEW_MODULE_IDS.has(component.moduleId)) {
    return component.data?.preview === false ? null : { preview: false }
  }

  if (DRY_RUN_MODULE_IDS.has(component.moduleId) || component.data?.dryRun !== undefined) {
    return component.data?.dryRun === false ? null : { dryRun: false }
  }

  return null
}

/** 统计组件列表中受 Hazard 模式影响的节点数（即需要关闭试运行的节点数）。 */
export function countHazardAffectedNodes(components: ComponentInstance[]): number {
  return components.filter((component) => getHazardDisablePatch(component) !== null).length
}

/**
 * 返回 Hazard 模式下组件"应该使用"的 data。
 *
 * Hazard 开启时返回应用了禁用补丁的 data，关闭时返回原始 data。
 * 用于 UI 渲染时显示"将被禁用"的视觉提示，而不实际修改 store。
 */
export function resolveHazardComponentData(
  component: ComponentInstance | undefined,
  enabled: boolean,
): Record<string, unknown> | undefined {
  if (!component || !enabled) return component?.data
  const patch = getHazardDisablePatch(component)
  return patch ? { ...component.data, ...patch } : component.data
}

/**
 * 批量关闭所有组件的 dry-run / preview 开关。
 *
 * @returns 实际变更的组件数
 */
export function disableAllNodeDryRuns(
  components: ComponentInstance[],
  patchComponentData: (id: string, patch: Record<string, unknown>) => void,
): number {
  let changed = 0

  for (const component of components) {
    const patch = getHazardDisablePatch(component)
    if (!patch) continue
    patchComponentData(component.id, patch)
    changed += 1
  }

  return changed
}

/**
 * Final execution boundary for Hazard mode. Node UIs may hold a render-time
 * snapshot of their form state, so enforcing the policy here guarantees that
 * an already-mounted node cannot send a dry-run payload after Hazard is armed.
 */
export function applyHazardRunPolicy<TInput>(
  nodeId: string | undefined,
  input: TInput,
  enabled: boolean,
): TInput {
  if (!enabled || !nodeId || !isRecord(input)) return input

  if (nodeId === "cleanf") {
    return { ...input, preview: false } as TInput
  }

  if (PREVIEW_MODULE_IDS.has(nodeId)) {
    return { ...input, preview: false } as TInput
  }

  if (DRY_RUN_MODULE_IDS.has(nodeId) || typeof input.dryRun === "boolean") {
    return { ...input, dryRun: false } as TInput
  }

  return input
}
