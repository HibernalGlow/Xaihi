/**
 * Kisaki 的工作面板。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'

export const Probe = { react: React, version: React.version }

export default function Panel({ contribution, locale }: PanelProps): React.ReactElement {
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>{title}</strong>
      <span>{locale === 'zh' ? 'Kisaki 文件分析与去重工作台已就绪。' : 'Kisaki duplicate detection workbench ready.'}</span>
    </div>
  )
}
