/**
 * 基线自带的 watch 合并测试，逐字搬来当**保真门禁**：合并顺序、健康度回写、
 * 大小/mtime 稳定前重试、关闭后不再写健康度。
 *
 * 只有 import 路径变了，断言一条没动。
 *
 * 注意：这里测的是**合并策略**这一层纯逻辑（依赖注入 `FindzWatcherClient`），
 * 不是"真的订阅了文件系统"。后者的落点还没定，见 `docs/stages/step-4.md`
 * 批次 D 的"没做"。
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { FindzLibraryWatch, coalesceFindzWatcherEvents, type FindzWatcherClient } from "../src/watcher-service.ts"

afterEach(() => vi.useRealTimers())

describe("coalesceFindzWatcherEvents", () => {
  it("keeps one final change for each path in first-seen order", () => {
    expect(coalesceFindzWatcherEvents([
      { path: "D:/library/a.cbz", type: "create" },
      { path: "D:/library/b.cbz", type: "update" },
      { path: "D:/library/a.cbz", type: "delete" },
    ])).toEqual([
      { path: "D:/library/a.cbz", type: "delete" },
      { path: "D:/library/b.cbz", type: "update" },
    ])
  })
})

describe("FindzLibraryWatch", () => {
  it("coalesces queued events and restores healthy state after a successful flush", async () => {
    vi.useFakeTimers()
    const client = watcherClient()
    const watch = new FindzLibraryWatch("library-1", "D:/library", client, undefined, 250, missingPathInspector())

    watch.queue([{ path: "D:/library/a.cbz", type: "create" }])
    watch.queue([
      { path: "D:/library/a.cbz", type: "update" },
      { path: "D:/library/b.cbz", type: "delete" },
    ])
    await vi.advanceTimersByTimeAsync(250)

    expect(client.applyWatcherChanges).toHaveBeenCalledWith("library-1", [
      { path: "D:/library/a.cbz", type: "update" },
      { path: "D:/library/b.cbz", type: "delete" },
    ])
    expect(client.setWatcherHealth).toHaveBeenCalledWith("library-1", "healthy")
  })

  it("marks the library degraded when native incremental work fails", async () => {
    vi.useFakeTimers()
    const client = watcherClient({ apply: async () => { throw new Error("index unavailable") } })
    const watch = new FindzLibraryWatch("library-1", "D:/library", client, undefined, 250, missingPathInspector())

    watch.queue([{ path: "D:/library/a.cbz", type: "update" }])
    await vi.advanceTimersByTimeAsync(250)

    expect(client.setWatcherHealth).toHaveBeenCalledWith("library-1", "degraded")
    expect(client.reconcileScan).toHaveBeenCalledWith("library-1")
  })

  it("retries changed files until size and mtime are stable", async () => {
    vi.useFakeTimers()
    const client = watcherClient()
    const inspector = pathInspector([
      { size: 10, mtimeMs: 1 },
      { size: 12, mtimeMs: 2 },
      { size: 12, mtimeMs: 2 },
    ])
    const watch = new FindzLibraryWatch("library-1", "D:/library", client, undefined, 250, inspector)

    watch.queue([{ path: "D:/library/copying.cbz", type: "update" }])
    await vi.advanceTimersByTimeAsync(250)
    expect(client.applyWatcherChanges).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(client.applyWatcherChanges).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)

    expect(client.applyWatcherChanges).toHaveBeenCalledWith("library-1", [{ path: "D:/library/copying.cbz", type: "update" }])
    expect(inspector.stat).toHaveBeenCalledTimes(3)
  })

  it("cancels queued work and does not write health after closing", async () => {
    vi.useFakeTimers()
    let finishApply: (() => void) | undefined
    const client = watcherClient({ apply: async () => await new Promise<void>((resolve) => { finishApply = resolve }) })
    const unsubscribe = vi.fn(async () => undefined)
    const watch = new FindzLibraryWatch("library-1", "D:/library", client, undefined, 250, missingPathInspector())
    watch.setSubscription({ unsubscribe })

    watch.queue([{ path: "D:/library/a.cbz", type: "update" }])
    await vi.advanceTimersByTimeAsync(250)
    expect(client.applyWatcherChanges).toHaveBeenCalledTimes(1)

    await watch.close()
    finishApply?.()
    await Promise.resolve()
    await Promise.resolve()
    watch.queue([{ path: "D:/library/b.cbz", type: "create" }])
    await vi.runAllTimersAsync()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(client.setWatcherHealth).not.toHaveBeenCalled()
    expect(client.applyWatcherChanges).toHaveBeenCalledTimes(1)
  })
})

function watcherClient(overrides: { apply?: FindzWatcherClient["applyWatcherChanges"] } = {}): FindzWatcherClient & {
  applyWatcherChanges: ReturnType<typeof vi.fn>
  startScan: ReturnType<typeof vi.fn>
  reconcileScan: ReturnType<typeof vi.fn>
  setWatcherHealth: ReturnType<typeof vi.fn>
} {
  return {
    applyWatcherChanges: vi.fn(overrides.apply ?? (async () => undefined)),
    startScan: vi.fn(async () => undefined),
    reconcileScan: vi.fn(async () => undefined),
    setWatcherHealth: vi.fn(async () => undefined),
  }
}

function pathInspector(values: Array<{ size: number; mtimeMs: number }>) {
  let index = 0
  return {
    stat: vi.fn(async () => values[Math.min(index++, values.length - 1)]),
  }
}

function missingPathInspector() {
  return { stat: vi.fn(async () => undefined) }
}
