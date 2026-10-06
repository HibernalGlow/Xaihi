/**
 * 孤星（Arknights「孤星」/ Cassette Futurism）配方的 token 表。
 *
 * 三条来源，五类记账，一条都不许混：
 *  1. **孤星本身**：鹰角对这次活动 UI 的公开描述只有四条属性（地是带聚酯色偏的白、
 *     高亮度橙只留给机械交互、几何是平面加曲线、项目经理点名 Dieter Rams 与 less is more）。
 *     **没有任何人发布过它的十六进制色值** —— 所以这张表里没有一个「官方 hex」。
 *  2. **提取到的 Arknights token contract**：五个功能色相（#F6540E 橙 / #3FF7FF 青 /
 *     #FFD802 黄 / #46C47C 绿 / #9C9C9C 灰）加两个切角档（cut-sm 6、cut-md 12）与两条律
 *     （换色必须同时换文字/图标/几何；辉光是反馈，永远不是常设背景）。
 *  3. **cassette-futurism 那份成文契约**（`.style-refs/frontend-styles/catfu/AESTHETIC_CONTRACT.md`）：
 *     发丝线分区、机械动效（linear/steps、≤80ms）、tabular-nums、单一强调色、9px 大写丝网印标签。
 *     ⚠️ 那份契约的**调色板不采用**——它的钴蓝是从一台真机上逐像素采的，属于 catfu 自己。
 *
 * 数值真源是姊妹项目 Kisaki 已经落过一遍的那份校准（`kisaki_app/lib/theme/board_theme.dart` 的
 * `BoardTokens` / `BoardPalette`），它自己把这句话写得很清楚：
 * 「they are ours to defend, not quotes from the source」。本仓照抄同一批数并保留同一条声明——
 * 两边不一致的地方记在 §14 的偏差清单，不假装其中一份是官方。
 *
 * 记账分类（与 Swiss 那份同一套词，`spec.test.ts` 按类别查锚点）：
 *  - `contract`  —— 上面第 2 条那份 token contract 里的值（五个色相、cut 6/12、两条律）。
 *  - `calibrated`—— 孤星没有成文 hex，这一类是「按那四条属性校准」的既成值，出处必须点名是哪条属性。
 *  - `reference` —— cassette-futurism 契约与 SBB 阶梯里的成文条款（时长、8px 网格、字阶比）。
 *  - `derived`   —— 由写死的规则算出来（相对字号、选区色 = 青色 × 记账里的不透明度）。
 *  - `ui`        —— 本仓转译决定，`source` 里自陈没有成文出处。
 *
 * ⚠️ 不许绝对 `font-size`（ADR-0080）：字号一律 `calc(1em * 系数)`，分母由浏览器测现量。
 */

import type { DesignDimension } from "../contract"

export type LoneStarTokenKind = "contract" | "calibrated" | "reference" | "derived" | "ui"

export interface LoneStarToken {
  cssVar: string
  dimension: DesignDimension
  light: string
  dark: string
  kind: LoneStarTokenKind
  source: string
}

/**
 * 上游校准封条：本仓不是直接从孤星量出来的，而是抄一份已经落地的校准。
 * 这条必须写进 §14，并且 `spec.test.ts` 会去读那份 dart 文件——**读不到就红**，
 * 因为它在仓库外，所以路径写死在这里而不是靠环境猜（同机可查；换机的处置见 §14 的门禁）。
 */
export const LONESTAR_UPSTREAM = {
  sisterProject: "Kisaki（Prometheus/Kisaki）",
  dartFile: "kisaki_app/lib/theme/board_theme.dart（**本仓之外**，所以不能当测试输入）",
  symbols: ["BoardTokens", "BoardPalette", "BoardThemeKind.cassette"],
  /**
   * 转录件：`board_theme.dart` 的逐字全份副本，在本仓里，测试只吃它。
   * `calibrationSha256` 是**源文件**的 sha（2026-10-06 取）；测试拿它反查副本 BODY 段——
   * 上游哪天被改这里就红，而不是留下一句「我们是照 Kisaki 抄的」当装饰。
   */
  calibrationSnapshot: "docs/design-research/lonestar-kisaki-board-theme.snapshot.dart",
  calibrationSha256: "573a468b6b15ab2135a48bdea2bbb6889446fa7f0000c57ff188653843247a59",
  /** 那份 token contract 的 dart 原件：两台机器上都找不到（详见 §14「先说清楚哪一句是查到的」）。 */
  tokenContractOrigin: "只在转录件的注释里被点名（designTokenAccentOrange / cut.sm / cut.md 等）；原件在本机与 Windows 机上均搜不到",
  selfDisclosure: "Nobody publishes its hex values … they are ours to defend, not quotes from the source",
  /** 2026-10-06 本机复核结果：一次方来源都没命中，所以这四条在本仓**不升级成事实**。 */
  claimVerification: "未复核（web 搜索只命中聚合页，没有任何官方访谈/设定集页面点名这四条属性）",
  cassetteContract: ".style-refs/frontend-styles/catfu/AESTHETIC_CONTRACT.md（同样在本仓之外，本仓只引它的条款编号）",
  cassetteContractSections: "§1 不可谈判项、§2 丝网印标签、§5 间距、§9 动效、§11 对比度",
  eventClaims: "孤星公开描述只有四条属性：聚酯色偏的白地、只留给机械交互的高亮度橙、平面加曲线、Dieter Rams 与 less is more",
} as const

/** 测试反查转录件用的那串 sha（导出是为了 `spec.test.ts` 不必自己再抄一遍）。 */
export const LONESTAR_UPSTREAM_CALIBRATION_SHA = LONESTAR_UPSTREAM.calibrationSha256

/** LONESTAR-CONTRACT 表（§14）：提取到的 Arknights token contract。五个色相 + 两个切角档。 */
export const LONESTAR_CONTRACT_COLORS = {
  orange: "#F6540E",
  cyan: "#3FF7FF",
  yellow: "#FFD802",
  green: "#46C47C",
  grey: "#9C9C9C",
} as const

export const LONESTAR_CONTRACT_CUTS = {
  /** `cut-sm`：面板级切角。 */
  cutSm: 6,
  /** `cut-md`：抬起块（对话框/菜单）级切角。 */
  cutMd: 12,
} as const

/** 那两条律在代码里的形状：写下来才守得住，否则一定会有人「先临时用一下」。 */
export const LONESTAR_CONTRACT_LAWS = [
  {
    id: "color-never-alone",
    text: "换色必须同时换文字、图标或几何——颜色永远不单独承载状态。",
    cssLanding: "悬停/按下除了底色台阶还改 border-color；选中除了色还有一条 32×4 的动作条；focus 用 outline 的宽度与偏移，不只是颜色。",
  },
  {
    id: "glow-is-feedback",
    text: "辉光是反馈，永远不是常设背景。",
    cssLanding: "`--ls-glow` 只允许出现在 :hover / :focus-within 两条规则里；静息态那条用 --ls-shadow-flat（none）。",
  },
] as const

/** LONESTAR-CALIBRATION 表：色板（Kisaki `BoardPalette` 的 cassette 档，`_d(暗, 亮)` 的原样转录）。 */
export const LONESTAR_CALIBRATED = {
  bg: { light: "#E7E2D6", dark: "#15150F" },
  card: { light: "#FAF7F0", dark: "#211F1A" },
  border: { light: "#CFC8B8", dark: "#45423A" },
  fg: { light: "#16150F", dark: "#F4F1E9" },
  fgMuted: { light: "#5C574B", dark: "#B4AE9F" },
  fgFaint: { light: "#8A8474", dark: "#7E796C" },
  fgInverted: { light: "#16150F", dark: "#16150F" },
  primarySoft: { light: "#C2400A", dark: "#FF7A3C" },
  /** 青在亮档**换了明度不换色相**（contract 的 #3FF7FF 在聚酯白上读不出来）。 */
  cyanInk: { light: "#0B6E75", dark: "#3FF7FF" },
  hover: { light: "#EFEAE0", dark: "#2B2924" },
  pressed: { light: "#D8D1C2", dark: "#0C0C08" },
  danger: { light: "#B02A1E", dark: "#FF6B5E" },
  warn: { light: "#8A6A00", dark: "#FFD802" },
  ok: { light: "#1F6B44", dark: "#46C47C" },
  /** 选区 = 青 × 这个不透明度（Kisaki 原话：selection 永远不是那个橙）。 */
  selectionAlpha: { light: 0.16, dark: 0.22 },
} as const

/** 图表循环：契约的五个色相，明暗同值（面板的灯就是那几个灯，不随主题反相）。 */
export const LONESTAR_CHART_CYCLE = [
  LONESTAR_CONTRACT_COLORS.orange,
  LONESTAR_CONTRACT_COLORS.cyan,
  LONESTAR_CONTRACT_COLORS.yellow,
  LONESTAR_CONTRACT_COLORS.green,
  LONESTAR_CONTRACT_COLORS.grey,
] as const

export function selectionWash(scheme: "light" | "dark"): string {
  return `color-mix(in oklab, ${LONESTAR_CALIBRATED.cyanInk[scheme]} ${LONESTAR_CALIBRATED.selectionAlpha[scheme] * 100}%, transparent)`
}

/**
 * 辉光 = 动作面那个色的 35%。写 `var(--primary)` 而不是字面橙，是为了让「用户换了主色」
 * 与「辉光跟着换」之间不留第二条要同步的路；35% 这个量没有成文出处（`ui` 那半），
 * 而这条整只允许出现在 :hover/:focus-within 上（那条律）。
 */
export function glowWash(): string {
  return "0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent)"
}

/**
 * 字号：与 Swiss 同一条取舍——**一个 font-size 都不发**。
 * 理由（含浏览器实测的父级字号不齐）写在 swiss/spec.ts 的对应注释里，两配方共用同一条结论；
 * 这里多一条孤星特有的：面板上的「读数」要的是**等宽与 tabular**，不是小一号——
 * Kisaki 那份也是这么落的（tableFigure 只比行字小一档，而它那一档在本仓没有统一分母）。
 */

/**
 * 取色规则。孤星的橙**可以**换种子（用户 2026-10-06 的口径：超级主题自己也要能指定颜色），
 * 但有一条不许退的律：选中态永远不跟着变成那个新主色——它钉死在契约的青上。
 * 所以派生只覆盖「动作面」那一组槽，`LONESTAR_SEED_RULE.frozenSlots` 是反例清单。
 */
export const LONESTAR_SEED_RULE = {
  /** 主色就是种子本身，**不做音阶平移**：孤星那条属性说的是「高亮度橙」这个色，规范里没有任何一处说主色要取 tone 几，平移就是替原作发明一条规则。 */
  primaryIsSeedVerbatim: true,
  /**
   * 主色上的字：在两支候选里现算对比，取更高的一支。
   * 默认种子 #F6540E 量出来是 #16150F（4.31:1，另一支白只有 2.45:1）——
   * 也就是说「什么都不调」时这一条规则**复现**了校准值，等式由 LONESTAR-SEED 说明 的测试钉住。
   */
  foregroundCandidates: [LONESTAR_CALIBRATED.fgInverted.light, LONESTAR_CALIBRATED.card.light] as const,
  /** 不许被种子带跑的槽：选区那两件与整条图表循环。 */
  frozenSlots: ["--accent", "--accent-foreground", "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"],
  source:
    "候选两支就是校准表里的 fgInverted 与 card；规则本身（对比取高者）是 `derived`，" +
    "由 contrast.ts 现算，任何人重跑得同一支前景",
} as const

/** §14：一个颜色主题该发的 36 个槽。 */
export const LONESTAR_BRIDGED_COLORS = {
  light: {
    "--background": LONESTAR_CALIBRATED.bg.light,
    "--foreground": LONESTAR_CALIBRATED.fg.light,
    "--card": LONESTAR_CALIBRATED.card.light,
    "--card-foreground": LONESTAR_CALIBRATED.fg.light,
    "--popover": LONESTAR_CALIBRATED.card.light,
    "--popover-foreground": LONESTAR_CALIBRATED.fg.light,
    "--primary": LONESTAR_CONTRACT_COLORS.orange,
    "--primary-foreground": LONESTAR_CALIBRATED.fgInverted.light,
    "--secondary": LONESTAR_CALIBRATED.hover.light,
    "--secondary-foreground": LONESTAR_CALIBRATED.fg.light,
    "--muted": LONESTAR_CALIBRATED.hover.light,
    "--muted-foreground": LONESTAR_CALIBRATED.fgMuted.light,
    "--accent": selectionWash("light"),
    "--accent-foreground": LONESTAR_CALIBRATED.cyanInk.light,
    "--destructive": LONESTAR_CALIBRATED.danger.light,
    "--destructive-foreground": LONESTAR_CALIBRATED.card.light,
    "--border": LONESTAR_CALIBRATED.border.light,
    "--input": LONESTAR_CALIBRATED.border.light,
    "--ring": LONESTAR_CONTRACT_COLORS.orange,
    "--chart-1": LONESTAR_CHART_CYCLE[0],
    "--chart-2": LONESTAR_CHART_CYCLE[1],
    "--chart-3": LONESTAR_CHART_CYCLE[2],
    "--chart-4": LONESTAR_CHART_CYCLE[3],
    "--chart-5": LONESTAR_CHART_CYCLE[4],
    "--sidebar": LONESTAR_CALIBRATED.bg.light,
    "--sidebar-foreground": LONESTAR_CALIBRATED.fg.light,
    "--sidebar-primary": LONESTAR_CONTRACT_COLORS.orange,
    "--sidebar-primary-foreground": LONESTAR_CALIBRATED.fgInverted.light,
    "--sidebar-accent": selectionWash("light"),
    "--sidebar-accent-foreground": LONESTAR_CALIBRATED.cyanInk.light,
    "--sidebar-border": LONESTAR_CALIBRATED.border.light,
    "--sidebar-ring": LONESTAR_CONTRACT_COLORS.orange,
    "--ws-grid-color": `color-mix(in oklab, ${LONESTAR_CALIBRATED.border.light} 58%, transparent)`,
    "--ws-canvas": LONESTAR_CALIBRATED.bg.light,
    "--ws-accent-glow": "color-mix(in oklab, var(--primary) 16%, transparent)",
    "--ws-focused-overlay": `color-mix(in oklab, ${LONESTAR_CALIBRATED.fg.light} 38%, transparent)`,
  },
  dark: {
    "--background": LONESTAR_CALIBRATED.bg.dark,
    "--foreground": LONESTAR_CALIBRATED.fg.dark,
    "--card": LONESTAR_CALIBRATED.card.dark,
    "--card-foreground": LONESTAR_CALIBRATED.fg.dark,
    "--popover": LONESTAR_CALIBRATED.card.dark,
    "--popover-foreground": LONESTAR_CALIBRATED.fg.dark,
    "--primary": LONESTAR_CONTRACT_COLORS.orange,
    "--primary-foreground": LONESTAR_CALIBRATED.fgInverted.dark,
    "--secondary": LONESTAR_CALIBRATED.hover.dark,
    "--secondary-foreground": LONESTAR_CALIBRATED.fg.dark,
    "--muted": LONESTAR_CALIBRATED.hover.dark,
    "--muted-foreground": LONESTAR_CALIBRATED.fgMuted.dark,
    "--accent": selectionWash("dark"),
    "--accent-foreground": LONESTAR_CALIBRATED.cyanInk.dark,
    "--destructive": LONESTAR_CALIBRATED.danger.dark,
    "--destructive-foreground": LONESTAR_CALIBRATED.fgInverted.dark,
    "--border": LONESTAR_CALIBRATED.border.dark,
    "--input": LONESTAR_CALIBRATED.border.dark,
    "--ring": LONESTAR_CONTRACT_COLORS.orange,
    "--chart-1": LONESTAR_CHART_CYCLE[0],
    "--chart-2": LONESTAR_CHART_CYCLE[1],
    "--chart-3": LONESTAR_CHART_CYCLE[2],
    "--chart-4": LONESTAR_CHART_CYCLE[3],
    "--chart-5": LONESTAR_CHART_CYCLE[4],
    "--sidebar": LONESTAR_CALIBRATED.pressed.dark,
    "--sidebar-foreground": LONESTAR_CALIBRATED.fg.dark,
    "--sidebar-primary": LONESTAR_CONTRACT_COLORS.orange,
    "--sidebar-primary-foreground": LONESTAR_CALIBRATED.fgInverted.dark,
    "--sidebar-accent": selectionWash("dark"),
    "--sidebar-accent-foreground": LONESTAR_CALIBRATED.cyanInk.dark,
    "--sidebar-border": LONESTAR_CALIBRATED.border.dark,
    "--sidebar-ring": LONESTAR_CONTRACT_COLORS.orange,
    "--ws-grid-color": `color-mix(in oklab, ${LONESTAR_CALIBRATED.border.dark} 62%, transparent)`,
    "--ws-canvas": LONESTAR_CALIBRATED.bg.dark,
    "--ws-accent-glow": "color-mix(in oklab, var(--primary) 20%, transparent)",
    "--ws-focused-overlay": `color-mix(in oklab, ${LONESTAR_CALIBRATED.pressed.dark} 72%, transparent)`,
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>

/** 每个槽的出处：`contract:`/`calibrated:`/`alpha:`/`ui:` 四类锚点，`spec.test.ts` 逐条回查。 */
export const LONESTAR_BRIDGED_COLOR_SOURCES = {
  light: {
    "--background": "calibrated:bg —— 四条属性里的「地是带聚酯色偏的白」",
    "--foreground": "calibrated:fg —— 同一句的另一半：聚酯白地上不用纯黑",
    "--card": "calibrated:card —— 「两块地」的第二块（面板上铺的那张纸）",
    "--card-foreground": "calibrated:fg",
    "--popover": "ui:抬起面沿用纸色而不是第三块地——契约明写辉光不当常设背景，这里连第三层地也不给",
    "--popover-foreground": "calibrated:fg",
    "--primary": "contract:orange —— 高亮度橙，只留给机械交互",
    "--primary-foreground": "calibrated:fgInverted —— 亮橙地上写近黑（Kisaki 两档同值，不是白字）",
    "--secondary": "calibrated:hover",
    "--secondary-foreground": "calibrated:fg",
    "--muted": "calibrated:hover —— muted 与次级面同一档：层级靠台阶，不靠色相",
    "--muted-foreground": "calibrated:fgMuted",
    "--accent": "derived:selectionWash(light) —— 选区是契约的青 × 记账里的 0.16，**永远不是那个橙**",
    "--accent-foreground": "calibrated:cyanInk —— 青在亮档换明度不换色相（#3FF7FF 在聚酯白上读不出来）",
    "--destructive": "calibrated:danger",
    "--destructive-foreground": "ui:亮档的 danger 是暗红，所以前景配纸白；暗档反过来——两档前景相反是**算出来的**，见 LONESTAR-SEED 说明 的对比度测",
    "--border": "calibrated:border",
    "--input": "ui:输入框描边沿用同一档 border（Kisaki 的 input 也是同一支笔）",
    "--ring": "contract:orange —— 焦点是交互，交互归橙",
    "--chart-1": "contract:orange",
    "--chart-2": "contract:cyan",
    "--chart-3": "contract:yellow",
    "--chart-4": "contract:green",
    "--chart-5": "contract:grey —— 循环就是面板那五个灯，不是图表库的调色板",
    "--sidebar": "calibrated:bg —— 两块地：侧栏不额外发明第三块",
    "--sidebar-foreground": "calibrated:fg",
    "--sidebar-primary": "contract:orange",
    "--sidebar-primary-foreground": "calibrated:fgInverted",
    "--sidebar-accent": "derived:selectionWash(light)",
    "--sidebar-accent-foreground": "calibrated:cyanInk",
    "--sidebar-border": "calibrated:border",
    "--sidebar-ring": "contract:orange",
    "--ws-grid-color": "alpha:src/styles/themes/base.css --ws-grid-color 的 0.58；色换成校准的 border",
    "--ws-canvas": "calibrated:bg",
    "--ws-accent-glow": "alpha:src/styles/themes/base.css --ws-accent-glow 的 0.16；色相走 var(--primary)，所以默认是契约的橙、换种子时跟着走",
    "--ws-focused-overlay": "alpha:src/styles/themes/base.css --ws-focused-overlay 的 0.38；色换成校准的 fg",
  },
  dark: {
    "--background": "calibrated:bg",
    "--foreground": "calibrated:fg",
    "--card": "calibrated:card",
    "--card-foreground": "calibrated:fg",
    "--popover": "ui:同亮档，不发明第三块地",
    "--popover-foreground": "calibrated:fg",
    "--primary": "contract:orange —— 橙在两档是同一个值（灯不随主题反相）",
    "--primary-foreground": "calibrated:fgInverted",
    "--secondary": "calibrated:hover",
    "--secondary-foreground": "calibrated:fg",
    "--muted": "calibrated:hover",
    "--muted-foreground": "calibrated:fgMuted",
    "--accent": "derived:selectionWash(dark) —— 暗档 0.22",
    "--accent-foreground": "calibrated:cyanInk —— 暗档直接用契约那个 #3FF7FF",
    "--destructive": "calibrated:danger —— 暗档的 danger 是亮红",
    "--destructive-foreground": "calibrated:fgInverted —— 亮红地上写近黑，与亮档相反，理由同上",
    "--border": "calibrated:border",
    "--input": "ui:同亮档",
    "--ring": "contract:orange",
    "--chart-1": "contract:orange",
    "--chart-2": "contract:cyan",
    "--chart-3": "contract:yellow",
    "--chart-4": "contract:green",
    "--chart-5": "contract:grey",
    "--sidebar": "calibrated:pressed —— 暗档侧栏比地面再沉一档，「两块地」在这里指的是面板与纸，侧栏属于机箱",
    "--sidebar-foreground": "calibrated:fg",
    "--sidebar-primary": "contract:orange",
    "--sidebar-primary-foreground": "calibrated:fgInverted",
    "--sidebar-accent": "derived:selectionWash(dark)",
    "--sidebar-accent-foreground": "calibrated:cyanInk",
    "--sidebar-border": "calibrated:border",
    "--sidebar-ring": "contract:orange",
    "--ws-grid-color": "alpha:src/styles/themes/base.css --ws-grid-color 的 0.62（暗段那一条）；色换成校准的 border",
    "--ws-canvas": "calibrated:bg",
    "--ws-accent-glow": "alpha:src/styles/themes/base.css --ws-accent-glow 的 0.20（暗段那一条）；色相同亮档走 var(--primary)",
    "--ws-focused-overlay": "alpha:src/styles/themes/wuling.css --ws-focused-overlay 的 0.72（基线层的暗色那条没发这一槽）；色换成校准的 pressed",
  },
} as const

const calibrated = (key: keyof typeof LONESTAR_CALIBRATED, note = ""): string =>
  `calibrated:${key} —— Kisaki BoardPalette 的 cassette 档原样转录（LONESTAR-CALIBRATION 表）${note ? "；" + note : ""}`

export const LONESTAR_TOKENS: readonly LoneStarToken[] = [
  // ── shape：角是切出来的，不是倒出来的 ─────────────────────────────────
  {
    cssVar: "--ls-cut-panel",
    dimension: "shape",
    light: `${LONESTAR_CONTRACT_CUTS.cutSm}px`,
    dark: `${LONESTAR_CONTRACT_CUTS.cutSm}px`,
    kind: "contract",
    source: `提取到的 Arknights token contract 的 cut-sm = ${LONESTAR_CONTRACT_CUTS.cutSm}（LONESTAR-CONTRACT 表）。Kisaki 把它用在面板档（BoardTokens.cutPanel）`,
  },
  {
    cssVar: "--ls-cut-block",
    dimension: "shape",
    light: `${LONESTAR_CONTRACT_CUTS.cutMd}px`,
    dark: `${LONESTAR_CONTRACT_CUTS.cutMd}px`,
    kind: "contract",
    source: `同一份 contract 的 cut-md = ${LONESTAR_CONTRACT_CUTS.cutMd}（LONESTAR-CONTRACT 表）；它的规则是「一个组件只用一种切角处理」，所以抬起块另开一档而不是把面板那档乘个系数`,
  },
  {
    cssVar: "--ls-radius-none",
    dimension: "shape",
    light: "0px",
    dark: "0px",
    kind: "reference",
    source: "catfu §1「Zero border-radius on structure」＋ Kisaki 那条律「no surface is filleted - a corner is a chamfer or it is square」：不许圆角，要么切要么直",
  },

  // ── geometry：发丝线、动作条、8px 网格 ────────────────────────────────
  {
    cssVar: "--ls-hairline",
    dimension: "geometry",
    light: "1px",
    dark: "1px",
    kind: "reference",
    source: "catfu §1「Define zones with 1px hairline borders」＋ Kisaki BoardTokens.hairline = 1（同一档也从 SBB 的发丝分隔线来）",
  },
  {
    cssVar: "--ls-rule-emphasized",
    dimension: "geometry",
    light: "2px",
    dark: "2px",
    kind: "ui",
    source: "没有成文出处：catfu 只有 --line/--line-2 两支笔而没有说粗细，2px 是本仓给「强调线」定的档（1px 与它并排时读得出差别）",
  },
  {
    cssVar: "--ls-step-rule-width",
    dimension: "geometry",
    light: "32px",
    dark: "32px",
    kind: "reference",
    source: "Kisaki BoardTokens.stepRuleWidth = 32：当前步的那条结构条，不是下划线（SBB 间距阶的 xLarge 正好也是 32，两处独立对上）",
  },
  {
    cssVar: "--ls-step-rule-thickness",
    dimension: "geometry",
    light: "4px",
    dark: "4px",
    kind: "reference",
    source: "Kisaki BoardTokens.stepRuleThickness = 4（同上一条：32×4 那根条）",
  },
  {
    cssVar: "--ls-gap-cluster",
    dimension: "geometry",
    light: "4px",
    dark: "4px",
    kind: "reference",
    source: "catfu §5「8px base grid（4px for fine control gaps）」＋ SBB xxSmall；Kisaki BoardTokens.gapSmall 同值",
  },
  {
    cssVar: "--ls-gap-pad",
    dimension: "geometry",
    light: "8px",
    dark: "8px",
    kind: "reference",
    source: "catfu §5 的 8px 基准格；SBB xSmall；Kisaki BoardTokens.gap/pad",
  },
  {
    cssVar: "--ls-gap-gutter",
    dimension: "geometry",
    light: "16px",
    dark: "16px",
    kind: "reference",
    source: "catfu §5 的严格阶梯 4·8·12·16·24·32；SBB medium；Kisaki BoardTokens.gutter",
  },
  {
    cssVar: "--ls-gap-section",
    dimension: "geometry",
    light: "24px",
    dark: "24px",
    kind: "reference",
    source: "同上，阶梯里的 24；Kisaki BoardTokens.section",
  },
  {
    cssVar: "--ls-figure-variant",
    dimension: "geometry",
    light: "tabular-nums",
    dark: "tabular-nums",
    kind: "reference",
    source: "catfu §1「Tabular numerals on every readout」：会变的数与要对齐的数一律等宽数字（Kisaki 那边写成 FontFeature.tabularFigures()）",
  },
  {
    cssVar: "--ls-figure-font",
    dimension: "geometry",
    light: "var(--font-app-mono)",
    dark: "var(--font-app-mono)",
    kind: "ui",
    source:
      "没有成文出处：catfu §2 把 body 也钉死在 IBM Plex Mono 上，而本仓的字族归颜色主题＋字体预设（ADR-0080 的口径）。" +
      "所以这里只把**等宽**这一件用在数字与标签上，走宿主已有的 var(--font-app-mono)，不引进任何字体资产（SBB 的字体还另有许可，见 swiss/spec.ts 的 SWISS_UPSTREAM）",
  },

  // ── elevation：什么都不许浮，辉光只许是反馈 ───────────────────────────
  {
    cssVar: "--ls-shadow-flat",
    dimension: "elevation",
    light: "none",
    dark: "none",
    kind: "reference",
    source: "catfu §1「No box-shadows for elevation」＋ Kisaki 那条律 nothing casts a shadow：分区靠发丝线与底色台阶",
  },
  {
    cssVar: "--ls-glow",
    dimension: "elevation",
    light: glowWash(),
    dark: glowWash(),
    kind: "derived",
    source:
      "律：辉光是反馈、永远不是常设背景（LONESTAR-CONTRACT 表 的两条律之一）。所以这条**只允许出现在 :hover/:focus-within 两条规则里**，" +
      "CSS 层里那条由 lonestar 的浏览器测逐条数着（出现次数 != 2 即红）。35% 这个量本身没有成文出处",
  },
  {
    cssVar: "--ls-bevel-inset",
    dimension: "elevation",
    light: `inset 0 1px 0 color-mix(in oklab, ${LONESTAR_CALIBRATED.fgInverted.light} 10%, transparent)`,
    dark: `inset 0 -1px 0 color-mix(in oklab, ${LONESTAR_CALIBRATED.fg.light} 12%, transparent)`,
    kind: "ui",
    source:
      "catfu §1「Depth on physical controls is implied with inset/outset hairline bevels (inset 0 1px 0 …), never a drop shadow」；" +
      "10%/12% 两个量没有成文出处，是本仓在两块地上量出来的可见档",
  },

  // ── typography：两档字重 + 大写标签 + 规范行高 ────────────────────────
  {
    cssVar: "--ls-weight-text",
    dimension: "typography",
    light: "400",
    dark: "400",
    kind: "reference",
    source: "Kisaki BoardTokens.weightText（两档律：500/600/800 在这条配方里违规）＝ SBB 的 light 档",
  },
  {
    cssVar: "--ls-weight-emphasis",
    dimension: "typography",
    light: "700",
    dark: "700",
    kind: "reference",
    source: "Kisaki BoardTokens.weightEmphasis = w700（两档律的另一头，对应 SBB 的 Bold 族）",
  },
  {
    cssVar: "--ls-line-height-body",
    dimension: "typography",
    light: "calc(20 / 16)",
    dark: "calc(20 / 16)",
    kind: "reference",
    source: "SBB medium 的 16/20 那一档（Kisaki fsBody/lhBody 同一对）：写成商而不是小数，「谁除谁」在 CSS 里也可查",
  },
  {
    cssVar: "--ls-line-height-label",
    dimension: "typography",
    light: "calc(16 / 12)",
    dark: "calc(16 / 12)",
    kind: "reference",
    source: "SBB xSmall 的 12/16 那一档（Kisaki fsMicro/lhMicro）",
  },
  {
    cssVar: "--ls-tracking-label",
    dimension: "typography",
    light: "0.08em",
    dark: "0.08em",
    kind: "reference",
    source: "Kisaki BoardTokens.trackingMicro 0.8px ÷ fsCaption 10px；catfu §2 的丝网印标签档是 0.14–0.16em，比这个松——两档相差记在 §14 的偏差 (b)，本仓取宿主 11–12px 标签下还读得出去的那档",
  },
  {
    cssVar: "--ls-tracking-step",
    dimension: "typography",
    light: "0.2em",
    dark: "0.2em",
    kind: "reference",
    source: "Kisaki BoardTokens.trackingStep 2.0px ÷ fsCaption 10px：步号是唯一一条字距开到 0.2em 的地方（「它是面板的标识，不是正文」）",
  },
  {
    cssVar: "--ls-tracking-figure",
    dimension: "typography",
    light: "-0.0167em",
    dark: "-0.0167em",
    kind: "derived",
    source: "Kisaki BoardTokens.trackingDisplay -0.5px ÷ fsHeadline 30px 的商（成组数字收紧）。这一档是唯一**除不尽**的，所以保留四位小数并在 §14 的偏差 (c) 记明它是商的近似而不是规范数",
  },
  {
    cssVar: "--ls-label-transform",
    dimension: "typography",
    light: "uppercase",
    dark: "uppercase",
    kind: "reference",
    source: "catfu §1「UPPERCASE is reserved for silk-screen labels」＋ Kisaki 的 microLabel() 里那句 .toUpperCase()：大写只归标签装置，正文不许",
  },

  // ── motion：机械、无曲线、按下有行程 ─────────────────────────────────
  {
    cssVar: "--ls-motion-duration",
    dimension: "motion",
    light: "80ms",
    dark: "80ms",
    kind: "reference",
    source: "catfu §9「State changes on controls are instant (transition: none) or ≤80ms」——取上限那一档，非零才看得见反馈",
  },
  {
    cssVar: "--ls-motion-ease",
    dimension: "motion",
    light: "linear",
    dark: "linear",
    kind: "reference",
    source: "catfu §9「Easing: linear, steps(n), or step-end only. Never ease, never cubic-bezier」",
  },
  {
    cssVar: "--ls-blink-ease",
    dimension: "motion",
    light: "step-end",
    dark: "step-end",
    kind: "reference",
    source: "catfu §9「Blink is the primary animation」的同一条曲线：指示灯用 step-end，不许淡入淡出",
  },
  {
    cssVar: "--ls-blink-duration",
    dimension: "motion",
    light: "1.2s",
    dark: "1.2s",
    kind: "ui",
    source: "没有成文出处：catfu 给了 keyframes 的形状（0/100%→1，50%→.12）但没给周期。1.2s 是本仓在「看得见它在闪」与「不抢读」之间量的档，见 §14 的偏差 (d)",
  },
  {
    cssVar: "--ls-press-travel",
    dimension: "motion",
    light: "1px",
    dark: "1px",
    kind: "reference",
    source: "catfu §6 按钮：「:active → translateY(1px) (a physical press)」——按下必须有行程，这条与武陵那档（0px）正好相反，是两配方可以在同一处显出差别的地方",
  },

  // ── states：色阶台阶 + 反不相乘 ──────────────────────────────────────
  {
    cssVar: "--ls-hover-ground",
    dimension: "states",
    light: LONESTAR_CALIBRATED.hover.light,
    dark: LONESTAR_CALIBRATED.hover.dark,
    kind: "calibrated",
    source: calibrated("hover"),
  },
  {
    cssVar: "--ls-pressed-ground",
    dimension: "states",
    light: LONESTAR_CALIBRATED.pressed.light,
    dark: LONESTAR_CALIBRATED.pressed.dark,
    kind: "reference",
    source: calibrated("pressed") + "；catfu §5「cells hover shift to --panel, never to a new hue」：悬停只走台阶，不许换色相",
  },
  {
    cssVar: "--ls-selection-ground",
    dimension: "states",
    light: selectionWash("light"),
    dark: selectionWash("dark"),
    kind: "derived",
    source: "青 × 记账里的 0.16/0.22。这条存在是为了守那条律：**选中永远不是那个橙**（橙在这套语言里意思是「这个步在跑」，被选中的行不许冒充它）",
  },
  {
    cssVar: "--ls-selection-ink",
    dimension: "states",
    light: LONESTAR_CALIBRATED.cyanInk.light,
    dark: LONESTAR_CALIBRATED.cyanInk.dark,
    kind: "calibrated",
    source: calibrated("cyanInk", "亮档换明度不换色相，因为 #3FF7FF 在聚酯白上读不出来"),
  },
  {
    cssVar: "--ls-rule-strong",
    dimension: "states",
    light: LONESTAR_CALIBRATED.pressed.light,
    dark: LONESTAR_CALIBRATED.fgMuted.dark,
    kind: "ui",
    source: "没有成文出处：强调线用哪一档是本仓决定（亮档取 pressed 那档深、暗档取 fgMuted）。代价：亮档的强调线与按下态同色，靠 2px 的宽度差区分（颜色不单独承载状态那条律的另一半）",
  },
  {
    cssVar: "--ls-focus-ring-offset",
    dimension: "states",
    light: "2px",
    dark: "2px",
    kind: "ui",
    source: "没有成文出处：focus 必须**改变宽度与偏移**而不只是颜色（那条律要求的），2px 是本仓量的可见档",
  },
]

/** 配方写进 `:root` 的诊断属性；`apply.ts` 按命名空间整批清理。 */
export const LONESTAR_CUT_ATTR = "data-lonestar-cut" as const
export const LONESTAR_LABEL_ATTR = "data-lonestar-labels" as const
export const LONESTAR_FIGURE_ATTR = "data-lonestar-figures" as const
export const LONESTAR_SEED_ATTR = "data-lonestar-seed" as const
export const LONESTAR_SEED_SOURCE_ATTR = "data-lonestar-seed-source" as const
export const LONESTAR_SEED_FALLBACK_ATTR = "data-lonestar-seed-fallback" as const
export const LONESTAR_TOKEN_COUNT_ATTR = "data-lonestar-tokens" as const

export const LONESTAR_TOKEN_NAMES: readonly string[] = LONESTAR_TOKENS.map((token) => token.cssVar)
