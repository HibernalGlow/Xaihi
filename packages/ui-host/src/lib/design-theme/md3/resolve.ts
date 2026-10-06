/**
 * MD3 配方的入口：seed -> `DynamicScheme` -> 颜色角色 -> CSS 变量 + 根属性。
 *
 * 管道固定四步（`docs/advanced-design-theme-md3.md` §3）：
 *   seed.ts 解出真实来源 -> color.ts 建 scheme 并算明暗两套角色 ->
 *   mapper.ts 按维度开关组装（桥接 shadcn + 非颜色命名空间）-> apply.ts 写 `:root`。
 *
 * 这个文件是 `md3/` 里**唯一** import `./tokens.generated` 的地方：
 * 生成物是数据表，只有这里知道怎么把它交给纯函数（mapper 走依赖注入，
 * 所以 `buildMd3Vars` 的单测不需要生成物存在就能跑）。
 *
 * 属性只写 `apply.ts` 没占用的那几个：`data-md3-variant` / `-seed` / `-seed-source` /
 * `-seed-fallback` / `-contrast` 由 `apply.ts` 自己负责（它拿的是 resolution 的字段），
 * 这里再写一遍就是两处真源，早晚会漂。
 */

import { BRIDGED_COLOR_VARS, type DesignThemeConfig, type DesignThemeContext, type DesignThemeResolution } from "../contract"
import { MD3_COMPONENT_TOKENS, MD3_SYS_TOKENS, MD3_TOKEN_SOURCE } from "./tokens.generated"
import { createMd3Scheme, resolveColorRoles } from "./color"
import { resolveSeed, type SeedHost } from "./seed"
import { buildMd3Vars } from "./mapper"

/**
 * 挂在 `:root` 上的 MD3 诊断属性名（不与 `apply.ts` 的五个 `data-md3-*` 重合）。
 * `apply.ts` 按 `data-app-design|data-design-|data-md3-` 前缀整批清理，
 * 所以这里新增诊断属性不需要回那边登记——换回 native 或卸载时会一起摘掉。
 */
export const MD3_SHAPE_SCALE_ATTR = "data-md3-shape-scale"
export const MD3_ELEVATION_SHADOW_ATTR = "data-md3-elevation-shadow"
export const MD3_TOKEN_DICTIONARY_ATTR = "data-md3-token-dictionary"
export const MD3_COLOR_ROLE_COUNT_ATTR = "data-md3-color-roles"
/**
 * 「配色主题里有多少槽是原样映射进来的」：`12/36` 这种形式。
 * 这是「直接映射」这件事的**回读路径**——没有它，用户只能靠眼看颜色有没有跟着配色主题走。
 */
export const MD3_BRIDGE_THEME_ATTR = "data-md3-bridge-theme"

/**
 * 读「当前已应用主题」的某个 CSS 变量，返回**原样字符串**。
 *
 * 这里刻意不用 `domColor.readRootColorVar()`：那条路径会把颜色量化成 `#rrggbb`，
 * 而 `dimensions.color = false` 要的是把用户的 `oklch()` / `color-mix()` 原样搬进
 * `--md-sys-color-*`（转换一次就丢掉 alpha，也丢掉主题里那点色域）。
 * `readSystemAccentColor()` 那种「必须解析成数字才能当 seed」的场景才走 domColor。
 */
export function readAppliedColorVar(varName: string): string | null {
  if (typeof document === "undefined") return null
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName)
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export interface Md3ResolveDeps {
  /** 系统强调色注入点（测试用假实现；缺省走 `domColor.readSystemAccentColor`）。 */
  seedHost?: SeedHost
  /** 颜色维度关闭时读当前主题的注入点。 */
  readThemeColorVar?: (varName: string) => string | null
}

/**
 * `registry.ts` 的 `md3` 分支。第三参数是测试/宿主注入点，缺省即真实 DOM 路径，
 * 所以注册表那边两个实参的调用形式不用改。
 */
export function resolveMd3Theme(
  config: DesignThemeConfig,
  context: DesignThemeContext,
  deps: Md3ResolveDeps = {},
): DesignThemeResolution {
  const seedResolution = resolveSeed(config, context, deps.seedHost)
  const isDark = context.scheme === "dark"
  const scheme = createMd3Scheme({
    seed: seedResolution.seed,
    variant: config.md3.variant,
    contrastLevel: config.md3.contrastLevel,
    isDark,
  })
  const roleVars = resolveColorRoles(scheme)

  const { vars, themeProvided } = buildMd3Vars({
    roleVars,
    scheme,
    isDark,
    options: config.md3,
    dimensions: config.dimensions,
    sysTokens: MD3_SYS_TOKENS,
    componentTokens: MD3_COMPONENT_TOKENS,
    readThemeColorVar: deps.readThemeColorVar ?? readAppliedColorVar,
    themeColorVars: context.themeColorVars ?? null,
  })

  const colorRoleCount = Object.keys(vars).filter((name) => name.startsWith("--md-sys-color-")).length

  return {
    bundle: {
      vars,
      attributes: {
        [MD3_SHAPE_SCALE_ATTR]: String(config.md3.shapeScale),
        [MD3_ELEVATION_SHADOW_ATTR]: config.md3.elevationShadows ? "on" : "off",
        // 字典版本上 DOM，「这个数是规范哪一版给的」在 devtools 里就能问出来。
        [MD3_TOKEN_DICTIONARY_ATTR]: MD3_TOKEN_SOURCE.designVersion,
        [MD3_COLOR_ROLE_COUNT_ATTR]: String(colorRoleCount),
        [MD3_BRIDGE_THEME_ATTR]: `${themeProvided.length}/${BRIDGED_COLOR_VARS.length}`,
      },
    },
    seed: seedResolution.seed,
    seedSource: seedResolution.source,
    seedFallback: seedResolution.fallback,
  }
}
