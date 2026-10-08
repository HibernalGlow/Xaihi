import { describe, expect, test, vi } from "vitest"

import type { KisakiData, KisakiInput } from "./core.js"
import { CZKAWKA_CACHE_SOURCE_VERSION } from "./cache-regeneration.js"
import { createKisakiWorkbench, type KisakiWorkbenchPersistencePatch } from "./workbench.js"

const data: KisakiData = {
  action: "scan",
  tool: "duplicate-files",
  groups: [],
  entries: [],
  messages: "",
  stopped: false,
  groupCount: 0,
  fileCount: 0,
  totalBytes: 0,
  reclaimableBytes: 0,
  affectedCount: 0,
  errorCount: 0,
}

const messages = {
  noRoots: "Add a directory.",
  noRuntime: "Runtime unavailable.",
  cacheRegeneration: "Kisaki will regenerate incompatible cache entries.",
  starting: "Starting scan.",
  stopping: "Stopping scan.",
}

describe("Kisaki workbench", () => {
  test("keeps selection history and filters isolated per tool", () => {
    const { workbench, patches } = createTestWorkbench()
    const filter = { text: { enabled: true, pattern: "portrait" } }

    workbench.setSelectedPaths("duplicate-files", ["D:/one.bin"])
    workbench.setSelectedPaths("duplicate-files", ["D:/two.bin"])
    workbench.undoSelection("duplicate-files")
    workbench.setSelectedPaths("similar-images", ["D:/one.jpg"])
    workbench.setFilterState("similar-images", filter)

    expect(workbench.getSelectedPaths("duplicate-files")).toEqual(["D:/one.bin"])
    expect(workbench.getSelectedPaths("similar-images")).toEqual(["D:/one.jpg"])
    expect(workbench.getFilterState("similar-images")).toBe(filter)
    expect(patches.at(-1)).toEqual({ filterStatesByTool: { "similar-images": filter } })
  })

  test("normalizes scan progress, retains stopped partial results, and switches to results", async () => {
    const partial = { ...data, stopped: true, fileCount: 1 }
    const { workbench, patches, run } = createTestWorkbench(async (_input, onEvent) => {
      onEvent?.({ type: "progress", progress: 43, message: "Hashing 25/100" })
      return { success: false, message: "Stopped with a partial result.", data: partial }
    })

    await workbench.executeScan("duplicate-files", { action: "scan", tool: "duplicate-files", includedDirectories: ["D:/library"] }, messages)

    expect(run).toHaveBeenCalledOnce()
    expect(workbench.getResult("duplicate-files")).toBe(partial)
    expect(workbench.getState()).toMatchObject({ running: false, panel: "results" })
    expect(patches).toContainEqual({ progress: 43, progressText: "Hashing 25/100" })
    expect(patches).toContainEqual(expect.objectContaining({ phase: "stopped", progress: 100, result: partial }))
  })

  test("does not call the runner when scan input has no included directory", async () => {
    const { workbench, run, patches } = createTestWorkbench()

    await workbench.executeScan("duplicate-files", { action: "scan", tool: "duplicate-files", includedDirectories: [] }, messages)

    expect(run).not.toHaveBeenCalled()
    expect(patches.at(-1)).toEqual({ activityLog: expect.any(Array) })
    expect(workbench.getState().activityLog.at(-1)).toMatchObject({ level: "error", message: messages.noRoots })
  })

  test("records one cache regeneration notice before the first affected scan", async () => {
    const { workbench, patches } = createTestWorkbench()

    await workbench.executeScan("duplicate-files", { action: "scan", tool: "duplicate-files", includedDirectories: ["D:/library"] }, messages)
    await workbench.executeScan("similar-images", { action: "scan", tool: "similar-images", includedDirectories: ["D:/photos"] }, messages)

    expect(patches).toContainEqual({
      cacheRegeneration: {
        sourceVersion: CZKAWKA_CACHE_SOURCE_VERSION,
        noticeSourceVersion: CZKAWKA_CACHE_SOURCE_VERSION,
      },
    })
    expect(workbench.getState().activityLog.filter((entry) => entry.message === messages.cacheRegeneration)).toHaveLength(1)
  })

  test("does not record a cache regeneration notice for unaffected tools", async () => {
    const { workbench, patches } = createTestWorkbench()

    await workbench.executeScan("empty-files", { action: "scan", tool: "empty-files", includedDirectories: ["D:/library"] }, messages)

    expect(patches.some((patch) => patch.cacheRegeneration !== undefined)).toBe(false)
    expect(workbench.getState().activityLog.some((entry) => entry.message === messages.cacheRegeneration)).toBe(false)
  })

  test("keeps live operations behind an explicit selected-path input and clears selection only after success", async () => {
    const { workbench, run } = createTestWorkbench(async () => ({ success: true, message: "Moved.", data: { ...data, action: "move", affectedCount: 1 } }))
    workbench.setSelectedPaths("duplicate-files", ["D:/one.bin"])

    await workbench.executeOperation(
      "duplicate-files",
      "move",
      { action: "move", tool: "duplicate-files", selectedPaths: ["D:/one.bin"], dryRun: false },
      { description: (action, count) => `${action} ${count} item(s)` },
    )

    expect(run).toHaveBeenCalledOnce()
    expect(workbench.getSelectedPaths("duplicate-files")).toEqual([])
  })

  test("delegates cancellation only while an active scan exists", async () => {
    const cancel = vi.fn(async () => true)
    const { workbench } = createTestWorkbench(async () => new Promise(() => undefined), cancel)
    const promise = workbench.executeScan("duplicate-files", { action: "scan", tool: "duplicate-files", includedDirectories: ["D:/library"] }, messages)

    await workbench.cancelScan("duplicate-files", messages)
    expect(cancel).toHaveBeenCalledOnce()
    void promise
  })

  test("keeps image comparison state in the workbench and persists only view preferences", () => {
    const { workbench, patches } = createTestWorkbench()
    const groups = [{
      id: 0,
      totalBytes: 30,
      reclaimableBytes: 10,
      entries: [
        { id: "a", groupId: 0, path: "D:/a.jpg", name: "a.jpg", size: 10, modifiedDate: 1 },
        { id: "b", groupId: 0, path: "D:/b.jpg", name: "b.jpg", size: 20, modifiedDate: 2 },
      ],
    }]

    workbench.openImageComparison(groups, "D:/a.jpg")
    workbench.setImageComparisonSwipe(72)
    workbench.setImageComparisonOpacity(24)
    workbench.setImageComparisonTarget(groups, "D:/b.jpg")
    workbench.setImageComparisonMode("onion-skin")
    workbench.setImageComparisonColorCoding(true)

    expect(workbench.getState().imageComparison).toMatchObject({
      activePath: "D:/a.jpg",
      targetPath: "D:/b.jpg",
      mode: "onion-skin",
      colorCoding: true,
      swipePercent: 50,
      onionOpacity: 50,
    })
    expect(patches).toContainEqual({ imageComparison: { mode: "onion-skin", colorCoding: false } })
    expect(patches).toContainEqual({ imageComparison: { mode: "onion-skin", colorCoding: true } })
  })
})

function createTestWorkbench(
  handler: (input: KisakiInput, onEvent?: (event: { type: "progress"; progress?: number; message: string }) => void) => Promise<{ success: boolean; message: string; data?: KisakiData }> = async () => ({ success: true, message: "Done.", data }),
  cancel?: () => Promise<unknown>,
) {
  const patches: KisakiWorkbenchPersistencePatch[] = []
  const run = vi.fn(async (_nodeId: string, input: KisakiInput, onEvent?: (event: { type: "progress"; progress?: number; message: string }) => void) => handler(input, onEvent))
  return {
    patches,
    run,
    workbench: createKisakiWorkbench({}, { persist: (patch) => patches.push(patch), run, cancel }),
  }
}
