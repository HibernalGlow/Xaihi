/**
 * `/xaihi/manifest.json` 的线上形状。
 *
 * 单独放一个文件是因为两侧都要它：宿主半边生成、浏览器半边消费。类型只有一个真源，
 * 否则字段漂移会表现成"面板列表空了"而不是编译错误。
 *
 * @module xaihi-sdk/wire
 */

import type { XaihiManifest } from './manifest.ts'

/** 一个已装插件的聚合条目。 */
export interface WorkspacePlugin {
  /** npm 包 specifier。 */
  package: string
  /** 校验通过的清单；`problems` 非空时可能只是占位。 */
  manifest: XaihiManifest
  /** remote 名 → 入口 URL（含 rev）。 */
  remotes: Record<string, string>
  /** 有则代表该插件不可用，原因要显示给使用者。 */
  problems?: string[]
}

/** 工作区聚合文档。 */
export interface WorkspaceDocument {
  schema: 'xaihi.workspace/1'
  /** 整文档修订：由每个插件的产物 rev 组成，浏览器据此决定是否需要重装 remote。 */
  rev: string
  plugins: WorkspacePlugin[]
}
