/** DSH 面板与工作台节点共用一份 realm 内的 MF2 runtime。 */
import type { LoadResult, LoaderConfig, ModuleRef, UIModuleLoader } from '@hibernalglow/xaihi-sdk'
import { loadRemoteModule, registerFrontendPlugin } from '../../plugins/frontendRuntime'

export function createRemoteLoader(config: LoaderConfig): UIModuleLoader {
  // 固定这一版地址表，避免在飞的装载被外部改写。
  const remotes = { ...config.remotes }
  let initialization: Promise<void> | undefined
  const initialize = () => initialization ??= Promise.resolve().then(() => {
    for (const [name, entry] of Object.entries(remotes)) {
      registerFrontendPlugin({ id: name, alias: name, entry, entryType: 'var' })
    }
  })
  return {
    kind: 'remote-modules',
    init: initialize,
    async load(ref: ModuleRef): Promise<LoadResult> {
      if (remotes[ref.remote] === undefined) {
        return { ok: false, reason: `remote "${ref.remote}" is not registered by any installed plugin` }
      }
      try {
        await initialize()
        const module = await loadRemoteModule<Record<string, unknown>>(ref.remote, ref.exportName)
        const component = module['default'] ?? module[ref.exportName]
        if (typeof component !== 'function') {
          return { ok: false, reason: `${ref.remote}/${ref.exportName} exposes no component (expected a default export)` }
        }
        return { ok: true, component: component as never, module }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
