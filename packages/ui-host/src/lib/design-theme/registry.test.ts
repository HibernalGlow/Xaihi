import { describe, expect, test } from "vitest"

import en from "@/i18n/locales/en.json"
import zh from "@/i18n/locales/zh.json"
import {
  ALL_DIMENSIONS_ON,
  DEFAULT_DESIGN_THEME,
  WULING_CORNER_STEPS,
  normalizeDesignThemeConfig,
  type DesignThemeConfig,
} from "./contract"
import { DESIGN_THEME_ENTRIES, resolveDesignTheme } from "./registry"
import { WULING_PRESET_COLORS } from "./wuling/spec"
import { LONESTAR_BRIDGED_COLORS } from "./lonestar/spec"

/**
 * 注册表这条链上最容易「静默半边失效」的不是解析器，是那张手抄清单：
 * 每加一份配方，至少要同时动 registry、契约里的 options、i18n（中英两份）、设置面板分支。
 * 少一个标签界面上就是一个裸 key；少一个分支就是一份「能选到但没有任何控件」的装饰品
 * （本仓真的有过一次「三档组件皮肤没有 CSS 消费者」）。
 */
type Table = Record<string, unknown>

function dig(table: Table, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Table)[part] : undefined), table)
}

/** `settings:designTheme.wuling.label` → settings → designTheme → wuling → label。 */
function keyPath(key: string): string[] {
  const [namespace, ...rest] = key.split(":")
  expect(namespace, `注册表里的 key 都应当带命名空间：${key}`).toBe("settings")
  return rest.join(":").split(".")
}

describe("the design-language registry stays wired on every side", () => {
  test("every registered recipe has a label and a description in both locales", () => {
    expect(DESIGN_THEME_ENTRIES.length, "注册表空了的话下面的循环是假绿").toBeGreaterThanOrEqual(4)
    for (const entry of DESIGN_THEME_ENTRIES) {
      for (const [locale, table] of [["en", en.settings], ["zh", zh.settings]] as const) {
        for (const key of [entry.labelKey, entry.descriptionKey] as const) {
          const value = dig(table as Table, keyPath(key))
          expect(typeof value, `${locale} 里缺 ${key}`).toBe("string")
          expect((value as string).length, `${locale} 的 ${key} 是空串`).toBeGreaterThan(3)
        }
      }
    }
    // 阳性对照：这把尺必须能报出「不存在」，否则上面那一片绿只是 dig() 恒返回同一个东西。
    expect(dig(en.settings as Table, keyPath("settings:designTheme.does-not-exist.label"))).toBeUndefined()
    expect(dig(zh.settings as Table, keyPath("settings:designTheme.does-not-exist.label"))).toBeUndefined()
  })

  test("every recipe that takes over has options the panel can actually render", () => {
    // 「能选到但一个控件都没有」= 装饰品。这里用「契约里有对应的 options 块」当代理判据，
    // 因为面板的分支条件就是 `config.id === <id>`；没有 options 块的配方不可能有分支。
    //
    // 名单**从契约自己推**，不再手抄：上一版是一张写死三名的表，加第四条配方的人必须记得
    // 同时改它——忘了改就是「注册了但这条尺看不见」。现在 id/dimensions 之外的每个键都算
    // 一份 options，并且双向核：注册表里有的必须有，契约里有的必须真的被某条配方用着。
    const optionFields = (Object.keys(DEFAULT_DESIGN_THEME) as (keyof DesignThemeConfig)[])
      .filter((key) => key !== "id" && key !== "dimensions")
      .map((key) => String(key))
    expect(optionFields.length, "契约里一份 options 都没有，下面的循环是假绿").toBeGreaterThanOrEqual(4)
    const registered = DESIGN_THEME_ENTRIES.filter((entry) => entry.id !== "native").map((entry) => entry.id)
    for (const id of registered) {
      expect(optionFields, `配方 ${id} 被注册了，但契约里没有它的 options 块（面板就没有可渲染的控件）`).toContain(id)
      expect(DEFAULT_DESIGN_THEME[id as keyof DesignThemeConfig], `DEFAULT_DESIGN_THEME 缺 ${id}`).toBeTruthy()
      const resolved = resolveDesignTheme(
        { ...DEFAULT_DESIGN_THEME, id: id as DesignThemeConfig["id"] },
        { scheme: "light", activeThemeSeed: null, systemAccentAvailable: false },
      )
      expect(resolved, `注册表里有 ${id}，但 resolveDesignTheme 不给它解析`).toBeTruthy()
    }
    for (const field of optionFields) {
      expect(registered, `契约里有 ${field} 这一份 options，但没有任何配方用它（死数据）`).toContain(field)
    }
  })

  test("the two new recipes survive the persistence boundary", () => {
    const swiss = normalizeDesignThemeConfig({
      id: "swiss",
      dimensions: { ...ALL_DIMENSIONS_ON, elevation: false },
      swiss: { ruleWeight: 3, uppercaseLabels: false },
    })
    expect(swiss.id).toBe("swiss")
    expect(swiss.swiss.uppercaseLabels).toBe(false)
    // 3 不在三个成文出处里（1/2/4），所以**不许**吸附到邻近档：线宽档是「选了哪条规范」
    // 而不是「一个可以插值的数」，野数字必须回默认，不能悄悄变成另一条规范。
    expect(swiss.swiss.ruleWeight).toBe(DEFAULT_DESIGN_THEME.swiss.ruleWeight)
    expect(normalizeDesignThemeConfig({ id: "swiss", swiss: { ruleWeight: 4 } }).swiss.ruleWeight).toBe(4)

    const ls = normalizeDesignThemeConfig({
      id: "lonestar",
      lonestar: { seed: "#3FF7FF", seedSource: "activeTheme", monoFigures: false, uppercaseLabels: false },
    })
    expect(ls.lonestar.seed).toBe("#3ff7ff")
    expect(ls.lonestar.seedSource).toBe("activeTheme")
    expect(ls.lonestar.monoFigures).toBe(false)

    const garbage = normalizeDesignThemeConfig({ id: "lonestar", lonestar: { seed: "orange-ish" } })
    expect(garbage.lonestar.seed).toBe(DEFAULT_DESIGN_THEME.lonestar.seed)
    expect(garbage.lonestar.seedSource).toBe(DEFAULT_DESIGN_THEME.lonestar.seedSource)
  })

  test("孤星 defaults to its own calibration instead of the colour theme (and says so in the DOM)", () => {
    // 武陵/MD3 默认跟随配色主题，孤星**故意不跟随**：「高亮度橙只留给机械交互」是身份本身。
    // 于是默认档必须逐槽等于 §13.4 那张校准表，并且 seed-fallback 报 false（没发生过回落）。
    const resolution = resolveDesignTheme(
      { ...DEFAULT_DESIGN_THEME, id: "lonestar" },
      { scheme: "light", activeThemeSeed: "#b3261e", systemAccentAvailable: false },
    )
    expect(resolution, "孤星配方解析不出来").toBeTruthy()
    expect(resolution?.seed).toBe(DEFAULT_DESIGN_THEME.lonestar.seed)
    expect(resolution?.seedFallback).toBe(false)
    // 大小写：持久化边界把 hex 统一成小写（normalize 那条规则），所以这里比的是「归一化之后的
    // 校准值」而不是字面量大小写。同一个色的两种写法不算漂，别的色才算。
    // 发出去的是**校准表那一格的原样**（大写），而配置里的 seed 走持久化边界的小写归一——
    // 两个是不同东西：前者「画面上的颜色」，后者「用户填的那串字」。默认档不许被派生算法改写过。
    expect(resolution?.bundle.vars["--primary"], "默认档不许被别的颜色顶掉").toBe(LONESTAR_BRIDGED_COLORS.light["--primary"])
    expect(resolution?.bundle.attributes["data-lonestar-cut"]).toBe("6/12")
  })

  test("wuling's config survives the persistence boundary the same way the others do", () => {
    const stored = normalizeDesignThemeConfig({
      id: "wuling",
      dimensions: { ...ALL_DIMENSIONS_ON, geometry: false },
      wuling: { seed: "#B3261E", seedSource: "manual", cornerScale: 1.4, ledgerLabels: false },
    })
    expect(stored.id).toBe("wuling")
    expect(stored.wuling.seed).toBe("#b3261e")
    expect(stored.wuling.seedSource).toBe("manual")
    expect(stored.wuling.ledgerLabels).toBe(false)
    // 档位吸附：1.4 → 最近的合法档 1.5，而不是跳回默认 1。
    expect(stored.wuling.cornerScale).toBe(1.5)
    expect(WULING_CORNER_STEPS).toContain(stored.wuling.cornerScale)

    const garbage = normalizeDesignThemeConfig({ id: "wuling", wuling: { seed: "not-a-colour", cornerScale: "wide" } })
    expect(garbage.wuling.seed).toBe(DEFAULT_DESIGN_THEME.wuling.seed)
    expect(garbage.wuling.cornerScale).toBe(DEFAULT_DESIGN_THEME.wuling.cornerScale)

    // 未知 id 仍旧回 native——这条保证上面那个「被注册就必须有 options」的推论不会被绕过。
    expect(normalizeDesignThemeConfig({ id: "nope" }).id).toBe("native")
  })

  test("the default seed really is the preset's own primary (so defaults do not repaint)", () => {
    // 默认档位的颜色必须逐槽等于预设（浏览器尺里也有一条同样的等式，量的是计算值）。
    const resolution = resolveDesignTheme(
      { ...DEFAULT_DESIGN_THEME, id: "wuling" },
      { scheme: "light", activeThemeSeed: null, systemAccentAvailable: false },
    )
    expect(resolution, "武陵配方解析不出来").toBeTruthy()
    for (const [name, value] of Object.entries(WULING_PRESET_COLORS.light)) {
      expect(resolution?.bundle.vars[name], `${name} 默认值漂了`).toBe(value)
    }
    expect(resolution?.seedFallback, "activeTheme 在没有主题主色时必须如实报回落").toBe(true)
  })
})
