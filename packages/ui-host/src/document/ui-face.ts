/**
 * 把 `uiFace`（legacy | md3e）同步到 `<html data-ui-face>`。
 *
 * 这条属性是界面形态的唯一可见落地：
 * - CSS 的 `[data-ui-face="md3e"]` 规则只认 DOM，不认 store；
 * - 设置页的回读（`Md3eSettingsView` 的 `root.getAttribute("data-ui-face")`）也读它；
 * - `useMd3eActive()` 在 store 未设置时同样回落到这条属性。
 *
 * 之前它只被读、从未被写，所以「切换」只改了 store：画面不变、回读也不变，
 * 看起来就是按了没反应。默认值按 ADR-0033 是 `legacy`。
 */
import { useWorkspaceStore } from "@/store/workspaceStore"

const LEGACY = "legacy"
const MD3E = "md3e"

function applyUiFace(face: string | undefined): void {
  if (typeof document === "undefined") return
  const value = face === MD3E ? MD3E : LEGACY
  const root = document.documentElement
  if (root.dataset.uiFace !== value) root.dataset.uiFace = value
}

/** 挂上订阅：立刻写一次，之后每次 uiFace 变化再写。返回取消订阅。 */
export function mountUiFaceAttribute(): () => void {
  applyUiFace(useWorkspaceStore.getState().uiFace)
  return useWorkspaceStore.subscribe((state) => applyUiFace(state.uiFace))
}
