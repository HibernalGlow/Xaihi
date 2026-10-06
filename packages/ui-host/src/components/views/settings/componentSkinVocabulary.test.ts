import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { CHOICE_CONTROL_STYLES, FIELD_TITLE_STYLES } from "@/components/ui/choice-control-variants"
import { SCROLLBAR_DISPLAY_STYLES } from "@/components/ui/scrollbar-variants"
import { SLIDER_DISPLAY_STYLES } from "@/components/ui/slider-variants"
import { SWITCH_DISPLAY_STYLES } from "@/components/ui/switch-variants"
import { TAB_DISPLAY_STYLES } from "@/components/ui/tabs-variants"
import { INITIAL_STATE } from "@/store/workspace/constants"
import en from "@/i18n/locales/en.json"
import zh from "@/i18n/locales/zh.json"

/**
 * 组件皮肤这个词表有**四份**手写的地方，任何一处漏了都是静默失效：
 *  1. 词表本体（`src/components/ui/*-variants.ts`）——决定类型与设置面板渲染几个档；
 *  2. 宿主持久化清单（`AppConfigSync.tsx` 里的 `new Set([...])`）——不收的值在从 TOML
 *     读回来时被整条丢掉，于是「选了但存不住」；
 *  3. `:root` 属性（`WorkspaceAppearance`）——决定谁在接管；
 *  4. i18n 的两份标签——缺一个就是一块裸英文 key。
 * 2026-10-05 加「不接管」(`none`) 档时就是这四份一起改的，所以这条门禁一次查 2 和 4。
 */
const FAMILIES = [
  { name: "choiceControlStyle", values: CHOICE_CONTROL_STYLES, whitelist: "CHOICE_CONTROL_STYLES", labels: "settings.timeline.choice" },
  { name: "fieldTitleStyle", values: FIELD_TITLE_STYLES, whitelist: "FIELD_TITLE_STYLES", labels: "settings.timeline.fieldTitle" },
  { name: "tabDisplayStyle", values: TAB_DISPLAY_STYLES, whitelist: "TAB_DISPLAY_STYLES", labels: "settings.view.componentDisplay.styles" },
  { name: "switchDisplayStyle", values: SWITCH_DISPLAY_STYLES, whitelist: "SWITCH_DISPLAY_STYLES", labels: "settings.view.componentDisplay.switches.styles" },
  { name: "sliderDisplayStyle", values: SLIDER_DISPLAY_STYLES, whitelist: "SLIDER_DISPLAY_STYLES", labels: "settings.view.componentDisplay.sliders.styles" },
  { name: "scrollbarDisplayStyle", values: SCROLLBAR_DISPLAY_STYLES, whitelist: "SCROLLBAR_DISPLAY_STYLES", labels: "settings.view.componentDisplay.scrollbars.styles" },
] as const

const appConfigSource = readFileSync(path.resolve(import.meta.dirname, "../../workspace/AppConfigSync.tsx"), "utf8")

function whitelistValues(constName: string): string[] {
  const match = new RegExp(`const ${constName} = new Set<[^>]*>\\(\\[([^\\]]*)\\]\\)`).exec(appConfigSource)
  if (!match) throw new Error(`AppConfigSync.tsx 里找不到 ${constName} 这份清单（形状变了就要同步这条门禁）`)
  return [...(match[1] as string).matchAll(/"([^"]+)"/g)].map((m) => m[1] as string)
}

function lookup(bundle: typeof en, dotted: string): Record<string, unknown> {
  let node: unknown = bundle
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) throw new Error(`${dotted} 路径不存在`)
    node = (node as Record<string, unknown>)[part]
  }
  return node as Record<string, unknown>
}

describe("component skin vocabularies stay consistent across the four hand-written lists", () => {
  test("every value in the type vocabulary is accepted by the host persistence whitelist", () => {
    for (const family of FAMILIES) {
      expect(
        whitelistValues(family.whitelist),
        `${family.name}: 宿主持久化清单与词表不一致（选了存不住，或清单里留着没人实现的值）`,
      ).toEqual([...family.values])
    }
  })

  test("every value has a label in both locales", () => {
    for (const family of FAMILIES) {
      for (const locale of [["en", en], ["zh", zh]] as const) {
        const table = lookup(locale[1], family.labels)
        for (const value of family.values) {
          expect(typeof table[value], `${locale[0]}: ${family.labels}.${value} 缺标签`).toBe("string")
          expect((table[value] as string).trim().length, `${locale[0]}: ${family.labels}.${value} 是空串`).toBeGreaterThan(0)
        }
      }
    }
  })

  test("the 'none' tier exists on every family and is not the default", () => {
    for (const family of FAMILIES) {
      expect(family.values, `${family.name} 没有「不接管」档`).toContain("none")
    }
    // 默认值不许因为加了这一档而改变任何人的既有观感。
    const defaults = INITIAL_STATE as unknown as Record<string, string>
    for (const family of FAMILIES) {
      expect(defaults[family.name], `${family.name} 的默认值被改成了不接管`).not.toBe("none")
    }
  })

  test("the gauge sees a one-sided vocabulary change (falsification controls)", () => {
    // 只改词表、忘了改宿主清单 ⇒ 必须报出来（这正是 `none` 差点被漏掉的那条路）。
    const drifted = 'const CHOICE_CONTROL_STYLES = new Set<X>(["segmented", "pills", "tabs", "tiles"])'
    const source = appConfigSource.replace(
      /const CHOICE_CONTROL_STYLES = new Set<[^>]*>\(\[[^\]]*\]\)/,
      drifted,
    )
    const before = whitelistValues("CHOICE_CONTROL_STYLES")
    const after = [...(new RegExp(`const CHOICE_CONTROL_STYLES = new Set<[^>]*>\\(\\[([^\\]]*)\\]\\)`).exec(source)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] as string)
    expect(before).toContain("none")
    expect(after).not.toContain("none")
    // 反向对照：没改坏的源码上，两份名单确实等长。
    expect(whitelistValues("CHOICE_CONTROL_STYLES").length).toBe(CHOICE_CONTROL_STYLES.length)
  })
})
