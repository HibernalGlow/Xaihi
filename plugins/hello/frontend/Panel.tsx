/**
 * 示例节点的面板。
 *
 * 面板只导出组件与一个自检探针（`Probe`）：宿主拿它验证 React 实例是否唯一。
 * 探针不是装饰——双 React 的症状是 hooks 在跨边界时随机炸，先把它变成可读断言。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'

/** 宿主装载期读取的身份探针。 */
export const Probe = {
  react: React,
  version: React.version,
}

export default function Panel({ contribution, locale, host }: PanelProps): React.ReactElement {
  const [count, setCount] = React.useState(0)
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>{title}</strong>
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        {locale === 'zh' ? '这个面板由插件自带的 UI 模块渲染。' : 'This panel is rendered by the plugin\u2019s own UI module.'}
      </span>
      <button type="button" onClick={() => {
        setCount((value) => value + 1)
        host.notify(locale === 'zh' ? `计数 ${count + 1}` : `count ${count + 1}`)
      }}>
        {count}
      </button>
    </div>
  )
}
