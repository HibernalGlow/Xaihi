/**
 * 风格派色板的**出处**门禁。
 *
 * 这个配方和 MD3 的差别决定了门禁的形状：MD3 的数值有 Google 生成的字典当事实源，
 * `audit:md3-tokens` 查的是「有没有漂移」；风格派没有字典，所以这里的尺查的是
 * 「每个值到底是从哪来的、有没有被谁悄悄改成手感值」。四条规矩：
 *  1. 每一条 token 必须带 `{kind, source}`，缺来源或来源里没有可查物（文件名/规范条款/算法）＝红；
 *  2. `measured` 那批必须等于记录在案的 hex（改动只能连同出处一起改，不许原地换数字）；
 *  3. `derived` 那批必须由 MCU 的 HCT 从某个 `measured` 种子推出，**色相与彩度不许漂**
 *     （漂了就说明有人在推导链上动手改了颜色，而不是只改明度）；
 *  4. 引擎实际 emit 的每条 `--stijl-*`，值必须能在 provenance 表里找到同一条记录。
 *
 * 对比度那条用 WCAG 2.1 的相对亮度公式现算（阈值 4.5 = AA 正文），不是拍的。
 */
import { describe, expect, test } from "vitest"

import { Hct, argbFromHex } from "@material/material-color-utilities"

import { ALL_DIMENSIONS_ON, BRIDGED_COLOR_VARS, DEFAULT_DESIGN_THEME } from "../contract"
import { resolveDesignTheme } from "../registry"
import {
  MONDRIAN_LINE_WEIGHTS,
  MONDRIAN_MEASURED,
  mondrianScheme,
  type SourcedToken,
  type TokenSourceKind,
} from "./palette"
import { STIJL_COLOR_VARS, STIJL_VAR, mondrianTokenProvenance } from "./resolve"

const KINDS: readonly TokenSourceKind[] = ["measured", "derived", "principle", "ui"]

/**
 * 「非彩色」的彩度上界（HCT chroma）。这条阈值两侧都有断言钉着（见 `primaries + non-colours`）：
 * 测量的三块非彩色种子必须在它以下、三块原色种子必须在它以上，空档一收窄就红。
 * 所以这不是单手 tuned 的数字，是被两侧数据夹住的一个分隔点。
 */
const NEUTRAL_CHROMA_MAX = 12

/** 一条 token 合格不合格的判据；`source` 必须含可查物，不接受「设计上如此」这类话。 */
function requireProvenance(name: string, token: SourcedToken | undefined): SourcedToken {
  if (!token) throw new Error(`${name}: token 不存在`)
  expect(KINDS.includes(token.kind), `${name}: kind 缺失或不在词表里`).toBe(true)
  expect(typeof token.source === "string" && token.source.trim().length > 0, `${name}: 没有来源`).toBe(true)
  // 来源里必须点到**可查物**之一：公版图文件名/许可、作者或机构、算法或包名、
  // 「no documented spec value」这类自我声明，或者它绑定的本仓变量名（`--font-app-sans`）。
  const searchable = /(jpg|jpeg|png|commons|public domain|\(pd\)|tate|jaff|mondrian|material-color-utilities|tonalpalette|cluster|median|spec|--[a-z])/i
  expect(searchable.test(token.source), `${name}: 来源里没有可查的出处（文件名/规范/算法）：${token.source}`).toBe(true)
  expect(/^#[0-9a-f]{6}$/.test(token.value) || /^(none|linear|((0|[1-9]\d*)(\.\d+)?|[0-9]*\.\d+)(px|rem|ms|%)?)$/.test(token.value) || token.value.startsWith("var(--"), `${name}: 值形状不像个 token：${token.value}`).toBe(true)
  return token
}

/** WCAG 2.1 相对亮度（sRGB 线性化），用于对比度断言。 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

function hueChroma(hex: string): { hue: number; chroma: number; tone: number } {
  const hct = Hct.fromInt(argbFromHex(hex))
  return { hue: hct.hue, chroma: hct.chroma, tone: hct.tone }
}

describe("mondrian palette provenance", () => {
  test("the measured swatches are exactly the recorded values", () => {
    // 出处与值绑在一起改：有人想换色就必须同时换图/换算法，并且让这条测试变红。
    expect(Object.entries(MONDRIAN_MEASURED).map(([name, token]) => `${name}=${token.value}`).sort()).toEqual([
      "black=#17191a",
      "blue=#015b9d",
      "grey=#95908d",
      "red=#dc281f",
      "white=#e7e6e5",
      "yellow=#dbb404",
    ])
    for (const [name, token] of Object.entries(MONDRIAN_MEASURED)) {
      const record = requireProvenance(`measured.${name}`, token)
      expect(record.kind).toBe("measured")
      expect(record.source, `${name}: 测量值必须写明是哪张公版图`).toMatch(/public domain|\(pd\)/i)
    }
  })

  test("every palette entry carries a source, in both schemes and for every accent", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const accent of ["red", "blue", "yellow"] as const) {
        const colors = mondrianScheme(scheme, accent)
        expect(Object.keys(colors).sort(), `${scheme}/${accent}: 色板词汇表漂移`).toEqual([
          "ground", "groundRaised", "groundSunken", "line", "lineSoft", "onAccent",
          "opposition", "planeAccent", "planeBlue", "planeRed", "planeYellow", "text", "textMuted",
        ].sort())
        for (const [name, token] of Object.entries(colors)) requireProvenance(`${scheme}.${accent}.${name}`, token)
      }
    }
    for (const weight of [1, 2, 3] as const) {
      const line = MONDRIAN_LINE_WEIGHTS[weight]
      requireProvenance(`line.${weight}`, line)
      // 线宽这条是 `ui`：风格派没有留下可执行的界面尺度，来源栏必须自己承认这点。
      expect(line.kind, `${weight}: 线宽不许伪装成量出来的`).toBe("ui")
      expect(line.source).toMatch(/no documented spec value/)
    }
  })

  test("derived colours keep their measured seed's hue and match their own label", () => {
    // 推导只许动 tone（明度）。色相漂了＝有人在链上手改了颜色。
    // 彩度只许**往下**被 sRGB 色域夹掉（`TonalPalette.tone()` 的真实行为：
    // 高彩度黄在 tone 40 上从 57.5 被压到 38.6，第一版把这条当成违规，红了），
    // 往上超种子值才是有人加色。
    const tolerance = 1.5
    const seeds = {
      planeRed: MONDRIAN_MEASURED.red,
      planeBlue: MONDRIAN_MEASURED.blue,
      planeYellow: MONDRIAN_MEASURED.yellow,
      groundRaised: MONDRIAN_MEASURED.white,
      groundSunken: MONDRIAN_MEASURED.white,
      lineSoft: MONDRIAN_MEASURED.grey,
    } as const
    for (const scheme of ["light", "dark"] as const) {
      const colors = mondrianScheme(scheme, "red")
      for (const [name, seed] of Object.entries(seeds)) {
        const token = requireProvenance(`${scheme}.${name}`, colors[name])
        const a = hueChroma(seed.value)
        const b = hueChroma(token.value)
        if (a.chroma >= NEUTRAL_CHROMA_MAX) {
          // 原色：色相是身份，必须钉住；彩度只许被色域夹低。
          expect(Math.abs(a.hue - b.hue), `${scheme}.${name}: 色相漂了（${a.hue.toFixed(2)} → ${b.hue.toFixed(2)}）`).toBeLessThan(tolerance)
          expect(b.chroma, `${scheme}.${name}: 彩度高过种子，说明不是纯明度推导`).toBeLessThanOrEqual(a.chroma + tolerance)
        } else {
          // 非彩色：HCT 的色相在彩度趋 0 时本身不稳定（灰种子 #95908d 的 tone 55 就漂了 2.02°），
          // 所以这里不比色相，只比**它还得是非彩色**：彩度不许长进原色那一侧。
          expect(b.chroma, `${scheme}.${name}: 非彩色推导后彩度越过了 ${NEUTRAL_CHROMA_MAX}，已经不算非彩色`).toBeLessThan(NEUTRAL_CHROMA_MAX)
        }
        // 来源栏写的 tone 必须和值里的 tone 对上：这条是防「改了值没改出处」的关键。
        const claimed = /tone\((\d+(?:\.\d+)?)\)/.exec(token.source)?.[1]
        expect(claimed, `${scheme}.${name}: derived 的来源没写 tone`).toBeTruthy()
        expect(Math.abs(b.tone - Number(claimed)), `${scheme}.${name}: 值的 tone(${b.tone.toFixed(1)}) 与来源标的 tone(${claimed}) 不符`).toBeLessThanOrEqual(1)
      }
    }
  })

  test("the palette really is primaries + non-colours", () => {
    // 机器化的「只用三原色与三非彩色」：两侧都夹住 NEUTRAL_CHROMA_MAX，
    // 并且推导出来的每一条非彩色仍留在非彩色那一侧。
    const neutrals = [MONDRIAN_MEASURED.black, MONDRIAN_MEASURED.white, MONDRIAN_MEASURED.grey]
      .map((token) => hueChroma(token.value))
    const primaries = [MONDRIAN_MEASURED.red, MONDRIAN_MEASURED.blue, MONDRIAN_MEASURED.yellow]
      .map((token) => hueChroma(token.value))
    expect(Math.max(...neutrals.map((entry) => entry.chroma)), "测量的非彩色种子越过了阈值").toBeLessThan(NEUTRAL_CHROMA_MAX)
    expect(Math.min(...primaries.map((entry) => entry.chroma)), "测量的原色种子掉到了阈值以下").toBeGreaterThan(NEUTRAL_CHROMA_MAX)

    for (const scheme of ["light", "dark"] as const) {
      const colors = mondrianScheme(scheme, "red")
      const planes = ["planeRed", "planeBlue", "planeYellow", "planeAccent"].map((name) => hueChroma(colors[name]!.value))
      const derivedNeutrals = ["ground", "groundRaised", "groundSunken", "line", "lineSoft", "text", "textMuted"]
        .map((name) => hueChroma(colors[name]!.value))
      expect(Math.min(...planes.map((entry) => entry.chroma)), `${scheme}: 原色面彩度过低，已经掉进非彩色一侧`).toBeGreaterThan(NEUTRAL_CHROMA_MAX)
      expect(Math.max(...derivedNeutrals.map((entry) => entry.chroma)), `${scheme}: 非彩色推导后长出了彩度`).toBeLessThan(NEUTRAL_CHROMA_MAX)
    }
  })

  test("contrast pairs clear WCAG AA 4.5:1", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const accent of ["red", "blue", "yellow"] as const) {
        const colors = mondrianScheme(scheme, accent)
        const pairs: Array<[string, string, string]> = [
          ["text", "ground", "正文"],
          ["text", "groundRaised", "面板上的正文"],
          ["onAccent", "planeAccent", "动作面上的文字"],
          ["textMuted", "ground", "次要文字"],
        ]
        for (const [foreground, background, what] of pairs) {
          const ratio = contrastRatio(colors[foreground]!.value, colors[background]!.value)
          expect(ratio, `${scheme}/${accent}: ${what} 对比度只有 ${ratio.toFixed(2)}:1（AA 正文要 4.5:1）`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  test("the dark scheme swaps the non-colours and keeps the primaries", () => {
    const light = mondrianScheme("light", "red")
    const dark = mondrianScheme("dark", "red")
    // 地面与结构线互换角色：亮底黑线 → 暗底白线（原则：只动非彩色）。
    expect(relativeLuminance(dark.ground!.value), "暗色方案的地面必须是暗的").toBeLessThan(0.2)
    expect(relativeLuminance(dark.line!.value), "暗色方案的结构线必须是亮的").toBeGreaterThan(0.6)
    expect(relativeLuminance(light.line!.value), "亮色方案的结构线必须是暗的").toBeLessThan(0.2)
    const lightPlane = hueChroma(light.planeBlue!.value)
    const darkPlane = hueChroma(dark.planeBlue!.value)
    expect(Math.abs(lightPlane.hue - darkPlane.hue), "暗色方案不许改原面色相").toBeLessThan(1.5)
    expect(darkPlane.tone, "暗色方案把平面抬调子，否则深色面压黑底对比不足").toBeGreaterThan(lightPlane.tone)
  })

  test("resolution is deterministic and every emitted --stijl-* traces back to a token", () => {
    const config = { ...DEFAULT_DESIGN_THEME, id: "mondrian" as const, dimensions: { ...ALL_DIMENSIONS_ON } }
    const context = { scheme: "light" as const, activeThemeSeed: null, systemAccentAvailable: true }
    const first = resolveDesignTheme(config, context)
    const second = resolveDesignTheme(config, context)
    expect(second?.bundle.vars, "同一份配置两次解析不一样：推导链上有隐藏状态").toEqual(first?.bundle.vars)
    expect(second?.bundle.attributes).toEqual(first?.bundle.attributes)

    const provenance = mondrianTokenProvenance(config.mondrian.lineWeight)
    const byCssName: Record<string, SourcedToken> = {}
    for (const [key, cssName] of Object.entries(STIJL_COLOR_VARS)) {
      const token = provenance[key]
      if (token) byCssName[`${STIJL_VAR}${cssName}`] = token
    }
    for (const [name, token] of Object.entries(provenance)) {
      if (name.startsWith("plane") || name.startsWith("ground") || ["line", "lineSoft", "onAccent", "text", "textMuted", "opposition"].includes(name)) continue
      byCssName[`${STIJL_VAR}${name}`] = token
    }
    const emitted = Object.keys(first?.bundle.vars ?? {}).filter((name) => name.startsWith(STIJL_VAR))
    expect(emitted.length, "一条 --stijl-* 都没发，这个断言就是空的").toBeGreaterThan(20)
    for (const name of emitted) {
      const token = byCssName[name]
      expect(token, `${name} 没有对应的出处记录（引擎发的值查不到来源）`).toBeDefined()
      if (token) {
        expect(first?.bundle.vars[name], `${name} 发出的值与出处记录不一致`).toBe(token.value)
        requireProvenance(name, token)
      }
    }
    // 桥接侧同样不许空：颜色接管时 36 条全在。
    for (const name of BRIDGED_COLOR_VARS) expect(first?.bundle.vars[name], `缺少桥接变量 ${name}`).toBeTypeOf("string")
  })

  test("the gauge itself catches a planted violation (falsification controls)", () => {
    expect(() => requireProvenance("planted-a", undefined as unknown as SourcedToken)).toThrow(/token 不存在/)
    // 缺来源
    expect(() => requireProvenance("planted-b", { value: "#123456", kind: "measured", source: "" })).toThrow(/没有来源/)
    // 来源不可查
    expect(() => requireProvenance("planted-c", { value: "#123456", kind: "measured", source: "看着顺眼" })).toThrow(/可查的出处/)
    // 值的形状不对
    expect(() => requireProvenance("planted-d", { value: "rgb(1 2 3)", kind: "ui", source: "no documented spec value" })).toThrow(/值形状/)
    // 阳性对照：真条目过得了同一把尺
    requireProvenance("red", MONDRIAN_MEASURED.red)
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.6)
  })
})
