import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { PanelContribution, PanelProps } from '@hibernalglow/xaihi-sdk'
import type { AppNodeEntry } from '@xiranite/contract'
import { getModule } from '@/components/modules/registry'
import { useWorkspaceActions } from '@/store/workspaceStore'

/** PanelProps 是旧面板的子集契约；只在入口处适配到同一份 AppNodeEntry。 */
export function panelNodeEntry(panel: PanelContribution, Component: ComponentType<PanelProps>): AppNodeEntry {
  function PanelAdapter() {
    const { i18n } = useTranslation()
    const actions = useWorkspaceActions()
    const locale = i18n.language.startsWith('zh') ? 'zh' : 'en'
    // 清单里的 requires 不能被忽略。文档目前没有可授予面板的命令身份。
    if (panel.requires?.length) return <div role="alert">Xaihi: 面板能力未接线：{panel.requires.join(', ')}</div>
    return <Component contribution={panel} locale={locale} host={{
      openPanel(id) {
        if (!getModule(id)) return false
        actions.deployComponent(id)
        return true
      },
      notify(message, level = 'info') {
        if (level === 'error') toast.error(message)
        else if (level === 'warn') toast.warning(message)
        else toast.info(message)
      },
      async runCommand() {
        return { ok: false, reason: 'Xaihi: 工作台文档没有 DSH 命令调用身份（proposal P1），无法执行命令。' }
      },
    }} />
  }
  return { def: { id: panel.id, name: panel.title.zh, version: '0.0.0', category: 'other', description: panel.title.en, icon: 'Puzzle' }, core: {}, Component: PanelAdapter }
}

export function normalizeRemoteEntry(moduleId: string, loaded: unknown, panel?: PanelContribution): AppNodeEntry | import('@xiranite/contract').HeadlessNodePackage {
  // contribution 的能力声明对完整节点与旧 Panel 同样生效，不能被导出形状绕过。
  if (panel?.requires?.length) throw new Error('Xaihi: 面板能力未接线：' + panel.requires.join(', '))
  const entry = (loaded as { default?: unknown })?.default ?? loaded
  if (panel && (typeof entry === 'function' || (typeof entry === 'object' && entry !== null && '$$typeof' in entry))) {
    return panelNodeEntry(panel, entry as ComponentType<PanelProps>)
  }
  if (typeof entry !== 'object' || entry === null || !('def' in entry) || !('core' in entry)) {
    throw new Error('Xaihi: remote ' + moduleId + ' must export an AppNodeEntry, HeadlessNodePackage or declared Panel')
  }
  const node = entry as AppNodeEntry
  if (node.def?.id !== moduleId) throw new Error('Xaihi: remote entry id does not match contribution ' + moduleId)
  return node
}
