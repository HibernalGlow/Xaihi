import { detectDshDesktopRuntime } from "./adapters/dshDesktop"

/**
 * The two hosts that exist now that the Wails, Deno Desktop and Tauri bridges are all retired: the shipped
 * desktop shell, which exposes `window.dshDesktop.xaihiWindow` (ADR-0011), and a plain browser. Detection is
 * the same structural read `adapters/dshDesktop` uses, so this stays a report of the shell the app actually
 * got and never a second IPC path.
 *
 * 过去这里还报告 Xiranite REST 后端的地址、token 与 dev 命令（读 `window.__XIRANITE_BACKEND__` /
 * `VITE_XIRANITE_BACKEND_*`）。那条通路整块作废（2026-10-07 使用者口径："不再使用 rest 架构通信，
 * 一切都走这个 DSH 插件标准来"），连接状态的真源是桥握手（`useHostConnection`），所以这三样不再报告，
 * `__XIRANITE_BACKEND__` 的字面串也随这一刀从产物里消失。
 */
export type HostRuntimeKind = "electron" | "web"
export type FrontendSourceKind = "vite-dev" | "packaged"

export interface RuntimeConnectionInfo {
  hostRuntime: HostRuntimeKind
  frontendSource: FrontendSourceKind
  frontendOrigin: string
}

function clean(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

export function getRuntimeConnectionInfo(): RuntimeConnectionInfo {
  const frontendDevUrl = clean(import.meta.env.VITE_XIRANITE_FRONTEND_DEV_URL)
  const frontendOrigin = typeof window !== "undefined" ? window.location.origin : ""
  const hostRuntime: HostRuntimeKind = typeof window !== "undefined" && detectDshDesktopRuntime(window) ? "electron" : "web"

  return {
    hostRuntime,
    frontendSource: import.meta.env.DEV || frontendDevUrl ? "vite-dev" : "packaged",
    frontendOrigin,
  }
}
