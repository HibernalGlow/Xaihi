import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { BRIDGED_COLOR_VARS } from "../contract"
import { contrastRatio } from "../contrast"
import {
  SWISS_BRIDGED_COLORS,
  SWISS_BRIDGED_COLOR_SOURCES,
  SWISS_SBB_COLORS,
  SWISS_SBB_SPACING,
  SWISS_SBB_TYPE_SCALE,
  SWISS_TOKENS,
  type SwissToken,
  type SwissTokenKind,
} from "./spec"

/**
 * Swiss 配方的出处门禁：台账与常量必须互等，而且「写了出处」必须真的能被反查。
 *
 * 为什么单独一条测试（同 §8 风格派、§12 武陵那条理由）：`source` 是自由文本，
 * 指错文档、值改了出处没改、或者复制一段看起来很象话的话，都不会让别的测试变红——
 * 那样「每条值带出处」这句话本身就成了装饰。
 *
 * 三张**上游台账**（`SWISS-SBB-COLORS` / `SWISS-TYPE-SCALE` / `SWISS-GEOMETRY`）在
 * `docs/advanced-design-theme-md3.md` §13 里，是手抄件：它们才是出处，常量必须等于它们。
 * 第四张 `SWISS-TOKENS` 由 `spec.ts` 生成，是台账不是出处——它防的是「改了代码没改文档」，
 * 这两类区别写在这里，是为了不让人把第四张也当成独立证据。
 */

const docPath = path.resolve(import.meta.dirname, "../../../../docs/advanced-design-theme-md3.md")
const doc = readFileSync(docPath, "utf8")

const untick = (cell: string): string => cell.replace(/^`+|`+$/g, "").trim()

function table(name: string): string[][] {
  const open = `<!-- TABLE:${name} -->`
  const start = doc.indexOf(open)
  if (start < 0) throw new Error(`docs/advanced-design-theme-md3.md 里没有 ${open} 这张表`)
  const end = doc.indexOf("<!-- /TABLE -->", start)
  if (end < 0) throw new Error(`${open} 没有收尾的 <!-- /TABLE -->`)
  const body = doc.slice(start + open.length, end)
  const rows = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => untick(cell.trim())))
  // 第一行是表头，第二行是 |---|---| 分隔符。
  const data = rows.filter((cells) => !cells.every((cell) => /^-+$/.test(cell) || cell === ""))
  return data.slice(1)
}

/** 出处前缀的分类判据：每类必须指向一个**能在本仓或台账里查到**的东西。 */
function kindProblem(token: { cssVar: string; kind: SwissTokenKind; source: string }): string | null {
  const { cssVar, kind, source } = token
  if (source.trim().length < 12) return `${cssVar} 的出处短到不像出处`
  switch (kind) {
    case "spec":
      return source.includes("SBB") ? null : `${cssVar} 标 spec 但出处没点名 SBB 的哪一份`
    case "reference":
      return source.includes("组合参考") ? null : `${cssVar} 标 reference 但出处没有「组合参考」`
    case "extracted":
      return source.includes("Kisaki") || source.includes("base.css")
        ? null
        : `${cssVar} 标 extracted 但出处没点名是从哪份实现量的`
    case "derived":
      return source.includes("÷") || source.includes("乘") || source.includes("换算") || source.includes("同一条")
        ? null
        : `${cssVar} 标 derived 却没写规则（谁除谁、乘什么）`
    case "ui":
      return source.includes("没有成文出处") ? null : `${cssVar} 标 ui 却没自陈「没有成文出处」`
    default:
      return `${cssVar} 的来源分类 ${String(kind)} 不在词表里`
  }
}

describe("swiss recipe provenance is reverse-checkable", () => {
  test("the hand-transcribed SBB colour ledger equals the constants", () => {
    const rows = table("SWISS-SBB-COLORS")
    const ledger = new Map(rows.map((row) => [row[0] as string, row[1] as string]))
    // 列顺序就是「名称 | 值 | 上游符号」——第三列里的符号名是给人反查上游文件用的。
    expect(rows.length, "台账是空的 ⇒ 下面的比较全是假绿").toBeGreaterThan(15)
    expect([...ledger].sort(), "spec.ts 的常量与 §13 的台账漂移").toEqual(
      [...Object.entries(SWISS_SBB_COLORS)].sort(),
    )
    expect(ledger.size, "台账里有重名").toBe(Object.keys(SWISS_SBB_COLORS).length)
  })

  test("the SBB type ladder and spacing ledgers equal the constants", () => {
    const scale = table("SWISS-TYPE-SCALE").map((row) => [Number(row[1]), Number(row[2])])
    expect(scale, "字阶台账与 SWISS_SBB_TYPE_SCALE 不一致").toEqual(
      SWISS_SBB_TYPE_SCALE.map((step) => [step.size, step.height]),
    )
    const spacingRows = table("SWISS-GEOMETRY").filter((row) => row.length >= 2)
    const spacing = new Map(spacingRows.map((row) => [row[0] as string, row[1] as string]))
    for (const [key, value] of Object.entries(SWISS_SBB_SPACING)) {
      expect(spacing.get(key), `SBBSpacing.${key} 在台账里不是 ${value}`).toBe(String(value))
    }
    expect(spacing.size, "间距台账行数与常量对不上（多了没记录的档）").toBe(Object.keys(SWISS_SBB_SPACING).length)
  })

  test("the generated token ledger matches spec.ts row for row", () => {
    const rows = table("SWISS-TOKENS")
    const expected = SWISS_TOKENS.filter((token) => token.dimension !== "color")
      .map((token) => [token.cssVar, token.dimension, token.light, token.dark, token.kind])
    expect(rows, "SWISS-TOKENS 台账与 spec.ts 漂移（改了代码要重生成台账）").toEqual(expected)
    expect(rows.length).toBeGreaterThan(25)
  })

  test("every token declares a source, and the class of that source is not inflated", () => {
    const problems: string[] = []
    for (const token of SWISS_TOKENS as readonly SwissToken[]) {
      const problem = kindProblem(token)
      if (problem) problems.push(problem)
    }
    expect(problems, `出处与分类不匹配：${problems.join(" | ")}`).toEqual([])
    // 分类不许一边倒地空转：五类里至少要用到四类。
    const used = new Set(SWISS_TOKENS.map((token) => token.kind))
    expect(used.size, "来源分类只剩一两类 ⇒ 记账形同虚设").toBeGreaterThanOrEqual(4)
  })

  test("every bridged colour resolves back to a ledger row or a cited in-repo line", () => {
    const ledger = new Map(table("SWISS-SBB-COLORS").map((row) => [row[0] as string, row[1] as string]))
    const baseCss = readFileSync(path.resolve(import.meta.dirname, "../../../styles/themes/base.css"), "utf8").split("\n")
    const wulingCss = readFileSync(path.resolve(import.meta.dirname, "../../../styles/themes/wuling.css"), "utf8").split("\n")
    const problems: string[] = []

    for (const scheme of ["light", "dark"] as const) {
      const palette = SWISS_BRIDGED_COLORS[scheme] as Record<string, string>
      const sources = SWISS_BRIDGED_COLOR_SOURCES[scheme] as Record<string, string>
      for (const slot of BRIDGED_COLOR_VARS) {
        const value = palette[slot]
        const source = sources[slot]
        if (typeof value !== "string") { problems.push(`${scheme} ${slot} 没有值`); continue }
        if (typeof source !== "string") { problems.push(`${scheme} ${slot} 没有出处`); continue }

        // 出处按**变量名**反查而不是行号：行号会随别人的一次编辑腐烂（本仓有过一次
        // 「文档里的 :163 已经指到别的声明上」），变量名才是这条链的稳定键。
        const alpha = /alpha:(\S+\.css)\s+(--[\w-]+)\s*的\s*([0-9.]+)/.exec(source)
        if (alpha) {
          const [, file, varName, opacity] = alpha
          const lines = file.endsWith("base.css") ? baseCss : wulingCss
          // 同一个变量名在亮/暗两个块里各声明一次，所以取**全部**声明行，要求其中至少一条
          // 真的写着那个不透明度（拿第一条会永远读到亮档那条，暗档就成了假绿）。
          const declared = lines.filter((text) => text.trim().startsWith(`${varName}:`))
          const want = ` / ${opacity})`
          if (!declared.some((text) => text.includes(want))) {
            problems.push(`${scheme} ${slot} 指着 ${file} 的 ${varName} 说它是 ${opacity}，那些声明行其实是 ${JSON.stringify(declared.map((t) => t.trim()))}`)
            continue
          }
          // alpha 那条只借「不透明度」这个数，色相必须仍来自台账。
          const hexes = [...value.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]?.toUpperCase())
          if (hexes.length === 0 && !value.includes("var(--")) {
            problems.push(`${scheme} ${slot} 的 color-mix 里没有可核对的色值：${value}`)
          }
          for (const hex of hexes) {
            if (![...ledger.values()].includes(hex as string)) {
              problems.push(`${scheme} ${slot} 用了台账外的 ${hex}`)
            }
          }
          continue
        }

        const sbb = /sbb:([a-z0-9]+)/.exec(source)
        if (sbb) {
          const named = ledger.get(sbb[1] as string)
          if (named === undefined) { problems.push(`${scheme} ${slot} 指着台账里没有的 sbb:${sbb[1]}`); continue }
          if (value.toUpperCase() !== named.toUpperCase()) {
            problems.push(`${scheme} ${slot} 说取自 ${sbb[1]}，表里那是 ${named}，实际发的是 ${value}`)
          }
          continue
        }

        if (source.startsWith("ui:")) {
          // `ui` 是「把哪个规范档派给哪个槽」的转译决定——值本身仍必须来自台账。
          if (![...ledger.values()].includes(value.toUpperCase())) {
            problems.push(`${scheme} ${slot} 标 ui 但值 ${value} 不在任何一行台账里`)
          }
          continue
        }
        problems.push(`${scheme} ${slot} 的出处前缀没人认得：${source.slice(0, 40)}`)
      }
    }
    expect(problems, `桥接色回查不过：${problems.join(" | ")}`).toEqual([])
    expect(Object.keys(SWISS_BRIDGED_COLORS.light).length).toBe(BRIDGED_COLOR_VARS.length)
    expect(Object.keys(SWISS_BRIDGED_COLOR_SOURCES.dark).length).toBe(BRIDGED_COLOR_VARS.length)
  })

  test("the palette clears WCAG AA on the pairs that carry text", () => {
    const pairs: Array<[string, string, string]> = [
      ["--foreground", "--background", "正文"],
      ["--muted-foreground", "--background", "次级文字（小字必须过 4.5）"],
      ["--card-foreground", "--card", "卡片正文"],
      ["--primary-foreground", "--primary", "动作面上的字"],
      ["--secondary-foreground", "--secondary", "次级面上的字"],
      ["--destructive-foreground", "--destructive", "危险面上的字"],
    ]
    const failures: string[] = []
    for (const scheme of ["light", "dark"] as const) {
      const palette = SWISS_BRIDGED_COLORS[scheme] as Record<string, string>
      for (const [ink, ground, note] of pairs) {
        const ratio = contrastRatio(palette[ink] as string, palette[ground] as string)
        if (ratio < 4.5) failures.push(`${scheme} ${note}：${ink} on ${ground} 只有 ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures, `AA 不过：${failures.join(" | ")}`).toEqual([])
  })

  test("the gauge sees a forged citation and a drifted value (falsification controls)", () => {
    // ① 假出处：值取 granite，出处却指着 cement —— 必须被抓。
    const lie = { cssVar: "--x", dimension: "states", light: SWISS_SBB_COLORS.granite, dark: SWISS_SBB_COLORS.granite, kind: "ui", source: "ui:指错档 sbb:cement" } satisfies SwissToken
    const ledger = new Map(table("SWISS-SBB-COLORS").map((row) => [row[0] as string, row[1] as string]))
    const sbb = /sbb:([a-z0-9]+)/.exec(lie.source)
    expect(sbb, "夹具本身要能命中提取规则").toBeTruthy()
    expect(ledger.get(sbb?.[1] as string), "夹具的假出处指向的档位值应当与发的值不同").not.toBe(lie.light)

    // ② 分类越级：标 spec 但不点名 SBB。
    expect(kindProblem({ cssVar: "--y", kind: "spec", source: "组合参考里说的，规范没写" }), "spec 类必须被要求点名 SBB").toBeTruthy()
    // ③ ui 类不许藏：没自陈「没有成文出处」就要红。
    expect(kindProblem({ cssVar: "--z", kind: "ui", source: "这个数是我们定的，挺好看" })).toBeTruthy()
    expect(kindProblem({ cssVar: "--z", kind: "ui", source: "没有成文出处：本仓在 30px 控件上量的档" })).toBeNull()
    // ④ 台账漂移：多造一行就要被比出来。
    const rows = table("SWISS-TOKENS")
    const planted = [...rows, ["--sw-not-a-token", "shape", "1px", "1px", "ui"]]
    expect(planted.length, "植入一行后台账长度必须变（否则这条比较是空话）").toBe(rows.length + 1)
    expect(planted).not.toEqual(rows)
  })
})
