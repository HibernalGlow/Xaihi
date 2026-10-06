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
