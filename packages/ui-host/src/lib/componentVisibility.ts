/**
 * 组件可见性判断工具。
 *
 * 根据组件的 hiddenIn 字段判断它在指定视图模式下是否可见。
 *
 * 特殊规则：flow 视图采用"opt-in"语义 —— hiddenIn.flow 必须显式为 false
 * 才可见（默认隐藏），因为 flow 视图只显示用户主动拖入的组件。
 * 其他视图采用"opt-out"语义 —— hiddenIn[viewMode] 不为 true 即可见（默认显示）。
 * state 为 floating 的组件由独立窗口独占，所有主窗口视图均不渲染。
 */
import type { ComponentInstance, ViewMode } from "@/types/workspace"

/**
 * 判断组件在指定视图模式下是否可见。
 *
 * @param component 组件实例
 * @param viewMode  视图模式
 * @returns true 表示可见
 */
export function isComponentVisibleInView(component: ComponentInstance, viewMode: ViewMode): boolean {
  // Native/browser component windows share the workspace store with the main
  // window. A floating instance belongs exclusively to that external window.
  if (component.state === "floating") {
    return false
  }

  if (viewMode === "flow") {
    return component.hiddenIn?.flow === false
  }

  return component.hiddenIn?.[viewMode] !== true
}
