// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest"

const setOverlayMock = vi.hoisted(() => vi.fn())
const setViewModeMock = vi.hoisted(() => vi.fn())
const deployComponentMock = vi.hoisted(() => vi.fn())

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => ({}) },
  selectWorkspaceActions: () => ({
    setOverlay: setOverlayMock,
    setViewMode: setViewModeMock,
    deployComponent: deployComponentMock,
  }),
}))

const {
  BUILT_IN_ACTION_IDS,
  executeAction,
  getActionDescriptor,
  getActionViews,
  getRegisteredActionIds,
  installGlobalActionKeys,
  nodeActionId,
  NODE_ACTION_IDS,
  registerAction,
  syncActionContext,
  unregisterAction,
} = await import("./index")

function viewFor(id: string) {
  return getActionViews().find((view) => view.id === id)
}

beforeEach(() => {
  setOverlayMock.mockClear()
  setViewModeMock.mockClear()
  syncActionContext({
    viewMode: "cards",
    activeOperationCount: 0,
    devRuntimeActive: false,
  })
})

describe("内建动作注册表", () => {
  test("七个内建动作全部注册，且未注册的 id 不在表里", () => {
    const registered = getRegisteredActionIds()
    for (const id of BUILT_IN_ACTION_IDS) {
      expect(registered).toContain(id)
    }
    // 阳性对照：这把尺必须能区分「在」与「不在」。
    expect(registered).not.toContain("workspace.this-action-does-not-exist")
  })

  test("节点派生动作由模块表注册，并能执行到 deployComponent", () => {
    expect(NODE_ACTION_IDS.length, "模块表一项都没有的话这条测就是假绿").toBeGreaterThan(0)
    const id = nodeActionId("trename")
    expect(getRegisteredActionIds()).toContain(id)
    expect(getActionDescriptor(id)?.category).toBe("node")
    expect(executeAction(id)).toBe(true)
    // viewMode 从上下文来：默认快照是 "cards"。
    expect(deployComponentMock).toHaveBeenCalledWith("trename", "cards")
    deployComponentMock.mockClear()
    // 阳性对照：不存在的模块 id 不许被凭空执行。
    expect(executeAction(nodeActionId("no-such-module"))).toBe(false)
    expect(deployComponentMock).not.toHaveBeenCalled()
  })

  test("视图数量跟着注册表走，不是写死的", () => {
    const before = getActionViews().length
    // 注册表里除了七个内建还有节点派生动作（模块表有多少就有多少），
    // 所以这里只断言「可见视图数 = 已注册数」与「内建全在册」，不锁绝对值。
    expect(before).toBe(getRegisteredActionIds().length)
    expect(before).toBeGreaterThanOrEqual(BUILT_IN_ACTION_IDS.length)
    registerAction({
      id: "test.extra-action",
      category: "system",
      labelKey: "test:extra",
      presentation: "command",
      // 排在节点派生动作（1000+）之后，才能断言「order 决定末格」。
      order: 9999,
      run: () => {},
    })
    expect(getActionViews().length).toBe(before + 1)
    expect(getActionViews().at(-1)?.id).toBe("test.extra-action")
    unregisterAction("test.extra-action")
    expect(getActionViews().length).toBe(before)
  })

  test("重复注册同一个 id 会抛错（注册表只许有一份真源）", () => {
    expect(() => {
      registerAction({
        id: "workspace.history",
        category: "workspace",
        labelKey: "topbar:history",
        presentation: "command",
        order: 20,
        run: () => {},
      })
    }).toThrow(/重复注册/)
  })
})

describe("执行语义", () => {
  test("command 类动作执行到 store 动作", () => {
    expect(executeAction("workspace.registry")).toBe(true)
    expect(setOverlayMock).toHaveBeenCalledWith("registry")
    setOverlayMock.mockClear()
    expect(executeAction("workspace.history")).toBe(true)
    expect(setOverlayMock).toHaveBeenCalledWith("history")
    setOverlayMock.mockClear()
    expect(executeAction("workspace.deletions")).toBe(true)
    expect(setOverlayMock).toHaveBeenCalledWith("deletions")
    setOverlayMock.mockClear()
    expect(executeAction("workspace.operations")).toBe(true)
    expect(setOverlayMock).toHaveBeenCalledWith("operations")
  })

  test("弹层类动作不在注册表里执行，交给渲染器开自己的锚定弹层", () => {
    expect(getActionDescriptor("theme.switcher")?.presentation).toBe("popover")
    expect(executeAction("theme.switcher")).toBe(false)
    expect(setOverlayMock).not.toHaveBeenCalled()
  })

  test("上下文真的进了 run：dashboard 在两种 viewMode 下走两个方向", () => {
    expect(executeAction("workspace.dashboard")).toBe(true)
    expect(setViewModeMock).toHaveBeenLastCalledWith("dashboard")

    syncActionContext({
      viewMode: "dashboard",
      activeOperationCount: 0,
      devRuntimeActive: false,
    })
    expect(viewFor("workspace.dashboard")?.toggled).toBe(true)
    expect(executeAction("workspace.dashboard")).toBe(true)
    expect(setViewModeMock).toHaveBeenLastCalledWith("cards")
  })

  test("角标与激活态由上下文驱动", () => {
    syncActionContext({
      viewMode: "cards",
      activeOperationCount: 12,
      devRuntimeActive: true,
    })
    expect(viewFor("workspace.operations")?.badge).toBe(12)
    expect(viewFor("workspace.operations")?.indicator).toBe("badge")
    expect(viewFor("workspace.runtime")?.indicator).toBe("dot")
    expect(viewFor("workspace.runtime")?.toggled).toBe(true)
    expect(viewFor("workspace.history")?.badge).toBe(0)
  })

  test("isEnabled 为假时不执行，也不回调 run", () => {
    let ran = 0
    registerAction({
      id: "test.gated-action",
      category: "system",
      labelKey: "test:gated",
      presentation: "command",
      order: 998,
      isEnabled: () => false,
      run: () => {
        ran += 1
      },
    })
    expect(viewFor("test.gated-action")?.enabled).toBe(false)
    expect(executeAction("test.gated-action")).toBe(false)
    expect(ran).toBe(0)
    unregisterAction("test.gated-action")
  })
})

describe("全局键位", () => {
  /**
   * `@lumino/keyboard` 查表用的是 `event.keyCode`（`node_modules/@lumino/keyboard/dist/index.es6.js:101`），
   * 而 happy-dom 的 KeyboardEvent 构造器不填这个已废弃字段——真实 WebView 会填。
   * 所以夹具必须显式补 keyCode，否则这条测的是 happy-dom 而不是键位。
   */
  function fireKey(key: string, keyCode: number, modifiers: { ctrl?: boolean; shift?: boolean }) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: modifiers.ctrl === true,
      shiftKey: modifiers.shift === true,
    })
    Object.defineProperty(event, "keyCode", { value: keyCode })
    document.body.dispatchEvent(event)
  }

  test("注册时带的 keys 经同一条 keydown 派发就能执行", () => {
    let ran = 0
    registerAction({
      id: "test.keyed-action",
      category: "system",
      labelKey: "test:keyed",
      presentation: "command",
      order: 997,
      keys: ["Ctrl Shift J"],
      run: () => {
        ran += 1
      },
    })
    const detach = installGlobalActionKeys()
    try {
      fireKey("J", 74, { ctrl: true, shift: true })
      expect(ran).toBe(1)
      // 阳性对照：修饰键不全时不许触发。
      fireKey("J", 74, { ctrl: true })
      expect(ran).toBe(1)
    } finally {
      detach()
      unregisterAction("test.keyed-action")
    }
  })
})
