import { describe, expect, test, vi } from "vitest"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { KISAKI_TOOLS, normalizeKisakiInput, type KisakiTool } from "./core.js"
import { createNodeKisakiRuntime, toBasicScanOptions, toDuplicateScanOptions, toExifScanOptions, toMediaScanOptions, toVideoOptimizerScanOptions } from "./platform.js"
import { createKisakiScanInput } from "./tool-options.js"

describe("Kisaki native DTO mapping", () => {
  test.each(KISAKI_TOOLS)("maps shared scan fields for %s", (tool) => {
    const input = normalizeKisakiInput(createKisakiScanInput(tool, {
      includedDirectories: ["D:/library", "D:/reference"],
      includedDirectoriesReferenced: ["D:/reference"],
      excludedDirectories: ["D:/excluded"],
      excludedItems: ["*/cache/*"],
      allowedExtensions: "jpg,png",
      excludedExtensions: "tmp",
      minimumFileSize: 123,
      maximumFileSize: 456_789,
      recursive: false,
      useCache: false,
      saveAlsoAsJson: true,
      deleteOutdatedCache: false,
    }))
    expect(nativeOptions(tool, input)).toMatchObject({
      includedDirectories: ["D:/library", "D:/reference"],
      referenceDirectories: ["D:/reference"],
      excludedDirectories: ["D:/excluded"],
      excludedItems: ["*/cache/*"],
      allowedExtensions: "jpg,png",
      excludedExtensions: "tmp",
      minimumFileSize: 123,
      maximumFileSize: 456_789,
      recursive: false,
      useCache: false,
      saveAlsoAsJson: true,
      deleteOutdatedCache: false,
    })
  })

  test("maps cache controls for every native family and converts duplicate KiB", () => {
    const input = normalizeKisakiInput({ tool: "duplicate-files", saveAlsoAsJson: true, deleteOutdatedCache: false, duplicateMinimalHashCacheSizeKiB: 12, duplicateMinimalPrehashCacheSizeKiB: 3 })
    expect(toDuplicateScanOptions(input)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: false, minimalCacheFileSize: 12 * 1024, minimalPrehashCacheFileSize: 3 * 1024 })
    const basic = normalizeKisakiInput({ tool: "empty-files", saveAlsoAsJson: true, deleteOutdatedCache: false })
    expect(toBasicScanOptions(basic)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: false })
    const media = normalizeKisakiInput({ tool: "similar-images", saveAlsoAsJson: true, deleteOutdatedCache: false })
    expect(toMediaScanOptions(media)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: false })
    const exif = normalizeKisakiInput({ tool: "exif-remover", saveAlsoAsJson: true, deleteOutdatedCache: false })
    expect(toExifScanOptions(exif)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: false })
    const optimizer = normalizeKisakiInput({ tool: "video-optimizer", saveAlsoAsJson: true, deleteOutdatedCache: false })
    expect(toVideoOptimizerScanOptions(optimizer)).toMatchObject({ mode: "transcode", saveAlsoAsJson: true, deleteOutdatedCache: false })
  })

  test("maps every Czkawka 12 empty-file content checker into the native basic DTO", () => {
    const input = normalizeKisakiInput({
      tool: "empty-files",
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })
    expect(toBasicScanOptions(input)).toMatchObject({
      tool: "empty-files",
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })
  })

  test("maps Czkawka 12 custom temporary suffixes into the native basic DTO", () => {
    const input = normalizeKisakiInput({ tool: "temporary-files", temporaryFileExtensions: ".xiranite-tmp,#" })
    expect(toBasicScanOptions(input)).toMatchObject({
      tool: "temporary-files",
      temporaryFileExtensions: ".xiranite-tmp,#",
    })
  })

  test("maps every Czkawka 12 broken-file checker into the native media DTO", () => {
    const input = normalizeKisakiInput({
      tool: "broken-files",
      brokenAudio: false,
      brokenPdf: false,
      brokenArchive: false,
      brokenImage: false,
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })
    expect(toMediaScanOptions(input)).toMatchObject({
      tool: "broken-files",
      brokenAudio: false,
      brokenPdf: false,
      brokenArchive: false,
      brokenImage: false,
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })
  })

  test("locks native cache/config environment after first scan configuration", async () => {
    const first = normalizeKisakiInput({ cacheFolderPath: "D:/cache-a", configFolderPath: "D:/config-a" })
    const second = normalizeKisakiInput({ cacheFolderPath: "D:/cache-b", configFolderPath: "D:/config-b" })
    const { configureKisakiCacheEnvironment } = await import("./platform.js")
    configureKisakiCacheEnvironment(first)
    expect(() => configureKisakiCacheEnvironment(second)).toThrow(/restart/i)
  })

  test.each([
    ["duplicate-files", { checkMethod: "size-and-name", hashType: "xxh3", duplicateMinimumGroupSize: 4, caseSensitiveNames: true, ignoreHardLinks: false, usePrehash: false }, { checkMethod: "size-and-name", hashType: "xxh3", caseSensitiveNames: true, ignoreHardLinks: false, usePrehash: false }],
    ["empty-folders", {}, { tool: "empty-folders" }],
    ["big-files", { numberOfFiles: 321, biggestFirst: false }, { tool: "big-files", numberOfFiles: 321, biggestFirst: false }],
    ["empty-files", {}, { tool: "empty-files" }],
    ["temporary-files", {}, { tool: "temporary-files" }],
    ["bad-names", {}, { tool: "bad-names" }],
    ["similar-images", { similarity: 7, similarImagesHashSize: 64, similarImagesHashAlgorithm: "double-gradient", similarImagesResizeAlgorithm: "catmull-rom", similarImagesIgnoreSameSize: true, similarImagesIgnoreSameResolution: true, similarImagesGeometricInvariance: "mirror-flip", similarImagesFolderThreshold: 5 }, { tool: "similar-images", similarity: 7, imageHashSize: 64, imageHashAlgorithm: "double-gradient", imageResizeAlgorithm: "catmull-rom", imageIgnoreSameSize: true, imageIgnoreSameResolution: true, imageGeometricInvariance: "mirror-flip" }],
    ["similar-videos", { similarity: 8, similarVideosIgnoreSameSize: true, similarVideosIgnoreSameResolution: true, similarVideosSkipForward: 45, similarVideosHashDuration: 20, similarVideosLetterboxCrop: false, similarVideosWindowCount: 12, similarVideosDurationTolerancePct: 35, similarVideosMinMatchingWindows: 0.75, similarVideosSubclipMinMatch: 0.4, similarVideosCheckAudioContent: true }, { tool: "similar-videos", similarity: 8, videoIgnoreSameSize: true, videoIgnoreSameResolution: true, videoSkipForward: 45, videoHashDuration: 20, videoCropDetect: "none", videoWindowCount: 12, videoDurationTolerancePct: 35, videoMinMatchingWindows: 0.75, videoSubclipMinMatch: 0.4, videoCheckAudioContent: true }],
    ["duplicate-music", { musicCheckType: "fingerprint", musicApproximateComparison: false, musicCompareTitle: false, musicCompareArtist: true, musicCompareBitrate: true, musicCompareGenre: true, musicCompareYear: true, musicCompareLength: true, musicMaximumDifference: 4, musicMinimumFragmentDuration: 30, musicCompareFingerprintsOnlyWithSimilarTitles: false }, { tool: "duplicate-music", musicCheckType: "fingerprint", musicApproximateComparison: false, musicCompareTitle: false, musicCompareArtist: true, musicCompareBitrate: true, musicCompareGenre: true, musicCompareYear: true, musicCompareLength: true, musicMaximumDifference: 4, musicMinimumFragmentDuration: 30, musicCompareFingerprintsOnlyWithSimilarTitles: false }],
    ["invalid-symlinks", {}, { tool: "invalid-symlinks" }],
    ["broken-files", { brokenAudio: false, brokenPdf: true, brokenArchive: false, brokenImage: true }, { tool: "broken-files", brokenAudio: false, brokenPdf: true, brokenArchive: false, brokenImage: true }],
    ["bad-extensions", {}, { tool: "bad-extensions" }],
    ["video-optimizer", { videoOptimizerMode: "crop", videoOptimizerExcludedCodecs: "h264,hevc", videoOptimizerBlackPixelThreshold: 20, videoOptimizerBlackBarMinPercentage: 88, videoOptimizerMaxSamples: 80, videoOptimizerMinCropSize: 9 }, { mode: "crop", excludedCodecs: "h264,h265", blackPixelThreshold: 20, blackBarMinPercentage: 88, maxSamples: 80, minCropSize: 9 }],
  ] as const)("maps the complete %s contract into its native family DTO", (tool, values, expected) => {
    const input = normalizeKisakiInput(createKisakiScanInput(tool, { includedDirectories: ["D:/library"], ...values }))
    expect(nativeOptions(tool, input)).toMatchObject(expected)
  })

  test("maps duplicate-specific settings without leaking workflow fields", () => {
    const value = normalizeKisakiInput({
      tool: "duplicate-files",
      includedDirectories: ["D:/library"],
      includedDirectoriesReferenced: ["D:/library/reference"],
      checkMethod: "size-and-name",
      hashType: "xxh3",
      caseSensitiveNames: true,
      usePrehash: false,
    })
    expect(toDuplicateScanOptions(value)).toMatchObject({
      includedDirectories: ["D:/library"],
      referenceDirectories: ["D:/library/reference"],
      checkMethod: "size-and-name",
      hashType: "xxh3",
      caseSensitiveNames: true,
      usePrehash: false,
    })
    expect(toDuplicateScanOptions(value)).not.toHaveProperty("destinationDirectory")
  })

  test("maps big-file direction and limit", () => {
    const value = normalizeKisakiInput({ tool: "big-files", numberOfFiles: 120, biggestFirst: false })
    expect(toBasicScanOptions(value)).toMatchObject({ tool: "big-files", numberOfFiles: 120, biggestFirst: false })
  })

  test("maps every fork media algorithm setting", () => {
    const value = normalizeKisakiInput({
      tool: "duplicate-music",
      minimumFileSize: 100,
      maximumFileSize: 2_000,
      similarImagesHashSize: 64,
      similarImagesHashAlgorithm: "double-gradient",
      similarImagesResizeAlgorithm: "catmull-rom",
      similarImagesIgnoreSameSize: true,
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
      similarVideosIgnoreSameSize: true,
      similarVideosIgnoreSameResolution: true,
      similarVideosSkipForward: 45,
      similarVideosHashDuration: 20,
      similarVideosCropDetect: "motion",
      similarVideosWindowCount: 12,
      similarVideosDurationTolerancePct: 35,
      similarVideosMinMatchingWindows: 0.75,
      similarVideosSubclipMinMatch: 0.4,
      similarVideosCheckAudioContent: true,
      musicCheckType: "fingerprint",
      musicApproximateComparison: false,
      musicCompareTitle: false,
      musicCompareArtist: true,
      musicCompareBitrate: true,
      musicCompareGenre: true,
      musicCompareYear: true,
      musicCompareLength: true,
      musicMaximumDifference: 4,
      musicMinimumFragmentDuration: 30,
      musicCompareFingerprintsOnlyWithSimilarTitles: false,
      brokenAudio: false,
      brokenPdf: true,
      brokenArchive: false,
      brokenImage: true,
    })
    expect(toMediaScanOptions(value)).toMatchObject({
      minimumFileSize: 100,
      maximumFileSize: 2_000,
      imageHashSize: 64,
      imageHashAlgorithm: "double-gradient",
      imageResizeAlgorithm: "catmull-rom",
      imageIgnoreSameSize: true,
      imageIgnoreSameResolution: true,
      imageGeometricInvariance: "mirror-flip-rotate-90",
      videoIgnoreSameSize: true,
      videoIgnoreSameResolution: true,
      videoSkipForward: 45,
      videoHashDuration: 20,
      videoCropDetect: "letterbox",
      videoWindowCount: 12,
      videoDurationTolerancePct: 35,
      videoMinMatchingWindows: 0.75,
      videoSubclipMinMatch: 0.4,
      videoCheckAudioContent: true,
      musicCheckType: "fingerprint",
      musicApproximateComparison: false,
      musicCompareTitle: false,
      musicCompareArtist: true,
      musicCompareBitrate: true,
      musicCompareGenre: true,
      musicCompareYear: true,
      musicCompareLength: true,
      musicMaximumDifference: 4,
      musicMinimumFragmentDuration: 30,
      musicCompareFingerprintsOnlyWithSimilarTitles: false,
      brokenAudio: false,
      brokenPdf: true,
      brokenArchive: false,
      brokenImage: true,
    })
  })

  test("executes copy, move, existence, and permanent-delete primitives", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiranite-czkawka-"))
    const runtime = createNodeKisakiRuntime()
    try {
      const source = join(root, "source.txt")
      const copied = join(root, "nested", "copied.txt")
      const moved = join(root, "moved.txt")
      await writeFile(source, "payload", "utf8")
      await runtime.copyPath(source, copied)
      expect(await readFile(copied, "utf8")).toBe("payload")
      await runtime.movePath(copied, moved)
      expect(await runtime.pathExists(copied)).toBe(false)
      expect(await readFile(moved, "utf8")).toBe("payload")
      await runtime.removePath(moved, { trash: false })
      expect(await runtime.pathExists(moved)).toBe(false)
      const emptyTree = join(root, "empty", "nested")
      await mkdir(emptyTree, { recursive: true })
      await runtime.removePath(join(root, "empty"), { trash: false, emptyFoldersOnly: true })
      expect(await runtime.pathExists(join(root, "empty"))).toBe(false)
      const changedFolder = join(root, "changed")
      await mkdir(changedFolder)
      await writeFile(join(changedFolder, "new.txt"), "new", "utf8")
      await expect(runtime.removePath(changedFolder, { trash: false, emptyFoldersOnly: true })).rejects.toThrow("no longer empty")
      expect(await runtime.pathExists(changedFolder)).toBe(true)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test("delegates trash and permanent deletion to the scoped project file-operation service", async () => {
    const execute = vi.fn(async (request) => ({
      results: request.operations.map((operation, index) => ({ index, operation, status: "succeeded" as const })),
      succeeded: request.operations.length,
      failed: 0,
      cancelled: 0,
      undoable: 0,
    }))
    const runtime = createNodeKisakiRuntime({ fileOperations: { execute } })

    await runtime.removePath("D:/library/duplicate.jpg", { trash: true })
    await runtime.removePath("D:/library/permanent.tmp", { trash: false })

    expect(execute).toHaveBeenNthCalledWith(1, {
      operations: [{ kind: "trash", sourcePath: "D:/library/duplicate.jpg" }],
      concurrency: 1,
    })
    expect(execute).toHaveBeenNthCalledWith(2, {
      operations: [{ kind: "delete", sourcePath: "D:/library/permanent.tmp" }],
      concurrency: 1,
    })
  })

  test("replaces an EXIF candidate through ordered scoped file operations", async () => {
    const execute = vi.fn(async (request) => ({
      results: request.operations.map((operation, index) => ({ index, operation, status: "succeeded" as const })),
      succeeded: request.operations.length,
      failed: 0,
      cancelled: 0,
      undoable: 1,
    }))
    const runtime = createNodeKisakiRuntime({ fileOperations: { execute } })

    await runtime.replaceWithCandidate("D:/temp/photo-cleaned.jpg", "D:/photos/photo.jpg")

    expect(execute).toHaveBeenCalledWith({
      operations: [
        { kind: "trash", sourcePath: "D:/photos/photo.jpg" },
        { kind: "move", sourcePath: "D:/temp/photo-cleaned.jpg", destinationPath: "D:/photos/photo.jpg" },
      ],
      concurrency: 1,
    })
  })
})

function nativeOptions(tool: KisakiTool, input: ReturnType<typeof normalizeKisakiInput>) {
  if (tool === "duplicate-files") return toDuplicateScanOptions(input)
  if (tool === "exif-remover") return toExifScanOptions(input)
  if (tool === "video-optimizer") return toVideoOptimizerScanOptions(input)
  if (["empty-folders", "big-files", "empty-files", "temporary-files", "invalid-symlinks", "bad-names"].includes(tool)) return toBasicScanOptions(input)
  return toMediaScanOptions(input)
}
