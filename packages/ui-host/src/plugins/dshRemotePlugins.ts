import { validateManifest } from '@hibernalglow/xaihi-sdk/manifest'
import type { WorkspaceDocument, PanelContribution } from '@hibernalglow/xaihi-sdk'
import { MODULE_REGISTRY } from '@/components/modules/registry'
import { registerModuleContributions, clearModuleContributions, contributedModuleSource } from './contributions'
import { bindModuleToFrontendPlugin, unbindModuleFromFrontendPlugin, isBuiltInModuleId, frontendPluginForModule } from './dynamicEntries'
import { registerFrontendPlugin, unregisterFrontendPlugin, registeredFrontendPlugins, type FrontendPluginSpec } from './frontendRuntime'

type Registration = { spec: FrontendPluginSpec; panels: PanelContribution[]; signature: string }

/** 只消费 DSH 的安装清单；不启用搬运来的 TOML / 本地安装记录。 */
export function createDshRemoteReconciler() {
  const active = new Map<string, Registration>()
  function remove(id: string, registration: Registration) {
    for (const panel of registration.panels) unbindModuleFromFrontendPlugin(panel.id)
    clearModuleContributions(id)
    unregisterFrontendPlugin(id)
    active.delete(id)
  }
  return {
    reconcile(raw: unknown): string[] {
      const document = raw as WorkspaceDocument
      if (document?.schema !== 'xaihi.workspace/1' || !Array.isArray(document.plugins)) {
        throw new Error('Xaihi: DSH workspace manifest schema is invalid')
      }
      const notes: string[] = []
      const next = new Map<string, Registration>()
      const aliases = new Set<string>()
      const ids = new Set<string>()
      for (const plugin of document.plugins) {
        if (plugin.problems?.length) { notes.push(plugin.package + ': ' + plugin.problems.join('; ')); continue }
        const validation = validateManifest(plugin.manifest)
        if (!validation.ok) { notes.push(plugin.package + ': ' + validation.errors.join('; ')); continue }
        const manifest = validation.value
        // ADR-0014：已在生成表内的一方节点不再注册占位 remote 面板。
        const nodeId = (manifest as typeof manifest & { node?: { nodeId?: string } }).node?.nodeId
        if ((nodeId && isBuiltInModuleId(nodeId)) || isBuiltInModuleId(manifest.id) || !manifest.ui) continue
        const panels = manifest.panels ?? []
        if (!panels.length) continue
        const alias = manifest.ui.remote
        const entry = plugin.remotes?.[alias]
        if (typeof entry !== 'string' || !/^\/xaihi\/remotes\/[^/]+\/[a-f0-9]{12}\/[^?#]+$/.test(entry)) {
          notes.push(manifest.id + ': remote URL is missing or outside the DSH artifact route'); continue
        }
        const outside = registeredFrontendPlugins().find(item => !active.has(item.id) && (item.id === manifest.id || (item.alias ?? item.id) === alias))
        if (next.has(manifest.id) || aliases.has(alias) || outside) {
          notes.push(manifest.id + ': remote id or alias collision'); continue
        }
        const accepted: PanelContribution[] = []
        for (const panel of panels) {
          const owner = contributedModuleSource(panel.id)?.pluginId ?? frontendPluginForModule(panel.id)?.id
          if (ids.has(panel.id) || MODULE_REGISTRY.some(item => item.id === panel.id) || isBuiltInModuleId(panel.id) || (owner && !active.has(owner))) {
            notes.push(manifest.id + ': panel id collision: ' + panel.id); continue
          }
          if (panel.area !== 'workspace') { notes.push(manifest.id + ': panel area is not connected: ' + panel.area); continue }
          ids.add(panel.id)
          accepted.push(panel)
        }
        if (!accepted.length) continue
        aliases.add(alias)
        const spec: FrontendPluginSpec = { id: manifest.id, alias, entry, entryType: 'var', panels: accepted }
        next.set(spec.id, { spec, panels: accepted, signature: JSON.stringify(spec) })
      }
      // 删除、版本变化都先撤旧绑定，绑定版本会取消正在飞的旧装载。
      for (const [id, registration] of [...active]) {
        if (next.get(id)?.signature !== registration.signature) remove(id, registration)
      }
      for (const [id, registration] of next) {
        if (active.has(id)) continue
        registerFrontendPlugin(registration.spec)
        registerModuleContributions(id, registration.panels.map(panel => ({ kind: 'component', id: panel.id, module: panel.export, name: panel.title.zh, description: panel.title.en, category: 'PLUGIN', icon: 'Puzzle' })))
        for (const panel of registration.panels) bindModuleToFrontendPlugin(panel.id, registration.spec)
        active.set(id, registration)
      }
      return notes
    },
    dispose() { for (const [id, registration] of [...active]) remove(id, registration) },
  }
}
