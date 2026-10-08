import { describe, expect, test, vi } from "vitest"
import { applySimiuSetOperations, scanSimiuSets, undoSimiuSetLog, type SimiuSetRuntime } from "./simiu-sets.js"

function runtime(): SimiuSetRuntime {
  return {
    listDirectory: vi.fn(async (path) => ({
      "D:/library": [
        { path: "D:/library/a.jpg", isFile: true, isDirectory: false },
        { path: "D:/library/b.jpg", isFile: true, isDirectory: false },
        { path: "D:/library/c.jpg", isFile: true, isDirectory: false },
        { path: "D:/library/child", isFile: false, isDirectory: true },
        { path: "D:/library/.simiu-old", isFile: false, isDirectory: true },
      ],
      "D:/library/child": [
        { path: "D:/library/child/d.jpg", isFile: true, isDirectory: false },
        { path: "D:/library/child/e.jpg", isFile: true, isDirectory: false },
      ],
    }[path] ?? [])),
    pathExists: vi.fn(async () => false),
    ensureDirectory: vi.fn(async () => undefined),
    movePath: vi.fn(async () => undefined),
    copyPath: vi.fn(async () => undefined),
    linkPath: vi.fn(async () => undefined),
    removePath: vi.fn(async () => undefined),
    readText: vi.fn(async () => ""),
    writeText: vi.fn(async () => undefined),
    join: (...parts) => parts.filter(Boolean).join("/"),
    dirname: (path) => path.slice(0, path.lastIndexOf("/")),
    basename: (path) => path.slice(path.lastIndexOf("/") + 1),
  }
}

function image(path: string) {
  return {
    path,
    modifiedDate: 1,
    size: 10,
    width: 100,
    height: 80,
  }
}

describe("Simiu sets", () => {
  test("keeps groups directory-local and skips an all-in-one directory", async () => {
    const adapter = runtime()
    const result = await scanSimiuSets({ roots: ["D:/library"], recursive: true, namePrefix: "sets" }, [
      { entries: [
        image("D:/library/a.jpg"), image("D:/library/b.jpg"),
        image("D:/library/child/d.jpg"), image("D:/library/child/e.jpg"),
      ] },
    ], adapter)

    expect(result.directoryCount).toBe(2)
    expect(result.imageCount).toBe(5)
    expect(result.groups).toEqual([expect.objectContaining({ parentDirectory: "D:/library", name: "sets__set_001", files: [expect.objectContaining({ path: "D:/library/a.jpg" }), expect.objectContaining({ path: "D:/library/b.jpg" })] })])
    expect(result.operations.map((operation) => operation.targetPath)).toEqual([
      "D:/library/sets__set_001/a.jpg",
      "D:/library/sets__set_001/b.jpg",
    ])
    expect(adapter.listDirectory).not.toHaveBeenCalledWith("D:/library/.simiu-old")
  })

  test("uses the requested mutation and writes an undo log per root", async () => {
    const adapter = runtime()
    const result = await applySimiuSetOperations([{ root: "D:/library", mode: "link", sourcePath: "D:/library/a.jpg", targetPath: "D:/library/sets__set_001/a.jpg" }], false, adapter)

    expect(adapter.linkPath).toHaveBeenCalledWith("D:/library/a.jpg", "D:/library/sets__set_001/a.jpg")
    expect(result.operations).toEqual([expect.objectContaining({ status: "succeeded" })])
    expect(result.undoLogPaths).toHaveLength(1)
    expect(adapter.writeText).toHaveBeenCalledWith(expect.stringMatching(/\.simiu-undo-.*\.json$/), expect.stringContaining('"mode": "link"'))
  })

  test("undo reverses moves, removes copied paths, and cleans recorded directories", async () => {
    const adapter = runtime()
    vi.mocked(adapter.readText).mockResolvedValue(JSON.stringify({
      version: 1,
      root: "D:/library",
      operations: [
        { mode: "move", src: "D:/library/a.jpg", dst: "D:/library/sets__set_001/a.jpg" },
        { mode: "copy", src: "D:/library/b.jpg", dst: "D:/library/sets__set_001/b.jpg" },
      ],
      createdDirectories: ["D:/library/sets__set_001"],
    }))
    vi.mocked(adapter.pathExists).mockResolvedValue(false)
    vi.mocked(adapter.pathExists).mockImplementation(async (path) => path.endsWith("a.jpg") || path.endsWith("b.jpg"))

    const result = await undoSimiuSetLog("D:/library/.simiu-undo.json", true, adapter)

    expect(result.operations.map((operation) => operation.status)).toEqual(["succeeded", "succeeded"])
    expect(adapter.movePath).toHaveBeenCalledWith("D:/library/sets__set_001/a.jpg", "D:/library/a_01.jpg")
    expect(adapter.removePath).toHaveBeenCalledWith("D:/library/sets__set_001/b.jpg", { trash: false })
    expect(adapter.removePath).toHaveBeenCalledWith("D:/library/sets__set_001", { trash: false, emptyFoldersOnly: true })
  })
})
