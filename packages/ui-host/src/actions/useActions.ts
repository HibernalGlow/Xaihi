/**
 * React 侧读注册表的那层适配（ADR-0081：Lumino 的事件是 signaling，不是 React state，
 * 没有这层的话 isEnabled 变了界面不会重绘）。
 */
import { useCallback, useMemo, useSyncExternalStore } from "react"

import { executeAction, getActionRevision, getActionViews, subscribeActions } from "./registry"
import type { ActionId, ActionView } from "./types"

function subscribe(listener: () => void): () => void {
  return subscribeActions(listener)
}

function getSnapshot(): number {
  return getActionRevision()
}

/** 顶栏与轮盘共用；按 order 排好序，渲染器不再自己决定动作顺序。 */
export function useActionViews(): ActionView[] {
  const revision = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(() => getActionViews(), [revision])
}

/**
 * 弹层类动作的开关状态归渲染器：注册表只说「这个动作是 popover、它该叫什么」，
 * 开哪个、内容是什么由持有 Popover 的那一侧决定。
 */
export function useActionPopover(openId: ActionId | null, setOpenId: (id: ActionId | null) => void) {
  const toggle = useCallback(
    (id: ActionId) => {
      setOpenId(openId === id ? null : id)
    },
    [openId, setOpenId],
  )
  return { openId, toggle, close: () => setOpenId(null) }
}

export function useExecuteAction() {
  return useCallback((id: ActionId) => executeAction(id), [])
}
