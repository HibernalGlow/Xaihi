import { describe, expect, test } from "vitest"

import { KISAKI_TOOLS } from "./core.js"
import { help } from "./help.js"
import { createKisakiInteractionSchema } from "./interaction.js"
import { createKisakiOperationInput, createKisakiOptionHelpFields, createKisakiScanInput, KISAKI_CLI_VALUE_FLAGS, KISAKI_TOOL_OPTIONS, getKisakiGuiToolOptions, getKisakiToolOptions, parseKisakiCliOptions } from "./tool-options.js"

describe("shared Kisaki option schema", () => {
  test("keeps GUI-only Czkawka 12 options out of terminal surfaces", () => {
    const interactionIds = new Set(createKisakiInteractionSchema().fields.map((field) => field.id))
    const terminalOptions = KISAKI_TOOL_OPTIONS.filter((option) => option.cliFlag)
    expect(terminalOptions.every((option) => interactionIds.has(option.id))).toBe(true)
    expect(terminalOptions.filter((option) => option.kind !== "boolean").every((option) => KISAKI_CLI_VALUE_FLAGS.has(option.cliFlag!))).toBe(true)
    expect(interactionIds).not.toContain("similarImagesIgnoreSameResolution")
    expect(interactionIds).not.toContain("similarImagesGeometricInvariance")
    expect(interactionIds).not.toContain("similarVideosWindowCount")
    expect(interactionIds).not.toContain("similarVideosCheckAudioContent")
    expect(interactionIds).not.toContain("brokenVideoFfprobe")
    expect(interactionIds).not.toContain("brokenVideoFfmpeg")
    expect(interactionIds).not.toContain("brokenFont")
    expect(interactionIds).not.toContain("brokenMarkup")
    expect(interactionIds).not.toContain("emptyFilesSearchZeroByteContent")
    expect(interactionIds).not.toContain("emptyFilesSearchNonPrintableContent")
    expect(interactionIds).not.toContain("temporaryFileExtensions")
    expect(getKisakiGuiToolOptions("similar-images", new Set())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "similarImagesIgnoreSameResolution" }),
      expect.objectContaining({ id: "similarImagesGeometricInvariance" }),
    ]))
    expect(getKisakiGuiToolOptions("similar-images", new Set(["similar-images.geometric-invariance", "similar-images.same-resolution-exclusion"]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "similarImagesIgnoreSameResolution" }),
      expect.objectContaining({ id: "similarImagesGeometricInvariance" }),
    ]))
    expect(getKisakiGuiToolOptions("similar-videos", new Set())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "similarVideosIgnoreSameResolution" }),
      expect.objectContaining({ id: "similarVideosWindowCount" }),
      expect.objectContaining({ id: "similarVideosCheckAudioContent" }),
    ]))
    expect(getKisakiGuiToolOptions("similar-videos", new Set(["similar-videos.similario", "similar-videos.same-resolution-exclusion", "similar-videos.audio"]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "similarVideosIgnoreSameResolution" }),
      expect.objectContaining({ id: "similarVideosWindowCount", step: 1 }),
      expect.objectContaining({ id: "similarVideosMinMatchingWindows", step: 0.05 }),
      expect.objectContaining({ id: "similarVideosCheckAudioContent" }),
    ]))
    expect(getKisakiGuiToolOptions("broken-files", new Set())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "brokenVideoFfprobe" }),
      expect.objectContaining({ id: "brokenVideoFfmpeg" }),
      expect.objectContaining({ id: "brokenFont" }),
      expect.objectContaining({ id: "brokenMarkup" }),
    ]))
    expect(getKisakiGuiToolOptions("broken-files", new Set(["broken-files.multi-checker"]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "brokenVideoFfprobe", defaultValue: false }),
      expect.objectContaining({ id: "brokenVideoFfmpeg", defaultValue: false }),
      expect.objectContaining({ id: "brokenFont", defaultValue: false }),
      expect.objectContaining({ id: "brokenMarkup", defaultValue: false }),
    ]))
    expect(getKisakiGuiToolOptions("empty-files", new Set())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "emptyFilesSearchZeroByteContent" }),
      expect.objectContaining({ id: "emptyFilesSearchNonPrintableContent" }),
    ]))
    expect(getKisakiGuiToolOptions("empty-files", new Set(["empty-files.content-checkers"]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "emptyFilesSearchZeroByteContent", defaultValue: false }),
      expect.objectContaining({ id: "emptyFilesSearchNonPrintableContent", defaultValue: false }),
    ]))
    expect(getKisakiGuiToolOptions("temporary-files", new Set())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "temporaryFileExtensions" }),
    ]))
    expect(getKisakiGuiToolOptions("temporary-files", new Set(["temporary-files.custom-extensions"]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "temporaryFileExtensions", kind: "text" }),
    ]))
    expect(KISAKI_TOOLS.every((tool) => getKisakiToolOptions(tool).length > 0 || ["empty-folders", "empty-files", "temporary-files", "invalid-symlinks", "bad-extensions", "bad-names", "exif-remover"].includes(tool))).toBe(true)
  })

  test("parses legacy pipe CLI flags without taking ownership of Czkawka 12 GUI flags", () => {
    expect(parseKisakiCliOptions(["--image-hash", "double-gradient", "--image-hash-size", "64", "--image-ignore-same-size", "--image-ignore-same-resolution", "--image-geometric-invariance", "mirror-flip", "--no-prehash"])).toMatchObject({
      similarImagesHashAlgorithm: "double-gradient",
      similarImagesHashSize: 64,
      similarImagesIgnoreSameSize: true,
      usePrehash: false,
    })
  })

  test("accepts the legacy crop flag without writing its removed motion mode", () => {
    expect(parseKisakiCliOptions(["--video-crop", "motion"])).toEqual({ similarVideosLetterboxCrop: true })
    expect(parseKisakiCliOptions(["--video-crop", "motion", "--no-video-letterbox-crop"])).toEqual({ similarVideosLetterboxCrop: false })
    expect(KISAKI_CLI_VALUE_FLAGS.has("--video-crop")).toBe(true)
  })

  test("generates legacy CLI help and TUI fields only from terminal option definitions", () => {
    const interactionIds = new Set(createKisakiInteractionSchema().fields.map((field) => field.id))
    const helpFields = createKisakiOptionHelpFields("en")
    const terminalOptions = KISAKI_TOOL_OPTIONS.filter((definition) => definition.cliFlag)
    expect(help.fields).toEqual(helpFields)
    expect(helpFields).toHaveLength(terminalOptions.length)
    for (const [index, definition] of terminalOptions.entries()) {
      expect(interactionIds.has(definition.id)).toBe(true)
      expect(helpFields[index]).toMatchObject({ type: definition.kind, defaultValue: String(definition.defaultValue) })
      expect(helpFields[index]?.name).toContain(definition.cliFlag!)
      expect(helpFields[index]?.description).toContain(definition.label.en)
      expect(help.translations?.zh?.fields?.[index]?.description).toContain(definition.label.zh)
    }
  })

  test("round-trips every legacy CLI flag through the shared parser", () => {
    const args: string[] = []
    const expected: Record<string, unknown> = {}
    for (const definition of KISAKI_TOOL_OPTIONS.filter((definition) => definition.cliFlag)) {
      const cliFlag = definition.cliFlag!
      if (definition.kind === "boolean") {
        args.push(`--no-${cliFlag.slice(2)}`)
        expected[definition.id] = false
      } else {
        const value = definition.choices?.at(-1)?.value ?? String(definition.max ?? definition.defaultValue)
        args.push(cliFlag, value)
        expected[definition.id] = typeof definition.defaultValue === "number" ? Number(value) : value
      }
    }
    expect(parseKisakiCliOptions(args)).toEqual(expected)
  })

  test("builds the GUI scan contract for Czkawka 12 image settings", () => {
    expect(createKisakiScanInput("similar-images", {
      includedDirectoriesText: "D:/Images\nE:/Archive\nF:/Reference",
      includedDirectoriesReferencedText: "F:/Reference",
      excludedItemsText: "*/cache/*; *.part",
      minimumFileSize: "100",
      similarImagesHashSize: "64",
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
      saveAlsoAsJson: true,
      deleteOutdatedCache: false,
      cacheFolderPath: "D:/cache",
      duplicateMinimalHashCacheSizeKiB: "12",
    })).toMatchObject({
      action: "scan",
      tool: "similar-images",
      includedDirectories: ["D:/Images", "E:/Archive", "F:/Reference"],
      includedDirectoriesReferenced: ["F:/Reference"],
      excludedItems: ["*/cache/*", "*.part"],
      minimumFileSize: 100,
      similarImagesHashSize: 64,
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
      saveAlsoAsJson: true,
      deleteOutdatedCache: false,
      cacheFolderPath: "D:/cache",
      duplicateMinimalHashCacheSizeKiB: 12,
    })
  })

  test("builds the GUI-only similario scan contract without adding terminal flags", () => {
    expect(createKisakiScanInput("similar-videos", {
      includedDirectoriesText: "D:/Videos",
      similarVideosIgnoreSameResolution: true,
      similarVideosWindowCount: "12",
      similarVideosDurationTolerancePct: "35",
      similarVideosMinMatchingWindows: "0.75",
      similarVideosSubclipMinMatch: "0.4",
      similarVideosCheckAudioContent: true,
    })).toMatchObject({
      tool: "similar-videos",
      includedDirectories: ["D:/Videos"],
      similarVideosIgnoreSameResolution: true,
      similarVideosWindowCount: 12,
      similarVideosDurationTolerancePct: 35,
      similarVideosMinMatchingWindows: 0.75,
      similarVideosSubclipMinMatch: 0.4,
      similarVideosCheckAudioContent: true,
    })
  })

  test("builds the GUI-only broken-file scan contract without adding terminal flags", () => {
    expect(createKisakiScanInput("broken-files", {
      includedDirectoriesText: "D:/Library",
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })).toMatchObject({
      tool: "broken-files",
      includedDirectories: ["D:/Library"],
      brokenVideoFfprobe: true,
      brokenVideoFfmpeg: true,
      brokenFont: true,
      brokenMarkup: true,
    })
  })

  test("builds the GUI-only empty-file content scan contract without adding terminal flags", () => {
    expect(createKisakiScanInput("empty-files", {
      includedDirectoriesText: "D:/Library",
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })).toMatchObject({
      tool: "empty-files",
      includedDirectories: ["D:/Library"],
      emptyFilesSearchZeroByteContent: true,
      emptyFilesSearchNonPrintableContent: true,
    })
  })

  test("builds the GUI-only temporary suffix contract without adding terminal flags", () => {
    expect(createKisakiScanInput("temporary-files", {
      includedDirectoriesText: "D:/Library",
      temporaryFileExtensions: ".xiranite-tmp,#",
    })).toMatchObject({
      tool: "temporary-files",
      includedDirectories: ["D:/Library"],
      temporaryFileExtensions: ".xiranite-tmp,#",
    })
  })

  test("preserves fork list syntax for paths, rules, references, and extension tokens", () => {
    expect(createKisakiScanInput("duplicate-files", {
      includedDirectoriesText: '\u2068"D:/Photos"\u2069;E:/Archive,D:/Photos',
      includedDirectoriesReferencedText: "E:/Archive;Z:/missing",
      excludedDirectoriesText: '"D:/Photos/cache",E:/Archive/tmp',
      excludedItemsText: "*/cache/*,*.part;DEFAULT",
      allowedExtensions: ".jpg;png\nIMAGE,jpg",
      excludedExtensions: ".tmp;bak",
    })).toMatchObject({
      includedDirectories: ["D:/Photos", "E:/Archive"],
      includedDirectoriesReferenced: ["E:/Archive"],
      excludedDirectories: ["D:/Photos/cache", "E:/Archive/tmp"],
      excludedItems: ["*/cache/*", "*.part", "DEFAULT"],
      allowedExtensions: "jpg,png,IMAGE",
      excludedExtensions: "tmp,bak",
    })
  })

  test("builds one operation contract for GUI, CLI, and TUI", () => {
    expect(createKisakiOperationInput("move", {
      tool: "similar-images",
      selectedPathsText: "D:/one/a.jpg\nD:/two/b.jpg",
      destinationDirectory: "E:/Review",
      destinationItems: [],
      renameItems: [],
      copyMode: true,
      preserveStructure: true,
      conflictPolicy: "rename",
      dryRun: false,
    })).toEqual({
      action: "move",
      tool: "similar-images",
      selectedPaths: ["D:/one/a.jpg", "D:/two/b.jpg"],
      destinationDirectory: "E:/Review",
      destinationItems: [],
      renameItems: [],
      deleteMode: "trash",
      copyMode: true,
      preserveStructure: true,
      conflictPolicy: "rename",
      outputPath: undefined,
      outputFormat: "json",
      exportScope: "selected",
      exportEntries: [],
      dryRun: false,
    })
  })

  test("limits Simiu operation fields to Simiu actions", () => {
    const values = {
      tool: "similar-images",
      simiuSetsOperationMode: "link",
      simiuSetsOperations: [{ root: "D:/library", sourcePath: "D:/library/a.jpg", targetPath: "D:/library/set/a.jpg", mode: "link" }],
      simiuSetsCleanEmptyDirectories: false,
    }

    expect(createKisakiOperationInput("simiu-apply", values)).toMatchObject({
      action: "simiu-apply",
      simiuSetsOperationMode: "link",
      simiuSetsOperations: [{ root: "D:/library", sourcePath: "D:/library/a.jpg", targetPath: "D:/library/set/a.jpg", mode: "link" }],
      simiuSetsCleanEmptyDirectories: false,
    })
    expect(createKisakiOperationInput("delete", values)).not.toHaveProperty("simiuSetsOperations")
  })

  test("exposes safe operations through the shared guided and TUI schema", () => {
    const schema = createKisakiInteractionSchema({}, "zh")
    const values = { ...schema.initialValues, action: "delete", selectedPathsText: "D:/old.tmp", deleteMode: "trash", dryRun: true }
    const input = schema.toInput(values)
    expect(input).toMatchObject({ action: "delete", selectedPaths: ["D:/old.tmp"], deleteMode: "trash", dryRun: true })
    expect(schema.validate(values, input)).toBeNull()
    expect(schema.isDangerous?.(input)).toBe(false)
    expect(schema.isDangerous?.({ ...input, dryRun: false })).toBe(true)
  })

  test("parses TUI rename rows and makes export an immediate non-destructive write", () => {
    expect(createKisakiOperationInput("rename", { renameItemsText: "D:/photo.bin\t.jpg\nD:/audio.raw\tflac" })).toMatchObject({ action: "rename", renameItems: [{ path: "D:/photo.bin", properExtension: ".jpg" }, { path: "D:/audio.raw", properExtension: "flac" }], dryRun: true })
    expect(createKisakiOperationInput("save", { selectedPaths: ["D:/photo.bin"], outputPath: "D:/result.csv", exportScope: "all", dryRun: true })).toMatchObject({ action: "save", outputFormat: "csv", exportScope: "all", dryRun: false })
  })
})
