// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest"

import { useWorkspaceStore } from "@/store/workspaceStore"

import { mergePersistedWorkspaceUi, selectWorkspaceActions, selectWorkspaceUiPreferences as selectPersistedPrefs } from "@/store/workspaceStore"
import { selectWorkspaceUiPreferences as selectHostUiPrefs } from "@/components/workspace/AppConfigSync"
import { INITIAL_STATE } from "@/store/workspace/constants"
import { DEFAULT_DESIGN_THEME } from "@/lib/design-theme/contract"
import type { WSStore, WorkspaceUiPreferences } from "@/store/workspace/types"

/**
 * 工作区 UI 偏好有**两份**挑选清单：一份喂 zustand persist（localStorage），
 * 一份喂宿主持久化（`[app.ui.workspace]`）。两份都是手写的字段枚举，
 * 加一个偏好只改一处就会静默半边失效。
 *
 * 这条测试不假装两份清单已经等价——`KNOWN_LOCAL_ONLY` 是 2026-10-05 实测出来的
 * 既存漂移记账（见下面的注释），不是设计意图。它的价值在于：
 *  - 新加的偏好若只进了一份清单，当场红；
 *  - 想让某个字段成为「有意只留本地」，必须显式写进这份名单并说明理由；
 *  - 反过来，把本地-only 字段补齐到宿主清单时，这条测试会逼着把它从名单里删掉。
 */
const KNOWN_LOCAL_ONLY: Record<string, string> = {
  hazardMode: "既存漂移，不是设计：字段在 WorkspaceUiPreferences 里、在 store 清单里，但 AppConfigSync 的清单没有它（全仓无注释说明刻意）。"
    + "副作用待核：mergeMissingWorkspacePreferences 会用默认值回填缺失键，因此本机 hazardMode 可能在每次启动被 false 覆盖。不在本任务范围内修。",
  laneWorkspacePreferences: "既存漂移，同上；按 workspaceId 键控的泳道偏好，业务数据本应走宿主/SQLite，落点待定。不在本任务范围内修。",
}

function keySet(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort()
}

function difference(left: string[], right: string[]): string[] {
  const other = new Set(right)
  return left.filter((key) => !other.has(key))
}

describe("workspace UI preference persistence lists stay accounted", () => {
  const state = INITIAL_STATE as unknown as WSStore
  const persisted = selectPersistedPrefs(state) as unknown as Record<string, unknown>
  const host = selectHostUiPrefs(persisted as unknown as WorkspaceUiPreferences) as unknown as Record<string, unknown>

  test("the two lists differ only by explicitly accounted keys", () => {
    const localOnly = difference(keySet(persisted), keySet(host))
    const hostOnly = difference(keySet(host), keySet(persisted))
    expect(hostOnly, "宿主清单里有 store 清单没有的字段（反向漂移同样是坏）").toEqual([])
    expect(localOnly.sort()).toEqual(Object.keys(KNOWN_LOCAL_ONLY).sort())
    expect(keySet(persisted).length, "清单空着的话上面的等式是假绿").toBeGreaterThan(30)
  })

  test("the advanced theme is persisted on both sides and survives byte-identical", () => {
    expect(persisted.designTheme).toEqual(DEFAULT_DESIGN_THEME)
    expect(host.designTheme).toEqual(DEFAULT_DESIGN_THEME)
    expect(JSON.stringify(host.designTheme)).toBe(JSON.stringify(persisted.designTheme))
  })

  test("the comparison sees a one-sided field (falsification control)", () => {
    // 尺必须能看见「只加了一处」这种坏：这里模拟有人只改了宿主那份清单。
    const oneSided = { ...host, brandNewPreference: true }
    expect(difference(keySet(oneSided), keySet(persisted)).concat(difference(keySet(host), keySet(oneSided)))
      .sort()).toEqual(["brandNewPreference"])
    // 反向对照：真正的等长清单不该报出任何东西。
    expect(difference(keySet(host), keySet(persisted))).toEqual([])
  })

  test("every action implemented on the store is forwarded by the actions selector", () => {
    // 第四份手写清单：`selectWorkspaceActions` 逐个转发 action。少转发一条，界面拿到的
    // 就是 undefined 并在点击时崩——本轮 `setDesignTheme` 就是这么被撞出来的（浏览器测试抓到）。
    const store = useWorkspaceStore.getState() as unknown as Record<string, unknown>
    const implemented = Object.keys(store).filter((key) => typeof store[key] === "function").sort()
    const forwarded = Object.keys(selectWorkspaceActions(store as never)).sort()
    expect(implemented.length, "store 上一个 action 都没有的话这条断言是假绿").toBeGreaterThan(20)
    expect(difference(implemented, forwarded), `实现了但没转发的 action: ${difference(implemented, forwarded).join(", ")}`).toEqual([])
    expect(difference(forwarded, implemented), `转发清单里有 store 没有的名字`).toEqual([])
  })

  test("every accounted local-only key still carries its reason", () => {
    for (const [key, reason] of Object.entries(KNOWN_LOCAL_ONLY)) {
      expect(reason.length, `${key} 的记账理由不能是空的`).toBeGreaterThan(40)
      expect(persisted, `${key} 已经不在 store 清单里了，名单该删`).toHaveProperty(key)
    }
  })
})

/** 加 `mondrian` 字段之前落盘的 `designTheme` 形状（用户机器上真实存在过的那份）。 */
const legacySnapshot = {
  v: 3,
  state: {
    theme: "tori",
    designTheme: {
      id: "md3",
      dimensions: { ...DEFAULT_DESIGN_THEME.dimensions },
      md3: { ...DEFAULT_DESIGN_THEME.md3 },
    },
  },
}

/**
 * `designTheme` 是嵌套配置，所以它有两个「半成品」来源，两个都必须进 store 前过解析器：
 *  1. localStorage 里那份快照是**加字段之前**写的（没有 `mondrian`），zustand 自己 hydrate，
 *     不经过 `sanitizeUiPreferences`；
 *  2. 界面那条 `{...config, id}` 的展开会沿用当前 config 的形状。
 * 2026-10-05 实机崩的就是 1+2 的组合：hydrate 带回没有 `mondrian` 的快照 → 切到风格派 →
 * 读 `config.mondrian.accent` 报 `undefined is not an object`。
 */
describe("partial advanced-theme configs cannot enter the store", () => {
  test("the fixture really is a pre-mondrian shape (falsification control)", () => {
    const theme = legacySnapshot.state.designTheme as unknown as Record<string, unknown>
    expect(Object.keys(theme)).toEqual(["id", "dimensions", "md3"])
    expect(theme.mondrian).toBeUndefined()
  })

  test("hydrating a legacy snapshot produces a complete config", () => {
    const current = useWorkspaceStore.getState()
    const merged = mergePersistedWorkspaceUi(legacySnapshot.state, current)
    expect(merged.designTheme.id).toBe("md3")
    expect(merged.designTheme.mondrian).toEqual(DEFAULT_DESIGN_THEME.mondrian)
    // 第四、第五份配方同理：这份快照连 `swiss`/`lonestar` 这两个键都不存在，
    // 清洗之后必须补齐，否则设置面板一选到它们就是 `undefined is not an object`。
    expect(merged.designTheme.swiss).toEqual(DEFAULT_DESIGN_THEME.swiss)
    expect(merged.designTheme.lonestar).toEqual(DEFAULT_DESIGN_THEME.lonestar)
    // 别的字段不许被这条清洗牵连掉。
    expect(merged.theme).toBe("tori")
    expect(merged.setDesignTheme, "actions 不能被合并过程弄丢").toBeTypeOf("function")
  })

  test("the picker's spread survives both entry points", () => {
    const current = useWorkspaceStore.getState()
    const before = current.designTheme
    const legacy = mergePersistedWorkspaceUi({ designTheme: legacySnapshot.state.designTheme }, current).designTheme
    expect(legacy.mondrian).toEqual(DEFAULT_DESIGN_THEME.mondrian)

    // 这一句就是崩溃现场：拿旧形状的配置换 id，再交给 store 的唯一写入点。
    const spread = { ...legacy, id: "mondrian" as const }
    expect((spread as unknown as Record<string, unknown>).mondrian).toBeDefined()
    try {
      current.setDesignTheme(spread)
      const stored = useWorkspaceStore.getState().designTheme
      expect(stored.id).toBe("mondrian")
      expect(stored.mondrian).toEqual(DEFAULT_DESIGN_THEME.mondrian)

    // 新配方的分支同理：面板的分支条件就是 `config.id === "swiss"`，
    // 换 id 的那一下如果没带 options，渲染时读 `config.swiss.ruleWeight` 就崩。
    for (const id of ["swiss", "lonestar"] as const) {
      const spreadNew = { ...legacy, id }
      current.setDesignTheme(spreadNew)
      const storedNew = useWorkspaceStore.getState().designTheme
      expect(storedNew.id).toBe(id)
      expect(storedNew[id], `${id} 的 options 没被补齐`).toEqual(DEFAULT_DESIGN_THEME[id])
    }

      // setter 也要挡住「直接塞半成品」这条路（未来的调用方不一定是界面）。
      current.setDesignTheme({ id: "mondrian" } as unknown as typeof stored)
      expect(useWorkspaceStore.getState().designTheme.mondrian).toEqual(DEFAULT_DESIGN_THEME.mondrian)
    } finally {
      current.setDesignTheme(before)
    }
  })
})

/**
 * 上面那条测的是合并函数本身，这条测的是**接线**：persist 的 `merge` 选项真的用了它。
 * 做法是把旧形状写进 localStorage、重置模块图再重新 import 一次 store——只有
 * `persist({... merge: mergePersistedWorkspaceUi })` 真的接上，重建出来的 store 才会带 `mondrian`。
 * 「写了个正确的函数但没人调用」正是这类崩溃能活下来的方式。
 */
describe("a legacy localStorage snapshot hydrates into a complete config", () => {
  test("fresh store creation runs the merge", async () => {
    const key = "xiranite-workspace-ui"
    const previous = localStorage.getItem(key)
    localStorage.setItem(key, JSON.stringify({ state: legacySnapshot.state, version: 3 }))
    try {
      vi.resetModules()
      const mod = await import("@/store/workspaceStore")
      const hydrated = mod.useWorkspaceStore.getState().designTheme
      expect(hydrated.id, "hydrate 之后配方 id 应当保留").toBe("md3")
      expect(hydrated.mondrian, "persist 的 merge 没有接线：mondrian 又变回 undefined 了").toEqual(DEFAULT_DESIGN_THEME.mondrian)
      // 阳性对照：合并函数如果没跑，读到的就正好是磁盘上那份缺字段的形状。
      expect(Object.keys(legacySnapshot.state.designTheme)).not.toContain("mondrian")
    } finally {
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
      vi.resetModules()
    }
  })
})
