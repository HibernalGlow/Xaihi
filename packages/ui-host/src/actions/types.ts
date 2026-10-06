/**
 * Action 注册表的词表（ADR-0081）。
 *
 * 注册表是顶栏、轮盘、命令面板与键位的唯一事实源；渲染器只读这里，不得自带语义。
 */
import type { ViewMode } from "@/types/workspace"

/** 本轮内建动作的 id。分层命名，`node.open.<id>` 这类派生 id 留给后续阶段。 */
export const BUILT_IN_ACTION_IDS = [
  "workspace.dashboard",
  "workspace.history",
  "workspace.deletions",
  "workspace.operations",
  "workspace.runtime",
  "workspace.registry",
  "theme.switcher",
] as const

export type BuiltInActionId = (typeof BUILT_IN_ACTION_IDS)[number]

/** `string & {}` 保留字面量自动补全，同时允许后续节点派生 id。 */
export type ActionId = BuiltInActionId | (string & {})

export type ActionCategory = "workspace" | "theme" | "node" | "system"

/**
 * `command` 直接执行；`popover` 由渲染器自己开锚定弹层——主题快速切换的弹层里有 Select
 * 与 ToggleGroup，轮盘只能「打开它」，不能替它执行。
 */
export type ActionPresentation = "command" | "popover"

/**
 * 角标形态。留在注册表而不是让渲染器按 id 特判：渲染器只认「点」和「计数」两种原语。
 * `dot` = 激活时一个小圆点；`badge` = 数字角标。
 */
export type ActionIndicator = "none" | "dot" | "badge"

/**
 * 渲染器在求值时推进注册表的快照。动作不直接读 store，是为了能在测试里传一个假的上下文
 * 就能判定 enabled/toggled，而不必搭整个工作区。
 */
export interface ActionContext {
  viewMode: ViewMode
  activeOperationCount: number
  devRuntimeActive: boolean
}

/** 标签可以是静态 i18n key，也可以按上下文选（开发运行时那条要区分 vite/打包）。 */
export type ActionLabelKey = string | ((context: ActionContext) => string)

export interface XiraniteActionDescriptor {
  id: ActionId
  category: ActionCategory
  labelKey: ActionLabelKey
  presentation: ActionPresentation
  order: number
  /** 渲染器提供的上下文相关能力；缺省视为「可用、未激活、无角标」。 */
  isEnabled?: (context: ActionContext) => boolean
  isToggled?: (context: ActionContext) => boolean
  isVisible?: (context: ActionContext) => boolean
  badge?: (context: ActionContext) => number
  indicator?: ActionIndicator
  /** presentation === "command" 时必填。 */
  run?: (context: ActionContext) => void
  /** Lumino accelerator 数组；多个条目即 chord。P0 先不占用全局键位。 */
  keys?: string[]
  /** 键位生效的 CSS 作用域，交给 Lumino 的 selector 匹配。 */
  selector?: string
}

/** 渲染器读到的视图。图标不在这里（ADR-0081：Lumino 的 icon 是 VirtualDOM，不用）。 */
export interface ActionView {
  id: ActionId
  category: ActionCategory
  labelKey: ActionLabelKey
  presentation: ActionPresentation
  order: number
  enabled: boolean
  toggled: boolean
  badge: number
  indicator: ActionIndicator
}

export function resolveActionLabel(labelKey: ActionLabelKey, context: ActionContext): string {
  return typeof labelKey === "function" ? labelKey(context) : labelKey
}
