import { describe, expect, test } from "vitest"

import {
  WHEEL_HIDDEN_COLUMN,
  WHEEL_VISIBLE_COLUMN,
  applyWheelLayout,
  mergeWheelKanbanColumns,
  normalizeWheelActionOrder,
  normalizeWheelHiddenActions,
  splitWheelKanbanColumns,
} from "./wheelPreferences"

const ALL = ["a", "b", "c", "d"] as const

describe("归一化", () => {
  test("未知 id 被丢掉，已知 id 保留（成对对照）", () => {
    expect(normalizeWheelActionOrder(ALL, ["b", "ghost", "a"])).toEqual(["b", "a", "c", "d"])
  })

  test("注册表里新增的动作自动补在尾部，不会凭空消失", () => {
    expect(normalizeWheelActionOrder([...ALL, "e"], ["a", "b"])).toEqual(["a", "b", "c", "d", "e"])
  })

  test("重复项折叠、非字符串项忽略", () => {
    expect(normalizeWheelActionOrder(ALL, ["a", "a", 1, null, "c"])).toEqual(["a", "c", "b", "d"])
  })

  test("隐藏列表按注册表顺序输出，且只含已知 id", () => {
    expect(normalizeWheelHiddenActions(ALL, ["d", "ghost", "b", "d"])).toEqual(["b", "d"])
  })
})

describe("两列 kanban", () => {
  test("拆分后两列的并集等于全表且互不相交", () => {
    const columns = splitWheelKanbanColumns(ALL, ["c", "a", "b", "d"], ["a"])
    expect(columns[WHEEL_VISIBLE_COLUMN]).toEqual(["c", "b", "d"])
    expect(columns[WHEEL_HIDDEN_COLUMN]).toEqual(["a"])
    const union = [...columns[WHEEL_VISIBLE_COLUMN], ...columns[WHEEL_HIDDEN_COLUMN]]
    expect(union.length).toBe(new Set(union).size)
    expect([...union].sort()).toEqual([...ALL].sort())
  })

  test("拆完再合：可见子序列与隐藏集合保住，第二轮起完全稳定", () => {
    const order = ["d", "a", "c", "b"]
    const hidden = ["c"]
    const columns = splitWheelKanbanColumns(ALL, order, hidden)
    const merged = mergeWheelKanbanColumns(ALL, columns)
    // 已知损失（与节点卡片那套同源）：合并时按「可见列在前、隐藏列在后」拼接，
    // 所以被藏起来的项在 order 里的原始插位会丢。可见部分的相对顺序不受影响，
    // 而轮盘渲染前会先滤掉隐藏项，因此这个损失不落到界面上。
    expect(merged.order.filter((id) => !merged.hiddenActions.includes(id))).toEqual(
      columns[WHEEL_VISIBLE_COLUMN],
    )
    expect(merged.hiddenActions).toEqual(["c"])
    const second = mergeWheelKanbanColumns(ALL, splitWheelKanbanColumns(ALL, merged.order, merged.hiddenActions))
    expect(second).toEqual(merged)
  })
})

describe("作用到轮盘布局", () => {
  const views = ALL.map((id, index) => ({ id, order: index }))

  test("顺序真的由偏好决定（反过来排就得到反过来的结果）", () => {
    const forward = applyWheelLayout(views, { order: ["a", "b", "c", "d"], hiddenActions: [] }, 8)
    const backward = applyWheelLayout(views, { order: ["d", "c", "b", "a"], hiddenActions: [] }, 8)
    expect(forward.map((view) => view.id)).toEqual(["a", "b", "c", "d"])
    expect(backward.map((view) => view.id)).toEqual(["d", "c", "b", "a"])
  })

  test("隐藏项出局，取消隐藏又回来", () => {
    const hidden = applyWheelLayout(views, { order: [...ALL], hiddenActions: ["b"] }, 8)
    expect(hidden.map((view) => view.id)).toEqual(["a", "c", "d"])
    const shown = applyWheelLayout(views, { order: [...ALL], hiddenActions: [] }, 8)
    expect(shown.map((view) => view.id)).toEqual([...ALL])
  })

  test("截到上限，且截掉的是 order 尾部而不是输入尾部", () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({ id: `x${index}`, order: index }))
    // 把 x0 排到最后：它应当是被挤出 8 格的那一个。
    const layout = applyWheelLayout(nine, { order: ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x0"], hiddenActions: [] }, 8)
    expect(layout.map((view) => view.id)).toEqual(["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"])
    expect(layout).not.toContainEqual({ id: "x0", order: 0 })
  })

  test("空偏好退化成注册表原序（新动作不会因为没配过就消失）", () => {
    expect(applyWheelLayout(views, { order: [], hiddenActions: [] }, 8).map((view) => view.id)).toEqual([...ALL])
  })
})
