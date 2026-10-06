import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { ALL_DIMENSIONS_ON, BRIDGED_COLOR_VARS, DEFAULT_DESIGN_THEME } from "../contract"
import { contrastRatio } from "../contrast"
import {
  LONESTAR_BRIDGED_COLORS,
  LONESTAR_BRIDGED_COLOR_SOURCES,
  LONESTAR_CALIBRATED,
  LONESTAR_CHART_CYCLE,
  LONESTAR_CONTRACT_COLORS,
  LONESTAR_CONTRACT_CUTS,
  LONESTAR_SEED_RULE,
  LONESTAR_TOKENS,
  LONESTAR_UPSTREAM_CALIBRATION_SHA,
  type LoneStarToken,
  type LoneStarTokenKind,
} from "./spec"
import { resolveLoneStarTheme } from "./resolve"

/**
 * 孤星配方的出处门禁。它比 Swiss 那一份多一层，因为这一份的上游**在本仓之外**：
 * 转录件 `docs/design-research/lonestar-kisaki-board-theme.snapshot.dart` 是
 * `board_theme.dart` 的逐字副本，测试先核它的 BODY sha256 等于 `spec.ts` 里记下的那串，
 * 再把每一个校准值回查进去。这条链成立的前提是「转录件与源文件同字节」，
 * 而源文件随时会变——所以记了 sha，所以漂移是**可见的**而不是一句注释。
 */

const docPath = path.resolve(import.meta.dirname, "../../../../docs/advanced-design-theme-md3.md")
const doc = readFileSync(docPath, "utf8")
const snapshotPath = path.resolve(import.meta.dirname, "../../../../docs/design-research/lonestar-kisaki-board-theme.snapshot.dart")
const snapshot = readFileSync(snapshotPath, "utf8")

const untick = (cell: string): string => cell.replace(/^`+|`+$/g, "").trim()

function table(name: string): string[][] {
  const open = `<!-- TABLE:${name} -->`
  const start = doc.indexOf(open)
  if (start < 0) throw new Error(`docs/advanced-design-theme-md3.md 里没有 ${open} 这张表`)
  const end = doc.indexOf("<!-- /TABLE -->", start)
  const body = doc.slice(start + open.length, end)
  const rows = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => untick(cell.trim())))
  return rows.filter((cells) => !cells.every((cell) => /^-+$/.test(cell) || cell === "")).slice(1)
}

function kindProblem(token: { cssVar: string; kind: LoneStarTokenKind; source: string }): string | null {
  const { cssVar, kind, source } = token
  if (source.trim().length < 12) return `${cssVar} 的出处短到不像出处`
  switch (kind) {
    case "contract":
      return source.includes("LONESTAR-CONTRACT 表") ? null : `${cssVar} 标 contract 却没指到那张表`
    case "calibrated":
      return source.includes("LONESTAR-CALIBRATION 表") ? null : `${cssVar} 标 calibrated 却没指到校准台账`
    case "reference":
      return source.includes("catfu") || source.includes("SBB") || source.includes("Kisaki")
        ? null
        : `${cssVar} 标 reference 却没点名是哪份成文档（catfu / SBB / Kisaki）`
    case "derived":
      return source.includes("×") || source.includes("÷") || source.includes("律") || source.includes("现算")
        ? null
        : `${cssVar} 标 derived 却没写规则`
    case "ui":
      return source.includes("没有成文出处") ? null : `${cssVar} 标 ui 却没自陈「没有成文出处」`
    default:
      return `${cssVar} 的来源分类 ${String(kind)} 不在词表里`
  }
}

describe("lonestar recipe provenance is reverse-checkable", () => {
  test("the transcribed upstream is byte-identical to what spec.ts recorded", async () => {
    const { createHash } = await import("node:crypto")
    const marker = "// --- BODY ---\n"
    const at = snapshot.indexOf(marker)
    expect(at, "转录件没有 BODY 分隔线").toBeGreaterThan(0)
    const body = snapshot.slice(at + marker.length)
    const sha = createHash("sha256").update(body, "utf8").digest("hex")
    expect(sha, "转录件与 spec.ts 记的 sha 不一致——上游被改过或副本被动过，两边都要重新记账").toBe(LONESTAR_UPSTREAM_CALIBRATION_SHA)
  })

  test("every calibration value really appears in the transcription", () => {
    for (const [key, pair] of Object.entries(LONESTAR_CALIBRATED)) {
      if (key === "selectionAlpha") {
        // alpha 不是 0xRRGGBB，反查它写过的两个小数。
        expect(snapshot, "转录件里没有 selection 的亮档 alpha 0.16").toContain("0.16")
        expect(snapshot, "转录件里没有 selection 的暗档 alpha 0.22").toContain("0.22")
        continue
      }
      const { light, dark } = pair as { light: string; dark: string }
      const toDart = (hex: string) => `0xFF${hex.replace("#", "").toUpperCase()}`
      expect(snapshot.includes(toDart(light)), `转录件里没有 ${key} 的亮档 ${light}`).toBe(true)
      expect(snapshot.includes(toDart(dark)), `转录件里没有 ${key} 的暗档 ${dark}`).toBe(true)
    }
  })

  test("the extracted token contract ledger equals the constants", () => {
    const rows = table("LONESTAR-CONTRACT")
    const ledger = new Map(rows.map((row) => [row[0] as string, row[1] as string]))
    for (const [key, value] of Object.entries(LONESTAR_CONTRACT_COLORS)) {
      expect(ledger.get(key), `契约色 ${key} 与台账漂移`).toBe(value)
    }
    expect(ledger.get("cutSm"), "`cut.sm` 与台账漂移").toBe(String(LONESTAR_CONTRACT_CUTS.cutSm))
    expect(ledger.get("cutMd"), "`cut.md` 与台账漂移").toBe(String(LONESTAR_CONTRACT_CUTS.cutMd))
    // 反向：台账里不许有常量没有的行（那条会伪装成「上游还有别的值」）。
    expect([...ledger.keys()].sort(), "LONESTAR-CONTRACT 台账与常量集合漂移").toEqual(
      [...Object.keys(LONESTAR_CONTRACT_COLORS), ...Object.keys(LONESTAR_CONTRACT_CUTS)].sort(),
    )
    expect(ledger.size).toBe(Object.keys(LONESTAR_CONTRACT_COLORS).length + Object.keys(LONESTAR_CONTRACT_CUTS).length)
  })

  test("the calibration and chart ledgers equal the constants", () => {
    const rows = table("LONESTAR-CALIBRATION")
    const byKey = new Map(rows.map((row) => [row[0] as string, row]))
    expect([...byKey.keys()].sort(), "校准台账与 LONESTAR_CALIBRATED 的键集漂移").toEqual(Object.keys(LONESTAR_CALIBRATED).sort())
    for (const [key, value] of Object.entries(LONESTAR_CALIBRATED)) {
      const row = byKey.get(key)
      expect(row, `台账缺 ${key}`).toBeTruthy()
      if (key === "selectionAlpha") {
        expect([row?.[1], row?.[2]], "选区 alpha 与台账不一致").toEqual(["0.16", "0.22"])
        continue
      }
      const { light, dark } = value as { light: string; dark: string }
      expect([row?.[1], row?.[2]], `${key} 的两档与台账不一致`).toEqual([light, dark])
    }
    expect(table("LONESTAR-CHART").map((row) => row[1]), "图表循环与台账漂移").toEqual([...LONESTAR_CHART_CYCLE])
  })

  test("the generated token ledger matches spec.ts row for row", () => {
    const rows = table("LONESTAR-TOKENS")
    const expected = LONESTAR_TOKENS.filter((token) => token.dimension !== "color")
      .map((token) => [token.cssVar, token.dimension, token.light, token.dark, token.kind])
    expect(rows, "LONESTAR-TOKENS 台账与 spec.ts 漂移（改了代码要重生成台账）").toEqual(expected)
    expect(rows.length).toBeGreaterThan(25)
  })

  test("every token declares a source, and the class of that source is not inflated", () => {
    const problems: string[] = []
    for (const token of LONESTAR_TOKENS as readonly LoneStarToken[]) {
      const problem = kindProblem(token)
      if (problem) problems.push(problem)
    }
    expect(problems, `出处与分类不匹配：${problems.join(" | ")}`).toEqual([])
    const used = new Set(LONESTAR_TOKENS.map((token) => token.kind))
    expect(used.has("contract"), "没有任何值来自那份 token contract ⇒ 这个配方不是孤星").toBe(true)
    expect(used.has("calibrated"), "没有任何校准值 ⇒ 上面那条 contract 表是装饰品").toBe(true)
    expect(used.size).toBeGreaterThanOrEqual(4)
  })

  test("every bridged colour resolves back to the contract or the calibration ledger", () => {
    const contract = new Map(table("LONESTAR-CONTRACT").map((row) => [row[0] as string, row[1] as string]))
    const baseCss = readFileSync(path.resolve(import.meta.dirname, "../../../styles/themes/base.css"), "utf8").split("\n")
    const wulingCss = readFileSync(path.resolve(import.meta.dirname, "../../../styles/themes/wuling.css"), "utf8").split("\n")
    const problems: string[] = []
    for (const scheme of ["light", "dark"] as const) {
      const palette = LONESTAR_BRIDGED_COLORS[scheme] as Record<string, string>
      const sources = LONESTAR_BRIDGED_COLOR_SOURCES[scheme] as Record<string, string>
      for (const slot of BRIDGED_COLOR_VARS) {
        const value = palette[slot]
        const source = sources[slot]
        if (typeof value !== "string") { problems.push(`${scheme} ${slot} 没有值`); continue }
        if (typeof source !== "string") { problems.push(`${scheme} ${slot} 没有出处`); continue }

        const alpha = /alpha:(\S+\.css)\s+(--[\w-]+)\s*的\s*([0-9.]+)/.exec(source)
        if (alpha) {
          const [, file, varName, opacity] = alpha
          const lines = file.endsWith("base.css") ? baseCss : wulingCss
          const declared = lines.filter((text) => text.trim().startsWith(`${varName}:`))
          if (!declared.some((text) => text.includes(` / ${opacity})`))) {
            problems.push(`${scheme} ${slot} 指着 ${file} 的 ${varName} 说它是 ${opacity}，那些声明行其实是 ${JSON.stringify(declared.map((t) => t.trim()))}`)
          }
          continue
        }
        if (/var\(--primary\)/.test(value)) continue // 跟着动作面走的 wash：色由下面的 --primary 那条管

        const hexes = [...value.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]?.toUpperCase())
        if (hexes.length === 0) { problems.push(`${scheme} ${slot} 里没有可核对的色值：${value}`); continue }
        const allowed = new Set<string>([
          ...contract.values(),
          ...Object.values(LONESTAR_CALIBRATED).flatMap((entry) => {
            if (typeof entry === "object" && "light" in entry) return [String(entry.light).toUpperCase(), String(entry.dark).toUpperCase()]
            return []
          }),
        ])
        for (const hex of hexes) {
          if (!allowed.has(hex as string)) problems.push(`${scheme} ${slot} 用了两张台账之外的 ${hex}（出处：${source.slice(0, 30)}）`)
        }
      }
    }
    expect(problems, `桥接色回查不过：${problems.join(" | ")}`).toEqual([])
    expect(Object.keys(LONESTAR_BRIDGED_COLORS.light).length).toBe(BRIDGED_COLOR_VARS.length)
  })

  test("selection is never the accent, and the gauge sees it being broken", () => {
    const config = { ...DEFAULT_DESIGN_THEME, id: "lonestar" as const, dimensions: { ...ALL_DIMENSIONS_ON } }
    const calm = resolveLoneStarTheme(config, { scheme: "light", activeThemeSeed: null, systemAccentAvailable: false })
    const wild = resolveLoneStarTheme(
      { ...config, lonestar: { ...config.lonestar, seed: "#00ff00", seedSource: "manual" as const } },
      { scheme: "light", activeThemeSeed: null, systemAccentAvailable: false },
    )
    // 先证「换种子这件事真的会动色」——否则下面那两条「不许动」的断言可以空过。
    expect(wild.bundle.vars["--primary"], "离谱种子没改主色 ⇒ 取色这条路径没接线").not.toBe(calm.bundle.vars["--primary"])
    expect(calm.bundle.vars["--primary"], "默认档必须是契约那个橙").toBe(LONESTAR_CONTRACT_COLORS.orange)
    for (const slot of LONESTAR_SEED_RULE.frozenSlots) {
      expect(wild.bundle.vars[slot], `换种子把 ${slot} 也带跑了——「选中永远不是那个橙」这条律没了`).toBe(calm.bundle.vars[slot])
    }
    expect(
      calm.bundle.vars["--accent"],
      "选区色里不许出现契约的橙",
    ).not.toContain(LONESTAR_CONTRACT_COLORS.orange)
    expect(LONESTAR_SEED_RULE.frozenSlots).toContain("--chart-1")
  })

  test("the palette clears WCAG AA on the pairs that carry text", () => {
    const pairs: Array<[string, string, string]> = [
      ["--foreground", "--background", "正文"],
      ["--muted-foreground", "--background", "次级文字"],
      ["--card-foreground", "--card", "卡片正文"],
      ["--primary-foreground", "--primary", "动作面上的字"],
      ["--secondary-foreground", "--secondary", "次级面上的字"],
      ["--destructive-foreground", "--destructive", "危险面上的字"],
    ]
    const failures: string[] = []
    for (const scheme of ["light", "dark"] as const) {
      const palette = LONESTAR_BRIDGED_COLORS[scheme] as Record<string, string>
      for (const [ink, ground, note] of pairs) {
        const ratio = contrastRatio(palette[ink] as string, palette[ground] as string)
        if (ratio < 4.5) failures.push(`${scheme} ${note}：${ink} on ${ground} 只有 ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures, `AA 不过：${failures.join(" | ")}`).toEqual([])
    // 两档的 danger 反着走，所以 on-danger 也必须反着走——这条是那个方向的算术，不是口味。
    const light = LONESTAR_BRIDGED_COLORS.light as Record<string, string>
    const dark = LONESTAR_BRIDGED_COLORS.dark as Record<string, string>
    expect(contrastRatio(dark["--destructive-foreground"] as string, dark["--destructive"] as string), "暗档：近黑字配亮红").toBeGreaterThan(4.5)
    // 亮档的 danger 是暗红 ⇒ 前景必须比它亮；暗档反过来。这两个方向是算出来的，不是手调。
    const lightInkOnDanger = contrastRatio(light["--destructive-foreground"] as string, light["--destructive"] as string)
    const lightNearBlackOnDanger = contrastRatio(LONESTAR_CALIBRATED.fgInverted.light, light["--destructive"] as string)
    expect(lightInkOnDanger > lightNearBlackOnDanger, "亮档 danger 是暗红：配纸白必须比配近黑更高对比").toBe(true)
  })

  test("the gauge sees a forged citation and a drifted value (falsification controls)", () => {
    // ① 校准表里塞一个不存在的值：转录件反查必须说「没有」。
    const toDart = (hex: string) => `0xFF${hex.replace("#", "").toUpperCase()}`
    expect(snapshot.includes(toDart("#123456")), "夹具色不该在转录件里（在的话这条尺就是瞎的）").toBe(false)
    expect(snapshot.includes(toDart(LONESTAR_CALIBRATED.bg.light)), "正向对照：真值必须在转录件里").toBe(true)
    // ② 分类越级：标 contract 却没指到那张表。
    expect(kindProblem({ cssVar: "--x", kind: "contract", source: "Kisaki 的 BoardPalette 里抄的" })).toBeTruthy()
    // ③ ui 不许藏：没自陈「没有成文出处」就要红。
    expect(kindProblem({ cssVar: "--y", kind: "ui", source: "这个量是本仓定的，看着合适" })).toBeTruthy()
    expect(kindProblem({ cssVar: "--y", kind: "ui", source: "没有成文出处：本仓在斜边上量的可见档" })).toBeNull()
    // ④ 台账漂移：多一行就要被比出来。
    const rows = table("LONESTAR-TOKENS")
    expect([...rows, ["--ls-not-a-token", "shape", "1px", "1px", "ui"]]).not.toEqual(rows)
  })
})
