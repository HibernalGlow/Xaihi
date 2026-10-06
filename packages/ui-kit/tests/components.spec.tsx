/**
 * 组件形状测试：渲染成字符串，钉"可选槽不存在时不留空节点"。
 *
 * @module xaihi-ui-kit/tests/components
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { XButton, XField, XPanel } from '../src/components.tsx'

describe('面板组件', () => {
  it('按钮带变体属性，禁用就是真禁用', () => {
    const html = renderToStaticMarkup(
      <div>{XButton({ variant: 'tonal', children: 'go' })}{XButton({ variant: 'text', disabled: true, children: 'no' })}</div>,
    )
    expect(html).toContain('class="xaihi-btn" data-variant="tonal"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('data-variant="text"')
  })

  it('字段没有 hint 时不渲染说明节点', () => {
    const withHint = renderToStaticMarkup(XField({ label: '目录', hint: '逗号分隔', children: React.createElement('input', { className: 'xaihi-field-input' }) }))
    const without = renderToStaticMarkup(XField({ label: '目录', children: React.createElement('input', { className: 'xaihi-field-input' }) }))
    expect(withHint).toContain('xaihi-status')
    expect(without).not.toContain('xaihi-status')
  })

  it('状态行的语气只走 data-tone，不写颜色', () => {
    const html = renderToStaticMarkup(XPanel({ title: 'T', status: '失败了', statusTone: 'error', children: React.createElement('span', null, 'body') }))
    expect(html).toContain('class="xaihi-card"')
    expect(html).toContain('data-tone="error"')
    expect(html).not.toMatch(/#[0-9a-f]{6}/)
    expect(html).not.toContain('color:')
  })
})
