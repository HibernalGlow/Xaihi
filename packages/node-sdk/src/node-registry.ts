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
  run: (actionId: string, raw?: Record<string, unknown>) => Promise<NodeRunResult>
  execute?: (input: unknown, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
}

/** 规范化节点名称：剥离 `@hibernalglow/` 和 `xaihi-` 前缀以便多口径命中。 */
export function normalizeNodeId(id: string): string {
  return id.replace(/^@hibernalglow\//, '').replace(/^xaihi-/, '')
}

export class NodeRegistry {
  private readonly nodes = new Map<string, RegisteredNode>()

  /** 注册一个节点。如果已有同名节点，则覆盖；返回取消注册函数。 */
  register(entry: RegisteredNode): () => void {
    const key = entry.nodeId
    this.nodes.set(key, entry)
    const norm = normalizeNodeId(key)
    if (norm !== key) {
      this.nodes.set(norm, entry)
    }
    return () => {
      this.unregister(key)
    }
  }

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
   */
  async run(nodeId: string, input: unknown): Promise<NodeRunResult> {
    const entry = this.get(nodeId)
    if (!entry) {
      return {
        success: false,
        message: `Node "${nodeId}" is not registered in local NodeRegistry`,
      }
    }

    if (entry.execute) {
      try {
        return await entry.execute(input)
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

    return await entry.run(actionId, raw)
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
    run: (nodeId: string, input: unknown) => registry.run(nodeId, input),
    cancel: (runId: string) => registry.cancel(runId),
  }
}
