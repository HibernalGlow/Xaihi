// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { cancelNodeOperationOnLocalBackend } from "@/backend/nodeRpcClient"
import { useNodeOperations } from "@/store/nodeOperations"
import { NodeOperationMonitor } from "./NodeOperationMonitor"

vi.mock("@/backend/nodeRpcClient", () => ({
  cancelNodeOperationOnLocalBackend: vi.fn(),
  cleanupNodeOperationsOnLocalBackend: vi.fn(async () => ({ removedCount: 0, remainingCount: 0 })),
}))

afterEach(() => {
  cleanup()
  useNodeOperations.getState().reset()
  vi.clearAllMocks()
})

describe("NodeOperationMonitor", () => {
  test("filters operation rows by phase group", async () => {
    const now = Date.now()
    useNodeOperations.getState().upsertOperation({
      operationId: "op-running",
      nodeId: "recycleu",
      phase: "running",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      eventCount: 0,
    })
    useNodeOperations.getState().upsertOperation({
      operationId: "op-completed",
      nodeId: "cleanf",
      phase: "completed",
      createdAt: now,
      startedAt: now,
      updatedAt: now + 1,
      finishedAt: now + 1,
      eventCount: 0,
    })

    renderMonitor()
    const user = userEvent.setup()

    expect(screen.getByText("recycleu")).toBeTruthy()
    expect(screen.getByText("cleanf")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Finished" }))

    expect(screen.queryByText("recycleu")).toBeNull()
    expect(screen.getByText("cleanf")).toBeTruthy()
  })

  test("renders active operation progress and cancels through the backend", async () => {
    const now = Date.now()
    useNodeOperations.getState().upsertOperation({
      operationId: "op-recycleu",
      nodeId: "recycleu",
      phase: "running",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      eventCount: 0,
    })
    useNodeOperations.getState().appendEvent("op-recycleu", 0, {
      type: "progress",
      progress: 40,
      message: "waiting before cleanup",
    })
    vi.mocked(cancelNodeOperationOnLocalBackend).mockResolvedValueOnce({
      operationId: "op-recycleu",
      nodeId: "recycleu",
      phase: "cancelled",
      createdAt: now,
      startedAt: now,
      updatedAt: now + 1,
      cancelledAt: now + 1,
      finishedAt: now + 1,
      eventCount: 1,
      result: { success: false, message: "Node operation cancelled." },
    })

    renderMonitor()
    const user = userEvent.setup()

    expect(screen.getByText("recycleu")).toBeTruthy()
    expect(screen.getAllByText("waiting before cleanup").length).toBeGreaterThan(0)
    expect(screen.getByText((_content, element) => element?.textContent === "40%")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => expect(cancelNodeOperationOnLocalBackend).toHaveBeenCalledWith("op-recycleu"))
    await waitFor(() => expect(screen.getByText("cancelled")).toBeTruthy())
    expect(useNodeOperations.getState().operations[0]?.phase).toBe("cancelled")
  })
})

function renderMonitor() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NodeOperationMonitor />
    </I18nextProvider>,
  )
}

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    en: {
      view: {
        operations: {
          title: "Node operations",
          subtitle: "Live backend node runs, recent results, and stream events.",
          all: "All",
          active: "Active",
          recent: "Recent",
          finished: "Finished",
          clearLocal: "Clear finished",
          cleanupBackend: "Cleanup backend",
          empty: "No node operations have run in this session.",
          cancel: "Cancel",
          progress: "Progress",
          events: "{{count}} event(s)",
          started: "Started {{time}}",
          updated: "Updated {{time}}",
          noMessage: "No message yet",
          noEvents: "No stream events yet",
          phase: {
            queued: "queued",
            running: "running",
            completed: "completed",
            error: "error",
            cancelled: "cancelled",
          },
        },
      },
    },
  },
})
