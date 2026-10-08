import { describe, expect, test, vi } from "vitest"
import { filterAndSortGroups, normalizeKisakiInput, runKisaki, smartSelect, type KisakiRuntime } from "./core.js"

function runtime(): KisakiRuntime {
  return {
    scanDuplicates: vi.fn(async () => ({ groups: [{ files: [{ path: "D:/a.bin", size: 12, modifiedDate: 1, hash: "x" }, { path: "D:/b.bin", size: 12, modifiedDate: 2, hash: "x" }] }], messages: "ok", stopped: false })),
    scanBasic: vi.fn(async () => ({ entries: [{ path: "D:/empty.tmp", size: 0, modifiedDate: 1 }], messages: "ok", stopped: false })),
    scanExif: vi.fn(async () => ({ entries: [{ path: "D:/photo.jpg", size: 20, modifiedDate: 1, tags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }], messages: "ok", stopped: false })),
    scanVideoOptimizer: vi.fn(async () => ({ entries: [{ path: "D:/video.mp4", size: 40, modifiedDate: 1, codec: "h264", width: 1920, height: 1080, duration: 12 }], messages: "ok", stopped: false })),
    scanMedia: vi.fn(async () => ({ groups: [{ entries: [{ path: "D:/a.jpg", size: 20, modifiedDate: 1, width: 100, height: 80 }, { path: "D:/b.jpg", size: 21, modifiedDate: 1, width: 100, height: 80 }] }], messages: "ok", stopped: false })),
    createExifCandidate: vi.fn(async () => ({ candidatePath: "D:/candidates/photo.jpg", removedTags: 1 })),
    createVideoOptimizerCandidate: vi.fn(async () => ({ candidatePath: "D:/candidates/video.mp4", originalSize: 40, candidateSize: 30 })),
    replaceWithCandidate: vi.fn(async () => undefined),
    pathExists: vi.fn(async (path) => path.startsWith("D:/")), listDirectory: vi.fn(async () => []), removePath: vi.fn(async () => undefined), copyPath: vi.fn(async () => undefined), movePath: vi.fn(async () => undefined), linkPath: vi.fn(async () => undefined), readText: vi.fn(async () => ""), writeText: vi.fn(async () => undefined), ensureDirectory: vi.fn(async () => undefined),
    join: (...parts) => parts.filter(Boolean).join("/"), dirname: (path) => path.slice(0, path.lastIndexOf("/")), basename: (path) => path.slice(path.lastIndexOf("/") + 1), relativeDirectoryFromRoot: (path) => path.slice(3, path.lastIndexOf("/")),
  }
}

describe("kisaki TypeScript orchestration", () => {
  test("normalizes safe defaults", () => {
    const value = normalizeKisakiInput({})
    expect(value.tool).toBe("duplicate-files")
    expect(value.dryRun).toBe(true)
    expect(value.deleteMode).toBe("trash")
    expect(value.conflictPolicy).toBe("skip")
    expect(value.hashType).toBe("blake3")
    expect(value.threadCount).toBe(0)
    expect(value.similarImagesHashSize).toBe(16)
    expect(value.similarImagesIgnoreSameResolution).toBe(false)
    expect(value.similarImagesGeometricInvariance).toBe("off")
    expect(value.similarVideosWindowCount).toBe(5)
    expect(value.similarVideosDurationTolerancePct).toBe(20)
    expect(value.similarVideosMinMatchingWindows).toBe(0.6)
    expect(value.similarVideosSubclipMinMatch).toBe(0.5)
    expect(value.similarVideosCheckAudioContent).toBe(false)
    expect(value.similarVideosLetterboxCrop).toBe(true)
    expect(value).not.toHaveProperty("similarVideosCropDetect")
    expect(value.musicCheckType).toBe("tags")
    expect(value.brokenImage).toBe(true)
    expect(value.brokenVideoFfprobe).toBe(false)
    expect(value.brokenVideoFfmpeg).toBe(false)
    expect(value.brokenFont).toBe(false)
    expect(value.brokenMarkup).toBe(false)
    expect(value.emptyFilesSearchZeroByteContent).toBe(false)
    expect(value.emptyFilesSearchNonPrintableContent).toBe(false)
    expect(value.temporaryFileExtensions).toBe("#,thumbs.db,.bak,~,.tmp,.temp,.ds_store,.crdownload,.part,.cache,.dmp,.download,.partial")
    expect(value.videoOptimizerMode).toBe("transcode")
    expect(value.videoOptimizerExcludedCodecs).toBe("h265,av1,vp9")
    expect(value.videoOptimizerFailIfNotSmaller).toBe(true)
    expect(value.videoOptimizerNoiseReduction).toBe("none")
    expect(value.videoOptimizerNoiseReductionStrength).toBe(5)
    expect(value.saveAlsoAsJson).toBe(false)
    expect(value.deleteOutdatedCache).toBe(true)
    expect(value.duplicateMinimalHashCacheSizeKiB).toBe(256)
    expect(value.duplicateMinimalPrehashCacheSizeKiB).toBe(256)
  })

  test("normalizes the stable Czkawka 12 image-invariance modes", () => {
    const enabled = normalizeKisakiInput({
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
    })
    const invalid = normalizeKisakiInput({
      similarImagesGeometricInvariance: "unsupported" as "off",
    })

    expect(enabled).toMatchObject({
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
    })
    expect(invalid.similarImagesGeometricInvariance).toBe("off")
  })

  test("rejects Czkawka 12 image settings when the native binding lacks their capabilities", async () => {
    const adapter = runtime()
    const result = await runKisaki({
      tool: "similar-images",
      includedDirectories: ["D:/"],
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip",
    }, adapter)

    expect(result).toMatchObject({ success: false, message: expect.stringContaining("similar-images.same-resolution-exclusion") })
    expect(adapter.scanMedia).not.toHaveBeenCalled()

    adapter.capabilities = ["similar-images.same-resolution-exclusion", "similar-images.geometric-invariance"]
    await expect(runKisaki({
      tool: "similar-images",
      includedDirectories: ["D:/"],
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip",
    }, adapter)).resolves.toMatchObject({ success: true })
  })

  test("normalizes and capability-gates Czkawka 12 similario settings", async () => {
    const value = normalizeKisakiInput({
      tool: "similar-videos",
      similarVideosSkipForward: 999,
      similarVideosHashDuration: 999,
      similarVideosWindowCount: 999,
      similarVideosDurationTolerancePct: 999,
      similarVideosMinMatchingWindows: -1,
      similarVideosSubclipMinMatch: 2,
      similarVideosIgnoreSameResolution: true,
      similarVideosCheckAudioContent: true,
    })
    expect(value).toMatchObject({
      similarVideosSkipForward: 300,
      similarVideosHashDuration: 60,
      similarVideosWindowCount: 20,
      similarVideosDurationTolerancePct: 100,
      similarVideosMinMatchingWindows: 0,
      similarVideosSubclipMinMatch: 1,
    })

    const adapter = runtime()
    const result = await runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("similar-videos.same-resolution-exclusion") })
    expect(adapter.scanMedia).not.toHaveBeenCalled()

    adapter.capabilities = ["similar-videos.similario", "similar-videos.same-resolution-exclusion", "similar-videos.audio"]
    await expect(runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)).resolves.toMatchObject({ success: true })
  })

  test("normalizes and capability-gates Czkawka 12 broken-file checkers", async () => {
    const value = normalizeKisakiInput({
      tool: "broken-files",
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })
    expect(value).toMatchObject({
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })

    const adapter = runtime()
    const result = await runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("broken-files.multi-checker") })
    expect(adapter.scanMedia).not.toHaveBeenCalled()

    adapter.capabilities = ["broken-files.multi-checker"]
    await expect(runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)).resolves.toMatchObject({ success: true })
  })

  test("normalizes and capability-gates Czkawka 12 empty-file content checkers", async () => {
    const value = normalizeKisakiInput({
      tool: "empty-files",
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })
    expect(value).toMatchObject({
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })

    const adapter = runtime()
    const result = await runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("empty-files.content-checkers") })
    expect(adapter.scanBasic).not.toHaveBeenCalled()

    adapter.capabilities = ["empty-files.content-checkers"]
    await expect(runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)).resolves.toMatchObject({ success: true })
  })

  test("normalizes temporary suffixes and rejects a persisted custom set without its capability", async () => {
    const value = normalizeKisakiInput({
      tool: "temporary-files",
      temporaryFileExtensions: " .CUSTOM-TMP ; # ; .custom-tmp ",
    })
    expect(value.temporaryFileExtensions).toBe(".custom-tmp,#")

    const adapter = runtime()
    const result = await runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("temporary-files.custom-extensions") })
    expect(adapter.scanBasic).not.toHaveBeenCalled()

    adapter.capabilities = ["temporary-files.custom-extensions"]
    await expect(runKisaki({ ...value, includedDirectories: ["D:/"] }, adapter)).resolves.toMatchObject({ success: true })
  })

  test("requires the bad-name scanner capability before entering the native adapter", async () => {
    const adapter = runtime()
    const rejected = await runKisaki({ tool: "bad-names", includedDirectories: ["D:/"] }, adapter)
    expect(rejected).toMatchObject({ success: false, message: expect.stringContaining("scan.bad-names") })
    expect(adapter.scanBasic).not.toHaveBeenCalled()

    adapter.capabilities = ["scan.bad-names"]
    await expect(runKisaki({ tool: "bad-names", includedDirectories: ["D:/"] }, adapter)).resolves.toMatchObject({ success: true })
    expect(adapter.scanBasic).toHaveBeenCalledOnce()
  })

  test("requires the EXIF scanner capability before entering the native adapter", async () => {
    const adapter = runtime()
    const rejected = await runKisaki({ tool: "exif-remover", includedDirectories: ["D:/"] }, adapter)
    expect(rejected).toMatchObject({ success: false, message: expect.stringContaining("scan.exif-remover") })
    expect(adapter.scanExif).not.toHaveBeenCalled()

    adapter.capabilities = ["scan.exif-remover"]
    const scanned = await runKisaki({ tool: "exif-remover", includedDirectories: ["D:/"] }, adapter)
    expect(scanned).toMatchObject({ success: true, data: { entries: [expect.objectContaining({ exifTags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] })] } })
    expect(adapter.scanExif).toHaveBeenCalledOnce()
  })

  test("clamps cache thresholds and trims custom folders", () => {
    const value = normalizeKisakiInput({ cacheFolderPath: "  D:/cache  ", configFolderPath: " D:/config ", duplicateMinimalHashCacheSizeKiB: 0, duplicateMinimalPrehashCacheSizeKiB: 2_000_000 })
    expect(value.cacheFolderPath).toBe("D:/cache")
    expect(value.configFolderPath).toBe("D:/config")
    expect(value.duplicateMinimalHashCacheSizeKiB).toBe(1)
    expect(value.duplicateMinimalPrehashCacheSizeKiB).toBe(1024 * 1024)
  })

  test("maps duplicate groups and reclaimable bytes", async () => {
    const result = await runKisaki({ includedDirectories: ["D:/"] }, runtime())
    expect(result.success).toBe(true)
    expect(result.data?.groupCount).toBe(1)
    expect(result.data?.reclaimableBytes).toBe(12)
  })

  test("forwards continuous native progress as bounded node events", async () => {
    const adapter = runtime()
    vi.mocked(adapter.scanDuplicates).mockImplementation(async (_input, onProgress) => {
      onProgress?.({ stage: "hashFiles", stageIndex: 1, stageCount: 3, entriesChecked: 25, entriesTotal: 100, bytesChecked: 0, bytesTotal: 0 })
      return { groups: [], messages: "ok", stopped: false }
    })
    const events: Array<{ progress?: number; message?: string }> = []
    await runKisaki({ includedDirectories: ["D:/"] }, adapter, (event) => events.push(event))
    expect(events).toContainEqual(expect.objectContaining({ progress: 43, message: "hash Files 25/100" }))
    expect(events.at(-1)).toMatchObject({ progress: 100, message: "Finished duplicate-files." })
  })

  test("honors cancellation before entering native code", async () => {
    const adapter = runtime()
    adapter.isCancelled = () => true
    adapter.waitWhilePaused = vi.fn(async () => undefined)
    const result = await runKisaki({ includedDirectories: ["D:/"] }, adapter)
    expect(adapter.waitWhilePaused).toHaveBeenCalledOnce()
    expect(adapter.scanDuplicates).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, data: { stopped: true } })
  })

  test("preserves partial results from a stopped native scan", async () => {
    const adapter = runtime()
    vi.mocked(adapter.scanDuplicates).mockResolvedValue({ groups: [{ files: [{ path: "D:/partial.bin", size: 12, modifiedDate: 1 }] }], messages: "stopped", stopped: true })
    const result = await runKisaki({ includedDirectories: ["D:/"] }, adapter)
    expect(result).toMatchObject({ success: false, data: { stopped: true, fileCount: 1 } })
    expect(result.message).toContain("retained 1 partial")
  })

  test("applies the fork minimum duplicate group size in TypeScript", async () => {
    const result = await runKisaki({ includedDirectories: ["D:/"], duplicateMinimumGroupSize: 3 }, runtime())
    expect(result.data?.groups).toEqual([])
  })

  test("routes all non-duplicate tool families", async () => {
    const basic = runtime(), media = runtime()
    await runKisaki({ tool: "empty-files", includedDirectories: ["D:/"] }, basic)
    await runKisaki({ tool: "similar-images", includedDirectories: ["D:/"] }, media)
    expect(basic.scanBasic).toHaveBeenCalledOnce()
    expect(media.scanMedia).toHaveBeenCalledOnce()
  })

  test("attaches thresholded similar-folder statistics to the shared result", async () => {
    const result = await runKisaki({ tool: "similar-images", includedDirectories: ["D:/"], similarImagesFolderThreshold: 2 }, runtime())
    expect(result.data?.similarFolders).toEqual([{ path: "D:", count: 2, bytes: 41, groupCount: 1, previewPath: "D:/a.jpg" }])
    const hidden = await runKisaki({ tool: "similar-images", includedDirectories: ["D:/"], similarImagesFolderThreshold: 3 }, runtime())
    expect(hidden.data?.similarFolders).toEqual([])
  })

  test("runs the Simiu set extension through Kisaki's image scanner", async () => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockResolvedValue(false)
    vi.mocked(adapter.listDirectory).mockImplementation(async (path) => path === "D:/library" ? [
      { path: "D:/library/a.jpg", isFile: true, isDirectory: false },
      { path: "D:/library/b.jpg", isFile: true, isDirectory: false },
      { path: "D:/library/c.jpg", isFile: true, isDirectory: false },
    ] : [])
    vi.mocked(adapter.scanMedia).mockResolvedValue({
      groups: [{ entries: [
        { path: "D:/library/a.jpg", size: 20, modifiedDate: 1, width: 100, height: 80 },
        { path: "D:/library/b.jpg", size: 21, modifiedDate: 1, width: 100, height: 80 },
      ] }],
      messages: "ok",
      stopped: false,
    })
    const result = await runKisaki({
      tool: "similar-images",
      includedDirectories: ["D:/library"],
      simiuSetsEnabled: true,
      similarImagesHashAlgorithm: "double-gradient",
      similarity: 40,
    }, adapter)

    expect(result).toMatchObject({ success: true, data: { groupCount: 1, simiuSets: { directoryCount: 1, imageCount: 3, operations: expect.arrayContaining([expect.objectContaining({ targetPath: "D:/library/simiu_set__set_001/a.jpg" })]) } } })
    expect(adapter.scanMedia).toHaveBeenCalledWith(expect.objectContaining({
      tool: "similar-images",
      includedDirectories: ["D:/library"],
      recursive: false,
      similarity: 40,
      similarImagesHashAlgorithm: "double-gradient",
    }), expect.any(Function))
    expect(adapter.scanMedia).toHaveBeenCalledTimes(1)
  })

  test("keeps destructive actions dry-run by default", async () => {
    const adapter = runtime()
    const result = await runKisaki({ action: "delete", selectedPaths: ["D:/a.bin"] }, adapter)
    expect(result.data?.entries[0]?.status).toBe("planned")
    expect(adapter.removePath).not.toHaveBeenCalled()
  })

  test("uses the recycle bin for live deletion and preserves empty-folder semantics", async () => {
    const adapter = runtime()
    const result = await runKisaki({ action: "delete", tool: "empty-folders", selectedPaths: ["D:/empty"], dryRun: false }, adapter)
    expect(result.data?.entries[0]).toMatchObject({ operation: "trash", status: "trashed" })
    expect(adapter.removePath).toHaveBeenCalledWith("D:/empty", { trash: true, emptyFoldersOnly: true })
  })

  test("supports permanent deletion explicitly", async () => {
    const adapter = runtime()
    await runKisaki({ action: "delete", selectedPaths: ["D:/a.bin"], deleteMode: "permanent", dryRun: false }, adapter)
    expect(adapter.removePath).toHaveBeenCalledWith("D:/a.bin", { trash: false, emptyFoldersOnly: false })
  })

  test("copies files while preserving their root-relative structure", async () => {
    const adapter = runtime()
    const result = await runKisaki({ action: "move", selectedPaths: ["D:/album/a.jpg"], destinationDirectory: "E:/archive", copyMode: true, preserveStructure: true, dryRun: false }, adapter)
    expect(adapter.copyPath).toHaveBeenCalledWith("D:/album/a.jpg", "E:/archive/album/a.jpg")
    expect(result.data?.entries[0]).toMatchObject({ secondaryPath: "E:/archive/album/a.jpg", operation: "copy", status: "copied" })
  })

  test.each(["skip", "error"] as const)("reports an existing target with the %s policy", async (conflictPolicy) => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockResolvedValue(true)
    const result = await runKisaki({ action: "move", selectedPaths: ["D:/a.bin"], destinationDirectory: "E:/archive", conflictPolicy, dryRun: false }, adapter)
    expect(result.data?.entries[0]?.status).toBe(conflictPolicy === "skip" ? "skipped" : "error")
    expect(adapter.movePath).not.toHaveBeenCalled()
  })

  test("overwrites an existing target before moving", async () => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockResolvedValue(true)
    await runKisaki({ action: "move", selectedPaths: ["D:/a.bin"], destinationDirectory: "E:/archive", conflictPolicy: "overwrite", dryRun: false }, adapter)
    expect(adapter.removePath).toHaveBeenCalledWith("E:/archive/a.bin", { trash: false })
    expect(adapter.movePath).toHaveBeenCalledWith("D:/a.bin", "E:/archive/a.bin")
  })

  test("finds a numbered target for rename conflicts during dry-run", async () => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockImplementation(async (path) => path.endsWith("a.bin") || path.endsWith("a (1).bin"))
    const result = await runKisaki({ action: "move", selectedPaths: ["D:/a.bin"], destinationDirectory: "E:/archive", conflictPolicy: "rename" }, adapter)
    expect(result.data?.entries[0]).toMatchObject({ secondaryPath: "E:/archive/a (2).bin", status: "planned" })
  })

  test("reserves targets across a batch and renames duplicate basenames", async () => {
    const adapter = runtime()
    const result = await runKisaki({ action: "move", selectedPaths: ["D:/one/a.bin", "D:/two/a.bin"], destinationDirectory: "E:/archive", conflictPolicy: "rename" }, adapter)
    expect(result.data?.entries.map((entry) => entry.secondaryPath)).toEqual(["E:/archive/a.bin", "E:/archive/a (1).bin"])
  })

  test("executes one shared move plan with per-item destination folders", async () => {
    const adapter = runtime()
    const result = await runKisaki({ action: "move", destinationItems: [{ path: "D:/one/a.bin", destination: "E:/group-1" }, { path: "D:/two/b.bin", destination: "F:/group-2" }], copyMode: true, dryRun: false }, adapter)
    expect(result.data?.entries.map((entry) => entry.secondaryPath)).toEqual(["E:/group-1/a.bin", "F:/group-2/b.bin"])
    expect(adapter.copyPath).toHaveBeenNthCalledWith(1, "D:/one/a.bin", "E:/group-1/a.bin")
    expect(adapter.copyPath).toHaveBeenNthCalledWith(2, "D:/two/b.bin", "F:/group-2/b.bin")
  })

  test("keeps detailed per-item success and error results", async () => {
    const adapter = runtime()
    vi.mocked(adapter.movePath).mockRejectedValueOnce(new Error("locked")).mockResolvedValueOnce(undefined)
    const result = await runKisaki({ action: "move", selectedPaths: ["D:/a.bin", "D:/b.bin"], destinationDirectory: "E:/archive", dryRun: false }, adapter)
    expect(result.success).toBe(false)
    expect(result.data?.entries.map(({ path, secondaryPath, status, error }) => ({ path, secondaryPath, status, error }))).toEqual([
      { path: "D:/a.bin", secondaryPath: "E:/archive/a.bin", status: "error", error: "locked" },
      { path: "D:/b.bin", secondaryPath: "E:/archive/b.bin", status: "moved", error: undefined },
    ])
  })

  test("plans and executes per-item extension corrections with conflict checks", async () => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockImplementation(async (path) => path === "D:/photo.bin")
    const planned = await runKisaki({ action: "rename", renameItems: [{ path: "D:/photo.bin", properExtension: ".jpg" }] }, adapter)
    expect(planned.data?.entries[0]).toMatchObject({ path: "D:/photo.bin", secondaryPath: "D:/photo.jpg", properExtension: "jpg", operation: "rename", status: "planned" })
    const executed = await runKisaki({ action: "rename", renameItems: [{ path: "D:/photo.bin", properExtension: "jpg" }], dryRun: false }, adapter)
    expect(executed.data?.entries[0]?.status).toBe("renamed")
    expect(adapter.movePath).toHaveBeenCalledWith("D:/photo.bin", "D:/photo.jpg")
  })

  test("plans and executes proposed bad-name corrections through the shared rename contract", async () => {
    const adapter = runtime()
    vi.mocked(adapter.pathExists).mockImplementation(async (path) => path === "D:/report-🙂.TXT")

    const planned = await runKisaki({ action: "rename", tool: "bad-names", renameItems: [{ path: "D:/report-🙂.TXT", targetName: "report-.txt" }] }, adapter)
    expect(planned.data?.entries[0]).toMatchObject({ secondaryPath: "D:/report-.txt", operation: "rename", status: "planned" })

    const executed = await runKisaki({ action: "rename", tool: "bad-names", renameItems: [{ path: "D:/report-🙂.TXT", targetName: "report-.txt" }], dryRun: false }, adapter)
    expect(executed.data?.entries[0]?.status).toBe("renamed")
    expect(adapter.movePath).toHaveBeenCalledWith("D:/report-🙂.TXT", "D:/report-.txt")
  })

  test("plans EXIF cleanup before creating a candidate, then delegates safe replacement", async () => {
    const adapter = runtime()
    adapter.capabilities = ["operation.exif.candidate"]
    const exifItems = [{ path: "D:/photo.jpg", tags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }]

    const planned = await runKisaki({ action: "clean-exif", tool: "exif-remover", exifItems }, adapter)
    expect(planned.data?.entries[0]).toMatchObject({ operation: "clean-exif", status: "planned", secondaryPath: "D:/photo.jpg" })
    expect(adapter.createExifCandidate).not.toHaveBeenCalled()

    const executed = await runKisaki({ action: "clean-exif", tool: "exif-remover", exifItems, dryRun: false }, adapter)
    expect(executed.data?.entries[0]).toMatchObject({ operation: "clean-exif", status: "cleaned", secondaryPath: "D:/photo.jpg" })
    expect(adapter.createExifCandidate).toHaveBeenCalledWith("D:/photo.jpg", exifItems[0]!.tags)
    expect(adapter.replaceWithCandidate).toHaveBeenCalledWith("D:/candidates/photo.jpg", "D:/photo.jpg")
  })

  test("retains the EXIF candidate path in the operation detail when replacement fails", async () => {
    const adapter = runtime()
    adapter.capabilities = ["operation.exif.candidate"]
    vi.mocked(adapter.replaceWithCandidate).mockRejectedValueOnce(new Error("move failed"))

    const result = await runKisaki({
      action: "clean-exif",
      tool: "exif-remover",
      dryRun: false,
      exifItems: [{ path: "D:/photo.jpg", tags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }],
    }, adapter)

    expect(result).toMatchObject({ success: false, data: { entries: [expect.objectContaining({ status: "error", secondaryPath: "D:/candidates/photo.jpg", detail: "Candidate retained at D:/candidates/photo.jpg." })] } })
  })

  test("capability-gates video optimizer scans and keeps live replacement behind a candidate", async () => {
    const adapter = runtime()
    const scanned = await runKisaki({ tool: "video-optimizer", includedDirectories: ["D:/videos"] }, adapter)
    expect(scanned).toMatchObject({ success: false, message: expect.stringContaining("scan.video-optimizer") })
    expect(adapter.scanVideoOptimizer).not.toHaveBeenCalled()

    adapter.capabilities = ["scan.video-optimizer", "operation.video-optimizer.candidate"]
    await expect(runKisaki({ tool: "video-optimizer", includedDirectories: ["D:/videos"] }, adapter)).resolves.toMatchObject({ success: true, data: { entries: [expect.objectContaining({ codec: "h264" })] } })

    const item = { path: "D:/video.mp4", codec: "h264" }
    const options = { action: "optimize-video" as const, tool: "video-optimizer" as const, videoOptimizerItems: [item], videoOptimizerNoiseReduction: "hqdn3d" as const, videoOptimizerNoiseReductionStrength: 7 }
    const planned = await runKisaki(options, adapter)
    expect(planned.data?.entries[0]).toMatchObject({ operation: "optimize-video", status: "planned", detail: "Transcode as h265 at quality 23 with HQDN3D strength 7" })
    expect(adapter.createVideoOptimizerCandidate).not.toHaveBeenCalled()

    const executed = await runKisaki({ ...options, dryRun: false }, adapter)
    expect(executed.data?.entries[0]).toMatchObject({ operation: "optimize-video", status: "optimized", secondaryPath: "D:/video.mp4" })
    expect(adapter.createVideoOptimizerCandidate).toHaveBeenCalledWith(item, expect.objectContaining({ videoOptimizerTargetCodec: "h265", videoOptimizerFailIfNotSmaller: true, videoOptimizerNoiseReduction: "hqdn3d", videoOptimizerNoiseReductionStrength: 7 }))
    expect(adapter.replaceWithCandidate).toHaveBeenCalledWith("D:/candidates/video.mp4", "D:/video.mp4")
  })

  test("requires a scanned crop rectangle before planning a crop candidate", async () => {
    const adapter = runtime()
    adapter.capabilities = ["operation.video-optimizer.candidate"]
    const result = await runKisaki({ action: "optimize-video", tool: "video-optimizer", videoOptimizerMode: "crop", videoOptimizerItems: [{ path: "D:/video.mp4", codec: "h264" }] }, adapter)
    expect(result.data?.entries[0]).toMatchObject({ status: "error", error: "No scanned crop rectangle is available for this path." })
    expect(adapter.createVideoOptimizerCandidate).not.toHaveBeenCalled()
  })

  test("reports extension target conflicts and invalid extensions per item", async () => {
    const conflictRuntime = runtime()
    vi.mocked(conflictRuntime.pathExists).mockResolvedValue(true)
    const conflict = await runKisaki({ action: "rename", renameItems: [{ path: "D:/photo.bin", properExtension: "jpg" }] }, conflictRuntime)
    expect(conflict.data?.entries[0]).toMatchObject({ status: "skipped", error: "Target already exists." })
    const invalid = await runKisaki({ action: "rename", renameItems: [{ path: "D:/photo.bin", properExtension: "bad/ext" }] }, runtime())
    expect(invalid.data?.entries[0]).toMatchObject({ status: "error", error: "Invalid proper extension." })
  })

  test("exports full result fields to structured JSON and CSV", async () => {
    const entry = { id: "media:1", groupId: 4, path: "D:/photo.bin", name: "photo.bin", size: 42, modifiedDate: 123, properExtension: "jpg", width: 800, height: 600, similarity: "2", detail: "bad extension" }
    const jsonRuntime = runtime()
    await runKisaki({ action: "save", tool: "bad-extensions", outputPath: "D:/result.json", exportScope: "visible", exportEntries: [entry], dryRun: false }, jsonRuntime)
    const json = JSON.parse(vi.mocked(jsonRuntime.writeText).mock.calls[0]![1]) as { tool: string; scope: string; entries: Array<Record<string, unknown>> }
    expect(json).toMatchObject({ tool: "bad-extensions", scope: "visible", entries: [{ path: "D:/photo.bin", size: 42, properExtension: "jpg", width: 800, operation: "save", status: "saved" }] })
    const csvRuntime = runtime()
    await runKisaki({ action: "save", outputPath: "D:/result.csv", outputFormat: "csv", exportEntries: [entry], dryRun: false }, csvRuntime)
    const csvContent = vi.mocked(csvRuntime.writeText).mock.calls[0]![1]
    expect(csvContent).toContain("groupId,path,name,size,modifiedDate")
    expect(csvContent).toContain('"jpg"')
    expect(csvContent).toContain('"bad extension"')
  })

  test("filters and sorts in TypeScript", () => {
    const groups = [{ id: 0, totalBytes: 3, reclaimableBytes: 1, entries: [
      { id: "a", groupId: 0, path: "D:/z.jpg", name: "z.jpg", size: 1, modifiedDate: 2 },
      { id: "b", groupId: 0, path: "D:/a.png", name: "a.png", size: 2, modifiedDate: 1 },
    ] }]
    const result = filterAndSortGroups(groups, { filterText: ".png", sortBy: "path", descending: false })
    expect(result[0]?.entries.map((entry) => entry.name)).toEqual(["a.png"])
  })

  test("migrates group smart-selection behavior", () => {
    const groups = [{ id: 0, totalBytes: 6, reclaimableBytes: 3, entries: [
      { id: "a", groupId: 0, path: "D:/small.bin", name: "small.bin", size: 1, modifiedDate: 1 },
      { id: "b", groupId: 0, path: "D:/large.bin", name: "large.bin", size: 5, modifiedDate: 2 },
    ] }]
    expect(smartSelect(groups, "all-except-biggest")).toEqual(["D:/small.bin"])
    expect(smartSelect(groups, "all-except-oldest")).toEqual(["D:/large.bin"])
  })

  test("always preserves reference entries", () => {
    const groups = [{ id: 0, totalBytes: 6, reclaimableBytes: 5, entries: [
      { id: "ref", groupId: 0, path: "D:/reference.bin", name: "reference.bin", size: 1, modifiedDate: 1, isReference: true },
      { id: "candidate", groupId: 0, path: "D:/candidate.bin", name: "candidate.bin", size: 5, modifiedDate: 2 },
    ] }]
    expect(smartSelect(groups, "all-except-newest")).toEqual(["D:/candidate.bin"])
  })
})
