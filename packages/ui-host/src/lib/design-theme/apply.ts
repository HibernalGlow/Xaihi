/**
 * 高级主题的落盘端：把解析出来的 token 写成 `:root` inline 变量 + 根属性。
 *
 * 三个不能出错的地方：
 *  1. **清理必须精确**。变量写 inline（优先级高于任何选择器），所以「关掉高级主题」
 *     不能靠再写一遍旧值，只能撤我们自己写过的那批 key；`appliedKeys` 只记我们写过的。
 *  2. **顺序是语义**。自定义主题（themes.json 的 cssVars）写同一个 inline key
 *     （例如 `--primary`），后写的赢。挂载顺序因此固定：
 *     WorkspaceAppearance（颜色主题）→ WorkspaceDesignTheme（高级主题）。
 *     我们撤掉自己的值之后，颜色主题那批必须有人重写回来，
 *     所以这里交给调用方的 `restoreAppearance`，而不是假装 DOM 还是对的。
 *  3. **要能回读**。`data-design-rev` 与 `data-design-applied-vars` 是 DOM 侧证据：
 *     「代码跑过了」与「画面上真的换了」只有靠这两个才分得开，浏览器测试也断言它们。
 */

import {
  BRIDGED_COLOR_VARS,
  DESIGN_APPLIED_ATTR,
  DESIGN_CONTRAST_ATTR,
  DESIGN_DIM_ATTR_PREFIX,
  DESIGN_DIMENSIONS,
  DESIGN_REV_ATTR,
  DESIGN_ROOT_ATTR,
  DESIGN_SEED_ATTR,
  DESIGN_SEED_FALLBACK_ATTR,
  DESIGN_SEED_SOURCE_ATTR,
  DESIGN_VARIANT_ATTR,
  type DesignThemeConfig,
  type DesignThemeContext,
} from "./contract"
import { resolveDesignTheme } from "./registry"

export interface DesignThemeReadback {
  id: DesignThemeConfig["id"]
  rev: number
  appliedVars: number
  seed: string | null
  seedSource: string | null
  seedFallback: boolean | null
  contrastLevel: number | null
  variant: string | null
}

const appliedKeys = new Set<string>()
const bridgedColorVars = new Set<string>(BRIDGED_COLOR_VARS)
let rev = 0
let lastReadback: DesignThemeReadback = {
  id: "native",
  rev: 0,
  appliedVars: 0,
  seed: null,
  seedSource: null,
  seedFallback: null,
  contrastLevel: null,
  variant: null,
}

function removeAppliedVars(root: HTMLElement) {
  for (const key of appliedKeys) root.style.removeProperty(key)
  appliedKeys.clear()
}

/**
 * 摘掉本维度写过的**所有**根属性，而不是逐个点名某一条属性名。
 *
 * 理由不是整洁：`resolve.ts` 这类解析器会自带诊断属性（`data-md3-token-dictionary` 等），
 * 逐点名的清单永远只覆盖写清单的人当时知道的那几个——上一条注释就是它留下的洞。
 * 名单这里只到**命名空间**一级（一份配方一条），`apply.test.ts` 会拿注册表里每份配方
 * 真发出来的属性去撞这张表：新配方加了命名空间而这里没登记，那条测试就红，
 * 而不是留下一批「换回 native 之后还挂在 DOM 上」的孤儿属性。
 */
export const DESIGN_ATTR_NAMESPACES = ["data-app-design", "data-design-", "data-md3-", "data-stijl-", "data-wuling-", "data-swiss-", "data-lonestar-"] as const

const DESIGN_ATTR_PATTERN = new RegExp(`^(${DESIGN_ATTR_NAMESPACES.join("|")})`)

function removeDesignAttributes(root: HTMLElement) {
  for (const name of [...root.getAttributeNames()]) {
    if (DESIGN_ATTR_PATTERN.test(name)) root.removeAttribute(name)
  }
}

/**
 * 应用（或重应用）高级主题。
 *
 * @param restoreAppearance 撤掉我们接管的颜色变量后，把颜色主题的 inline 变量重写回来。
 */
export function applyDesignTheme(
  config: DesignThemeConfig,
  context: DesignThemeContext,
  restoreAppearance?: () => void,
): void {
  const root = document.documentElement

  // 先撤旧的再解析，**解析必须在撤干净之后**：颜色维度的逐槽合并要读「当前配色主题」
  // 声明了哪些槽，而高级主题与配色主题写的是同一个 `:root` inline 属性。
  // 顺序错了就会读到上一轮自己的输出，并把「MD3 派生的颜色」误认成「主题原样给的」——
  // 那种坏法在界面上几乎看不出来（值本来就是从同一个 seed 算出来的），只有这条顺序能防住。
  //
  // 只有真的撤掉过「桥接色」变量才需要请颜色主题重写——那些 key 是覆盖在自定义主题
  // inline 值上面的，撤掉之后不重写就会留下空洞；纯几何/排版类的重应用不该
  // 顺手把 mirrorAestivusThemeStorage 的 localStorage 写入再刷一遍（形状缩放拖动时很密）。
  const maskedColorVars = appliedKeys.size > 0 && [...appliedKeys].some((key) => bridgedColorVars.has(key))
  removeAppliedVars(root)
  // 属性整批重放：上一轮某配方写过、这一轮不再写的诊断属性不能留在 DOM 上。
  removeDesignAttributes(root)
  if (maskedColorVars) restoreAppearance?.()

  const resolution = resolveDesignTheme(config, context)

  for (const [name, value] of Object.entries(resolution?.bundle.attributes ?? {})) {
    root.setAttribute(name, value)
  }

  const vars = resolution?.bundle.vars ?? {}
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
    appliedKeys.add(name)
  }

  rev += 1
  root.setAttribute(DESIGN_ROOT_ATTR, config.id)
  for (const dimension of DESIGN_DIMENSIONS) {
    root.setAttribute(`${DESIGN_DIM_ATTR_PREFIX}${dimension}`, config.dimensions[dimension] ? "on" : "off")
  }
  root.setAttribute(DESIGN_REV_ATTR, String(rev))
  root.setAttribute(DESIGN_APPLIED_ATTR, String(appliedKeys.size))

  // seed 那三条只有 MD3 才有；`DesignThemeResolution` 允许为空是为了风格派不冒充有 seed，
  // 所以这里按「真的有值」再写属性，而不是塞一个空串装点门面。
  if (config.id === "md3" && resolution && resolution.seed !== null && resolution.seedSource !== null) {
    root.setAttribute(DESIGN_VARIANT_ATTR, config.md3.variant)
    root.setAttribute(DESIGN_SEED_ATTR, resolution.seed)
    root.setAttribute(DESIGN_SEED_SOURCE_ATTR, resolution.seedSource)
    root.setAttribute(DESIGN_SEED_FALLBACK_ATTR, resolution.seedFallback ? "true" : "false")
    root.setAttribute(DESIGN_CONTRAST_ATTR, String(config.md3.contrastLevel))
  }
  // native / 未知配方不需要在这里逐个摘属性：上面的 removeDesignAttributes() 已经按前缀
  // 清空过一整批。写死的「撤销名单」正是这次修掉的洞——它永远只覆盖写名单那人当时知道的属性。

  lastReadback = {
    id: config.id,
    rev,
    appliedVars: appliedKeys.size,
    seed: resolution?.seed ?? null,
    seedSource: resolution?.seedSource ?? null,
    seedFallback: resolution?.seedFallback ?? null,
    contrastLevel: config.id === "md3" ? config.md3.contrastLevel : null,
    variant: config.id === "md3" ? config.md3.variant : null,
  }
}

/** 卸载/切换到完全不干预的状态时用。 */
export function clearDesignTheme(restoreAppearance?: () => void) {
  const root = document.documentElement
  removeAppliedVars(root)
  removeDesignAttributes(root)
  restoreAppearance?.()
}

/** 仅供测试与诊断：DOM 才是事实源，这份快照只是它的镜像。 */
export function getDesignThemeReadback(): DesignThemeReadback {
  return lastReadback
}
