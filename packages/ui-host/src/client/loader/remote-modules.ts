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
/**
 * 装载期留下的可观测面。双 React 的症状（跨边界 hooks 崩）比原因晚很久，所以"宿主与
 * 远端拿到的是不是同一个 React"必须在装载当时成为可读事实。远端只要导出 `Probe`
 * （值就是它 import 的 react 命名空间），同一性结论就写进 `globalThis.__XAIHI__`；
 * 没有导出 Probe 的远端记成 unknown，不假装通过。
 */
interface LoaderObservatory {
  loaderKind: string
  remotes: string[]
  modules: Record<string, { remote: string; exportName: string; reactVersion?: string; sameReactAsHost?: boolean | 'unknown' }>
}

const observatory: LoaderObservatory = { loaderKind: 'remote-modules', remotes: [], modules: {} }

function publishObservatory(): void {
  ;(globalThis as Record<string, unknown>).__XAIHI__ = observatory
}

function recordProbe(key: string, ref: ModuleRef, module: Record<string, unknown>): void {
  const probe = module.Probe as { react?: unknown; version?: string } | undefined
  if (probe === undefined) {
    observatory.modules[key] = { ...ref, sameReactAsHost: 'unknown' }
    return
  }
  observatory.modules[key] = {
    ...ref,
    reactVersion: probe.version,
    sameReactAsHost: probe.react === React,
  }
}

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
      observatory.remotes = Object.keys(remotes)
      publishObservatory()
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
        recordProbe(`${ref.remote}/${ref.exportName}`, ref, module)
        publishObservatory()
        return { ok: true, component: component as never, module }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
