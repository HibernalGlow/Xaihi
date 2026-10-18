import { motion, useReducedMotion } from "motion/react"
import { createPortal } from "react-dom"
import { useTrellisToolbarMount } from "./TrellisToolbarSlot"
import { useContextMenu, useContextMenuBuilder } from "@/components/context-menu/context"
import type { ContextMenuContext, ContextMenuItemDef } from "@/components/context-menu/ContextMenuProvider"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Workspace, WorkspaceProvider, ViewType, useView, useViewTitle, useViewBadge, useWorkspace, useWorkspaceState, useOptionalWorkspace, type MenuEntry, type Rect } from '@danfessler/trellis-react'
import type { LayoutDocument, LayoutNode, PanelNode } from '@danfessler/trellis'
import '@danfessler/trellis/style.css'
import './trellis.css'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, ArrowUp, BookmarkPlus, Crosshair, Expand, ExternalLink, Layers, Maximize2, Plus, Scan, Trash2, Map, MoreHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ModuleRenderer } from '@/components/modules/ModuleRenderer'
import { getModule } from '@/components/modules/registry'
import { useWorkspaceActions, useWorkspaceComponent, useWorkspaceShallowSelector, useWorkspaceVisibleComponents } from '@/store/workspaceStore'
import { isComponentVisibleInView } from '@/lib/componentVisibility'
import { useComponentSurfaceStatus } from '@/lib/componentSurfaceStatus'
import { useModuleDropTarget } from '@/hooks/useModuleDropTarget'
import { useWindowControls } from '@/hooks/useWindowControls'
import { reconcileTrellisDocument, TRELLIS_NODE_TYPE, trellisViewId } from '@/lib/trellis/document'
import { useTrellisLayout } from '@/lib/trellis/useTrellisLayout'
import { ComponentProgressStrip } from './ComponentProgressStrip'

function nodeTitle(moduleId: string, t: ReturnType<typeof useTranslation>['t']) {
  return t(`module:${moduleId}.name`, { defaultValue: getModule(moduleId)?.name ?? moduleId })
}
/** 面板 id → 面板：面板可以停在根树里，也可以是被浮到画布上的那一个。 */
function panelOf(document: LayoutDocument, panelId: string): PanelNode | null {
  const walk = (node: LayoutNode | null | undefined): PanelNode | null => {
    if (!node) return null
    if (node.kind === 'panel') return node.id === panelId ? node : null
    if (node.kind === 'stage') return walk(node.child)
    return node.children.map(walk).find(Boolean) ?? null
  }
  return walk(document.root) ?? document.floating.find((entry) => entry.panel.id === panelId)?.panel ?? null
}
function TrellisNode() {
  const view = useView<{ componentId: string; moduleId: string }>()
  const comp = useWorkspaceComponent(view.params.componentId)
  const { t } = useTranslation()
  useViewTitle(nodeTitle(view.params.moduleId, t))
  if (!comp || !isComponentVisibleInView(comp, 'cards')) return null
  return <TrellisNodeBody comp={comp} />
}
function TrellisNodeBody({ comp }: { comp: import("@/types/workspace").ComponentInstance }) {
  const { t } = useTranslation()
  const status = useComponentSurfaceStatus(comp)
  useViewBadge(status.phase === "idle" ? null : status.progress === null ? t(`view:trellis.phase.${status.phase}`) : `${Math.round(status.progress)}%`)
  return <div className="xaihi-trellis-node" data-xaihi-trellis-node={comp.id} data-context-menu="trellis-node">
    <ModuleRenderer moduleId={comp.moduleId} compId={comp.id} />
    <ComponentProgressStrip status={status} />
  </div>
}
const AnimatedButton = motion.create(Button)
function Tool({ label, children, onClick, disabled = false }: { label: string; children: ReactNode; onClick(): void; disabled?: boolean }) {
  const reduce = useReducedMotion()
  return <AnimatedButton type="button" size="icon" variant="ghost" className="xaihi-trellis-tool h-7 w-7 shrink-0" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    whileHover={reduce || disabled ? undefined : { y: -1, scale: 1.06 }} whileTap={reduce || disabled ? undefined : { scale: .94 }}
    transition={{ type: 'spring', stiffness: 480, damping: 32 }}>{children}</AnimatedButton>
}
function NodeTools() {
  const view = useView<{ componentId: string; moduleId: string }>()
  const ws = useWorkspace()
  const actions = useWorkspaceActions()
  const { t } = useTranslation()
  const { capabilities, openComponent, openComponentPending } = useWindowControls()
  const [failure, setFailure] = useState<string | null>(null)
  const open = async () => {
    setFailure(null)
    try {
      const result = await openComponent({ componentId: view.params.componentId, moduleId: view.params.moduleId, title: nodeTitle(view.params.moduleId, t) })
      if (result.success) actions.setComponentState(view.params.componentId, 'floating')
      else setFailure(result.message)
    } catch (error) { setFailure(String(error)) }
  }
  return <div className="xaihi-trellis-node-tools">
    <Tool label={t('view:trellis.maximize')} onClick={() => ws.navigation.toggle(view.id)}><Maximize2 size={13} /></Tool>
    <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" title={t('common:openFloatingWindow')} aria-label={t('common:openFloatingWindow')}><ExternalLink size={13} /></Button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 text-xs" align="end">
        <p>{t('view:trellis.windowHint')}</p>
        <Button size="sm" variant="outline" disabled={openComponentPending || (!capabilities || capabilities.componentWindows === 'unsupported')} onClick={() => { void open() }}>{t('common:openFloatingWindow')}</Button>
        {(!capabilities || capabilities.componentWindows === 'unsupported') && <p role="status">{t('view:trellis.windowUnavailable')}</p>}
        {failure && <p role="alert">{failure}</p>}
      </PopoverContent>
    </Popover>
  </div>
}
function translateMenu(entries: MenuEntry[], t: ReturnType<typeof useTranslation>['t']): MenuEntry[] {
  return entries.filter((e) => e === 'separator' || !['close', 'close-others'].includes(e.id ?? '')).map((entry) => {
    if (entry === 'separator') return entry
    const key = `view:trellis.menu.${entry.id}`
    return { ...entry, label: t(key, { defaultValue: entry.label }), ...(entry.items ? { items: translateMenu(entry.items, t).filter((e) => e !== 'separator') } : {}) }
  })
}
function MiniMap({ inline = false }: { inline?: boolean }) {
  const ws = useOptionalWorkspace()
  const snapshot = useWorkspaceState()
  const camera = useRef<SVGRectElement>(null)
  const { t } = useTranslation()
  const panels = useMemo(() => ws ? [...ws.getLayoutRects().values()].filter((e) => e.node.kind === 'panel') : [], [ws, snapshot.document])
  useEffect(() => {
    if (!ws) return
    const update = (rect: Rect) => {
      for (const key of ['x', 'y', 'w', 'h'] as const) camera.current?.setAttribute(key === 'w' ? 'width' : key === 'h' ? 'height' : key, String(rect[key] * 100))
    }
    update(ws.navigation.camera)
    return ws.on('camera', update)
  }, [ws])
  if (!panels.length) return null
  return <svg className={`xaihi-trellis-map${inline ? " xaihi-trellis-map-inline" : ""}`} viewBox="-3 -3 106 106" role="group" aria-label={t('view:trellis.map')}>
    {panels.map(({ node, rect }) => <rect key={node.id} x={rect.x * 100} y={rect.y * 100} width={rect.w * 100} height={rect.h * 100}
      className="xaihi-trellis-map-panel" role="button" tabIndex={0} aria-label={t('view:trellis.locatePanel', { name: node.kind === 'panel' ? node.views.map((id) => snapshot.views.find((v) => v.id === id)?.title ?? id).join(' / ') : node.id })}
      onClick={() => ws?.navigation.frame(node.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ws?.navigation.frame(node.id) } }} />)}
    <rect ref={camera} className="xaihi-trellis-map-camera" />
  </svg>
}
function TrellisToolbar({ layout }: { layout: ReturnType<typeof useTrellisLayout> }) {
  const ws = useOptionalWorkspace()
  const snapshot = useWorkspaceState()
  const { t } = useTranslation()
  const mapPosition = useWorkspaceShallowSelector((s) => s.trellisMapPosition)
  const actions = useWorkspaceActions()
  const [name, setName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const reason = layout.reason === "LAYOUT_SERVICE_UNAVAILABLE" ? t("view:trellis.serviceUnavailable") : layout.reason
  const save = () => {
    if (!ws?.navigation.framings.save(name.trim())) return
    setName(''); setSaveOpen(false)
    layout.change(ws.getDocument())
  }
  return <div className="xaihi-trellis-toolbar" role="toolbar" aria-label={t('view:trellis.toolbar')}>
    <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={t('view:trellis.navigation')} title={t(`view:trellis.${layout.navigation}`)}>
      {layout.navigation === 'focus' ? <Crosshair size={18} /> : <Scan size={18} />}
    </Button></PopoverTrigger><PopoverContent className="w-72 space-y-2 text-xs" align="start">
      <p className="font-medium">{t('view:trellis.navigation')}</p>
      <div className="xaihi-trellis-modes" role="group" aria-label={t('view:trellis.navigation')}>
        <Button size="sm" variant={layout.navigation === 'focus' ? 'secondary' : 'ghost'} aria-pressed={layout.navigation === 'focus'} onClick={() => layout.change(ws?.getDocument() ?? layout.document, 'focus')}><Crosshair size={18} />{t('view:trellis.focus')}</Button>
        <Button size="sm" variant={layout.navigation === 'free' ? 'secondary' : 'ghost'} aria-pressed={layout.navigation === 'free'} onClick={() => layout.change(ws?.getDocument() ?? layout.document, 'free')}><Scan size={18} />{t('view:trellis.free')}</Button>
      </div>
      <p className="leading-relaxed text-muted-foreground">{t(`view:trellis.explanation.${layout.navigation}`)}</p>
    </PopoverContent></Popover>
    <div className="xaihi-trellis-navigation-group">
      <Tool label={t('view:trellis.back')} disabled={!snapshot.canGoBack} onClick={() => ws?.navigation.back()}><ArrowLeft size={18} /></Tool>
      <Tool label={t('view:trellis.forward')} disabled={!snapshot.canGoForward} onClick={() => ws?.navigation.forward()}><ArrowRight size={18} /></Tool>
      <Tool label={t('view:trellis.parent')} disabled={!snapshot.framed} onClick={() => ws?.navigation.stepOut()}><ArrowUp size={18} /></Tool>
    </div>
    <div className="xaihi-trellis-secondary-tools">
    <Tool label={t('view:trellis.overview')} onClick={() => ws?.navigation.toggleOverview()}><Expand size={18} /></Tool>
    <span className="xaihi-trellis-divider" aria-hidden="true" />
    <Popover open={saveOpen} onOpenChange={setSaveOpen}><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" title={t('view:trellis.saveView')} aria-label={t('view:trellis.saveView')}><BookmarkPlus size={18} /></Button></PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start"><form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-2">
        <label className="text-xs" htmlFor="xaihi-trellis-view-name">{t('view:trellis.viewName')}</label>
        <input id="xaihi-trellis-view-name" className="xaihi-trellis-name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" disabled={!name.trim() || !ws}>{t('view:trellis.saveView')}</Button>
      </form></PopoverContent>
    </Popover>
    {snapshot.framings.length > 0 && <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title={t('view:trellis.viewpoints', { count: snapshot.framings.length })} aria-label={t('view:trellis.viewpoints', { count: snapshot.framings.length })}><Layers size={18} /></Button></PopoverTrigger>
      <PopoverContent className="w-64 space-y-1" align="start">{snapshot.framings.map((f) => <div key={f.id} className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="flex-1 justify-start truncate" onClick={() => ws?.navigation.framings.go(f.id)}>{f.name}</Button>
        <Tool label={t('view:trellis.removeView', { name: f.name })} onClick={() => { ws?.navigation.framings.remove(f.id); if (ws) layout.change(ws.getDocument()) }}><Trash2 size={18} /></Tool>
      </div>)}</PopoverContent>
    </Popover>}
    <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="xaihi-trellis-tool h-7 w-7" aria-label={t('view:trellis.mapOptions')} title={t('view:trellis.mapOptions')}><Map size={18} /></Button></PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <p className="text-xs font-medium">{t('view:trellis.mapOptions')}</p>
        {mapPosition === 'toolbar' && <MiniMap inline />}
        <fieldset className="space-y-1"><legend className="mb-1 text-[10px] text-muted-foreground">{t('view:trellis.mapPosition')}</legend>
          {(['toolbar', 'bottom-left', 'bottom-right', 'hidden'] as const).map((position) => <label key={position} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent">
            <input type="radio" name="xaihi-trellis-map-position" checked={mapPosition === position} onChange={() => actions.setTrellisMapPosition(position)} className="accent-primary" />{t(`view:trellis.mapPositions.${position}`)}
          </label>)}
        </fieldset><p className="text-[10px] text-muted-foreground">{t('view:trellis.mapHint')}</p>
      </PopoverContent>
    </Popover>
    <span className="xaihi-trellis-save-status" role="status" title={reason ?? t(`view:trellis.storage.${layout.status}`)} aria-label={t(`view:trellis.storage.${layout.status}`)} data-xaihi-layout-status={layout.status}>
      <span className={`xaihi-trellis-status-dot xaihi-trellis-status-${layout.status}`} /><span className="hidden min-[1100px]:inline">{t(`view:trellis.storage.${layout.status}`)}</span>
    </span>
    <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t('view:trellis.help')} title={t('view:trellis.help')}><MoreHorizontal size={18} /></Button></PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 text-xs leading-relaxed" align="end">
        {snapshot.hidden.length > 0 && <div className="border-b border-border pb-2"><p className="mb-1 font-medium">{t('view:trellis.hidden', { count: snapshot.hidden.length })}</p>{snapshot.hidden.map((p) => <Button key={p.panelId} size="sm" variant="ghost" className="w-full justify-start" onClick={() => ws?.restore(p.panelId)}>{t('view:trellis.restore', { name: p.views.map((v) => v.title).join(' / ') })}</Button>)}</div>}
        <p className="font-medium">{t(`view:trellis.storage.${layout.status}`)}</p>
        {reason && <p role="status">{reason}</p>}
        {layout.status === 'session' && layout.reason && <Button size="sm" variant="outline" onClick={() => { void layout.retry() }}>{t('view:trellis.retry')}</Button>}
        <p>{t('view:trellis.gestures.organize')}</p><p>{t('view:trellis.gestures.focus')}</p><p>{t('view:trellis.gestures.free')}</p>
        <p className="text-muted-foreground">{t('view:trellis.attribution')}</p>
      </PopoverContent>
    </Popover>
    </div>
  </div>
}
export function TrellisView() {
  const workspaceId = useWorkspaceShallowSelector((s) => s.activeWorkspaceId)
  return <TrellisWorkspace key={workspaceId} workspaceId={workspaceId} />
}
function TrellisWorkspace({ workspaceId }: { workspaceId: string }) {
  const all = useWorkspaceVisibleComponents()
  const components = useMemo(() => all.filter((c) => isComponentVisibleInView(c, 'cards')), [all])
  const backendReady = useWorkspaceShallowSelector((s) => s.backendReady)
  const hosted = Boolean((globalThis as { __XAIHI_UI__?: unknown }).__XAIHI_UI__)
  const layout = useTrellisLayout(workspaceId)
  const actions = useWorkspaceActions()
  const { t } = useTranslation()
  const toolbarMount = useTrellisToolbarMount()
  const mapPosition = useWorkspaceShallowSelector((s) => s.trellisMapPosition)
  const contextMenu = useContextMenu()
  const ws = useRef<import('@danfessler/trellis').WorkspaceHandle>(null)
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(useCallback((id: string) => { actions.deployComponent(id, { viewMode: 'cards' }) }, [actions]))
  const ready = layout.ready && (!hosted || backendReady)
  const document = useMemo(() => ready ? reconcileTrellisDocument(layout.document, components) : layout.document, [layout.document, components, ready])
  useEffect(() => { if (ready && document !== layout.document) layout.change(document) }, [ready, document, layout.document, layout.change])
  const { focused, fullscreen } = useWorkspaceShallowSelector((s) => ({ focused: s.focusedComponentId, fullscreen: s.fullscreenComponentId }))
  useEffect(() => {
    if (ready && focused && document.views[trellisViewId(focused)]) ws.current?.navigation.frame(trellisViewId(focused))
  }, [focused, ready])
  useEffect(() => {
    const handle = ws.current
    if (!handle || !fullscreen || !document.views[trellisViewId(fullscreen)]) return
    const previous = handle.getDocument().navigation?.frame
    handle.navigation.frame(trellisViewId(fullscreen))
    return () => { if (previous?.length) handle.navigation.frame(previous); else handle.navigation.overview() }
  }, [fullscreen, ready])
  useEffect(() => {
    if (!fullscreen) return
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") actions.setFullscreen(null) }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [fullscreen, actions])
  // 关闭节点：走既有实例生命周期（`docs/trellis-grid-design.md` 的「关闭节点」），
  // 不能交给库自己的 close——它只删视图记录，而 reconcile 会把实例再挂回来。
  // 不设二次确认：直接关闭并移除组件实例。
  const closeNodeItem = useCallback((componentId: string): ContextMenuItemDef => ({
    id: 'xaihi-trellis-close-node',
    label: t('view:trellis.closeNode'),
    icon: <X size={14} />,
    destructive: true,
    onSelect: () => actions.removeComponent(componentId),
  }), [actions, t])
  const componentInPanel = useCallback((panelId: string) => {
    const viewId = panelOf(document, panelId)?.selected
    const componentId = viewId ? document.views[viewId]?.params?.componentId : undefined
    return typeof componentId === 'string' && components.some((c) => c.id === componentId) ? componentId : undefined
  }, [components, document])
  useContextMenuBuilder('trellis-node', useCallback((context: ContextMenuContext) => {
    const componentId = context.data.xaihiTrellisNode
    return componentId && components.some((c) => c.id === componentId) ? [closeNodeItem(componentId)] : null
  }, [closeNodeItem, components]))
  const renderMenu = useCallback((request: import('@danfessler/trellis').MenuRequest) => {
    if (!contextMenu) return
    const element = (request.anchor ?? window.document.elementFromPoint(request.x, request.y))?.closest<HTMLElement>('[data-context-menu="workspace-canvas"]')
    const convert = (entries: MenuEntry[]): ContextMenuItemDef[] => entries.map((entry) => entry === 'separator' ? { type: 'separator' } : {
      id: `xaihi-trellis-${entry.id ?? entry.label}`, label: entry.label, disabled: entry.disabled, shortcut: entry.shortcut,
      checked: entry.checked, destructive: entry.danger, onSelect: entry.run,
      ...(entry.items ? { children: convert(entry.items) } : {}),
    })
    const node = componentInPanel(request.panelId)
    const global = element ? contextMenu.build('workspace-canvas', { element, event: new MouseEvent('contextmenu', { clientX: request.x, clientY: request.y }), data: {} }) : []
    contextMenu.show(request.x, request.y, [
      ...convert(request.entries),
      ...(node ? [{ type: 'separator' as const }, closeNodeItem(node)] : []),
      ...(global.length ? [{ type: 'separator' as const }, ...global] : []),
    ], request.close)
  }, [closeNodeItem, componentInPanel, contextMenu])
  return <section data-xaihi-context-menu-owner={contextMenu ? "trellis" : undefined} className="xaihi-trellis ws-canvas-bg flex-1" data-testid="cards-drop-target" data-card-layout="trellis" {...moduleDropHandlers}>
    {!ready ? <div className="xaihi-trellis-loading" role="status">{t('view:trellis.storage.loading')}</div> : <WorkspaceProvider>
      {toolbarMount && createPortal(<TrellisToolbar layout={layout} />, toolbarMount)}
      {(layout.status === 'error' || layout.status === 'conflict') && <div className="xaihi-trellis-notice" role="alert">
        <span>{layout.conflict ? t('view:trellis.conflict', { writer: layout.conflict.writer, revision: layout.conflict.revision }) : t('view:trellis.saveError', { reason: layout.reason })}</span>
        {layout.conflict ? <><Button size="sm" variant="outline" onClick={layout.acceptRemote}>{t('view:trellis.useRemote')}</Button><Button size="sm" variant="outline" onClick={layout.keepLocal}>{t('view:trellis.keepLocal')}</Button></> : <Button size="sm" variant="outline" onClick={() => { void layout.retry() }}>{t('view:trellis.retry')}</Button>}
      </div>}
      <div className="xaihi-trellis-canvas">
        <Workspace ref={ws} document={document} navigation={layout.navigation} floating="overlay" motion="system" theme="light" label={t('view:trellis.workspace')}
          onDocumentChange={layout.change} onNavigate={() => { if (ws.current) layout.change(ws.current.getDocument()) }}
          renderMenu={contextMenu ? renderMenu : undefined}
          panelMenu={(entries) => translateMenu(entries, t)}>
          <ViewType id={TRELLIS_NODE_TYPE} closable={false} title={(v) => nodeTitle(String(v.params.moduleId), t)} icon={<Layers size={16} />} minSize={{ width: 480, height: 320 }} scaling="interactive" gestures="content" accessory={<NodeTools />}><TrellisNode /></ViewType>
          <Workspace.Empty><div className="xaihi-trellis-empty"><Layers size={28} /><p>{t('view:trellis.empty')}</p><Button size="sm" variant="outline" onClick={() => actions.setOverlay('registry')}><Plus size={14} />{t('view:cards.openRegistry')}</Button></div></Workspace.Empty>
        </Workspace>
        {(mapPosition === "bottom-left" || mapPosition === "bottom-right") && <div className={`xaihi-trellis-map-anchor xaihi-trellis-map-${mapPosition}`}><MiniMap /></div>}
        {isModuleOver && <div className="xaihi-trellis-drop">{t('registry:dropHint')}</div>}
        {fullscreen && <Button className="xaihi-trellis-exit" size="sm" variant="outline" onClick={() => actions.setFullscreen(null)}>{t('view:cards.exitFullscreen')}</Button>}
      </div>
    </WorkspaceProvider>}
  </section>
}
