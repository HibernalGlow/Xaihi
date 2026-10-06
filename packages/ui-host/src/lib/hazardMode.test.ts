import { describe, expect, test, vi } from "vitest"
import { applyHazardRunPolicy, countHazardAffectedNodes, disableAllNodeDryRuns, resolveHazardComponentData } from "./hazardMode"
import type { ComponentInstance } from "@/types/workspace"

const component = (moduleId: string, data: Record<string, unknown> = {}): ComponentInstance => ({
  id: `component-${moduleId}`,
  moduleId,
  state: "docked",
  workspaceId: "workspace",
  data,
})

describe("hazard mode", () => {
  test("turns off each supported preflight mode without touching unrelated nodes", () => {
    const components = [
      component("classq"),
      component("cleanf"),
      component("dissolvef"),
      component("trename", { dryRun: true }),
      component("bitv"),
      component("nameu", { dryRun: false }),
      component("timeu", { dryRun: false }),
      component("recycleu", { interval: 30 }),
    ]
    const patchComponentData = vi.fn()

    expect(countHazardAffectedNodes(components)).toBe(5)
    expect(disableAllNodeDryRuns(components, patchComponentData)).toBe(5)
    expect(patchComponentData).toHaveBeenCalledWith("component-classq", { dryRun: false })
    expect(patchComponentData).toHaveBeenCalledWith("component-cleanf", { previewMode: false })
    expect(patchComponentData).toHaveBeenCalledWith("component-dissolvef", { preview: false })
    expect(patchComponentData).toHaveBeenCalledWith("component-trename", { dryRun: false })
    expect(patchComponentData).toHaveBeenCalledWith("component-bitv", { dryRun: false })
    expect(patchComponentData).toHaveBeenCalledTimes(5)
  })

  test("enforces live execution at the shared runner boundary", () => {
    expect(applyHazardRunPolicy("classq", { dryRun: true, paths: ["D:/set"] }, true))
      .toEqual({ dryRun: false, paths: ["D:/set"] })
    expect(applyHazardRunPolicy("dissolvef", { preview: true }, true)).toEqual({ preview: false })
    expect(applyHazardRunPolicy("cleanf", { preview: true }, true)).toEqual({ preview: false })
    expect(applyHazardRunPolicy("custom-node", { dryRun: true }, true)).toEqual({ dryRun: false })

    const input = { dryRun: true }
    expect(applyHazardRunPolicy("classq", input, false)).toBe(input)
    expect(applyHazardRunPolicy("custom-node", { preview: true }, true)).toEqual({ preview: true })
  })

  test("exposes effective live data to local node implementations", () => {
    const original = component("cleanf", { previewMode: true, paths: ["D:/cache"] })
    expect(resolveHazardComponentData(original, true)).toEqual({ previewMode: false, paths: ["D:/cache"] })
    expect(resolveHazardComponentData(original, false)).toBe(original.data)
  })
})
