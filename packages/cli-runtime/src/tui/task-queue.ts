import { createXiraniteNodeClient } from "@xiranite/api/client"

export interface TerminalTaskQueueItem {
  operationId: string
  nodeId: string
  phase: "queued" | "running" | "paused" | "completed" | "error" | "cancelled"
  createdAt: number
  updatedAt: number
  eventCount: number
  result?: { success: boolean; message: string }
}

export interface TerminalTaskQueueController {
  available: boolean
  unavailableReason?: string
  list: () => Promise<TerminalTaskQueueItem[]>
  pause: (operationId: string) => Promise<void>
  resume: (operationId: string) => Promise<void>
  cancel: (operationId: string) => Promise<void>
  run: <Input, Result>(nodeId: string, input: Input, onEvent: (event: { type: string; progress?: number; message: string }) => void, onStarted?: (operationId: string) => void) => Promise<Result>
}

export function createTerminalTaskQueueController(env: NodeJS.ProcessEnv): TerminalTaskQueueController {
  const baseUrl = env.XIRANITE_BACKEND_URL?.trim()
  const token = env.XIRANITE_BACKEND_TOKEN?.trim()
  if (!baseUrl) {
    const unavailableReason = "未配置本地后端；设置 XIRANITE_BACKEND_URL 后可查看全局任务。"
    return {
      available: false,
      unavailableReason,
      list: async () => [],
      pause: async () => { throw new Error(unavailableReason) },
      resume: async () => { throw new Error(unavailableReason) },
      cancel: async () => { throw new Error(unavailableReason) },
      run: async () => { throw new Error(unavailableReason) },
    }
  }
  const client = createXiraniteNodeClient(baseUrl, { token })
  return {
    available: true,
    list: async () => (await client.listNodeOperations({ limit: 100 })).operations,
    pause: async (operationId) => { await client.pauseNodeOperation(operationId) },
    resume: async (operationId) => { await client.resumeNodeOperation(operationId) },
    cancel: async (operationId) => { await client.cancelNodeOperation(operationId) },
    run: async <Input, Result>(nodeId: string, input: Input, onEvent: (event: { type: string; progress?: number; message: string }) => void, onStarted?: (operationId: string) => void) => {
      const started = await client.startNodeOperation(nodeId, input)
      onStarted?.(started.operationId)
      let fromEventIndex = 0
      while (true) {
        const page = await client.getNodeOperationEvents(started.operationId, { fromEventIndex, limit: 100 })
        for (const entry of page.events) onEvent(entry.event)
        fromEventIndex = page.next ?? page.total
        if (["completed", "error", "cancelled"].includes(page.operation.phase)) {
          if (!page.operation.result) throw new Error(`Operation ${started.operationId} ended without a result.`)
          return page.operation.result as Result
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    },
  }
}

export function bindDefinitionToTaskQueue<Input, Result>(
  definition: import("../interaction.js").TerminalInteractionDefinition<Input, Result>,
  controller: TerminalTaskQueueController,
): import("../interaction.js").TerminalInteractionDefinition<Input, Result> {
  if (!controller.available) return definition
  let operationId: string | undefined
  return {
    schema: definition.schema,
    run: async (input, onEvent) => {
      try { return await controller.run<Input, Result>(definition.schema.id, input, onEvent, (id) => { operationId = id }) }
      finally { operationId = undefined }
    },
    pause: async () => { if (operationId) await controller.pause(operationId) },
    resume: async () => { if (operationId) await controller.resume(operationId) },
    cancel: async () => { if (operationId) await controller.cancel(operationId) },
  }
}
