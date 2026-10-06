import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

import { WULING_PRESET_COLORS, WULING_PRESET_COLOR_LINES, WULING_SEED_RULE, WULING_TOKENS } from "./spec"

/**
 * 出处门禁：这张表里的每个值都必须**回得到它声称的那一行**。
 *
 * 为什么值得单独一条测试：`spec.ts` 里的 `source` 字段是文本，写错行号、写对行号但值改了、
 * 或者干脆复制粘贴一段看起来很像的出处，都不会让任何一条其它测试变红——
 * 「每条值带出处」这句话本身就成了装饰。风格派那一份的同类尺（`mondrian/palette.test.ts`）
 * 已经在 2026-10-05 抓到过一次「注释说等于既有控件高度，实际是 40px 而默认是 36px」。
 *
 * 这里做三件事：
 *  1. 逐个 `preset(N)` 行号：把行读出来，要求那一行**声明的 token 名**与这一条目一致；
 *  2. 桥接色的每一条值：必须等于 `wuling.css` 对应行的字面量（改了预设不改表 ⇒ 红；
 *     改了表不改预设 ⇒ 也红）；
 *  3. 阳性对照：一个故意指错行的条目必须被抓到，否则上面两条是假绿。
 */

const presetPath = resolve(import.meta.dirname, "../../../styles/themes/wuling.css")
const presetLines = readFileSync(presetPath, "utf8").split("\n")

function lineAt(line: number): string {
  const text = presetLines[line - 1]
  if (text === undefined) throw new Error(`wuling.css 没有第 ${line} 行`)
  return text.trim()
}

/** 从 `source` 里抽出所有 `wuling.css:<行号>` 引用。 */
function citedLines(source: string): number[] {
  return [...source.matchAll(/wuling\.css:(\d+)/g)].map((match) => Number(match[1]))
}

/** 这一行是不是声明或声明的续行（`linear-gradient(...),` 这种以逗号结尾）。 */
function isDeclarationLine(text: string): boolean {
  if (!text || text.startsWith("/*") || text.startsWith("*")) return false
  return text.endsWith(";") || text.endsWith(",")
}

describe("every Wuling token really cites the line it claims", () => {
  test("the table has a real sample and no bare value", () => {
    expect(WULING_TOKENS.length, "表是空的的话下面的断言全是假绿").toBeGreaterThan(30)
    for (const token of WULING_TOKENS) {
      expect(token.source.length, `${token.cssVar} 没有出处`).toBeGreaterThan(12)
      expect(token.kind, `${token.cssVar} 缺来源分类`).toBeTruthy()
      // 每个 preset 类条目都必须指到行号；reference/derived/ui 允许引文档或写规则。
      if (token.kind === "preset") {
        expect(citedLines(token.source).length, `${token.cssVar} 标了 preset 却没写行号`).toBeGreaterThan(0)
      }
    }
  })

  test("each cited line number exists and is a declaration line, not prose", () => {
    const offenders: string[] = []
    for (const token of WULING_TOKENS) {
      for (const line of citedLines(token.source)) {
        const text = lineAt(line)
        // 判据只问「这一行是不是声明的一部分」：注释行、空行、纯选择器行都不算。
        // 多行声明的续行（比如 `linear-gradient(...),` 那种）以逗号或分号结尾，同样算声明。
        if (!text || text.startsWith("/*") || text.startsWith("*")) {
          offenders.push(`${token.cssVar} → 第 ${line} 行是注释或空行：${JSON.stringify(text)}`)
          continue
        }
        if (isDeclarationLine(text)) continue
        offenders.push(`${token.cssVar} → 第 ${line} 行不是声明：${JSON.stringify(text)}`)
      }
    }
    expect(offenders, `有 token 指向了非声明行：${offenders.join(" | ")}`).toEqual([])
  })

  test("the bridged colours are byte-identical to the lines they cite", () => {
    const mismatches: string[] = []
    for (const scheme of ["light", "dark"] as const) {
      const table = WULING_PRESET_COLOR_LINES[scheme] as Record<string, number>
      const values = WULING_PRESET_COLORS[scheme] as Record<string, string>
      for (const [name, value] of Object.entries(values)) {
        const line = table[name]
        if (line === undefined) {
          mismatches.push(`${scheme} ${name}: 没有行号记录`)
          continue
        }
        const text = lineAt(line)
        if (!text.startsWith(`${name}:`)) {
          mismatches.push(`${scheme} ${name}: 第 ${line} 行其实是「${text}」`)
          continue
        }
        if (!text.includes(value)) {
          mismatches.push(`${scheme} ${name}: 表里是 ${value}，第 ${line} 行是 ${text}`)
        }
      }
    }
    expect(mismatches, `预设原文与 token 表漂移：${mismatches.join(" | ")}`).toEqual([])
    expect(Object.keys(WULING_PRESET_COLORS.light).length, "桥接色表不该缩小").toBe(36)
  })

  test("every preset-classified value appears verbatim in a line it cites", () => {
    // 这条才是「每条值带出处」的实质：出处不能只是一句看起来像的话，
    // 必须能在被指到的那些行里**原样找到**这个值（亮档找亮值，暗档找暗值）。
    const offenders: string[] = []
    for (const token of WULING_TOKENS) {
      if (token.kind !== "preset") continue
      const lines = citedLines(token.source).map(lineAt)
      expect(lines.length, `${token.cssVar} 标了 preset 却没有行号可查`).toBeGreaterThan(0)
      if (!lines.some((text) => text.includes(token.light))) {
        offenders.push(`${token.cssVar} 亮值 ${token.light} 不在引用的任何一行里`)
      }
      if (!lines.some((text) => text.includes(token.dark))) {
        offenders.push(`${token.cssVar} 暗值 ${token.dark} 不在引用的任何一行里`)
      }
    }
    expect(offenders, `出处与值对不上：${offenders.join(" | ")}`).toEqual([])
    // 样本量：这张表几乎全是 preset 类，否则上面那条循环可以空转。
    expect(WULING_TOKENS.filter((token) => token.kind === "preset").length).toBeGreaterThan(25)
  })

  test("the seed rule's lightness really is the preset's measured primary", () => {
    // `WULING_SEED_RULE` 声称它的档位来自预设实测 L；这一条把它钉回那两行。
    expect(lineAt(26)).toContain("oklch(0.72 0.13 173)")
    expect(lineAt(88)).toContain("oklch(0.80 0.12 173)")
    expect(WULING_SEED_RULE.source).toContain("wuling.css:26")
    expect(WULING_SEED_RULE.source).toContain("wuling.css:88")
  })

  test("the gauge sees a wrong citation and a non-declaration line (falsification controls)", () => {
    // 三条尺都要能红，否则上面那两条只是复述预设。
    //  (1) 行号指到选择器 / 注释上：声明判据必须说「不是声明」。
    expect(lineAt(9), "第 9 行是选择器").toBe(".theme-wuling {")
    expect(isDeclarationLine(lineAt(9))).toBe(false)
    expect(isDeclarationLine(lineAt(1))).toBe(false)
    //  (2) 指到真正的声明上：算声明，且值对得上。
    expect(isDeclarationLine(lineAt(11))).toBe(true)
    expect(lineAt(11)).toContain("--radius: 0.5rem;")
    //  (3) 值被改掉：表里的正确值必须在预设里找得到，植入的假值必须找不到。
    expect(lineAt(26).includes(WULING_PRESET_COLORS.light["--primary"])).toBe(true)
    expect(lineAt(26).includes("oklch(0.10 0.99 333)")).toBe(false)
    //  (4) 行号错位：把 chip（第 222 行）指到 --radius（第 11 行）必须露馅。
    expect(lineAt(222)).toContain("border-radius: 4px;")
    expect(lineAt(11).includes("4px")).toBe(false)
  })
})
