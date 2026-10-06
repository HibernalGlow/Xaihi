/**
 * L1 内建动作（ADR-0081 的三层来源里最里面那层）。
 *
 * 这七个动作今天散在 `TopBar.tsx` 的六个手写 `DockIcon` 与一个主题 Popover 触发器里；
 * 搬到这里之后，顶栏、轮盘、命令面板与键位读的都是这一份。
 *
 * 动作不直接读 store 的 hook，而是走 `selectWorkspaceActions(getState())` 这个非 React 读法，
 * 并且**在 run 里才取**——模块加载期取会和工作区 store 形成加载环。
 */
import { registerAction } from "./registry"
import { workspaceStoreActions } from "./storeAccess"
import type { ActionContext } from "./types"

function actions() {
  return workspaceStoreActions()
}

/** 模块级注册：谁 import `@/actions` 谁就拿到这七个，不需要额外的启动调用。 */
registerAction({
  id: "workspace.dashboard",
  category: "workspace",
  labelKey: "topbar:viewMode.dashboard",
  presentation: "command",
  order: 10,
  isToggled: (context: ActionContext) => context.viewMode === "dashboard",
  run: (context: ActionContext) => {
    actions().setViewMode(context.viewMode === "dashboard" ? "cards" : "dashboard")
  },
})

registerAction({
  id: "workspace.history",
  category: "workspace",
  labelKey: "topbar:history",
  presentation: "command",
  order: 20,
  run: () => {
    actions().setOverlay("history")
  },
})

registerAction({
  id: "workspace.deletions",
  category: "workspace",
  labelKey: "topbar:deletions",
  presentation: "command",
  order: 30,
  run: () => {
    actions().setOverlay("deletions")
  },
})

registerAction({
  id: "workspace.operations",
  category: "workspace",
  labelKey: "topbar:operations",
  presentation: "command",
  order: 40,
  badge: (context: ActionContext) => context.activeOperationCount,
  indicator: "badge",
  run: () => {
    actions().setOverlay("operations")
  },
})

registerAction({
  id: "workspace.runtime",
  category: "workspace",
  labelKey: (context: ActionContext) =>
    context.devRuntimeActive ? "topbar:devRuntime.vite" : "topbar:devRuntime.packaged",
  presentation: "command",
  order: 50,
  isToggled: (context: ActionContext) => context.devRuntimeActive,
  indicator: "dot",
  run: () => {
    actions().setOverlay("settings")
  },
})

registerAction({
  id: "workspace.registry",
  category: "workspace",
  labelKey: "overlay:registry",
  presentation: "command",
  order: 60,
  run: () => {
    actions().setOverlay("registry")
  },
})

registerAction({
  id: "theme.switcher",
  category: "theme",
  labelKey: "topbar:theme.label",
  presentation: "popover",
  order: 70,
})
