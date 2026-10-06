/**
 * Action 注册表的公开面（ADR-0081）。
 *
 * 界面只从这里取动作；任何渲染器都不许自己决定「有哪些动作」。
 */
import "./builtins"
import "./nodeActions"

export { NODE_ACTION_IDS, NODE_ACTION_ID_PREFIX, nodeActionId } from "./nodeActionIds"

export {
  executeAction,
  getActionContext,
  getActionDescriptor,
  getActionRevision,
  getActionViews,
  getRegisteredActionIds,
  installGlobalActionKeys,
  registerAction,
  subscribeActions,
  syncActionContext,
  unregisterAction,
} from "./registry"
export { useActionPopover, useActionViews, useExecuteAction } from "./useActions"
export { WHEEL_MAX_SECTORS, applyWheelLayout } from "./wheelPreferences"
export { getActionIcon } from "./icons"
export { BUILT_IN_ACTION_IDS, resolveActionLabel } from "./types"
export type {
  ActionCategory,
  ActionContext,
  ActionId,
  ActionIndicator,
  ActionPresentation,
  ActionView,
  BuiltInActionId,
  XiraniteActionDescriptor,
} from "./types"
