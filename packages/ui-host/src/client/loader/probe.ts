/**
 * 装载观测面：远端与宿主是否共用一个 React 必须是装载当时就能读到的事实。
 *
 * 单独成文件有两个理由：判定是纯函数（可在 node 环境直接测，不需要浏览器，也不需要
 * 把联邦运行时拖进测试），并且 `sameReactAsHost` 要能被证伪 —— 传进一个不同的 React
 * 就必须是 false，否则这条尺不存在。
 *
 * @module xaihi-ui/loader/probe
 */

import type { ModuleRef } from '@hibernalglow/xaihi-sdk'

/** 每个已装载模块的观测记录。 */
export interface LoaderObservatory {
  loaderKind: string
  remotes: string[]
  modules: Record<string, {
    remote: string
    exportName: string
    reactVersion?: string | undefined
    sameReactAsHost?: boolean | 'unknown'
  }>
}

/** 装载器留下的单一观测实例。 */
export const observatory: LoaderObservatory = { loaderKind: 'remote-modules', remotes: [], modules: {} }

/**
 * 记录一次装载的同一性结论。
 * @param hostReact - 宿主模块表里的那一份 React。
 * @param key - `remote/export` 键。
 * @param ref - 本次解析的模块引用。
 * @param module - 远端模块命名空间；约定导出 `Probe`（值是该模块 import 的 react）。
 */
export function recordProbe(
  hostReact: unknown,
  key: string,
  ref: ModuleRef,
  module: Record<string, unknown>,
): void {
  const probe = module['Probe'] as { react?: unknown; version?: string } | undefined
  if (probe === undefined) {
    // 没有 Probe 不等于通过：记成 unknown，避免"少写一个导出"看起来像成功。
    observatory.modules[key] = { ...ref, sameReactAsHost: 'unknown' }
    return
  }
  observatory.modules[key] = {
    ...ref,
    reactVersion: probe.version,
    sameReactAsHost: probe.react === hostReact,
  }
}

/** 把观测面挂到页面上供人工与脚本读取。 */
export function publishObservatory(global: Record<string, unknown>): void {
  // 别人（例如客户端 apply 记下的宿主环境事实）可能先建了 __XAIHI__。这里把它们并进
  // observatory 本体而不是换个新对象——换对象会让后续装载写入的模块事实失去活性。
  const existing: unknown = global.__XAIHI__
  if (typeof existing === 'object' && existing !== null && existing !== observatory) {
    Object.assign(observatory, existing as Record<string, unknown>)
  }
  global.__XAIHI__ = observatory
}
