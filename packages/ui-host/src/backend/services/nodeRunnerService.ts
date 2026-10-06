import type { NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { Service, ServiceContext } from "./index"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class NodeRunnerService implements Service<"nodes"> {
  readonly name = "nodes"
  private readonly ctx: ServiceContext

  constructor(ctx: ServiceContext) {
    this.ctx = ctx
  }

  async runNode<TInput = unknown, TData = unknown>(
    nodeId: string,
    input: TInput,
    onEvent?: (event: NodeRunEvent) => void,
  ): Promise<NodeRunResult<TData>> {
    try {
      return await this.ctx.runtime.nodeRunner.runNode<TInput, TData>(nodeId, input, onEvent)
    } catch (error) {
      const message = `Node runner failed: ${errorMessage(error)}`
      onEvent?.({ type: "log", message })
      return { success: false, message }
    }
  }
}
