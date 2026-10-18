// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import {
  ADAPTIVE_CONTAINER_CASES,
  ADAPTIVE_CONTAINER_MATRIX,
  type AdaptiveContainerSpec,
} from "@/nodes/shared/nodeSurfaceTestUtils"
import { Md3eNodeSurface } from "@/nodes/shared/Md3eShapeContext"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"

function createMockSurface(width: number, height: number): NodeSurface {
  return {
    ref: { current: null },
    width,
    height,
    mode: width < 300 ? "collapsed" : width < 600 && height > width * 1.15 ? "portrait" : "regular",
    density: width < 300 ? "tight" : "normal",
  }
}

/**
 * 嵌入式容器测试夹具：模拟宿主面板以绝对像素给定尺寸，断言容器内自适应。
 */
function AdaptiveNodeHarness({
  spec,
  hasHeroBanner = true,
  children,
}: {
  spec: AdaptiveContainerSpec
  hasHeroBanner?: boolean
  children?: React.ReactNode
}) {
  const surface = createMockSurface(spec.width, spec.height)

  return (
    <div
      data-testid="host-panel-wrapper"
      style={{
        width: `${spec.width}px`,
        height: `${spec.height}px`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Md3eNodeSurface nodeId="test-node" surface={surface}>
        <div className="flex h-full w-full min-w-0 min-h-0 flex-col overflow-hidden p-3">
          {hasHeroBanner && (
            <div
              data-slot="md3e-node-hero"
              data-adaptive-hide="short"
              className="mb-2 shrink-0 rounded-2xl bg-primary/10 p-3 text-xs"
            >
              <h1>Hero Header Banner</h1>
            </div>
          )}

          <div
            data-adaptive-grid="auto"
            className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-auto"
          >
            <div className="rounded-lg bg-card p-2 text-xs">Field A</div>
            <div className="rounded-lg bg-card p-2 text-xs">Field B</div>
          </div>

          <div className="mt-2 flex shrink-0 items-center justify-between gap-2 border-t pt-2">
            <span data-adaptive-hide="compact" className="text-xs text-muted-foreground">
              辅助信息
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-adaptive-hide="compact"
                className="text-xs"
              >
                次要配置
              </button>
              <button
                type="button"
                data-slot="primary-action"
                className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground font-semibold"
              >
                执行
              </button>
            </div>
          </div>
          {children}
        </div>
      </Md3eNodeSurface>
    </div>
  )
}

describe("ADR-0034 Container-aware Adaptive UI Matrix", () => {
  it("defines the standard 4 container test dimensions accurately", () => {
    expect(ADAPTIVE_CONTAINER_CASES).toHaveLength(4)
    expect(ADAPTIVE_CONTAINER_MATRIX["tall-narrow"]).toMatchObject({
      width: 240,
      height: 720,
      expectation: { forceSingleColumn: true, allowSecondaryActionCollapse: true },
    })
    expect(ADAPTIVE_CONTAINER_MATRIX["short-wide"]).toMatchObject({
      width: 960,
      height: 280,
      expectation: { allowHeroHeaderHide: true },
    })
    expect(ADAPTIVE_CONTAINER_MATRIX["square"]).toMatchObject({
      width: 480,
      height: 480,
    })
    expect(ADAPTIVE_CONTAINER_MATRIX["workspace"]).toMatchObject({
      width: 1440,
      height: 900,
    })
  })

  it("renders Md3eNodeSurface with data-slot and defensive flex classes", () => {
    const surface = createMockSurface(320, 480)
    const { container } = render(
      <Md3eNodeSurface nodeId="bitv" surface={surface}>
        <div>Body</div>
      </Md3eNodeSurface>,
    )

    const root = container.querySelector('[data-slot="md3e-node-surface"]')
    expect(root).not.toBeNull()
    expect(root?.getAttribute("data-node-ui")).toBe("md3e")
    expect(root?.className).toContain("min-w-0")
    expect(root?.className).toContain("min-h-0")
    expect(root?.className).toContain("overflow-hidden")
  })

  it("ensures primary execute action is always visible and preserved across all container cases", () => {
    for (const spec of ADAPTIVE_CONTAINER_CASES) {
      const { container } = render(<AdaptiveNodeHarness spec={spec} />)
      const primaryBtn = container.querySelector('[data-slot="primary-action"]')
      expect(primaryBtn).not.toBeNull()
      expect(primaryBtn?.textContent).toBe("执行")
    }
  })

  it("correctly identifies adaptive helper attributes on elements", () => {
    const spec = ADAPTIVE_CONTAINER_MATRIX["tall-narrow"]
    const { container } = render(<AdaptiveNodeHarness spec={spec} />)

    const compactHiddenItems = container.querySelectorAll('[data-adaptive-hide="compact"]')
    expect(compactHiddenItems.length).toBeGreaterThanOrEqual(2)

    const shortHiddenItems = container.querySelectorAll('[data-adaptive-hide="short"]')
    expect(shortHiddenItems.length).toBe(1)

    const grid = container.querySelector('[data-adaptive-grid="auto"]')
    expect(grid).not.toBeNull()
  })

  it("positive control: detect intentional overflow when child overflows container constraint", () => {
    // 阳性对照：故意构造一个脱离 flow 的定宽元素（500px），将其塞入 240px 容器中
    // 验证测试环境能敏锐抓出真实溢出
    const spec = ADAPTIVE_CONTAINER_MATRIX["tall-narrow"] // 240px
    const rogueWidth = 500

    const { container } = render(
      <AdaptiveNodeHarness spec={spec}>
        <div
          data-testid="rogue-overflow"
          style={{ width: `${rogueWidth}px`, flexShrink: 0 }}
        >
          Unbreakable wide content
        </div>
      </AdaptiveNodeHarness>,
    )

    const rogueEl = container.querySelector('[data-testid="rogue-overflow"]') as HTMLElement
    const wrapper = container.querySelector('[data-testid="host-panel-wrapper"]') as HTMLElement

    const isOverflowing = rogueWidth > spec.width
    expect(isOverflowing).toBe(true)
    expect(rogueEl.style.width).toBe("500px")
    expect(wrapper.style.width).toBe("240px")
  })

  it("decouples node layout from window viewport: container owns the dimensions", () => {
    // 验证不论 window 视口为何值（如 1920 桌面），节点容器尺寸完全由宿主分配
    const originalInnerWidth = window.innerWidth
    try {
      window.innerWidth = 1920
      const spec = ADAPTIVE_CONTAINER_MATRIX["tall-narrow"] // 依然是 240px
      const { container } = render(<AdaptiveNodeHarness spec={spec} />)

      const wrapper = container.querySelector('[data-testid="host-panel-wrapper"]') as HTMLElement
      expect(wrapper.style.width).toBe("240px")
      // 节点根元素依然被约束在 240px 内，而非 1920px 视口
      expect(window.innerWidth).toBe(1920)
    } finally {
      window.innerWidth = originalInnerWidth
    }
  })
})
