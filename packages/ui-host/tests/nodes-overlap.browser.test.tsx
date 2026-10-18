import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { NodeHostApi } from "@xiranite/contract"
import {
  ADAPTIVE_CONTAINER_CASES,
  type AdaptiveContainerSpec,
} from "@/nodes/shared/nodeSurfaceTestUtils"
import { Md3eNodeSurface } from "@/nodes/shared/Md3eShapeContext"
import type { NodeSurface, NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import {
  detectComponentOverlaps,
} from "@/nodes/shared/componentOverlapDetector"

// 引入典型节点组件
import { Component as SameaComponent } from "@/nodes/samea/Component"
import { Component as CleanfComponent } from "@/nodes/cleanf/Component"
import { Component as BitvComponent } from "@/nodes/bitv/Component"

afterEach(cleanup)

function createSurface(width: number, height: number, forcedMode?: NodeSurfaceMode): NodeSurface {
  const mode: NodeSurfaceMode =
    forcedMode ??
    (width < 300
      ? "collapsed"
      : width < 600 && height > width * 1.15
        ? "portrait"
        : width < 500
          ? "compact"
          : width >= 1100
            ? "workspace"
            : "regular")

  return {
    ref: { current: null },
    width,
    height,
    mode,
    density: width < 360 ? "tight" : width >= 1000 ? "roomy" : "normal",
  }
}

function createBrowserHost(nodeId: string): NodeHostApi<Record<string, unknown>, Record<string, unknown>> {
  return {
    contract: {
      name: "xaihi.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "clipboard"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    state: {
      getData: () => ({ pathsText: "D:/test-path", dryRun: true, minOccurrences: 1 }),
      patchData: () => {},
    },
    runner: {
      run: async () => ({ success: true, message: "OK" }),
    },
    actions: {
      run: async () => ({ success: true, message: "OK" }),
    },
    clipboard: {
      readText: async () => "",
      writeText: async () => {},
    },
    getData: () => ({ pathsText: "D:/test-path", dryRun: true, minOccurrences: 1 }),
    patchData: () => {},
    listComponents: () => [],
    updateComponent: () => {},
  }
}

function BrowserNodeHarness({
  nodeId,
  surface,
  children,
}: {
  nodeId: string
  surface: NodeSurface
  children: React.ReactNode
}) {
  return (
    <div
      data-testid={`browser-node-container-${nodeId}`}
      style={{
        width: `${surface.width}px`,
        height: `${surface.height}px`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Md3eNodeSurface nodeId={nodeId} surface={surface}>
        {children}
      </Md3eNodeSurface>
    </div>
  )
}

describe("Chromium 真机渲染环境下的组件物理相交与防遮盖矩阵", () => {
  it("阳性对照：故意绝对定位重叠的两个卡片在 Chromium 真机排版下必定检出违规", () => {
    const surface = createSurface(600, 400, "regular")
    const { container } = render(
      <BrowserNodeHarness nodeId="positive-control" surface={surface}>
        <div className="relative h-full w-full">
          <div
            data-slot="md3e-section-card"
            style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              width: "240px",
              height: "120px",
              backgroundColor: "rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3>上层卡片</h3>
          </div>
          <div
            data-slot="md3e-section-card"
            style={{
              position: "absolute",
              top: "60px",
              left: "40px",
              width: "240px",
              height: "120px",
              backgroundColor: "rgba(255, 0, 0, 0.1)",
            }}
          >
            <h3>下层被遮盖卡片</h3>
          </div>
        </div>
      </BrowserNodeHarness>,
    )

    const violations = detectComponentOverlaps(container)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]?.intersection.width).toBeGreaterThan(0)
    expect(violations[0]?.intersection.height).toBeGreaterThan(0)
  })

  const NODES = [
    { id: "samea", name: "SameA", Component: SameaComponent },
    { id: "cleanf", name: "CleanF", Component: CleanfComponent },
    { id: "bitv", name: "BitV", Component: BitvComponent },
  ]

  for (const node of NODES) {
    describe(`节点 [${node.name}] Chromium 真机物理碰撞扫描`, () => {
      for (const spec of ADAPTIVE_CONTAINER_CASES) {
        it(`在 ${spec.label} (${spec.width}×${spec.height}) 下各个渲染区块物理不重叠`, async () => {
          const surface = createSurface(spec.width, spec.height)
          const host = createBrowserHost(node.id)

          const { container } = render(
            <BrowserNodeHarness nodeId={node.id} surface={surface}>
              <node.Component compId={node.id} host={host} />
            </BrowserNodeHarness>,
          )

          // 等待 DOM 挂载完成
          const surfaceRoot = container.querySelector('[data-slot="md3e-node-surface"]') as HTMLElement
          expect(surfaceRoot).not.toBeNull()

          // 执行真机渲染下的物理矩形碰撞检查
          const violations = detectComponentOverlaps(container, { threshold: 4 })
          if (violations.length > 0) {
            console.error("Detected overlaps in browser:", violations.map((v) => ({
              a: v.labelA,
              b: v.labelB,
              overlap: v.intersection,
            })))
          }
          expect(violations).toHaveLength(0)
        })
      }
    })
  }
})
