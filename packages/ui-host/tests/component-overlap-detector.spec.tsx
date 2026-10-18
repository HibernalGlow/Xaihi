// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import {
  computeRectIntersection,
  detectComponentOverlaps,
  getElementComponentLabel,
  isElementVisiblyRendered,
  type OverlapRect,
} from "@/nodes/shared/componentOverlapDetector"

describe("componentOverlapDetector (互相遮盖检测算法与阳性对照)", () => {
  it("accurately calculates bounding rect intersection for overlapping boxes", () => {
    const boxA: OverlapRect = { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50 }
    const boxB: OverlapRect = { left: 50, top: 30, right: 150, bottom: 80, width: 100, height: 50 }

    const intersection = computeRectIntersection(boxA, boxB)
    expect(intersection).not.toBeNull()
    expect(intersection?.left).toBe(50)
    expect(intersection?.top).toBe(30)
    expect(intersection?.right).toBe(110)
    expect(intersection?.bottom).toBe(60)
    expect(intersection?.width).toBe(60)
    expect(intersection?.height).toBe(30)
    expect(intersection?.area).toBe(1800)
  })

  it("returns null intersection for completely disjoint boxes", () => {
    const boxA: OverlapRect = { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 }
    const boxB: OverlapRect = { left: 120, top: 0, right: 220, bottom: 50, width: 100, height: 50 }

    expect(computeRectIntersection(boxA, boxB)).toBeNull()
  })

  it("extracts readable labels from slot, title and testid attributes", () => {
    const div = document.createElement("div")
    div.setAttribute("data-slot", "md3e-section-card")
    div.innerHTML = "<h3 class='font-black'>操作门</h3>"

    const label = getElementComponentLabel(div)
    expect(label).toContain('[slot="md3e-section-card"]')
    expect(label).toContain('"操作门"')
  })

  it("positive control: detect intentional overlap between sibling section cards", () => {
    // 阳性对照：故意构造两个位置重叠的独立卡片组件
    const container = document.createElement("div")
    document.body.appendChild(container)

    const cardA = document.createElement("div")
    cardA.setAttribute("data-slot", "md3e-section-card")
    cardA.innerHTML = "<h3>Card A: 操作门</h3>"

    const cardB = document.createElement("div")
    cardB.setAttribute("data-slot", "md3e-section-card")
    cardB.innerHTML = "<h3>Card B: 系统日志</h3>"

    container.appendChild(cardA)
    container.appendChild(cardB)

    // 在 happy-dom 中通过 mock getBoundingClientRect 模拟真实渲染下的物理重叠位置
    // cardA 占据 (left: 0, top: 0, right: 300, bottom: 200)
    // cardB 占据 (left: 0, top: 150, right: 300, bottom: 350) -> 重叠 (top: 150 到 200，高度 50px)
    cardA.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    cardB.getBoundingClientRect = () => ({
      left: 0,
      top: 150,
      right: 300,
      bottom: 350,
      width: 300,
      height: 200,
      x: 0,
      y: 150,
      toJSON: () => ({}),
    })

    const violations = detectComponentOverlaps(container, { threshold: 4 })
    expect(violations).toHaveLength(1)
    expect(violations[0]?.labelA).toContain("操作门")
    expect(violations[0]?.labelB).toContain("系统日志")
    expect(violations[0]?.intersection.height).toBe(50)
    expect(violations[0]?.intersection.width).toBe(300)

    document.body.removeChild(container)
  })

  it("passes cleanly when sibling components are neatly stacked without overlap", () => {
    // 正常流式排布：卡片 A 在 (0, 0, 300, 200)，卡片 B 在 (0, 210, 300, 410)，间距 10px
    const container = document.createElement("div")
    document.body.appendChild(container)

    const cardA = document.createElement("div")
    cardA.setAttribute("data-slot", "md3e-section-card")
    const cardB = document.createElement("div")
    cardB.setAttribute("data-slot", "md3e-section-card")

    container.appendChild(cardA)
    container.appendChild(cardB)

    cardA.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    cardB.getBoundingClientRect = () => ({
      left: 0,
      top: 210,
      right: 300,
      bottom: 410,
      width: 300,
      height: 200,
      x: 0,
      y: 210,
      toJSON: () => ({}),
    })

    const violations = detectComponentOverlaps(container)
    expect(violations).toHaveLength(0)

    document.body.removeChild(container)
  })

  it("ignores parent-child nested components: nested slots are valid layout hierarchy", () => {
    // 包含关系：父 SectionCard 内部包含一个 ExecuteButton（data-slot="primary-action"），不应视为互相遮盖
    const container = document.createElement("div")
    document.body.appendChild(container)

    const card = document.createElement("div")
    card.setAttribute("data-slot", "md3e-section-card")

    const action = document.createElement("div")
    action.setAttribute("data-slot", "primary-action")
    card.appendChild(action)
    container.appendChild(card)

    card.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    action.getBoundingClientRect = () => ({
      left: 20,
      top: 150,
      right: 280,
      bottom: 190,
      width: 260,
      height: 40,
      x: 20,
      y: 150,
      toJSON: () => ({}),
    })

    const violations = detectComponentOverlaps(container)
    expect(violations).toHaveLength(0)

    document.body.removeChild(container)
  })
})
