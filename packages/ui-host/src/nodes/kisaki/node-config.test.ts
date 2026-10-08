import { describe, expect, test } from "vitest"
import { KISAKI_TOOL_OPTIONS } from "@hibernalglow/xaihi-kisaki/tool-options"

import { KISAKI_NODE_CONFIG_KEYS, pickKisakiNodeConfig } from "./node-config"

describe("Kisaki TOML configuration", () => {
  test("keeps reusable scanner settings and excludes workspace state", () => {
    expect(pickKisakiNodeConfig({
      tool: "similar-images",
      includedDirectoriesText: "D:/Photos",
      similarImagesHashAlgorithm: "double-gradient",
      similarImagesResizeAlgorithm: "catmull-rom",
      videoOptimizerTargetCodec: "av1",
      result: { fileCount: 42 },
      activityLog: [{ message: "scan complete" }],
      workspaceLayout: { version: 1 },
    })).toEqual({
      tool: "similar-images",
      includedDirectoriesText: "D:/Photos",
      similarImagesHashAlgorithm: "double-gradient",
      similarImagesResizeAlgorithm: "catmull-rom",
      videoOptimizerTargetCodec: "av1",
    })
  })

  test("ignores a malformed node config payload", () => {
    expect(pickKisakiNodeConfig(["similar-images"])).toEqual({})
  })

  test("preserves explicit removals for the TOML writer", () => {
    expect(pickKisakiNodeConfig({ activeScanPresetId: undefined })).toEqual({ activeScanPresetId: undefined })
  })

  test("includes every GUI algorithm field in the TOML configuration contract", () => {
    const algorithmSettings = Object.fromEntries(KISAKI_TOOL_OPTIONS.map((option) => [option.id, "configured"]))

    expect(KISAKI_NODE_CONFIG_KEYS).toEqual(expect.arrayContaining(KISAKI_TOOL_OPTIONS.map((option) => option.id)))
    expect(pickKisakiNodeConfig(algorithmSettings)).toEqual(algorithmSettings)
  })
})
