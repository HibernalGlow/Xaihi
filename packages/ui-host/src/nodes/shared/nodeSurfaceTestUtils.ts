import type { NodeSurface, NodeSurfaceMode } from "./useNodeSurface"

export type NodeSurfaceTestSpec = {
  density: NodeSurface["density"]
  height: number
  width: number
}

export const NODE_SURFACE_TEST_SPECS: Record<NodeSurfaceMode, NodeSurfaceTestSpec> = {
  collapsed: { width: 200, height: 80, density: "tight" },
  compact: { width: 420, height: 280, density: "tight" },
  portrait: { width: 390, height: 640, density: "tight" },
  regular: { width: 720, height: 420, density: "normal" },
  expanded: { width: 920, height: 560, density: "roomy" },
  workspace: { width: 1120, height: 720, density: "roomy" },
}

export const NODE_SURFACE_TEST_MODES = Object.keys(NODE_SURFACE_TEST_SPECS) as NodeSurfaceMode[]

export interface AdaptiveContainerSpec {
  id: "tall-narrow" | "short-wide" | "square" | "workspace"
  label: string
  width: number
  height: number
  expectation: {
    forceSingleColumn?: boolean
    allowSecondaryActionCollapse?: boolean
    allowHeroHeaderHide?: boolean
  }
}

export const ADAPTIVE_CONTAINER_MATRIX: Record<AdaptiveContainerSpec["id"], AdaptiveContainerSpec> = {
  "tall-narrow": {
    id: "tall-narrow",
    label: "窄高条 (240×720)",
    width: 240,
    height: 720,
    expectation: { forceSingleColumn: true, allowSecondaryActionCollapse: true },
  },
  "short-wide": {
    id: "short-wide",
    label: "宽矮条 (960×280)",
    width: 960,
    height: 280,
    expectation: { allowHeroHeaderHide: true },
  },
  square: {
    id: "square",
    label: "小方格 (480×480)",
    width: 480,
    height: 480,
    expectation: {},
  },
  workspace: {
    id: "workspace",
    label: "全尺寸工作台 (1440×900)",
    width: 1440,
    height: 900,
    expectation: {},
  },
}

export const ADAPTIVE_CONTAINER_CASES: AdaptiveContainerSpec[] = Object.values(ADAPTIVE_CONTAINER_MATRIX)
