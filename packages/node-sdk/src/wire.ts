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

/** Xaihi 自己那份 UI 文档（React 19 住在里面）的可装载信息，见 ADR-0009。 */
export interface UiBundleFace {
  /**
   * iframe 要指的文档 URL（含 rev）。
   * 未配置产物时是空串——面板据此显示"产物没配"这条可见失败，而不是渲染一个空 frame。
   */
  documentUrl: string
  /** 产物目录的修订号；`missing` / `unreadable` 表示目录不存在或读不了。 */
  rev: string
  /** 有则代表这份文档此刻装不出来，原因要显示给使用者。 */
  problems?: string[]
}

/** 工作区聚合文档。 */
export interface WorkspaceDocument {
  schema: 'xaihi.workspace/1'
  /** 整文档修订：由每个插件的产物 rev 组成，浏览器据此决定是否需要重装 remote。 */
  rev: string
  plugins: WorkspacePlugin[]
  /** Xaihi UI 文档那一侧；DSH 的 React 18 半边靠它拿到 iframe 的 URL。 */
  ui: UiBundleFace
}
