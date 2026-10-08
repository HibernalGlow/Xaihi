/**
 * 基线自带的调度测试，逐字搬来当**保真门禁**：它断言的是"哪个动作会变成哪个
 * gateway 方法调用、缺参数时会不会在动手前拒绝"。
 *
 * 只有 import 路径变了（`./core.js` → `../src/core.ts`），断言一条没动。
 * 移植件的行为改变会在这里红，而不是靠重写者重述。
 */

import { describe, expect, it } from "vitest"
import { runFindzWithGateway } from "../src/core.ts"
import type { FindzWorkerGateway } from "../src/worker-protocol.ts"

describe("runFindzWithGateway", () => {
  it("routes a structured archive query to the Worker boundary", async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const gateway: FindzWorkerGateway = {
      async call(method, params) {
        calls.push({ method, params })
        return { items: [], total: 0 } as never
      },
    }

    const result = await runFindzWithGateway({ action: "query_archives", libraryId: "library-a", text: "cover", query: { sortBy: "size", sortDesc: true } }, gateway)

    expect(result).toMatchObject({ success: true, data: { action: "query_archives", archives: { total: 0 } } })
    expect(calls).toEqual([{ method: "query.archives", params: { libraryId: "library-a", text: "cover", sortBy: "size", sortDesc: true } }])
  })

  it("returns a structured error without invoking the Worker when a library id is absent", async () => {
    const gateway: FindzWorkerGateway = { call: async () => { throw new Error("should not be called") } }

    const result = await runFindzWithGateway({ action: "scan" }, gateway)

    expect(result.success).toBe(false)
    expect(result.message).toContain("libraryId is required")
  })

  it("routes task cancellation through the Worker boundary", async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const gateway: FindzWorkerGateway = {
      async call(method, params) {
        calls.push({ method, params })
        return { id: "task-7", libraryId: "library-a", kind: "analysis", status: "cancelled" } as never
      },
    }

    const result = await runFindzWithGateway({ action: "cancel", libraryId: "library-a", taskId: "task-7" }, gateway)

    expect(result).toMatchObject({ success: true, data: { action: "cancel", task: { id: "task-7", status: "cancelled" } } })
    expect(calls).toEqual([{ method: "task.cancel", params: { libraryId: "library-a", taskId: "task-7" } }])
  })
})
