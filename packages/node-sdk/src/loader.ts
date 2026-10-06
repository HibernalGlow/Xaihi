/**
 * `UIModuleLoader` —— 宿主拿插件 UI 的唯一入口。
 *
 * 契约里不出现任何具体传输方式的名字：MF2 与 DSH 原生 client 模块是两个实现，
 * 清单只写 `remote` + `export`。这样换传输不动插件、不动面板 id。
 *
 * 组件类型写成结构形式（`(props) => unknown`），与 DSH 的
 * `SlotComponent<P> = (props: P) => ReactNode` 同形：本包同时被 Node 侧和
 * 浏览器 bundle 使用，引入 react 类型会把框架依赖拖进契约包。
 *
 * @module xaihi-sdk/loader
 */

import type { PanelContribution, SettingsContribution, SlotFillContribution, XaihiManifest } from './manifest.ts'

/** 宿主交给插件面板的只读上下文。 */
export interface PanelProps {
  /** 该面板自己的清单项。 */
  contribution: PanelContribution
  /** 当前语言的界面语言码（`zh` / `en`），插件据此选文案。 */
  locale: 'zh' | 'en'
  /** 宿主能力面；实现由 ui-host 提供，插件只消费。 */
  host: PanelHost
}

/** 面板可用的宿主能力面（v1 只列真实接线的项）。 */
export interface PanelHost {
  /** 打开另一个面板；未知 id 返回 false 而不是抛错。 */
  openPanel(id: string): boolean
  /** 往宿主通知层放一条消息；不涉及权限，权限审批走 DSH。 */
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
}

/** 一个插槽填充的 props。 */
export interface SlotFillProps {
  contribution: SlotFillContribution
  locale: 'zh' | 'en'
  host: PanelHost
}

/** 一个设置页的 props。 */
export interface SettingsProps {
  contribution: SettingsContribution
  locale: 'zh' | 'en'
  host: PanelHost
}

/** 模块引用：remote 名 + 导出名。 */
export interface ModuleRef {
  remote: string
  exportName: string
}

/** 解析出来的组件类型（结构形式，避免依赖 react 类型）。 */
export type ResolvedComponent = (props: unknown) => unknown

/** 装载结果：成功带组件与被解析的模块命名空间，失败带可展示的原因。 */
export type LoadResult =
  | { ok: true; component: ResolvedComponent; module: Record<string, unknown> }
  | { ok: false; reason: string }

/** 装载器配置：宿主解析出的 remote 地址表。 */
export interface LoaderConfig {
  /** `remote` 名 → remoteEntry 的 URL。 */
  remotes: Record<string, string>
  /** 装载失败后的重试上限；0 表示不重试。 */
  retries?: number
}

/** 传输方式标识；只用于诊断展示，不参与契约。 */
export type LoaderKind = 'remote-modules' | 'host-modules'

/** 插件清单聚合，宿主装载期消费。 */
export interface PluginRegistration {
  /** npm 包名（装载器按它解析包位置）。 */
  package: string
  /** 该包的清单。 */
  manifest: XaihiManifest
  /** 清单校验失败时的原因；此时其余字段可忽略。 */
  problems?: string[]
}

/** UI 模块装载器接口：实现可换，面板契约不变。 */
export interface UIModuleLoader {
  /** 传输方式，诊断用。 */
  readonly kind: LoaderKind
  /** 初始化：注册 remotes、共享运行时。地址表在构造时装载器时已给定。 */
  init(): Promise<void>
  /** 解析一个模块；实现必须自己处理失败，不抛给渲染路径。 */
  load(ref: ModuleRef): Promise<LoadResult>
}
