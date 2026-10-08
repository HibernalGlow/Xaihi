import { afterEach, expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { KisakiData } from "@hibernalglow/xaihi-kisaki/core"
import { KISAKI_WORKSPACE_DEFAULTS } from "@hibernalglow/xaihi-kisaki/workspace-layout"

import i18n from "@/i18n"
import { Component } from "./Component"
import type { KisakiCardState } from "./types"

const surface = vi.hoisted(() => ({ width: 1440, height: 860, mode: "workspace" }))

vi.mock("@/nodes/shared/useNodeSurface", () => ({
  useNodeSurface: () => ({ ref: { current: null }, ...surface }),
}))

afterEach(async () => {
  cleanup()
  Object.assign(surface, { width: 1440, height: 860, mode: "workspace" })
  await i18n.changeLanguage("zh")
})

for (const view of [
  { mode: "workspace", width: 1440 },
  { mode: "compact", width: 480 },
] as const) {
  test(`renders scan progress in the same title-bar row as search in ${view.mode} mode`, async () => {
    await i18n.changeLanguage("en")
    Object.assign(surface, { width: view.width, height: 860, mode: view.mode })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", progress: 37, progressText: "Hashing files" })

    await render(<Component compId={`czkawka-progress-${view.mode}-browser`} host={host} />)

    const header = document.querySelector("header")
    const progress = header?.querySelector<HTMLElement>('[role="progressbar"]')
    const search = header?.querySelector<HTMLInputElement>("input")
    const progressRect = progress?.getBoundingClientRect()
    const searchRect = search?.getBoundingClientRect()
    expect(header?.contains(progress ?? null)).toBe(true)
    expect(progress?.getAttribute("aria-valuenow")).toBe("37")
    expect(Math.abs(((progressRect?.top ?? 0) + (progressRect?.bottom ?? 0)) / 2 - ((searchRect?.top ?? 0) + (searchRect?.bottom ?? 0)) / 2)).toBeLessThanOrEqual(1)
    await expect.element(page.getByText("Hashing files")).toBeVisible()
  })
}

test("resets a fixed navigator from the source lane menu in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({
    tool: "duplicate-files",
    includedDirectoriesText: "D:/media",
    workspaceLayout: {
      ...KISAKI_WORKSPACE_DEFAULTS,
      navigatorDock: "top",
      navigatorLane: "analysis",
      navigatorFollowsFocus: false,
    },
  })

  await render(<Component compId="czkawka-browser" host={host} />)

  const sourceMenu = page.getByRole("button", { name: /Scan conditions.*\u66f4\u591a\u8bbe\u7f6e/i })
  await sourceMenu.click()
  const reset = page.getByRole("menuitem", { name: "\u91cd\u7f6e\u64cd\u4f5c\u680f\u4f4d\u7f6e" })
  await expect.element(reset).toBeVisible()
  await reset.click()

  await expect.poll(() => host.stateValue.workspaceLayout?.navigatorDock).toBe("floating")
  expect(host.stateValue.workspaceLayout).toMatchObject({
    navigatorLane: "source",
    navigatorPositionX: 96,
    navigatorPositionY: 94,
  })
})

test("keeps selection history synchronized with the result table in the browser", async () => {
  const host = createHost({
    tool: "duplicate-files",
    includedDirectoriesText: "D:/media",
    result: selectionResult,
    analysisPanelTab: "selection",
  })

  await render(<Component compId="czkawka-selection-browser" host={host} />)

  const rowCheckbox = page.getByRole("checkbox", { name: "\u9009\u62e9 duplicate-files-result.dat" })
  await rowCheckbox.click()
  await expect.element(rowCheckbox).toHaveAttribute("data-state", "checked")

  await page.getByRole("button", { name: /\u9009\u62e9\u52a9\u624b/ }).click()
  await page.getByRole("button", { name: /\u6e05\u7a7a\u9009\u62e9/ }).click()
  await expect.element(rowCheckbox).toHaveAttribute("data-state", "unchecked")

  const undo = page.getByRole("button", { name: "\u64a4\u9500\u9009\u62e9" })
  await expect.element(undo).toBeVisible()
  await undo.click()
  await expect.element(rowCheckbox).toHaveAttribute("data-state", "checked")
})

test("hides Czkawka 12 image controls until the native binding advertises their capabilities", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" }, [])

  await render(<Component compId="czkawka-image-invariance-unavailable-browser" host={host} />)

  await expect.element(page.getByText("Ignore same resolution")).not.toBeInTheDocument()
  await expect.element(page.getByText("Geometric invariance")).not.toBeInTheDocument()
})

test("persists Czkawka 12 similar-image invariance controls in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" })

  await render(<Component compId="czkawka-image-invariance-browser" host={host} />)

  const sameResolution = page.getByRole("switch", { name: "Ignore same resolution" })
  await sameResolution.click()
  await expect.poll(() => host.stateValue.similarImagesIgnoreSameResolution).toBe(true)

  const invariance = page.getByRole("combobox", { name: "Geometric invariance" })
  await invariance.click()
  await page.getByRole("option", { name: "Mirror, flip and 90° rotation" }).click()
  await expect.poll(() => host.stateValue.similarImagesGeometricInvariance).toBe("mirror-flip-rotate-90")
})

test("hides Czkawka 12 similario controls until the native binding advertises their capabilities", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "similar-videos", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" }, [])

  await render(<Component compId="czkawka-similario-unavailable-browser" host={host} />)

  await expect.element(page.getByText("Ignore same resolution")).not.toBeInTheDocument()
  await expect.element(page.getByText("Window count")).not.toBeInTheDocument()
  await expect.element(page.getByText("Duration tolerance (%)")).not.toBeInTheDocument()
  await expect.element(page.getByText("Minimum matching windows")).not.toBeInTheDocument()
  await expect.element(page.getByText("Minimum subclip match")).not.toBeInTheDocument()
  await expect.element(page.getByText("Compare audio content")).not.toBeInTheDocument()
})

test("persists every Czkawka 12 similario control in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "similar-videos", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" },
    ["similar-videos.similario", "similar-videos.same-resolution-exclusion", "similar-videos.audio"],
  )

  await render(<Component compId="czkawka-similario-browser" host={host} />)

  await page.getByRole("switch", { name: "Ignore same resolution" }).click()
  await page.getByRole("spinbutton", { name: "Window count" }).fill("12")
  await page.getByRole("spinbutton", { name: "Duration tolerance (%)" }).fill("35")
  await page.getByRole("spinbutton", { name: "Minimum matching windows" }).fill("0.75")
  await page.getByRole("spinbutton", { name: "Minimum subclip match" }).fill("0.4")
  await page.getByRole("switch", { name: "Compare audio content" }).click()

  await expect.poll(() => host.stateValue).toMatchObject({
    similarVideosIgnoreSameResolution: true,
    similarVideosWindowCount: "12",
    similarVideosDurationTolerancePct: "35",
    similarVideosMinMatchingWindows: "0.75",
    similarVideosSubclipMinMatch: "0.4",
    similarVideosCheckAudioContent: true,
  })
})

test("hides Czkawka 12 broken-file controls until the native binding advertises their capability", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "broken-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" }, [])

  await render(<Component compId="czkawka-broken-checkers-unavailable-browser" host={host} />)

  await expect.element(page.getByText("Fast video check (FFprobe)")).not.toBeInTheDocument()
  await expect.element(page.getByText("Full video decode (FFmpeg)")).not.toBeInTheDocument()
  await expect.element(page.getByText("Check fonts")).not.toBeInTheDocument()
  await expect.element(page.getByText("Check markup files")).not.toBeInTheDocument()
})

test("persists every Czkawka 12 broken-file checker in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "broken-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" },
    ["broken-files.multi-checker"],
  )

  await render(<Component compId="czkawka-broken-checkers-browser" host={host} />)

  await page.getByRole("switch", { name: "Fast video check (FFprobe)" }).click()
  await page.getByRole("switch", { name: "Full video decode (FFmpeg)" }).click()
  await page.getByRole("switch", { name: "Check fonts" }).click()
  await page.getByRole("switch", { name: "Check markup files" }).click()

  await expect.poll(() => host.stateValue).toMatchObject({
    brokenVideoFfprobe: true,
    brokenVideoFfmpeg: true,
    brokenFont: true,
    brokenMarkup: true,
  })
})

test("hides Czkawka 12 empty-file content checkers until the native binding advertises their capability", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "empty-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" }, [])

  await render(<Component compId="czkawka-empty-content-unavailable-browser" host={host} />)

  await expect.element(page.getByText("Check NUL-only files")).not.toBeInTheDocument()
  await expect.element(page.getByText("Check non-printable files")).not.toBeInTheDocument()
})

test("persists every Czkawka 12 empty-file content checker in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "empty-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" },
    ["empty-files.content-checkers"],
  )

  await render(<Component compId="czkawka-empty-content-browser" host={host} />)

  await page.getByRole("switch", { name: "Check NUL-only files" }).click()
  await page.getByRole("switch", { name: "Check non-printable files" }).click()

  await expect.poll(() => host.stateValue).toMatchObject({
    emptyFilesSearchZeroByteContent: true,
    emptyFilesSearchNonPrintableContent: true,
  })
})

test("hides Czkawka 12 temporary suffix controls until the native binding advertises their capability", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "temporary-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" }, [])

  await render(<Component compId="czkawka-temporary-suffix-unavailable-browser" host={host} />)

  await expect.element(page.getByText("Temporary extensions")).not.toBeInTheDocument()
})

test("persists custom Czkawka 12 temporary suffixes in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "temporary-files", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" },
    ["temporary-files.custom-extensions"],
  )

  await render(<Component compId="czkawka-temporary-suffix-browser" host={host} />)

  await page.getByRole("textbox", { name: "Temporary extensions" }).fill(".xiranite-tmp,#")

  await expect.poll(() => host.stateValue).toMatchObject({ temporaryFileExtensions: ".xiranite-tmp,#" })
})

test("adds individual files and the Czkawka $TRASH exclusion preset in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "empty-files", includedDirectoriesText: "D:/media" })
  host.localFiles.pickFiles = async () => ["D:/media/empty.bin", "E:/library/nul-only.bin"]

  await render(<Component compId="czkawka-shared-input-browser" host={host} />)

  await page.getByRole("button", { name: "Add files to Included directories" }).click()
  await expect.poll(() => host.stateValue.includedDirectoriesText).toBe("D:/media/empty.bin\nE:/library/nul-only.bin\nD:/media")

  await page.getByRole("button", { name: "Node settings" }).click()
  await page.getByRole("button", { name: "Add $TRASH exclusion preset" }).click()
  await expect.poll(() => host.stateValue.excludedItemsText).toBe("$TRASH")
})

test("persists outdated cache cleanup separately for the current Czkawka scanner", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({
    tool: "duplicate-files",
    includedDirectoriesText: "D:/media",
    deleteOutdatedCacheByTool: { "similar-images": false },
  })

  await render(<Component compId="czkawka-cache-cleanup-browser" host={host} />)

  await page.getByRole("button", { name: "Node settings" }).click()
  await page.getByRole("switch", { name: "Delete outdated entries for the current scanner" }).click()
  await expect.poll(() => host.stateValue.deleteOutdatedCacheByTool).toEqual({
    "duplicate-files": false,
    "similar-images": false,
  })
})

test("hides the bad-name scanner until the native binding advertises it", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, [])

  await render(<Component compId="czkawka-bad-names-unavailable-browser" host={host} />)

  await page.getByRole("combobox", { name: "Select scanner" }).click()
  await expect.element(page.getByRole("option", { name: "Bad Names" })).not.toBeInTheDocument()
})

test("shows a dry-run bad-name correction plan from the native target preview", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "bad-names", includedDirectoriesText: "D:/media", result: badNameResult, analysisPanelTab: "operations" },
    ["scan.bad-names"],
  )

  await render(<Component compId="czkawka-bad-names-browser" host={host} />)

  await page.getByRole("checkbox", { name: "Select report-🙂.TXT" }).click()
  await page.getByRole("button", { name: "Fix names (1)" }).click()
  await expect.element(page.getByText("D:/report-🙂.TXT → report-.txt")).toBeVisible()
  await expect.element(page.getByText("Rename 1 items to the scan's proposed names.")).toBeVisible()
})

test("hides the EXIF remover until the native binding advertises it", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, [])

  await render(<Component compId="czkawka-exif-unavailable-browser" host={host} />)

  await page.getByRole("combobox", { name: "Select scanner" }).click()
  await expect.element(page.getByRole("option", { name: "EXIF Remover" })).not.toBeInTheDocument()
})

test("shows an EXIF cleanup dry-run plan without creating a candidate", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "exif-remover", includedDirectoriesText: "D:/media", result: exifResult, analysisPanelTab: "operations" },
    ["scan.exif-remover", "operation.exif.candidate"],
  )

  await render(<Component compId="czkawka-exif-browser" host={host} />)

  await expect.element(page.getByText("ImageDescription").first()).toBeVisible()
  await page.getByRole("checkbox", { name: "Select photo.jpg" }).click()
  await page.getByRole("button", { name: "Clean EXIF (1)" }).click()
  await expect.element(page.getByText("Remove 1 EXIF tags")).toBeVisible()
  await expect.element(page.getByText("Preview metadata cleanup for 1 items; no files will change.")).toBeVisible()
})

test("hides the video optimizer until the native binding advertises it", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, [])

  await render(<Component compId="czkawka-video-optimizer-unavailable-browser" host={host} />)

  await page.getByRole("combobox", { name: "Select scanner" }).click()
  await expect.element(page.getByRole("option", { name: "Video Optimizer" })).not.toBeInTheDocument()
})

test("persists video optimizer scan controls in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "video-optimizer", includedDirectoriesText: "D:/media", sourceSettingsTab: "algorithm" },
    ["scan.video-optimizer"],
  )

  await render(<Component compId="czkawka-video-optimizer-controls-browser" host={host} />)

  await page.getByRole("combobox", { name: "Optimization mode" }).click()
  await page.getByRole("option", { name: /Crop/ }).click()
  await page.getByRole("spinbutton", { name: "Black pixel threshold" }).fill("24")
  await expect.poll(() => host.stateValue).toMatchObject({ videoOptimizerMode: "crop", videoOptimizerBlackPixelThreshold: "24" })
})

test("persists video optimizer noise reduction selection in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "video-optimizer", includedDirectoriesText: "D:/media", result: videoOptimizerResult, analysisPanelTab: "operations" },
    ["scan.video-optimizer", "operation.video-optimizer.candidate"],
  )

  await render(<Component compId="czkawka-video-optimizer-noise-reduction-browser" host={host} />)

  await page.getByRole("combobox", { name: "Noise reduction" }).click()
  await page.getByRole("option", { name: "HQDN3D" }).click()
  await expect.poll(() => host.stateValue.videoOptimizerNoiseReduction).toBe("hqdn3d")
})

test("persists video optimizer HQDN3D strength in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "video-optimizer", videoOptimizerNoiseReduction: "hqdn3d", includedDirectoriesText: "D:/media", result: videoOptimizerResult, analysisPanelTab: "operations" },
    ["scan.video-optimizer", "operation.video-optimizer.candidate"],
  )

  await render(<Component compId="czkawka-video-optimizer-noise-strength-browser" host={host} />)

  await page.getByRole("spinbutton", { name: "Noise reduction strength" }).fill("7")
  await expect.poll(() => host.stateValue.videoOptimizerNoiseReductionStrength).toBe("7")
})

test("previews a selected video optimizer crop candidate dry run", async () => {
  await i18n.changeLanguage("en")
  const host = createHost(
    { tool: "video-optimizer", videoOptimizerMode: "crop", includedDirectoriesText: "D:/media", result: videoOptimizerResult, analysisPanelTab: "operations" },
    ["scan.video-optimizer", "operation.video-optimizer.candidate"],
  )

  await render(<Component compId="czkawka-video-optimizer-crop-browser" host={host} />)

  const cropCheckbox = page.getByRole("checkbox", { name: "Select crop.mp4" })
  await cropCheckbox.click()
  await expect.element(cropCheckbox).toHaveAttribute("data-state", "checked")
  await page.getByRole("button", { name: "Optimize videos (1)" }).click()
  await expect.element(page.getByText("h264 -> crop 0,120,1920,960")).toBeVisible()
  await expect.element(page.getByText("Preview 1 video optimizations; no files will change.")).toBeVisible()
})

test("renders Czkawka 12 video codec and frame-rate metadata in the browser", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "similar-videos", includedDirectoriesText: "D:/media", result: similarVideoResult })

  await render(<Component compId="czkawka-similario-metadata-browser" host={host} />)

  await expect.element(page.getByText("23.98 fps").first()).toBeVisible()
  await expect.element(page.getByText("H.264").first()).toBeVisible()
})

test("compares similar-image group members through all four accessible modes", async () => {
  await i18n.changeLanguage("en")
  const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/media", result: similarImageResult })

  await render(<Component compId="czkawka-image-comparison-browser" host={host} />)
  await page.getByRole("button", { name: "Preview left.jpg" }).click()
  await expect.element(page.getByRole("dialog")).toBeVisible()
  await expect.element(page.getByRole("button", { name: "Single image" })).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("button", { name: "Side by side" }).click()
  await expect.poll(() => host.stateValue.imageComparisonMode).toBe("side-by-side")
  await expect.element(page.getByText("Current image")).toBeVisible()
  await expect.element(page.getByText("Comparison image")).toBeVisible()

  await page.getByRole("button", { name: "Swipe divider" }).click()
  const swipe = page.getByRole("slider", { name: "Swipe position" })
  await swipe.fill("72")
  await expect.element(swipe).toHaveValue("72")
  document.querySelector<HTMLInputElement>("input[aria-label='Swipe position']")!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }))
  await expect.element(swipe).toHaveValue("73")
  const stage = document.querySelector<HTMLElement>("[data-testid='czkawka-image-comparison-swipe-stage']")!
  Object.defineProperty(stage, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) })
  stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 80, pointerId: 7 }))
  stage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, pointerId: 7 }))
  await expect.element(swipe).toHaveValue("75")
  await page.getByRole("option", { name: "Compare with right.jpg" }).click()
  await expect.element(swipe).toHaveValue("50")

  await page.getByRole("button", { name: "Onion skin overlay" }).click()
  const opacity = page.getByRole("slider", { name: "Overlay opacity" })
  await opacity.fill("32")
  await expect.element(opacity).toHaveValue("32")
  await page.getByRole("button", { name: "Color coding" }).click()
  await expect.poll(() => host.stateValue.imageComparisonColorCoding).toBe(true)
  await page.getByRole("option", { name: "Compare with middle.jpg" }).click()
  await expect.element(opacity).toHaveValue("50")
  await page.getByRole("button", { name: "Close image comparison" }).click()
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument()
})

test("keeps comparison controls usable in the compact Kisaki layout", async () => {
  await i18n.changeLanguage("en")
  Object.assign(surface, { width: 480, height: 780, mode: "compact" })
  const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/media", result: similarImageResult })

  await render(<Component compId="czkawka-image-comparison-compact-browser" host={host} />)
  await page.getByRole("tab", { name: /Results 3/ }).click()
  await page.getByRole("button", { name: "Preview left.jpg" }).click()
  await page.getByRole("button", { name: "Side by side" }).click()

  await expect.element(page.getByRole("button", { name: "Onion skin overlay" })).toBeVisible()
  await expect.element(page.getByRole("option", { name: "Compare with middle.jpg" })).toBeVisible()
})

type TestHost = NodeHostApi<KisakiCardState, Partial<KisakiCardState>> & {
  stateValue: KisakiCardState
}

function createHost(initial: KisakiCardState, nativeCapabilities = ["similar-images.geometric-invariance", "similar-images.same-resolution-exclusion"]): TestHost {
  const host: TestHost = {
    stateValue: initial,
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    localFiles: { getUrl: (path) => `local://${path}` },
    state: {
      getData: () => host.stateValue,
      patchData: (patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    },
    runner: {
      getInfo: async <TInfo,>() => ({ apiVersion: 5, sourceVersion: "12.0.0", capabilities: nativeCapabilities }) as TInfo,
      run: async <TInput, TData>(_nodeId: string, _input: TInput, onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult<TData>> => {
        onEvent?.({ type: "progress", progress: 50, message: "Scanning" })
        return { success: true, message: "Completed", data: sample as TData }
      },
      cancelCurrent: async () => true,
    },
    getData: <T,>() => host.stateValue as T,
    patchData: (_id, patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
  return host
}

const sample: KisakiData = {
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

const selectionEntry = {
  id: "duplicate-files-result.dat",
  groupId: 0,
  path: "duplicate-files-result.dat",
  name: "duplicate-files-result.dat",
  size: 10,
  modifiedDate: 1,
}

const selectionResult: KisakiData = {
  ...sample,
  groups: [{ id: 0, entries: [selectionEntry], totalBytes: 10, reclaimableBytes: 0 }],
  entries: [selectionEntry],
  groupCount: 1,
  fileCount: 1,
  totalBytes: 10,
}

const similarImageEntries = [
  { id: "left.jpg", groupId: 0, path: "left.jpg", name: "left.jpg", size: 10, modifiedDate: 1, width: 1920, height: 1080, similarity: "1" },
  { id: "middle.jpg", groupId: 0, path: "middle.jpg", name: "middle.jpg", size: 12, modifiedDate: 2, width: 1080, height: 1920, similarity: "2" },
  { id: "right.jpg", groupId: 0, path: "right.jpg", name: "right.jpg", size: 14, modifiedDate: 3, width: 1600, height: 900, similarity: "3" },
]

const similarImageResult: KisakiData = {
  ...sample,
  tool: "similar-images",
  groups: [{ id: 0, entries: similarImageEntries, totalBytes: 36, reclaimableBytes: 24 }],
  entries: similarImageEntries,
  groupCount: 1,
  fileCount: 3,
  totalBytes: 36,
  reclaimableBytes: 24,
}

const similarVideoEntries = [
  { id: "left.mp4", groupId: 0, path: "left.mp4", name: "left.mp4", size: 10, modifiedDate: 1, width: 1920, height: 1080, fps: 23.98, codec: "H.264", bitrate: 1_200, length: "6.00 s", similarity: "1" },
  { id: "right.mp4", groupId: 0, path: "right.mp4", name: "right.mp4", size: 12, modifiedDate: 2, width: 1920, height: 1080, fps: 23.98, codec: "H.264", bitrate: 1_200, length: "6.00 s", similarity: "2" },
]

const similarVideoResult: KisakiData = {
  ...sample,
  tool: "similar-videos",
  groups: [{ id: 0, entries: similarVideoEntries, totalBytes: 22, reclaimableBytes: 12 }],
  entries: similarVideoEntries,
  groupCount: 1,
  fileCount: 2,
  totalBytes: 22,
  reclaimableBytes: 12,
}

const badNameResult: KisakiData = {
  ...sample,
  tool: "bad-names",
  groups: [{ id: 0, entries: [{ id: "report-🙂.TXT", groupId: 0, path: "D:/report-🙂.TXT", name: "report-🙂.TXT", size: 12, modifiedDate: 1, secondaryPath: "D:/report-.txt" }], totalBytes: 12, reclaimableBytes: 0 }],
  entries: [{ id: "report-🙂.TXT", groupId: 0, path: "D:/report-🙂.TXT", name: "report-🙂.TXT", size: 12, modifiedDate: 1, secondaryPath: "D:/report-.txt" }],
  groupCount: 1,
  fileCount: 1,
  totalBytes: 12,
}

const exifResult: KisakiData = {
  ...sample,
  tool: "exif-remover",
  groups: [{ id: 0, entries: [{ id: "photo.jpg", groupId: 0, path: "D:/photo.jpg", name: "photo.jpg", size: 12, modifiedDate: 1, exifTags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }], totalBytes: 12, reclaimableBytes: 0 }],
  entries: [{ id: "photo.jpg", groupId: 0, path: "D:/photo.jpg", name: "photo.jpg", size: 12, modifiedDate: 1, exifTags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }],
  groupCount: 1,
  fileCount: 1,
  totalBytes: 12,
}

const videoOptimizerResult: KisakiData = {
  ...sample,
  tool: "video-optimizer",
  groups: [{ id: 0, entries: [{ id: "crop.mp4", groupId: 0, path: "D:/crop.mp4", name: "crop.mp4", size: 12, modifiedDate: 1, codec: "h264", videoCropRect: { left: 0, top: 120, right: 1920, bottom: 960 } }], totalBytes: 12, reclaimableBytes: 0 }],
  entries: [{ id: "crop.mp4", groupId: 0, path: "D:/crop.mp4", name: "crop.mp4", size: 12, modifiedDate: 1, codec: "h264", videoCropRect: { left: 0, top: 120, right: 1920, bottom: 960 } }],
  groupCount: 1,
  fileCount: 1,
  totalBytes: 12,
}
