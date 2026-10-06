/**
 * MD3 角色 + Google 生成字典 -> CSS 变量。
 *
 * 两类活，边界很清楚：
 *  1. **桥接**（`BRIDGED_COLOR_VARS`）：组件只认 shadcn 的语义名，不认 M3 角色名。
 *     映射表在这里，不在组件里，也不在 CSS 层里 —— 一份映射，两边可读。
 *  2. **非颜色命名空间**：形状/层级/排版/动效/状态层/字族/逐组件 metric，
 *     全部来自注入的 token 字典（`tokens.generated.ts` 的产物，由 `resolve.ts` 传进来）。
 *     本模块不 import 生成物，所以它的单测不需要那个文件存在。
 *
 * 两条不许退的规矩：
 * - `ref:<group>:<token>` 一律编译成 `var(--md-<group>-<token>)`，**不摊平成字面量**。
 *   摊平就等于把动态色冻成静态色，维度开关（shape/typography…）也会当场失效。
 * - 维度关掉时整组变量不 emit（不写空值、不写近似值）。CSS 层不许给 fallback，
 *   变量缺失必须表现为「看得见地坏掉」，见 `docs/advanced-design-theme-md3.md` §4。
 */

import type { DynamicScheme } from "@material/material-color-utilities"

import {
  BRIDGED_COLOR_VARS,
  MD3_VAR,
  type BridgedColorVar,
  type DesignDimensionSwitches,
  type Md3Options,
} from "../contract"
import { MD3_COLOR_ROLES, kebabRoleName, paletteToneHex, roleVarName, type Md3PaletteName } from "./color"
import { md3SpaceVars } from "./space"

/**
 * Tier-1 组件几何层真正引用的 28 个组件集（84 集 / 3160 条里的一小撮）。
 *
 * 名单不是拍脑袋来的：由 `src/styles/design/*.css` 的 `var(--md-comp-*)` 引用反查
 * 生成字典得到（110 条引用，逐条按 (集, token) 验过 0 条不存在）。
 * 双向核对在 `bun run audit:design-theme-tokens`：CSS 用到而这里没列＝红，
 * 这里列了而 CSS 没人读＝同样红。所以加组件时不必预判，漏了尺会叫。
 */
export const MD3_EMITTED_COMPONENT_SETS: readonly string[] = [
  "badge",
  "banner",
  "checkbox",
  "data-table",
  "dialog",
  "divider",
  "elevated-card",
  "filled-button",
  "filled-tonal-button",
  "icon-button",
  "input-chip",
  "linear-progress-indicator",
  "list",
  "menu",
  "navigation-bar",
  "navigation-drawer",
  "outlined-button",
  "outlined-card",
  "outlined-segmented-button",
  "outlined-select",
  "outlined-text-field",
  "plain-tooltip",
  "primary-navigation-tab",
  "radio-button",
  "scrim",
  "secondary-navigation-tab",
  "sheet-side",
  "switch",
  "text-button",
]

// ---------------------------------------------------------------------------------------------
// 1. 颜色：角色 -> 桥接变量
// ---------------------------------------------------------------------------------------------

/**
 * 桥接表：shadcn 语义名 -> M3 角色（camel，`roleVarName()` 转成 CSS 名）。
 *
 * `--secondary` / `--accent` 取的是 `secondaryContainer`：shadcn 的 secondary 按钮
 * 对应的是 M3 的 **tonal**（filled-tonal）按钮，而 tonal 按钮的容器色在字典里就是
 * `md-sys-color:secondary-container`（实测 `@material/web` 的 `filled-tonal-button`
 * `container-color` 即此）。取 `secondary` 反而会拿到一个 40 tone 的中饱和色。
 */
export const BRIDGE_ROLE_MAP: Partial<Record<BridgedColorVar, (typeof MD3_COLOR_ROLES)[number]>> = {
  "--background": "surface",
  "--foreground": "onBackground",
  "--card": "surfaceContainer",
  "--card-foreground": "onSurface",
  "--popover": "surfaceContainerHigh",
  "--popover-foreground": "onSurface",
  "--primary": "primary",
  "--primary-foreground": "onPrimary",
  "--secondary": "secondaryContainer",
  "--secondary-foreground": "onSecondaryContainer",
  "--muted": "surfaceContainerHighest",
  "--muted-foreground": "onSurfaceVariant",
  "--accent": "secondaryContainer",
  "--accent-foreground": "onSecondaryContainer",
  "--destructive": "error",
  "--destructive-foreground": "onError",
  "--border": "outlineVariant",
  "--input": "outline",
  "--ring": "primary",
  "--sidebar": "surfaceContainerLow",
  "--sidebar-foreground": "onSurface",
  "--sidebar-primary": "primary",
  "--sidebar-primary-foreground": "onPrimary",
  "--sidebar-accent": "secondaryContainer",
  "--sidebar-accent-foreground": "onSecondaryContainer",
  "--sidebar-border": "outlineVariant",
  "--sidebar-ring": "primary",
}

/**
 * 反查表（角色 -> 桥接变量），供 `dimensions.color = false` 用。
 * 多对一时取「语义最近」的那条：`onSurface` 取 `--card-foreground`（面板文字），
 * `surfaceContainerLow` 只有 `--sidebar` 一个落点。
 */
export const REVERSE_BRIDGE_MAP: Readonly<Record<string, BridgedColorVar>> = (() => {
  const preferred: Partial<Record<BridgedColorVar, true>> = {
    "--background": true, "--foreground": true, "--card": true, "--card-foreground": true,
    "--popover": true, "--primary": true, "--primary-foreground": true, "--secondary": true,
    "--secondary-foreground": true, "--muted": true, "--muted-foreground": true,
    "--destructive": true, "--destructive-foreground": true, "--border": true, "--input": true,
    "--sidebar": true,
  }
  const out: Record<string, BridgedColorVar> = {}
  for (const [bridged, role] of Object.entries(BRIDGE_ROLE_MAP) as Array<[BridgedColorVar, string]>) {
    // 先到先得，但带 preferred 标记的那条会覆盖前面的一般条目。
    if (out[role] === undefined || preferred[bridged as BridgedColorVar]) out[role] = bridged
  }
  return out
})()

/**
 * 工作区四色 + 图表五色：这**两组是我们的约定，不是 Google 的规范表**。
 * 规范里没有 `--ws-*`，也没有 `--chart-*`；不要将来拿 M3 文档给这些取值背书。
 * alpha 用 `color-mix()` 保住对角色变量的引用，角色变了它们跟着变。
 * 比例参照 `src/styles/themes/tori.css` 里一个真实主题的量级（grid .22 / glow .14 / overlay .38）。
 */
export const WS_DERIVATIONS: Readonly<Record<string, string>> = {
  // canvas 不用 transparent 混：它是画布底色，要的是一个比 surface 略压暗的实色。
  "--ws-canvas": `color-mix(in oklab, var(${MD3_VAR.color}surface) 97%, var(${MD3_VAR.color}surface-container-high))`,
  "--ws-grid-color": `color-mix(in oklab, var(${MD3_VAR.color}primary) 22%, transparent)`,
  "--ws-accent-glow": `color-mix(in oklab, var(${MD3_VAR.color}primary) 14%, transparent)`,
  "--ws-focused-overlay": `color-mix(in oklab, var(${MD3_VAR.color}on-surface) 38%, transparent)`,
}

/** 图表配色：五个调色板，light 取 tone 40、dark 取 tone 80（同一套调色板的镜像亮度）。 */
export const CHART_PALETTE_TONES: ReadonlyArray<readonly [string, Md3PaletteName]> = [
  ["--chart-1", "primary"],
  ["--chart-2", "secondary"],
  ["--chart-3", "tertiary"],
  ["--chart-4", "neutral"],
  ["--chart-5", "neutralVariant"],
]

export function buildChartVars(scheme: DynamicScheme, isDark: boolean): Record<string, string> {
  const tone = isDark ? 80 : 40
  const out: Record<string, string> = {}
  for (const [varName, palette] of CHART_PALETTE_TONES) out[varName] = paletteToneHex(scheme, palette, tone)
  return out
}

export interface BridgeVarsResult {
  vars: Record<string, string>
  /** 这一轮里**原样透传自配色主题**的那些变量名；其余是 seed 派生的。 */
  themeProvided: string[]
}

/**
 * 角色表 -> 36 条桥接变量。角色缺失直接抛错：宁可炸，不要少一条变量继续跑。
 *
 * 颜色维度开着时不是「整套盖掉配色主题」，而是**逐槽合并**：配色主题自己声明了值的槽
 * （shadcn 那套语义名 `--primary` / `--card` / `--sidebar-accent` …）原样透传，
 * 主题没声明的槽才用 seed 派生的角色值。这就是用户 2026-10-05 要的
 * 「在使用高级主题的情况下，使用 shadcn 的配色主题就是直接映射」。
 * 透传的是**原样字符串**（`oklch()` / `color-mix()` 不被 hex 量化一次），与
 * `buildColorRolesFromTheme` 同一条规矩。
 *
 * ⚠️ `readThemeColorVar` 必须在高级主题**已经把自己上一轮写的变量撤掉之后**才读，
 * 否则读到的是上一轮自己的输出（两边写的是同一个 `:root` inline 属性）。
 * 那一步在 `apply.ts` 里保证：先撤再解析。
 */
export function buildBridgeVars(
  roleVars: Record<string, string>,
  chartVars: Record<string, string>,
  readThemeColorVar?: (varName: string) => string | null,
): BridgeVarsResult {
  const out: Record<string, string> = {}
  const themeProvided: string[] = []
  for (const varName of BRIDGED_COLOR_VARS) {
    const fromTheme = readThemeColorVar?.(varName) ?? null
    if (fromTheme) {
      out[varName] = fromTheme
      themeProvided.push(varName)
      continue
    }
    if (varName.startsWith("--chart-")) {
      const value = chartVars[varName]
      if (!value) throw new Error(`md3 bridge: chart variable '${varName}' was not derived`)
      out[varName] = value
      continue
    }
    if (varName.startsWith("--ws-")) {
      const value = WS_DERIVATIONS[varName]
      if (!value) throw new Error(`md3 bridge: workspace variable '${varName}' has no derivation`)
      out[varName] = value
      continue
    }
    const role = BRIDGE_ROLE_MAP[varName]
    if (role === undefined) throw new Error(`md3 bridge: '${varName}' has no M3 role mapping`)
    const value = roleVars[roleVarName(role)]
    if (!value) throw new Error(`md3 bridge: role '${roleVarName(role)}' for '${varName}' is missing`)
    out[varName] = value
  }
  // 只有这张表全覆盖时才算「接管颜色」；名单改了而表没改，这里就是报错点。
  const missing = BRIDGED_COLOR_VARS.filter((name) => out[name] === undefined)
  if (missing.length > 0) throw new Error(`md3 bridge: unresolved variables ${missing.join(", ")}`)
  return { vars: out, themeProvided }
}

/**
 * `dimensions.color = false` 时的 `--md-sys-color-*`：
 * 能由当前主题表达的**每一条都从主题读**（原样透传 CSS 字符串，不做 hex 转换，
 * 于是 `oklch()` / `color-mix()` 的保真度不被 1×1 canvas 量化掉一次），
 * 主题词表里没有的角色（`scrim`/`shadow`/`inverse-*`/`*-fixed*`/`*-dim`/`*-palette-key-color`
 * 这些 shadcn 根本没有对应语义的）继续沿用 seed 算出来的那一套。
 * 这一条是对简报的有意补充：只发「主题能表达的」会让 CSS 层读到空变量，
 * 而叠一层不存在的近似色比它更糟。`THEME_UNEXPRESSIBLE_ROLES` 是那个补集，可查可测。
 */
export function buildColorRolesFromTheme(
  readThemeColorVar: (varName: string) => string | null,
  schemeRoleVars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const role of MD3_COLOR_ROLES) {
    const source = REVERSE_BRIDGE_MAP[role]
    const themeValue = source === undefined ? null : readThemeColorVar(source)
    const value = themeValue ?? schemeRoleVars[roleVarName(role)]
    if (value !== undefined) out[roleVarName(role)] = value
  }
  return out
}

/** 主题词表覆盖不到的角色集合（诊断 + 单测断言用）。 */
export const THEME_UNEXPRESSIBLE_ROLES: readonly string[] = MD3_COLOR_ROLES
  .filter((role) => REVERSE_BRIDGE_MAP[role] === undefined)
  .map((role) => kebabRoleName(role))

// ---------------------------------------------------------------------------------------------
// 2. 层级阴影：字典里只有 dp 数字，两层 box-shadow 在 Google 生成的 CSS 里
// ---------------------------------------------------------------------------------------------

/**
 * 抄自 `node_modules/@material/web/labs/gb/styles/elevation/md-elevation-tokens.scss`
 * （v0_192 的 `md-sys-elevation` 字典只有 level0…level5 = 0/1/3/6/8/12 dp，
 * 没有可直接用的阴影串）。这两层结构 + `hsl(from … / 0.3|0.15)` 的写法照原样搬，
 * 只是把引用的 shadow 角色换成我们自己的 `--md-sys-color-shadow`。
 */
export const MD3_ELEVATION_SHADOWS: Readonly<Record<string, string>> = {
  "0": "none",
  "1": shadowLayer("0 1px 2px 0", "0 1px 3px 1px"),
  "2": shadowLayer("0 1px 2px 0", "0 2px 6px 2px"),
  "3": shadowLayer("0 1px 3px 0", "0 4px 8px 3px"),
  "4": shadowLayer("0 2px 3px 0", "0 6px 10px 4px"),
  "5": shadowLayer("0 4px 4px 0", "0 8px 12px 6px"),
}

function shadowLayer(first: string, second: string): string {
  const alpha = (value: string) => `hsl(from var(${MD3_VAR.color}shadow) h s l / ${value})`
  return `${first} ${alpha("0.3")}, ${second} ${alpha("0.15")}`
}

// ---------------------------------------------------------------------------------------------
// 3. token 字典 -> 变量
// ---------------------------------------------------------------------------------------------

const REF_PREFIX = "ref:"
/** `md-sys-motion.path`：上游明确不导出值（`Type "motion_path" is not supported`），生成物里是字符串 "null"。 */
const UNSPECIFIED = "null"

/** 一个值里的每个空格分隔原子都过一次：原子是 `ref:` 就换成 var/数字，其它原样保留。 */
function expandRefs(value: string, typefaceWeights: Record<string, string>): string {
  return value.split(" ").map((atom) => expandRef(atom, typefaceWeights)).join(" ")
}

function expandRef(atom: string, typefaceWeights: Record<string, string>): string {
  if (!atom.startsWith(REF_PREFIX)) return atom
  const first = atom.indexOf(":", REF_PREFIX.length)
  if (first < 0) throw new Error(`md3 tokens: malformed reference ${JSON.stringify(atom)}`)
  const group = atom.slice(REF_PREFIX.length, first)
  const token = atom.slice(first + 1)
  if (!group || !token) throw new Error(`md3 tokens: malformed reference ${JSON.stringify(atom)}`)
  // 偏离说明见 mapSystemTokens：字重按字典里的数字解开，字体族保持 var() 引用。
  if (group === "md-ref-typeface" && token.startsWith("weight-")) {
    const weight = typefaceWeights[token]
    if (weight === undefined) throw new Error(`md3 tokens: ${JSON.stringify(atom)} is not in md-ref-typeface`)
    return weight
  }
  // 分组名本身已经带 `md-` 前缀（`md-sys-color` / `md-ref-typeface`），
  // 所以变量名就是 `--<group>-<token>`；再拼一次 `md-` 会得到 `--md-md-sys-color-*`。
  return `var(--${group}-${token})`
}

/** 形状缩放：`corner-none` / `corner-full` 按规范不参与缩放，其余逐原子乘。 */
export function scaleShapeValue(token: string, value: string, scale: number): string {
  if (scale === 1 || token === "corner-none" || token === "corner-full") return value
  return value.split(" ").map((atom) => scaleLength(atom, scale)).join(" ")
}

const LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem|em)$/
function scaleLength(atom: string, scale: number): string {
  const match = LENGTH.exec(atom)
  if (match === null) return atom
  const scaled = Number((Number(match[1] as string) * scale).toFixed(4))
  return `${scaled}${match[2]}`
}

/** 字典里的 `md-ref-typeface` 字重（400/500/700 由生成物给，不是这里手写的）。 */
function typefaceWeights(sysTokens: Record<string, Record<string, string>>): Record<string, string> {
  return sysTokens["md-ref-typeface"] ?? {}
}

export interface Md3TokenInput {
  sysTokens: Record<string, Record<string, string>>
  componentTokens: Record<string, Record<string, string>>
  options: Md3Options
  dimensions: DesignDimensionSwitches
}

/** `md-sys-color.light|dark` 由 MCU 的动态角色取代（设计文档 §3），字典里那两套静态色不参与 emit。 */
const STATIC_COLOR_SECTIONS = new Set(["md-sys-color", "md-sys-color.light", "md-sys-color.dark"])
/** 字典分组 -> 变量命名空间。间距阶梯不在这张表里：字典没有那个分组，见 ./space。 */
const SECTION_VAR: Readonly<Record<string, string>> = {
  "md-sys-shape": MD3_VAR.shape,
  "md-sys-elevation": MD3_VAR.elevation,
  "md-sys-typescale": MD3_VAR.typescale,
  "md-sys-motion": MD3_VAR.motion,
  "md-sys-state": MD3_VAR.state,
  "md-ref-typeface": MD3_VAR.refTypeface,
}
/**
 * 每个分组归哪个维度管。字典里没有的命名空间一律不在这张表上——
 * 「总是发、由 CSS 层的门决定谁读」的规矩只写在 `--md-comp-*` 与 ./space 两处，
 * 不靠这张表里的 `null` 表达（那样一来一个键的有无就成了第二个开关，读代码的人看不见）。
 */
const SECTION_DIMENSION: Readonly<Record<string, keyof DesignDimensionSwitches>> = {
  "md-sys-shape": "shape",
  "md-sys-elevation": "elevation",
  "md-sys-typescale": "typography",
  "md-sys-motion": "motion",
  "md-sys-state": "states",
  "md-ref-typeface": "typography",
}

/**
 * 非颜色命名空间 + 逐组件 metric。
 *
 * 字族是**有意偏离**规范：规范写 Roboto Flex，本仓不分发该字体，
 * 所以 `--md-ref-typeface-brand` / `-plain` 绑到既有的 `--font-app-sans` / `--font-app-mono`
 * （字号/行高/字重/字距照字典走，一个字都不改）。`ref:md-ref-typeface:weight-*`
 * 则解成字典里的数字而不是 `var()`，因为字重是数值，链式 var 会让 `font` 简写更难读；
 * 数字本身仍来自注入的字典，不在这文件里编。
 */
export function buildMd3TokenVars(input: Md3TokenInput): Record<string, string> {
  const { sysTokens, componentTokens, options, dimensions } = input
  const weights = typefaceWeights(sysTokens)
  const out: Record<string, string> = {}

  for (const [section, tokens] of Object.entries(sysTokens)) {
    // `md-ref-palette--tonal-alpha-*` 这类派生分组同理：静态基线，不参与动态取色。
    if (STATIC_COLOR_SECTIONS.has(section) || section.startsWith("md-ref-palette")) continue
    const prefix = SECTION_VAR[section]
    if (prefix === undefined) continue
    const dimension = SECTION_DIMENSION[section]
    if (dimension != null && dimensions[dimension] === false) continue
    for (const [token, rawValue] of Object.entries(tokens)) {
      if (rawValue === UNSPECIFIED) continue
      const value = expandRefs(rawValue, weights)
      if (prefix === MD3_VAR.shape) {
        out[`${prefix}${token}`] = scaleShapeValue(token, value, options.shapeScale)
        continue
      }
      if (prefix === MD3_VAR.refTypeface && (token === "brand" || token === "plain")) {
        // 偏离：字体族绑到 app 既有变量，其余 ref-typeface 条目（weight-*）照字典。
        out[`${prefix}${token}`] = token === "brand" ? "var(--font-app-sans)" : "var(--font-app-mono)"
        continue
      }
      out[`${prefix}${token}`] = value
    }
  }

  if (dimensions.elevation) {
    for (const [level, recipe] of Object.entries(MD3_ELEVATION_SHADOWS)) {
      out[`${MD3_VAR.elevation}shadow-${level}`] = options.elevationShadows ? recipe : "none"
    }
  }

  // `dimensions.geometry = false` 时**仍然** emit `--md-comp-*`：这些变量只被 CSS 层里
  // `[data-design-geometry="off"]` 之外的规则消费，几何开关本身是那些规则决定的；
  // 在这里省掉它们只会让「关掉几何」变成「组件读到空变量」，而不是回到既有样式。
  //
  // 但**只发 Tier-1 真正在册的那些集**：字典里 84 集 / 3160 条，全发就是往 `:root`
  // 挂三千多个 inline 变量（实测一次 apply 在 happy-dom 下要三十多秒，浏览器里也是白付的
  // 样式重算）。名单与 CSS 层的实际引用由 `bun run audit:design-theme-tokens` 双向核对，
  // 所以这里不需要「以后会不会用到」的预判——漏了那把尺当场红。
  for (const [set, tokens] of Object.entries(componentTokens)) {
    if (!MD3_EMITTED_COMPONENT_SETS.includes(set)) continue
    for (const [token, rawValue] of Object.entries(tokens)) {
      if (rawValue === UNSPECIFIED) continue
      out[`${MD3_VAR.component}${set}-${token}`] = expandRefs(rawValue, weights)
    }
  }

  // 间距阶梯：稳定字典 v0_192 里**没有** md-sys-space 分组（间距是 Expressive 世代
  // 才作为 token 发布的，CSS 形态只存在于同包 labs/gb）。唯一真源是 ./space，
  // 它与 `--md-comp-*` 同规矩：总是发，由 CSS 层的维度门决定谁读——
  // 「关掉某个维度」应当让画面回到既有样式，而不是让规则读到空变量。
  Object.assign(out, md3SpaceVars())

  return out
}

export interface Md3VarsInput extends Md3TokenInput {
  /** 当前 scheme 的整套动态角色（`color.ts` 的 `resolveColorRoles` 产物）。 */
  roleVars: Record<string, string>
  /** 图表取色要的是调色板本体，不是角色表，所以 scheme 也得传进来。 */
  scheme: DynamicScheme
  isDark: boolean
  /** `dimensions.color = false` 时读「当前已应用主题」的桥接变量原样字符串。 */
  readThemeColorVar: (varName: string) => string | null
  /** 选中配色主题自己声明的槽（`--primary` -> 原样字符串）；null = 没有自定义配色主题。 */
  themeColorVars?: Record<string, string> | null
}

/**
 * 顶层组装：颜色层 + 非颜色命名空间，按维度开关决定发哪一组。
 * 返回值就是 `apply.ts` 直接写进 `:root` 的那份 `vars`。
 */
export interface Md3VarsResult {
  vars: Record<string, string>
  /** 颜色维度开着时，逐槽合并里「原样来自配色主题」的那些变量名。 */
  themeProvided: string[]
}

export function buildMd3Vars(input: Md3VarsInput): Md3VarsResult {
  const { dimensions } = input
  const vars: Record<string, string> = {}
  let themeProvided: string[] = []

  if (dimensions.color) {
    Object.assign(vars, input.roleVars)
    // 逐槽合并：配色主题声明了的槽原样透传，没声明的才用 seed 派生的角色值。
    // 逐槽合并的判据是「配色主题自己声明了什么」，不是「:root 上算出来是什么」——
    // 后者永远有值，会把这条合并变成「全部透传」，高级主题的颜色维度就白做了。
    const themeVars = input.themeColorVars ?? null
    const bridge = buildBridgeVars(
      input.roleVars,
      buildChartVars(input.scheme, input.isDark),
      themeVars === null ? undefined : (name) => themeVars[name] ?? null,
    )
    Object.assign(vars, bridge.vars)
    themeProvided = bridge.themeProvided
  } else {
    // 关掉颜色维度：shadcn 那批一条都不发（颜色主题继续赢），
    // `--md-sys-color-*` 则从「当前主题」反查回来，CSS 层才不会因为变量缺失而坏掉。
    Object.assign(vars, buildColorRolesFromTheme(input.readThemeColorVar, input.roleVars))
  }

  Object.assign(vars, buildMd3TokenVars(input))
  return { vars, themeProvided }
}
