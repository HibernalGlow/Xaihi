/**
 * 高级主题（设计语言 / design language）的共享契约。
 *
 * 这个维度与「颜色主题」平级，不是它的子集：
 *  - 颜色主题（`AppTheme` + 自定义主题）决定一套 CSS 变量的取值；
 *  - 高级主题决定**整套设计语言**——颜色角色、形状、层级、排版、动效、状态层、
 *    以及组件几何（height/padding/stroke 这类 metric）。
 *
 * 事实源分两块，都不允许凭记忆填数：
 *  - 非颜色 token 来自 Google 自己生成的机器可读表
 *    `@material/web/tokens/versions/v0_192/*.scss`（头部标注 "Design system display name:
 *    Google Material 3 / Design system version: v0.192 / Platform: Web"，Apache-2.0），
 *    由 `scripts/gen-md3-tokens.ts` 解析成 `md3/tokens.generated.ts`；
 *  - 动态颜色角色来自 `@material/material-color-utilities` 的 `DynamicScheme`。
 *
 * 组件侧一律不 import 本模块的业务实现以外的东西：组件只吃 CSS 变量与 data 属性，
 * 这样节点 GUI 与统一 GUI 都自动继承，也不会把壳层耦合带进 `audit:node-ui-independence`。
 */

/**
 * 明暗方案。与 `src/types/workspace.ts` 的 `AppThemeScheme` 是同一个二值词表，
 * 这里重复声明是为了让本模块不反向依赖工作区状态类型（引擎契约不认状态文件）。
 * 实际取值由同一个 `resolveThemeScheme(mode, systemDark)` 产出。
 */
export type DesignThemeScheme = "light" | "dark"

/** 已注册的高级主题 id。`native` 是显式的 no-op（现状），保证「不开高级主题」有代码事实。 */
export type AppDesignThemeId = "native" | "md3" | "mondrian" | "wuling" | "swiss" | "lonestar"

/**
 * 可单独关闭的维度。默认全开（用户 2026-10-05 拍板：MD3 默认接管颜色）。
 * 维度开关是逃生阀，不是装饰：每个维度都对应 `[data-design-<dim>="off"]`
 * 与一组变量，关掉即回落到颜色主题/既有样式。
 */
export const DESIGN_DIMENSIONS = [
  "color",
  "shape",
  "elevation",
  "typography",
  "motion",
  "states",
  "geometry",
] as const

export type DesignDimension = (typeof DESIGN_DIMENSIONS)[number]

export type DesignDimensionSwitches = Record<DesignDimension, boolean>

/** Material 3 scheme variant；与 MCU `Variant` 枚举一一对应（0.4.0 实测 9 个）。 */
export type Md3SchemeVariant =
  | "monochrome"
  | "neutral"
  | "tonalSpot"
  | "vibrant"
  | "expressive"
  | "fidelity"
  | "content"
  | "rainbow"
  | "fruitSalad"

/** MCU `DynamicScheme.contrastLevel` 实测支持 -1…1；这四个是规范里的典型档位。 */
export type Md3ContrastLevel = -1 | 0 | 0.5 | 1

/**
 * seed 来源。`image`（壁纸/图片取色）尚未接线，所以**不进类型**——
 * 类型里出现一个没人实现的枚举值，就是下一个假绿。
 */
export type Md3SeedSource = "manual" | "activeTheme" | "systemAccent"

export interface Md3Options {
  /** `#rrggbb`。seedSource=manual 时用户指定；其余来源解不出来时回落到这里。 */
  seed: string
  seedSource: Md3SeedSource
  variant: Md3SchemeVariant
  contrastLevel: Md3ContrastLevel
  /**
   * M3 形状缩放（0.5…2，步进 0.25）。缩放只作用在 corner-* token 上，
   * `corner-none` 与 `corner-full` 按规范不参与缩放。
   */
  shapeScale: number
  /** 关掉只保留 surface tint 层级（M3 暗色主题本来就是 tint 为主、阴影为辅）。 */
  elevationShadows: boolean
}

/** 风格派的可选项：主用原色面与结构线宽度。两个都真的接进 CSS，不留空开关。 */
export type MondrianAccentPlane = "red" | "blue" | "yellow"
export type MondrianLineWeight = 1 | 2 | 3

export const MONDRIAN_ACCENTS: readonly MondrianAccentPlane[] = ["red", "blue", "yellow"]
export const MONDRIAN_LINE_WEIGHT_VALUES: readonly MondrianLineWeight[] = [1, 2, 3]

export interface MondrianOptions {
  /** 哪个原色当「动作面」（按钮实底、选中面、焦点强调）。 */
  accent: MondrianAccentPlane
  /** 结构线宽度档位，落到 `--stijl-line-width`；⚠️ 宽度本身是 UI 转译，见 mondrian/palette.ts。 */
  lineWeight: MondrianLineWeight
}

export interface DesignThemeConfig {
  id: AppDesignThemeId
  dimensions: DesignDimensionSwitches
  md3: Md3Options
  mondrian: MondrianOptions
  wuling: WulingOptions
  swiss: SwissOptions
  lonestar: LoneStarOptions
}

/**
 * 武陵（jade industrial）配方可选项。
 *
 * 这一条的存在就是「主题预设并入设计语言」的后半：武陵不再只是一个配色预设，
 * 它可以按七个维度接管整套设计语言，并且**自带取色**——
 * `seedSource: "manual"` 时用户直接指定主色，不必再回去选一个配色预设（用户 2026-10-06 口径：
 * 「超级主题本身也可以有取色功能，自己指定颜色，这样就不用走颜色预设」）。
 */
export type WulingSeedSource = "manual" | "activeTheme"

export const WULING_CORNER_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5]
export const WULING_SEED_SOURCES: readonly WulingSeedSource[] = ["manual", "activeTheme"]

export interface WulingOptions {
  /** `#rrggbb`。`seedSource=manual` 时是用户指定的主色。 */
  seed: string
  seedSource: WulingSeedSource
  /** 角半径档位缩放，乘在预设实测的 2/4/8/8px 阶梯上（`spec.ts` 带行号）。 */
  cornerScale: number
  /**
   * 账本式小标签（等宽 + 大写 + 字距）。关掉发 `text-transform: none`，
   * 不是「不发」——不发会让那条声明落到初始值，回读就看不出这一维在不在做事。
   */
  ledgerLabels: boolean
}

/**
 * Swiss（国际主义排版）配方可选项。
 *
 * 两条都是「有出处、且真的接进 CSS」的开关，不留第三种按下去什么都不变的控件：
 *  - `ruleWeight` 的三个档各有各的成文出处（1px = SBB 发丝分隔线；2px / 4px = 组合参考点名的
 *    `border-2` / `border-4`），所以它是「选哪条成文规则」而不是「随便乘个数」；
 *  - `uppercaseLabels` 管的是大写标签装置那一件器件，关掉发 `text-transform: none`。
 * ⚠️ 没有 seed：Swiss 只有那一个红，而它是功能信号色（SBB 的 brand/product 都等于 `red`）。
 */
export type SwissRuleWeight = 1 | 2 | 4

export const SWISS_RULE_WEIGHT_VALUES: readonly SwissRuleWeight[] = [1, 2, 4]

export interface SwissOptions {
  /** 静默结构线的宽度档；角半径永远是 0，这条配方不许缩放它。 */
  ruleWeight: SwissRuleWeight
  uppercaseLabels: boolean
}

/**
 * 孤星（Cassette Futurism）配方可选项。
 *
 * 与武陵一样可以自带取色（用户 2026-10-06 的口径），但**默认是 manual 而不是 activeTheme**：
 * 武陵那份的默认值本来就是它自己预设的主色，而孤星的主色是那条「高亮度橙只留给机械交互」
 * 的属性本身 —— 跟随当前配色主题会立刻把它变成另一个色相，等于把配方身份交给配色预设。
 * 这条差别是刻意的，写在 §13.5。
 */
export type LoneStarSeedSource = "manual" | "activeTheme"

export const LONESTAR_SEED_SOURCES: readonly LoneStarSeedSource[] = ["manual", "activeTheme"]

export interface LoneStarOptions {
  /** `#rrggbb`。`seedSource=manual` 时是用户指定的动作面色。 */
  seed: string
  seedSource: LoneStarSeedSource
  /** 数字与标签走等宽 + tabular-nums；关掉发 `inherit` / `normal` 而不是不发。 */
  monoFigures: boolean
  uppercaseLabels: boolean
}

/** 写进 `:root` 的一等属性名；CSS 层与测试都读这几个，不许各处拼字面量。 */
export const DESIGN_ROOT_ATTR = "data-app-design" as const
export const DESIGN_DIM_ATTR_PREFIX = "data-design-" as const
export const DESIGN_VARIANT_ATTR = "data-md3-variant" as const
export const DESIGN_SEED_ATTR = "data-md3-seed" as const
export const DESIGN_CONTRAST_ATTR = "data-md3-contrast" as const
/** 取色诊断：实际用了哪个来源、是否发生回落。UI 与浏览器测试都靠它回读。 */
export const DESIGN_SEED_SOURCE_ATTR = "data-md3-seed-source" as const
export const DESIGN_SEED_FALLBACK_ATTR = "data-md3-seed-fallback" as const
/** 已应用变量条数 + 修订号；「代码跑过」与「画面上换了」的差别就记在这两个属性上。 */
export const DESIGN_APPLIED_ATTR = "data-design-applied-vars" as const
export const DESIGN_REV_ATTR = "data-design-rev" as const

/**
 * 变量命名空间。沿用 Google token 名，让「这个值来自规范哪一条」可全文搜索。
 * `bridge` 是 shadcn 语义变量（`--background`/`--primary`…）——组件不认 M3 名字。
 */
export const MD3_VAR = {
  color: "--md-sys-color-",
  shape: "--md-sys-shape-",
  elevation: "--md-sys-elevation-",
  typescale: "--md-sys-typescale-",
  motion: "--md-sys-motion-",
  state: "--md-sys-state-",
  refTypeface: "--md-ref-typeface-",
  refPalette: "--md-ref-palette-",
  component: "--md-comp-",
} as const

/**
 * CSS 层自己的私有别名前缀（状态层色这类中间量）。
 * 它不属于引擎词表：门禁要求凡是被引用的 `--md3-*` 必须在设计层内部自己定义过，
 * 而 `--md-sys-*`/`--md-comp-*`/`--md-ref-*` 一律只能由引擎发——否则「在 CSS 里自己声明一遍」
 * 就成了绕过覆盖检查的假绿通道。
 */
export const DESIGN_LOCAL_ALIAS_PREFIX = "--md3-"

/**
 * 颜色维度必须覆盖的 shadcn/工作区变量。
 * 这份名单就是「接管颜色」的全部含义：少一条，那条就还在用上一个主题的残留。
 * 名单来源：`src/styles/themes/tori.css` 里一个主题实际 emit 的完整集合。
 */
export const BRIDGED_COLOR_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--ws-grid-color",
  "--ws-canvas",
  "--ws-accent-glow",
  "--ws-focused-overlay",
] as const

export type BridgedColorVar = (typeof BRIDGED_COLOR_VARS)[number]

/** 一个高级主题解析出来的东西：变量 + 根属性。apply 只认这个形状。 */
export interface DesignTokenBundle {
  vars: Record<string, string>
  attributes: Record<string, string>
}

/** apply 需要的外部输入——由挂载组件从 store/DOM 解析后注入，引擎自己不去读 store。 */
export interface DesignThemeContext {
  scheme: DesignThemeScheme
  /** 颜色维度接管时要盖过谁：自定义主题的 cssVars 也是写 inline 的。 */
  activeThemeSeed: string | null
  /** 供取色来源诊断与 UI 披露：系统强调色在本平台读得到吗。 */
  systemAccentAvailable: boolean
  /**
   * **当前配色主题自己声明了哪些槽**（键写成 `--primary` 这种 CSS 变量名，值是原样字符串）。
   *
   * 只包含「选中的那个配色主题」的声明（自定义主题的 `cssVars`），**不是** `:root` 的计算值——
   * 计算值里永远有 `src/index.css` 的基线与预设的类规则，拿它判「主题有没有声明」会让
   * 逐槽合并退化成「36/36 全从主题来」，也就是高级主题的颜色维度彻底不做事。
   * 没选自定义主题时传 null（此时颜色全部由 seed 派生，而 seed 默认就是取当前主题的主色）。
   */
  themeColorVars?: Record<string, string> | null
}

export interface DesignThemeResolution {
  bundle: DesignTokenBundle
  /**
   * 取色诊断。这三条是**配方专属**的：风格派没有 seed 概念（色板是量出来的固定值），
   * 所以字段可空——`apply.ts` 只在 md3 分支把它们写进 DOM，
   * 别的配方不能为了填满类型而编一个「看起来像 seed」的值出来。
   */
  seed: string | null
  seedSource: string | null
  seedFallback: boolean | null
}

export const ALL_DIMENSIONS_ON: DesignDimensionSwitches = {
  color: true,
  shape: true,
  elevation: true,
  typography: true,
  motion: true,
  states: true,
  geometry: true,
}

/** M3 基线 seed（Google 生成字典里 `md-ref-palette` 的 primary40 = #6750a4）；只作初始值，不是硬编码主题色。 */
export const MD3_BASELINE_SEED = "#6750a4"

export const DEFAULT_DESIGN_THEME: DesignThemeConfig = {
  id: "native",
  dimensions: { ...ALL_DIMENSIONS_ON },
  md3: {
    seed: MD3_BASELINE_SEED,
    // 默认按配色主题取色：用户 2026-10-05 的口径是「有些本身是取色的就按取色的来」，
    // 而 `manual` 会让派生出来的补集与主题自己的主色脱节（同一套里两种色相）。
    // 手改过 seedSource 的配置照旧生效——这里只是没存过时的落点。
    seedSource: "activeTheme",
    variant: "tonalSpot",
    contrastLevel: 0,
    shapeScale: 1,
    elevationShadows: true,
  },
  mondrian: {
    // 红是那幅 1930《Composition II》里占 61% 面积的主动作面，所以默认红。
    accent: "red",
    lineWeight: 2,
  },
  wuling: {
    // 默认就是预设自己的主色：`src/styles/themes/wuling.css:26` 的 oklch(0.72 0.13 173)
    // 按标准 oklch→sRGB 变换（D65、无裁切）得到 #28bf9d。
    // 也就是说「什么都不调」时武陵配方长得和现在的预设一模一样——这是用户口径里
    // 「保留现有的预设的风格」的可执行形式。
    seed: "#28bf9d",
    // 默认跟随当前配色主题取色，和 MD3 同一条理由：派生补集不该与用户已选主题两种色相。
    seedSource: "activeTheme",
    cornerScale: 1,
    ledgerLabels: true,
  },
  swiss: {
    // 默认 2px：组合参考同时给了 border-2 与 border-4，而本仓控件最小 30px 高——
    // 4px 框在 30px 的按钮上吃掉 27% 的高度（量的，不是感觉的），所以默认取轻的那档。
    ruleWeight: 2,
    uppercaseLabels: true,
  },
  lonestar: {
    // 默认就是那份校准里的橙本身：什么都不调时，画面应当等于 §13.4 那张表，
    // 而不是等于「M3 从某个 tone 档算出来的近似橙」。
    // 小写：normalize 会把任何来源的 hex 统一成小写，默认值若写成大写就过不了
    // 「归一化幂等」那条测试（第一次归一化就会把默认值改掉）。
    seed: "#f6540e",
    // 见上面 LoneStarOptions 的注释：这一条不跟随配色主题，是配方身份的一部分。
    seedSource: "manual",
    monoFigures: true,
    uppercaseLabels: true,
  },
}

export const MD3_SCHEME_VARIANTS: readonly Md3SchemeVariant[] = [
  "tonalSpot",
  "neutral",
  "vibrant",
  "expressive",
  "fidelity",
  "content",
  "monochrome",
  "rainbow",
  "fruitSalad",
]

export const MD3_CONTRAST_LEVELS: readonly Md3ContrastLevel[] = [-1, 0, 0.5, 1]

export const MD3_SHAPE_SCALE_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isDesignDimension(value: unknown): value is DesignDimension {
  return typeof value === "string" && (DESIGN_DIMENSIONS as readonly string[]).includes(value)
}

/**
 * 把任意来源的字符串清洗成可持久化配置。
 * 这是持久化边界（host TOML / localStorage）唯一的入口，
 * 语义与 `AppConfigSync` 里其它白名单清洗保持一致：解不出来就回默认，绝不部分采纳。
 */
export function normalizeDesignThemeConfig(value: unknown): DesignThemeConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_DESIGN_THEME }
  const record = value as Record<string, unknown>
  const id: AppDesignThemeId =
    record.id === "md3" || record.id === "mondrian" || record.id === "wuling"
      || record.id === "swiss" || record.id === "lonestar" || record.id === "native"
      ? record.id
      : "native"

  const dimensions = { ...ALL_DIMENSIONS_ON }
  if (record.dimensions && typeof record.dimensions === "object") {
    const dimRecord = record.dimensions as Record<string, unknown>
    for (const dimension of DESIGN_DIMENSIONS) {
      if (typeof dimRecord[dimension] === "boolean") dimensions[dimension] = dimRecord[dimension] === true
    }
  }

  const mdRecord = record.md3 && typeof record.md3 === "object" ? (record.md3 as Record<string, unknown>) : {}
  const mondRecord = record.mondrian && typeof record.mondrian === "object" ? (record.mondrian as Record<string, unknown>) : {}
  const wulRecord = record.wuling && typeof record.wuling === "object" ? (record.wuling as Record<string, unknown>) : {}
  const swiRecord = record.swiss && typeof record.swiss === "object" ? (record.swiss as Record<string, unknown>) : {}
  const lsRecord = record.lonestar && typeof record.lonestar === "object" ? (record.lonestar as Record<string, unknown>) : {}
  const rawVariant = mdRecord.variant
  const variant = MD3_SCHEME_VARIANTS.includes(rawVariant as Md3SchemeVariant)
    ? (rawVariant as Md3SchemeVariant)
    : DEFAULT_DESIGN_THEME.md3.variant
  // 数值档位一律「吸附到最近的合法档」，与 shapeScale 同一条规则：
  // 手改过的 TOML 或以后步进表变化时，落点应当离用户原本想要的值最近，
  // 而不是静默跳回出厂档（字符串枚举 variant 没有「最近」可言，所以仍回默认）。
  const rawContrast = mdRecord.contrastLevel
  const contrastLevel = typeof rawContrast === "number"
    ? MD3_CONTRAST_LEVELS.reduce((best, level) => Math.abs(level - rawContrast) < Math.abs(best - rawContrast) ? level : best, MD3_CONTRAST_LEVELS[0] as number) as Md3ContrastLevel
    : DEFAULT_DESIGN_THEME.md3.contrastLevel
  const rawScale = typeof mdRecord.shapeScale === "number" ? mdRecord.shapeScale : DEFAULT_DESIGN_THEME.md3.shapeScale
  const shapeScale = MD3_SHAPE_SCALE_STEPS.reduce((best, step) =>
    Math.abs(step - rawScale) < Math.abs(best - rawScale) ? step : best,
  MD3_SHAPE_SCALE_STEPS[0])
  const seedSource: Md3SeedSource =
    mdRecord.seedSource === "activeTheme" || mdRecord.seedSource === "systemAccent" || mdRecord.seedSource === "manual"
      ? mdRecord.seedSource
      : "manual"

  return {
    id,
    dimensions,
    md3: {
      seed: isHexColor(mdRecord.seed) ? (mdRecord.seed as string).toLowerCase() : DEFAULT_DESIGN_THEME.md3.seed,
      seedSource,
      variant,
      contrastLevel,
      shapeScale,
      elevationShadows: mdRecord.elevationShadows !== false,
    },
    mondrian: {
      accent: MONDRIAN_ACCENTS.includes(mondRecord.accent as MondrianAccentPlane)
        ? (mondRecord.accent as MondrianAccentPlane)
        : DEFAULT_DESIGN_THEME.mondrian.accent,
      // 线宽只认三档，不接受「任何数字」：一个野数字会让 CSS 里的 1px/2px/3px 断言全部失去意义。
      lineWeight: MONDRIAN_LINE_WEIGHT_VALUES.includes(mondRecord.lineWeight as MondrianLineWeight)
        ? (mondRecord.lineWeight as MondrianLineWeight)
        : DEFAULT_DESIGN_THEME.mondrian.lineWeight,
    },
    wuling: {
      seed: isHexColor(wulRecord.seed) ? (wulRecord.seed as string).toLowerCase() : DEFAULT_DESIGN_THEME.wuling.seed,
      seedSource: wulRecord.seedSource === "manual" || wulRecord.seedSource === "activeTheme"
        ? (wulRecord.seedSource as WulingSeedSource)
        : DEFAULT_DESIGN_THEME.wuling.seedSource,
      // 与 md3 的 shapeScale 同一条规则：吸附到最近的合法档，而不是静默跳回出厂档。
      cornerScale: typeof wulRecord.cornerScale === "number"
        ? WULING_CORNER_STEPS.reduce((best, step) =>
            Math.abs(step - (wulRecord.cornerScale as number)) < Math.abs(best - (wulRecord.cornerScale as number)) ? step : best,
            WULING_CORNER_STEPS[0])
        : DEFAULT_DESIGN_THEME.wuling.cornerScale,
      ledgerLabels: wulRecord.ledgerLabels !== false,
    },
    swiss: {
      // 与 mondrian.lineWeight 同一条规则：只认有三个成文出处的三档，野数字让 CSS 的 1/2/4px 断言失效。
      ruleWeight: SWISS_RULE_WEIGHT_VALUES.includes(swiRecord.ruleWeight as SwissRuleWeight)
        ? (swiRecord.ruleWeight as SwissRuleWeight)
        : DEFAULT_DESIGN_THEME.swiss.ruleWeight,
      uppercaseLabels: swiRecord.uppercaseLabels !== false,
    },
    lonestar: {
      seed: isHexColor(lsRecord.seed) ? (lsRecord.seed as string).toLowerCase() : DEFAULT_DESIGN_THEME.lonestar.seed,
      seedSource: lsRecord.seedSource === "activeTheme"
        ? "activeTheme"
        : DEFAULT_DESIGN_THEME.lonestar.seedSource,
      monoFigures: lsRecord.monoFigures !== false,
      uppercaseLabels: lsRecord.uppercaseLabels !== false,
    },
  }
}
