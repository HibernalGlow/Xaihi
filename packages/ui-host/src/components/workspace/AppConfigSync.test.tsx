// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { AppConfigSync } from "./AppConfigSync"
import { WorkspaceAppearance } from "./WorkspaceAppearance"

/**
 * 这条链路在换宿主时断过两次，所以断言端到端：读回来的 app.ui → store → document root 上的字体预设。
 *
 * 夹具把 `saveAppConfigToBackend` 装成**必然抛**，复刻 Tauri 宿主的真实答案：
 * `/config` 家族只注册了 GET（`crates/xiranite-api/src/config_routes.rs` 的
 * 「Writes are deliberately absent」），任何回写都拿不到 2xx。
 * 加载序列一旦回成「先 await 回写、再应用」，字体就永远进不了 store —— 本文件必须变红。
 */
const harness = vi.hoisted(() => ({
  appConfig: { version: 3, workspace: { fontPreset: "aestivus" } } as Record<string, unknown>,
  saveAttempts: 0,
}))

vi.mock("@/backend/configRpcClient", () => ({
  getAppConfigFromBackend: async () => ({ config: harness.appConfig, path: "/tmp/xiranite.config.toml" }),
  saveAppConfigToBackend: async () => {
    harness.saveAttempts += 1
    throw new Error("PUT /config/app/ui is not registered by the host")
  },
  getCustomThemesFromBackend: async () => ({ themes: [], path: "/tmp/themes.json" }),
  saveCustomThemesToBackend: async () => undefined,
  getBackgroundImageFromBackend: async () => ({ url: null, path: "/tmp/bg-image" }),
  saveBackgroundImageToBackend: async () => undefined,
}))

vi.mock("@/backend/localBackendConfig", () => ({
  localBackendConnectionKey: () => "test-backend",
}))

vi.mock("@/hooks/useLocalBackendStatus", () => ({
  useLocalBackendStatus: () => ({ data: { status: "ready", config: {} } }),
}))

vi.mock("@/components/use-theme", () => ({
  useTheme: () => ({ theme: "dark", setTheme: () => undefined }),
}))

vi.mock("@/i18n", () => ({
  changeLanguage: async () => undefined,
  getCurrentLanguage: () => "zh",
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "zh" } }),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  harness.appConfig = { version: 3, workspace: { fontPreset: "aestivus" } }
  harness.saveAttempts = 0
  useWorkspaceStore.getState().setFontPreset("xiranite")
  document.documentElement.removeAttribute("style")
  document.documentElement.dataset.fontPreset = "xiranite"
})

function renderSync() {
  return render(
    <>
      <AppConfigSync />
      <WorkspaceAppearance />
    </>,
  )
}

describe("app.ui font preset load", () => {
  test("applies the configured font preset even though the host refuses the write-back", async () => {
    useWorkspaceStore.getState().setFontPreset("mono")

    renderSync()

    await waitFor(() => expect(useWorkspaceStore.getState().fontPreset).toBe("aestivus"))
    expect(document.documentElement.dataset.fontPreset).toBe("aestivus")
    // 回写照旧尝试一次；失败只留下日志，不再决定上面那次应用。
    await waitFor(() => expect(harness.saveAttempts).toBeGreaterThan(0))
  })

  test("正控：预设值来自配置，不是常量或回退项", async () => {
    harness.appConfig = { version: 3, workspace: { fontPreset: "terminal" } }
    useWorkspaceStore.getState().setFontPreset("mono")

    renderSync()

    await waitFor(() => expect(document.documentElement.dataset.fontPreset).toBe("terminal"))
    expect(useWorkspaceStore.getState().fontPreset).toBe("terminal")
  })

  test("默认字体落在霞鹜文楷屏幕阅读版：中英文族名与等宽那一路都在栈里", () => {
    const root = document.documentElement
    root.removeAttribute("style")
    useWorkspaceStore.getState().setFontPreset("aestivus")

    renderSync()

    const sans = root.style.getPropertyValue("--font-app-sans")
    const mono = root.style.getPropertyValue("--font-app-mono")
    expect(sans).toContain("LXGW WenKai Screen")
    expect(sans).toContain("霞鹜文楷 屏幕阅读版")
    // MD3 的 label/body 角色读 --font-app-mono，等宽那一路没有同族字体的话切预设看不出变化。
    expect(mono).toContain("LXGW WenKai Mono Screen")
  })
})
