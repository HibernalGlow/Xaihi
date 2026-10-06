/**
 * 工作台文案。所有面向人的字符串都走 locale 座位（`t`），不在组件里写死。
 * @module xaihi-ui/locales
 */

/** 本插件的 locale 命名空间。 */
export const LOCALE_NAMESPACE = 'xaihi.ui'

export const zh = {
  'nav.title': '工作台',
  'panel.none': '没有已安装的节点面板。',
  'panel.loading': '正在加载面板…',
  'panel.failed': '面板加载失败',
  'panel.reload': '重新加载',
  'plugin.broken': '清单读不了',
  'status.loaded': '已加载',
  'host.title': 'Xaihi 工作台',
  'panel.notFound': '该面板不在清单里。',
  'feed.title': '最近的节点运行',
  'feed.polling': '轮询',
} as const

export const en: Record<keyof typeof zh, string> = {
  'nav.title': 'Workspace',
  'panel.none': 'No node panels are installed.',
  'panel.loading': 'Loading panel…',
  'panel.failed': 'Panel failed to load',
  'panel.reload': 'Reload',
  'plugin.broken': 'Manifest unreadable',
  'status.loaded': 'loaded',
  'host.title': 'Xaihi workspace',
  'panel.notFound': 'That panel is not in the manifest.',
  'feed.title': 'Recent node runs',
  'feed.polling': 'polling',
}

/** 类型化的词典键。 */
export type LocaleKey = keyof typeof zh

/**
 * 翻译函数形状。DSH 的 `t` 座位只接受本命名空间的键
 * （`LocaleKeysOf<'xaihi.ui'>`），所以这里必须是窄键而不是 `string`。
 */
export type Translate = (key: LocaleKey, params?: Record<string, unknown>) => string
