/**
 * Trename 的工作面板。
 *
 * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。
 * 面板不建自己的 React root、不写自己的颜色 token、不碰主题。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'

export const Probe = { react: React, version: React.version }

export default function Panel({ contribution, locale }: PanelProps): React.ReactElement {
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  const [value, setValue] = React.useState('')
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>{title}</strong>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={locale === 'zh' ? '目标' : 'Target'} />
      <span style={{ fontSize: 12, opacity: 0.7 }}>{value || (locale === 'zh' ? '（待填）' : '(empty)')}</span>
    </div>
  )
}
