/**
 * Dissolve folders 的工作面板。
 *
 * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。
 * 组件与颜色都走 `@hibernalglow/xaihi-ui-kit`：不写 hex、不引用 `--dsw-*`、不建自己的
 * React root、不碰主题。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'
import { registerKitStyles, XField, XPanel } from '@hibernalglow/xaihi-ui-kit'

export const Probe = { react: React, version: React.version }

export default function Panel({ contribution, locale }: PanelProps): React.ReactElement {
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  const [value, setValue] = React.useState('')
  React.useEffect(() => registerKitStyles(), [])

  return (
    <XPanel
      title={title}
      status={value || (locale === 'zh' ? '（待填）' : '(empty)')}
    >
      <XField label={locale === 'zh' ? '目标目录' : 'Target directory'}>
        <input
          className="xaihi-field-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </XField>
    </XPanel>
  )
}
