/**
 * 武陵（终末地·武陵城 · jade industrial）配方的 token 表。
 *
 * 与风格派那一份同一条纪律：**每个值都必须回答「从哪来」**，而且四类来源不许混：
 *  - `preset`    —— 现存预设 `src/styles/themes/wuling.css` 里量出来的值（带行号）。
 *    这一类是用户口径「保留现有的预设的风格」的可执行形式：配方不许改这些数，
 *    改了就是「_preserving_ 变成了重新设计」，`wuling/spec.test.ts` 逐条把值钉回预设原文。
 *  - `reference` —— 本仓自己的参考文档 `docs/endfield-wuling-reference.md` 给出的第一版落地色板。
 *    那份文档明写「颜色只是第一版起点，不能视为终末地官方色值」，所以这类值**不许**伪装成官方设定。
 *  - `derived`   —— 由写死的规则从上两类推出来的值（例如按取色种子生成主色阶）。规则在本文件里，
 *    任何人重跑得同一批值。
 *  - `ui`        —— 本仓的转译决定（例如把 4px 角称作 chip 档位），明写「没有成文出处」。
 *
 * 为什么事实源是预设文件而不是游戏资产：`docs/endfield-wuling-reproduce.md` 记的那 6,635 张
 * 从合法安装客户端提取的 PNG 在 **Windows 那台机器的 `artifacts/`（gitignored）** 下，
 * 本机不存在，量不了（实测：`ls artifacts/reference/endfield-wuling` 无此目录）。
 * 所以本配方不声称任何从原画「测」出来的数值——那会是编造。能测的是本仓预设文件与本文档。
 */

import type { DesignDimension } from "../contract"

export type WulingTokenKind = "preset" | "reference" | "derived" | "ui"

export interface WulingToken {
  /** 配方自己的命名空间。预设用 `--wuling-*`，配方用 `--wl-*`，两层不能互写。 */
  cssVar: string
  dimension: DesignDimension
  light: string
  dark: string
  kind: WulingTokenKind
  source: string
}

/** 出处简写：`wuling.css:12` 这种字符串由 `spec.test.ts` 反向核对到该行真的有这个值。 */
const preset = (line: number) => `src/styles/themes/wuling.css:${line}`

export const WULING_TOKENS: readonly WulingToken[] = [
  // ── shape：预设里出现的四档角半径 ──────────────────────────────────────────
  {
    cssVar: "--wl-corner-panel",
    dimension: "shape",
    light: "0.5rem",
    dark: "0.5rem",
    kind: "preset",
    source: `${preset(11)} 的 --radius（明暗同一值，暗色块没改它）`,
  },
  {
    cssVar: "--wl-corner-table",
    dimension: "shape",
    light: "8px",
    dark: "8px",
    kind: "preset",
    source: `${preset(264)} 表格容器的 border-radius`,
  },
  {
    cssVar: "--wl-corner-chip",
    dimension: "shape",
    light: "4px",
    dark: "4px",
    kind: "preset",
    source: `${preset(222)} badge、${preset(159)} 拖拽手柄、${preset(301)} 把 rounded-full 收成 4px——三处同一个数`,
  },
  {
    cssVar: "--wl-corner-track",
    dimension: "shape",
    light: "2px",
    dark: "2px",
    kind: "preset",
    source: `${preset(233)} progress 轨道的 border-radius`,
  },

  // ── elevation：硬偏移阴影，零模糊 ────────────────────────────────────────
  {
    cssVar: "--wl-shadow-sm",
    dimension: "elevation",
    light: "2px 2px 0 0 hsl(166 34% 34% / 0.08)",
    dark: "2px 2px 0 0 hsl(173 60% 58% / 0.10)",
    kind: "preset",
    source: `${preset(59)}（亮 --shadow）与 ${preset(121)}（暗 --shadow）`,
  },
  {
    cssVar: "--wl-shadow-md",
    dimension: "elevation",
    light: "3px 3px 0 0 hsl(166 34% 34% / 0.10)",
    dark: "3px 3px 0 0 hsl(173 60% 58% / 0.12)",
    kind: "preset",
    source: `${preset(60)} 与 ${preset(122)}`,
  },
  {
    cssVar: "--wl-shadow-lg",
    dimension: "elevation",
    light: "4px 4px 0 0 hsl(166 34% 34% / 0.10)",
    dark: "4px 4px 0 0 hsl(173 60% 58% / 0.14)",
    kind: "preset",
    source: `${preset(61)} 与 ${preset(123)}`,
  },
  {
    cssVar: "--wl-edge-shadow",
    dimension: "elevation",
    light: "2px 2px 0 color-mix(in oklch, var(--primary) 14%, transparent)",
    dark: "2px 2px 0 color-mix(in oklch, var(--primary) 20%, transparent)",
    kind: "preset",
    source: `${preset(18)} 亮 / ${preset(80)} 暗的 --wuling-hard-shadow（跟随主色，不是跟随黑）`,
  },
  {
    cssVar: "--wl-inset-highlight",
    dimension: "elevation",
    light: "inset 0 1px 0 color-mix(in oklch, var(--card) 82%, var(--primary))",
    dark: "inset 0 1px 0 color-mix(in oklch, var(--card) 82%, var(--primary))",
    kind: "preset",
    source: `${preset(266)} 的 82%（表格容器，本 token 取这一条）；${preset(178)} 面板那条用的是 86%——两处并不一致，这里如实指出现行值取自哪一行，不假装它们同值`,
  },
  {
    cssVar: "--wl-blur",
    dimension: "elevation",
    light: "none",
    dark: "none",
    kind: "preset",
    source: `${preset(146)} 显式把 comp 卡的 backdrop-filter 关掉——层级靠硬投影不靠毛玻璃`,
  },

  // ── typography：账本式小字标签 + 三档行高 ─────────────────────────────────
  {
    cssVar: "--wl-line-height",
    dimension: "typography",
    light: "1.55",
    dark: "1.55",
    kind: "preset",
    source: `${preset(14)} / ${preset(76)}`,
  },
  {
    cssVar: "--wl-field-line-height",
    dimension: "typography",
    light: "1.45",
    dark: "1.45",
    kind: "preset",
    source: `${preset(208)} 输入类元素单独一档`,
  },
  {
    cssVar: "--wl-code-line-height",
    dimension: "typography",
    light: "1.65",
    dark: "1.65",
    kind: "preset",
    source: `${preset(247)} pre/code/kbd/samp`,
  },
  {
    cssVar: "--wl-label-font",
    dimension: "typography",
    light: "var(--font-app-mono)",
    dark: "var(--font-app-mono)",
    kind: "preset",
    source: `${preset(224)} badge、${preset(270)} 表头、${preset(246)} 代码位，一律走等宽`,
  },
  {
    cssVar: "--wl-label-size",
    dimension: "typography",
    light: "0.68rem",
    dark: "0.68rem",
    kind: "preset",
    source: `${preset(225)} 与 ${preset(271)} 同一个数`,
  },
  {
    cssVar: "--wl-label-weight",
    dimension: "typography",
    light: "500",
    dark: "500",
    kind: "preset",
    source: `${preset(226)}`,
  },
  {
    cssVar: "--wl-label-tracking",
    dimension: "typography",
    light: "0.035em",
    dark: "0.035em",
    kind: "preset",
    source: `${preset(227)} badge 与 ${preset(297)} 把 tracking-widest 收到同一个值`,
  },
  {
    cssVar: "--wl-label-tracking-wide",
    dimension: "typography",
    light: "0.04em",
    dark: "0.04em",
    kind: "preset",
    source: `${preset(272)} 表头比 badge 多 0.005em`,
  },
  {
    cssVar: "--wl-label-transform",
    dimension: "typography",
    light: "uppercase",
    dark: "uppercase",
    kind: "preset",
    source: `${preset(228)} 与 ${preset(273)}；由 ledgerLabels 开关决定要不要留 uppercase`,
  },

  // ── motion：一个时长、一条曲线、一次入场 ─────────────────────────────────
  {
    cssVar: "--wl-motion-duration",
    dimension: "motion",
    light: "180ms",
    dark: "180ms",
    kind: "preset",
    source: `${preset(12)} / ${preset(74)}（明暗同值）`,
  },
  {
    cssVar: "--wl-motion-ease",
    dimension: "motion",
    light: "cubic-bezier(0.16, 1, 0.3, 1)",
    dark: "cubic-bezier(0.16, 1, 0.3, 1)",
    kind: "preset",
    source: `${preset(13)} / ${preset(75)}`,
  },
  {
    cssVar: "--wl-enter-duration",
    dimension: "motion",
    light: "220ms",
    dark: "220ms",
    kind: "preset",
    source: `${preset(171)} 面板入场比交互慢 40ms（不是同一个时长）`,
  },
  {
    cssVar: "--wl-enter-offset",
    dimension: "motion",
    light: "6px",
    dark: "6px",
    kind: "preset",
    source: `${preset(307)} keyframes 里的 translateY`,
  },
  {
    cssVar: "--wl-enter-blur",
    dimension: "motion",
    light: "2px",
    dark: "2px",
    kind: "preset",
    source: `${preset(308)} 入场带 2px 模糊再收清`,
  },
  {
    cssVar: "--wl-press-travel",
    dimension: "motion",
    light: "0px",
    dark: "0px",
    kind: "ui",
    source:
      `预设把「按下去」显式写成不位移：${preset(201)} 的 translateY(0) 与 ${preset(193)} 的 transform: none。`
      + `把它表达成一个可减的 length token 是本仓的转译（0 与 0px 不是一回事，CSS 里要的是后者），所以标 ui 不标 preset`,
  },

  // ── states：结构线随主色，状态是「加线」不是「变深」──────────────────────
  {
    cssVar: "--wl-rule",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 18%, var(--border))",
    dark: "color-mix(in oklch, var(--primary) 20%, var(--border))",
    kind: "preset",
    source: `${preset(15)} / ${preset(77)}`,
  },
  {
    cssVar: "--wl-rule-strong",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 42%, var(--border))",
    dark: "color-mix(in oklch, var(--primary) 48%, var(--border))",
    kind: "preset",
    source: `${preset(16)} / ${preset(78)}（暗色里线更亮一点，因为底色压深了）`,
  },
  {
    cssVar: "--wl-hover-wash",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 10%, var(--background))",
    dark: "color-mix(in oklch, var(--primary) 10%, var(--background))",
    kind: "preset",
    source: `${preset(195)}（按钮 hover 的底，跟 scheme 无关）`,
  },
  {
    cssVar: "--wl-hover-ring",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 18%, transparent)",
    dark: "color-mix(in oklch, var(--primary) 18%, transparent)",
    kind: "preset",
    source: `${preset(196)} 内描边与 ${preset(155)} 卡片选中环同一个数`,
  },
  {
    cssVar: "--wl-focus-inset",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 35%, transparent)",
    dark: "color-mix(in oklch, var(--primary) 35%, transparent)",
    kind: "preset",
    source: `${preset(217)} 焦点时内描边加到 35%（hover 的 18% 再压一层）`,
  },
  {
    cssVar: "--wl-row-hover",
    dimension: "states",
    light: "color-mix(in oklch, var(--primary) 8%, transparent)",
    dark: "color-mix(in oklch, var(--primary) 8%, transparent)",
    kind: "preset",
    source: `${preset(292)}`,
  },

  // ── geometry：蓝图纸与网格是这个配方的地形 ───────────────────────────────
  {
    cssVar: "--wl-canvas-grid",
    dimension: "geometry",
    light: "32px",
    dark: "32px",
    kind: "preset",
    source: `${preset(139)} 画布背景 background-size 的边长（32px 32px 取一条）`,
  },
  {
    cssVar: "--wl-blueprint-size",
    dimension: "geometry",
    light: "16px",
    dark: "16px",
    kind: "preset",
    source: `${preset(166)} 节点面板自带 16px 图纸格`,
  },
  {
    cssVar: "--wl-blueprint-stroke",
    dimension: "geometry",
    light: "1px",
    dark: "1px",
    kind: "preset",
    source: `${preset(166)} 图纸线宽（两条 linear-gradient 的 0 0 1px 段）`,
  },
  {
    cssVar: "--wl-blueprint-color",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--primary) 12%, transparent)",
    dark: "color-mix(in oklch, var(--primary) 12%, transparent)",
    kind: "preset",
    source: `${preset(166)}`,
  },
  {
    cssVar: "--wl-stripe",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--primary) 5%, var(--muted))",
    dark: "color-mix(in oklch, var(--primary) 8%, var(--muted))",
    kind: "preset",
    source: `${preset(17)} / ${preset(79)} 表格隔行`,
  },
  {
    cssVar: "--wl-header-tint",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--primary) 8%, var(--muted))",
    dark: "color-mix(in oklch, var(--primary) 8%, var(--muted))",
    kind: "preset",
    source: `${preset(275)} 表头底`,
  },
  {
    cssVar: "--wl-field-tint",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--card) 74%, var(--muted))",
    dark: "color-mix(in oklch, var(--card) 74%, var(--muted))",
    kind: "preset",
    source: `${preset(209)} 输入框底`,
  },
  {
    cssVar: "--wl-surface-tint",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--card) 86%, transparent)",
    dark: "color-mix(in oklch, var(--card) 86%, transparent)",
    kind: "preset",
    source: `${preset(144)} 卡片底（半透明，但 backdrop-filter 仍是 none）`,
  },
  {
    cssVar: "--wl-progress-tint",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--primary) 12%, var(--muted))",
    dark: "color-mix(in oklch, var(--primary) 12%, var(--muted))",
    kind: "preset",
    source: `${preset(234)} 进度条槽`,
  },
  {
    cssVar: "--wl-progress-fill",
    dimension: "geometry",
    light: "linear-gradient(90deg, var(--primary), color-mix(in oklch, var(--primary) 72%, var(--foreground)))",
    dark: "linear-gradient(90deg, var(--primary), color-mix(in oklch, var(--primary) 72%, var(--foreground)))",
    kind: "preset",
    source: `${preset(239)}`,
  },
  {
    cssVar: "--wl-code-surface",
    dimension: "geometry",
    light: "linear-gradient(180deg, color-mix(in oklch, var(--muted) 84%, transparent), color-mix(in oklch, var(--background) 70%, transparent))",
    dark: "linear-gradient(180deg, color-mix(in oklch, var(--muted) 84%, transparent), color-mix(in oklch, var(--background) 70%, transparent))",
    kind: "preset",
    source: `${preset(252)} 代码块底是一条竖向渐变`,
  },
  {
    cssVar: "--wl-code-border",
    dimension: "geometry",
    light: "color-mix(in oklch, var(--primary) 24%, var(--border))",
    dark: "color-mix(in oklch, var(--primary) 24%, var(--border))",
    kind: "preset",
    source: `${preset(253)}（介于 rule 的 18% 与 rule-strong 的 42% 之间，是独立一档）`,
  },

  // ── color：预设实测值 + 取色派生（见 WULING_SEED_RULE）───────────────────
  {
    cssVar: "--wl-reference-surface",
    dimension: "color",
    light: "#12171A",
    dark: "#1B2326",
    kind: "reference",
    source: "docs/endfield-wuling-reference.md:105-106（第一版落地色板，文档自己声明不是官方色值）",
  },
  {
    cssVar: "--wl-reference-accent",
    dimension: "color",
    light: "#D9A441",
    dark: "#D9A441",
    kind: "reference",
    source: "docs/endfield-wuling-reference.md:110（同一份文档的 accent；现行预设选了玉色主色，这条只留作可追溯的第二来源）",
  },
  {
    cssVar: "--wl-primary-tone-light",
    dimension: "color",
    light: "0.72",
    dark: "0.72",
    kind: "preset",
    source: `${preset(26)} 亮色主色的 oklch L（按取色派生时锁定这一档，见 WULING_SEED_RULE）`,
  },
  {
    cssVar: "--wl-primary-tone-dark",
    dimension: "color",
    light: "0.80",
    dark: "0.80",
    kind: "preset",
    source: `${preset(88)} 暗色主色的 oklch L`,
  },
]

/**
 * 按取色（用户自己指定一个颜色、不走配色预设）派生整套主色槽的规则，写死在这里。
 *
 * 为什么要写成数据而不是一句注释：这一档是 `derived`，任何人都得能重跑得到同一批值。
 * 明度档不是拍的——它等于现行预设实测到的 oklch L（上面两条 `--wl-primary-tone-*`）。
 */
export const WULING_SEED_RULE = {
  /** 主色 = 种子色相/彩度所在 TonalPalette 上，亮色取 L≈0.72、暗色取 L≈0.80 的那一档。 */
  lightTone: 60,
  darkTone: 80,
  /** 前景：亮色底上用近黑（预设是 0.16/0.02/174），暗色底上用近白（预设是 1 0 0）。 */
  onLight: "oklch(0.16 0.02 174)",
  onDark: "oklch(1 0 0)",
  source:
    `明度档来自 ${preset(26)} 与 ${preset(88)} 的实测 L；on-primary 来自 ${preset(89)}（暗）与 ${preset(27)}（亮）`,
} as const

/** 预设里一个颜色主题该发的槽 → 预设实测值（`color` 维度的底）。 */
export const WULING_PRESET_COLORS = {
  light: {
    "--background": "oklch(0.981 0.006 180)",
    "--foreground": "oklch(0.235 0.025 166)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.235 0.025 166)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.235 0.025 166)",
    "--primary": "oklch(0.72 0.13 173)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.91 0.017 168)",
    "--secondary-foreground": "oklch(0.39 0.028 166)",
    "--muted": "oklch(0.945 0.008 180)",
    "--muted-foreground": "oklch(0.50 0.032 166)",
    "--accent": "oklch(0.91 0.045 172)",
    "--accent-foreground": "oklch(0.29 0.04 166)",
    "--destructive": "oklch(0.60 0.22 27)",
    "--destructive-foreground": "oklch(0.98 0 0)",
    "--border": "oklch(0.84 0.025 168)",
    "--input": "oklch(0.92 0.012 168)",
    "--ring": "oklch(0.72 0.13 173)",
    "--chart-1": "oklch(0.72 0.13 173)",
    "--chart-2": "oklch(0.60 0.10 195)",
    "--chart-3": "oklch(0.66 0.10 135)",
    "--chart-4": "oklch(0.70 0.11 82)",
    "--chart-5": "oklch(0.55 0.08 230)",
    "--sidebar": "oklch(0.955 0.008 180)",
    "--sidebar-foreground": "oklch(0.235 0.025 166)",
    "--sidebar-primary": "oklch(0.72 0.13 173)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.91 0.045 172)",
    "--sidebar-accent-foreground": "oklch(0.29 0.04 166)",
    "--sidebar-border": "oklch(0.84 0.025 168)",
    "--sidebar-ring": "oklch(0.72 0.13 173)",
    "--ws-grid-color": "oklch(0.84 0.025 168 / 0.58)",
    "--ws-canvas": "oklch(0.965 0.008 180)",
    "--ws-accent-glow": "oklch(0.72 0.13 173 / 0.16)",
    "--ws-focused-overlay": "oklch(0.235 0.025 166 / 0.38)",
  },
  dark: {
    "--background": "oklch(0.17 0.018 174)",
    "--foreground": "oklch(0.91 0.012 178)",
    "--card": "oklch(0.205 0.018 174)",
    "--card-foreground": "oklch(0.91 0.012 178)",
    "--popover": "oklch(0.19 0.018 174)",
    "--popover-foreground": "oklch(0.91 0.012 178)",
    "--primary": "oklch(0.80 0.12 173)",
    "--primary-foreground": "oklch(0.16 0.02 174)",
    "--secondary": "oklch(0.29 0.02 166)",
    "--secondary-foreground": "oklch(0.88 0.012 178)",
    "--muted": "oklch(0.25 0.014 174)",
    "--muted-foreground": "oklch(0.66 0.022 170)",
    "--accent": "oklch(0.30 0.04 172)",
    "--accent-foreground": "oklch(0.88 0.06 172)",
    "--destructive": "oklch(0.64 0.22 27)",
    "--destructive-foreground": "oklch(0.98 0 0)",
    "--border": "oklch(0.36 0.028 166)",
    "--input": "oklch(0.29 0.022 166)",
    "--ring": "oklch(0.80 0.12 173)",
    "--chart-1": "oklch(0.80 0.12 173)",
    "--chart-2": "oklch(0.70 0.10 195)",
    "--chart-3": "oklch(0.74 0.10 135)",
    "--chart-4": "oklch(0.78 0.12 82)",
    "--chart-5": "oklch(0.68 0.09 230)",
    "--sidebar": "oklch(0.145 0.018 174)",
    "--sidebar-foreground": "oklch(0.91 0.012 178)",
    "--sidebar-primary": "oklch(0.80 0.12 173)",
    "--sidebar-primary-foreground": "oklch(0.16 0.02 174)",
    "--sidebar-accent": "oklch(0.30 0.04 172)",
    "--sidebar-accent-foreground": "oklch(0.88 0.06 172)",
    "--sidebar-border": "oklch(0.32 0.026 166)",
    "--sidebar-ring": "oklch(0.80 0.12 173)",
    "--ws-grid-color": "oklch(0.36 0.03 166 / 0.62)",
    "--ws-canvas": "oklch(0.16 0.018 174)",
    "--ws-accent-glow": "oklch(0.80 0.12 173 / 0.20)",
    "--ws-focused-overlay": "oklch(0.05 0.01 174 / 0.72)",
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>

/** 这些槽的行号，`spec.test.ts` 用它把值反向核回预设原文。 */
export const WULING_PRESET_COLOR_LINES = {
  light: { "--background": 20, "--foreground": 21, "--card": 22, "--card-foreground": 23, "--popover": 24, "--popover-foreground": 25, "--primary": 26, "--primary-foreground": 27, "--secondary": 28, "--secondary-foreground": 29, "--muted": 30, "--muted-foreground": 31, "--accent": 32, "--accent-foreground": 33, "--destructive": 34, "--destructive-foreground": 35, "--border": 36, "--input": 37, "--ring": 38, "--chart-1": 40, "--chart-2": 41, "--chart-3": 42, "--chart-4": 43, "--chart-5": 44, "--sidebar": 46, "--sidebar-foreground": 47, "--sidebar-primary": 48, "--sidebar-primary-foreground": 49, "--sidebar-accent": 50, "--sidebar-accent-foreground": 51, "--sidebar-border": 52, "--sidebar-ring": 53, "--ws-grid-color": 65, "--ws-canvas": 66, "--ws-accent-glow": 67, "--ws-focused-overlay": 68 },
  dark: { "--background": 82, "--foreground": 83, "--card": 84, "--card-foreground": 85, "--popover": 86, "--popover-foreground": 87, "--primary": 88, "--primary-foreground": 89, "--secondary": 90, "--secondary-foreground": 91, "--muted": 92, "--muted-foreground": 93, "--accent": 94, "--accent-foreground": 95, "--destructive": 96, "--destructive-foreground": 97, "--border": 98, "--input": 99, "--ring": 100, "--chart-1": 102, "--chart-2": 103, "--chart-3": 104, "--chart-4": 105, "--chart-5": 106, "--sidebar": 108, "--sidebar-foreground": 109, "--sidebar-primary": 110, "--sidebar-primary-foreground": 111, "--sidebar-accent": 112, "--sidebar-accent-foreground": 113, "--sidebar-border": 114, "--sidebar-ring": 115, "--ws-grid-color": 127, "--ws-canvas": 128, "--ws-accent-glow": 129, "--ws-focused-overlay": 130 },
} as const

/** 配方写进 `:root` 的诊断属性；与 md3/风格派一样，界面与浏览器测试都靠它们回读。 */
export const WULING_CORNER_ATTR = "data-wuling-corner" as const
export const WULING_LABEL_ATTR = "data-wuling-labels" as const
export const WULING_SEED_ATTR = "data-wuling-seed" as const
export const WULING_SEED_SOURCE_ATTR = "data-wuling-seed-source" as const
/** 取色解不出来时如实记 true；UI 与浏览器测试读它判「画面上这个颜色到底是谁定的」。 */
export const WULING_SEED_FALLBACK_ATTR = "data-wuling-seed-fallback" as const
export const WULING_TOKEN_COUNT_ATTR = "data-wuling-tokens" as const

export const WULING_TOKEN_NAMES: readonly string[] = WULING_TOKENS.map((token) => token.cssVar)
