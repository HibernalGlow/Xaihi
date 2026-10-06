/**
 * Material 3 动态取色：一个 seed 算出整套 M3 颜色角色。
 *
 * 只有一条来源：`@material/material-color-utilities@0.4.0` 的 `DynamicScheme` +
 * `MaterialDynamicColors`。这里不出现任何硬编码的角色 hex，也不抄文档站的示例值
 * （`docs/advanced-design-theme-md3.md` §2 把「数值一律从生成物读」写成了规矩）。
 *
 * 现行访问形态（逐条读过 `dynamiccolor/material_dynamic_colors.d.ts` 后定的，不是照博客抄的）：
 * - 0.4.0 的 `MaterialDynamicColors` **同时**暴露「静态成员」和「实例方法」两种形态，
 *   而静态那批几乎全部标着 `@deprecated Use xxx() instead`（`onSurfaceVariant`、`outlineVariant`、
 *   `primary` 等等都是静态属性 + 同名方法并存）。本模块一律走实例方法：`scheme.colors.primary()`。
 * - 实例方法的参数表并不齐：`highestSurface(s: DynamicScheme)` 需要 scheme，
 *   其余 59 个是无参方法（`primaryPaletteKeyColor()`…）。所以取值统一写成
 *   「把 scheme 传进去，多余的实参被忽略」，用一处显式 cast 收敛这个不一致，
 *   而不是给 60 个角色各写一行包装。
 * - `primaryDim` / `secondaryDim` / `tertiaryDim` / `errorDim` 的返回类型是
 *   `DynamicColor | undefined`（2025 spec 角色）；实测 0.4.0 在默认 `specVersion = "2021"`
 *   下也能解析出值，但类型上必须容错，解不出就**不 emit 这个变量**，不编一个近似色。
 * - `allColors` / `colorSpec` / `contentAccentToneDelta` 是属性不是访问器，不进角色表。
 *
 * light 与 dark 是同一个 seed 的两次 `DynamicScheme`（`isDark` 不同），不是把 hex 取反。
 */

import {
  argbFromHex,
  DynamicScheme,
  hexFromArgb,
  Hct,
  MaterialDynamicColors,
  Variant,
  type DynamicColor,
  type TonalPalette,
} from "@material/material-color-utilities"

import { MD3_VAR, type Md3ContrastLevel, type Md3SchemeVariant } from "../contract"

/** 我们的 9 个 variant 名 -> MCU `Variant` 枚举（实测 0.4.0 正好 9 个，无缺失）。 */
export const MD3_VARIANT_BY_NAME: Record<Md3SchemeVariant, Variant> = {
  monochrome: Variant.MONOCHROME,
  neutral: Variant.NEUTRAL,
  tonalSpot: Variant.TONAL_SPOT,
  vibrant: Variant.VIBRANT,
  expressive: Variant.EXPRESSIVE,
  fidelity: Variant.FIDELITY,
  content: Variant.CONTENT,
  rainbow: Variant.RAINBOW,
  fruitSalad: Variant.FRUIT_SALAD,
}

/**
 * 完整角色表，名字用 MCU 的 camel 访问器名（变量名由 `roleVarName()` 转 kebab）。
 * 这是「角色集合」的唯一定义处：新增角色只许在这里加，并且必须是 0.4.0 真有这个访问器。
 */
export const MD3_COLOR_ROLES = [
  "primaryPaletteKeyColor",
  "secondaryPaletteKeyColor",
  "tertiaryPaletteKeyColor",
  "neutralPaletteKeyColor",
  "neutralVariantPaletteKeyColor",
  "errorPaletteKeyColor",
  "background",
  "onBackground",
  "surface",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "highestSurface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "shadow",
  "scrim",
  "surfaceTint",
  "primary",
  "primaryDim",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "inversePrimary",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "secondary",
  "secondaryDim",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "tertiaryDim",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "error",
  "errorDim",
  "onError",
  "errorContainer",
  "onErrorContainer",
] as const

export type Md3ColorRole = (typeof MD3_COLOR_ROLES)[number]

/** 角色访问器的统一形态：无参方法会忽略这个实参，`highestSurface` 需要它。 */
type RoleAccessorTable = Record<Md3ColorRole, (scheme: DynamicScheme) => DynamicColor | undefined>

function accessorTable(colors: MaterialDynamicColors): RoleAccessorTable {
  // 这一处 cast 是为了吸收「59 个无参 + 1 个带参」的不一致；见文件头。
  return colors as unknown as RoleAccessorTable
}

/** `surfaceContainerLowest` -> `surface-container-lowest`；变量名沿用 Google 的拼写。 */
export function kebabRoleName(role: string): string {
  return role.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)
}

/** 角色的 CSS 变量名：`--md-sys-color-<kebab-role>`。 */
export function roleVarName(role: string): string {
  return `${MD3_VAR.color}${kebabRoleName(role)}`
}

export interface Md3SchemeRequest {
  seed: string
  variant: Md3SchemeVariant
  contrastLevel: Md3ContrastLevel
  isDark: boolean
}

/**
 * 由 seed 建 scheme。`contrastLevel` 直通给 `DynamicScheme`（0.4.0 实测支持 -1…1，
 * 不是只有 0/1 两个档：见测试里 contrast 0 与 1 的角色差集非空）。
 */
export function createMd3Scheme(request: Md3SchemeRequest): DynamicScheme {
  const variant = MD3_VARIANT_BY_NAME[request.variant]
  if (variant === undefined) throw new Error(`md3: unknown scheme variant '${request.variant}'`)
  let argb: number
  try {
    argb = argbFromHex(request.seed)
  } catch (cause) {
    throw new Error(`md3: seed '${request.seed}' is not a #rrggbb color`, { cause })
  }
  return new DynamicScheme({
    sourceColorHct: Hct.fromInt(argb),
    variant,
    contrastLevel: request.contrastLevel,
    isDark: request.isDark,
  })
}

/** 一个 scheme 的整套角色：`--md-sys-color-*` -> `#rrggbb`。解不出的角色直接缺席。 */
export function resolveColorRoles(scheme: DynamicScheme): Record<string, string> {
  const table = accessorTable(scheme.colors)
  const vars: Record<string, string> = {}
  for (const role of MD3_COLOR_ROLES) {
    const color = table[role](scheme)
    // undefined 只在 2025-spec 角色上出现；这里不编造 tone，宁可少一个变量。
    if (!color) continue
    vars[roleVarName(role)] = hexFromArgb(color.getArgb(scheme))
  }
  return vars
}

export interface Md3RolePair {
  light: Record<string, string>
  dark: Record<string, string>
}

/**
 * 同一个 seed 的明暗两套角色。`resolveMd3Theme` 只取当前 `context.scheme` 那一套，
 * 这个函数是给设置页的色板对照（swatch pair）用的，不在渲染路径上。
 */
export function resolveColorRolePair(request: Omit<Md3SchemeRequest, "isDark">): Md3RolePair {
  return {
    light: resolveColorRoles(createMd3Scheme({ ...request, isDark: false })),
    dark: resolveColorRoles(createMd3Scheme({ ...request, isDark: true })),
  }
}

/** M3 调色板名（`DynamicScheme` 上的五个非 error 面板；error 面板不参与图表配色）。 */
export type Md3PaletteName = "primary" | "secondary" | "tertiary" | "neutral" | "neutralVariant"

/** 调色板名 -> `DynamicScheme` 上那个 `TonalPalette`。显式 switch，不做动态属性名拼接。 */
function paletteOf(scheme: DynamicScheme, palette: Md3PaletteName): TonalPalette {
  switch (palette) {
    case "primary":
      return scheme.primaryPalette
    case "secondary":
      return scheme.secondaryPalette
    case "tertiary":
      return scheme.tertiaryPalette
    case "neutral":
      return scheme.neutralPalette
    case "neutralVariant":
      return scheme.neutralVariantPalette
  }
}

/** 取某个调色板在指定 tone 上的 hex。图表配色用它，见 mapper.ts 的 `--chart-*` 说明。 */
export function paletteToneHex(scheme: DynamicScheme, palette: Md3PaletteName, tone: number): string {
  return hexFromArgb(paletteOf(scheme, palette).tone(tone))
}
