/**
 * 远程模块后端：把插件自带的 UI 产物当作可动态装载的模块来取。
 *
 * 传输细节全部关在这个文件里：清单只有 `remote` + `export`，宿主契约与插件代码
 * 里都不出现任何具体打包器或联邦协议的词汇。共享依赖一律取自宿主模块表
 * （`require('react')` 的那一份），远端不允许自带 React：双 React 的症状是跨边界
 * hooks 随机崩，而原因在几秒之后才出现，所以同一性必须变成可读断言（见 Probe）。
 *
 * @module xaihi-ui/loader/remote-modules
 */

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { init, loadRemote, registerRemotes } from '@module-federation/runtime'
import type { LoadResult, LoaderConfig, ModuleRef, UIModuleLoader } from '@hibernalglow/xaihi-sdk'

let initialized = false

/** 交给远端共享域的宿主实例：React 与 jsx-runtime，版本按宿主实际所带。 */
const shared = {
  react: {
    version: React.version,
    scope: 'default',
    lib: () => React,
    loaded: true,
  },
  'react/jsx-runtime': {
    version: React.version,
    scope: 'default',
    lib: () => JsxRuntime,
    loaded: true,
  },
}

/** 建立一个远程模块装载器。 */
export function createRemoteLoader(config: LoaderConfig): UIModuleLoader {
  const remotes = config.remotes
  return {
    kind: 'remote-modules',
    async init() {
      if (!initialized) {
        init({ name: 'xaihi_host', remotes: [], shared })
        initialized = true
      }
      const entries = Object.entries(remotes)
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
        .map(([name, entry]) => ({ name, alias: name, entry }))
      registerRemotes(entries, { force: false })
    },
    async load(ref: ModuleRef): Promise<LoadResult> {
      if (remotes[ref.remote] === undefined) {
        return { ok: false, reason: `remote "${ref.remote}" is not registered by any installed plugin` }
      }
      try {
        const module = await loadRemote<Record<string, unknown>>(`${ref.remote}/${ref.exportName}`)
        if (module == null) return { ok: false, reason: `${ref.remote}/${ref.exportName} resolved to nothing` }
        const component = module.default ?? module[ref.exportName]
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
