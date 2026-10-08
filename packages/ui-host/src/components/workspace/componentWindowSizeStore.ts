/**
 * 组件浮窗尺寸的持久化（文档侧）。
 *
 * 过去这两个读写走 Xiranite 的 REST 后端（`@/backend/workspaceRpcClient` 的
 * `persistComponentWindowSize` / `resolveComponentWindowSize`）。那条通路整块作废
 * （2026-10-07 使用者口径："不再使用 rest 架构通信，一切都走这个 DSH 插件标准来"），
 * 而浮窗尺寸是**这份文档自己的 UI 偏好**——不是跨进程通信，落 localStorage 就够；
 * 等它需要跨设备跟人走时，该去的地方是 appUi 段（`appConfigSections.ts`）而不是
 * 伪造一条 REST。
 *
 * 键形状与 REST 版的查询 DTO 一致（workspaceId/moduleId/componentId 三元组），
 * 值只存 `{width,height}`；读不到/形状不合回 null，调用点的 try/catch 语义不变。
 */

const STORAGE_KEY = "xaihi:component-window-sizes"

export interface ComponentWindowSizeKey {
  componentId: string
  moduleId?: string
  workspaceId?: string
}

export interface ComponentWindowSize {
  width: number
  height: number
}

function storageKeyOf(input: ComponentWindowSizeKey): string {
  return [input.workspaceId ?? "", input.moduleId ?? "", input.componentId].join("\n")
}

function readStore(): Record<string, ComponentWindowSize> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, ComponentWindowSize>)
      : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, ComponentWindowSize>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function resolveComponentWindowSize(input: ComponentWindowSizeKey): ComponentWindowSize | null {
  const size = readStore()[storageKeyOf(input)]
  return size !== undefined
    && Number.isFinite(size.width) && Number.isFinite(size.height)
    && size.width > 0 && size.height > 0
    ? size
    : null
}

export function persistComponentWindowSize(input: ComponentWindowSizeKey & { size: ComponentWindowSize }): void {
  const store = readStore()
  store[storageKeyOf(input)] = { width: Math.round(input.size.width), height: Math.round(input.size.height) }
  writeStore(store)
}
