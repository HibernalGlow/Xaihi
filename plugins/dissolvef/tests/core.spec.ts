import { afterEach, describe, expect, test } from "vitest"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { calculateDissolvefSimilarity, parseDissolveHistory, runDissolvef } from "../src/core.ts"
import { createNodeDissolvefRuntime } from "../src/platform.ts"

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

describe("dissolvef core", () => {
  test("calculates useful filename similarity", () => {
    expect(calculateDissolvefSimilarity("series_a", "series_a.zip")).toBe(1)
    expect(calculateDissolvefSimilarity("alpha", "beta")).toBeLessThan(0.9)
  })

  test("collects single archive paths with similarity filtering", async () => {
    const root = await tempRoot()
    const ok = join(root, "series_a")
    const extra = join(root, "series_b")
    const mismatch = join(root, "alpha")
    await mkdir(ok)
    await mkdir(extra)
    await mkdir(mismatch)
    await writeFile(join(ok, "series_a.zip"), "zip")
    await writeFile(join(extra, "series_b.zip"), "zip")
    await writeFile(join(extra, "readme.txt"), "extra")
    await writeFile(join(mismatch, "beta.zip"), "zip")

    const result = await runDissolvef({
      action: "collect_archives",
      path: root,
      protectFirstLevel: false,
      similarityThreshold: 0.9,
      skipBlacklist: true,
    }, createNodeDissolvefRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.archivePaths.map((path) => path.endsWith(join("series_a", "series_a.zip")))).toEqual([true])
    expect(result.data?.skippedCount).toBe(0)
  })

  test("previews direct dissolve with rename conflict", async () => {
    const root = await tempRoot()
    const box = join(root, "box")
    await mkdir(box)
    await writeFile(join(root, "a.txt"), "old")
    await writeFile(join(box, "a.txt"), "new")

    const result = await runDissolvef({
      action: "direct",
      path: box,
      preview: true,
      fileConflict: "rename",
    }, createNodeDissolvefRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.directFiles).toBe(1)
    expect(result.data?.plan.find((item) => item.operation === "move")?.targetPath.endsWith("a_1.txt")).toBe(true)
  })

  test("does not double-plan archive folders in bundle mode", async () => {
    const root = await tempRoot()
    const folder = join(root, "series_a")
    await mkdir(folder)
    await writeFile(join(folder, "series_a.zip"), "zip")

    const result = await runDissolvef({
      action: "dissolve",
      path: root,
      preview: true,
      protectFirstLevel: false,
      similarityThreshold: 0,
      skipBlacklist: true,
    }, createNodeDissolvefRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.mediaCount).toBe(1)
    expect(result.data?.archiveCount).toBe(0)
  })

  test("executes nested dissolve and undo", async () => {
    const root = await tempRoot()
    const a = join(root, "a")
    const deepest = join(a, "b", "c")
    const historyPath = join(root, "history.json")
    await mkdir(deepest, { recursive: true })
    await writeFile(join(deepest, "test.txt"), "hello")

    const runtime = createNodeDissolvefRuntime()
    const result = await runDissolvef({
      action: "nested",
      path: a,
      historyPath,
      enableSimilarity: false,
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.nestedCount).toBe(1)
    expect(existsSync(join(a, "test.txt"))).toBe(true)
    expect(existsSync(join(a, "b"))).toBe(false)

    const undo = await runDissolvef({ action: "undo", historyPath }, runtime)
    expect(undo.success).toBe(true)
    expect(existsSync(join(deepest, "test.txt"))).toBe(true)
  })

  test("reads and undoes a legacy Python single-record journal", async () => {
    const root = await tempRoot()
    const sourceDir = join(root, "outer", "inner")
    const sourcePath = join(sourceDir, "test.txt")
    const targetPath = join(root, "outer", "test.txt")
    const historyPath = join(root, "legacy-undo.json")
    await mkdir(join(root, "outer"), { recursive: true })
    await writeFile(targetPath, "hello")
    await writeFile(historyPath, JSON.stringify({
      id: "dissolve-legacy",
      timestamp: "2026-07-21T16:04:54.445129",
      mode: "nested",
      path: root,
      count: 2,
      operations: [
        { type: "move", src: sourcePath, dst: targetPath, timestamp: "2026-07-21T16:02:57.405605" },
        { type: "delete_dir", src: sourceDir, dst: null, timestamp: "2026-07-21T16:02:57.408122" },
      ],
    }))

    const parsed = parseDissolveHistory(await createNodeDissolvefRuntime().readText(historyPath))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.operations).toEqual([
      { type: "move", sourcePath, targetPath },
      { type: "delete_dir", sourcePath: sourceDir },
    ])

    const undo = await runDissolvef({ action: "undo", historyPath }, createNodeDissolvefRuntime())
    expect(undo.success).toBe(true)
    expect(undo.data?.successCount).toBe(2)
    expect(existsSync(sourcePath)).toBe(true)
    expect(existsSync(targetPath)).toBe(false)
  })

  test("resumes a partially applied undo without overwriting restored files", async () => {
    const root = await tempRoot()
    const sourcePath = join(root, "inner", "test.txt")
    const targetPath = join(root, "test.txt")
    const historyPath = join(root, "legacy-undo.json")
    await mkdir(join(root, "inner"))
    await writeFile(sourcePath, "already restored")
    await writeFile(historyPath, JSON.stringify({
      id: "dissolve-partial",
      timestamp: "2026-07-21T16:04:54.445129",
      mode: "nested",
      path: root,
      count: 1,
      operations: [{ type: "move", src: sourcePath, dst: targetPath }],
    }))

    const undo = await runDissolvef({ action: "undo", historyPath }, createNodeDissolvefRuntime())
    expect(undo.success).toBe(true)
    expect(undo.data?.successCount).toBe(1)
    expect(existsSync(sourcePath)).toBe(true)
  })
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "xaihi-dissolvef-"))
  tempRoots.push(root)
  return root
}
