import { describe, expect, test } from "vitest"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "./nodeSurfaceTestUtils"
import { resolveNodeSurfaceDensity, resolveNodeSurfaceMode } from "./useNodeSurface"

describe("resolveNodeSurfaceMode", () => {
  test.each(NODE_SURFACE_TEST_MODES)("classifies the shared %s representative size", (mode) => {
    expect(resolveNodeSurfaceMode(NODE_SURFACE_TEST_SPECS[mode])).toBe(mode)
    expect(resolveNodeSurfaceDensity(mode)).toBe(NODE_SURFACE_TEST_SPECS[mode].density)
  })

  test.each([
    { label: "219x95", size: { width: 219, height: 95 }, mode: "collapsed" },
    { label: "220x96", size: { width: 220, height: 96 }, mode: "compact" },
    { label: "519x359", size: { width: 519, height: 359 }, mode: "compact" },
    { label: "520x360", size: { width: 520, height: 360 }, mode: "regular" },
    { label: "859x519", size: { width: 859, height: 519 }, mode: "regular" },
    { label: "860x520", size: { width: 860, height: 520 }, mode: "expanded" },
    { label: "1039x679", size: { width: 1039, height: 679 }, mode: "expanded" },
    { label: "1040x680", size: { width: 1040, height: 680 }, mode: "workspace" },
    { label: "390x448", size: { width: 390, height: 448 }, mode: "compact" },
    { label: "390x449", size: { width: 390, height: 449 }, mode: "portrait" },
  ] as const)("classifies $label as $mode", ({ size, mode }) => {
    expect(resolveNodeSurfaceMode(size)).toBe(mode)
  })
})
