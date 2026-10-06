import { useMemo, useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelHeaderProps } from "dockview-react"
import "dockview-react/dist/styles/dockview.css"
import { useWorkspaceActions, useWorkspaceComponent, useWorkspaceVisibleComponents, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { getModule } from "@/components/modules/registry"
import { isComponentVisibleInView } from "@/lib/componentVisibility"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { useWindowControls } from "@/hooks/useWindowControls"
import { cn } from "@/lib/utils"
import { Plus, X, LayoutPanelTop, Share2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { COMPONENT_VIEW_MODES } from "@/store/workspace/constants"
import type { ComponentInstance } from "@/types/workspace"
import { NodeSurfaceChrome, type NodeSurfaceChromeAction } from "./NodeSurfaceChrome"
import { createSurfaceCommonActions } from "./createSurfaceCommonActions"

type DockviewModulePanelProps = {
  params?: { moduleId?: string; compId?: string }
}

function DockviewModulePanel({ params }: DockviewModulePanelProps) {
  const moduleId = params?.moduleId
  const compId = params?.compId
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const { t, i18n } = useTranslation()
  const component = useWorkspaceComponent(compId ?? "")

  if (!moduleId || !compId) return null

  const module = getModule(moduleId)
  const moduleName = i18n.exists(`module:${moduleId}.name`) ? t(`module:${moduleId}.name`) : (module?.name ?? moduleId)
  const actions: NodeSurfaceChromeAction[] = createSurfaceCommonActions({
    componentId: compId,
    componentData: component?.data,
    currentMode: "dockview",
    height: 480,
    moduleId,
    moduleName,
    openComponent,
    t,
    width: 640,
    workspaceActions,
  })

  return (
    <div
      className="xiranite-component-surface group relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-card/72 text-card-foreground"
      data-context-menu="dockview-panel"
      data-component-id={compId}
    >
      <NodeSurfaceChrome actions={actions} moduleId={moduleId} moduleName={moduleName} version={module?.version} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ModuleRenderer moduleId={moduleId} compId={compId} />
      </div>
    </div>
  )
}

const dockviewComponents = { module: DockviewModulePanel }

/**
 * DockviewView — 真实接入 dockview-react。
 *
 * 数据模型：三种 viewMode 共享同一份 components，每个 viewMode 独立维护
 * hiddenIn.dockview 标志。
 *
 * dockview 同步策略（关键）：
 * - onReady 只在 dockview 挂载时触发一次，把 dockComponents 全部 addPanel
 * - 后续 dockComponents 变化（如关闭 tab）时，onReady 不会再触发，
 *   必须用 useEffect 主动同步 dockview API：
 *   · 对比 api.panels 和 dockComponents，删掉多的、加上少的
 *   · 这样切换 viewMode 回来时，被关闭的 tab 不会重新出现
 *
 * dockview-react 默认 className 是 `dockview-theme-abyss`，颜色写死不跟主题。
 * 外层容器加 `dv-theme-bridge` 类，CSS 通过 `.dv-theme-bridge .dockview-theme-abyss`
 * 选择器覆盖 abyss 变量，让其读取项目的 --card / --muted / --border。
 */
export function DockviewView() {
  const { t, i18n } = useTranslation()
  const visibleComponents = useWorkspaceVisibleComponents()
  const workspaceActions = useWorkspaceActions()
  const selectedComponentIds = useWorkspaceShallowSelector((state) => state.selectedComponentIds)
  const apiRef = useRef<DockviewApi | null>(null)
  const removeDisposableRef = useRef<{ dispose(): void } | null>(null)
  const syncingFromStoreRef = useRef(false)
  const handleDropModule = useCallback((moduleId: string) => {
    workspaceActions.deployComponent(moduleId, { viewMode: "dockview" })
  }, [workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)

  // 仅渲染未在 dockview 模式下隐藏的组件
  const dockComponents = useMemo(
    () => visibleComponents.filter(c => isComponentVisibleInView(c, "dockview")),
    [visibleComponents],
  )
  const isEmpty = dockComponents.length === 0

  const moduleName = (comp: ComponentInstance) => {
    const m = getModule(comp.moduleId)
    return i18n.exists(`module:${comp.moduleId}.name`) ? t(`module:${comp.moduleId}.name`) : (m?.name ?? comp.moduleId)
  }

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api: DockviewApi = event.api
    apiRef.current = api
    removeDisposableRef.current?.dispose()
    api.clear()
    dockComponents.forEach((comp, i) => {
      api.addPanel({
        id: comp.id,
        title: moduleName(comp),
        component: "module",
        tabComponent: "moduleTab",
        params: { moduleId: comp.moduleId, compId: comp.id },
        position: { referencePanel: undefined, direction: i === 0 ? "within" : "right" },
      })
    })
    removeDisposableRef.current = api.onDidRemovePanel((panel) => {
      if (syncingFromStoreRef.current) return
      workspaceActions.setComponentVisibility(panel.api.id, "dockview", false)
    })
  }, [dockComponents, workspaceActions])

  useEffect(() => {
    return () => {
      removeDisposableRef.current?.dispose()
      removeDisposableRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isEmpty) return
    removeDisposableRef.current?.dispose()
    removeDisposableRef.current = null
    apiRef.current = null
  }, [isEmpty])

  // ⚠️ 关键修复：dockComponents 变化时主动同步 dockview API。
  // onReady 只在挂载时触发一次，关闭 tab 后 api 内部状态不会自动更新；
  // 切换 viewMode 回来时虽然 onReady 重新触发，但如果不主动同步，
  // dockview 会用旧 api 重新加 panel —— 关闭的 tab 又出现。
  // 这里对比 api.panels 和 dockComponents，删多补少。
  useEffect(() => {
    const api = apiRef.current
    if (!api) return

    const existingIds = new Set(api.panels.map(p => p.id))
    const wantedIds = new Set(dockComponents.map(c => c.id))

    // 删：api 有但 dockComponents 没有（被关闭的）
    syncingFromStoreRef.current = true
    try {
      for (const panel of api.panels) {
        if (!wantedIds.has(panel.id)) {
          api.removePanel(panel)
        }
      }
    } finally {
      syncingFromStoreRef.current = false
    }

    // 加：dockComponents 有但 api 没有（新 deploy 的）
    dockComponents.forEach(comp => {
      if (!existingIds.has(comp.id)) {
        api.addPanel({
          id: comp.id,
          title: moduleName(comp),
          component: "module",
          tabComponent: "moduleTab",
          params: { moduleId: comp.moduleId, compId: comp.id },
          position: { direction: "right" },
        })
      }
    })
  }, [dockComponents])

  // dockview 的 panel 组件映射
  // 自定义 tab header（带关闭按钮）— 关闭仅 toggle hiddenIn.dockview
  const tabComponents = useMemo(() => ({
    moduleTab: (props: IDockviewPanelHeaderProps) => {
      const title = String(props.api.title ?? "panel")
      const isSelected = selectedComponentIds.includes(props.api.id)
      return (
        <div
          className={cn(
            "xiranite-ui-copy flex items-center gap-2 px-1 group/tab",
            isSelected && "ring-1 ring-primary/60 bg-primary/10",
          )}
          onClick={(e) => {
            // Ctrl/Meta + 点击：切换该 Tab 的选中状态，阻止 dockview 切换 Tab
            if (e.ctrlKey || e.metaKey) {
              e.stopPropagation()
              e.preventDefault()
              workspaceActions.toggleSelection(props.api.id)
              return
            }
            // Shift + 点击：加入选中，阻止 dockview 切换 Tab
            if (e.shiftKey) {
              e.stopPropagation()
              e.preventDefault()
              workspaceActions.addToSelection([props.api.id])
              return
            }
            // 普通点击：若有选中项则先清空，然后让 dockview 正常切换 Tab
            if (selectedComponentIds.length > 0) {
              workspaceActions.clearSelection()
            }
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[10px] font-mono font-semibold tracking-widest uppercase">{title}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="grid h-4 w-4 place-items-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-accent hover:text-accent-foreground transition-opacity"
              >
                <Share2 className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {COMPONENT_VIEW_MODES
                .filter((mode) => mode !== "dockview")
                .map((mode) => (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => {
                      workspaceActions.setComponentVisibility(props.api.id, "dockview", false)
                      workspaceActions.setComponentVisibility(props.api.id, mode, true)
                      workspaceActions.setViewMode(mode)
                    }}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    {t(`topbar:viewMode.${mode}`)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={(e) => {
              e.stopPropagation()
              workspaceActions.setComponentVisibility(props.api.id, "dockview", false)
            }}
            className="grid h-4 w-4 place-items-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )
    },
  }), [workspaceActions, t, selectedComponentIds])

  return (
    <div
      className={cn(
        "flex-1 ws-canvas-bg dv-theme-bridge flex flex-col overflow-hidden relative transition-colors",
        isModuleOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      data-testid="dockview-drop-target"
      {...moduleDropHandlers}
    >
      {isModuleOver && <ModuleDropHint label={t("registry:dropHint")} />}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center ws-canvas-bg">
          <div className="xiranite-ui-copy text-center space-y-4">
            <LayoutPanelTop className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-mono text-muted-foreground">{t("view:dockview.empty")}</p>
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              onClick={() => workspaceActions.setOverlay("registry")}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("view:dockview.openRegistry")}
            </Button>
          </div>
        </div>
      ) : (
        <DockviewReact
          components={dockviewComponents}
          tabComponents={tabComponents}
          onReady={onReady}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  )
}

function ModuleDropHint({ label }: { label: string }) {
  return (
    <div className="xiranite-ui-copy pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-sm border border-primary/40 bg-card/95 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary shadow-sm">
      {label}
    </div>
  )
}
