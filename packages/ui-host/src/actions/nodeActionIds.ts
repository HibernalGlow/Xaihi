/**
 * 节点派生动作的 id 表（ADR-0081 的 L2 层）。
 *
 * 单独一个文件而不是和注册放在一起：`store/workspace/constants.ts` 要用它算「默认隐藏」，
 * 而那份一旦被拉进带 store 依赖的模块就会形成加载环。这份只依赖模块表，不碰 store。
 */
import { MODULE_REGISTRY } from "@/components/modules/registry"

export const NODE_ACTION_ID_PREFIX = "node.open."

export function nodeActionId(moduleId: string): string {
  return `${NODE_ACTION_ID_PREFIX}${moduleId}`
}

export interface NodeActionSource {
  actionId: string
  moduleId: string
  /** 模块表里的展示名，不是 i18n key。 */
  name: string
  /** 模块表里的图标名，交给 `resolveModuleIcon` 解析。 */
  icon: string
}

export const NODE_ACTION_SOURCES: NodeActionSource[] = MODULE_REGISTRY.map((module) => ({
  actionId: nodeActionId(module.id),
  moduleId: module.id,
  name: module.name,
  icon: module.icon ?? "",
}))

export const NODE_ACTION_IDS: string[] = NODE_ACTION_SOURCES.map((source) => source.actionId)

const SOURCES_BY_ACTION_ID = new Map(NODE_ACTION_SOURCES.map((source) => [source.actionId, source]))

export function getNodeActionSource(actionId: string): NodeActionSource | undefined {
  return SOURCES_BY_ACTION_ID.get(actionId)
}
