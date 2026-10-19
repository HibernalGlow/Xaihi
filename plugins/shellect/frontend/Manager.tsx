import type { ShellectActionCatalogEntry } from '../src/manager.ts'
import { Md3eManager } from './Md3eManager.tsx'
import { SHELLECT_PLATFORMS, useShellectManagerModel } from './model.ts'
import type { ShellectManagerProps } from './types.ts'

export type { ShellectCall, ShellectCallInput, ShellectCallResult, ShellectManagerProps, ShellectUiFace } from './types.ts'

export function Manager(props: ShellectManagerProps) {
  if (props.uiFace === 'md3e') return <Md3eManager {...props} />
  return <LegacyShellectManager {...props} />
}

export function LegacyShellectManager({ call, subscribe, compact = false }: ShellectManagerProps) {
  const model = useShellectManagerModel({ call, subscribe })

  return (
    <section className={compact ? 'shellect-manager shellect-manager--compact' : 'shellect-manager'} data-ui-variant="legacy">
      <header>
        <h2>Shellect</h2>
        <p>管理由节点注册的系统菜单动作。</p>
      </header>
      <nav aria-label="Shellect platforms">
        {SHELLECT_PLATFORMS.map((item) => (
          <button key={item.id} type="button" aria-pressed={model.platform === item.id} onClick={() => { model.setPlatform(item.id); void model.load(item.id) }}>
            {item.id === 'darwin' ? 'Mac' : item.label}
          </button>
        ))}
      </nav>
      {model.catalog?.settingsReason ? <div role="alert">{model.catalog.settingsReason}</div> : null}
      {!subscribe ? <p>未接入设置变更通知</p> : null}
      <label>
        <input type="checkbox" aria-label="启用平台菜单" checked={model.catalog?.enabled !== false} disabled={!model.catalog?.writable} onChange={(event) => void model.toggleEnabled(event.target.checked)} />
        启用平台菜单
      </label>
      {model.conflict ? <p>{model.conflict}</p> : null}
      {model.error ? <p role="status">{model.error}</p> : null}
      {model.actions.length === 0 ? <p>还没有动作注册</p> : (
        <div>
          {model.actions.map((item) => <LegacyAction key={item.id} item={item} model={model} />)}
        </div>
      )}
    </section>
  )
}

function LegacyAction({ item, model }: { item: ShellectActionCatalogEntry; model: ReturnType<typeof useShellectManagerModel> }) {
  const firstAction = model.actions[0]
  const isFirst = item.id === firstAction?.id
  const title = model.drafts[item.id] ?? item.title
  return (
    <article>
      <strong>{item.registered ? item.title : '提供者未加载'}</strong>
      <span>{item.id}</span>
      <label htmlFor={`shellect-title-${item.id}`}>动作名称 · {item.id}</label>
      <input id={`shellect-title-${item.id}`} aria-label={`动作名称 · ${item.id}`} value={title} disabled={!model.catalog?.writable || !item.registered} onChange={(event) => { if (isFirst) model.setDraft(item.id, event.target.value) }} />
      <button type="button" aria-label="保存名称" disabled={!model.catalog?.writable || !item.registered} onClick={() => void model.saveTitle(item)}>保存名称</button>
    </article>
  )
}
