/**
 * 模块放置目标 hook。
 *
 * 在工作区画布、泳道、dockview 等容器上绑定返回的 moduleDropHandlers，即可接收来自模块库的拖拽放置。
 * 内部封装与 `@/lib/moduleDragDrop` 协议的对接逻辑：
 * - 仅接受 XIRANITE_MODULE_MIME 类型的拖拽，忽略普通文本/文件拖拽；
 * - 维护 isModuleOver 状态用于高亮放置区域；
 * - onDrop 时解析 moduleId 并调用 onDropModule 回调；
 * - 通过 relatedTarget.contains 判断避免子元素 dragLeave 误触发；
 * - 全局监听 dragend/drop/blur 兜底清理拖拽态，防止状态卡死。
 *
 * @param onDropModule 拖拽放置成功回调，传入被拖拽的 moduleId 与原始 drop 事件
 * @returns { isModuleOver, moduleDropHandlers }
 */
import { useCallback, useEffect, useState, type DragEvent as ReactDragEvent } from "react"
import { acceptModuleDragOver, getModuleDragData, isModuleDrag } from "@/lib/moduleDragDrop"

export function useModuleDropTarget(
  onDropModule: (moduleId: string, event: ReactDragEvent<HTMLElement>) => void,
) {
  const [isModuleOver, setIsModuleOver] = useState(false)

  const onDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isModuleDrag(event)) return
    event.preventDefault()
    setIsModuleOver(true)
  }, [])

  const onDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (acceptModuleDragOver(event)) setIsModuleOver(true)
  }, [])

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    // 仅当离开容器本身（而非进入子元素）时才清除高亮
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setIsModuleOver(false)
  }, [])

  const onDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const payload = getModuleDragData(event)
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    setIsModuleOver(false)
    onDropModule(payload.moduleId, event)
  }, [onDropModule])

  // 兜底：拖拽中途窗口失焦或拖到外部释放时，确保 isModuleOver 不会卡住
  useEffect(() => {
    if (!isModuleOver || typeof window === "undefined") return undefined

    const clearDragState = () => setIsModuleOver(false)
    window.addEventListener("dragend", clearDragState)
    window.addEventListener("drop", clearDragState)
    window.addEventListener("blur", clearDragState)

    return () => {
      window.removeEventListener("dragend", clearDragState)
      window.removeEventListener("drop", clearDragState)
      window.removeEventListener("blur", clearDragState)
    }
  }, [isModuleOver])

  return {
    isModuleOver,
    moduleDropHandlers: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  }
}
