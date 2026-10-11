/**
 * MD3 的**规范覆盖**尺：字典里 84 个组件集，本仓真渲染的那些控件对应集，消费了没有。
 *
 * ## 为什么 `tokenCoverage.test.ts` 挡不住这一类
 * 那把尺双向核对的是「引擎发放 == CSS 引用」，两边都是**自己人**：CSS 没引用的集，
 * 引擎就不发，于是「从未引用」在两个方向上都表现为**一致**，尺是绿的。
 * 实测：`md3-components-selection.css:148-151` 有一段注释声称接管 M3 slider
 * （"M3 set: slider → active/inactive track 4px, handle 20px, state layer 40px"），
 * 而它下面**一条声明都没有**，全仓 `--md-comp-slider-*` 引用数为 0——
 * 同期 135 条 design-theme 尺全绿。这就是本尺存在的理由：它查的是
 * **规范 ↔ 画面**，不是**发放 ↔ 引用**。
 *
 * ## 两条判据，各自的可辩护性
 * 1. **声称即义务**：CSS 注释里以 `M3 set: <名>` 或 `(M3 <名>)` 形式点名的组件集，
 *    必须真的被消费（≥1 条 `var(--md-comp-<名>-…)`）。名字按小写 + 空格转连字符归一，
 *    与字典集名对齐；归一后不是真集名的（如 `(M3 slider)` 里的口语）不参与。
 *    这条不需要任何人为的「槽 ↔ 集」映射表，所以它没有可以被发明的余地。
 * 2. **渲染即在册**：字典集名**恰好等于** `src/components/ui` 发出的某个 `data-slot` 值时，
 *    该集必须被消费，否则要进下面那份逐条带理由的台账。
 *
 * 判据 2 用「名字完全相等」而不是语义相似度，是因为语义映射一旦由我手写，
 * 就成了「我说这个控件该长什么样」——那正是 ADR-0006 决定 4 否掉的自证循环尺的形状。
 *
 * 剥注释这件事在这里**只用于引用侧**：`tokenCoverage` 把注释整块剥掉再找 `var()`，
 * 本尺的判据 1 恰恰要读注释，所以两份解析分开跑，不许共用同一份 stripped 文本。
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { MD3_COMPONENT_SET_NAMES, MD3_COMPONENT_TOKENS } from "./tokens.generated"
import { MD3_EMITTED_COMPONENT_SETS } from "./mapper"

const PKG_ROOT = path.resolve(import.meta.dirname, "../../../..")
const DESIGN_STYLE_DIR = path.join(PKG_ROOT, "src/styles/design")
const UI_DIR = path.join(PKG_ROOT, "src/components/ui")

function filesIn(dir: string, re: RegExp, ext: RegExp): string[] {
  return readdirSync(dir)
    .filter((n) => re.test(n) && ext.test(n))
    .map((n) => path.join(dir, n))
}

/** 归一：`secondary navigation tab` -> `secondary-navigation-tab`，与字典集名同形。 */
function normalizeSetName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, "-")
}

/** CSS 层实际消费的组件集（按集名前缀匹配，剥掉注释之后再找）。 */
export function consumedComponentSets(cssText: string): Set<string> {
  const body = cssText.replace(/\/\*[\s\S]*?\*\//g, " ")
  const names = new Set<string>()
  for (const m of body.matchAll(/--md-comp-([A-Za-z0-9-]+)/g)) names.add(m[1] as string)
  const consumed = new Set<string>()
  for (const set of MD3_COMPONENT_SET_NAMES) {
    for (const n of names) if (n === set || n.startsWith(`${set}-`)) consumed.add(set)
  }
  return consumed
}

/** 注释里声称接管的组件集（判据 1 的左半边）。 */
export function claimedComponentSets(cssText: string): Map<string, string[]> {
  const claims = new Map<string, string[]>()
  const real = new Set(MD3_COMPONENT_SET_NAMES)
  for (const block of cssText.match(/\/\*[\s\S]*?\*\//g) ?? []) {
    const hits = [
      ...block.matchAll(/M3\s+set:\s*([A-Za-z0-9 _-]+)/g),
      ...block.matchAll(/\(\s*M3\s+([A-Za-z0-9 _-]+?)\s*\)/g),
    ]
    for (const h of hits) {
      const set = normalizeSetName(h[1] ?? "")
      if (!real.has(set)) continue
      claims.set(set, [...(claims.get(set) ?? []), h[0].trim()])
    }
  }
  return claims
}

/** `src/components/ui` 真实发出的 data-slot 值。 */
export function renderedSlots(): Set<string> {
  const slots = new Set<string>()
  for (const f of filesIn(UI_DIR, /\.tsx$/, /./)) {
    for (const m of readFileSync(f, "utf8").matchAll(/data-slot="([a-z0-9-]+)"/g)) {
      slots.add(m[1] as string)
    }
  }
  return slots
}

/**
 * 判据 2 的台账：字典集名 == 某个真渲染的 data-slot，但 MD3 一条 token 没消费。
 * 每条必须带理由；新增一条要么补实现、要么写理由，**不许留空**。
 */
const RENDERED_BUT_UNCONSUMED: Record<string, string> = {
  // 2026-10-09 本尺建立时唯一的一条，且它同时违反判据 1（注释声称接管）。
  // 已在本轮实现，所以这条台账应当被删掉——留着就是「尺被放宽」的形状。
}

function md3CssText(): string {
  return filesIn(DESIGN_STYLE_DIR, /^md3/, /\.css$/)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")
}

describe("MD3 spec coverage: 规范有这一集，本仓渲染了这个控件，就得消费", () => {
  const css = md3CssText()
  const consumed = consumedComponentSets(css)

  test("尺本身看得见东西：CSS 层非空，消费集非空且不超过字典集数", () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(consumed.size).toBeGreaterThan(0)
    expect(consumed.size).toBeLessThanOrEqual(MD3_COMPONENT_SET_NAMES.length)
  })

  test("判据 1：注释里声称接管的 M3 组件集，必须真的被消费", () => {
    const claims = claimedComponentSets(css)
    expect(claims.size).toBeGreaterThan(0) // 一条声称都没有 = 尺瞎了，不是通过
    const unmet = [...claims.entries()].filter(([set]) => !consumed.has(set))
    expect(unmet.map(([set, where]) => `${set} 被声称于「${where[0]}」却零消费`)).toEqual([])
  })

  test("判据 2：集名恰好等于渲染中的 data-slot 的那些集，消费或进带理由的台账", () => {
    const slots = renderedSlots()
    const violations = MD3_COMPONENT_SET_NAMES.filter(
      (set) => slots.has(set) && !consumed.has(set) && !(set in RENDERED_BUT_UNCONSUMED),
    ).map((set) => `字典集 ${set} 对应本仓真渲染的 [data-slot="${set}"]，却一条 --md-comp-${set}-* 都没消费`)
    expect(violations).toEqual([])
    // 台账里的每一条必须真的还在违规，否则它是「已经补了却忘了删豁免」的假豁免
    const stale = Object.keys(RENDERED_BUT_UNCONSUMED).filter(
      (set) => !(slots.has(set) && !consumed.has(set)),
    )
    expect(stale).toEqual([])
    for (const [set, reason] of Object.entries(RENDERED_BUT_UNCONSUMED)) {
      expect(reason.trim().length, `${set} 的豁免没有理由`).toBeGreaterThan(8)
    }
  })

  test("发放名单与本尺一致：CSS 消费的集都在 mapper 名单里", () => {
    const emitted = new Set(MD3_EMITTED_COMPONENT_SETS)
    const orphan = [...consumed].filter((set) => !emitted.has(set))
    expect(orphan).toEqual([])
  })

  test("阳性对照：把 slider 从消费集里挖掉，判据 1 与判据 2 必须同时变红", () => {
    // 这条测的是**尺**，不是代码：它证明 slider 当初不是「合规」，而是「没人看」。
    const real = new Set(consumed)
    real.delete("slider")
    expect(claimedComponentSets(css).has("slider")).toBe(true)
    expect([...claimedComponentSets(css).keys()].filter((s) => !real.has(s))).toContain("slider")
    expect(renderedSlots().has("slider")).toBe(true)
    expect(MD3_COMPONENT_SET_NAMES).toContain("slider")
    // 台账不许顺手收下这条豁免
    expect(Object.keys(RENDERED_BUT_UNCONSUMED)).not.toContain("slider")
  })

  test("阳性对照：归一化不放过口语写法，也不误伤非集名", () => {
    expect(normalizeSetName("Secondary Navigation Tab")).toBe("secondary-navigation-tab")
    const fake = "/* ── Thing (M3 not-a-real-set) ── */"
    expect(claimedComponentSets(fake).size).toBe(0)
    const real = "/* M3 set: switch → 52x32 */"
    expect([...claimedComponentSets(real).keys()]).toEqual(["switch"])
  })

  test("阳性对照：本尺能区分「引用了」与「只在注释里提过」", () => {
    const onlyComment = "/* M3 set: radio-button */\n:root { color: red; }"
    expect(consumedComponentSets(onlyComment).size).toBe(0)
    const withVar = "/* M3 set: radio-button */\n:root { color: var(--md-comp-radio-button-icon-size); }"
    expect([...consumedComponentSets(withVar)]).toEqual(["radio-button"])
  })

  test("字典侧健全性：名单与表体一致，避免尺建在坏数据上", () => {
    expect(new Set(MD3_COMPONENT_SET_NAMES).size).toBe(MD3_COMPONENT_SET_NAMES.length)
    for (const set of MD3_COMPONENT_SET_NAMES) {
      expect(Object.keys(MD3_COMPONENT_TOKENS[set] ?? {}).length, `${set} 在名单里却不在表里`).toBeGreaterThan(0)
    }
  })
})
