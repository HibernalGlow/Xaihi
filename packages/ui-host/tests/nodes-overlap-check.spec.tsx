// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NodeHostApi } from "@xiranite/contract"
import {
  ADAPTIVE_CONTAINER_CASES,
  ADAPTIVE_CONTAINER_MATRIX,
  type AdaptiveContainerSpec,
} from "@/nodes/shared/nodeSurfaceTestUtils"
import { Md3eNodeSurface } from "@/nodes/shared/Md3eShapeContext"
import type { NodeSurface, NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import {
  detectComponentOverlaps,
  type OverlapViolation,
} from "@/nodes/shared/componentOverlapDetector"

// 引入各个典型节点的 Component
import { Component as SameaComponent } from "@/nodes/samea/Component"
import { Component as CleanfComponent } from "@/nodes/cleanf/Component"
import { Component as CrashuComponent } from "@/nodes/crashu/Component"
import { Component as BitvComponent } from "@/nodes/bitv/Component"
import { Component as SleeptComponent } from "@/nodes/sleept/Component"
import { Component as TimeuComponent } from "@/nodes/timeu/Component"

afterEach(cleanup)

function createMockSurface(width: number, height: number, forcedMode?: NodeSurfaceMode): NodeSurface {
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

function createMockHost(nodeId: string): NodeHostApi<Record<string, unknown>, Record<string, unknown>> {
  const host: NodeHostApi<Record<string, unknown>, Record<string, unknown>> = {
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
  return host
}

/**
 * 嵌入式测试容器：以确定的物理尺寸包裹待测节点，并建立尺寸上下文。
 */
function NodeMountWrapper({
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
      data-testid={`container-${nodeId}-${surface.width}x${surface.height}`}
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

describe("ADR-0034 组件互相遮盖（Overlap / Collision）全面检查测试", () => {
  it("positive control 1: 故意注入绝对定位/重叠组件时，检测器必须敏锐抓出互相遮盖", () => {
    // 阳性对照：两个兄弟 SectionCard 发生坐标重叠
    const surface = createMockSurface(800, 600, "regular")
    const { container } = render(
      <NodeMountWrapper nodeId="test-control" surface={surface}>
        <div className="relative h-full w-full">
          <div
            data-slot="md3e-section-card"
            data-testid="rogue-card-a"
            style={{ position: "absolute", top: 10, left: 10, width: 300, height: 180 }}
          >
            <h3>卡片 A: 操作控制</h3>
          </div>
          <div
            data-slot="md3e-section-card"
            data-testid="rogue-card-b"
            style={{ position: "absolute", top: 120, left: 10, width: 300, height: 180 }}
          >
            <h3>卡片 B: 系统日志</h3>
          </div>
        </div>
      </NodeMountWrapper>,
    )

    const cardA = container.querySelector('[data-testid="rogue-card-a"]') as HTMLElement
    const cardB = container.querySelector('[data-testid="rogue-card-b"]') as HTMLElement

    // Mock 真实坐标反映 style 中的重叠（Y 轴在 120 到 190 之间重叠 70px）
    cardA.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      right: 310,
      bottom: 190,
      width: 300,
      height: 180,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    })

    cardB.getBoundingClientRect = () => ({
      left: 10,
      top: 120,
      right: 310,
      bottom: 300,
      width: 300,
      height: 180,
      x: 10,
      y: 120,
      toJSON: () => ({}),
    })

    const violations = detectComponentOverlaps(container)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]?.labelA).toContain("操作控制")
    expect(violations[0]?.labelB).toContain("系统日志")
    expect(violations[0]?.intersection.height).toBe(70)
  })

  it("positive control 2: 包含关系的父子嵌套组件不被误判为遮盖", () => {
    // 父 SectionCard 内部包含 ExecuteButton（正常层级）
    const surface = createMockSurface(800, 600, "regular")
    const { container } = render(
      <NodeMountWrapper nodeId="test-nested" surface={surface}>
        <div data-slot="md3e-section-card" data-testid="parent-card">
          <h3>操作门</h3>
          <div data-slot="primary-action" data-testid="nested-action">
            <button type="button">规划扫描</button>
          </div>
        </div>
      </NodeMountWrapper>,
    )

    const parent = container.querySelector('[data-testid="parent-card"]') as HTMLElement
    const child = container.querySelector('[data-testid="nested-action"]') as HTMLElement

    parent.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      right: 310,
      bottom: 210,
      width: 300,
      height: 200,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    })

    child.getBoundingClientRect = () => ({
      left: 30,
      top: 140,
      right: 290,
      bottom: 190,
      width: 260,
      height: 50,
      x: 30,
      y: 140,
      toJSON: () => ({}),
    })

    const violations = detectComponentOverlaps(container)
    expect(violations).toHaveLength(0)
  })

  // 节点遍历矩阵：测试各个典型复杂节点在每个宽高与布局模式下的排版安全性
  const TEST_NODES: Array<{
    id: string
    name: string
    Component: React.ComponentType<any>
  }> = [
    { id: "samea", name: "SameA", Component: SameaComponent },
    { id: "cleanf", name: "CleanF", Component: CleanfComponent },
    { id: "crashu", name: "CrashU", Component: CrashuComponent },
    { id: "bitv", name: "BitV", Component: BitvComponent },
    { id: "sleept", name: "Sleept", Component: SleeptComponent },
    { id: "timeu", name: "TimeU", Component: TimeuComponent },
  ]

  // 扩展的尺寸矩阵（包含 ADR-0034 标准 4 档 + 极窄、短视窗、紧凑卡片）
  const TEST_SPECS: Array<AdaptiveContainerSpec & { surfaceMode?: NodeSurfaceMode }> = [
    ...ADAPTIVE_CONTAINER_CASES,
    {
      id: "tall-narrow",
      label: "极窄折叠 (200x80)",
      width: 200,
      height: 80,
      aspectRatio: 200 / 80,
      surfaceMode: "collapsed",
      expectation: { allowSecondaryActionCollapse: true, forceSingleColumn: true, allowHeroHeaderHide: true },
    },
    {
      id: "short-wide",
      label: "紧凑卡片 (420x280)",
      width: 420,
      height: 280,
      aspectRatio: 420 / 280,
      surfaceMode: "compact",
      expectation: { allowSecondaryActionCollapse: true, forceSingleColumn: false, allowHeroHeaderHide: true },
    },
    {
      id: "tall-narrow",
      label: "竖屏紧凑 (390x640)",
      width: 390,
      height: 640,
      aspectRatio: 390 / 640,
      surfaceMode: "portrait",
      expectation: { allowSecondaryActionCollapse: false, forceSingleColumn: true, allowHeroHeaderHide: false },
    },
  ]

  for (const node of TEST_NODES) {
    describe(`节点 [${node.name}] 跨宽高与布局形式防遮盖验证`, () => {
      for (const spec of TEST_SPECS) {
        it(`在 ${spec.label} (${spec.width}×${spec.height}) 下组件结构完整且无互相遮盖隐患`, () => {
          const surface = createMockSurface(spec.width, spec.height, spec.surfaceMode)
          const host = createMockHost(node.id)

          const { container } = render(
            <NodeMountWrapper nodeId={node.id} surface={surface}>
              <node.Component compId={node.id} host={host} />
            </NodeMountWrapper>,
          )

          // 1. 验证节点根容器成功挂载
          const surfaceEl = container.querySelector('[data-slot="md3e-node-surface"]')
          expect(surfaceEl).not.toBeNull()

          // 2. 检查关键防御性类名与属性：
          // 根节点必须声明 overflow-hidden 与 min-w-0 / min-h-0 防塌陷
          expect(surfaceEl?.className).toContain("overflow-hidden")
          expect(surfaceEl?.className).toContain("min-w-0")
          expect(surfaceEl?.className).toContain("min-h-0")

          // 3. 检查是否有因 flex-1 压制造成的直接溢出遮挡
          // 查找所有 section-card，验证没有卡片被设置为危险的负 margin
          const cards = container.querySelectorAll<HTMLElement>('[data-slot="md3e-section-card"]')
          cards.forEach((card) => {
            expect(card.style.marginTop).not.toMatch(/^-\d+/)
            expect(card.style.top).not.toMatch(/^-\d+/)
          })

          // 4. 执行组件互相遮盖检测（如果为已 mock 几何环境）
          const violations = detectComponentOverlaps(container)
          expect(violations).toHaveLength(0)
        })
      }
    })
  }
})
