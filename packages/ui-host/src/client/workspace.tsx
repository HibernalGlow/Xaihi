/**
 * 工作台外壳。
 *
 * 职责边界：清单获取、模块装载、布局、面板切换、加载与失败状态都在这棵树里；
 * 节点只提供组件。DSH 的插槽渲染明确没有 Suspense、没有按条目懒加载
 * （packages/client/web-react/README.md:19），所以远程模块的 Promise 必须由宿主
 * 自己变成可见状态：先出骨架，落定后换内容，失败就显示原因加重新加载。
 *
 * @module xaihi-ui/workspace
 */

import * as React from 'react'
import type { LoadResult, PanelContribution, PanelProps, UIModuleLoader, WorkspaceDocument } from '@hibernalglow/xaihi-sdk'
import type { Translate } from './locales.ts'
import type { XaihiSlot } from './slots.ts'
import { createRemoteLoader } from './loader/remote-modules.ts'

/** 外壳需要的宿主面。 */
export interface RootProps {
  t: Translate
  locale: 'zh' | 'en'
  /** Xaihi 自己声明的插槽渲染入口（DSH 的 children 座位）。 */
  renderSlot: (key: XaihiSlot) => React.ReactNode
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

  if (state.status === 'loading') return <div className="xaihi-empty">{props.t('panel.loading')}</div>
  if (state.status === 'failed' || state.document === undefined) {
    return (
      <div className="xaihi-error">
        <strong>{props.t('panel.failed')}</strong>
        <span>{state.reason ?? 'manifest unavailable'}</span>
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

function Workspace({ t, locale, renderSlot, document, loader }: WorkspaceProps): React.ReactElement {
  const panels = React.useMemo(() => flatten(document), [document])
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
  }), [panels])

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

  const main = (() => {
    if (panels.length === 0) return <div className="xaihi-empty">{t('panel.none')}</div>
    if (active === null) return <div className="xaihi-empty">{t('panel.notFound')}</div>
    if (state.status === 'loading' || state.status === 'idle') return <div className="xaihi-empty">{t('panel.loading')}</div>
    if (state.status === 'failed' || state.component === undefined) {
      return (
        <div className="xaihi-error">
          <strong>{t('panel.failed')}</strong>
          <span>{state.reason ?? 'module loader failure'}</span>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t('panel.reload')}</button>
        </div>
      )
    }
    const Component = state.component as (props: PanelProps) => React.ReactElement
    return <Component contribution={active.contribution} locale={locale} host={host} />
  })()

  return (
    <div className="xaihi-shell">
      <nav className="xaihi-nav" aria-label={t('nav.title')}>
        {panels.map((entry) => (
          <button
            key={entry.contribution.id}
            type="button"
            className="xaihi-nav-item"
            data-selected={entry.contribution.id === selected}
            onClick={() => setSelected(entry.contribution.id)}
          >
            {locale === 'zh' ? entry.contribution.title.zh : entry.contribution.title.en}
          </button>
        ))}
        {broken.map((plugin) => (
          <div key={plugin.package} className="xaihi-error">
            {t('plugin.broken')}: {plugin.problems?.join('; ')}
          </div>
        ))}
      </nav>
      <div className="xaihi-toolbar">{renderSlot('xaihi.toolbar')}</div>
      <div className="xaihi-main">{main}</div>
      <div className="xaihi-status">
        {renderSlot('xaihi.status')}
        <span>{panels.length} {t('status.loaded')}</span>
        {notice !== null && <span>{notice}</span>}
      </div>
    </div>
  )
}
