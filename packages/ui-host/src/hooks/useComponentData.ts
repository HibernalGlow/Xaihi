import { useCallback } from "react"
import { useWorkspaceActions, useWorkspaceComponentData } from "@/store/workspaceStore"

/**
 * useComponentData — 让模块把状态持久化到 store 的 comp.data。
 *
 * 解决的痛点：
 * 三种 viewMode（cards / dockview / flow）切换时，ModuleRenderer 会被
 * 卸载/重新挂载。如果模块只用 useState 存数据（如某个节点扫描结果），
 * 切换 viewMode 后状态全部丢失。
 *
 * 用法：
 *   const [data, setData] = useComponentData<EngineVState>(compId)
 *   setData({ result: scanResult })
 *   // 切 viewMode 再切回来，data.result 仍在
 *
 * setData 支持部分更新（浅合并），行为类似类组件的 this.setState。
 *
 * 持久化链路：
 * - 模块 setData → dispatch PATCH_COMPONENT_DATA → store 更新 comp.data
 * - store 的 useEffect 监听 components 变化 → debounce 写回 Local Backend
 * - Local Backend repository 按当前配置写入 libSQL
 *
 * 这样模块状态在三种 viewMode 间完全共享，且跨会话持久化。
 */
export function useComponentData<T extends object>(
  compId: string,
): [T, (patch: Partial<T>) => void] {
  const data = useWorkspaceComponentData<T>(compId)
  const workspaceActions = useWorkspaceActions()

  const setData = useCallback(
    (patch: Partial<T>) => {
      workspaceActions.patchComponentData(compId, patch as Record<string, unknown>)
    },
    [compId, workspaceActions],
  )

  return [data, setData]
}
