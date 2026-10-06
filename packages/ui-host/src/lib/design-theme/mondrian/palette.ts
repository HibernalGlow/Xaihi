/**
 * 风格派（De Stijl / 新造型主义）配方的色板。
 *
 * 这个文件里每个颜色都必须回答「从哪来」。三类来源，不许混：
 *  1. `measured` —— 从公版（Public domain）复现图**量化测出**的中位色：算法是把画面中央
 *     区域按 HSV 分簇（红/黄/蓝 + 白/黑/灰中性簇），取每簇的通道中位数。图与许可记在下面。
 *  2. `derived`  —— 由 `@material/material-color-utilities` 的 `TonalPalette`（HCT）从种子色
 *     推导出来的次级色阶。规则写死在这里，所以任何人重跑都得到同一批值，不靠手感。
 *  3. `ui`       —— 本仓自己定的转译（比如线宽），明写「没有成文规范值」，
 *     将来有人拿规范给它背书就是错。
 *
 * 成文原则（约束「只用直线/矩形/三原色与非彩色」「反对称、以对立取得平衡」）见
 * `docs/advanced-design-theme-md3.md` 的风格派一节，来源是 Tate Glossary 与 Jaffé(1970)，
 * 经 Wikipedia 的 De Stijl / Neoplasticism 条目转引。
 */

import { Hct, TonalPalette, argbFromHex, hexFromArgb } from "@material/material-color-utilities"

/** 来源标注类型；`source` 字段是给人查的，也是测试断言的对象。 */
export type TokenSourceKind = "measured" | "derived" | "principle" | "ui"

export interface SourcedToken {
  value: string
  kind: TokenSourceKind
  source: string
}

/**
 * 测量得到的基色。
 *
 * 图：Piet Mondriaan, 1930, *Composition II in Red, Blue, and Yellow*，
 * Wikimedia Commons 文件 `Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg`
 * （许可：Public domain）；黄色面来自 Commons 文件 `Composition-with-red-yellow-and-blue.jpg`
 * （Public domain）——1930 那幅没有黄面，所以黄必须换一幅量，这一点写死在这里而不是藏在注释里。
 * 采样：中央 80% 区域，520px 缩放图，通道中位数。
 * ⚠️ 复现图不是分光光度计：值代表「这张公版复现图上的颜色」，不代表颜料本身
 * （颜料成分是另一类证据：铬黄/朱红/群青之类，此处不作 hex 依据）。
 */
export const MONDRIAN_MEASURED = {
  red: {
    value: "#dc281f",
    kind: "measured",
    source: "median of the red cluster (61.3% of core px) in Commons file Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg (PD)",
  },
  blue: {
    value: "#015b9d",
    kind: "measured",
    source: "median of the blue cluster (3.3%) in the same 1930 Composition II file (PD)",
  },
  yellow: {
    value: "#dbb404",
    kind: "measured",
    source: "median of the yellow cluster (0.4%) in Commons file Composition-with-red-yellow-and-blue.jpg (PD); the 1930 work has no yellow plane",
  },
  black: {
    value: "#17191a",
    kind: "measured",
    source: "median of the dark neutral cluster (7.8%) — the painted dividing lines — in the same 1930 file (PD)",
  },
  white: {
    value: "#e7e6e5",
    kind: "measured",
    source: "median of the light neutral cluster (26.5%) — the ground — in the same 1930 file (PD)",
  },
  grey: {
    value: "#95908d",
    kind: "measured",
    source: "median of the mid neutral cluster (0.5%) in the same 1930 file (PD)",
  },
} as const satisfies Record<string, SourcedToken>

export type MondrianPrimary = "red" | "blue" | "yellow"

/**
 * 线宽：⚠️ `ui` 转译，不是量出来的。
 * 我试过从那张 1930 复现图量黑线粗细：暗像素在中位意义上呈散点（竖向/横向连续黑段长度都 ≤2px，
 * 而暗像素总占比 7.0%），也就是说这张图的压缩与打光让「线宽」不可测。所以这里给的是
 * 界面尺度上的取值，来源栏必须写「no documented spec value」。
 * 原则性约束（必须是直线、等宽、直角相交）来自 Tate Glossary 那句
 * "only straight and horizontal or vertical lines"。
 */
export const MONDRIAN_LINE_WEIGHTS: Record<1 | 2 | 3, SourcedToken> = {
  1: { value: "1px", kind: "ui", source: "hairline plane divider; no documented spec value" },
  2: { value: "2px", kind: "ui", source: "default structural line; no documented spec value" },
  3: { value: "3px", kind: "ui", source: " emphasised structural line; no documented spec value" },
}

function paletteFor(hex: string): TonalPalette {
  return TonalPalette.fromHct(Hct.fromInt(argbFromHex(hex)))
}

/** 派生规则：HCT 色调阶梯，tone 数字写在这里，值由 MCU 算。 */
function derived(palette: TonalPalette, tone: number, what: string): SourcedToken {
  return {
    value: hexFromArgb(palette.tone(tone)).toLowerCase(),
    kind: "derived",
    source: `TonalPalette(${what}).tone(${tone}) via @material/material-color-utilities`,
  }
}

export interface MondrianSchemeColors {
  /** 平面色（原色）与承载面（非彩色）+ 结构线，全部带来源。 */
  [name: string]: SourcedToken
}

/**
 * 明暗两套：亮 = 白底 + 黑线（作品的原生关系）；暗 = 黑底 + **白线**（把非彩色互换，
 * 原色保持原色）。互换规则本身就是「只用三原色与三非彩色」这条原则的推论，
 * 所以记 `principle`；每个具体值仍是 derived/measured 的来源。
 */
export function mondrianScheme(scheme: "light" | "dark", accent: MondrianPrimary): MondrianSchemeColors {
  const red = paletteFor(MONDRIAN_MEASURED.red.value)
  const blue = paletteFor(MONDRIAN_MEASURED.blue.value)
  const yellow = paletteFor(MONDRIAN_MEASURED.yellow.value)
  const black = paletteFor(MONDRIAN_MEASURED.black.value)
  const white = paletteFor(MONDRIAN_MEASURED.white.value)
  const grey = paletteFor(MONDRIAN_MEASURED.grey.value)
  const primarySet = { red, blue, yellow }[accent]
  const light = scheme === "light"

  // 亮色方案里平面保持测量原色（tone 40 上下），暗色方案把明度抬到 tone 60 档，
  // 否则 #015b9d 这种深色面压在黑底上对比不足 —— 抬调子的规则写在来源里。
  const planeTone = light ? 40 : 62
  return {
    planeAccent: derived(primarySet, planeTone, `primary(${accent})`),
    planeRed: derived(red, planeTone, "red"),
    planeBlue: derived(blue, planeTone, "blue"),
    planeYellow: derived(yellow, planeTone, "yellow"),
    ground: light
      ? { ...MONDRIAN_MEASURED.white, source: `${MONDRIAN_MEASURED.white.source}; used as the light ground` }
      : derived(black, 8, "black ground"),
    groundRaised: derived(white, light ? 96 : 14, "ground raised step"),
    groundSunken: derived(white, light ? 92 : 6, "ground sunken step"),
    line: light
      ? { ...MONDRIAN_MEASURED.black, source: `${MONDRIAN_MEASURED.black.source}; used as the structural line` }
      : derived(white, 96, "line (non-colour swap per principle)"),
    lineSoft: derived(grey, light ? 55 : 45, "soft line"),
    onAccent: derived(primarySet, light ? 98 : 8, "contrast on accent plane"),
    text: light ? { ...MONDRIAN_MEASURED.black } : derived(white, 96, "text on dark ground"),
    textMuted: derived(grey, light ? 35 : 70, "muted text"),
    // 悬停/按下的机制是「对立」而不是阴影：Jaffé(1970) 那句
    // "avoided symmetry and attained aesthetic balance by the use of opposition"。
    opposition: derived(primarySet, light ? 30 : 70, "opposition step for pressed planes"),
  }
}
