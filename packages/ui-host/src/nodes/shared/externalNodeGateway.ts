import type { NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { NodeSettingsFace } from "./NodeSettingsFaceContext"
import { namespaceForNode } from "./NodeSettingsFaceContext"
import { runNodeOperation } from "./api"

export interface ExternalNodeGateway<TConfig = Record<string, unknown>> {
  readonly nodeId: string
  readonly config: {
    get(): Promise<{ config: TConfig | undefined; path: string }>
    patch(patch: Partial<TConfig>): Promise<void>
  }
  run<TInput = unknown, TData = unknown>(
    input: TInput,
    onEvent?: (event: NodeRunEvent) => void,
    context?: { componentId?: string; workspaceId?: string },
  ): Promise<NodeRunResult<TData>>
}

/**
 * Stable frontend adapter for invoking another node's public interfaces.
 *
 * 配置那组走注入的 `NodeSettingsFace`（桥的 `config.getUi`/`config.save`，落
 * `xaihi-<node>` 命名空间）。不传 face 时调用会抛一条读得回的原因——旧 REST 通路
 * （`nodeConfigApi.get/save`）已随 2026-10-07 的口径整块裁掉，不再保留一条必抛的假实现。
 * face 从 `useNodeSettingsFace()` 拿，所以在组件体里现造 gateway（构造是纯对象，无成本）。
 */
export function externalNode<TConfig = Record<string, unknown>>(nodeId: string, settings?: NodeSettingsFace): ExternalNodeGateway<TConfig> {
  const ns = namespaceForNode(nodeId)
  return {
    nodeId,
    config: {
      async get() {
        if (!settings) throw new Error(`节点 "${nodeId}" 的配置读不到：这一份渲染树没接设置面（NodeSettingsFaceProvider 未装配）`)
        const view = await settings.read(ns)
        return {
          config: view.value !== null && typeof view.value === "object" && !Array.isArray(view.value) ? view.value as TConfig : undefined,
          path: "",
        }
      },
      async patch(patch) {
        if (!settings) throw new Error(`节点 "${nodeId}" 的配置写不了：这一份渲染树没接设置面（NodeSettingsFaceProvider 未装配）`)
        await settings.write(ns, patch as Record<string, unknown>)
      },
    },
    run: (input, onEvent, context) => {
      if (context) return runNodeOperation(nodeId, input, onEvent, context)
      if (onEvent) return runNodeOperation(nodeId, input, onEvent)
      return runNodeOperation(nodeId, input)
    },
  }
}
