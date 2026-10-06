/**
 * 工作台外壳。
 *
 * 职责边界：清单获取、模块装载、布局、面板切换、加载与失败状态都在这棵树里；
 * 节点只提供组件。DSH 的插槽渲染明确没有 Suspense、没有按条目懒加载
 * （packages/client/web-react/README.md:19），所以远程模块的 Promise 必须由宿主
 * 自己变成可见状态：先出骨架，落定后换内容，失败就显示原因加重新加载。
 *
 * 外观是**搬运来的 DOM 与类名**（`WorkspaceLayout.tsx:52-64` 的根与 main 网格、
 * `NodeSurfaceChrome.tsx:117-135` 的节点标题条），但数据源是我们自己的：
 * 面板清单来自 `/xaihi/manifest.json`，颜色来自 `src/styles/xaihi-aliases.css` 那层
 * 别名（它再解析到 DSH 的 `--dsw-*`）。**不起 `@/store/workspaceStore`，也不挂
 * `presetThemeRootClass`** —— 前者是 Xiranite 自己的后端状态机，后者是第二套主题引擎，
 * 两个都不属于 Xaihi（CONTEXT.md「Xaihi 没有第二套主题引擎」）。
 * 类名前缀按品牌纪律换成 `xaihi-*`（AGENTS.md：会随代码活下去的称呼一律 Xaihi）。
 *
 * @module xaihi-ui/workspace
 */

import * as React from 'react'
import type { CommandOutcome, LoadResult, PanelContribution, PanelProps, UIModuleLoader, WorkspaceDocument } from '@hibernalglow/xaihi-sdk'
import type { Translate } from './locales.ts'
import type { XaihiSlot } from './slots.ts'
import { NodeChromeActionButton } from '../components/workspace/NodeChromePrimitives.tsx'
import { createRemoteLoader } from './loader/remote-modules.ts'
import { RunFeed } from './run-feed.tsx'

/** 外壳需要的宿主面。 */
export interface RootProps {
  t: Translate
  locale: 'zh' | 'en'
  /** Xaihi 自己声明的插槽渲染入口（DSH 的 children 座位）。 */
  renderSlot: (key: XaihiSlot) => React.ReactNode
  /** DSH 命令通道的包装；面板用它动宿主，不自建 RPC。 */
  runCommand: (line: string) => Promise<CommandOutcome>
}

interface PanelEntry {
  contribution: PanelContribution
  package: string
}

interface WorkspaceProps extends RootProps {
  loader: UIModuleLoader
  document: WorkspaceDocument
}

const flatten = (document: WorkspaceDocument): PanelEntry[] => {
  const entries: PanelEntry[] = []
  for (const plugin of document.plugins) {
    for (const contribution of plugin.manifest.panels ?? []) {
      if (contribution.area !== 'workspace') continue
      entries.push({ contribution, package: plugin.package })
    }
  }
  return entries.sort((left, right) => (left.contribution.order ?? 0) - (right.contribution.order ?? 0))
}

/** 取清单；`revision` 变化时重取，装/卸节点不需要刷新页面。 */
export function WorkspaceRoot(props: RootProps): React.ReactElement {
  const [state, setState] = React.useState<{ status: 'loading' | 'ready' | 'failed'; document?: WorkspaceDocument; reason?: string }>({ status: 'loading' })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const response = await fetch('/xaihi/manifest.json', { cache: 'no-store' })
        if (!response.ok) throw new Error(`manifest responded ${response.status}`)
        const document = await response.json() as WorkspaceDocument
        if (cancelled) return
        if (document.schema !== 'xaihi.workspace/1') throw new Error(`unexpected manifest schema ${document.schema}`)
        setState({ status: 'ready', document })
      } catch (error) {
        if (!cancelled) setState({ status: 'failed', reason: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => { cancelled = true }
  }, [attempt])

  if (state.status === 'loading') return <div className="flex min-h-10 items-center px-3 font-mono text-[10px] tracking-widest text-muted-foreground">{props.t('panel.loading')}</div>
  if (state.status === 'failed' || state.document === undefined) {
    return (
      <div className="xaihi-error flex min-h-10 flex-col items-start gap-1 px-3 py-2">
        <strong className="font-mono text-[10px] uppercase tracking-widest text-destructive">{props.t('panel.failed')}</strong>
        <span className="text-xs">{state.reason ?? 'manifest unavailable'}</span>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>{props.t('panel.reload')}</button>
      </div>
    )
  }
  return <Workspace {...props} document={state.document} loader={createRemoteLoader({ remotes: collectRemotes(state.document) })} />
}

/** 把各插件声明的 remote 折叠成装载器的地址表。 */
function collectRemotes(document: WorkspaceDocument): Record<string, string> {
  const remotes: Record<string, string> = {}
  for (const plugin of document.plugins) Object.assign(remotes, plugin.remotes)
  return remotes
}

function Workspace({ t, locale, renderSlot, runCommand, document, loader }: WorkspaceProps): React.ReactElement {
  const panels = React.useMemo(() => flatten(document), [document])
  // 目标形态是挂搬运来的 `WorkspaceLayout` 本体（不需要 WorkspaceProvider：
  // `useWorkspaceShallowSelector` 读的是模块级 store；主题引擎也不会被起——
  // `presetThemeRootClass` 的表已收到只剩 wuling 一项，而生成 CSS 里 `theme-wuling` 规则数为 0）。
  // 现在挂不动，卡在两处 Vite 专属语法被原样搬了进来：
  //   src/components/workspace/FlowCanvasView.tsx:37  import zhCnTranslationUrl from "@/assets/tldraw-zh-cn.json?url"
  // 本包构建是 tsdown，不认 `?url` 后缀 ⇒ `pnpm build` 以 UNLOADABLE_DEPENDENCY 红。
  // 那条 import 属于搬运那一侧，我不替他们改；改完把这行换回 <WorkspaceLayout /> 即可。
  return <PanelFallback t={t} locale={locale} panels={panels} document={document} loader={loader} renderSlot={renderSlot} runCommand={runCommand} />
}

/** 我们自己的清单与装载状态那一版外壳（搬运工作台本体挂上来之前的落点）。 */
function PanelFallback({ t, locale, panels, document, loader, renderSlot, runCommand }: WorkspaceProps & {
  panels: PanelEntry[]
}): React.ReactElement {
  const [selected, setSelected] = React.useState<string | null>(panels[0]?.contribution.id ?? null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [state, setState] = React.useState<{ status: 'idle' | 'loading' | 'ready' | 'failed'; component?: (props: unknown) => unknown; reason?: string }>({ status: 'idle' })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    void loader.init()
  }, [loader])

  const host = React.useMemo(() => ({
    openPanel(id: string) {
      if (!panels.some((entry) => entry.contribution.id === id)) return false
      setSelected(id)
      return true
    },
    notify(message: string) {
      setNotice(message)
    },
    runCommand,
  }), [panels, runCommand])

  const active = panels.find((entry) => entry.contribution.id === selected) ?? null

  React.useEffect(() => {
    if (active === null) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      const result: LoadResult = await loader.load({
        remote: active.contribution.remote,
        exportName: active.contribution.export,
      })
      if (cancelled) return
      setState(result.ok ? { status: 'ready', component: result.component } : { status: 'failed', reason: result.reason })
    })()
    return () => { cancelled = true }
  }, [active, loader, attempt])

  const broken = document.plugins.filter((plugin) => plugin.problems !== undefined)

  const title = active === null ? t('panel.none') : locale === 'zh' ? active.contribution.title.zh : active.contribution.title.en

  // 装载状态必须是**读得回来的**，不靠 toast：标题条上那枚 state label 就是它的落点。
  const stateLabel = state.status === 'loading' ? t('panel.loading') : state.status === 'failed' ? t('panel.failed') : null

  const main = (() => {
    if (panels.length === 0) return <div className="p-3 text-xs text-muted-foreground">{t('panel.none')}</div>
    if (active === null) return <div className="p-3 text-xs text-muted-foreground">{t('panel.notFound')}</div>
    if (state.status === 'loading' || state.status === 'idle') return <div className="p-3 font-mono text-[10px] tracking-widest text-muted-foreground">{t('panel.loading')}</div>
    if (state.status === 'failed' || state.component === undefined) {
      return (
        <div className="xaihi-error flex flex-col items-start gap-1 p-3">
          <span className="text-xs">{state.reason ?? 'module loader failure'}</span>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t('panel.reload')}</button>
        </div>
      )
    }
    const Component = state.component as (props: PanelProps) => React.ReactElement
    return <Component contribution={active.contribution} locale={locale} host={host} />
  })()

  return (
    <div className="xaihi-workbench flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label={t('nav.title')}
          className="flex w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2"
        >
          {panels.map((entry) => {
            const isActive = entry.contribution.id === selected
            return (
              <button
                key={entry.contribution.id}
                type="button"
                data-selected={isActive}
                onClick={() => setSelected(entry.contribution.id)}
                className={
                  isActive
                    ? 'xaihi-nav-item min-w-0 truncate rounded-md bg-secondary px-2 py-1 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-foreground'
                    : 'xaihi-nav-item min-w-0 truncate rounded-md px-2 py-1 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground'
                }
              >
                {locale === 'zh' ? entry.contribution.title.zh : entry.contribution.title.en}
              </button>
            )
          })}
          {broken.map((plugin) => (
            <div key={plugin.package} className="xaihi-error mt-2 rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
              {t('plugin.broken')}: {plugin.problems?.join('; ')}
            </div>
          ))}
        </nav>

        <section
          data-context-menu="workspace-canvas"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <header className="xaihi-node-chrome-bar flex min-h-10 select-none items-center gap-2 border-b border-transparent px-3">
            <span className="xaihi-node-chrome-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80 shadow-[0_0_12px_var(--ws-accent-glow)]" />
            <span className="min-w-0 truncate text-[10px] font-mono font-semibold uppercase tracking-widest text-foreground/80">
              {title}
            </span>
            {stateLabel !== null && (
              <span className="ml-1 shrink-0 rounded-[3px] bg-muted/35 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground">
                {stateLabel}
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              {renderSlot('xaihi.toolbar')}
              {state.status === 'failed' && (
                <NodeChromeActionButton
                  key="reload"
                  danger
                  label={t('panel.reload')}
                  icon={<span className="text-[9px]">↻</span>}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t('panel.reload')}
                </NodeChromeActionButton>
              )}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">{main}</div>
        </section>
      </main>

      <footer className="flex items-center gap-2 border-t border-border px-3 py-1 font-mono text-[9px] tracking-widest text-muted-foreground">
        {renderSlot('xaihi.status')}
        <span>{panels.length} {t('status.loaded')}</span>
        {notice !== null && <span>{notice}</span>}
        <RunFeed t={t} />
      </footer>
    </div>
  )
}
