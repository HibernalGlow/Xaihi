/**
 * 风格派（蒙德里安 / 新造型主义）配方的 token 组装。
 *
 * 输出两份东西：
 *  1. `--stijl-*` 自己的命名空间（平面、结构线、间距、排版），CSS 层只读这些；
 *  2. 桥接的 shadcn 变量（`BRIDGED_COLOR_VARS`），因为组件不认任何主题的名字。
 *
 * 三条硬约束，全部有成文出处（引文与出处在 `palette.ts` 与设计文档里）：
 *  - **圆角恒为 0**："only squares and rectangles, only straight and horizontal or vertical lines"（Tate Glossary）。
 *  - **阴影恒为 none**：阴影是明暗塑形，属于「自然形式的外观」，正是被排除的东西；
 *    分层只靠非彩色平面的深浅与那条结构线来表达。
 *  - **状态反馈用对立而不是叠加**："avoided symmetry and attained aesthetic balance by the use of
 *    opposition"（Jaffé 1970）→ 悬停/按下换平面色与文字色的对置，不加透明叠加层。
 *
 * 与 MD3 一样：维度关掉时那组变量整组不发，不写近似值。
 */

import { BRIDGED_COLOR_VARS, type BridgedColorVar, type DesignThemeConfig, type DesignThemeContext, type DesignThemeResolution } from "../contract"
import { MONDRIAN_LINE_WEIGHTS, mondrianScheme, type SourcedToken } from "./palette"

export const STIJL_VAR = "--stijl-"

/** 回读属性：设置面板与浏览器测试都从这里取名字，避免第二份手抄字符串。 */
export const STIJL_ACCENT_ATTR = "data-stijl-accent"
export const STIJL_LINE_ATTR = "data-stijl-line"
export const STIJL_TOKEN_COUNT_ATTR = "data-stijl-tokens"

/**
 * 色板键 -> CSS 变量名。`kebab()` 会把 `planeAccent` 变成 `plane-accent`，
 * 于是引擎发的名字和 CSS 层读的名字对不上（画面上是「变量缺失＝看得见地坏掉」，
 * 构建照样绿），所以这张表是显式的，名字逐个和 `stijl-components.css` 对齐。
 */
export const STIJL_COLOR_VARS: Readonly<Record<string, string>> = {
  planeAccent: "color-accent",
  planeRed: "color-red",
  planeBlue: "color-blue",
  planeYellow: "color-yellow",
  onAccent: "color-on-accent",
  ground: "color-ground",
  groundRaised: "color-ground-raised",
  groundSunken: "color-ground-sunken",
  line: "color-line",
  lineSoft: "color-line-soft",
  text: "color-text",
  textMuted: "color-text-muted",
  opposition: "color-opposition",
}

/** 非彩色命名空间（几何/排版/动效）的变量名，由 `geometryTokens()` 的键派生。 */
export const STIJL_GEOMETRY_VARS: readonly string[] = [
  "line-width",
  "line-width-soft",
  "radius",
  "shadow",
  "motion-duration",
  "motion-ease",
  "gap",
  "padding",
  "control-height",
  "label-size",
  "label-line-height",
  "label-weight",
  "title-size",
  "title-line-height",
  "title-weight",
  "body-size",
  "body-line-height",
  "font",
]

/**
 * 本配方的完整词汇表。两份语义不同：
 *  - `--stijl-color-*`（13 条）是**词表**，和 MD3 的 `--md-sys-color-*` 同等待遇：
 *    它是「三原色 + 三非彩色」这条原则的陈述，不要求 CSS 层逐条读它；
 *  - 非彩色那 18 条是本仓的 UI 转译，没人读就是死数据，门禁按双向核。
 */
export const STIJL_TOKEN_NAMES: readonly string[] = [
  ...Object.values(STIJL_COLOR_VARS).map((name) => `${STIJL_VAR}${name}`),
  ...STIJL_GEOMETRY_VARS.map((name) => `${STIJL_VAR}${name}`),
]

function bridgeFrom(colors: Record<string, SourcedToken>): Partial<Record<BridgedColorVar, string>> {
  // 色板键写错会让那条变量变成空串，而空串在 CSS 层表现为「看得见地坏掉」之前，
  // 先在这里炸一次更便宜：宁可构建期报错，不要发一条没人能看出来的空变量。
  const value = (name: string): string => {
    const token = colors[name]
    if (!token) throw new Error(`mondrian bridge: palette key '${name}' is not in mondrianScheme()`)
    return token.value
  }
  // shadcn 语义 → 风格派角色。这里没有「规范」可引，是本仓的映射表，
  // 每对都要能一眼看出为什么（写在行内），并且由测试钉住条目数。
  return {
    "--background": value("ground"),
    "--foreground": value("text"),
    "--card": value("groundRaised"),
    "--card-foreground": value("text"),
    "--popover": value("groundRaised"),
    "--popover-foreground": value("text"),
    "--primary": value("planeAccent"),
    "--primary-foreground": value("onAccent"),
    // 次级面 = 中性抬升面：三原色留给「动作与对立」，不作常规装饰（原则：只用三原色，
    // 而一个界面里到处铺原色就等于没有重点）。
    "--secondary": value("groundSunken"),
    "--secondary-foreground": value("text"),
    "--muted": value("groundSunken"),
    "--muted-foreground": value("textMuted"),
    "--accent": value("planeBlue"),
    "--accent-foreground": value("onAccent"),
    "--destructive": value("planeRed"),
    "--destructive-foreground": value("onAccent"),
    "--border": value("line"),
    "--input": value("line"),
    "--ring": value("planeAccent"),
    "--sidebar": value("groundSunken"),
    "--sidebar-foreground": value("text"),
    "--sidebar-primary": value("planeAccent"),
    "--sidebar-primary-foreground": value("onAccent"),
    "--sidebar-accent": value("groundRaised"),
    "--sidebar-accent-foreground": value("text"),
    "--sidebar-border": value("line"),
    "--sidebar-ring": value("planeAccent"),
    "--chart-1": value("planeRed"),
    "--chart-2": value("planeBlue"),
    "--chart-3": value("planeYellow"),
    "--chart-4": value("lineSoft"),
    "--chart-5": value("groundRaised"),
    // 工作区那四条是「叠加在场地上」的用途（画布底纹、网格、聚焦晕），不是平面本体，
    // 所以按 MD3 同一处理方式：用 color-mix 保住对角色变量的引用，只按比例压透明度。
    // 直接发实色会让网格变成一条条不透明的黑线，那是结构线本体、不是底纹。
    "--ws-canvas": `color-mix(in oklab, ${value("groundSunken")} 97%, ${value("line")})`,
    "--ws-grid-color": `color-mix(in oklab, ${value("line")} 22%, transparent)`,
    "--ws-accent-glow": `color-mix(in oklab, ${value("planeAccent")} 14%, transparent)`,
    "--ws-focused-overlay": `color-mix(in oklab, ${value("planeAccent")} 38%, transparent)`,
  }
}

/** 静态几何/排版值：单位与数字都是 UI 尺度上的选择，出处栏统一写 `ui`。 */
function geometryTokens(lineWeight: 1 | 2 | 3): Record<string, SourcedToken> {
  const line = MONDRIAN_LINE_WEIGHTS[lineWeight]
  return {
    "line-width": line,
    "line-width-soft": { value: "1px", kind: "ui", source: "hairline step under the structural line; no documented spec value" },
    radius: { value: "0", kind: "principle", source: "Tate Glossary: \"only squares and rectangles, only straight and horizontal or vertical lines\"" },
    shadow: { value: "none", kind: "principle", source: "no shading: modelling by tone belongs to the natural form that neoplasticism abstracts away (Mondrian 1987 via De Stijl art.)" },
    "motion-duration": { value: "120ms", kind: "ui", source: "movement is not part of the vocabulary; kept short and linear; no documented spec value" },
    "motion-ease": { value: "linear", kind: "ui", source: "no easing vocabulary in the movement; no documented spec value" },
    gap: { value: "12px", kind: "ui", source: "module gap on a 4px base grid; no documented spec value" },
    padding: { value: "16px", kind: "ui", source: "container padding on a 4px base grid; no documented spec value" },
    "control-height": { value: "36px", kind: "ui", source: "equal to this app's existing default control height (h-9 in src/components/ui/button-variants.ts, input.tsx, select.tsx) so layouts do not shift; no documented spec value" },
    "label-size": { value: "0.8125rem", kind: "ui", source: "13px on the app's existing type floor; no documented spec value" },
    "label-line-height": { value: "1.25", kind: "ui", source: "no documented spec value" },
    "label-weight": { value: "700", kind: "ui", source: "structure read as weight, not as colour tint; no documented spec value" },
    "title-size": { value: "1.125rem", kind: "ui", source: "no documented spec value" },
    "title-line-height": { value: "1.2", kind: "ui", source: "no documented spec value" },
    "title-weight": { value: "700", kind: "ui", source: "no documented spec value" },
    "body-size": { value: "0.9375rem", kind: "ui", source: "no documented spec value" },
    "body-line-height": { value: "1.5", kind: "ui", source: "no documented spec value" },
    font: { value: "var(--font-app-sans)", kind: "ui", source: "the movement's geometric sans is not bundled here; bound to the app's own --font-app-sans" },
  }
}

export function resolveMondrianTheme(config: DesignThemeConfig, context: DesignThemeContext): DesignThemeResolution {
  const { dimensions, mondrian } = config
  const colors = mondrianScheme(context.scheme, mondrian.accent)
  const vars: Record<string, string> = {}
  const attributes: Record<string, string> = {
    [STIJL_ACCENT_ATTR]: mondrian.accent,
    [STIJL_LINE_ATTR]: String(mondrian.lineWeight),
  }

  if (dimensions.color) {
    for (const [key, name] of Object.entries(STIJL_COLOR_VARS)) {
      const token = colors[key]
      if (!token) throw new Error(`mondrian: palette key '${key}' disappeared from mondrianScheme()`)
      vars[`${STIJL_VAR}${name}`] = token.value
    }
    const bridge = bridgeFrom(colors)
    const missing = BRIDGED_COLOR_VARS.filter((name) => !bridge[name])
    if (missing.length > 0) throw new Error(`mondrian bridge: unresolved variables ${missing.join(", ")}`)
    Object.assign(vars, bridge)
  }

  const geometry = geometryTokens(mondrian.lineWeight)
  const emitGeometry = dimensions.shape || dimensions.elevation || dimensions.motion || dimensions.geometry || dimensions.typography
  if (emitGeometry) {
    const owner: Record<string, boolean> = {
      "line-width": dimensions.geometry || dimensions.shape,
      "line-width-soft": dimensions.geometry || dimensions.shape,
      radius: dimensions.shape,
      shadow: dimensions.elevation,
      "motion-duration": dimensions.motion,
      "motion-ease": dimensions.motion,
      gap: dimensions.geometry,
      padding: dimensions.geometry,
      "control-height": dimensions.geometry,
      "label-size": dimensions.typography,
      "label-line-height": dimensions.typography,
      "label-weight": dimensions.typography,
      "title-size": dimensions.typography,
      "title-line-height": dimensions.typography,
      "title-weight": dimensions.typography,
      "body-size": dimensions.typography,
      "body-line-height": dimensions.typography,
      font: dimensions.typography,
    }
    for (const [name, token] of Object.entries(geometry)) {
      // 名单外的键不许悄悄发出去：`geometryTokens()` 加一条而这里没登记归属，就该在这里红。
      if (owner[name] === undefined) throw new Error(`mondrian: geometry token '${name}' has no dimension owner`)
      if (owner[name] === false) continue
      vars[`${STIJL_VAR}${name}`] = token.value
    }
  }

  // 回读路径：DOM 上这条是「本次真的写了几条 --stijl-* 」，从产物现算，不是手抄词汇表长度。
  attributes[STIJL_TOKEN_COUNT_ATTR] = String(Object.keys(vars).filter((name) => name.startsWith(STIJL_VAR)).length)

  // 风格派没有「seed」这一步：色板是量出来的固定值，不存在从壁纸/强调色推导。
  // 这里填三条 null 而不是把主动作面冒充 seed —— 类型允许为空就是为了不许编。
  return { bundle: { vars, attributes }, seed: null, seedSource: null, seedFallback: null }
}

/** 供测试与诊断面板用：token → 来源，一条都不许是没标处的裸值。 */
export function mondrianTokenProvenance(lineWeight: 1 | 2 | 3): Record<string, SourcedToken> {
  return { ...mondrianScheme("light", "red"), ...geometryTokens(lineWeight) }
}
