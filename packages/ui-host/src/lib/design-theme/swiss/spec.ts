/**
 * Swiss / 国际主义排版风格（International Typographic Style）配方的 token 表。
 *
 * 与风格派、武陵同一条纪律：**每个值都必须回答「从哪来」**，五类来源不许混：
 *  - `spec`      —— SBB（瑞士联邦铁路）公开发布的 Flutter 设计系统里的成文值。
 *    本机可读的克隆在 `Prometheus/_refs/sbb-design-system`，文件与符号写进 `source`；
 *    值本身抄录在下面 `SWISS_SBB_*` 三张表里，而这三张表与
 *    `docs/advanced-design-theme-md3.md` §13 里三张带锚点的出处表**逐行互等**（`spec.test.ts` 双向核）。
 *  - `reference` —— 组合参考 `Prometheus/_refs/bwt/templates/Swiss-Minimalist/Swiss-Minimalist.md`
 *    （designprompts.dev 那份 DNA）里的成文条款。它不是规范，是一份可点名的实现意图，
 *    与 SBB 冲突时（例如两个不同的红）按谁成文谁赢、并把另一条记进 §13 的偏差清单。
 *  - `extracted` —— 从既有实现里量出来的：本仓 `src/styles/themes/base.css` 的基线层，
 *    以及姊妹项目 Kisaki 的那份 Swiss 骨架（`BoardTokens`）——它先按同一条规范落过一次，
 *    两边对不上的地方在 §13 的偏差清单 记成偏差，不假装只有一份是对的。
 *  - `derived`   —— 由写死的规则从上几类算出来（相对字号 = 规范字阶 ÷ 宿主实测字号，ADR-0080）。
 *  - `ui`        —— 本仓的转译决定（把哪个规范档派给哪个槽、静默结构线不走纯黑、暗色图案抬一档），
 *    `source` 里必须自陈「没有成文出处」并把代价量出来。
 *
 * 为什么不用 `Swiss-Minimalist.md` 那份组合参考的颜色当第一真源：它给的 #FF3000 与 SBB 的
 * #EB0000 是两个不同的红，而 SBB 那一份有可点名的符号（`SBBColors.red`）与公开规范页。
 * 这条选择记在 §13 的偏差清单 Deviations (a)。
 *
 * ⚠️ 不许出现绝对 `font-size`（`docs/adr/0080-design-languages-scale-fonts-relatively.md`）：
 * 字号只能写成 `calc(1em * <系数>)`，系数 = 规范字阶 ÷ 宿主该角色实测字号，分母与商都要记账。
 */

import type { DesignDimension } from "../contract"

export type SwissTokenKind = "spec" | "reference" | "extracted" | "derived" | "ui"

export interface SwissToken {
  cssVar: string
  dimension: DesignDimension
  light: string
  dark: string
  kind: SwissTokenKind
  /** 「这一条到底从哪来」；`ui` 类必须自陈没有成文出处。 */
  source: string
}

/**
 * 上游真源的机器可读封条。`spec.test.ts` 要求 §13 的出处表把这些字段逐条原样写出来，
 * 这样「我们引的是哪一版 SBB」不会随时间烂掉。
 *
 * ⚠️ 许可不是一整块：`LICENSE` 是 MIT（Copyright 2024 Schweizerische Bundesbahnen AG），
 * 覆盖代码与 token 数值；但 `NOTICE.md` 明写 `lib/fonts/SBBWeb-*.ttf` 是 URW++ 授权给 SBB 的
 * 受限许可（"narrower than the MIT terms"），`sbb_icons_*.ttf` 更没有任何 formalize 的许可。
 * ⇒ 本配方**只抄数值**，绝不引进字体或图标资产；`typography` 维度也不许写 `font-family`
 * （字族归颜色主题 + 字体预设，见 ADR-0080 与 §13 的偏差 (c)）。
 */
export const SWISS_UPSTREAM = {
  name: "SBB Design System (mobile, Flutter)",
  package: "sbb_design_system_mobile",
  version: "5.2.0",
  commit: "bb4f34336112d7ae36367a1abf868b9f3a9d82bb",
  commitDate: "2026-09-25",
  license: "MIT（代码与 token 值）；字体与图标资产不在该许可内",
  specUrls: [
    "https://digital.sbb.ch/de/foundation/colors/base-colors/",
    "https://www.figma.com/design/5j2eZ2D0sHYFKkRSmFdBPJ/SBB-Colors",
  ],
  localClone: "Prometheus/_refs/sbb-design-system",
} as const

/** 出处表 SWISS-SBB-COLORS 表：SBB 标准色。逐条来自 `sbb_colors.dart` 的 `SBBColors.<name>`。 */
export const SWISS_SBB_COLORS = {
  red: "#EB0000",
  red85: "#FF3838",
  red125: "#C60018",
  white: "#FFFFFF",
  milk: "#F6F6F6",
  cloud: "#E5E5E5",
  silver: "#DCDCDC",
  aluminum: "#D2D2D2",
  platinum: "#CDCDCD",
  cement: "#BDBDBD",
  graphite: "#B7B7B7",
  storm: "#A8A8A8",
  smoke: "#8D8D8D",
  metal: "#767676",
  granite: "#686868",
  anthracite: "#5A5A5A",
  iron: "#444444",
  charcoal: "#212121",
  midnight: "#151515",
  black: "#000000",
  night: "#143A85",
  success: "#008233",
  warning: "#FCBB00",
} as const satisfies Record<string, string>

export type SwissSbbColor = keyof typeof SWISS_SBB_COLORS

/** 出处表 SWISS-TYPE-SCALE 表：SBB 七级字阶与行高，来自 `sbb_typography.dart` 的 `SBBTextStyles.*FontSize/FontHeight`。 */
export const SWISS_SBB_TYPE_SCALE = [
  { step: "xxSmall", size: 10, height: 12 },
  { step: "xSmall", size: 12, height: 16 },
  { step: "small", size: 14, height: 20 },
  { step: "medium", size: 16, height: 20 },
  { step: "large", size: 18, height: 24 },
  { step: "xLarge", size: 24, height: 32 },
  { step: "xxLarge", size: 30, height: 32 },
] as const

/** 出处表 SWISS-GEOMETRY 表：SBB 间距阶（`sbb_spacing.dart` 的 `SBBSpacing`）与两条几何事实。 */
export const SWISS_SBB_SPACING = {
  zero: 0,
  xxSmall: 4,
  xSmall: 8,
  small: 12,
  medium: 16,
  large: 24,
  xLarge: 32,
} as const

/** `sbb_divider.dart` 的 `DividerPainter` 默认 `height = 1.0`；分隔线只有粗细、没有阴影。 */
export const SWISS_SBB_HAIRLINE_PX = 1

/**
 * `sbb_list_item.dart` 的行 minHeight 44.0（另有 tab 的 portraitSize 44.0、分段控件 defaultButtonHeight 44.0）。
 * 但成文的按钮档**不是** 44：`default_button_themes.dart` 写 defaultSBBButtonHeight = 42.0（small 30.0），
 * 注释的解释是「Figma 的 44 含内描边，渲染减 2px 再加 1px 外边距」。
 * 本配方**没接管**任何控件高度，理由与代价见 §13 的偏差 (d)。
 */
export const SWISS_SBB_TOUCH_MIN_PX = 44

const sbbColor = (name: SwissSbbColor, symbol: string): string =>
  `sbb_colors.dart 的 SBBColors.${symbol}（SWISS-SBB-COLORS 表里的 ${name}）`

const sbb = (name: SwissSbbColor): string => sbbColor(name, name)

/**
 * 结构线宽度档（`ruleWeight` 选项）。
 * 1px = SBB 的发丝分隔线；2px / 4px = 组合参考 `Swiss-Minimalist.md`「圆角与边框」那节点名的
 * `border-2` / `border-4`，并且它明写「移动也不许减细」，所以这一档是配方级开关而不是每处各写。
 */
export const SWISS_RULE_WEIGHTS = {
  1: { value: "1px", source: "SBB DividerPainter 默认 height 1.0（SWISS-GEOMETRY 表）" },
  2: { value: "2px", source: "Swiss-Minimalist.md「边框：粗、可见边框 border-2 或 border-4」" },
  4: { value: "4px", source: "组合参考「圆角与边框」那节点名的 `border-4` 档；同一份参考的 Pricing/FAQ 用的就是它" },
} as const

export type SwissRuleWeight = keyof typeof SWISS_RULE_WEIGHTS | 1 | 2 | 4

/**
 * 字号：这条配方**一个 font-size 都不发**，所以这里没有比例表。
 *
 * ADR-0080 允许「对当前已生效字号乘一个按角色分档的相对量」，但那条相对量的分母是
 * **父元素**的字号（`em` 在 font-size 里就是这么解算的），而本仓各节点面板的父级字号
 * 并不统一——浏览器探针实测：裸 `Card` 里的 `card-title` 16px、`badge` 12px、
 * `.xiranite-node-surface th` 在没有节点样式时是 16px（继承），真实节点表里却是 Tailwind
 * 的 `text-xs`。同一条 `calc(1em * 0.75)` 在两个面板上会长出两个不同的 px，
 * 那不是「按规范排字阶」，那是把不可回读的东西伪装成规范。
 *
 * 所以 Swiss 这一维只管与父级无关的那几件：字重（两档）、行高（规范里的商）、字距、大写。
 * 尺寸轴留给颜色主题 + 字体预设 + 用户缩放。这条取舍记在 §13 的偏差清单 (c)。
 */

/**
 * 取色规则（`color` 维度）。Swiss 只有一套**固定**的规范色板，没有 seed：
 * 唯一那个红是功能信号色（SBB 的 `brand`/`product` 都指回 `red`），换个种子色就等于换掉规范。
 * 所以这里不写 seedSource 选项——一个没人实现的开关就是下一个假绿。
 */
export const SWISS_COLOR_POLICY = {
  seedable: false,
  source:
    "SBB 的 functional colors 里 brand 与 product 都等于 red（sbb_colors.dart，SWISS-SBB-COLORS 表）；" +
    "组合参考同样把红列为「唯一信号色」。因此本配方不开放主色取色。",
} as const

/** 桥接色板：`spec`/`extracted` 值一律回得到上面那张表；`ui` 值是「把哪个规范档派给哪个槽」的转译决定。 */
export const SWISS_BRIDGED_COLORS = {
  light: {
    "--background": SWISS_SBB_COLORS.white,
    "--foreground": SWISS_SBB_COLORS.black,
    "--card": SWISS_SBB_COLORS.milk,
    "--card-foreground": SWISS_SBB_COLORS.black,
    "--popover": SWISS_SBB_COLORS.white,
    "--popover-foreground": SWISS_SBB_COLORS.black,
    "--primary": SWISS_SBB_COLORS.red,
    "--primary-foreground": SWISS_SBB_COLORS.white,
    "--secondary": SWISS_SBB_COLORS.cloud,
    "--secondary-foreground": SWISS_SBB_COLORS.charcoal,
    "--muted": SWISS_SBB_COLORS.milk,
    "--muted-foreground": SWISS_SBB_COLORS.granite,
    "--accent": SWISS_SBB_COLORS.silver,
    "--accent-foreground": SWISS_SBB_COLORS.black,
    "--destructive": SWISS_SBB_COLORS.red125,
    "--destructive-foreground": SWISS_SBB_COLORS.white,
    "--border": SWISS_SBB_COLORS.cloud,
    "--input": SWISS_SBB_COLORS.platinum,
    "--ring": SWISS_SBB_COLORS.red,
    "--chart-1": SWISS_SBB_COLORS.red,
    "--chart-2": SWISS_SBB_COLORS.night,
    "--chart-3": SWISS_SBB_COLORS.success,
    "--chart-4": SWISS_SBB_COLORS.warning,
    "--chart-5": SWISS_SBB_COLORS.metal,
    "--sidebar": SWISS_SBB_COLORS.milk,
    "--sidebar-foreground": SWISS_SBB_COLORS.black,
    "--sidebar-primary": SWISS_SBB_COLORS.red,
    "--sidebar-primary-foreground": SWISS_SBB_COLORS.white,
    "--sidebar-accent": SWISS_SBB_COLORS.cloud,
    "--sidebar-accent-foreground": SWISS_SBB_COLORS.charcoal,
    "--sidebar-border": SWISS_SBB_COLORS.cloud,
    "--sidebar-ring": SWISS_SBB_COLORS.red,
    "--ws-grid-color": `color-mix(in oklab, ${SWISS_SBB_COLORS.aluminum} 58%, transparent)`,
    "--ws-canvas": SWISS_SBB_COLORS.white,
    "--ws-accent-glow": `color-mix(in oklab, ${SWISS_SBB_COLORS.red} 16%, transparent)`,
    "--ws-focused-overlay": `color-mix(in oklab, ${SWISS_SBB_COLORS.black} 38%, transparent)`,
  },
  dark: {
    "--background": SWISS_SBB_COLORS.midnight,
    "--foreground": SWISS_SBB_COLORS.white,
    "--card": SWISS_SBB_COLORS.charcoal,
    "--card-foreground": SWISS_SBB_COLORS.white,
    "--popover": SWISS_SBB_COLORS.charcoal,
    "--popover-foreground": SWISS_SBB_COLORS.white,
    "--primary": SWISS_SBB_COLORS.red,
    "--primary-foreground": SWISS_SBB_COLORS.white,
    "--secondary": SWISS_SBB_COLORS.iron,
    "--secondary-foreground": SWISS_SBB_COLORS.white,
    "--muted": SWISS_SBB_COLORS.charcoal,
    "--muted-foreground": SWISS_SBB_COLORS.storm,
    "--accent": SWISS_SBB_COLORS.anthracite,
    "--accent-foreground": SWISS_SBB_COLORS.white,
    "--destructive": SWISS_SBB_COLORS.red85,
    "--destructive-foreground": SWISS_SBB_COLORS.black,
    "--border": SWISS_SBB_COLORS.iron,
    "--input": SWISS_SBB_COLORS.anthracite,
    "--ring": SWISS_SBB_COLORS.red,
    "--chart-1": SWISS_SBB_COLORS.red85,
    "--chart-2": SWISS_SBB_COLORS.cloud,
    "--chart-3": SWISS_SBB_COLORS.success,
    "--chart-4": SWISS_SBB_COLORS.warning,
    "--chart-5": SWISS_SBB_COLORS.graphite,
    "--sidebar": SWISS_SBB_COLORS.black,
    "--sidebar-foreground": SWISS_SBB_COLORS.white,
    "--sidebar-primary": SWISS_SBB_COLORS.red,
    "--sidebar-primary-foreground": SWISS_SBB_COLORS.white,
    "--sidebar-accent": SWISS_SBB_COLORS.anthracite,
    "--sidebar-accent-foreground": SWISS_SBB_COLORS.white,
    "--sidebar-border": SWISS_SBB_COLORS.iron,
    "--sidebar-ring": SWISS_SBB_COLORS.red,
    "--ws-grid-color": `color-mix(in oklab, ${SWISS_SBB_COLORS.iron} 62%, transparent)`,
    "--ws-canvas": SWISS_SBB_COLORS.midnight,
    "--ws-accent-glow": `color-mix(in oklab, ${SWISS_SBB_COLORS.red} 20%, transparent)`,
    "--ws-focused-overlay": `color-mix(in oklab, ${SWISS_SBB_COLORS.black} 72%, transparent)`,
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>

/**
 * 每个桥接槽的出处。
 *  - `sbb:<name>`          → 值必须等于 `SWISS_SBB_COLORS[name]`（`spec.test.ts` 现查）。
 *  - `alpha:<base.css 行号>` → 那个不透明度是本仓基线层里量到的既有事实。
 *  - `ui:<说明>`            → 转译决定，值仍必须来自 `SWISS_SBB_COLORS`。
 */
export const SWISS_BRIDGED_COLOR_SOURCES = {
  light: {
    "--background": "sbb:white ＋ 组合参考「画布必须中性：纯白」",
    "--foreground": "sbb:black ＋ 组合参考「文字绝对」",
    "--card": "ui:卡片面用牛奶灰而不是纯白 —— 层级靠背景台阶与发丝线，不靠投影",
    "--card-foreground": "sbb:black",
    "--popover": "ui:浮层给纯白（规范里没有「浮层」这一档， assignment 是本仓决定）",
    "--popover-foreground": "sbb:black",
    "--primary": `sbb:red —— ${sbbColor("red", "brand")}，functional brand 与 product 都指回它`,
    "--primary-foreground": "ui:红底配白字；SBB 不给「红底上写什么」的成文值，本仓按 AA 取纯白",
    "--secondary": "ui:次级面走 cloud 档",
    "--secondary-foreground": "ui:文字取 charcoal 而不是纯黑，为了与 muted 台阶分开",
    "--muted": "ui:muted 与 card 同档（milk）—— 同一级「退后」的灰",
    "--muted-foreground": "ui:granite 在白底 5.9:1，过 AA 小字",
    "--accent": "ui:悬停面 silver 档",
    "--accent-foreground": "sbb:black",
    "--destructive": "sbb:red125 —— SBB 的 functional error 就是它",
    "--destructive-foreground": "ui:白字",
    "--border": "sbb:cloud —— `sbb_color_scheme.dart` 的 strokeSeparator（亮档）就是 cloud，这条是成文的；纯黑 4px 那条在 §13 的偏差 (b) 记成偏差并量了代价",
    "--input": "ui:输入框描边比 border 深一档（platinum）",
    "--ring": "sbb:red ＋ 组合参考「聚焦：高对比红环」",
    "--chart-1": "sbb:red",
    "--chart-2": "ui:night 是 SBB 标准色里的蓝，图表需要第二种色相",
    "--chart-3": "sbb:success",
    "--chart-4": "sbb:warning",
    "--chart-5": "ui:metal 作为中性收尾",
    "--sidebar": "ui:侧栏与 card 同档",
    "--sidebar-foreground": "sbb:black",
    "--sidebar-primary": "sbb:red",
    "--sidebar-primary-foreground": "ui:白字",
    "--sidebar-accent": "ui:cloud",
    "--sidebar-accent-foreground": "ui:charcoal",
    "--sidebar-border": "sbb:cloud",
    "--sidebar-ring": "sbb:red",
    "--ws-grid-color": "alpha:src/styles/themes/base.css --ws-grid-color 的 0.58；色相换成 aluminum",
    "--ws-canvas": "ui:画布底色=纯白（与 --background 同值，规范里画布没有第二档）",
    "--ws-accent-glow": "alpha:src/styles/themes/base.css --ws-accent-glow 的 0.16；色相换成 red",
    "--ws-focused-overlay": "alpha:src/styles/themes/base.css --ws-focused-overlay 的 0.38；色相换成 black",
  },
  dark: {
    "--background": "ui:SBB 只发布一套中性阶，暗色地面板取 midnight 档",
    "--foreground": "sbb:white",
    "--card": "ui:比地面高一档（charcoal）—— 台阶式层级，非投影",
    "--card-foreground": "sbb:white",
    "--popover": "ui:charcoal",
    "--popover-foreground": "sbb:white",
    "--primary": "sbb:red —— SBB 的 brandDark 明写「= brand」，红在暗色不换值",
    "--primary-foreground": "ui:白字",
    "--secondary": "ui:iron",
    "--secondary-foreground": "sbb:white",
    "--muted": "ui:charcoal",
    "--muted-foreground": "ui:storm（比 granite 亮一档，暗底才读得出来）",
    "--accent": "ui:anthracite",
    "--accent-foreground": "sbb:white",
    "--destructive": "sbb:red85 —— SBB 的 errorDark 就是 red85，这条是成文的",
    "--destructive-foreground": "ui:黑字",
    "--border": "sbb:iron —— strokeSeparator 的暗档（`sbb_color_scheme.dart`），与亮档同一条规则",
    "--input": "ui:anthracite",
    "--ring": "sbb:red",
    "--chart-1": "sbb:red85",
    "--chart-2": "ui:cloud",
    "--chart-3": "sbb:success",
    "--chart-4": "sbb:warning",
    "--chart-5": "ui:graphite",
    "--sidebar": "sbb:black",
    "--sidebar-foreground": "sbb:white",
    "--sidebar-primary": "sbb:red",
    "--sidebar-primary-foreground": "ui:白字",
    "--sidebar-accent": "ui:anthracite",
    "--sidebar-accent-foreground": "sbb:white",
    "--sidebar-border": "ui:iron",
    "--sidebar-ring": "sbb:red",
    "--ws-grid-color": "alpha:src/styles/themes/base.css --ws-grid-color 的 0.62（暗段那一条）；色相换成 iron",
    "--ws-canvas": "ui:midnight",
    "--ws-accent-glow": "alpha:src/styles/themes/base.css --ws-accent-glow 的 0.20（暗段那一条）；色相换成 red",
    "--ws-focused-overlay": "alpha:src/styles/themes/wuling.css --ws-focused-overlay 的 0.72（基线层的暗色那条没发这一槽，取现存预设里量到的最深档）；色相换成 black",
  },
} as const

export const SWISS_TOKENS: readonly SwissToken[] = [
  // ── shape：直角是这条配方的第一律 ──────────────────────────────────────
  {
    cssVar: "--sw-corner-all",
    dimension: "shape",
    light: "0px",
    dark: "0px",
    kind: "reference",
    source:
      "组合参考 Swiss-Minimalist.md「圆角与边框：圆角 0px（严格矩形）。无圆角」；" +
      "SBB 侧的同一事实是 `sbb_list_item.dart`/输入框都不给圆角（SWISS-GEOMETRY 表），Kisaki 那份记成 BoardTokens.radius = 0",
  },
  {
    cssVar: "--sw-rule-hairline",
    dimension: "geometry",
    light: "1px",
    dark: "1px",
    kind: "spec",
    source: `SBB 分隔线默认粗细 ${SWISS_SBB_HAIRLINE_PX}（divider_painter.dart 的 DividerPainter.height 默认值，SWISS-GEOMETRY 表）`,
  },
  {
    cssVar: "--sw-rule-structural",
    dimension: "geometry",
    light: "2px",
    dark: "2px",
    kind: "reference",
    source:
      "默认档 = `SWISS_RULE_WEIGHTS[2]`（组合参考点名的 border-2）；" +
      "用户可切 1px/4px，见 options.ruleWeight —— 这一条由 resolve 按档位覆写，表里放的是默认档",
  },
  {
    cssVar: "--sw-gap-cluster",
    dimension: "geometry",
    light: "4px",
    dark: "4px",
    kind: "spec",
    source: `SBBSpacing.xxSmall = ${SWISS_SBB_SPACING.xxSmall}（SWISS-GEOMETRY 表）：一组内容内部的间距`,
  },
  {
    cssVar: "--sw-gap-pad",
    dimension: "geometry",
    light: "8px",
    dark: "8px",
    kind: "spec",
    source: `SBBSpacing.xSmall = ${SWISS_SBB_SPACING.xSmall}（SWISS-GEOMETRY 表）`,
  },
  {
    cssVar: "--sw-gap-gutter",
    dimension: "geometry",
    light: "16px",
    dark: "16px",
    kind: "spec",
    source: `SBBSpacing.medium = ${SWISS_SBB_SPACING.medium}（SWISS-GEOMETRY 表）：栏间沟（Kisaki 的 BoardTokens.gutter 同值）`,
  },
  {
    cssVar: "--sw-gap-section",
    dimension: "geometry",
    light: "24px",
    dark: "24px",
    kind: "spec",
    source: `SBBSpacing.large = ${SWISS_SBB_SPACING.large}（SWISS-GEOMETRY 表）：区块之间`,
  },

  // ── elevation：什么都不许浮起来 ────────────────────────────────────────
  {
    cssVar: "--sw-shadow-flat",
    dimension: "elevation",
    light: "none",
    dark: "none",
    kind: "reference",
    source:
      "律本身出自组合参考「阴影：无投影。设计保持扁平」；SBB 侧**确实有成文的 0**：" +
      "`default_sbb_header_theme_data.dart` 的 elevation 0.0 与 `sbb_button_style_x.dart` 的 elevation 0。" +
      "⚠️ 但「SBB 全局无阴影」是过度陈述——它的 switch/slider thumb/paginator/header box 都带真 BoxShadow，" +
      "所以这一条是**本配方取的扁平档**，两条来源在 §13 的偏差 (f) 分开记账。Kisaki 那份把同名律写成 nothing casts a shadow",
  },
  {
    cssVar: "--sw-shadow-raised",
    dimension: "elevation",
    light: "none",
    dark: "none",
    kind: "ui",
    source: "没有成文出处：抬起面（对话框/菜单）也一律拍平是本仓的转译决定，代价是浮层只靠边框与底色台阶区分。留两个名字是因为界面确实有这两类面，它们必须一样平",
  },
  {
    cssVar: "--sw-blur",
    dimension: "elevation",
    light: "none",
    dark: "none",
    kind: "reference",
    source: "组合参考「保持扁平（无阴影或 3D 效果）」：毛玻璃属于被排除的那一类效果，backdrop-filter 一并关掉",
  },

  // ── typography：两档字重 + 规范行高 + 大写标签装置 ─────────────────────
  {
    cssVar: "--sw-weight-text",
    dimension: "typography",
    light: "400",
    dark: "400",
    kind: "spec",
    source:
      "SBB 的排印阶梯只用到 light/bold 两个族（`SBBTextStyles` 的成对常量，`fontWeight` 一律 .normal、" +
      "重量由 family 承载，全仓无 w500/w600）；正文档 400 与组合参考的 Regular 400 同值。" +
      "⚠️ 「只有两档」是对**阶梯**的事实，不是对资产的事实：`SBBFontFamily` 声明了 7 个族，" +
      "而 .w900 在 tab badge/stepper 里确实出现过（§13 的偏差 (g)）",
  },
  {
    cssVar: "--sw-weight-emphasis",
    dimension: "typography",
    light: "700",
    dark: "700",
    kind: "spec",
    source: "SBB `SBBTextStyles` 成对常量里的 Bold 那一档（`sbbFontBold`）；两档之外（500/600/800）在这条配方里是违规的，Kisaki 把同名规则写成一条律（two weights only）。强调档只给标签与标题装置，正文一律 400",
  },
  {
    cssVar: "--sw-line-height-body",
    dimension: "typography",
    light: "calc(20 / 16)",
    dark: "calc(20 / 16)",
    kind: "spec",
    source: `SBB medium：字号 ${SWISS_SBB_TYPE_SCALE[3].size} / 行高 ${SWISS_SBB_TYPE_SCALE[3].height}（SWISS-TYPE-SCALE 表）。写成商而不是小数，是为了让「谁除谁」在 CSS 里也可查`,
  },
  {
    cssVar: "--sw-line-height-label",
    dimension: "typography",
    light: "calc(16 / 12)",
    dark: "calc(16 / 12)",
    kind: "spec",
    source: `SBB xSmall：字号 ${SWISS_SBB_TYPE_SCALE[1].size} / 行高 ${SWISS_SBB_TYPE_SCALE[1].height}（SWISS-TYPE-SCALE 表）`,
  },
  {
    cssVar: "--sw-tracking-label",
    dimension: "typography",
    light: "0.08em",
    dark: "0.08em",
    kind: "extracted",
    source:
      "Kisaki 那份 Swiss 骨架把小标签设成 letterSpacing 0.8 配 10px 字（BoardTokens.trackingMicro ÷ fsCaption）；" +
      "SBB 自己在 `sbb_typography.dart` 里**不写** letterSpacing（即 0），所以这条属于「大写标签装置」这一件组合参考的器件，不是 SBB 的正文规则",
  },
  {
    cssVar: "--sw-tracking-figure",
    dimension: "typography",
    light: "-0.05em",
    dark: "-0.05em",
    kind: "reference",
    source: "组合参考「字距：大标题用 tracking-tighter」（Tailwind 的 tighter = -0.05em），用在成组数字与大号条目上",
  },
  {
    cssVar: "--sw-label-transform",
    dimension: "typography",
    light: "uppercase",
    dark: "uppercase",
    kind: "reference",
    source: "组合参考「样式：几乎所有标题与标签大写」；关掉时 resolve 发 `none`（不是不发，见 resolve 的注释）",
  },



  // ── motion：机械、利落、不许弹簧 ───────────────────────────────────────
  {
    cssVar: "--sw-motion-duration",
    dimension: "motion",
    light: "150ms",
    dark: "150ms",
    kind: "reference",
    source: "组合参考「过渡：duration-200 ease-out 或 duration-150 ease-linear 以快速反馈」——交互态取 150ms 那一档",
  },
  {
    cssVar: "--sw-motion-enter-duration",
    dimension: "motion",
    light: "200ms",
    dark: "200ms",
    kind: "reference",
    source: "组合参考「过渡：duration-200 ease-out 或 duration-150 ease-linear」里的另一档：入场/展开取 200ms",
  },
  {
    cssVar: "--sw-motion-ease",
    dimension: "motion",
    light: "linear",
    dark: "linear",
    kind: "reference",
    source: "组合参考同一句的 `ease-linear`；「无弹性或弹簧动画」是同一条 DNA 的否定式表述",
  },
  {
    cssVar: "--sw-press-travel",
    dimension: "motion",
    light: "0px",
    dark: "0px",
    kind: "reference",
    source: "组合参考「按钮：即时背景色变，无缩放变换」——按下不许位移也不许缩放，故位移量为 0（Kisaki 那份记成同一事实）",
  },

  // ── states：反馈是反色，不是淡出 ───────────────────────────────────────
  {
    cssVar: "--sw-hover-ground",
    dimension: "states",
    light: SWISS_SBB_COLORS.silver,
    dark: SWISS_SBB_COLORS.anthracite,
    kind: "ui",
    source: "没有成文出处：「悬停取哪一档」是本仓决定；色值本身来自 SWISS-SBB-COLORS 表的 silver/anthracite 两档",
  },
  {
    cssVar: "--sw-invert-ground",
    dimension: "states",
    light: SWISS_SBB_COLORS.black,
    dark: SWISS_SBB_COLORS.white,
    kind: "reference",
    source: `组合参考「大胆交互状态：完整色彩反相（非仅不透明淡入）」；值就是 SWISS-SBB-COLORS 表的 ${sbb("black")}/${sbb("white")}`,
  },
  {
    cssVar: "--sw-invert-ink",
    dimension: "states",
    light: SWISS_SBB_COLORS.white,
    dark: SWISS_SBB_COLORS.black,
    kind: "reference",
    source: "组合参考的「完整色彩反相（非仅不透明淡入）」的另一半：底反了字必须跟着反，否则这一维只是把文字弄丢",
  },
  {
    cssVar: "--sw-accent-ground",
    dimension: "states",
    light: SWISS_SBB_COLORS.red,
    dark: SWISS_SBB_COLORS.red,
    kind: "reference",
    source: `组合参考「悬停色彩反相（黑 → 红）」那条：红只有一个值，暗色也不换（SBB 的 brandDark = brand 是成文的）`,
  },
  {
    cssVar: "--sw-focus-ring-width",
    dimension: "states",
    light: "2px",
    dark: "2px",
    kind: "reference",
    source: "组合参考「聚焦：高对比 2px 红环（focus-visible:ring-2）」",
  },

  // ── geometry：让网格可见的那几层图案 ───────────────────────────────────
  {
    cssVar: "--sw-grid-size",
    dimension: "geometry",
    light: "24px",
    dark: "24px",
    kind: "reference",
    source: "组合参考「网格图案：含蓄 24×24px 网格线」——与 `SBBSpacing.large` 同值，两处独立对上，记在 SWISS-TOKENS 表",
  },
  {
    cssVar: "--sw-grid-opacity",
    dimension: "geometry",
    light: "3%",
    dark: "5%",
    kind: "ui",
    source: "没有成文出处的一半：亮档 3% 有出处（组合参考「网格图案：含蓄 24×24px 网格线，3% 不透明度」），但**暗档 5% 是本仓抬的**——同量的点在白地上读得出来、在黑地上读不出来。代价记在 §13 的偏差 (e)",
  },
  {
    cssVar: "--sw-dots-size",
    dimension: "geometry",
    light: "16px",
    dark: "16px",
    kind: "reference",
    source: "组合参考「点阵：径向渐变点，16×16px 间距」",
  },
  {
    cssVar: "--sw-dots-opacity",
    dimension: "geometry",
    light: "4%",
    dark: "6%",
    kind: "ui",
    source: "没有成文出处的一半：亮档 4% 有出处（组合参考「点阵：径向渐变点，16×16px 间距，4% 不透明度」），**暗档 6% 与 --sw-grid-opacity 同一条抬法、同一处记账",
  },
  {
    cssVar: "--sw-pattern-ink",
    dimension: "geometry",
    light: SWISS_SBB_COLORS.black,
    dark: SWISS_SBB_COLORS.white,
    kind: "ui",
    source: "没有成文出处：图案用当前墨色而不是新色是本仓决定——组合参考只说图案要「含蓄」，没说墨水是谁；Kisaki 那份也只用了墨色。暗色反相成白",
  },
  {
    cssVar: "--sw-section-rule-thickness",
    dimension: "geometry",
    light: "4px",
    dark: "4px",
    kind: "reference",
    source: `组合参考「区块编号旁那条 32x4 的点缀条」→ 粗 4px；长度走 --sw-section-rule-width。与 ruleWeight 档无关，那是**静默结构线**的档，这是**主动作条**`,
  },
  {
    cssVar: "--sw-section-rule-width",
    dimension: "geometry",
    light: "32px",
    dark: "32px",
    kind: "reference",
    source: `组合参考那条 32x4 点缀条的「长」；32 同时是 SBB 间距阶的 xLarge = ${SWISS_SBB_SPACING.xLarge}（SWISS-GEOMETRY 表）——两份来源在同一个数上独立对上`,
  },
]

/** 配方写进 `:root` 的诊断属性；`apply.ts` 按命名空间整批清理。 */
export const SWISS_RULE_ATTR = "data-swiss-rule" as const
export const SWISS_LABEL_ATTR = "data-swiss-labels" as const
export const SWISS_TOKEN_COUNT_ATTR = "data-swiss-tokens" as const

export const SWISS_TOKEN_NAMES: readonly string[] = SWISS_TOKENS.map((token) => token.cssVar)
