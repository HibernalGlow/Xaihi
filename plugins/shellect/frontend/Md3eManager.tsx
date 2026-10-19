import { useEffect, useState } from 'react'
import {
  ALIAS,
  MD3E_ALIAS,
  registerKitStyles,
  XButton,
  XMd3eActionGroup,
  XMd3eFactRow,
  XMd3eHeroBanner,
  XMd3eMorphingIndicator,
  XMd3eOptionCard,
  XMd3eNodeFrame,
  XMd3eSection,
  XMd3eSegmentedTrack,
  XMd3eShapeBadge,
  XMd3eSliderCard,
  XMd3eStatTile,
  XMd3eSwitch,
} from '@hibernalglow/xaihi-ui-kit'
import { SHELLECT_PLATFORMS, useShellectManagerModel } from './model.ts'
import type { ShellectActionCatalogEntry, ShellectPlatform } from '../src/manager.ts'
import type { ShellectManagerProps } from './types.ts'

const STYLE_ID = 'xaihi-shellect-md3e-styles'
const SHELLECT_CSS = `
.xaihi-shellect-md3e { container: node / size; display: flex; min-width: 0; min-height: 0; height: 100%; flex-direction: column; gap: 10px; overflow: auto; overscroll-behavior: contain; padding: 10px; box-sizing: border-box; color: ${ALIAS.onSurface}; background: ${MD3E_ALIAS.surfaceLow}; border-radius: 26px; }
.xaihi-shellect-md3e [data-shellect-grid] { display: grid; min-width: 0; gap: 8px; }
.xaihi-shellect-md3e [data-shellect-stats] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.xaihi-shellect-md3e [data-shellect-lens-bar] { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 999px; background: ${MD3E_ALIAS.surfaceLowest}; }
.xaihi-shellect-md3e [data-shellect-lens-btn] { border: 0; padding: 6px 14px; font-size: 11px; font-weight: 800; border-radius: 12px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurfaceVariant}; cursor: pointer; transition: border-radius 240ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease; }
.xaihi-shellect-md3e [data-shellect-lens-btn][data-active="true"] { border-radius: 999px; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-shellect-md3e [data-shellect-main] { grid-template-columns: minmax(240px, 0.92fr) minmax(0, 1.38fr); align-items: start; }
.xaihi-shellect-md3e [data-shellect-platforms] { display: grid; gap: 8px; }
.xaihi-shellect-md3e [data-shellect-actions] { display: grid; min-width: 0; gap: 10px; }
.xaihi-shellect-md3e [data-shellect-action] { display: grid; min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden; gap: 8px; padding: 12px; border: 0; border-radius: 24px 16px 24px 14px; background: ${MD3E_ALIAS.surfaceHigh}; transition: border-radius 240ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.xaihi-shellect-md3e [data-shellect-action]:hover { border-radius: 28px 22px 26px 20px; }
.xaihi-shellect-md3e [data-shellect-action-editor] { display: grid; min-width: 0; max-width: 100%; box-sizing: border-box; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: end; }
.xaihi-shellect-md3e [data-shellect-action-editor] label { display: grid; min-width: 0; gap: 4px; color: ${ALIAS.onSurfaceVariant}; font-size: 10px; font-weight: 700; }
.xaihi-shellect-md3e input { min-width: 0; box-sizing: border-box; border: 0; border-radius: 999px; background: ${MD3E_ALIAS.surfaceLow}; color: inherit; padding: 7px 12px; font: inherit; font-size: 11px; }
.xaihi-shellect-md3e input:focus-visible { outline: 2px solid ${MD3E_ALIAS.primary}; outline-offset: 1px; }
.xaihi-shellect-md3e [data-shellect-alert] { padding: 8px 12px; border-radius: 18px 12px 18px 10px; background: color-mix(in srgb, ${MD3E_ALIAS.secondaryContainer} 55%, transparent); color: ${MD3E_ALIAS.onSecondaryContainer}; font-size: 11px; font-weight: 600; line-height: 1.4; }
.xaihi-shellect-md3e [data-shellect-alert][data-tone="error"] { background: color-mix(in srgb, ${MD3E_ALIAS.error} 18%, transparent); color: ${MD3E_ALIAS.error}; }
.xaihi-shellect-md3e [data-shellect-muted] { color: ${ALIAS.onSurfaceVariant}; font-size: 11px; line-height: 1.45; }
.xaihi-shellect-md3e [data-shellect-status] { display: inline-flex; min-width: 0; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 8px; background: color-mix(in srgb, ${MD3E_ALIAS.surfaceHigh} 86%, transparent); color: ${ALIAS.onSurfaceVariant}; font-size: 10px; font-weight: 800; }
.xaihi-shellect-md3e [data-shellect-status][data-tone="ready"] { color: ${MD3E_ALIAS.primary}; }
.xaihi-shellect-md3e [data-shellect-status][data-tone="error"] { color: ${MD3E_ALIAS.error}; }
.xaihi-shellect-md3e [data-shellect-status]::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ''; }
.xaihi-shellect-md3e [data-shellect-action] .xaihi-md3e-option-card { width: 100%; border: 0; }
.xaihi-shellect-md3e [data-shellect-action] .xaihi-md3e-slider-card { padding: 8px 10px; border: 0; }
.xaihi-shellect-md3e [data-shellect-action] .xaihi-md3e-slider-card input { border: 0; padding: 0; }
@container (max-width: 680px) { .xaihi-shellect-md3e [data-shellect-main] { grid-template-columns: 1fr; } }
@container (max-width: 460px) { .xaihi-shellect-md3e [data-shellect-stats] { grid-template-columns: repeat(2, minmax(0, 1fr)); } .xaihi-shellect-md3e [data-shellect-action-editor] { grid-template-columns: 1fr; } .xaihi-shellect-md3e [data-shellect-action-editor] button { width: 100%; } }
@container (max-width: 320px) { .xaihi-shellect-md3e { padding: 6px; gap: 6px; } .xaihi-shellect-md3e [data-shellect-stats] { gap: 6px; } .xaihi-shellect-md3e .xaihi-md3e-stat { padding: 9px 10px; } }
`

function registerShellectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID)) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = SHELLECT_CSS
  document.head.append(style)
  return () => style.remove()
}

function platformLabel(value: string): string {
  return SHELLECT_PLATFORMS.find((item) => item.id === value)?.label ?? value
}

function actionDescription(item: ShellectActionCatalogEntry): string {
  const selection = item.selection === 'directories' ? '目录' : item.selection === 'files' ? '文件' : '文件或目录'
  return `${item.id} · ${selection}${item.mutates ? ' · 会修改内容' : ' · 只读'}`
}

export function Md3eManager({ call, subscribe, compact = false }: ShellectManagerProps) {
  const model = useShellectManagerModel({ call, subscribe })
  const { catalog, actions } = model
  const [lens, setLens] = useState<'studio' | 'actions' | 'wiring'>('studio')

  useEffect(() => {
    const disposeKit = registerKitStyles()
    const disposeShellect = registerShellectStyles()
    return () => {
      disposeShellect()
      disposeKit()
    }
  }, [])

  const registered = actions.filter((item) => item.registered).length
  const enabled = actions.filter((item) => item.enabled && item.registered).length
  const writableLabel = catalog ? (catalog.writable ? '可写' : '只读') : '读取中'
  const statusTone = model.error || model.conflict ? 'error' : catalog?.writable ? 'ready' : 'idle'

  return (
    <XMd3eNodeFrame
      data-testid="shellect-md3e"
      data-ui-variant="md3e"
      data-shellect-scroll="internal"
      data-compact={compact ? 'true' : 'false'}
      className="xaihi-shellect-md3e"
    >
      <XMd3eHeroBanner
        title="Shellect · 系统上下文菜单矩阵"
        description="零边框色阶编排器：把节点注册的动作整理成可读、可写、带 revision 乐观锁回读的平台右键菜单。"
        tone="primary"
        badge={
          <XMd3eShapeBadge shape="clover" size="md" active aria-hidden="true">
            S
          </XMd3eShapeBadge>
        }
        meta={
          <>
            <span data-shellect-status={catalog ? undefined : 'loading'} data-tone={statusTone}>
              {catalog ? `${platformLabel(model.platform)} · ${writableLabel}` : '正在读取 catalog'}
            </span>
            {catalog?.revision !== null && catalog?.revision !== undefined ? (
              <span data-shellect-status>revision {catalog.revision}</span>
            ) : null}
            {!subscribe ? <span data-shellect-status>未接入设置变更通知</span> : null}
          </>
        }
      >
        <XMd3eActionGroup>
          <div data-shellect-lens-bar role="tablist" aria-label="Shellect MD3E 镜头">
            <button
              type="button"
              role="tab"
              data-shellect-lens-btn
              data-active={lens === 'studio'}
              onClick={() => setLens('studio')}
            >
              双翼全景
            </button>
            <button
              type="button"
              role="tab"
              data-shellect-lens-btn
              data-active={lens === 'actions'}
              onClick={() => setLens('actions')}
            >
              动作编排 ({actions.length})
            </button>
            <button
              type="button"
              role="tab"
              data-shellect-lens-btn
              data-active={lens === 'wiring'}
              onClick={() => setLens('wiring')}
            >
              DSH 接线
            </button>
          </div>
          <XButton
            variant="tonal"
            shape="pill"
            size="sm"
            disabled={model.busy !== null}
            onClick={() => void model.load()}
            aria-label="重新读取 Shellect catalog"
          >
            重新读取
          </XButton>
        </XMd3eActionGroup>
      </XMd3eHeroBanner>

      <div data-shellect-grid data-shellect-stats>
        <XMd3eStatTile value={actions.length} label="动作总数" />
        <XMd3eStatTile value={registered} label="已注册" />
        <XMd3eStatTile value={enabled} label="已启用" />
        <XMd3eStatTile value={writableLabel} label="写入状态" />
      </div>

      <div data-shellect-grid data-shellect-main>
        {lens !== 'actions' ? (
          <div data-shellect-grid>
            <XMd3eSection
              title="目标平台与总闸门"
              description="切换平台会重新拉取对应 catalog，写入严格携带 expectedRevision。"
              data-shellect-platforms
            >
              <XMd3eSegmentedTrack
                aria-label="Shellect platforms"
                options={SHELLECT_PLATFORMS.map((item) => ({ value: item.id, label: item.label }))}
                value={model.platform}
                onChange={(value) => {
                  const next = value as ShellectPlatform
                  model.setPlatform(next)
                  void model.load(next)
                }}
              />
              <XMd3eSwitch
                checked={catalog?.enabled !== false}
                disabled={!catalog?.writable || model.busy !== null}
                label="启用平台菜单"
                description={catalog?.enabled === false ? '平台菜单当前已关闭' : '允许节点动作出现在系统菜单中'}
                aria-label="启用平台菜单"
                onClick={() => void model.toggleEnabled(catalog?.enabled === false)}
                leading={
                  <XMd3eShapeBadge shape="sunny" size="sm" aria-hidden="true">
                    ↗
                  </XMd3eShapeBadge>
                }
                value={catalog?.enabled === false ? '关闭' : '开启'}
              />
              {catalog?.settingsReason ? (
                <div role="alert" data-shellect-alert>
                  {catalog.settingsReason}
                </div>
              ) : null}
            </XMd3eSection>

            <XMd3eSection title="当前接线" description="这些信息来自 DSH settings 面和节点注册表。">
              <XMd3eFactRow label="平台" value={platformLabel(model.platform)} />
              <XMd3eFactRow label="命名空间" value={catalog?.namespace ?? '未接通'} />
              <XMd3eFactRow label="宿主平台" value={catalog ? platformLabel(catalog.hostPlatform) : '—'} />
              <XMd3eFactRow label="同步" value={subscribe ? 'settings/document-updated' : '退化：手动读取'} />
              <p data-shellect-muted>写入始终带 expectedRevision；冲突会保留在页面上并读回最新版本。</p>
            </XMd3eSection>
          </div>
        ) : null}

        {lens !== 'wiring' ? (
          <XMd3eSection
            title="系统菜单动作矩阵"
            description="点击动作胶囊切换启用状态；名称与顺序支持独立乐观锁保存。"
            data-shellect-actions
          >
            {model.conflict ? (
              <div role="status" data-shellect-alert data-tone="error">
                设置发生冲突：{model.conflict}。已读回最新 catalog。
              </div>
            ) : null}
            {model.error ? (
              <div role="status" data-shellect-alert data-tone="error">
                {model.error}
              </div>
            ) : null}
            {!catalog && !model.error ? <XMd3eMorphingIndicator label="读取 Shellect catalog…" /> : null}
            {catalog && actions.length === 0 ? (
              <p data-shellect-muted>还没有动作注册。加载提供者后，动作会出现在这里。</p>
            ) : null}
            {actions.map((item) => (
              <ActionCard key={item.id} item={item} model={model} />
            ))}
          </XMd3eSection>
        ) : null}
      </div>
    </XMd3eNodeFrame>
  )
}

function ActionCard({
  item,
  model,
}: {
  item: ShellectActionCatalogEntry
  model: ReturnType<typeof useShellectManagerModel>
}) {
  const order = model.orders[item.id] ?? item.order
  const title = model.drafts[item.id] ?? item.title
  return (
    <article data-shellect-action>
      <XMd3eOptionCard
        type="button"
        selected={item.enabled && item.registered}
        disabled={!item.registered || !model.catalog?.writable || model.busy !== null}
        title={item.registered ? title : '提供者未加载'}
        description={actionDescription(item)}
        aria-pressed={item.enabled && item.registered}
        aria-label={`${item.registered ? title : '提供者未加载'} · ${item.id}`}
        onClick={() => void model.toggleAction(item)}
        leading={
          <XMd3eShapeBadge shape={item.registered ? 'gem' : 'pebble'} size="sm" active={item.enabled} aria-hidden="true">
            {item.registered ? '•' : '!'}
          </XMd3eShapeBadge>
        }
      >
        <span data-shellect-status data-tone={item.enabled && item.registered ? 'ready' : 'idle'}>
          {item.enabled && item.registered ? '启用' : '停用'}
        </span>
      </XMd3eOptionCard>
      <div data-shellect-action-editor>
        <label htmlFor={`shellect-md3e-title-${item.id}`}>
          动作名称
          <input
            id={`shellect-md3e-title-${item.id}`}
            aria-label={`MD3E 动作名称 · ${item.id}`}
            value={title}
            disabled={!model.catalog?.writable || !item.registered || model.busy !== null}
            onChange={(event) => model.setDraft(item.id, event.currentTarget.value)}
          />
        </label>
        <XButton
          variant="tonal"
          disabled={!model.catalog?.writable || !item.registered || model.busy !== null}
          onClick={() => void model.saveTitle(item)}
        >
          保存名称
        </XButton>
      </div>
      <XMd3eSliderCard
        label="菜单顺序"
        value={order}
        min={0}
        max={Math.max(0, model.actions.length - 1)}
        ticks={['首项', '末项']}
        onChange={(value) => model.setOrder(item.id, value)}
        aria-label={`MD3E 菜单顺序 · ${item.id}`}
      />
      <XButton
        variant="text"
        disabled={!model.catalog?.writable || !item.registered || model.busy !== null || order === item.order}
        onClick={() => void model.saveOrder(item)}
      >
        保存顺序
      </XButton>
    </article>
  )
}
