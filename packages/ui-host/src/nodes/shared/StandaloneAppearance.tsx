import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Monitor, Moon, Palette, Sun } from "lucide-react"
import { ThemeProvider } from "next-themes"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { NodeUiConfigStore } from "@/nodes/shared/NodeUiConfigContext"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { DESIGN_THEME_ENTRIES } from "@/lib/design-theme/registry"
import type { AppDesignThemeId, DesignThemeConfig } from "@/lib/design-theme/contract"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

export type StandaloneAppearanceMode = "workspace" | "system" | "light" | "dark"
export type StandaloneColorTheme = "workspace" | "jade" | "violet" | "amber"

export interface StandaloneAppearanceConfig {
  mode: StandaloneAppearanceMode
  colorTheme: StandaloneColorTheme
  designTheme?: "workspace" | AppDesignThemeId
}

interface StandaloneAppearanceContextValue extends StandaloneAppearanceConfig {
  effectiveDesignTheme?: DesignThemeConfig
  setDesignTheme: (theme: "workspace" | AppDesignThemeId) => void
  ready: boolean
  error?: string
  setMode: (mode: StandaloneAppearanceMode) => void
  setColorTheme: (colorTheme: StandaloneColorTheme) => void
}

const DEFAULT_APPEARANCE: StandaloneAppearanceConfig = { mode: "workspace", colorTheme: "workspace" }
const StandaloneAppearanceContext = createContext<StandaloneAppearanceContextValue | undefined>(undefined)

function isMode(value: unknown): value is StandaloneAppearanceMode {
  return value === "workspace" || value === "system" || value === "light" || value === "dark"
}

function isColorTheme(value: unknown): value is StandaloneColorTheme {
  return value === "workspace" || value === "jade" || value === "violet" || value === "amber"
}

function readAppearance(value: unknown): StandaloneAppearanceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_APPEARANCE
  const record = value as Record<string, unknown>
  return {
    mode: isMode(record.mode) ? record.mode : DEFAULT_APPEARANCE.mode,
    colorTheme: isColorTheme(record.colorTheme) ? record.colorTheme : DEFAULT_APPEARANCE.colorTheme,
    ...(record.designTheme === "workspace" || DESIGN_THEME_ENTRIES.some(entry => entry.id === record.designTheme) ? { designTheme: record.designTheme as "workspace" | AppDesignThemeId } : {}),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function StandaloneAppearanceProvider({ children, nodeId, store, workspaceMode = "system" }: { children: ReactNode; nodeId: string; store?: NodeUiConfigStore; workspaceMode?: string }) {
  const workspaceDesignTheme = useWorkspaceShallowSelector(state => state.designTheme)
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE)
  const effectiveDesignTheme = useMemo(() => appearance.designTheme && appearance.designTheme !== "workspace"
    ? { ...workspaceDesignTheme, id: appearance.designTheme } : workspaceDesignTheme, [workspaceDesignTheme, appearance.designTheme])
  const [ready, setReady] = useState(!store)
  const [error, setError] = useState(store ? "" : "当前宿主未提供持久配置，外观选择仅在本次打开期间生效。")
  const appearanceRef = useRef(DEFAULT_APPEARANCE)
  const writes = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!store) return
    let active = true
    setReady(false)
    void store.read(nodeId).then((value) => {
      if (!active) return
      const next = readAppearance(asRecord(value).appearance)
      appearanceRef.current = next
      setAppearance(next)
      setReady(true)
    }).catch((failure: unknown) => {
      if (active) { setError(String(failure)); setReady(true) }
    })
    return () => { active = false }
  }, [store, nodeId])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.standalonePalette
    if (appearance.colorTheme === "workspace") delete root.dataset.standalonePalette
    else root.dataset.standalonePalette = appearance.colorTheme
    return () => {
      if (previous) root.dataset.standalonePalette = previous
      else delete root.dataset.standalonePalette
    }
  }, [appearance.colorTheme])

  const save = useCallback((patch: Partial<StandaloneAppearanceConfig>) => {
    const nextAppearance = { ...appearanceRef.current, ...patch }
    appearanceRef.current = nextAppearance
    setAppearance(nextAppearance)
    setError(store ? "" : "当前宿主未提供持久配置，外观选择仅在本次打开期间生效。")
    if (!store) return
    const task = writes.current.catch(() => {}).then(async () => {
      const current = asRecord(await store.read(nodeId))
      await store.write(nodeId, { ...current, appearance: nextAppearance })
    })
    writes.current = task
    void task.catch((failure: unknown) => setError(String(failure)))
  }, [store, nodeId])

  const value: StandaloneAppearanceContextValue = {
    ...appearance, ready, error, effectiveDesignTheme,
    setDesignTheme: (designTheme) => save({ designTheme }),
    setMode: (mode) => save({ mode }),
    setColorTheme: (colorTheme) => save({ colorTheme }),
  }
  const inheritedMode = isMode(workspaceMode) && workspaceMode !== "workspace" ? workspaceMode : "system"
  const effectiveMode = appearance.mode === "workspace" ? inheritedMode : appearance.mode
  return <StandaloneAppearanceContext.Provider value={value}>
    <ThemeProvider attribute="class" forcedTheme={effectiveMode} defaultTheme="system" storageKey={`${nodeId}-effective-theme`} enableSystem>
      {children}
    </ThemeProvider>
  </StandaloneAppearanceContext.Provider>
}

export function useStandaloneAppearance(): StandaloneAppearanceContextValue {
  return useContext(StandaloneAppearanceContext) ?? {
    ...DEFAULT_APPEARANCE,
    ready: true,
    setDesignTheme: () => {},
    setMode: () => {},
    setColorTheme: () => {},
  }
}

export function StandaloneAppearanceSettings() {
  const { t } = useNodeI18n("settings")
  const appearance = useContext(StandaloneAppearanceContext)
  if (!appearance) return null
  return <section className="grid gap-3 border-t pt-4" data-kisaki-appearance-settings>
    <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4 text-primary" />{t("settings.appearance", "独立外观")}</div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">{t("settings.appearanceHint", "独立桌面端可以覆盖工作台的明暗模式和配色；选择跟随工作台即可恢复全局设置。")}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-medium sm:col-span-2">应用主题
        <Select disabled={!appearance.ready} value={appearance.designTheme ?? "workspace"} onValueChange={(value) => appearance.setDesignTheme(value as "workspace" | AppDesignThemeId)}>
          <SelectTrigger aria-label="应用主题"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">跟随工作台主题</SelectItem>
            {DESIGN_THEME_ENTRIES.map(entry => <SelectItem key={entry.id} value={entry.id}>{({ native: "原生", md3: "Material 3", mondrian: "蒙德里安", wuling: "武陵", swiss: "瑞士", lonestar: "孤星" })[entry.id]}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium">{t("settings.colorMode", "主题模式")}
        <Select disabled={!appearance.ready} value={appearance.mode} onValueChange={(value) => appearance.setMode(value as StandaloneAppearanceMode)}>
          <SelectTrigger aria-label={t("settings.colorMode", "主题模式")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">{t("settings.followWorkspace", "跟随工作台")}</SelectItem>
            <SelectItem value="system"><Monitor className="mr-2 inline size-3.5" />{t("settings.system", "跟随系统")}</SelectItem>
            <SelectItem value="light"><Sun className="mr-2 inline size-3.5" />{t("settings.light", "浅色")}</SelectItem>
            <SelectItem value="dark"><Moon className="mr-2 inline size-3.5" />{t("settings.dark", "深色")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium">{t("settings.colorTheme", "配色")}
        <Select disabled={!appearance.ready} value={appearance.colorTheme} onValueChange={(value) => appearance.setColorTheme(value as StandaloneColorTheme)}>
          <SelectTrigger aria-label={t("settings.colorTheme", "配色")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">{t("settings.followWorkspacePalette", "工作台配色")}</SelectItem>
            <SelectItem value="jade">{t("settings.jadePalette", "翡翠")}</SelectItem>
            <SelectItem value="violet">{t("settings.violetPalette", "紫藤")}</SelectItem>
            <SelectItem value="amber">{t("settings.amberPalette", "琥珀")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
    {!appearance.ready ? <p role="status" className="text-[11px] text-muted-foreground">{t("settings.loadingAppearance", "正在读取外观设置…")}</p> : null}
    {appearance.error ? <p role="alert" className="text-xs text-destructive">{appearance.error}</p> : null}
    <Button type="button" disabled={!appearance.ready} size="sm" variant="ghost" className="w-fit" onClick={() => { appearance.setMode("workspace"); appearance.setColorTheme("workspace"); appearance.setDesignTheme("workspace") }}>{t("settings.resetAppearance", "恢复工作台外观")}</Button>
  </section>
}
