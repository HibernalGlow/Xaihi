import { describe, expect, test } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CircleHelp, type LucideIcon } from "lucide-react"

import { PACKAGE_MODULES } from "./packageModules.generated"
import { MODULE_REGISTRY } from "./registry"
import { resolveModuleIcon } from "./moduleIconRegistry"

/** 命中注册表时永远拿不回这个哨兵，所以它把"名字在表里"和"表里没有、被兜底成 ?"分得开。 */
const NOT_REGISTERED = "not-registered" as unknown as LucideIcon

describe("node icon catalogue", () => {
  test("the sample is big enough that absence in it means something", () => {
    expect(PACKAGE_MODULES.length).toBeGreaterThan(20)
    const catalogIds = new Set(MODULE_REGISTRY.map((module) => module.id))
    for (const row of PACKAGE_MODULES) {
      expect(catalogIds.has(row.id), `${row.id} never reaches the workbench catalogue`).toBe(true)
    }
  })

  test("every node row declares a category and an icon name that resolves", () => {
    for (const row of PACKAGE_MODULES) {
      expect(row.icon, `${row.id}.icon`).toBeTruthy()
      expect(row.category, `${row.id}.category`).toBeTruthy()
      // 兜底是 CircleHelp（界面上那个 ? 圆圈）：27 个节点全中过一次，所以这里按名字逐个查表。
      expect(resolveModuleIcon(row.icon, NOT_REGISTERED), `${row.id}.icon="${row.icon}"`).not.toBe(NOT_REGISTERED)
    }
  })

  test("positive control: an unregistered name really does fall back to the question mark", () => {
    expect(resolveModuleIcon("ThisIconDoesNotExist", NOT_REGISTERED)).toBe(NOT_REGISTERED)
    expect(resolveModuleIcon("")).toBe(CircleHelp)
  })

  test("a resolved name paints its own glyph, not the question mark", () => {
    // 表里有个组件不等于屏上是那个图形：这里真的渲一次，读回 lucide 自己写的类名。
    // 不拿名字去算类名（lucide 自己就有别名：CircleHelp → lucide-circle-question-mark），
    // 只断言两件事：每个名字都渲出自己的图形，且不同名字不撞成同一个图形。
    const classes = new Map<string, string>()
    for (const row of PACKAGE_MODULES) {
      const html = renderToStaticMarkup(createElement(resolveModuleIcon(row.icon), { "aria-hidden": "true" }))
      const cls = /class="([^"]*)"/.exec(html)?.[1] ?? ""
      expect(cls, `${row.id}.icon="${row.icon}" rendered no lucide class: ${html.slice(0, 160)}`).toContain("lucide-")
      expect(cls, `${row.id}.icon="${row.icon}" renders the ? fallback`).not.toContain("circle-question-mark")
      classes.set(row.icon, cls)
    }
    expect(classes.size, "fewer distinct glyphs than icon names means two names collided").toBe(new Set(PACKAGE_MODULES.map((row) => row.icon)).size)
  })
})
