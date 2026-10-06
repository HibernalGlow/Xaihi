/**
 * 把模块表里的每个节点注册成一个 `node.open.<id>` 动作（ADR-0081 的 L2 层）。
 *
 * 这就是「想加什么都可以加」的落点：动作一旦注册，轮盘、命令面板与键位都能引用它，
 * 不需要为任何单个节点再写一遍按钮。
 *
 * 默认**不进轮盘**（见 `store/workspace/constants.ts` 里 `wheelHiddenActions` 的初值）：
 * 模块表有 30 来项，全露出来会把 6 个内建动作从 8 格里挤掉，用户得自己去设置里拖进来。
 */
import { registerAction } from "./registry"
import { workspaceStoreActions } from "./storeAccess"
import { NODE_ACTION_SOURCES } from "./nodeActionIds"
import type { ActionContext } from "./types"

/** 派生动作一律排在内建动作之后，默认顺序才稳定。 */
const NODE_ACTION_ORDER_BASE = 1000

for (const [index, source] of NODE_ACTION_SOURCES.entries()) {
  registerAction({
    id: source.actionId,
    category: "node",
    // 模块名本身就是展示串，不是 i18n key；渲染器 t() 未命中时原样返回。
    labelKey: source.name,
    presentation: "command",
    order: NODE_ACTION_ORDER_BASE + index,
    run: (context: ActionContext) => {
      workspaceStoreActions().deployComponent(source.moduleId, context.viewMode)
    },
  })
}
