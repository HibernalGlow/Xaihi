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

/**
 * 「这份 UI 产物里有没有问宿主的装载点」这一格的可读回状态。
 *
 * 为什么它要出现在清单里：入口（`src/document/main.tsx`）一旦不再调用 realm 装载，
 * 产物**照旧能建出来、界面照旧画得出**，但每个节点的 `host` 动词问不到对面
 * （2026-10-07 实测：两种状态的 `build:document` 都 rc=0，产物只差 28 KB）。
 * ADR-0011 决定 4 要的是"退化在界面上读得回来"，所以这条事实必须从服务端走到那一格，
 * 不能只活在仓库外的脚本里。
 */
export type HostMountState = 'present' | 'absent' | 'unreadable'

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
  /**
   * 产物里有没有 host 装载点。`absent` = 文档能装、界面会画，但问宿主无处可问；
   * `unreadable` = 连产物都读不到（此时 `problems` 已经给了那一句）。
   * 可选是为了兼容还没发这个字段的旧宿主清单——读不到就当没说，不许猜成 `present`。
   */
  hostMount?: HostMountState
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
