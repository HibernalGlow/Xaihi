/**
 * 节点模块拖拽协议。
 *
 * 定义 Xiranite 内部模块（node module）从模块库拖到工作区画布时使用的 HTML5 拖拽数据协议：
 * - 自定义 MIME 类型 `application/x-xiranite-module` 携带结构化 JSON payload，确保只有 Xiranite
 *   内部发起的拖拽才会被工作区接受，避免与外部文本/文件拖拽冲突；
 * - 同时写入 `text/plain` 作为降级通道，便于不支持自定义 MIME 的场景（如某些跨窗口拖拽）回退解析。
 *
 * 拖拽源使用 setModuleDragData 写入数据；放置目标用 isModuleDrag 判断来源、用
 * acceptModuleDragOver 在 dragover 阶段调用 preventDefault 启用 drop、用 getModuleDragData 读取 payload。
 */
import type { DragEvent as ReactDragEvent } from "react"

/** 自定义 MIME 类型，用于标识 Xiranite 模块拖拽。 */
export const XIRANITE_MODULE_MIME = "application/x-xiranite-module"

/** 模块拖拽数据载荷：仅包含 moduleId。 */
export interface ModuleDragPayload {
  moduleId: string
}

/** dragover/drop 事件所需的最小结构，便于在测试或非 React 上下文中复用。 */
type DragLike = Pick<ReactDragEvent<HTMLElement>, "dataTransfer" | "preventDefault">

/**
 * 在拖拽开始时把模块 id 写入 dataTransfer。
 *
 * 同时写入自定义 MIME（结构化 JSON）与 text/plain（裸 id），后者作为降级通道。
 * effectAllowed 设为 "copy" 表示拖拽语义为"复制到目标"而非"移动"。
 *
 * @param event React dragstart 事件
 * @param moduleId 被拖拽的模块 id
 */
export function setModuleDragData(event: ReactDragEvent<HTMLElement>, moduleId: string): void {
  event.dataTransfer.effectAllowed = "copy"
  event.dataTransfer.setData(XIRANITE_MODULE_MIME, JSON.stringify({ moduleId }))
  event.dataTransfer.setData("text/plain", moduleId)
}

/**
 * 从 drop 事件读取模块拖拽 payload。
 *
 * 优先解析自定义 MIME 的 JSON；若 JSON 缺失或格式非法，则回退到 text/plain 裸字符串。
 * 任何情况下都会校验 moduleId 为非空字符串，避免无效数据被工作区接收。
 *
 * @param event React drop 事件（仅需 dataTransfer）
 * @returns 解析后的 payload，失败返回 null
 */
export function getModuleDragData(event: Pick<ReactDragEvent<HTMLElement>, "dataTransfer">): ModuleDragPayload | null {
  const raw = event.dataTransfer.getData(XIRANITE_MODULE_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ModuleDragPayload>
      return typeof parsed.moduleId === "string" && parsed.moduleId.trim()
        ? { moduleId: parsed.moduleId }
        : null
    } catch {
      return null
    }
  }

  const fallback = event.dataTransfer.getData("text/plain").trim()
  return fallback ? { moduleId: fallback } : null
}

/**
 * 判断事件是否由 Xiranite 模块拖拽发起。
 *
 * 通过检查 dataTransfer.types 是否包含自定义 MIME 实现。
 * 注意：dragover 期间 dataTransfer.getData 不可用（浏览器限制），必须用 types 判断。
 *
 * @param event React 拖拽事件（仅需 dataTransfer）
 */
export function isModuleDrag(event: Pick<ReactDragEvent<HTMLElement>, "dataTransfer">): boolean {
  const types = Array.from(event.dataTransfer.types ?? [])
  return types.includes(XIRANITE_MODULE_MIME)
}

/**
 * 在 dragover 阶段判断并接受模块拖拽。
 *
 * HTML5 拖拽协议要求 drop 目标在 dragover 中调用 preventDefault 才能触发 drop 事件；
 * 本函数封装"判断是否为模块拖拽 + 调用 preventDefault + 设置 dropEffect"三步。
 *
 * @param event dragover 事件
 * @returns 是否为模块拖拽（true 表示已接受，可触发 drop；false 表示忽略）
 */
export function acceptModuleDragOver(event: DragLike): boolean {
  if (!isModuleDrag(event)) return false
  event.preventDefault()
  event.dataTransfer.dropEffect = "copy"
  return true
}
