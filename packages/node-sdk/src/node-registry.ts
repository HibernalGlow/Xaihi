/**
 * `node-registry` —— 本地节点注册表与执行分发器（Runner）。
 *
 * 为工作台 UI 面板和本地调用提供纯本地插件执行通道，彻底解耦对 DSH Agent 会话的依赖。
 *
 * @module xaihi-sdk/node-registry
 */

import type { NodeDefinition } from './node.ts'
import type { NodeHandlers } from './define-node.ts'
import type { RunFace } from './bridge-shell.ts'

export interface NodeRunResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  runId?: string
  stats?: Record<string, number>
  outputPath?: string
}

export interface RegisteredNode {
  nodeId: string
  definition: NodeDefinition
  handlers: NodeHandlers
  invoke: (actionId: string, raw?: Record<string, unknown>) => Promise<string>
  run: (actionId: string, raw?: Record<string, unknown>, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
  execute?: (input: unknown, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
}

/** 规范化节点名称：剥离 `@hibernalglow/` 和 `xaihi-` 前缀以便多口径命中。 */
export function normalizeNodeId(id: string): string {
  return id.replace(/^@hibernalglow\//, '').replace(/^xaihi-/, '')
}

export class NodeRegistry {
  private readonly nodes = new Map<string, RegisteredNode>()

  /**
   * 注册一个节点。如果已有同名节点，则覆盖；返回取消注册函数。
   *
   * 注销器**按身份判**：只有当表里那一格仍然是本次注册的条目时才摘除它。热更的落地顺序是
   * "先装新的、再卸旧的"，无条件按 key 删会把新实例一起摘掉（ABA）—— 症状是新插件刚装上
   * 就被上一条的注销器摘空。按身份判之后，同名重叠注册是幂等的：谁的注销器只摘谁那一条。
   */
  register(entry: RegisteredNode): () => void {
    const key = entry.nodeId
    const norm = normalizeNodeId(key)
    this.nodes.set(key, entry)
    if (norm !== key) {
      this.nodes.set(norm, entry)
    }
    return () => {
      if (this.nodes.get(key) === entry) this.nodes.delete(key)
      if (norm !== key && this.nodes.get(norm) === entry) this.nodes.delete(norm)
    }
  }

  /**
   * 按 nodeId 显式注销（长短名字一起摘）。这是"立刻清掉"的入口；fiber 回收走 `register`
   * 返回的那个按身份判的注销器，两者刻意不同：显式注销是"我就要删这个名字"，注销器是
   * "只删我自己那一条"。
   */
  unregister(nodeId: string): boolean {
    const deleted1 = this.nodes.delete(nodeId)
    const deleted2 = this.nodes.delete(normalizeNodeId(nodeId))
    return deleted1 || deleted2
  }

  get(nodeId: string): RegisteredNode | undefined {
    return this.nodes.get(nodeId) ?? this.nodes.get(normalizeNodeId(nodeId))
  }

  has(nodeId: string): boolean {
    return this.nodes.has(nodeId) || this.nodes.has(normalizeNodeId(nodeId))
  }

  list(): RegisteredNode[] {
    const seen = new Set<RegisteredNode>()
    for (const node of this.nodes.values()) {
      seen.add(node)
    }
    return [...seen]
  }

  /**
   * 运行一个节点的动作。
   * @param nodeId - 节点 ID（如 "findz", "linedup", "sleept" 或带包名前缀）。
   * @param input - 输入载荷（通常包含 action 字段及参数）。
   * @param onEvent - 可选的过程事件回调（progress, preview 等）。
   */
  async run(nodeId: string, input: unknown, onEvent?: (event: unknown) => void): Promise<NodeRunResult> {
    const entry = this.get(nodeId)
    if (!entry) {
      return {
        success: false,
        message: `Node "${nodeId}" is not registered in local NodeRegistry`,
      }
    }

    if (entry.execute) {
      try {
        return await entry.execute(input, onEvent)
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}

    // 解析 actionId
    let actionId: string | undefined
    if (typeof raw.actionId === 'string' && raw.actionId !== '') {
      actionId = raw.actionId
    } else if (typeof raw.action === 'string' && raw.action !== '') {
      actionId = raw.action
    } else {
      const selector = entry.definition.fields.find((f) => f.isActionSelector === true)
      if (selector && typeof raw[selector.id] === 'string') {
        actionId = String(raw[selector.id])
      } else if (entry.definition.actions.length === 1) {
        actionId = entry.definition.actions[0]?.id
      } else if (entry.definition.actions.length > 0) {
        actionId = entry.definition.actions[0]?.id
      }
    }

    if (!actionId) {
      return {
        success: false,
        message: `Node "${nodeId}" requires an action, but none was provided or deduced`,
      }
    }

    return await entry.run(actionId, raw, onEvent)
  }

  async cancel(_runId: string): Promise<boolean> {
    return false
  }
}

/** 进程级默认节点注册表。 */
export const nodeRegistry = new NodeRegistry()

/**
 * 创建对接桥 `ShellCapabilities.runner` 的本地运行面。
 * @param registry - 节点注册表实例（缺省为全局单例 `nodeRegistry`）。
 */
export function createLocalRunner(registry: NodeRegistry = nodeRegistry): RunFace {
  return {
    run: (nodeId: string, input: unknown, onEvent?: (event: unknown) => void) => registry.run(nodeId, input, onEvent),
    cancel: (runId: string) => registry.cancel(runId),
  }
}
