import { afterEach, describe, expect, test } from "vitest"
import type { NodeOperationDTO } from "@xiranite/shared"
import { useNodeOperations } from "./nodeOperations"

afterEach(() => {
  useNodeOperations.getState().reset()
})

describe("node operation event cursor", () => {
  test("does not treat the backend cumulative event count as a replay cursor", () => {
    const operation = fixture({ eventCount: 3 })
    useNodeOperations.getState().upsertOperation(operation)

    expect(useNodeOperations.getState().operations[0]?.nextEventIndex).toBe(0)
    useNodeOperations.getState().appendEvent(operation.operationId, 0, { type: "log", message: "started" })
    useNodeOperations.getState().upsertOperation({ ...operation, eventCount: 3, updatedAt: 2 })

    expect(useNodeOperations.getState().operations[0]?.nextEventIndex).toBe(1)
    useNodeOperations.getState().appendEvent(operation.operationId, 0, { type: "log", message: "duplicate" })
    expect(useNodeOperations.getState().operations[0]?.events).toHaveLength(1)
  })
})

function fixture(overrides: Partial<NodeOperationDTO> = {}): NodeOperationDTO {
  return {
    operationId: "clipm-operation-cursor",
    nodeId: "clipm",
    phase: "running",
    createdAt: 1,
    updatedAt: 1,
    eventCount: 0,
    ...overrides,
  }
}
