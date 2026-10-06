/**
 * 顶层渲染崩溃的恢复动作。
 *
 * 崩溃面自己就在 React 树里，而「原样刷新」会把崩溃时正打开的那个视图再加载一遍：
 * 首屏渲染哪块内容只由 URL query 决定（`viewMode` 不进 localStorage，且
 * `WorkspaceUrlState` 用 `clearOnDefault:false` 保证 `?view=` 永远写回地址栏），
 * 自动恢复的节点窗口又由持久化偏好决定。于是同一个坏 chunk 每次都赢，
 * Reload 变成死循环。这里按代价从低到高分两级：先只回到默认视图，
 * 仍然崩溃才关掉节点自动恢复并清掉泳道会话。
 */
import { useSwimlaneSessionStore } from "@/store/swimlaneSessionStore"
import { useWorkspaceStore } from "@/store/workspaceStore"

/**
 * 决定首屏渲染内容的 URL 参数。
 *
 * 前三项由 `WorkspaceUrlState` 读写，后五项由 `App` 用来识别浮窗模式；
 * 删掉后各自的默认值即「默认状态」，不需要额外写入。
 */
const VIEW_PINNING_PARAMS = [
  "view",
  "workspace",
  "settings",
  "floatingComponent",
  "windowId",
  "moduleId",
  "workspaceId",
  "title",
] as const

const RECOVERY_KEY = "xiranite.render-recovery"

/** 超过这个窗口就认为上次恢复已经成功启动过，新崩溃应当从第一级重新开始。 */
const RECOVERY_WINDOW_MS = 30_000

/** 0 = 本次会话还没尝试过恢复；1/2 = 已经试过第几级。 */
export type RecoveryLevel = 0 | 1 | 2

/** 去掉地址里把应用钉回崩溃视图的参数，保留其余参数与 hash（例如 `?log=debug`）。 */
export function defaultViewUrl(href: string): string {
  const url = new URL(href)
  for (const key of VIEW_PINNING_PARAMS) url.searchParams.delete(key)
  return url.href
}

export function serializeRecoveryAttempt(level: 1 | 2, at: number): string {
  return `${level}:${at}`
}

/** 解析 sessionStorage 里记录的恢复级别；缺失、损坏或过期都按「没试过」处理。 */
export function parseRecoveryAttempt(raw: string | null | undefined, now: number): RecoveryLevel {
  if (!raw) return 0
  const [level, at] = raw.split(":")
  const attemptedAt = Number(at)
  if (!Number.isFinite(attemptedAt) || now - attemptedAt > RECOVERY_WINDOW_MS) return 0
  if (level === "1") return 1
  if (level === "2") return 2
  return 0
}

export function readRecoveryLevel(now: number = Date.now()): RecoveryLevel {
  return parseRecoveryAttempt(window.sessionStorage.getItem(RECOVERY_KEY), now)
}

/** 第一级：回到默认视图重载。不动任何持久化偏好。 */
export function reloadAtDefaultView(now: number = Date.now()): void {
  window.sessionStorage.setItem(RECOVERY_KEY, serializeRecoveryAttempt(1, now))
  window.location.replace(defaultViewUrl(window.location.href))
}

/**
 * 第二级：额外关掉「启动时恢复节点」并清空泳道会话。
 *
 * 主题、布局等外观偏好一律保留 —— 这一级要切断的是「启动即重新挂载上次那些节点」，
 * 而不是用户的全部设置。关闭恢复是可逆的，落点在 设置 → 工作区 → 启动时恢复节点。
 */
export function reloadWithWorkspaceReset(now: number = Date.now()): void {
  window.sessionStorage.setItem(RECOVERY_KEY, serializeRecoveryAttempt(2, now))
  useSwimlaneSessionStore.getState().clearSessions()
  useWorkspaceStore.getState().setRestoreWorkspaceComponents(false)
  window.location.replace(defaultViewUrl(window.location.href))
}
